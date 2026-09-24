import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
const cases=[
 'let f=1;f();','let C=1;new C();','new ({m(){}}).m();',
 'console.log(null.x);','let x=null;x.a=1;','delete undefined.x;','console.log("x" in 3);',
 'console.log(1 instanceof 3);','let F=function(){};F.prototype=3;console.log({} instanceof F);',
 'Object.keys(null);','Object.setPrototypeOf({},3);','let o={};Object.setPrototypeOf(o,o);',
 'Object.defineProperty({},"x",{get:3});','Object.defineProperty({},"x",{value:1,get:undefined});',
 'let o={};Object.defineProperty(o,"x",{});Object.defineProperty(o,"x",{value:1});',
 'Object.create(1);','Object.defineProperties(1,{});','Object.getOwnPropertyDescriptor(null,"x");',
 'console.log(+{valueOf(){return {};},toString(){return {};}});',
 'Function.prototype.call.call(3);','Function.prototype.apply.call(3,{});','Function.prototype.bind.call(3);',
 'let f=function(){};f.apply(null,1);','Function.prototype.toString.call({});',
 'Number.prototype.valueOf.call({});','String.prototype.toString.call(7);','Error.prototype.toString.call(null);',
 'console.log((1).toString(1));','let a=[];a.length=-1;','new Array(1.5);',
 'try{console.log(x);}finally{console.log("finally");}let x=1;',
 'const x=1;x=2;', 'delete globalThis.Object;Object();',
 'let o={m(){delete super.x;}};o.m();',
];
for(const body of cases)test('catch runtime error: '+body,()=>{
 const source='try{'+body+'}catch(e){console.log(e.name,e instanceof Error,typeof e.message);}console.log("alive");';
 const expected=runOracle(source);
 const result=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr.toString());assert.equal(result.stdout.toString(),expected.stdout);
});

for(const [name,source] of [
 ['intrinsic errors ignore overwritten constructor and inherited message setter', 'let C=TypeError;TypeError=function(){throw 1;};Object.defineProperty(C.prototype,"message",{set(v){throw 2;},configurable:true});try{let f=3;f();}catch(e){console.log(e instanceof C,e.hasOwnProperty("message"));}'],
 ['coercion type error cleans join guards', 'let a=[{toString(){return {};},valueOf(){return {};}}];try{a.join();}catch(e){console.log(e.name);}a[0]=7;console.log(a.join());'],
 ['descriptor failure leaves precise observable state', 'let a=[0,1,2];Object.defineProperty(a,1,{configurable:false});try{Object.defineProperty(a,"length",{value:0,writable:false});}catch(e){console.log(e.name,a.length,a[2],Object.getOwnPropertyDescriptor(a,"length").writable);}'],
 ['repeated errors preserve local and pending gc values', 'function f(){let keep={x:""+42};for(let i=0;i<100;i++){try{let n=1;n();}catch(e){let a={x:""+i};if(i===99)console.log(e.name,a.x,keep.x);}}}f();'],
] as const)test('runtime error state: '+name,()=>{
 const expected=runOracle(source);
 const result=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr.toString());assert.equal(result.stdout.toString(),expected.stdout);
});
