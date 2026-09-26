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

const cases:[string,string][]=[
 ['Object identity boxing and nullish','let o={x:7};console.log(Object(o)===o,new Object(o)===o,Object().toString(),new Object(null).toString(),Object(3).valueOf(),Object("ab").length);'],
 ['primitive call conversions and defaults','console.log(Boolean(),Boolean(0),Boolean(""),Boolean({}),Number(),Number(undefined),Number(null),Number("0x10"),String(),String(undefined),String(null));'],
 ['wrapper construction has brands and prototypes','let b=new Boolean(false),n=new Number("12"),s=new String("abc");console.log(typeof b,Boolean(b),b.valueOf(),n+1,s[1],s.length,b instanceof Boolean,n instanceof Number,s instanceof String);'],
 ['default wrapper construction','console.log(new Boolean().valueOf(),new Number().valueOf(),new String().valueOf(),1/new Number(-0).valueOf());'],
 ['Array numeric length versus elements','let a=Array(3),b=new Array("3"),c=Array(1,2,3);console.log(a.length,0 in a,a.join("|"),b.length,b[0],c.join("/"),Array().length,new Array(-0).length);'],
 ['Array single objects are elements','let v={valueOf:function(){console.log("unexpected");return 3;}};let a=Array(v);console.log(a.length,a[0]===v,Array(undefined)[0],Array(null)[0]);'],
 ['constructor and prototype links','console.log(Object.prototype.constructor===Object,Array.prototype.constructor===Array,Boolean.prototype.constructor===Boolean,Number.prototype.constructor===Number,String.prototype.constructor===String,Function.prototype.constructor===Function);console.log((function(){}).constructor===Function,Object.constructor===Function);'],
 ['constructor metadata and native text','console.log(Object.name,Array.name,Boolean.name,Number.name,String.name,Function.name,Object.length,Array.length,Number.length,Object.toString(),Number.toString());'],
 ['Number constants','console.log(Number.MAX_VALUE,Number.MIN_VALUE,Number.NaN,Number.NEGATIVE_INFINITY,Number.POSITIVE_INFINITY,Number.EPSILON,Number.MAX_SAFE_INTEGER,Number.MIN_SAFE_INTEGER);let d=Object.getOwnPropertyDescriptor(Number,"POSITIVE_INFINITY");console.log(d.writable,d.enumerable,d.configurable);'],
 ['builtin prototype properties are immutable','let p=Number.prototype;Number.prototype={};console.log(Number.prototype===p,delete Number.prototype,new Number(2) instanceof Number);'],
 ['bound constructors preserve call and new behavior','let N=Number.bind(null,"12"),S=String.bind(null,4),A=Array.bind(null,1).bind(null,2);console.log(N(),new N().valueOf(),S(),new S().valueOf(),new A(3).join("/"));'],
 ['call apply and constructor receivers','let fake={};console.log(Number.call(fake,4),String.apply(fake,[5]),Object.call(fake,6).valueOf(),Array.call(fake,1,2).join("/"),fake.valueOf()===fake);'],
 ['coercion callbacks across constructor GC','let o={valueOf:function(){for(let i=0;i<20;i++){({text:""+i});}return 23;},toString:function(){for(let i=0;i<20;i++){({text:""+i});}return "str"+24;}};console.log(Number(o),new Number(o).valueOf(),String(o),new String(o).valueOf());'],
 ['constructor names can shadow and be reassigned','let saved=Number;Number=function(x){return x+1;};console.log(Number(4),globalThis.Number===Number);Number=saved;function f(Number){return Number;}console.log(f(8),Number(9));'],
 ['bare var preserves constructor','var Number;var Array;console.log(Number("12"),Array(2).length);'],
 ['lexical constructor shadow stays separate','let Number=7;console.log(Number,globalThis.Number("8"));'],
 ['static constructors retain dynamic properties through GC','Number.cache={text:""+42};for(let i=0;i<20;i++){({text:""+i});}console.log(Number.cache.text);Number.prototype.extra={text:""+57};console.log(new Number().extra.text);delete Number.cache;delete Number.prototype.extra;'],
];
for(const [name,source] of cases)test('builtin constructor: '+name,()=>{
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
for(const source of ['Array(-1);','new Array(1.5);','Array(4294967296);','new Array(NaN);','Array(Infinity);'])test('invalid Array length: '+source,()=>{
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
});
