import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runProcess} from './helpers/process.js';
import {runOracle} from './helpers/oracle.js';
test('process initialization completes with the host environment without GC stress',()=>{
 const result=runOnHost('console.log(process.platform,typeof process.env)',{gcStress:false});
 assert.equal(result.status,0,JSON.stringify({stdout:result.stdout,stderr:result.stderr,error:result.error?.message}));assert.equal(result.stdout,process.platform+' object\n');
});

import {processExtendedOracle,processReviewOracle,processEnvironmentOracle,processAccountOracle,processThreadOracle,processExecErrorOracle} from './helpers/process-fixture.js';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('process native environment property paths match the Node 26 oracle',()=>{
 const oracle=runOracle(processEnvironmentOracle),actual=runProcess(processEnvironmentOracle);
 assert.equal(actual.status,oracle.status,JSON.stringify({stdout:actual.stdout,stderr:actual.stderr,error:actual.error?.message}));assert.equal(actual.stdout,oracle.stdout);
});
test('process invalid account names match Node 26 without changing credentials',()=>{
 const oracle=runOracle(processAccountOracle),actual=runProcess(processAccountOracle);
 assert.equal(actual.status,oracle.status,JSON.stringify({stdout:actual.stdout,stderr:actual.stderr,error:actual.error?.message}));assert.equal(actual.stdout,oracle.stdout);
});
test('process native thread CPU shape and previous values match Node 26',()=>{
 const oracle=runOracle(processThreadOracle),actual=runProcess(processThreadOracle);
 assert.equal(actual.status,oracle.status,JSON.stringify({stdout:actual.stdout,stderr:actual.stderr,error:actual.error?.message}));assert.equal(actual.stdout,oracle.stdout);
});
test('process execve failure preserves state and matches Node 26 coded errors',()=>{
 const oracle=runOracle(processExecErrorOracle),actual=runProcess(processExecErrorOracle);
 assert.equal(actual.status,oracle.status,JSON.stringify({stdout:actual.stdout,stderr:actual.stderr,error:actual.error?.message}));assert.equal(actual.stdout,oracle.stdout);
});
test('process native dotenv loading matches Node 26 and reads real memory counters',()=>{
 const directory=mkdtempSync(join(tmpdir(),'nona-env-native-')),path=join(directory,'fixture.env');
 try{
  writeFileSync(path,"export NONA_ENV_A=' value # text '\nNONA_ENV_B=\"first\\nsecond\"\nNONA_ENV_KEEP=replaced\n");
  const source='process.env.NONA_ENV_KEEP="original";process.loadEnvFile('+JSON.stringify(path)+');console.log(JSON.stringify([process.env.NONA_ENV_A,process.env.NONA_ENV_B,process.env.NONA_ENV_KEEP]));console.log(process.availableMemory()>0,process.constrainedMemory()>=0)';
  const result=runProcess(source);assert.equal(result.status,0,JSON.stringify({stdout:result.stdout,stderr:result.stderr,error:result.error?.message}));assert.equal(result.stdout,runOracle(source).stdout);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
test('process reviewed lifecycle and unreferenced stdin match Node 26 natively',()=>{
 const result=runProcess(processReviewOracle,'abc');
 const oracle=spawnSync(process.execPath,['-e',processReviewOracle],{input:'abc',encoding:'utf8',windowsHide:true,timeout:5000});
 assert.equal(oracle.status,7,oracle.stderr);assert.equal(result.status,oracle.status,result.stderr);assert.equal(result.stdout,oracle.stdout);
});
test('process extended API matches Node 26 under GC stress',()=>{
 const result=runProcess(processExtendedOracle);assert.equal(result.status,0,JSON.stringify({stdout:result.stdout,stderr:result.stderr,error:result.error?.message}));assert.equal(result.stdout,runOracle(processExtendedOracle).stdout);
});
test('process stdin consumes UTF-8 pipe input through data/end events',()=>{
 const source='process.stdin.setEncoding("utf8");let text="";process.stdin.on("data",chunk=>text+=chunk);process.stdin.on("end",()=>console.log(text))';
 const result=runProcess(source,'hello ü');assert.equal(result.status,0,JSON.stringify({stdout:result.stdout,stderr:result.stderr,error:result.error?.message}));assert.equal(result.stdout,'hello ü\n');
});

