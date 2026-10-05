import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runProcess} from './helpers/process.js';
import {runOracle} from './helpers/oracle.js';
test('process initialization completes with the host environment without GC stress',()=>{
 const result=runOnHost('console.log(process.platform,typeof process.env)',{gcStress:false});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,process.platform+' object\n');
});

import {processExtendedOracle} from './helpers/process-fixture.js';
test('process extended API matches Node 26 under GC stress',()=>{
 const result=runProcess(processExtendedOracle);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,runOracle(processExtendedOracle).stdout);
});
test('process stdin consumes UTF-8 pipe input through data/end events',()=>{
 const source='process.stdin.setEncoding("utf8");let text="";process.stdin.on("data",chunk=>text+=chunk);process.stdin.on("end",()=>console.log(text))';
 const result=runProcess(source,'hello ü');assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'hello ü\n');
});

