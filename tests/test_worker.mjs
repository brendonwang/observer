import assert from 'node:assert/strict';
import test from 'node:test';
import {webcrypto} from 'node:crypto';
import worker from '../worker.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

// In-memory D1 stub for the exact SQL statements exercised below.
class FakeDB {
  constructor() {this.devices=new Map();this.threads=new Map();this.previews=new Map();this.attempts=new Map();}
  prepare(sql) {
    const db = this;
    return {
      async all() { return this.bind().all(); },
      bind(...args) {
        return {
    async first(){
      if(sql.includes('FROM login_attempts'))return db.attempts.get(args[0])||null;
      if(sql.includes('SELECT id FROM threads'))return db.threads.has(args[0])?{id:args[0]}:null;
      if(sql.includes('SELECT mime,image_b64 FROM previews'))return db.previews.get(args[0])||null;
      throw Error('Unexpected first: '+sql);
    },
    async all(){
      if(sql.includes('LEFT JOIN previews'))return {results:[...db.threads.values()].filter(t=>{
        const snap=JSON.parse(t.snapshot);
        return !(String(snap.source||'Codex').toLowerCase()==='codex' && (
          String(t.title||'').trim().toLowerCase()==='guardian review' ||
          String(snap.agent_label||'').trim().toLowerCase()==='guardian'
        ));
      }).sort((a,b)=>b.updated_at-a.updated_at).slice(0,40).map(t=>({snapshot:t.snapshot,has_preview:db.previews.has(t.id)?1:0,preview_updated_at:db.previews.get(t.id)?.updated_at||0}))};
      if(sql.includes('FROM devices'))return {results:[...db.devices.values()]};
      throw Error('Unexpected all: '+sql);
    },
    async run(){
      if(sql.includes('INSERT INTO devices')){db.devices.set(args[0],{id:args[0],last_seen_at:args[1],thread_count:args[2]});return{};}
      if(sql.includes('INSERT INTO threads')){db.threads.set(args[0],{id:args[0],device_id:args[1],title:args[2],project:args[3],status:args[4],updated_at:args[5],received_at:args[6],snapshot:args[7]});return{};}
      if(sql.includes('INSERT INTO previews')){db.previews.set(args[0],{thread_id:args[0],filename:args[1],mime:args[2],image_b64:args[3],updated_at:Date.now()});return{};}
      if(sql.includes('INSERT INTO login_attempts')){const prev=db.attempts.get(args[0]);db.attempts.set(args[0],{attempts:prev&&prev.reset_at>args[2]-900000?prev.attempts+1:1,reset_at:args[2]});return{};}
      if(sql.includes('DELETE FROM login_attempts')){db.attempts.delete(args[0]);return{};}
      throw Error('Unexpected run: '+sql);
    }
        };
      }
    };
  }
}
const origin='https://observer.example.workers.dev';
const env={DB:new FakeDB(),AGENT_TOKEN:'a'.repeat(48),VIEW_PASSWORD:'this-is-strong-and-secret',SESSION_KEY:'b'.repeat(48)};
async function call(path, method='GET', data=null, hdr={}) {
  const headers={...hdr};
  if(data!==null)headers['content-type']='application/json';
  return worker.fetch(new Request(origin+path,{method,headers,body:data===null?undefined:JSON.stringify(data)}),env);
}
const tid='9b7de491-44c4-4979-8b1f-f2eacc612345';

test('HTML root has restrictive CSP; no open data endpoint',async()=>{
  const page=await call('/');
  assert.equal(page.status,200);
  assert.match(page.headers.get('Content-Security-Policy'),/nonce-/);
  assert.match(await page.text(),/Threads/);
  assert.equal((await call('/api/state')).status,401);
});

test('sync needs correct agent secret and creates no command endpoint',async()=>{
  const data={protocol:1,device_id:'mac-123456789abc',threads:[{id:tid,title:'Review the project',project:'landing',status:'completed',updated_at:Date.now(),started_at:Date.now()-200000,events:[{at:Date.now(),kind:'complete',label:'Turn completed'}],final_response:'Finished: https://example.com'}]};
  assert.equal((await call('/api/agent/sync','POST',data)).status,401);
  const res=await call('/api/agent/sync','POST',data,{Authorization:'Bearer '+env.AGENT_TOKEN});
  assert.equal(res.status,200);
  assert.equal((await res.json()).accepted,1);
  assert.equal((await call('/api/agent/commands','POST',{command:'rm'})).status,401);
});

test('missing D1 schema yields actionable 503 without leaking SQL errors',async()=>{
  const db={prepare(){throw new Error('D1_ERROR: no such table: devices: SQLITE_ERROR');}};
  const brokenEnv={...env,DB:db};
  const payload={protocol:1,device_id:'mac-123456789abc',threads:[]};
  const response=await worker.fetch(new Request(origin+'/api/agent/sync',{
    method:'POST',
    headers:{Authorization:'Bearer '+env.AGENT_TOKEN,'Content-Type':'application/json'},
    body:JSON.stringify(payload),
  }),brokenEnv);
  assert.equal(response.status,503);
  const body=await response.json();
  assert.match(body.error,/schema\.sql/);
  assert.doesNotMatch(body.error,/D1_ERROR|devices|SQLITE_ERROR/);
});

