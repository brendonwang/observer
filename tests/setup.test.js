import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {privateWrite,readJSON,validateEndpoint} from '../bin/setup.js';

test('hosting endpoint accepts HTTPS and loopback only',()=>{
  assert.equal(validateEndpoint('https://observer.example.workers.dev'),'https://observer.example.workers.dev');
  assert.equal(validateEndpoint('http://localhost:8790'),'http://localhost:8790');
  for (const input of ['http://example.org','https://example.org/path','https://user:pass@example.org',
                       'https://example.org/?secret=abc','file:///tmp/data']) {
    assert.throws(()=>validateEndpoint(input));
  }
});
test('private config writer atomically replaces files and rejects symlinks',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'observer-config-'));
  try {
    const file=path.join(dir,'config.json');
    privateWrite(file,{endpoint:'https://example.org',agent_token:'test'});
    assert.equal(readJSON(file).agent_token,'test');
    privateWrite(file,{endpoint:'https://example.net'});
    assert.equal(readJSON(file).endpoint,'https://example.net');
    if(process.platform!=='win32') assert.equal(fs.statSync(file).mode&0o077,0);
    const link=path.join(dir,'link.json');
    fs.symlinkSync(file,link);
    assert.throws(()=>privateWrite(link,{secret:'invalid'}));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
