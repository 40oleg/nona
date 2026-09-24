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
 ['own versus inherited','let p={x:1},o={__proto__:p,y:2};console.log(o.hasOwnProperty("x"),o.hasOwnProperty("y"),o.propertyIsEnumerable("x"),o.propertyIsEnumerable("y"),o.hasOwnProperty("missing"));'],
 ['array and string special properties','let a=[1,,3],h=Object.prototype.hasOwnProperty,e=Object.prototype.propertyIsEnumerable;console.log(h.call(a,"length"),e.call(a,"length"),h.call(a,0),h.call(a,1),e.call(a,2));console.log(h.call("ab","length"),e.call("ab","length"),h.call("ab",1),e.call("ab",1),h.call("ab",2),h.call(3,"constructor"));'],
 ['function and prototype metadata attributes','function f(){}console.log(f.hasOwnProperty("prototype"),f.propertyIsEnumerable("prototype"),f.hasOwnProperty("name"),f.propertyIsEnumerable("name"),Object.prototype.hasOwnProperty("__proto__"),Object.prototype.propertyIsEnumerable("__proto__"));'],
 ['mapped arguments own attributes','function f(a){console.log(arguments.hasOwnProperty(0),arguments.propertyIsEnumerable(0),arguments.hasOwnProperty("length"),arguments.propertyIsEnumerable("length"));delete arguments[0];console.log(arguments.hasOwnProperty(0));}f(1);'],
 ['global aliases and builtin attributes','var x=3;console.log(this.hasOwnProperty("x"),this.propertyIsEnumerable("x"),this.hasOwnProperty("Number"),this.propertyIsEnumerable("Number"));'],
 ['key callback runs before own lookup and survives GC','let o={x:1},k={toString:function(){delete o.x;o.y={text:""+42};for(let i=0;i<20;i++){({text:""+i});}return "y";}};console.log(o.hasOwnProperty(k),o.propertyIsEnumerable(k),o.y.text);'],
 ['getPrototypeOf boxes primitives','console.log(Object.getPrototypeOf({})===Object.prototype,Object.getPrototypeOf([])===Array.prototype,Object.getPrototypeOf(3)===Number.prototype,Object.getPrototypeOf("x")===String.prototype,Object.getPrototypeOf(false)===Boolean.prototype,Object.getPrototypeOf(Object.prototype));'],
 ['setPrototypeOf returns target and handles primitives','let p={x:7},o={};console.log(Object.setPrototypeOf(o,p)===o,o.x,Object.getPrototypeOf(o)===p,Object.setPrototypeOf(3,null),Object.setPrototypeOf("x",{}));Object.setPrototypeOf(o,null);console.log(Object.getPrototypeOf(o),o.x);'],
 ['isPrototypeOf chain and nonobject shortcuts','let p={},o={__proto__:p},c={__proto__:o},f=Object.prototype.isPrototypeOf;console.log(p.isPrototypeOf(c),o.isPrototypeOf(c),c.isPrototypeOf(c),f.call(null,3),f.call(3,{}),Object.prototype.isPrototypeOf([]));'],
 ['SameValue numbers and values','let o={};console.log(Object.is(NaN,NaN),Object.is(0,-0),Object.is(-0,-0),Object.is(1,1),Object.is(1,2),Object.is(o,o),Object.is({},{}),Object.is("x",""+"x"),Object.is(),Object.is(undefined,null));'],
 ['SameValue never coerces objects','let o={valueOf:function(){console.log("unexpected");return 1;}};console.log(Object.is(o,1),Object.is(o,o));'],
 ['toLocaleString invokes custom toString with receiver','let o={x:7,toString:function(){return this.x;}},t=Object.prototype.toLocaleString;console.log(t.call(o),t.call(12),t.call("abc"));o.toString=function(){return this;};console.log(t.call(o)===o);'],
 ['toLocaleString callback GC','let o={text:""+42,toString:function(){let old=this;o=null;this.toString=null;for(let i=0;i<20;i++){({text:""+i});}return old.text;}};console.log(o.toLocaleString());'],
 ['metadata and chaining','console.log(Object.is.name,Object.is.length,Object.setPrototypeOf.length,Object.prototype.hasOwnProperty.length,Object.prototype.toLocaleString.length,Object.is.toString(),"prototype" in Object.is);'],
];
for(const [name,source] of cases)test('Object inspection: '+name,()=>{
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
for(const source of [
 'Object.getPrototypeOf(null);','Object.setPrototypeOf(3,4);','let n=null;Object.setPrototypeOf(n,n);',
 'let o={};Object.setPrototypeOf(o,o);','Object.setPrototypeOf(Object.prototype,{});',
 'Object.prototype.hasOwnProperty.call(null,{toString:function(){console.log("key");return "x";}});',
 'Object.prototype.propertyIsEnumerable.call(null,{toString:function(){console.log("key");return "x";}});',
 'Object.prototype.isPrototypeOf.call(null,{});','Object.prototype.toLocaleString.call({toString:3});',
])test('Object inspection error: '+source,()=>{
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
 const oracle=spawnSync(process.execPath,['-e',source],{encoding:'utf8',timeout:5000,windowsHide:true});
 assert.equal(oracle.error,undefined);assert.equal(oracle.status,1);assert.equal(run.stdout.toString(),oracle.stdout);
});
