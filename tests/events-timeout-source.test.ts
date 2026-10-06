import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {spawnSync} from 'node:child_process';
import {timersPreludeSource} from '../src/runtime/timers-source.js';
import {eventsPreludeSource} from '../src/runtime/events-source.js';

function run(body:string){
 let clock=0;const output:string[]=[];
 runInNewContext('var __nonaRegexpVm={enqueueJob:function(fn){fn()}};var __nonaPromiseDrainJobs=function(){};'+timersPreludeSource+eventsPreludeSource+body+';__nonaPromiseDrainJobs();',{
  __nonaHostNow:()=>clock,__nonaHostWait:(delay:number)=>{clock+=delay},console:{log:(...values:unknown[])=>output.push(values.join(' '))},
 });
 return output.join('\n')+'\n';
}
function oracle(body:string){const child=spawnSync(process.execPath,['-e',body],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(child.status,0,child.stderr);return child.stdout;}
test('AbortSignal timeout and its listeners do not keep the process alive',()=>{
 const body=`AbortSignal.timeout(1000).addEventListener('abort',function(){console.log('unexpected')});console.log('done');`;
 assert.equal(run(body),oracle(body));
});
test('unreferenced cancellation fires while a later ordinary timer keeps the loop alive',()=>{
 const body=`var signal=AbortSignal.timeout(10);signal.addEventListener('abort',function(){console.log(signal.aborted,signal.reason.name)});setTimeout(function(){console.log('done')},50);`;
 assert.equal(run(body),oracle(body));
});
test('a later cancellation stops waiting after the last ordinary timer expires',()=>{
 const body=`AbortSignal.timeout(1000).addEventListener('abort',function(){console.log('unexpected')});setTimeout(function(){console.log('done')},10);`;
 assert.equal(run(body),oracle(body));
});
test('cancelling the last referenced timer leaves only unreferenced cancellation',()=>{
 const body=`AbortSignal.timeout(1000).addEventListener('abort',function(){console.log('unexpected')});var id=setTimeout(function(){console.log('unexpected ordinary')},2000);clearTimeout(id);console.log('done');`;
 assert.equal(run(body),oracle(body));
});
test('the last referenced callback does not skip unreferenced timers already due in its phase',()=>{
 const body=`setTimeout(function(){console.log('ref')},10);AbortSignal.timeout(10).addEventListener('abort',function(){console.log('abort')});`;
 assert.equal(run(body),oracle(body));
});
test('AbortSignal timeout validation follows Node26 error types and codes',()=>{
 const body=`for(var value of [undefined,null,'3',NaN,Infinity,-1,0.5,4294967296])try{AbortSignal.timeout(value)}catch(error){console.log(error.name,error.code)}`;
 assert.equal(run(body),oracle(body));
});
