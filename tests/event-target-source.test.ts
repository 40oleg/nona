import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {eventsPreludeSource} from '../src/runtime/events-source.js';
import {asyncHooksPreludeSource} from '../src/runtime/async-hooks-source.js';
import {eventsModuleSource} from '../src/frontend/events-module.js';
import {asyncHooksModuleSource} from '../src/frontend/async-hooks-module.js';
import {compile} from '../src/compiler.js';
import {removeTemporaryDirectory} from './helpers/cleanup.js';

const cases:[string,string][]=[
 ['passive, persistent propagation and exception constants',`const t=new EventTarget();t.addEventListener('x',e=>e.preventDefault(),{passive:true});console.log(t.dispatchEvent(new Event('x',{cancelable:true})));const e=new Event('z');let n=0;t.addEventListener('z',e=>{n++;e.stopImmediatePropagation()});t.dispatchEvent(e);t.dispatchEvent(e);console.log(n,e.cancelBubble);for(const name of ['AbortError','TimeoutError','DataCloneError','SyntaxError','Error']){const error=new DOMException('message',name);console.log(error instanceof Error,error.message,error.name,error.code)}console.log(DOMException.ABORT_ERR,DOMException.prototype.TIMEOUT_ERR);`],
 ['static resource bind preserves dynamic receiver',`const receiver={x:5};const bound=AsyncResource.bind(function(x){console.log(this===receiver,this.x,x)},'bound');bound.call(receiver,7);const fixed=AsyncResource.bind(function(){console.log(this===receiver)},'bound',receiver);fixed();`],
 ['dispatch identity, cancellation and mutation',`const target=new EventTarget(),out=[];function b(){out.push('b')}target.addEventListener('x',function(e){out.push(this===target,e.target===target,e.currentTarget===target,e.eventPhase,e.composedPath()[0]===target);target.removeEventListener('x',b);e.preventDefault()},{once:true});target.addEventListener('x',b);const event=new CustomEvent('x',{cancelable:true,detail:42});console.log(target.dispatchEvent(event),event.detail,event.defaultPrevented,event.currentTarget,event.eventPhase,event.composedPath().length,out.join('|'));console.log(target.dispatchEvent(new Event('x')));`],
 ['listener objects, capture and stop propagation',`const target=new EventTarget(),out=[];const obj={handleEvent(e){out.push('object:'+e.type)}};function fn(e){out.push('fn');e.stopImmediatePropagation()}target.addEventListener('x',fn);target.addEventListener('x',fn,true);target.addEventListener('x',obj);target.removeEventListener('x',fn);target.dispatchEvent(new Event('x'));console.log(out.join('|'));`],
 ['abort composition, reason and listener removal',`const a=new AbortController(),b=new AbortController(),combined=AbortSignal.any([a.signal,b.signal]),target=new EventTarget();let count=0;target.addEventListener('x',()=>count++,{signal:combined});target.dispatchEvent(new Event('x'));b.abort('reason');a.abort('other');target.dispatchEvent(new Event('x'));console.log(count,combined.aborted,combined.reason,b.signal===b.signal);try{combined.throwIfAborted()}catch(e){console.log(e)}console.log(AbortSignal.abort().reason.name);`],
 ['protected abort subscription and disposal',`const c=new AbortController();c.signal.addEventListener('abort',e=>{console.log('stop');e.stopImmediatePropagation()});addAbortListener(c.signal,()=>console.log('protected'));const d=addAbortListener(c.signal,()=>console.log('removed'));d[Symbol.dispose]();c.abort();addAbortListener(c.signal,()=>console.log('late'));console.log('sync');`],
 ['target introspection and NodeEventTarget arguments',`const t=new NodeEventTarget(),out=[];function fn(arg){out.push(arg,this===t)}t.on('x',fn).on('x',fn);t.addEventListener('x',e=>out.push(e.type));t.once('x',arg=>out.push('once:'+arg));console.log(getEventListeners(t,'x').length,t.listenerCount('x'),t.eventNames().join(),getMaxListeners(t));setMaxListeners(20,t);console.log(t.getMaxListeners(),t.emit('x',42),t.emit('none',1),out.join('|'));t.removeAllListeners();console.log(t.eventNames().length);`],
 ['manual async resource context and hooks',`const initial=executionAsyncId(),out=[];const hook=createHook({init(id,type,trigger,resource){if(type==='sample')out.push(trigger===initial,resource instanceof AsyncResource)},before(id){if(id===resource.asyncId())out.push('before')},after(id){if(id===resource.asyncId())out.push('after')},destroy(id){if(id===resource.asyncId())out.push('destroy')}}).enable();const resource=new AsyncResource('sample',{requireManualDestroy:true});resource.runInAsyncScope(function(x){out.push(executionAsyncId()===resource.asyncId(),triggerAsyncId()===initial,this===resource,x)},resource,7);resource.emitDestroy();hook.disable();console.log(out.join('|'));`],
 ['emitter asynchronous resource and local storage',`const local=new AsyncLocalStorage();let emitter;local.run('construction',()=>{emitter=new EventEmitterAsyncResource({name:'sample',requireManualDestroy:true})});emitter.on('x',function(arg){console.log(local.getStore(),executionAsyncId()===emitter.asyncId,triggerAsyncId()===emitter.triggerAsyncId,this===emitter,arg,emitter.asyncResource.eventEmitter===emitter)});local.run('dispatch',()=>emitter.emit('x',8));console.log(local.getStore());emitter.emitDestroy();`],
];
const imports=`import {NodeEventTarget,EventEmitterAsyncResource,addAbortListener,getEventListeners,getMaxListeners,setMaxListeners} from 'node:events';import {AsyncResource,AsyncLocalStorage,executionAsyncId,triggerAsyncId,createHook} from 'node:async_hooks';\n`;
// Node documents this base class but exposes it through MessagePort's prototype.
const oracleImports=imports.replace('NodeEventTarget,','')+`const channel=new MessageChannel();const NodeEventTarget=Object.getPrototypeOf(Object.getPrototypeOf(channel.port1)).constructor;channel.port1.close();channel.port2.close();\n`;
for(const [name,body] of cases){
 test('event target source oracle: '+name,()=>{
  const directory=mkdtempSync(join(tmpdir(),'nona-target-'));
  try{
   writeFileSync(join(directory,'prelude.mjs'),'globalThis.__nonaRegexpVm={};\n'+eventsPreludeSource+'\n'+asyncHooksPreludeSource);
   writeFileSync(join(directory,'async.mjs'),asyncHooksModuleSource);
   writeFileSync(join(directory,'events.mjs'),eventsModuleSource.replace("'node:async_hooks'","'./async.mjs'"));
   writeFileSync(join(directory,'source.mjs'),"import './prelude.mjs';\n"+imports.replace("'node:events'","'./events.mjs'").replace("'node:async_hooks'","'./async.mjs'")+body);
   writeFileSync(join(directory,'oracle.mjs'),oracleImports+body);
   const source=spawnSync(process.execPath,[join(directory,'source.mjs')],{encoding:'utf8'}),oracle=spawnSync(process.execPath,[join(directory,'oracle.mjs')],{encoding:'utf8'});
   assert.equal(source.status,0,source.stderr);assert.equal(oracle.status,0,oracle.stderr);assert.equal(source.stdout,oracle.stdout);
  }finally{removeTemporaryDirectory(directory)}
 });
}
for(const target of ['win32-x64','win32-arm64','linux-x64','linux-arm64','darwin-x64','darwin-arm64','freebsd-x64','openbsd-x64'] as const)test('event target compile: '+target,()=>{const result=compile(imports+cases.map(([,body])=>'{'+body+'}').join('\n'),{fileName:'events-target.mjs',target,module:true});assert.equal(result.ok,true,result.ok?'':JSON.stringify(result.diagnostics))});
