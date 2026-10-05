import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {eventsModuleSource} from '../src/frontend/events-module.js';
import {compile} from '../src/compiler.js';
import {runModulesOnHost} from './helpers/host.js';
import {removeTemporaryDirectory} from './helpers/cleanup.js';

const cases:[string,string][]=[
 ['listener ordering, symbols, receiver and mutation', `
const e=new EventEmitter(), key=Symbol('key'), out=[];
function a(x){out.push('a'+x+':'+(this===e));e.off(key,b);e.on(key,()=>out.push('late'));}
function b(x){out.push('b'+x);}
e.on(key,a).on(key,b).prependOnceListener(key,x=>out.push('first'+x));
console.log(e.listeners(key).length,e.rawListeners(key)[0].listener===e.listeners(key)[0]);
console.log(e.emit(key,1),e.emit(key,2),e.emit('none'),out.join('|'));
console.log(e.eventNames().map(String).join(),e.listenerCount(key));
`],
 ['meta events, duplicate removal and snapshots', `
const e=new EventEmitter(),out=[];
e.on('newListener',(n,f)=>out.push('add:'+String(n)+':'+f.name));
e.on('removeListener',(n,f)=>out.push('remove:'+String(n)+':'+f.name));
function fn(){} e.on('x',fn).once('x',fn).prependListener('x',fn);
const raw=e.rawListeners('x');console.log(e.listenerCount('x',fn),raw.length,raw[2].listener===fn);
e.removeListener('x',fn);console.log(e.listenerCount('x',fn),raw.length);
e.removeAllListeners('x');console.log(out.join('|'));e.removeAllListeners();console.log(e.eventNames().length);
`],
 ['recursive once and wrapper direct invocation', `
const e=new EventEmitter();let n=0;
function f(){n++;e.emit('x');return 42;}e.once('x',f);
const wrap=e.rawListeners('x')[0];console.log(wrap.listener===f,wrap(),wrap(),n,e.listenerCount('x'));
`],
 ['errors and errorMonitor', `
const e=new EventEmitter(),err=new Error('boom');e.on(errorMonitor,x=>console.log('monitor',x===err));
try{e.emit('error',err)}catch(x){console.log('same',x===err)}
e.on('error',x=>console.log('handled',x===err));console.log(e.emit('error',err));
try{new EventEmitter().emit('error','oops')}catch(x){console.log(x.code,x.context)}
`],
 ['max listeners and aliases', `
const a=new EventEmitter(),b=new EventEmitter();
console.log(EventEmitter===Default,EventEmitter.EventEmitter===EventEmitter,a.on===a.addListener,a.off===a.removeListener);
console.log(getMaxListeners(a),defaultMaxListeners);setMaxListeners(2,a,b);console.log(a.getMaxListeners(),b.getMaxListeners());
EventEmitter.defaultMaxListeners=4;console.log(new EventEmitter().getMaxListeners());EventEmitter.defaultMaxListeners=10;
for(const n of [-1,NaN,'x']){try{a.setMaxListeners(n)}catch(x){console.log(x.name,x.code)}}
for(const f of [null,1,{}]){try{a.on('x',f)}catch(x){console.log(x.name,x.code)}}
function f(){}a.on('x',f);console.log(listenerCount(a,'x'),getEventListeners(a,'x')[0]===f);
`],
 ['promise once cleanup and error rejection', `
const e=new EventEmitter();const p=once(e,'x');console.log(e.listenerCount('x'),e.listenerCount('error'));
p.then(x=>console.log('once',x.join(','),e.listenerCount('x'),e.listenerCount('error')));e.emit('x',1,2);
const q=once(e,'y');q.catch(x=>console.log('reject',x.message,e.listenerCount('y')));e.emit('error',new Error('bad'));
`],
 ['async iterator queue and close', `
const e=new EventEmitter();const it=on(e,'x',{close:['close']});e.emit('x',1,2);e.emit('x',3);e.emit('close');
async function run(){for await(const values of it)console.log(values.join(','));console.log('end',e.eventNames().length);}
run();
`],
 ['capture rejections and custom hook', `
const a=new EventEmitter({captureRejections:true});a.on('error',x=>console.log('caught',x.message));a.on('x',()=>Promise.reject(new Error('bad')));a.emit('x');
const b=new EventEmitter({captureRejections:true});b[captureRejectionSymbol]=function(err,name,arg){console.log('hook',err.message,name,arg,this===b)};b.on('x',()=>Promise.reject(new Error('hooked')));b.emit('x',7);
`],
 ['subclasses, inherited emitters, property keys and global capture', `
class Child extends EventEmitter{}const a=new Child();console.log(a instanceof EventEmitter,a instanceof Child);
const b=Object.create(EventEmitter.prototype);b.on('x',()=>console.log('b'));console.log(a.listenerCount('x'));b.emit('x');
a.on('__proto__',()=>console.log('proto')).on(5,()=>console.log('five'));a.emit('__proto__');a.emit('5');console.log(a.eventNames().map(String).join('|'));
EventEmitter.captureRejections=true;const c=new EventEmitter();EventEmitter.captureRejections=false;c.on('error',e=>console.log(e.message));c.on('x',()=>Promise.reject(new Error('global')));c.emit('x');
`],
 ['iterator watermarks and cleanup', `
const e=new EventEmitter();e.pause=()=>console.log('pause');e.resume=()=>console.log('resume');const it=on(e,'x',{highWaterMark:1,lowWaterMark:1});e.emit('x',1);e.emit('x',2);
async function run(){console.log((await it.next()).value.join());console.log((await it.next()).value.join());await it.return();console.log(e.eventNames().length);}
run();
`],
 ['abortable helpers with a supplied signal', `
class Signal{constructor(){this.aborted=false;this.reason='reason';this.handlers=[];}addEventListener(n,f){this.handlers.push(f);}removeEventListener(n,f){this.handlers=this.handlers.filter(x=>x!==f);}abort(){this.aborted=true;for(const f of this.handlers.slice())f();}}
const e=new EventEmitter(),signal=new Signal();once(e,'x',{signal}).catch(x=>console.log(x.name,x.code,x.cause,e.eventNames().length));signal.abort();
`],
 ['listener limit warnings are reported once per listener array', `
const original=process.emitWarning;process.emitWarning=w=>console.log(w.name,w.count,w.type,w.emitter===e);
const e=new EventEmitter().setMaxListeners(1);const f=()=>{};e.on('x',f).on('x',f).on('x',f);e.removeAllListeners('x');e.on('x',f).on('x',f);process.emitWarning=original;
`],
 ['constructor options, default helper limits and watermark validation', `
for(const options of [undefined,null,false,1,'x',{}])console.log(new EventEmitter(options).getMaxListeners());
console.log(setMaxListeners());
for(const n of [0,-1,NaN,'x',1.1]){try{on(new EventEmitter(),'x',{highWaterMark:n})}catch(e){console.log(e.name,e.code)}}
for(const n of [0,-1,NaN,'x',1.1]){try{on(new EventEmitter(),'x',{lowWaterMark:n})}catch(e){console.log(e.name,e.code)}}
`],
 ['iterator pending requests, return and errors', `
async function run(){const e=new EventEmitter(),it=on(e,'x');const p=it.next();e.emit('x',9);console.log((await p).value.join());await it.return();console.log((await it.next()).done,e.eventNames().length);
const jt=on(e,'y');e.emit('y',1);e.emit('error',new Error('bad'));console.log((await jt.next()).value.join());try{await jt.next()}catch(x){console.log(x.message)}console.log((await jt.next()).done);}
run();
`],
];
const imports=`import Default,{EventEmitter,errorMonitor,captureRejectionSymbol,defaultMaxListeners,once,on,getEventListeners,getMaxListeners,setMaxListeners,listenerCount} from 'node:events';\n`;
for(const [name,body] of cases){
 test('events source oracle: '+name,()=>{
  const directory=mkdtempSync(join(tmpdir(),'nona-events-source-'));
  try{
   writeFileSync(join(directory,'events.mjs'),eventsModuleSource);
   writeFileSync(join(directory,'native.mjs'),imports.replace("'node:events'","'./events.mjs'")+body);
   writeFileSync(join(directory,'oracle.mjs'),imports+body);
   const source=spawnSync(process.execPath,[join(directory,'native.mjs')],{encoding:'utf8'});
   const oracle=spawnSync(process.execPath,[join(directory,'oracle.mjs')],{encoding:'utf8'});
   assert.equal(source.status,0,source.stderr);assert.equal(oracle.status,0,oracle.stderr);assert.equal(source.stdout,oracle.stdout);
  }finally{removeTemporaryDirectory(directory);}
 });
 test('events native oracle: '+name,{skip:name.startsWith('listener limit warnings')&&process.platform!=='win32'&&process.platform!=='linux'},()=>{
  const {native,oracle}=runModulesOnHost({'main.mjs':imports+body},'main.mjs');
  assert.equal(native.error,undefined);assert.equal(native.status,0,native.stderr);assert.equal(native.stdout,oracle);
 });
}
for(const target of ['win32-x64','linux-x64'] as const)test('events compile: '+target,()=>{
 const result=compile(imports+cases.map(([,body])=>'{'+body+'}').join('\n'),{fileName:'events-main.mjs',target,module:true});
 assert.equal(result.ok,true,result.ok?'':JSON.stringify(result.diagnostics));
});


