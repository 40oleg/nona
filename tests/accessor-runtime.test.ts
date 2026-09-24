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
import {RuntimeBuilder} from '../src/runtime/abi.js';
import {installAccessorFixture,oracleInstaller} from './helpers/accessors.js';

const cases:[string,string][]=[
 ['own and inherited receiver','let p={},o={__proto__:p,n:3};globalThis.installAccessor(p,"x",function(){return this.n;},function(v){this.n=v;});console.log(o.x,o.hasOwnProperty("x"));o.x=7;console.log(o.x,o.n,o.hasOwnProperty("x"));'],
 ['missing methods and ignored setter result','let o={};globalThis.installAccessor(o,"x",undefined,function(v){this.n=v;return 99;});console.log(o.x,o.x=5,o.n);globalThis.installAccessor(o,"y",function(){return 8;},undefined);o.y=9;console.log(o.y);'],
 ['getter survives unlink and GC','let o={};globalThis.installAccessor(o,"x",function(){delete this.x;for(let i=0;i<20;i++){({s:""+i});}return "ok"+42;},undefined);console.log(o.x,o.x);'],
 ['setter survives unlink and lost external reference','let o={};globalThis.installAccessor(o,"x",undefined,function(v){delete this.x;o=null;for(let i=0;i<20;i++){({s:""+i});}console.log(v.text,this.x);});o.x={text:""+57};console.log(o);'],
 ['primitive setter lookup','globalThis.installAccessor(Number.prototype,"x",undefined,function(v){console.log(this.valueOf(),v);});(3).x=7;delete Number.prototype.x;'],
 ['string own readonly indices precede prototype setters','globalThis.installAccessor(String.prototype,"0",undefined,function(v){console.log("setter",this.valueOf(),v);});"ab"[0]=7;""[0]=8;delete String.prototype[0];'],
 ['literal own property bypasses inherited setter','let p={};globalThis.installAccessor(p,"x",function(){return 3;},function(){console.log("unexpected");});let o={__proto__:p,x:7};console.log(o.x,o.hasOwnProperty("x"));'],
 ['accessor compound and postfix assignments','let o={n:3};globalThis.installAccessor(o,"x",function(){return this.n;},function(v){this.n=v;});console.log(o.x++,o.x+=2,++o.x,o.n);'],
 ['apply reads getter length and indices','let o={};globalThis.installAccessor(o,"length",function(){return 2;},undefined);globalThis.installAccessor(o,"0",function(){return "a"+1;},undefined);globalThis.installAccessor(o,"1",function(){for(let i=0;i<20;i++){({x:i});}return "b"+2;},undefined);function f(a,b){return a+b;}console.log(f.apply(null,o));'],
 ['join reads getter entries','let a=[1,2];globalThis.installAccessor(a,"0",function(){delete this[0];for(let i=0;i<20;i++){({s:""+i});}return "first"+3;},undefined);console.log(a.join("|"));'],
 ['coercion method may come from getter','let o={n:8};globalThis.installAccessor(o,"valueOf",function(){return function(){return this.n;};},undefined);console.log(o+1);'],
 ['bind metadata getters and GC','function f(a,b){}globalThis.installAccessor(f,"length",function(){for(let i=0;i<20;i++){({s:""+i});}return 5;},undefined);globalThis.installAccessor(f,"name",function(){return "custom"+42;},undefined);let b=f.bind(null,1);console.log(b.length,b.name);'],
];
for(const [name,source] of cases)test('native accessor dispatch: '+name,()=>{
 const program=generate(lower(bind(parse(lex(source)))),{gcStress:true});
 const builder=new RuntimeBuilder();builder.bundle={fragments:program.fragments,functions:program.functions,imports:program.imports};
 installAccessorFixture(builder);
 const result=runNative(linkPe(program));assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr.toString());
 assert.equal(result.stdout.toString(),runOracle(oracleInstaller+source).stdout);
});
