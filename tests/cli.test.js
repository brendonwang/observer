import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {commandTitle,parseRun,saveFeed} from '../bin/observer.js';

test('sensitive flags do not appear in the title',()=>{
  assert.equal(commandTitle(['curl','--token','secret123','--api-key=hidden']),
    'curl --token [redacted] --api-key=[redacted]');
});
test('project and explicit label are parsed without affecting execution',()=>{
  assert.deepEqual(parseRun(['--project','observer','--label','Run tests','--','node','--version']),
    {project:'observer',label:'Run tests',command:['node','--version']});
});
test('atomic feed files have private permissions',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'observer-test-'));
  try {
    const file=path.join(dir,'feeds','test.json');
    saveFeed(file,{status:'completed'});
    assert.equal(JSON.parse(fs.readFileSync(file)).status,'completed');
    if(process.platform!=='win32') assert.equal(fs.statSync(file).mode & 0o077,0);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('tracked commands produce successful and failed activities',()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'observer-run-'));
  try {
    const binary=path.resolve('bin/observer.js');
    const env={...process.env,OBSERVER_HOME:home};
    const good=spawnSync(process.execPath,[binary,'run','--',process.execPath,'-e','process.exit(0)'],{env});
    const bad=spawnSync(process.execPath,[binary,'run','--',process.execPath,'-e','process.exit(7)'],{env});
    assert.equal(good.status,0,good.stderr.toString());
    assert.equal(bad.status,7,bad.stderr.toString());
    const feeds=fs.readdirSync(path.join(home,'feeds')).map(file=>
      JSON.parse(fs.readFileSync(path.join(home,'feeds',file),'utf8')));
    assert.deepEqual(feeds.map(item=>item.status).sort(),['completed','failed']);
    assert.ok(feeds.every(item=>item.source==='Terminal'));
  } finally {fs.rmSync(home,{recursive:true,force:true});}
});
test('service registration never executes a process or accepts public HTTP',()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'observer-service-'));
  try {
    const binary=path.resolve('bin/observer.js');
    const env={...process.env,OBSERVER_HOME:home};
    const bad=spawnSync(process.execPath,[binary,'service','add','remote','http://example.com'],{env});
    assert.equal(bad.status,1);
    const good=spawnSync(process.execPath,[binary,'service','add','local','http://127.0.0.1:3000/health'],{env});
    assert.equal(good.status,0,good.stderr.toString());
    const data=JSON.parse(fs.readFileSync(path.join(home,'services.json')));
    assert.equal(data[0].name,'local');
  } finally {fs.rmSync(home,{recursive:true,force:true});}
});
