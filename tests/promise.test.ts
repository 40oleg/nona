import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';

function expectStress(source:string):void {
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
}

test('Promise reactions, thenable assimilation and chains drain after main',()=>expectStress(`
 console.log('sync');
 var thenable={then(resolve){for(var i=0;i<20;i++)({i});console.log('thenable');resolve(5)}};
 Promise.resolve(thenable).then(value=>{console.log('first',value);return value+1}).then(value=>console.log('second',value));
 new Promise(function(resolve,reject){resolve(3);reject(4)}).then(value=>console.log('once',value));
 Promise.reject('error').catch(reason=>console.log('caught',reason));
 console.log('end');
`));

test('Promise all, allSettled, race and finally preserve job order',()=>expectStress(`
 Promise.all([Promise.resolve(2),3]).then(values=>console.log('all',values.join(',')));
 Promise.allSettled([Promise.resolve(4),Promise.reject('x')]).then(values=>console.log('settled',values[0].status,values[0].value,values[1].status,values[1].reason));
 Promise.race([Promise.resolve(5),Promise.resolve(6)]).then(value=>console.log('race',value));
 Promise.resolve(7).finally(()=>console.log('finally')).then(value=>console.log('value',value));
 console.log('sync');
`));

test('Promise self resolution and rejection handlers survive GC stress',()=>expectStress(`
 var resolve,p=new Promise(function(r){resolve=r});resolve(p);
 p.then(undefined,error=>console.log(error.name));
 Promise.resolve(1).then(()=>{throw new Error('boom')}).catch(error=>console.log(error.message));
 Promise.reject('reason').finally(()=>2).catch(reason=>console.log(reason));
`));

test('Promise internal job and result arrays ignore inherited numeric setters',()=>expectStress(`
 Object.defineProperty(Array.prototype,0,{set(){throw new Error('inherited setter')},configurable:true});
 Promise.all([42]).then(values=>{delete Array.prototype[0];console.log(values[0])},error=>{delete Array.prototype[0];console.log(error.name)});
`));

test('Reflect.construct validates Promise executor before newTarget prototype',()=>expectStress(`
 var target=(function(){}).bind(null);
 Object.defineProperty(target,'prototype',{get(){throw new Error('prototype accessed')}});
 try{Reflect.construct(Promise,[],target)}catch(error){console.log(error.name)}
 try{Reflect.construct(Promise,[function(){}],target)}catch(error){console.log(error.name)}
`));

test('Direct Promise construction checks fixed and spread executors',()=>expectStress(`
 for(var args of [[],[1],[function(resolve){resolve(7)}]]){
   try{new Promise(...args).then(value=>console.log('value',value))}
   catch(error){console.log(error.name)}
 }
 try{new Promise(1)}catch(error){console.log(error.name)}
`));

test('Promise job drain is not exposed to user code',()=>expectStress(`
 console.log(typeof __nonaPromiseDrainJobs,'__nonaPromiseDrainJobs' in globalThis);
 Promise.resolve(1).then(value=>console.log('job',value));
`));

test('Promise state survives changes to WeakMap prototype methods',()=>expectStress(`
 var savedGet=WeakMap.prototype.get,savedSet=WeakMap.prototype.set;
 WeakMap.prototype.get=function(){throw new Error('poisoned get')};
 WeakMap.prototype.set=function(){throw new Error('poisoned set')};
 Promise.resolve(3).then(value=>console.log('resolved',value));
 new Promise(resolve=>resolve(4)).then(value=>console.log('constructed',value));
 WeakMap.prototype.get=savedGet;WeakMap.prototype.set=savedSet;
`));

test('Promise rejection handled by a later job does not fail the host',()=>expectStress(`
 var rejected=Promise.reject('handled later');
 Promise.resolve().then(()=>rejected.catch(reason=>console.log(reason)));
`));

test('Unhandled Promise rejection fails the host after draining jobs',()=>{
 for(const source of [`Promise.reject('unhandled');`,`Promise.reject(undefined);`]){
  const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
  assert.equal(run.error,undefined);
  assert.notEqual(run.status,0);
 }
});

test('Non-failing host rejection policy leaves Test262-style abandoned results alone',()=>{
 const run=runNative(linkPe(generate(compileToIR(`Promise.reject('abandoned');console.log('checked');`),{unhandledRejections:'ignore'})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'checked\n');
});

test('Bound Promise constructors use the earliest bound executor',()=>expectStress(`
 var first=Promise.bind(null,resolve=>resolve(8));
 var outer=first.bind(null,0);
 new outer(1).then(value=>console.log('value',value));
 var invalid=Promise.bind(null,1).bind(null,resolve=>resolve(2));
 try{new invalid()}catch(error){console.log(error.name)}
 var newTarget=(function(){}).bind(null);
 Object.defineProperty(newTarget,'prototype',{get(){throw new Error('prototype')}});
 try{Reflect.construct(invalid,[],newTarget)}catch(error){console.log(error.name)}
 try{Reflect.construct(first,[],newTarget)}catch(error){console.log(error.name)}
`));

test('Promise Symbol.species getter has native accessor metadata',()=>expectStress(`
 var getter=Object.getOwnPropertyDescriptor(Promise,Symbol.species).get;
 console.log(getter.name,getter.length,getter.prototype===undefined,Function.prototype.toString.call(getter).includes('[native code]'));
 console.log(Object.getOwnPropertyDescriptor(Promise,'prototype').writable);
`));

test('Proxy forwarding to Promise validates executor before newTarget prototype',()=>expectStress(`
 var Wrapped=new Proxy(new Proxy(Promise,{}),{});
 var newTarget=new Proxy(function(){},{get(target,key){if(key==='prototype'){console.log('prototype');return {}}return Reflect.get(target,key)}});
 try{Reflect.construct(Wrapped,[],newTarget)}catch(error){console.log(error.name)}
 try{Reflect.construct(Wrapped,[function(resolve){resolve(3)}],newTarget).then(value=>console.log('value',value))}catch(error){console.log(error.name)}
 var intercepted=new Proxy(Promise,{construct(){console.log('trap');return {}}});
 console.log(typeof Reflect.construct(intercepted,[],newTarget));
 var direct=new Proxy(Promise,{get(target,key,receiver){if(key==='prototype')console.log('direct prototype');return Reflect.get(target,key,receiver)}});
 try{new direct()}catch(error){console.log('direct',error.name)}
 var boundWrapped=new Proxy(Promise.bind(null,1),{});
 try{Reflect.construct(boundWrapped,[],newTarget)}catch(error){console.log('bound',error.name)}
`));