test('events source oracle: addAbortListener disposal and late subscription',()=>{
 const directory=mkdtempSync(join(tmpdir(),'nona-events-abort-'));
 try{
  writeFileSync(join(directory,'events.mjs'),eventsModuleSource);
  const body=`const c=new AbortController();const a=addAbortListener(c.signal,()=>console.log('removed'));a[Symbol.dispose]();addAbortListener(c.signal,()=>console.log('abort'));c.abort();addAbortListener(c.signal,()=>console.log('late'));console.log('sync');`;
  for(const [file,module] of [['source.mjs','./events.mjs'],['oracle.mjs','node:events']])writeFileSync(join(directory,file!),`import {addAbortListener} from '${module}';\n`+body);
  const source=spawnSync(process.execPath,[join(directory,'source.mjs')],{encoding:'utf8'});
  const oracle=spawnSync(process.execPath,[join(directory,'oracle.mjs')],{encoding:'utf8'});
  assert.equal(source.status,0,source.stderr);assert.equal(oracle.status,0,oracle.stderr);assert.equal(source.stdout,oracle.stdout);
 }finally{removeTemporaryDirectory(directory);}
});
test('events compile: aliases share one module instance',()=>{
 const result=compile("import A from 'events';import B from 'node:events';import C from 'nona:events';console.log(A===B,B===C);",{fileName:'events-aliases.mjs',target:'linux-x64',module:true});
 assert.equal(result.ok,true,result.ok?'':JSON.stringify(result.diagnostics));
});

for(const target of ['darwin-x64','darwin-arm64','linux-arm64','win32-arm64','freebsd-x64','openbsd-x64'] as const)test('events compile portable: '+target,()=>{
 const result=compile("import E from 'node:events';new E().on('x',()=>console.log(1)).emit('x');",{fileName:'events-portable.mjs',target,module:true});
 assert.equal(result.ok,true,result.ok?'':JSON.stringify(result.diagnostics));
});