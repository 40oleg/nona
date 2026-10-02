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
import {linkHost} from './helpers/program.js';
const prefix='function show(o,k){let d=Object.getOwnPropertyDescriptor(o,k);if(d===undefined){console.log("missing");return;}console.log("value" in d,d.value,d.writable,"get" in d,typeof d.get,typeof d.set,d.enumerable,d.configurable);}';
const cases:[string,string][]=[
 ['defaults and return','let o={};console.log(Object.defineProperty(o,"x",{})===o);show(o,"x");o.x=3;console.log(o.x,delete o.x);'],
 ['partial descriptors preserve flags','let o={x:3};Object.defineProperty(o,"x",{value:7});show(o,"x");Object.defineProperty(o,"x",{});show(o,"x");'],
 ['nonconfigurable writable may change value and become readonly','let o={};Object.defineProperty(o,"x",{value:1,writable:true});Object.defineProperty(o,"x",{value:2,writable:false});o.x=3;show(o,"x");'],
 ['SameValue accepts NaN and identical object and strings','let o={},v={};Object.defineProperty(o,"n",{value:NaN});Object.defineProperty(o,"n",{value:0/0});Object.defineProperty(o,"x",{value:v});Object.defineProperty(o,"x",{value:v});Object.defineProperty(o,"s",{value:"a1"});Object.defineProperty(o,"s",{value:"a"+1});console.log(o.n,o.x===v,o.s);'],
 ['own definition bypasses inherited readonly','let p={};Object.defineProperty(p,"x",{value:1});let o={__proto__:p};Object.defineProperty(o,"x",{value:2});show(o,"x");'],
 ['accessor dispatch and descriptor flags','let p={};function g(){return this.n;}function s(v){this.n=v;}Object.defineProperty(p,"x",{get:g,set:s,enumerable:true});let o={__proto__:p,n:3};console.log(o.x,o.x=7,o.n);let d=Object.getOwnPropertyDescriptor(p,"x");console.log(d.get===g,d.set===s,d.enumerable,d.configurable);Object.defineProperty(p,"x",{get:g,set:s});'],
 ['configurable kind transitions reset old fields','let o={};Object.defineProperty(o,"x",{value:3,writable:true,enumerable:true,configurable:true});Object.defineProperty(o,"x",{get:function(){return 7;}});show(o,"x");console.log(o.x);Object.defineProperty(o,"x",{writable:true});show(o,"x");'],
 ['undefined accessor and generic update preserve kind','let o={};Object.defineProperty(o,"x",{get:undefined,configurable:true});Object.defineProperty(o,"x",{enumerable:true});show(o,"x");Object.defineProperty(o,"x",{value:undefined});show(o,"x");'],
 ['key then descriptor reads and current lookup','let o={x:1},d={},key={toString:function(){console.log("key");return "x";}};Object.defineProperty(d,"value",{get:function(){console.log("value");delete o.x;return 7;}});Object.defineProperty(o,key,d);show(o,"x");'],
 ['nested definition during descriptor getter and GC','let o={},d={};Object.defineProperty(d,"value",{get:function(){Object.defineProperty(o,"x",{value:7,writable:true});for(let i=0;i<20;i++){({s:""+i});}return 8;}});Object.defineProperty(o,"x",d);show(o,"x");'],
 ['callback retains target and earlier descriptor fields','let o={},d={value:{text:""+42}};Object.defineProperty(d,"writable",{get:function(){o=null;d.value=null;for(let i=0;i<20;i++){({s:""+i});}return true;}});let r=Object.defineProperty(o,"x",d);console.log(r.x.text);'],
 ['mapped arguments value and writable transitions','function f(a){Object.defineProperty(arguments,0,{value:7});console.log(a,arguments[0]);Object.defineProperty(arguments,0,{writable:false});a=9;console.log(a,arguments[0]);arguments[0]=11;show(arguments,0);}f(1);'],
 ['mapped arguments disconnect accessor and supplied readonly value','function f(a){Object.defineProperty(arguments,0,{get:function(){return 8;}});a=7;console.log(a,arguments[0]);}function g(a){Object.defineProperty(arguments,0,{value:5,writable:false});console.log(a,arguments[0]);a=9;console.log(a,arguments[0]);}f(1);g(2);'],
 ['global aliases value and readonly writes','var descriptorAlias=1;Object.defineProperty(globalThis,"descriptorAlias",{value:7,writable:false});descriptorAlias=9;globalThis.descriptorAlias=11;console.log(descriptorAlias,globalThis.descriptorAlias,descriptorAlias++);show(globalThis,"descriptorAlias");'],
 ['string compatible definitions','let s=new String("ab");console.log(Object.defineProperty(s,0,{value:"a"})===s);Object.defineProperty(s,"length",{});show(s,0);Object.defineProperty(s,2,{value:"c"});show(s,2);'],
 ['array indices grow length and sparse descriptors','let a=[];Object.defineProperty(a,3,{get:function(){return 7;},configurable:true});console.log(a.length,a[3]);Object.defineProperty(a,"4294967295",{value:8});console.log(a.length,a[4294967295]);a.length=0;console.log(a.length,a[3]);'],
 ['array readonly length blocks growth but permits in-range holes','let a=Array(3);Object.defineProperty(a,"length",{writable:false});a[4]=7;a.length={valueOf:function(){console.log("unexpected");return 1;}};Object.defineProperty(a,1,{value:8});show(a,"length");console.log(a[1],a[4]);'],
 ['array length numeric conversion twice and descriptor flags','let a=[1,2,3],n={valueOf:function(){console.log("number");return 1;}};Object.defineProperty(a,"length",{value:n,writable:false});show(a,"length");console.log(a[0],a[1],a[2]);'],
 ['array failed sloppy shrink stops at highest protected index','let a=[0,1,2,3,4,5];Object.defineProperty(a,2,{configurable:false});Object.defineProperty(a,4,{configurable:false});a.length=1;console.log(a.length,a.hasOwnProperty(5),a.hasOwnProperty(4),a.hasOwnProperty(3),a.hasOwnProperty(2));'],
 ['array conversion reentrancy sees latest length','let a=[1,2],n={valueOf:function(){a.length=5;return 3;}};Object.defineProperty(a,"length",{value:n});console.log(a.length,a[0],a[1]);'],
 ['legacy proto redefinable as ordinary descriptor','let old=Object.getOwnPropertyDescriptor(Object.prototype,"__proto__"),o={};Object.defineProperty(Object.prototype,"__proto__",{value:7,writable:true});console.log(o.__proto__);o.__proto__=8;console.log(o.__proto__,Object.getPrototypeOf(o)===Object.prototype);Object.defineProperty(Object.prototype,"__proto__",old);console.log(Object.getPrototypeOf({})===Object.prototype);'],
 ['builtin metadata can be redefined','Object.defineProperty(Number,"name",{value:"custom"});show(Number,"name");console.log(Object.defineProperty.name,Object.defineProperty.length,"prototype" in Object.defineProperty);'],
 ['inherited exotic readonly properties block assignment','let a=[];Object.defineProperty(a,"length",{writable:false});let o={__proto__:a};o.length=3;console.log(o.hasOwnProperty("length"),o.length);var inheritedAlias=1;Object.defineProperty(globalThis,"inheritedAlias",{writable:false});let child={__proto__:globalThis};child.inheritedAlias=7;console.log(child.hasOwnProperty("inheritedAlias"),child.inheritedAlias);'],
 ['inherited setter may handle an index beyond readonly length','let a=[],p={__proto__:Array.prototype};Object.defineProperty(p,3,{set:function(v){console.log("set",v,this===a);}});Object.setPrototypeOf(a,p);Object.defineProperty(a,"length",{writable:false});a[3]=7;console.log(a.length,a.hasOwnProperty(3));'],
];
function native(source:string){return runNative(linkHost(generate(lower(bind(parse(lex(prefix+source)))),{gcStress:true})));}
for(const [name,source] of cases)test('defineProperty: '+name,()=>{
 const run=native(source);assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(prefix+source).stdout);
});
for(const source of [
 'Object.defineProperty(3,{toString:function(){console.log("unexpected");return "x";}},{});',
 'Object.defineProperty({}, {toString:function(){console.log("key");return "x";}},3);',
 'let o={};Object.defineProperty(o,"x",{value:1});Object.defineProperty(o,"x",{value:2});',
 'let o={};Object.defineProperty(o,"x",{value:0});Object.defineProperty(o,"x",{value:-0});',
 'let o={};Object.defineProperty(o,"x",{});Object.defineProperty(o,"x",{configurable:true});',
 'let o={};Object.defineProperty(o,"x",{});Object.defineProperty(o,"x",{enumerable:true});',
 'let o={};Object.defineProperty(o,"x",{});Object.defineProperty(o,"x",{writable:true});',
 'let o={};Object.defineProperty(o,"x",{});Object.defineProperty(o,"x",{get:undefined});',
 'let o={};Object.defineProperty(o,"x",{get:function(){}});Object.defineProperty(o,"x",{get:function(){}});',
 'Object.defineProperty({},"x",{value:undefined,get:undefined});',
 'Object.defineProperty(new String("a"),0,{value:"b"});',
 'let a=[];Object.defineProperty(a,"length",{writable:false});Object.defineProperty(a,0,{value:7});',
 'Object.defineProperty([],"length",{value:1.5});',
 'Object.defineProperty([],"length",{get:function(){return 1;}});',
 'let a=[1,2];Object.defineProperty(a,1,{configurable:false});Object.defineProperty(a,"length",{value:0,writable:false});',
 'var aliasFixed=1;Object.defineProperty(globalThis,"aliasFixed",{get:function(){return 2;}});',
])test('defineProperty error: '+source,()=>{
 const run=native(source);assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
 const oracle=spawnSync(process.execPath,['-e',source],{encoding:'utf8',windowsHide:true,timeout:5000});assert.equal(oracle.status,1);assert.equal(run.stdout.toString(),oracle.stdout);
});
