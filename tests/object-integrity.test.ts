import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
const cases:[string,string][]=[
["repeat operations and descriptor transitions","let o={x:1};Object.seal(o);Object.seal(o);Object.defineProperty(o,\"x\",{writable:false});console.log(Object.isFrozen(o),Object.freeze(o)===o,Object.freeze(o)===o);"],
["sealed accessors are frozen even with setter","let o={},n=0;Object.defineProperty(o,\"x\",{configurable:true,set:function(v){n=v;}});Object.seal(o);console.log(Object.isFrozen(o));o.x=7;console.log(n);"],
["frozen prototype remains inherited and shallow","let p={x:1},o=Object.create(p);Object.freeze(o);p.x=8;o.x=4;console.log(o.x,Object.isFrozen(o),Object.isFrozen(p));"],
["nonextensible delete cannot be readded","let o={x:1};Object.preventExtensions(o);console.log(delete o.x,Object.isFrozen(o));o.x=3;console.log(o.x,Object.keys(o).length);"],
["global aliases readonly after freeze","var integrityGlobal=1;Object.freeze(globalThis);integrityGlobal=9;globalThis.integrityGlobal=8;console.log(integrityGlobal,Object.getOwnPropertyDescriptor(globalThis,\"integrityGlobal\").writable,Object.isFrozen(globalThis));"],
["global aliases writable after seal","var integrityGlobal=1;Object.seal(globalThis);integrityGlobal=9;console.log(integrityGlobal,Object.isSealed(globalThis),Object.isFrozen(globalThis));"],
["frozen array custom properties","let a=[];a.x=1;Object.freeze(a);a.x=3;console.log(a.x,Object.isFrozen(a),Object.isSealed(a));"],
["queries do not call proxy-like ordinary hooks","let o={valueOf:function(){console.log(\"unexpected\");return 1;},toString:function(){console.log(\"unexpected\");return \"x\";}};console.log(Object.isExtensible(o));Object.freeze(o);console.log(Object.isFrozen(o));"],
 [
  "prevent extension preserves existing writes",
  "let o={a:1};console.log(Object.isExtensible(o),Object.preventExtensions(o)===o,Object.isExtensible(o));o.b=2;o.a=3;console.log(o.a,o.b,delete o.a,Object.keys(o).length);"
 ],
 [
  "empty integrity levels",
  "let o={};console.log(Object.isSealed(o),Object.isFrozen(o));Object.preventExtensions(o);console.log(Object.isSealed(o),Object.isFrozen(o));"
 ],
 [
  "sealed data stays writable",
  "let o={x:1};console.log(Object.seal(o)===o,Object.isSealed(o),Object.isFrozen(o),delete o.x);o.x=4;o.y=3;console.log(o.x,o.y,Object.getOwnPropertyDescriptor(o,\"x\").configurable);"
 ],
 [
  "freeze data and shallow references",
  "let o={x:1,nested:{x:2}};console.log(Object.freeze(o)===o,Object.isFrozen(o),Object.isSealed(o));o.x=9;o.nested.x=7;console.log(o.x,o.nested.x,delete o.x);"
 ],
 [
  "accessors remain callable and uninvoked during integrity operations",
  "let n=0,o={};Object.defineProperty(o,\"x\",{configurable:true,get:function(){n++;return n;},set:function(v){n=v;}});Object.freeze(o);console.log(n,Object.isFrozen(o),n);o.x=7;console.log(o.x,n);"
 ],
 [
  "nonconfigurable readonly becomes frozen after preventExtensions",
  "let o={};Object.defineProperty(o,\"x\",{value:1});console.log(Object.isFrozen(o));Object.preventExtensions(o);console.log(Object.isFrozen(o),Object.isSealed(o));"
 ],
 [
  "nonextensible prototype identity accepted",
  "let p={},o=Object.create(p);Object.preventExtensions(o);console.log(Object.setPrototypeOf(o,p)===o);o.__proto__=p;console.log(Object.getPrototypeOf(o)===p);"
 ],
 [
  "nonextensible inherited setter",
  "let n=0,p={};Object.defineProperty(p,\"x\",{set:function(v){n=v;}});let o=Object.create(p);Object.preventExtensions(o);o.x=8;console.log(n,Object.prototype.hasOwnProperty.call(o,\"x\"));"
 ],
 [
  "sealed sparse array length remains writable",
  "let a=[1,,3];Object.seal(a);a[1]=2;a[0]=9;a.length=1;console.log(a.join(\"|\"),a.length,Object.isSealed(a),Object.isFrozen(a));"
 ],
 [
  "frozen array readonly length avoids coercion",
  "let a=[1,,3];Object.freeze(a);a.length={valueOf:function(){console.log(\"unexpected\");return 9;}};a[0]=4;a[1]=2;console.log(a.join(\"|\"),a.length,Object.isFrozen(a),Object.getOwnPropertyDescriptor(a,\"length\").writable);"
 ],
 [
  "nonextensible array can grow length but cannot fill holes",
  "let a=[1];Object.preventExtensions(a);a.length=4;a[2]=3;console.log(a.length,Object.keys(a).join(\"|\"),Object.isSealed(a));"
 ],
 [
  "string boxes synthetic descriptors",
  "let s=new String(\"ab\");Object.preventExtensions(s);console.log(Object.isSealed(s),Object.isFrozen(s));s.x=1;console.log(s.x,Object.freeze(s)===s,Object.getOwnPropertyNames(s).join(\"|\"));"
 ],
 [
  "sealed arguments keeps parameter mapping",
  "function f(a){Object.seal(arguments);a=8;console.log(arguments[0],Object.isFrozen(arguments),Object.isSealed(arguments));arguments[0]=9;console.log(a);}f(1);"
 ],
 [
  "frozen arguments disconnects mapping",
  "function f(a){Object.freeze(arguments);a=8;arguments[0]=9;console.log(a,arguments[0],Object.isFrozen(arguments));}f(1);"
 ],
 [
  "frozen source and bound functions remain callable",
  "function f(a){return a+1;}Object.freeze(f);let b=f.bind(null,3);Object.freeze(b);console.log(f(2),b(),Object.isFrozen(f),Object.isFrozen(b));"
 ],
 [
  "sealed null prototype object",
  "let o=Object.create(null);o.x=1;Object.seal(o);console.log(Object.isSealed(o),Object.getPrototypeOf(o),Object.keys(o).join(\"|\"));"
 ],
 [
  "static builtin roots survive integrity changes",
  "let f=Object.freeze;f.keep={x:7};Object.freeze(f);for(let i=0;i<20;i++){({x:\"\"+i});}console.log(f.keep.x,Object.isFrozen(f));"
 ],
 [
  "metadata",
  "console.log(Object.freeze.length,Object.seal.name,Object.isExtensible.length,\"prototype\" in Object.preventExtensions);"
 ],
 [
  "primitive undefined",
  "let x=undefined;console.log(Object.preventExtensions(x)===x,Object.seal(x)===x,Object.freeze(x)===x,Object.isExtensible(x),Object.isSealed(x),Object.isFrozen(x));"
 ],
 [
  "primitive null",
  "let x=null;console.log(Object.preventExtensions(x)===x,Object.seal(x)===x,Object.freeze(x)===x,Object.isExtensible(x),Object.isSealed(x),Object.isFrozen(x));"
 ],
 [
  "primitive true",
  "let x=true;console.log(Object.preventExtensions(x)===x,Object.seal(x)===x,Object.freeze(x)===x,Object.isExtensible(x),Object.isSealed(x),Object.isFrozen(x));"
 ],
 [
  "primitive 3",
  "let x=3;console.log(Object.preventExtensions(x)===x,Object.seal(x)===x,Object.freeze(x)===x,Object.isExtensible(x),Object.isSealed(x),Object.isFrozen(x));"
 ],
 [
  "primitive \"ab\"",
  "let x=\"ab\";console.log(Object.preventExtensions(x)===x,Object.seal(x)===x,Object.freeze(x)===x,Object.isExtensible(x),Object.isSealed(x),Object.isFrozen(x));"
 ]
];
function native(source:string){return runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));}
for(const [name,source] of cases)test('Object integrity: '+name,()=>{const r=native(source);assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stdout.toString(),runOracle(name==='global aliases readonly after freeze'||name==='global aliases writable after seal'?'const vm=require("node:vm");const c=vm.createContext(vm.constants.DONT_CONTEXTIFY);c.console=console;vm.runInContext('+JSON.stringify(source)+',c);':source).stdout);});
for(const source of ["let o=Object.preventExtensions({});Object.defineProperty(o,\"x\",{value:1});","let o=Object.preventExtensions({});Object.setPrototypeOf(o,null);","let o=Object.preventExtensions({});o.__proto__={};","let o=Object.freeze({x:1});Object.defineProperty(o,\"x\",{value:2});","let a=Object.freeze([1]);Object.defineProperty(a,\"length\",{value:0});","let o=Object.seal({x:1});Object.defineProperty(o,\"x\",{get:function(){return 3;}});"])test('Object integrity error: '+source,()=>{const r=native(source);assert.equal(r.error,undefined);assert.equal(r.status,1);assert.match(r.stderr.toString(),/Nona runtime error/);const n=spawnSync(process.execPath,['-e',source],{encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(n.status,1);assert.equal(r.stdout.toString(),n.stdout);});
