import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {runNative} from './helpers/native.js';

const cases:[string,string][]=[
 ['ordinary call',`function f(a,b,c,d){console.log(a,b,c,d,arguments.length);}f(1,...[2,3],4);`],
 ['empty and multiple spreads',`function f(){console.log(arguments.length,arguments[0],arguments[1],arguments[2]);}f(...[],1,...[2],3,...[]);`],
 ['method receiver',`var o={x:7,m:function(a,b){console.log(this.x,a,b);}};o.m(...[2,3]);`],
 ['constructor',`function C(a,b){this.sum=a+b;}var x=new C(...[4,5]);console.log(x.sum,x instanceof C);`],
 ['optional call skips arguments',`var x=null,called=0;console.log(x?.(...[(called++,1)]),called);var f=function(a){return a;};console.log(f?.(...[3]));`],
 ['string and custom iterator',`function f(){console.log(arguments.length,arguments[0],arguments[1]);}f(...'ab');var o={ [Symbol.iterator]:function(){var n=0;return {next:function(){return n++<2?{value:n,done:false}:{done:true};}};}};f(...o);`],
 ['evaluation order',`var s='';function a(x,y,z){console.log(x,y,z,s);}var it={ [Symbol.iterator]:function(){s+='i';return {next:function(){s+='n';return {done:true};}};}};a((s+='a',1),...it,(s+='b',2));`],
];
for(const [name,source] of cases)test(`call spread: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('call spread survives stress GC',()=>{
 const source=`function f(a,b){return a.x+b.x;}var xs=[{x:3},{x:4}];for(var i=0;i<30;i++)({v:i});console.log(f(...xs));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
