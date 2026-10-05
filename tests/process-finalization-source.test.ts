import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createContext,runInContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import {spawnSync} from 'node:child_process';
import {processFinalizationSource} from '../src/runtime/process-finalization-source.js';
import {processPreludeForTarget} from '../src/runtime/process-source.js';
import {emitProcessFinalization} from '../src/runtime/process-finalization.js';
import {RuntimeBuilder} from '../src/runtime/abi.js';
import {emitRuntime} from '../src/runtime/index.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
import {supportedNativeTargets} from '../src/target.js';
import {WeakFinalizationLayout} from '../src/runtime/weak-collections.js';
import {MapLayout} from '../src/runtime/map.js';

/** Native-only GC stress fixture: deterministic Nona collections prune the
 * dead callback before it can retain the second registration indefinitely. */
export const processFinalizationGcProbe=String.raw`
var live={id:7};process.finalization.register(live,function(ref,event){console.log(ref.id,event)});
(function(){var other={};process.finalization.register(other,function(){console.log('unexpected retained target')});
 var dead={};var callback=(function(captured){return function(){console.log(captured)}})(other);
 process.finalization.register(dead,callback)})();
(function(){var captured={id:9};process.finalization.register(captured,function(ref,event){console.log(captured===ref,event)})})();
for(var index=0;index<20;index++)({index:index});console.log('registered');
`;
export const processFinalizationGcExpected='registered\n7 exit\ntrue exit\n';

for(const target of supportedNativeTargets)test(`finalization native helper and GC metadata emit for ${target}`,()=>{
 withNativeTarget(target,()=>{
  const builder=new RuntimeBuilder();emitProcessFinalization(builder);const helper=builder.bundle.fragments[0]!;
  assert.equal(helper.name,'process.finalization.code');assert.ok(helper.fixups.every(fixup=>fixup.target.startsWith(helper.name)),'Leaf helper must reference only its own branch labels');
  assert.equal(WeakFinalizationLayout.callback,MapLayout.size);assert.equal(WeakFinalizationLayout.size,MapLayout.size+16);
  const runtime=emitRuntime();assert.ok(runtime.fragments.some(fragment=>fragment.name==='rt.gcPruneWeakCollection'));assert.ok(runtime.fragments.some(fragment=>fragment.name==='rt.WeakMap.construct'));
 });
});

function boundary(){
 const maps=new Map<object,{key:unknown;callback:unknown}>();
 class PrivateMap extends WeakMap<object,boolean>{override set(key:object,value:boolean){super.set(key,value);maps.set(this,{key,callback:undefined});return this}}
 const process=new EventEmitter() as EventEmitter & {finalization:typeof globalThis.process.finalization};
 const context=createContext({process,WeakMap:PrivateMap,__nonaRegexpVm:{},__nonaProcessFinalization:(map:object,mode:number,callback:unknown)=>{const record=maps.get(map)!;if(mode===0)return record.key;if(mode===1)return record.callback;record.callback=callback;return undefined}});
 runInContext('(function(){var finalizationNative=globalThis.__nonaProcessFinalization;delete globalThis.__nonaProcessFinalization;var finalizationMap=WeakMap,finalizationSet=WeakMap.prototype.set,finalizationHas=WeakMap.prototype.has,finalizationPush=Array.prototype.push,finalizationSplice=Array.prototype.splice,finalizationApply=Reflect.apply;function value(name,v){Object.defineProperty(process,name,{value:v,writable:true,enumerable:true,configurable:true})}function argumentError(code,message){var error=new TypeError(message);error.code=code;return error}'+processFinalizationSource+'globalThis.registryCounts=function(){return [finalizationExit.length,finalizationBefore.length]}})()',context);
 return {context,process,maps};
}

