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
