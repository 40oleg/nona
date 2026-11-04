import { timeoutContracts } from "../helpers/abort-timeout-fixture.js";

/** Pure definitions shared by Node/source controls and every native target. */
export const bufferCancellationProbeSource = String.raw`
(async function(){
 const controller=new AbortController(),reason={cancelled:true};
 controller.signal.addEventListener('abort',event=>event.stopImmediatePropagation());
 const source=new Blob(['payload']).stream(),destination=new WritableStream({abort(value){console.log('sink',value===reason)}});
 const pending=source.pipeTo(destination,{signal:controller.signal});controller.abort(reason);
 try{await pending;console.log('resolved')}catch(error){console.log('rejected',error===reason)}
 console.log('locks',source.locked,destination.locked);
})()
`;
export const eventProbeSources = [
    ...timeoutContracts.map(({ name, body, expected }) => ({
        name: "event-timeout-" + name,
        source: body,
        expected,
    })),
    {
        name: "event-buffer-cancellation",
        source: bufferCancellationProbeSource,
        expected: "sink true\nrejected true\nlocks false false\n",
    },
    {
        name: "event-abort-disposal",
        source: `import {addAbortListener,getEventListeners} from 'node:events';
console.log('symbol',typeof Symbol.dispose,Symbol.dispose.description,Symbol.keyFor(Symbol.dispose),Symbol.dispose===Symbol.for('nodejs.dispose'));
const controller=new AbortController(),calls=[];
controller.signal.addEventListener('abort',event=>{calls.push('stop');event.stopImmediatePropagation()});
const disposed=addAbortListener(controller.signal,()=>calls.push('removed'));
disposed[Symbol.dispose]();disposed[Symbol.dispose]();
addAbortListener(controller.signal,()=>calls.push('protected'));
console.log('listeners',getEventListeners(controller.signal,'abort').length);
controller.abort();addAbortListener(controller.signal,()=>console.log('late'));
console.log(calls.join('|'),getEventListeners(controller.signal,'abort').length);
`,
        expected:
            "symbol symbol Symbol.dispose undefined false\nlisteners 2\nstop|protected 1\nlate\n",
    },
    {
        name: "event-cancellation",
        source: `import {EventEmitter,once,on,addAbortListener,getEventListeners} from 'node:events';
const target=new EventTarget(),event=new CustomEvent('x',{cancelable:true,detail:7});
target.addEventListener('x',e=>e.preventDefault(),{once:true});
console.log('event',target.dispatchEvent(event),event.defaultPrevented,event.detail,getEventListeners(target,'x').length);
const root=new AbortController(),a=AbortSignal.any([root.signal]),b=AbortSignal.any([root.signal]),c=AbortSignal.any([a,b]),order=[];
for(const pair of [['root',root.signal],['a',a],['b',b],['c',c]])pair[1].addEventListener('abort',()=>order.push(pair[0]+':'+a.aborted+':'+b.aborted+':'+c.aborted));
root.signal.dispatchEvent(new Event('abort'));console.log('synthetic',a.aborted,b.aborted,c.aborted);order.length=0;
root.abort('reason');console.log('graph',order.join('|'),c.reason);
const emitter=new EventEmitter(),controller=new AbortController();controller.signal.addEventListener('abort',e=>e.stopImmediatePropagation());
let protectedCalls=0;addAbortListener(controller.signal,()=>protectedCalls++);
const first=once(emitter,'once',{signal:controller.signal}).catch(e=>['once',e.name,e.cause].join(':'));
const iterator=on(emitter,'iter',{signal:controller.signal}),second=iterator.next().catch(e=>['iter',e.name,e.cause].join(':'));
controller.abort('cancel');console.log('cleanup',emitter.eventNames().length,protectedCalls);
Promise.all([first,second]).then(values=>console.log(values.join('|')));
`,
        expected:
            "event false true 7 0\nsynthetic false false false\ngraph root:true:true:true|a:true:true:true|b:true:true:true|c:true:true:true reason\ncleanup 0 1\nonce:AbortError:cancel|iter:AbortError:cancel\n",
    },
    {
        name: "event-async-context",
        source: `import {EventEmitterAsyncResource} from 'node:events';
import {AsyncResource,AsyncLocalStorage,executionAsyncId,triggerAsyncId} from 'node:async_hooks';
const local=new AsyncLocalStorage(),initial=executionAsyncId(),resource=new AsyncResource('probe',{requireManualDestroy:true});
resource.runInAsyncScope(()=>console.log('resource',executionAsyncId()===resource.asyncId(),triggerAsyncId()===initial));
let emitter,resolve;const pending=new Promise(r=>resolve=r);
local.run('construction',()=>{emitter=new EventEmitterAsyncResource({name:'probe',requireManualDestroy:true})});
emitter.on('x',()=>console.log('emitter',local.getStore(),executionAsyncId()===emitter.asyncId,triggerAsyncId()===emitter.triggerAsyncId));
local.run('dispatch',()=>emitter.emit('x'));
local.run('registered',()=>{pending.then(()=>console.log('then',local.getStore()));queueMicrotask(()=>console.log('microtask',local.getStore()));setTimeout(()=>console.log('timer',local.getStore()),5);async function task(){await pending;console.log('await',local.getStore())}task()});
local.run('resolved',()=>resolve());console.log('outside',local.getStore());emitter.emitDestroy();resource.emitDestroy();
const saved=new AsyncLocalStorage();let bound,snapshot,savedResource;
saved.run('saved',()=>{bound=AsyncLocalStorage.bind(change=>{const before=saved.getStore();if(change)saved.enterWith('changed');return before});snapshot=AsyncLocalStorage.snapshot();savedResource=new AsyncResource('saved')});
saved.disable();saved.run('caller',()=>console.log('capture',bound(true),bound(false),snapshot(()=>saved.getStore()),savedResource.runInAsyncScope(()=>saved.getStore()),saved.getStore()));
console.log('capture outside',saved.getStore());
`,
        expected:
            "resource true true\nemitter construction true true\noutside undefined\ncapture saved saved saved saved caller\ncapture outside undefined\nmicrotask registered\nthen registered\nawait registered\ntimer registered\n",
    },
] as const;
