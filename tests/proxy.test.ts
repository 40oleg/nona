import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';

 test('Proxy get, has and delete traps, invariants and revocation survive GC stress',()=>{
 const source=`let target={x:4},handler={get:function(t,k,r){for(let i=0;i<30;i++)({v:i});return t[k]+5}};
 let p=new Proxy(target,handler);console.log(p.x,Reflect.get(p,'x'));
 Object.defineProperty(target,'x',{value:4,writable:false,configurable:false});
 try{console.log(p.x)}catch(e){console.log(e.name)}
 let rev=Proxy.revocable({y:7},{});console.log(rev.proxy.y);rev.revoke();
 try{console.log(rev.proxy.y)}catch(e){console.log(e.name)}
 let own={z:2},hasProxy=new Proxy(own,{has:function(t,k){return false}});
 console.log('z' in hasProxy);Object.defineProperty(own,'z',{configurable:false});
 try{console.log('z' in hasProxy)}catch(e){console.log(e.name)}
 let deleted={a:1},deleteProxy=new Proxy(deleted,{deleteProperty:function(t,k){for(let i=0;i<20;i++)({v:i});return true}});
 console.log(delete deleteProxy.a,deleted.a,Reflect.deleteProperty(deleteProxy,'a'));
 Object.defineProperty(deleted,'a',{configurable:false});
 try{console.log(delete deleteProxy.a)}catch(e){console.log(e.name)}
 let delRev=Proxy.revocable({q:1},{});delRev.revoke();
 try{console.log(Reflect.deleteProperty(delRev.proxy,'q'))}catch(e){console.log(e.name)}`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('Proxy isExtensible trap and target invariant survive GC stress',()=>{
 const source=`let target={x:1};let p=new Proxy(target,{isExtensible:function(t){for(let i=0;i<20;i++)({v:i});return true}});
 console.log(Object.isExtensible(p),Reflect.isExtensible(p));
 Object.preventExtensions(target);
 try{console.log(Object.isExtensible(p))}catch(e){console.log(e.name)}
 let inner=new Proxy(target,{}),outer=new Proxy(inner,{isExtensible:function(){return false}});
 console.log(Object.isExtensible(outer));
 let rev=Proxy.revocable({},{});rev.revoke();try{console.log(Object.isExtensible(rev.proxy))}catch(e){console.log(e.name)}`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('Proxy preventExtensions trap and Reflect boolean result survive GC stress',()=>{
 const source=`let t={x:1},p=new Proxy(t,{preventExtensions:function(target){for(let i=0;i<20;i++)({v:i});return false}});
 console.log(Reflect.preventExtensions(p),Object.isExtensible(t));
 try{Object.preventExtensions(p)}catch(e){console.log(e.name)}
 let q=new Proxy(t,{preventExtensions:function(target){Object.preventExtensions(target);return true}});
 console.log(Reflect.preventExtensions(q),Object.isExtensible(t));
 let nested=new Proxy(q,{});console.log(Reflect.preventExtensions(nested));
 let rev=Proxy.revocable({},{});rev.revoke();try{Reflect.preventExtensions(rev.proxy)}catch(e){console.log(e.name)}`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('Proxy getPrototypeOf trap and instanceof survive GC stress',()=>{
 const source=`function C(){};let target={},p=new Proxy(target,{getPrototypeOf:function(){for(let i=0;i<20;i++)({v:i});return C.prototype}});
 console.log(Object.getPrototypeOf(p)===C.prototype,Reflect.getPrototypeOf(p)===C.prototype,p instanceof C);
 Object.preventExtensions(target);try{console.log(Object.getPrototypeOf(p))}catch(e){console.log(e.name)}
 let q=new Proxy(target,{});console.log(Object.getPrototypeOf(q)===Object.prototype);
 let rev=Proxy.revocable({},{});rev.revoke();try{Object.getPrototypeOf(rev.proxy)}catch(e){console.log(e.name)}`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('Proxy setPrototypeOf trap, invariants and Reflect result survive GC stress',()=>{
 const source=`let target={},proto={},p=new Proxy(target,{setPrototypeOf:function(t,v){for(let i=0;i<20;i++)({v:i});return false}});
 console.log(Reflect.setPrototypeOf(p,proto));try{Object.setPrototypeOf(p,proto)}catch(e){console.log(e.name)}
 let q=new Proxy(target,{setPrototypeOf:function(){return true}});console.log(Reflect.setPrototypeOf(q,proto));
 Object.preventExtensions(target);try{Reflect.setPrototypeOf(q,proto)}catch(e){console.log(e.name)}
 let rev=Proxy.revocable({},{});rev.revoke();try{Reflect.setPrototypeOf(rev.proxy,null)}catch(e){console.log(e.name)}`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('Proxy get forwarding preserves receiver through nested proxies',()=>{
 const source=`let target={get attr(){for(let i=0;i<20;i++)({v:i});return this}};
 let p=new Proxy(target,{get:null}),q=new Proxy(p,{});
 console.log(p.attr===p,q.attr===q);
 let seen;let trapped=new Proxy(q,{get:function(t,k,r){seen=r;return Reflect.get(t,k,r)}});
 console.log(trapped.attr===trapped,seen===trapped)`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('Inherited Proxy get and has respect ordinary own properties',()=>{
 const source=`let target={get x(){for(let i=0;i<20;i++)({v:i});return this}};
 let p=new Proxy(target,{has:function(t,k){return false}}),child=Object.create(p);
 console.log(child.x===child,'x' in child);
 Object.defineProperty(child,'x',{value:3});console.log(child.x,'x' in child);
 let a=Object.create(new Proxy({foo:7},{get:function(t,k,r){return r===a?11:0},has:function(){return true}}));
 console.log(a.foo,'bar' in a);
 let b=Object.create(new Proxy({},{get:function(){throw new Error('get')},has:function(){throw new Error('has')}}));
 Object.defineProperty(b,'foo',{value:9});console.log(b.foo,'foo' in b);
 let arr=[];Object.setPrototypeOf(arr,new Proxy({x:1},{}));console.log(arr.length,'x' in arr)`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('Proxy ownKeys ordering and invariants survive GC stress',()=>{
 const source=`let t={a:1,b:2},p=new Proxy(t,{ownKeys:function(){for(let i=0;i<20;i++)({v:i});return ['b','a','extra']}});
 console.log(Reflect.ownKeys(p).join(','),Object.keys(p).join(','));
 Object.defineProperty(t,'a',{configurable:false});
 try{Reflect.ownKeys(new Proxy(t,{ownKeys:function(){return ['b']}}))}catch(e){console.log(e.name)}
 try{Reflect.ownKeys(new Proxy(t,{ownKeys:function(){return ['a','a']}}))}catch(e){console.log(e.name)}
 Object.preventExtensions(t);try{Reflect.ownKeys(p)}catch(e){console.log(e.name)}
 let nested=new Proxy(new Proxy({x:1},{}),{});console.log(Reflect.ownKeys(nested).join(','));
 let rev=Proxy.revocable({},{});rev.revoke();try{Reflect.ownKeys(rev.proxy)}catch(e){console.log(e.name)}`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('Proxy getOwnPropertyDescriptor trap and invariants survive GC stress',()=>{
 const source=`let target={x:1},p=new Proxy(target,{getOwnPropertyDescriptor:function(t,k){for(let i=0;i<20;i++)({v:i});return {value:3,writable:true,enumerable:true,configurable:true}}});
 console.log(Object.getOwnPropertyDescriptor(p,'x').value,Object.keys(p).join(','));
 let absent=new Proxy(target,{getOwnPropertyDescriptor:function(){return undefined}});
 console.log(Object.getOwnPropertyDescriptor(absent,'x')===undefined);
 Object.defineProperty(target,'x',{configurable:false});
 try{Object.getOwnPropertyDescriptor(absent,'x')}catch(e){console.log(e.name)}
 let q=new Proxy(target,{getOwnPropertyDescriptor:function(){return {value:2,writable:true,enumerable:true,configurable:false}}});
 console.log(Object.getOwnPropertyDescriptor(q,'x').value);
 let rev=Proxy.revocable({},{});rev.revoke();try{Object.getOwnPropertyDescriptor(rev.proxy,'x')}catch(e){console.log(e.name)}`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('Proxy set trap and frozen target invariant survive GC stress',()=>{
 const source=`let target={x:1},seen=[];let p=new Proxy(target,{set:function(t,k,v,r){for(let i=0;i<20;i++)({v:i});seen.push(t===target,k,v,r===p);return true}});
 p.x=2;console.log(seen.join(','),target.x);
 Object.defineProperty(target,'x',{writable:false,configurable:false});
 try{p.x=3}catch(e){console.log(e.name)}
 let q=new Proxy({},{set:function(){return false}});try{q.x=1}catch(e){console.log(e.name)}
 console.log(Reflect.set(q,'x',2),Reflect.set(p,'x',1));
 let receiver={},explicit=new Proxy({},{set:function(t,k,v,r){return r===receiver}});
 console.log(Reflect.set(explicit,'y',3,receiver));
 let nested=new Proxy(new Proxy({},{set:function(t,k,v,r){return r===nested}}),{});
 console.log(Reflect.set(nested,'z',4));
 let f=new Proxy({},{set:null});f.x=4;console.log(f.x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('Proxy defineProperty trap and set forwarding survive GC stress',()=>{
 const source=`let target={},seen=[],p=new Proxy(target,{defineProperty:function(t,k,d){for(let i=0;i<20;i++)({v:i});seen.push(k,d.value,d.configurable);return true}});
 Object.defineProperty(p,'x',{value:3,configurable:true});console.log(seen.join(','),Object.getOwnPropertyDescriptor(target,'x')===undefined);
 console.log(Reflect.defineProperty(new Proxy({},{defineProperty:function(){return false}}),'x',{value:1}));
 console.log(Reflect.defineProperty(new Proxy({},{defineProperty:function(){return true}}),'omitted',{}));
 Object.preventExtensions(target);try{Object.defineProperty(p,'new',{value:1,configurable:true})}catch(e){console.log(e.name)}
 let keys=[],q=new Proxy({x:1},{getOwnPropertyDescriptor:function(t,k){keys.push('get');return Reflect.getOwnPropertyDescriptor(t,k)},defineProperty:function(t,k,d){keys.push('define');return Reflect.defineProperty(t,k,d)}});
 q.x=2;console.log(q.x,keys.join(','));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('Callable Proxy apply and nested forwarding survive GC stress',()=>{
 const source=`let target=function(a,b){return this.base+a+b},seen=[],p=new Proxy(target,{apply:function(t,r,args){for(let i=0;i<20;i++)({v:i});seen.push(t===target,r.base,args.join(','));return 9}});
 console.log(typeof p,p.call({base:3},1,2),seen.join('|'));
 let nested=new Proxy(new Proxy(target,{}),{});console.log(Reflect.apply(nested,{base:4},[5,6]));
 let rev=Proxy.revocable(target,{});rev.revoke();try{rev.proxy()}catch(e){console.log(e.name)}
 console.log(typeof new Proxy({},{}));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('Proxy construct trap, newTarget and nested forwarding survive GC stress',()=>{
 const source=`let Target=function(x){this.x=x},seen=[],p=new Proxy(Target,{construct:function(t,args,n){for(let i=0;i<20;i++)({v:i});seen.push(t===Target,args[0],n===p);return {value:args[0]}}});
 console.log((new p(3)).value,seen.join(','));
 let nested=new Proxy(new Proxy(Target,{}),{});console.log((new nested(4)).x);
 class Base{constructor(x){this.x=x}}class Child extends Base{get marker(){return 7}}
 let nestedClass=new Proxy(new Proxy(Base,{}),{}),instance=Reflect.construct(nestedClass,[6],Child);
 console.log(instance instanceof Child,instance.x,instance.marker);
 let Other=function(){};console.log(Reflect.construct(p,[5],Other).value);
 let bad=new Proxy(Target,{construct:function(){return 1}});try{new bad()}catch(e){console.log(e.name)}
 let rev=Proxy.revocable(Target,{});rev.revoke();try{new rev.proxy()}catch(e){console.log(e.name)}`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('Reflect.set reaches an inherited Proxy set trap and preserves receiver',()=>{
 const source=`let seen=[],target=new Proxy({},{set(t,k,v,r){for(let i=0;i<20;i++)({i});seen.push(k,v,r===other);return k==='foo'}});
 let child=Object.create(target),other={};console.log(Reflect.set(child,'foo',3,other),Reflect.set(child,'bar',4,other),seen.join('|'));
 let conversions=0,key={toString(){conversions++;return 'foo'}};console.log(Reflect.set(child,key,6,other),conversions,seen.length);
 Object.defineProperty(child,'own',{value:1,writable:true,configurable:true});console.log(Reflect.set(child,'own',5),child.own,seen.length);
 let array=[];Object.setPrototypeOf(array,target);console.log(Reflect.set(array,'length',2),array.length,seen.length);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('Proxy construct trap does not read newTarget prototype before trap',()=>{
 const source=`let seen=[],Target=function(){};
 let proxy=new Proxy(Target,{
  get(target,key,receiver){if(key==='prototype')seen.push('prototype');return Reflect.get(target,key,receiver)},
  construct(target,args,newTarget){seen.push('construct');return {ok:1}}
 });
 let result=new proxy();console.log(result.ok,seen.join(','));
 let newTarget=(function(){}).bind(null);
 Object.defineProperty(newTarget,'prototype',{get(){seen.push('newTarget prototype');return {}},configurable:true});
 seen=[];console.log(Reflect.construct(proxy,[],newTarget).ok,seen.join(','));
 let forwarded=new Proxy(Target,{get(target,key,receiver){if(key==='prototype')seen.push('forward prototype');return Reflect.get(target,key,receiver)}});
 seen=[];console.log(new forwarded() instanceof Target,seen.join(','));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
