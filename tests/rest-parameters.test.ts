import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkHost} from './helpers/program.js';

const cases:[string,string][]=[
 ['plain rest',`function f(...xs){return xs.join('|');}console.log(f(),f(1,2,3),f.length);`],
 ['fixed parameters',`function f(a,b,...xs){return [a,b,xs.length,xs[0],xs[1]].join('|');}console.log(f(1),f(1,2,3,4),f.length);`],
 ['arrow rest',`var f=(a,...xs)=>a+xs.length;console.log(f(2),f(2,3,4),f.length);`],
 ['method rest',`var o={m(a,...xs){return a+xs.join(':');}};console.log(o.m('x','a','b'),o.m.length);`],
 ['rest separate from arguments',`function f(a,...xs){a=9;return [arguments[0],xs[0],arguments.length,xs.length].join('|');}console.log(f(1,2,3));`],
 ['rest closure',`function f(...xs){return function(){return xs[0]+xs[1];};}var g=f(2,3);console.log(g());`],
];
for(const [name,source] of cases)test(`rest parameters: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

for(const source of [
 `function f(a,a,...xs){}`,
 `function f(a,...a){}`,
 `function f(...xs, y){}`,
 `function f(...xs,) {}`,
 `function f(...xs){'use strict';}`,
])test(`rest parameter early error: ${source}`,()=>assert.throws(()=>compileToIR(source)));

test('rest parameter survives stress GC',()=>{
 const source=`function f(...xs){for(var i=0;i<30;i++)({x:i});return xs[0].v+xs[1].v;}console.log(f({v:2},{v:3}));`;
 const run=runNative(linkHost(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