test('process finalization duplicates, unregister during dispatch and new registration match Node26',()=>{
 const cases=[
  `let a={};process.finalization.register(a,(o,e)=>console.log(o===a,e));process.finalization.register(a,()=>console.log('two'));`,
  `let a={},b={};process.finalization.register(a,()=>{console.log('one');process.finalization.unregister(b)});process.finalization.register(b,()=>console.log('two'));`,
  `let a={},b={};process.finalization.register(a,()=>{console.log('one');process.finalization.register(b,()=>console.log('new'))});`,
  `let a={};process.on('exit',()=>console.log('listener'));process.finalization.register(a,()=>console.log('final'));`,
  `let a={};process.finalization.register(a,()=>console.log('final'));process.on('exit',()=>console.log('listener'));`,
  `let a={};console.log(process.finalization.register(a,1));console.log(process.finalization.unregister(a));`,
  `let a={};process.finalization.register(a,()=>console.log('old'));process.finalization.unregister(a);process.on('exit',()=>console.log('listener'));process.finalization.register(a,()=>console.log('new'));`,
  `let a={},b={},c={},nested=false;process.finalization.registerBeforeExit(a,()=>{console.log('one');if(!nested){nested=true;try{process.emit('beforeExit')}catch(e){console.log('caught')}process.finalization.unregister(b);process.finalization.registerBeforeExit(c,()=>console.log('new'))}});process.finalization.registerBeforeExit(b,()=>{console.log('two');throw Error('nested')});process.emit('beforeExit');`,
 ];
 for(const source of cases){const {context,process}=boundary(),output:string[]=[];context.console={log:(...args:unknown[])=>output.push(args.map(String).join(' '))};runInContext(source,context);process.emit('exit',0);const oracle=spawnSync(globalThis.process.execPath,['--disable-warning=ExperimentalWarning','-e',source],{encoding:'utf8',windowsHide:true});assert.equal(oracle.status,0,oracle.stderr);assert.equal(output.join('\n')+'\n',oracle.stdout)}
});
test('throwing finalization callbacks retain the remaining event registrations for retry',()=>{
 const {context,process}=boundary();runInContext('var a={},b={},calls=[];process.finalization.registerBeforeExit(a,()=>{calls.push("one");if(calls.length===1)throw Error("retry")});process.finalization.registerBeforeExit(b,()=>calls.push("two"))',context);
 assert.throws(()=>process.emit('beforeExit',0),{message:'retry'});process.emit('beforeExit',0);assert.equal(runInContext('calls.join(",")',context),'one,one,two');
});
test('unregister releases registry records immediately and throwing dispatch compacts cancelled entries',()=>{
 const {context,process}=boundary();runInContext('for(var i=0;i<100;i++){var target={};process.finalization.register(target,()=>{});process.finalization.registerBeforeExit(target,()=>{});process.finalization.unregister(target)}',context);
 assert.equal(runInContext('registryCounts().join(",")',context),'0,0');assert.equal(process.listenerCount('exit'),0);assert.equal(process.listenerCount('beforeExit'),0);
 runInContext('var first={},second={};process.finalization.registerBeforeExit(first,()=>{process.finalization.unregister(second);throw Error("cancelled")});process.finalization.registerBeforeExit(second,()=>{})',context);
 assert.throws(()=>process.emit('beforeExit',0),{message:'cancelled'});assert.equal(runInContext('registryCounts().join(",")',context),'0,1');
});
test('beforeExit finalization consumes entries once and unregister clears both registries',()=>{
 const {context,process}=boundary();runInContext('var a={},calls=[];process.finalization.registerBeforeExit(a,(o,e)=>calls.push(e));process.finalization.register(a,(o,e)=>calls.push(e))',context);process.emit('beforeExit',0);process.emit('beforeExit',0);process.emit('exit',0);assert.equal(runInContext('calls.join(",")',context),'beforeExit,exit');
 runInContext('process.finalization.register(a,()=>calls.push("bad"));process.finalization.registerBeforeExit(a,()=>calls.push("bad"));process.finalization.unregister(a)',context);process.emit('beforeExit',0);process.emit('exit',0);assert.equal(runInContext('calls.join(",")',context),'beforeExit,exit');
});
test('finalization rejects primitive registrations but unregister accepts them',()=>{
 const {context}=boundary();for(const value of ['undefined','null','1','"x"','Symbol("x")']){assert.equal(runInContext('try{process.finalization.register('+value+',()=>{})}catch(e){e.code}',context),'ERR_INVALID_ARG_TYPE');assert.equal(runInContext('process.finalization.unregister('+value+')',context),undefined)}
});
test('pruned native finalization records release callbacks and do not invoke them',()=>{
 const {context,process,maps}=boundary();runInContext('var a={},calls=0;process.finalization.register(a,()=>calls++)',context);for(const record of maps.values()){record.key=undefined;record.callback=undefined}process.emit('exit',0);assert.equal(runInContext('calls',context),0);assert.equal('__nonaProcessFinalization' in context,false);
});
test('lazy process finalization preserves startup intrinsics before and after first access',()=>{
 const overrides=[`globalThis.WeakMap=function(){throw Error('constructor trap')}`,`WeakMap.prototype.set=function(){throw Error('set trap')}`,`WeakMap.prototype.has=function(){throw Error('has trap')}`,`Reflect.apply=function(){throw Error('apply trap')}`,`Array.prototype.push=function(){throw Error('push trap')}`,`Array.prototype.splice=function(){throw Error('splice trap')}`,`Object.defineProperty=function(){throw Error('defineProperty trap')}`,`Object.freeze=function(){throw Error('freeze trap')}`];
 for(const after of [false,true])for(const override of overrides){
  const metadata=new Map<object,{key:object;callback:unknown}>(),output:string[]=[];
  class PrivateMap extends WeakMap<object,boolean>{override set(key:object,value:boolean){super.set(key,value);metadata.set(this,{key,callback:undefined});return this}}
  const context=createContext({TextEncoder,TextDecoder,WeakMap:PrivateMap,console:{log:(...args:unknown[])=>output.push(args.map(String).join(' '))},__nonaRegexpVm:{arrayBufferCopy:(source:ArrayBuffer,target:ArrayBuffer,start:number,count:number,offset:number)=>new Uint8Array(target).set(new Uint8Array(source,start,count),offset)},__nonaPromiseDrainJobs(){},__nonaProcessNow:()=>1000,__nonaProcessFinalization:(map:object,mode:number,callback:unknown)=>{const record=metadata.get(map)!;if(mode===0)return record.key;if(mode===1)return record.callback;record.callback=callback},__nonaHost_GetCommandLineW:()=>0,__nonaHost_sys_open:()=>-2,__nonaHost_sys_readlink:()=>0,__nonaHost_sys_getpid:()=>123,__nonaHost_sys_getppid:()=>12,__nonaHost_startupArgv:()=>0,__nonaHost_startupEnv:()=>0,__nonaHost_replaceEnvironment:()=>{},__nonaHost_environmentVector:()=>0});
  runInContext(processPreludeForTarget('linux-x64'),context);assert.equal('__nonaProcessFinalization' in context,false);
  const source=(after?'var p=process;':'')+override+';var target={},cancelled={};process.finalization.register(target,(ref,event)=>console.log(ref===target,event));process.finalization.register(cancelled,()=>console.log("unexpected"));process.finalization.unregister(cancelled);console.log("registered");';
  runInContext(source,context);runInContext('__nonaPromiseDrainJobs()',context);
  const oracle=spawnSync(globalThis.process.execPath,['--disable-warning=ExperimentalWarning','-e',source],{encoding:'utf8',windowsHide:true});assert.equal(oracle.status,0,oracle.stderr);assert.equal(output.join('\n')+'\n',oracle.stdout,override+' after='+after);
 }
});
