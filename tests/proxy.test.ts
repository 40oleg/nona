import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';

 test('Proxy get and has traps, invariants and revocation survive GC stress',()=>{
 const source=`let target={x:4},handler={get:function(t,k,r){for(let i=0;i<30;i++)({v:i});return t[k]+5}};
 let p=new Proxy(target,handler);console.log(p.x,Reflect.get(p,'x'));
 Object.defineProperty(target,'x',{value:4,writable:false,configurable:false});
 try{console.log(p.x)}catch(e){console.log(e.name)}
 let rev=Proxy.revocable({y:7},{});console.log(rev.proxy.y);rev.revoke();
 try{console.log(rev.proxy.y)}catch(e){console.log(e.name)}
 let own={z:2},hasProxy=new Proxy(own,{has:function(t,k){return false}});
 console.log('z' in hasProxy);Object.defineProperty(own,'z',{configurable:false});
 try{console.log('z' in hasProxy)}catch(e){console.log(e.name)}`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.error,undefined);
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
