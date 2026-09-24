import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {runNative} from './helpers/native.js';

const cases:[string,string][]=[
 ['object truthiness is a normalized boolean','console.log(!{},![],!!{},!![]);'],
 ['assignment coerces mutable object key at write','let k=[1],o={};o[k]=(k[0]=2);console.log(o[1],o[2]);'],
 ['compound coerces mutable object key for read and write','let k=[1],o={1:3,2:4};o[k]+=(k[0]=2);console.log(o[1],o[2]);'],
 ['noncallable join falls back to object tag','let a=[1,2];a.join=0;console.log(""+a);'],
 ['deleted array toString falls back to object method','let a=[1];a.__proto__.toString=7;delete a.__proto__.toString;console.log(""+a);'],
 ['array inherited coercion and generic join','let p=[1];let o={__proto__:p,0:7,1:8,length:2};console.log(""+o);p.__proto__={}.__proto__;console.log(""+p);'],
 ['object identity and aliasing','let o={x:2};let p=o;p.x+=3;console.log(o.x,p===o,typeof o,o=={},!!o);'],
 ['computed shorthand and keyword keys','let x=3;let o={x,["a"+x]:4,default:5,"a b":6,2:7,};console.log(o.x,o.a3,o.default,o["a b"],o[2]);'],
 ['nested members and returned objects','function make(x){return {a:{x:x}};}let a=make(3);let b=make(4);console.log(a.a.x,b.a.x,a===b);'],
 ['member assignment order','let o={x:1},p=o;function key(){console.log("key");return "x";}function rhs(){o={x:90};console.log("rhs");return 4;}p[key()]+=rhs();console.log(p.x,o.x);'],
 ['member update coercion','let o={x:"2"};console.log(o.x++,++o.x,o.x);'],
 ['array holes length and deletion','let a=[1,,3,];console.log(a.length,a[1],1 in a,2 in a);console.log(delete a[2],a.length,2 in a);a[6]=9;console.log(a.length,a[6]);'],
 ['array shrink and regrow','let a=[1,2,3,4];a.length=2;console.log(a.length,a[2],2 in a);a.length=4;console.log(a[2],a.length,2 in a);a[3]=8;console.log(a[3]);'],
 ['array canonical and noncanonical indices','let a=[];a["01"]=1;a[-1]=2;a[4294967295]=3;console.log(a.length,a["01"],a[-1],a[4294967295]);a[4294967294]=4;console.log(a.length,a[4294967294]);a.length=0;console.log(a[4294967294],a[4294967295]);'],
 ['prototype literal and own delete','let p={x:2};let o={__proto__:p,y:3};console.log(o.x,"x" in o,o.__proto__===p);o.x=8;console.log(o.x,p.x);delete o.x;console.log(o.x);'],
 ['null prototype literal','let o={__proto__:null,x:3};console.log(o.x,o.__proto__,"__proto__" in o);'],
 ['primitive string index and length','let s="A😀";console.log(s.length,s[0],s[3],s["01"]);s[0]="B";s.length=99;console.log(s[0],s.length,delete s[0],delete s.length,delete s[8]);'],
 ['primitive boxing misses','console.log((3).x,true.x);let x=3;x.p=2;console.log(x.p,delete x.p);'],
 ['object numeric and default string coercion','let o={};console.log(o+"!",+o,o=="[object Object]",o===o);'],
 ['array primitive coercion','console.log(""+[1,null,undefined,,[2,3]],+[4],+[],[1]==1,[1]===1,[2]<[10]);'],
 ['cyclic array stringification','let a=[1];a[1]=a;console.log(""+a);'],
 ['const object properties remain writable','const o={a:1};o.a=2;console.log(o.a);'],
 ['prototype accessor can be deleted and replaced','let p={}.__proto__;console.log(delete p.__proto__,"__proto__" in {});p.__proto__=7;let o={};console.log(o.__proto__);delete p.__proto__;console.log(o.__proto__);'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));
// The oracle console shim itself uses Array.prototype.join.
test('deleted array join stays deleted',()=>expectProgram('let a=[1];delete a.__proto__.join;console.log(""+a);','[object Array]\n'));

for(const source of [
 'let a=[];a.length=-1;', 'let a=[];a.length=1.5;',
 'let a=[];a.length=4294967296;', 'let a=[];a.length=NaN;',
 'console.log(null.x);', 'undefined.x=1;', 'delete null.x;',
 'console.log("x" in 1);', 'let a={};a.__proto__=a;',
 'let a=[1];a.__proto__=null;console.log(""+a);',
 'console.log(""+{toString:1});',
 'let o={};delete o.__proto__.toString;console.log(""+o);',
])test(`object runtime rejects: ${source}`,()=>{
 const result=compile(source,{fileName:'invalid-object.js',target:'win32-x64'});
 assert.equal(result.ok,true);if(!result.ok)return;
 const run=runNative(result.image);
 assert.equal(run.error,undefined);assert.equal(run.status,1);
 assert.match(run.stderr.toString(),/Nona runtime error/);
});
