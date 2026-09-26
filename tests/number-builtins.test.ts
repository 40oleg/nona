import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';

const cases:[string,string][]=[
 ['isNaN',`console.log(Number.isNaN(NaN),Number.isNaN(0),Number.isNaN(Infinity),Number.isNaN('NaN'),Number.isNaN());`],
 ['isFinite',`console.log(Number.isFinite(0),Number.isFinite(-0),Number.isFinite(1.5),Number.isFinite(NaN),Number.isFinite(Infinity),Number.isFinite('2'));`],
 ['isInteger',`console.log(Number.isInteger(0),Number.isInteger(-0),Number.isInteger(1.5),Number.isInteger(-2),Number.isInteger(1e21),Number.isInteger(NaN),Number.isInteger('2'));`],
 ['isSafeInteger',`console.log(Number.isSafeInteger(0),Number.isSafeInteger(-0),Number.isSafeInteger(9007199254740991),Number.isSafeInteger(9007199254740992),Number.isSafeInteger(-9007199254740991),Number.isSafeInteger(1.5));`],
 ['metadata',`console.log(Number.isFinite.length,Number.isInteger.name,Number.isNaN.length,Number.isSafeInteger.name,Object.getOwnPropertyDescriptor(Number,'isFinite').enumerable);`],
 ['global isNaN and isFinite',`console.log(isNaN(),isNaN('x'),isNaN('3'),isFinite(),isFinite('3'),isFinite(null),isFinite(Infinity),isNaN.length,isFinite.name);`],
 ['global number conversion order',`var s='';var x={valueOf(){s+='x';return 'not a number';}},y={valueOf(){s+='y';return 4;}};console.log(isNaN(x),isFinite(y),s);`],
 ['global number function descriptors',`console.log(Object.getOwnPropertyDescriptor(globalThis,'isNaN').enumerable,Object.getOwnPropertyDescriptor(globalThis,'isFinite').writable,typeof isNaN,typeof isFinite);`],
 ['global isNaN varied NaNs',`var a=[NaN,Number.NaN,NaN*0,0/0,Infinity/Infinity,-(0/0),Math.pow(-1,.5),-Math.pow(-1,.5),Number('Not-a-Number')];for(var i=0;i<a.length;i++)console.log(i,isNaN(a[i]));`],
];
for(const [name,source] of cases)test(`Number builtins: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('Number builtins remain callable after stress GC',()=>{
 const source=`var f=Number.isInteger;for(var i=0;i<50;i++)({x:i});console.log(f(42),Number.isNaN(NaN));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('Global numeric predicates survive coercion under stress GC',()=>{
 const source=`var x={valueOf(){for(var i=0;i<40;i++)({v:i});return '3';}};console.log(isFinite(x),isNaN(x));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