test('unexpected D1 failures stay private with HTTP 500',async()=>{
  const db={prepare(){throw new Error('private underlying database exception');}};
  const brokenEnv={...env,DB:db};
  const response=await worker.fetch(new Request(origin+'/api/agent/sync',{
    method:'POST',
    headers:{Authorization:'Bearer '+env.AGENT_TOKEN,'Content-Type':'application/json'},
    body:JSON.stringify({protocol:1,device_id:'mac-123456789abc',threads:[]}),
  }),brokenEnv);
  assert.equal(response.status,500);
  assert.deepEqual(await response.json(),{error:'Internal server error'});
});

test('Guardian reviews are discarded at ingestion without suppressing real review workers',async()=>{
  const working={id:'9b7de491-44c4-4979-8b1f-f2eacc612346',
    source:'Codex', title:'Review authentication', project:'app',
    agent_label:'reviewer', status:'working', updated_at:Date.now(), events:[]};
  const guardian={...working,id:'9b7de491-44c4-4979-8b1f-f2eacc612347',
    title:'Guardian review',agent_label:'guardian'};
  const response=await call('/api/agent/sync','POST',
    {protocol:1,device_id:'mac-123456789abc',threads:[guardian,working]},
    {Authorization:'Bearer '+env.AGENT_TOKEN});
  assert.equal(response.status,200);
  assert.equal((await response.json()).accepted,1);
  assert.ok(env.DB.threads.has(working.id));
  assert.equal(env.DB.threads.has(guardian.id),false);
});

test('cached Guardians do not crowd older real sessions out of state',async()=>{
  const database=new FakeDB();
  const localEnv={...env,DB:database};
  const now=Date.now();
  for(let i=0;i<65;i++){
    const id='guardian-'+String(i).padStart(8,'0');
    const title='Guardian review';
    const snapshot={id,source:'Codex',title,agent_label:'',updated_at:now+i};
    database.threads.set(id,{id,title,updated_at:now+i,snapshot:JSON.stringify(snapshot)});
  }
  const legacy={id:'9b7de491-44c4-4979-8b1f-f2eacc612348',source:'Codex',
    title:'Fix build pipeline',updated_at:now-50000};
  database.threads.set(legacy.id,{...legacy,snapshot:JSON.stringify(legacy)});
  const userReview={id:'9b7de491-44c4-4979-8b1f-f2eacc612349',source:'Custom',
    title:'Guardian review',updated_at:now-60000};
  database.threads.set(userReview.id,{...userReview,snapshot:JSON.stringify(userReview)});
  const login=await worker.fetch(new Request(origin+'/api/login',{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify({password:env.VIEW_PASSWORD}),
  }),localEnv);
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const response=await worker.fetch(new Request(origin+'/api/state',{
    headers:{Cookie:cookie},
  }),localEnv);
  assert.equal(response.status,200);
  const list=(await response.json()).threads;
  assert.deepEqual(list.map(t=>t.id),[legacy.id,userReview.id]);
});

test('login CSRF protection, wrong password, cookie and private state',async()=>{
  let res=await call('/api/login','POST',{password:env.VIEW_PASSWORD});
  assert.equal(res.status,403);
  res=await call('/api/login','POST',{password:'wrong'},{Origin:origin});
  assert.equal(res.status,401);
  assert.equal((await res.json()).error,'Incorrect password');
  res=await call('/api/login','POST',{password:env.VIEW_PASSWORD},{Origin:origin});
  assert.equal(res.status,200);
  const cookie=res.headers.get('set-cookie').split(';')[0];
  assert.match(res.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  const state=await call('/api/state','GET',null,{Cookie:cookie});
  assert.equal(state.status,200);
  const data=await state.json();
  assert.equal(data.threads.length,1);
  assert.equal(data.threads[0].final_response,'Finished: https://example.com');
  assert.equal(data.devices.length,1);
  assert.equal((await call('/api/state','GET',null,{Cookie:'observer_session=forged'})).status,401);
  assert.equal((await call('/api/logout','POST',{}, {Cookie:cookie})).status,403);
  assert.equal((await call('/api/logout','POST',{}, {Cookie:cookie,Origin:origin})).status,200);
});

test('authenticated screenshot upload, whitelist and fetch',async()=>{
  const png=Buffer.from([137,80,78,71,13,10,26,10,0,1,2,3]);
  const body={thread_id:tid,filename:'preview.png',mime:'image/png',data:png.toString('base64')};
  assert.equal((await call('/api/agent/preview','POST',body,{Authorization:'Bearer '+env.AGENT_TOKEN})).status,200);
  const bad={...body,mime:'image/svg+xml'};
  assert.equal((await call('/api/agent/preview','POST',bad,{Authorization:'Bearer '+env.AGENT_TOKEN})).status,400);
  const response=await call('/api/login','POST',{password:env.VIEW_PASSWORD},{Origin:origin});
  const cookie=response.headers.get('set-cookie').split(';')[0];
  const preview=await call('/api/preview?id='+tid,'GET',null,{Cookie:cookie});
  assert.equal(preview.status,200);
  assert.equal(preview.headers.get('Content-Type'),'image/png');
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()),png);
  const current=await call('/api/state','GET',null,{Cookie:cookie});
  assert.ok((await current.json()).threads[0].preview_updated_at > 0);
});
