import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {supportedNativeTargets} from '../src/target.js';
import {createContext,runInContext} from 'node:vm';
import {processPreludeForTarget} from '../src/runtime/process-source.js';
import {runProcess as runOnHost} from './helpers/process.js';
import {runOracle} from './helpers/oracle.js';

for(const target of supportedNativeTargets)test(`process core compiles for ${target}`,()=>{
 const result=compile('console.log(process.argv,process.env,process.cwd(),process.ppid,process.hrtime.bigint());process.chdir(".");process.nextTick(()=>console.log(process.uptime()));',{fileName:'process.js',target});
 assert.equal(result.ok,true,result.ok?'':JSON.stringify(result.diagnostics));
 const module=compile('import process,{chdir,hrtime,ppid,nextTick,uptime,argv0,execArgv} from "node:process";console.log(process.ppid===ppid,hrtime.bigint(),uptime(),argv0,execArgv);chdir(".");nextTick(()=>console.log("tick"));',{fileName:'process.mjs',target,module:true});
 assert.equal(module.ok,true,module.ok?'':JSON.stringify(module.diagnostics));
});

export const processOracleSource=String.raw`
console.log(process.ppid>0,typeof process.argv0,Array.isArray(process.execArgv));
let old=process.cwd();process.chdir('.');console.log(process.cwd()===old);
let t=process.hrtime(),n=process.hrtime.bigint(),d=process.hrtime(t);
console.log(t.length,t[1]>=0&&t[1]<1000000000,d[0]>=0,d[1]>=0,process.hrtime.bigint()>=n,process.uptime()>=0);
for(let value of [true,{},1.5,NaN,Infinity,'','1.5','Infinity','NaN',1e30]){try{process.exitCode=value}catch(e){console.log(e.name,e.code)}}
process.exitCode='3';console.log(process.exitCode);process.exitCode=undefined;
for(let value of [null,1,{},undefined]){try{process.nextTick(value)}catch(e){console.log(e.name,e.code)}}
for(let value of [null,1,{}]){try{process.chdir(value)}catch(e){console.log(e.name,e.code)}}
Promise.resolve().then(()=>{console.log('promise');process.nextTick(()=>console.log('from-promise'))});
process.nextTick((a,b)=>{console.log('tick',a,b);process.nextTick(()=>console.log('nested'))},1,2);
console.log('sync');
`;
test('process common API matches Node 26 under GC stress',()=>{
 const native=runOnHost(processOracleSource);assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,runOracle(processOracleSource).stdout);
});
test('process exitCode waits for next ticks, Promise jobs and timers',()=>{
 const source='process.exitCode=7;process.nextTick(()=>console.log("tick"));Promise.resolve().then(()=>console.log("promise"));setTimeout(()=>console.log("timer"),1)';
 const native=runOnHost(source);assert.equal(native.status,7,native.stderr);assert.equal(native.stdout,'tick\npromise\ntimer\n');
});
test('unsupported process members remain absent',()=>{
 const source='console.log(["send","versions","report","channel"].every(key=>process[key]===undefined))';
 const native=runOnHost(source);assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,'true\n');
});
