import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync,mkdtempSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {requireHostTarget} from '../src/target.js';
import {processBuiltinProbes} from './probes/process-builtin-probes.js';
import {removeTemporaryDirectory} from './helpers/cleanup.js';

// Native CI only. A focused environment isolates registry/GC behavior;
// process environment decoding and mutation retain their dedicated coverage.
for(const probe of processBuiltinProbes(requireHostTarget()))test(probe.name+' executes actual provider identity under GC stress',()=>{
 const directory=mkdtempSync(join(tmpdir(),'nona-process-builtin-'));
 try{
  const file=join(directory,process.platform==='win32'?'image.exe':'image');
  writeFileSync(file,probe.image);chmodSync(file,0o755);
  const result=spawnSync(file,[],{encoding:'utf8',windowsHide:true,timeout:60_000,
   env:process.platform==='win32'?{SystemRoot:process.env.SystemRoot??'C:\\Windows'}:{}});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,probe.expected);
 }finally{removeTemporaryDirectory(directory)}
});
