/** Installation and Cloudflare provisioning. Local tools only; nothing executes remotely. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import readline from 'node:readline/promises';
import {Writable} from 'node:stream';
import {fileURLToPath} from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = process.env.OBSERVER_HOME || path.join(os.homedir(), '.observer');
const CONFIG = path.join(HOME, 'config.json');
const HOSTING = path.join(HOME, 'hosting.json');
const RUNTIME = path.join(HOME, 'runtime');
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', 'dev.observer.agent.plist');
const LABEL = 'dev.observer.agent';
const SOURCES = ['codex', 'claude', 'pi', 'files', 'services'];

export function privateWrite(file, content) {
  fs.mkdirSync(path.dirname(file), {recursive:true,mode:0o700});
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw Error('Refusing to replace a symlink: ' + file);
  const tmp = file + '.' + crypto.randomBytes(5).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, typeof content === 'string' ? content : JSON.stringify(content,null,2) + '\n', {mode:0o600,flag:'wx'});
  fs.chmodSync(tmp,0o600);
  fs.renameSync(tmp,file);
}
export function readJSON(file) {
  try {return JSON.parse(fs.readFileSync(file, 'utf8'));}
  catch(error) {if(error.code==='ENOENT') return null;throw error;}
}
export function validateEndpoint(input) {
  let url;
  try {url=new URL(input);} catch {throw Error('Enter a valid HTTPS Worker URL.');}
  const local = url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || !url.hostname || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/') throw Error('Expected a root HTTPS Worker URL (HTTP localhost for testing).');
  return url.origin;
}
export function exec(program,args,options={}) {
  const {input,quiet=false,check=true,cwd}=options;
  const result=spawnSync(program,args,{
    cwd,input,encoding:'utf8',maxBuffer:4*1024*1024,
    stdio:quiet || input !== undefined ? ['pipe','pipe','pipe'] : 'inherit',
  });
  if(result.error) throw result.error;
  if(check && result.status !== 0) throw Error(
    (quiet || input !== undefined ? String(result.stderr || result.stdout || '').trim().slice(-500) : '') ||
    program + ' exited with status ' + result.status
  );
  return result;
}
export function findPython() {
  const python=exec('python3',['-c','import sys; print(sys.version_info >= (3, 9))'],{quiet:true,check:false});
  if(python.status!==0 || python.stdout.trim()!=='True') throw Error('Python 3.9 or newer is required on the monitoring machine.');
  const which=exec('which',['python3'],{quiet:true});
  return which.stdout.trim();
}
const escapeXML=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');

export function installRuntime() {
  findPython();
  fs.mkdirSync(RUNTIME,{recursive:true,mode:0o700});
  for(const file of ['agent.py','conversation.py','service_adapter.py']) {
    const src=path.join(PACKAGE_ROOT,file),dest=path.join(RUNTIME,file);
    if(!fs.existsSync(src)) throw Error('Package missing '+file+'. Reinstall Observer.');
    privateWrite(dest,fs.readFileSync(src,'utf8'));
  }
  return path.join(RUNTIME,'agent.py');
}
export function stop() {
  if(process.platform !== 'darwin') return;
  exec('launchctl',['bootout','gui/'+process.getuid(),PLIST],{quiet:true,check:false});
}
export function start() {
  if(process.platform !== 'darwin') {
    console.log('Background startup is supported on macOS. Run observer watch to monitor in the foreground.');
    return;
  }
  if(!readJSON(CONFIG)) throw Error('Run observer setup before starting the background agent.');
  const python=findPython(),agent=installRuntime();
  fs.mkdirSync(path.dirname(PLIST),{recursive:true,mode:0o700});
  const plist=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array><string>${escapeXML(python)}</string><string>${escapeXML(agent)}</string><string>watch</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>${escapeXML(path.join(HOME,'agent.log'))}</string>
<key>StandardErrorPath</key><string>${escapeXML(path.join(HOME,'agent-errors.log'))}</string>
</dict></plist>\n`;
  privateWrite(PLIST,plist);
  stop();
  exec('launchctl',['bootstrap','gui/'+process.getuid(),PLIST]);
  console.log('Observer starts at macOS login.');
}
export function uninstall() {
  stop();
  if(fs.existsSync(PLIST)) fs.unlinkSync(PLIST);
  fs.rmSync(RUNTIME,{recursive:true,force:true});
  console.log('Background service removed. Configuration, history and Cloudflare resources were preserved.');
}
export function update() {
  if(!readJSON(CONFIG)) throw Error('Run observer setup first.');
  installRuntime();
  if(process.platform==='darwin' && fs.existsSync(PLIST)) start();
  console.log('Updated the local agent. To update the Cloudflare dashboard, run observer deploy.');
}
async function question(message, fallback='') {
  if(!process.stdin.isTTY) throw Error('Interactive setup requires a terminal.');
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  try {return (await rl.question(message)).trim() || fallback;}
  finally {rl.close();}
}
async function secretQuestion(message) {
  if(process.env.OBSERVER_AGENT_TOKEN) return process.env.OBSERVER_AGENT_TOKEN;
  if(!process.stdin.isTTY) throw Error('Set OBSERVER_AGENT_TOKEN when running setup non-interactively.');
  process.stdout.write(message);
  const silent = new Writable({write(_chunk,_encoding,done) {done();}});
  const rl=readline.createInterface({input:process.stdin,output:silent,terminal:true});
  try {return (await rl.question('')).trim();}
  finally {rl.close();process.stdout.write('\n');}
}
function wrangler(args,options={}) {
  return exec('npx',['--yes','wrangler@4',...args],options);
}
function parseList(text) {
  const start=text.indexOf('[');
  if(start<0) throw Error('Could not parse Cloudflare database list.');
  return JSON.parse(text.slice(start));
}
async function provision() {
  console.log('Deploying to your Cloudflare account. This creates a Worker and D1 database.');
  const dir=path.join(HOME,'deployment');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  for(const filename of ['worker.js','schema.sql']) {
    const src=path.join(PACKAGE_ROOT,filename);
    if(!fs.existsSync(src)) throw Error('Package missing '+filename+'.');
    fs.copyFileSync(src,path.join(dir,filename));
  }
  const prior=readJSON(HOSTING);
  const name=prior?.name || 'observer-'+crypto.randomBytes(4).toString('hex');
  const dbName=prior?.db_name || name+'-db';
  console.log('Authenticating with Cloudflare...');
  const who=wrangler(['whoami'],{quiet:true,check:false,cwd:dir});
  if(who.status!==0) wrangler(['login'],{cwd:dir});
  let databases=parseList(wrangler(['d1','list','--json'],{quiet:true,cwd:dir}).stdout);
  let database=databases.find(item=>item.name===dbName);
  if(!database) {
    wrangler(['d1','create',dbName],{cwd:dir});
    databases=parseList(wrangler(['d1','list','--json'],{quiet:true,cwd:dir}).stdout);
    database=databases.find(item=>item.name===dbName);
  }
  if(!database?.uuid) throw Error('Cloudflare did not return the D1 database identifier.');
  const wranglerConfig={
    name,main:'worker.js',compatibility_date:'2026-10-01',
    triggers:{crons:['0 5 * * *']},
    d1_databases:[{binding:'DB',database_name:dbName,database_id:database.uuid}],
  };
  privateWrite(path.join(dir,'wrangler.json'),wranglerConfig);
  wrangler(['d1','execute',dbName,'--remote','--file=schema.sql','--config=wrangler.json'],{cwd:dir});
  const agentToken=prior?.agent_token || crypto.randomBytes(36).toString('base64url');
  const viewPassword=prior?.view_password || crypto.randomBytes(24).toString('base64url');
  const sessionKey=prior?.session_key || crypto.randomBytes(48).toString('base64url');
  const deployed=wrangler(['deploy','--config=wrangler.json'],{cwd:dir,quiet:true});
  for(const [key,value] of Object.entries({
    AGENT_TOKEN:agentToken,VIEW_PASSWORD:viewPassword,SESSION_KEY:sessionKey,
  })) {
    wrangler(['secret','put',key,'--config=wrangler.json'],{cwd:dir,input:value+'\n'});
  }
  let endpoint=prior?.endpoint || deployed.stdout.match(/https:\/\/[^\s"'<>]+\.workers\.dev/)?.[0];
  if(!endpoint) endpoint=await question('Worker URL (https://...workers.dev): ');
  endpoint=validateEndpoint(endpoint);
  privateWrite(HOSTING,{name,db_name:dbName,database_id:database.uuid,agent_token:agentToken,view_password:viewPassword,session_key:sessionKey,endpoint});
  console.log('\nDashboard: '+endpoint);
  console.log('Website password (store securely): '+viewPassword);
  return {endpoint,agentToken};
}
export async function deploy() {
  if(!fs.existsSync(HOSTING)) throw Error('Use observer setup to create a Cloudflare installation first.');
  return provision();
}
export async function setup() {
  findPython();
  console.log('Observer setup\n');
  const prior=readJSON(CONFIG) || readJSON(path.join(os.homedir(), '.codex-monitor', 'config.json'));
  const priorSources=Array.isArray(prior?.sources)?prior.sources:[{type:'codex'}];
  let endpoint,agentToken;
  const choice=await question('Hosting: [1] deploy to Cloudflare, [2] existing Worker (default 2): ','2');
  if(choice==='1') ({endpoint,agentToken}=await provision());
  else if(choice==='2') {
    endpoint=validateEndpoint(await question('Worker URL: '));
    agentToken=await secretQuestion('Agent token (hidden): ');
    if(agentToken.length<30) throw Error('Agent token must be at least 30 characters.');
  } else throw Error('Enter 1 or 2.');
  const sourcesInput=await question('Sources (comma-separated: codex,claude,pi,files,services): ','codex,claude,pi,files,services');
  const types=sourcesInput.split(',').map(s=>s.trim().toLowerCase());
  if(!types.length || new Set(types).size!==types.length || types.some(s=>!SOURCES.includes(s))) throw Error('Invalid source selection.');
  console.log('Content sync defaults to metadata (titles, projects, status and events).');
  console.log('Final mode sends completed answers; transcript mode sends prompts, commands and output previews.');
  console.log('Transcript previews may include private file contents and secrets.');
  const answer=(await question('Content mode: [m]etadata / [f]inal / [t]ranscript [m]: ','m')).toLowerCase();
  if(!['m','f','t'].includes(answer)) throw Error('Choose m, f, or t.');
  if(answer==='t' && await question('Type SYNC to enable conversation upload: ')!=='SYNC')
    throw Error('Conversation upload not enabled.');
  const contentMode=answer==='t'?'transcript':answer==='f'?'final':'metadata';
  const config={
    endpoint,agent_token:agentToken,device_id:prior?.device_id || 'mac-'+crypto.randomBytes(6).toString('hex'),
    content_mode:contentMode,screenshots_dir:prior?.screenshots_dir||'',
    interval_seconds:30,max_sessions:20,
    sources:types.map(type=>priorSources.find(item=>(typeof item==='string'?item:item?.type)===type) || {type}),
  };
  privateWrite(CONFIG,config);
  installRuntime();
  if(process.platform==='darwin' && !/^n(o)?$/i.test(await question('Start automatically at macOS login? [Y/n]: ','y'))) start();
  console.log('\nReady: '+endpoint);
  console.log('Check your connection with observer doctor.');
}
export function doctor() {
  const cfg=readJSON(CONFIG);
  console.log('Observer diagnostics');
  console.log(cfg?'OK   Agent configured':'INFO Run observer setup');
  try {findPython();console.log('OK   Python 3.9+');}catch(e){console.log('FAIL '+e.message);}
  console.log(fs.existsSync(path.join(RUNTIME,'agent.py'))?'OK   Installed local agent':'INFO Local agent not installed');
  if(cfg) {
    console.log('Dashboard: '+cfg.endpoint);
    console.log('Sources: '+(cfg.sources||[]).map(x=>x.type).join(', '));
    try {const p=fs.statSync(CONFIG);console.log((p.mode&0o077)?'WARN Config permissions too broad':'OK   Config permissions');}
    catch {console.log('FAIL Cannot read config permissions');}
  }
  if(process.platform==='darwin') {
    console.log(fs.existsSync(PLIST)?'OK   LaunchAgent installed':'INFO No LaunchAgent');
    console.log(exec('launchctl',['list',LABEL],{quiet:true,check:false}).status===0?'OK   LaunchAgent loaded':'INFO LaunchAgent not running');
  }
}
export function getConfig() {
  const cfg=readJSON(CONFIG);
  if(!cfg) throw Error('Run observer setup first.');
  return cfg;
}
