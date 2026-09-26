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
 ['parseInt radices and prefixes',`console.log(parseInt('  -0x10tail'),parseInt('0x10',10),parseInt('0x10',16),parseInt('0b101'),parseInt('101',2),parseInt('z',36),parseInt('0o77',8),parseInt(''),parseInt('  -0x'),parseInt('-0')===0,1/parseInt('-0'));`],
 ['parseInt descriptors and alias',`console.log(Number.parseInt===parseInt,parseInt.length,parseInt.name,Object.getOwnPropertyDescriptor(globalThis,'parseInt').enumerable,Object.getOwnPropertyDescriptor(Number,'parseInt').writable);`],
 ['parseInt coercion order and invalid radices',`var s='';var a={toString(){s+='s';return '123xyz';}},b={valueOf(){s+='r';return 10;}};console.log(parseInt(a,b),s,parseInt('10',1),parseInt('10',37),parseInt('10',-2),parseInt('10',Infinity));`],
 ['parseFloat decimal prefixes',`console.log(parseFloat('  -1.25e2tail'),parseFloat('1e+bad'),parseFloat('1.'),parseFloat('.5x'),parseFloat('.'),parseFloat('0x10'),parseFloat('+Infinityrest'),parseFloat('-Infinity?'),parseFloat('infinity'));`],
 ['parseFloat descriptors and alias',`console.log(Number.parseFloat===parseFloat,parseFloat.length,parseFloat.name,Object.getOwnPropertyDescriptor(globalThis,'parseFloat').enumerable,Object.getOwnPropertyDescriptor(Number,'parseFloat').configurable);`],
 ['parseFloat string coercion',`var s='';var a={toString(){s+='t';return '  4.5e-2x';}};console.log(parseFloat(a),s,parseFloat(),parseFloat(null),parseFloat(true),1/parseFloat('-0'));`],
];
for(const [name,source] of cases)test(`Number builtins: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('parseInt rounds long radix strings and handles wrapped radix values',()=>{
 const values=[['1'+'0'.repeat(1023),2],['1'+'0'.repeat(1024),2],['1'+'0'.repeat(54)+'1',2],['7'.repeat(400),8],['f'.repeat(300),16],['9'.repeat(400),10],['z'.repeat(250),36],['101',4294967298],['10',4294967312],['10',-4294967280]] as const;
 const source='console.log('+values.map(([value,radix])=>`parseInt(${JSON.stringify(value)},${radix})`).join(',')+');';
 expectProgram(source,runOracle(source).stdout);
});

test('parseFloat uses exact decimal rounding on the longest valid prefix',()=>{
 const midpoint='1.00000000000000011102230246251565404236316680908203125';
 const values=[midpoint+'0'.repeat(1500)+'x',midpoint+'0'.repeat(1500)+'1x','2.2250738585072014e-308end','5e-324suffix','1.7976931348623159e308tail','0.'+'0'.repeat(1500)+'1e1501rest','  -0.0e+suffix','+Infinity and beyond','1e-foo','1.2.3'];
 const source='console.log('+values.map(v=>`parseFloat(${JSON.stringify(v)})`).join(',')+');';
 expectProgram(source,runOracle(source).stdout);
});

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

test('parseInt survives string and radix coercion under stress GC',()=>{
 const source=`var s={toString(){for(var i=0;i<40;i++)({x:i});return '0x2a tail';}},r={valueOf(){for(var i=0;i<40;i++)({x:i});return 16;}};console.log(parseInt(s,r),Number.parseInt===parseInt);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('parseFloat survives string coercion under stress GC',()=>{
 const source=`var x={toString(){for(var i=0;i<40;i++)({x:i});return ' -1.25e+2rest';}};console.log(parseFloat(x),Number.parseFloat===parseFloat);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
