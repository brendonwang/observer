#!/usr/bin/env node
/** Observer CLI. Commands run on this machine, never through the hosted dashboard. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {setup,deploy,doctor,start,stop,update,uninstall,installRuntime,getConfig,privateWrite} from './setup.js';

export const root = () => process.env.OBSERVER_HOME || path.join(os.homedir(), '.observer');
const safe = (value,limit=110) => String(value).replace(/[\x00-\x1f\x7f]/g,'').slice(0,limit);
const sensitive = /(?:token|secret|password|passwd|api[_-]?key|authorization)/i;

export function commandTitle(parts) {
  let redactNext=false;
  return safe(parts.map(part=>{
    if(redactNext){redactNext=false;return '[redacted]';}
    if(part.startsWith('--') && sensitive.test(part.split('=')[0])) {
      if(part.includes('=')) return part.split('=')[0]+'=[redacted]';
      redactNext=true;
    }
    return part;
  }).join(' '));
}
export function saveFeed(file,payload) {
  privateWrite(file,payload);
}
export function parseRun(args) {
  let project=path.basename(process.cwd()) || 'Project';
  let label='';
  let i=0;
  while(['--project','--label'].includes(args[i])) {
    if(!args[i+1]) throw Error('Expected a value after '+args[i]);
    if(args[i]==='--project') project=safe(args[i+1],80);
    else label=safe(args[i+1]);
    i+=2;
  }
  if(args[i]==='--') i++;
  const command=args.slice(i);
  if(!command.length) throw Error('Usage: observer run [--project NAME] [--label TEXT] -- PROGRAM [ARGS]');
  return {project,command,...(label?{label}:{})};
}
export async function run(args) {
  const {project,command,label}=parseRun(args);
  const started=Date.now();
  const id='job-'+crypto.randomBytes(12).toString('hex');
  const file=path.join(root(),'feeds',id+'.json');
  const entry={
    id,project,source:'Terminal',type:'command',
    title:label || commandTitle(command),
    status:'working',started_at:started,updated_at:started,
    events:[{at:started,kind:'start',label:'Started'}],
  };
  saveFeed(file,entry);
  const child=spawn(command[0],command.slice(1),{stdio:'inherit',shell:false});
  const handlers=[];
  for(const signal of ['SIGINT','SIGTERM']) {
    const handler=()=>{if(!child.killed) child.kill(signal);};
    process.on(signal,handler);
    handlers.push([signal,handler]);
  }
  let errorMessage='';
  const code=await new Promise(resolve=>{
    child.once('error',error=>{errorMessage=error.message;});
    child.once('close',(exit,signal)=>resolve(signal ? 128+(os.constants.signals[signal]||0) : (exit??127)));
  });
  for(const [signal,handler] of handlers) process.off(signal,handler);
  if(errorMessage) console.error('Observer: '+errorMessage);
  const finished=Date.now();
  saveFeed(file,{
    ...entry,status:code===0?'completed':(code>=128?'interrupted':'failed'),
    updated_at:finished,
    events:[...entry.events,{
      at:finished,kind:code===0?'complete':'warning',
      label:code===0?'Command finished':code>=128?'Command interrupted':'Exited with code '+code,
    }],
  });
  process.exitCode=code;
}
export function service(args) {
  const file=path.join(root(),'services.json');
  const items=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
  if(!Array.isArray(items)) throw Error('Invalid services configuration');
  const [action,name,raw]=args;
  if(!action||action==='list') {
    if(!items.length) console.log('No services configured.');
    for(const item of items) console.log(item.name+'  '+item.url);
    return;
  }
  if(action==='add') {
    if(!name||!raw||!/^[-\w .]{1,60}$/.test(name)) throw Error('Usage: observer service add NAME URL');
    let u;
    try {u=new URL(raw);} catch {throw Error('Invalid health URL');}
    const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
    if(!((u.protocol==='https:')||(u.protocol==='http:'&&local))||
       u.username||u.password||u.hash) throw Error('Only HTTPS or loopback HTTP endpoints without credentials are supported.');
    if(items.some(x=>x.name===name)) throw Error('Service already exists');
    if(items.length>=10) throw Error('Maximum of 10 services');
    items.push({name,url:u.href,project:path.basename(process.cwd())||'Services'});
  } else if(action==='remove') {
    const index=items.findIndex(x=>x.name===name);
    if(index<0) throw Error('Service not found');
    items.splice(index,1);
  } else throw Error('Usage: observer service [add|list|remove]');
  saveFeed(file,items);
  console.log(action==='add'?'Service added.':'Service removed.');
}
function help() {
  console.log(`Observer — see what your projects are doing, wherever you are.

Commands
  observer setup              Configure monitoring and optional Cloudflare hosting
  observer deploy             Update your self-hosted Cloudflare dashboard
  observer doctor             Check installation and background service
  observer run -- PROGRAM     Monitor a local command (never via the website)
  observer service add NAME URL   Monitor an explicit health endpoint
  observer service list       Show configured health endpoints
  observer service remove NAME   Remove a health endpoint
  observer watch              Monitor in the foreground
  observer start / stop       Manage the macOS login service
  observer update             Refresh the installed local agent
  observer uninstall          Remove the agent, preserve user data
  observer open               Print the private dashboard URL

Privacy: only configured activity metadata is uploaded by default.`);
}
export async function main(args=process.argv.slice(2)) {
  const [command,...rest]=args;
  switch(command) {
    case 'run': return run(rest);
    case 'service': return service(rest);
    case 'setup': return setup();
    case 'deploy': return deploy();
    case 'doctor': case 'status': return doctor();
    case 'start': return start();
    case 'stop': stop();console.log('Background monitoring stopped.');return;
    case 'update': return update();
    case 'uninstall': return uninstall();
    case 'open': console.log(getConfig().endpoint);return;
    case 'watch': {
      getConfig();
      const agent=installRuntime();
      const {exec}=await import('./setup.js');
      const child=spawn('python3',[agent,'watch'],{stdio:'inherit'});
      child.once('error',error=>{console.error(error.message);process.exitCode=127;});
      child.once('close',code=>{process.exitCode=code??1;});
      return;
    }
    case '-h':case '--help':case 'help':case undefined:help();return;
    default:throw Error('Unknown command: '+command+'. Try observer --help.');
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(error=>{console.error('Observer: '+error.message);process.exitCode=1;});
}
