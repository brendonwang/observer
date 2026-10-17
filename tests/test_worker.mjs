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
      if(sql.includes('LEFT JOIN previews'))return {results:[...db.threads.values()].sort((a,b)=>b.updated_at-a.updated_at).map(t=>({snapshot:t.snapshot,has_preview:db.previews.has(t.id)?1:0,preview_updated_at:db.previews.get(t.id)?.updated_at||0}))};
      if(sql.includes('FROM devices'))return {results:[...db.devices.values()]};
      throw Error('Unexpected all: '+sql);
    },
    async run(){
      if(sql.includes('INSERT INTO devices')){db.devices.set(args[0],{id:args[0],last_seen_at:args[1],thread_count:args[2]});return{};}
      if(sql.includes('INSERT INTO threads')){db.threads.set(args[0],{id:args[0],device_id:args[1],title:args[2],project:args[3],status:args[4],updated_at:args[5],received_at:args[6],snapshot:args[7]});return{};}
      if(sql.includes('INSERT INTO previews')){db.previews.set(args[0],{thread_id:args[0],filename:args[1],mime:args[2],image_b64:args[3],updated_at:Date.now()});return{};}
      if(sql.includes('INSERT INTO login_attempts')){const prev=db.attempts.get(args[0]);db.attempts.set(args[0],{attempts:prev&&prev.reset_at>args[2]-900000?prev.attempts+1:1,reset_at:args[2]});return{};}
      if(sql.startsWith('DELETE FROM previews WHERE thread_id IN')) {
        for (const id of [...db.previews.keys()]) {
          const thread=db.threads.get(id);
          if(thread && thread.received_at<args[0]) db.previews.delete(id);
        }
        return {};
      }
      if(sql.startsWith('DELETE FROM threads WHERE received_at')) {
        for(const [id,thread] of db.threads) if(thread.received_at<args[0]) db.threads.delete(id);
        return {};
      }
      if(sql.startsWith('DELETE FROM login_attempts WHERE reset_at')) {
        for(const [id,attempt] of db.attempts) if(attempt.reset_at<args[0]) db.attempts.delete(id);
        return {};
      }
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
  assert.match(await page.text(),/Workspace/);
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

test('failed command status and activity type survive ingestion',async()=>{
  const id='failedjob123456';
  const payload={protocol:1,device_id:'mac-123456789abc',threads:[{
    id,title:'Unit tests',project:'observer',source:'Terminal',type:'command',
    status:'failed',updated_at:Date.now(),events:[],
  }]};
  const sent=await call('/api/agent/sync','POST',payload,{Authorization:'Bearer '+env.AGENT_TOKEN});
  assert.equal(sent.status,200);
  const logged=await call('/api/login','POST',{password:env.VIEW_PASSWORD},{Origin:origin});
  const cookie=logged.headers.get('set-cookie').split(';')[0];
  const current=await call('/api/state','GET',null,{Cookie:cookie});
  const item=(await current.json()).threads.find(t=>t.id===id);
  assert.equal(item.status,'failed');
  assert.equal(item.type,'command');
});

test('scheduled retention deletes old threads and attached previews',async()=>{
  const id='olderthread123';
  env.DB.threads.set(id,{
    id,device_id:'mac-old',title:'Old session',project:'x',status:'completed',
    updated_at:Date.now()-40*86400000,received_at:Date.now()-40*86400000,
    snapshot:JSON.stringify({id,title:'Old session',project:'x',status:'completed'}),
  });
  env.DB.previews.set(id,{thread_id:id,mime:'image/png',image_b64:'AA==',updated_at:Date.now()});
  await worker.scheduled({},env,{});
  assert.equal(env.DB.threads.has(id),false);
  assert.equal(env.DB.previews.has(id),false);
});
