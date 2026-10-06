import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {runOracle} from './helpers/oracle.js';
import {timersPreludeSource} from '../src/runtime/timers-source.js';
import {asyncHooksPreludeSource} from '../src/runtime/async-hooks-source.js';
function run(body:string){let clock=0;const out:string[]=[],jobs:Function[]=[];const runtime={enqueueJob:(fn:Function)=>jobs.push(fn)};runInNewContext('var __nonaPromiseDrainJobs=drain;'+timersPreludeSource+body+';__nonaPromiseDrainJobs();',{__nonaRegexpVm:runtime,drain(){while(jobs.length)jobs.shift()!()},__nonaHostNow:()=>clock,__nonaHostWait:(delay:number)=>clock+=delay,console:{log:(...values:unknown[])=>out.push(values.map(String).join(' '))}});return out.join('\n')+(out.length?'\n':'')}
const cases=[
 'console.log("sync");setImmediate(function(value){console.log("first",value);queueMicrotask(function(){console.log("microtask")});setImmediate(function(){console.log("nested")})},"x");setImmediate(function(){console.log("second")})',
 'var second;setImmediate(function(){console.log("first");clearImmediate(second)});second=setImmediate(function(){console.log("cancelled")});setImmediate(function(){console.log("third")})',
 'setImmediate(function(){console.log("unexpected")}).unref();console.log("done")',
 'var handle=setImmediate(function(){console.log("inside",handle.hasRef())});console.log(handle.hasRef(),handle.unref()===handle,handle.hasRef(),handle.unref()===handle,handle.ref()===handle,handle.hasRef())',
 'var handle=setImmediate(function(){console.log("unexpected")});console.log(handle[Symbol.dispose](),handle.hasRef());clearImmediate(handle);console.log(handle.ref()===handle,handle.hasRef())',
 'setTimeout(function(){console.log("timer")},30);setImmediate(function(){console.log("immediate")}).unref()',
 'for(var value of [undefined,null,1,"x",{},false])try{setImmediate(value)}catch(error){console.log(error.name,error.code)}',
 'var handle=setImmediate(function(a,b){console.log(this===handle,a,b,arguments.length)},1,2);for(var value of [undefined,null,1,"x",{},false])clearImmediate(value)',
 'var handle=setImmediate(function(){console.log("called")});console.log(typeof handle[Symbol.for("nodejs.ref")],typeof handle[Symbol.for("nodejs.unref")])',
];
test('network readiness drains jobs before check-phase Immediates',()=>{
 assert.equal(run(`var alive=true;__nonaIoLoop({active:function(){return alive?1:0},total:function(){return alive?1:0},poll:function(){return 1},run:function(){console.log('socket');queueMicrotask(function(){console.log('job')});setImmediate(function(){console.log('check')});alive=false}})`),'socket\njob\ncheck\n');
});
test('unreferenced network handles alone do not keep the loop alive',()=>{
 assert.equal(run(`__nonaIoLoop({active:function(){return 0},total:function(){return 1},poll:function(){throw Error('unexpected poll')},run:function(){}});console.log('done')`),'done\n');
});
test('network callbacks can transfer the last live reference to standard input',()=>{
 assert.equal(run(`var alive=true,input=false;__nonaRegexpVm.hasPendingIO=function(){return input};__nonaRegexpVm.hasReadableIO=function(){return input};__nonaRegexpVm.pumpIO=function(){console.log('stdin');input=false};__nonaIoLoop({active:function(){return alive?1:0},total:function(){return alive?1:0},poll:function(){return 1},run:function(){console.log('socket');alive=false;input=true}})`),'socket\nstdin\n');
});
test('network polling remains bounded while native signal watches are live',()=>{
 assert.equal(run(`var alive=true,signals=true,timer=setTimeout(function(){throw Error('unexpected timer')},10);__nonaRegexpVm.hasPendingIO=function(){return signals};__nonaRegexpVm.hasSignalWatches=function(){return signals};__nonaIoLoop({active:function(){return alive?1:0},total:function(){return alive?1:0},poll:function(timeout){if(timeout>0){console.log(timeout<=5);clearTimeout(timer);alive=false;signals=false}return 0},run:function(){}})`),'true\n');
});
test('network callback exceptions reach the Process uncaught dispatcher',()=>{
 assert.equal(run(`var alive=true;__nonaRegexpVm.dispatchUncaught=function(error){console.log(error.message)};__nonaIoLoop({active:function(){return alive?1:0},total:function(){return alive?1:0},poll:function(){return 1},run:function(){alive=false;throw Error('socket error')}})`),'socket error\n');
});
for(const [index,body] of cases.entries())test('Immediate queue and lifecycle Node26 oracle '+index,()=>{const oracle=runOracle(body);assert.equal(oracle.status,0);assert.equal(run(body),oracle.stdout)});
test('Immediate callbacks retain their registered asynchronous context',()=>{
 const body='var local=new AsyncLocalStorage(),values=[];local.run("registered",function(){setImmediate(function(){values.push(local.getStore());local.enterWith("changed");setImmediate(function(){values.push(local.getStore())})})});setImmediate(function(){values.push(local.getStore())});';
 const oracle=runOracle('var {AsyncLocalStorage}=require("node:async_hooks");'+body+'setTimeout(function(){console.log(JSON.stringify(values))},50)');
 const actual=runInNewContext('var __nonaRegexpVm={enqueueJob:function(fn){fn()}};var __nonaPromiseDrainJobs=function(){};'+asyncHooksPreludeSource+timersPreludeSource+'var AsyncLocalStorage=EventTarget[Symbol.for("nona.async_hooks.internal")].AsyncLocalStorage;'+body+'__nonaPromiseDrainJobs();JSON.stringify(values)',{EventTarget:class {},__nonaHostNow:()=>0,__nonaHostWait:()=>{}});
 assert.equal(actual,oracle.stdout.trim());
});

