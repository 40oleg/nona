import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';
import {runNative} from './helpers/native.js';

const cases:[string,string][]=[
 ['missing and explicit undefined',`function f(a=3,b=4){console.log(a,b);}f();f(undefined,8);f(null,0);`],
 ['left to right and prior bindings',`var log='';function f(a=(log+='a',2),b=(log+='b',a+3)){console.log(a,b,log);}f();f(7);`],
 ['function length',`function f(a,b=2,c){}var g=(a=1,b)=>a+b;console.log(f.length,g.length,({m(a=1){}}).m.length);`],
 ['arrow and method defaults',`var x=5;var f=(a=x,b=a+1)=>a+b;var o={m(a=2,b=a+3){return a+b;}};console.log(f(),f(3),o.m(),o.m(4));`],
 ['defaults with rest and arguments',`function f(a=3,...xs){console.log(a,xs.length,arguments.length,arguments[0]);}f();f(undefined,4,5);`],
 ['unmapped arguments',`function f(a=1){a=5;console.log(arguments[0],a);arguments[0]=8;console.log(a);}f(2);`],
 ['default captures',`function f(a=2,b=function(){return a;}){a=9;return b;}console.log(f()());`],
 ['default sees outer binding',`var x=4;function f(a=x){var x=9;return a;}console.log(f());`],
 ['later and self parameter TDZ',`function f(a=b,b=2){return a;}try{f(undefined,3);}catch(e){console.log(e instanceof ReferenceError);}function g(a=a){return a;}try{g();}catch(e){console.log(e instanceof ReferenceError);}`],
 ['captured later parameter initializes before call',`function f(a=function(){return b;},b=7){return a();}console.log(f());`],
];
for(const [name,source] of cases)test(`default parameters: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

for(const source of [
 `function f(a=1,a){}`,
 `function f(a=1){'use strict';}`,
 `function f(...xs=1){}`,
 `function f(a=1,...xs,) {}`,
])test(`default parameter early error: ${source}`,()=>assert.throws(()=>compileToIR(source)));

test('default parameters survive callback stress GC',()=>{
 const source=`function f(a={x:7},b=(function(){for(var i=0;i<30;i++)({v:i});return a.x;})()){return b;}console.log(f());`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
