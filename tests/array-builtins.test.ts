import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

const cases:[string,string][]=[
 ['isArray brands',`console.log(Array.isArray([]),Array.isArray({}),Array.isArray('x'),Array.isArray(Array.prototype));`],
 ['push values',`var a=[1];console.log(a.push(2,3),a.length,a[1],a[2]);`],
 ['push empty',`var a=[];console.log(a.push(),a.length);`],
 ['push generic',`var o={length:1,0:'a'};console.log(Array.prototype.push.call(o,'b','c'),o.length,o[1],o[2]);`],
 ['push sparse',`var a=[];a.length=2;console.log(a.push(5),a.length,a[2]);`],
 ['pop values',`var a=[1,2,3];console.log(a.pop(),a.length,a.pop(),a.length,a.pop(),a.pop());`],
 ['pop sparse',`var a=[1,,3];console.log(a.pop(),a.pop(),a.length);`],
 ['pop generic',`var o={length:2,0:'a',1:'b'};console.log(Array.prototype.pop.call(o),o.length,1 in o,o[0]);`],
 ['includes values and holes',`var a=[1,,NaN];console.log(a.includes(1),a.includes(undefined),a.includes(NaN),a.includes(2));`],
 ['includes fromIndex',`var a=[1,2,1];console.log(a.includes(1,1),a.includes(1,-1),a.includes(1,-3),a.includes(1,Infinity),a.includes(2,-Infinity));`],
 ['includes generic inherited values',`var o={__proto__:{0:'x'},length:2,1:'y'};console.log(Array.prototype.includes.call(o,'x'),Array.prototype.includes.call(o,'y'),Array.prototype.includes.call('ab','b'));`],
];
for(const [name,source] of cases)test(`array builtins: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('array builtins: push survives stress GC',()=>{
 const source=`var a=[];for(var i=0;i<50;i++){a.push({x:i});}console.log(a.length,a[0].x,a[49].x);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('array builtins: includes survives getter and GC',()=>{
 const source=`var o={length:2};Object.defineProperty(o,'0',{get:function(){for(var i=0;i<30;i++)({v:i});return 'needle';}});console.log(Array.prototype.includes.call(o,'needle'));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('array builtins: pop survives getter and GC',()=>{
 const source=`var o={length:2};Object.defineProperty(o,'1',{configurable:true,get:function(){for(var i=0;i<30;i++)({v:i});return {x:7};}});var v=Array.prototype.pop.call(o);console.log(v.x,o.length,1 in o);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
