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
];
for(const [name,source] of cases)test(`Number builtins: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('Number builtins remain callable after stress GC',()=>{
 const source=`var f=Number.isInteger;for(var i=0;i<50;i++)({x:i});console.log(f(42),Number.isNaN(NaN));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
