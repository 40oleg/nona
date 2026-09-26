import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';
import assert from 'node:assert/strict';

const cases:[string,string][]=[
 ['pow basics',`console.log(Math.pow(2,5),Math.pow(-2,3),Math.pow(4,.5));`],
 ['pow conversions',`var s='';var a={valueOf:function(){s+='a';return 2;}},b={valueOf:function(){s+='b';return 3;}};console.log(Math.pow(a,b),s);`],
 ['pow missing arguments',`var a=Math.pow(),b=Math.pow(2);console.log(a!==a,b!==b);`],
 ['min and max values',`console.log(Math.min(),Math.max(),Math.min(5,2,8,-3),Math.max(5,2,8,-3),Math.min(1,'-2',true),Math.max(1,'2',true));`],
 ['min and max NaN and signed zero',`console.log(Math.min(NaN,2),Math.max(2,NaN),Object.is(Math.min(0,-0),-0),Object.is(Math.min(-0,0),-0),Object.is(Math.max(0,-0),0),Object.is(Math.max(-0,0),0));`],
 ['min and max convert every argument',`var s='';function v(n){return {valueOf:function(){s+=n;return n==='b'?NaN:3;}};}console.log(Math.min(v('a'),v('b'),v('c')),s);s='';console.log(Math.max(v('a'),v('b'),v('c')),s);`],
 ['min and max metadata',`console.log(Math.min.length,Math.max.length,Object.keys(Math).length,Object.getOwnPropertyDescriptor(Math,'min').enumerable);`],
 ['unary numeric methods',`console.log(Math.abs(-7),Math.sign(-7),Math.sqrt(81),Math.trunc(-7.9),Math.trunc(7.9));`],
 ['unary missing and nonfinite',`for(var f of [Math.abs,Math.sign,Math.sqrt,Math.trunc]){var x=f();console.log(x!==x);}console.log(Math.abs(-Infinity),Math.sign(-Infinity),Math.sqrt(Infinity),Math.trunc(Infinity));`],
 ['unary signed zero',`console.log(Object.is(Math.abs(-0),0),Object.is(Math.sign(-0),-0),Object.is(Math.sqrt(-0),-0),Object.is(Math.trunc(-0),-0),Object.is(Math.trunc(-0.5),-0));`],
 ['unary coercion and metadata',`var x={valueOf:function(){return -4.8;}};console.log(Math.abs(x),Math.sign(x),Math.sqrt(4),Math.trunc(x),Math.abs.length,Math.sign.length,Math.sqrt.length,Math.trunc.length);`],
 ['floor and ceil',`console.log(Math.floor(3.9),Math.floor(-3.9),Math.ceil(3.1),Math.ceil(-3.1),Object.is(Math.floor(-0),-0),Object.is(Math.ceil(-0.5),-0),Math.floor(-Infinity),Math.ceil(Infinity));`],
 ['round ties and boundaries',`console.log(Math.round(1.5),Math.round(-1.5),Math.round(-1.6),Object.is(Math.round(-0.5),-0),Math.round(0.49999999999999994),Math.round(-0.5000000000000001));`],
 ['Math tag',`console.log(Object.prototype.toString.call(Math),Math[Symbol.toStringTag]);`],
 ['Math constants',`console.log(Math.E,Math.LN10,Math.LN2,Math.LOG10E,Math.LOG2E,Math.PI,Math.SQRT1_2,Math.SQRT2);console.log(Object.getOwnPropertyDescriptor(Math,'PI').writable,Object.getOwnPropertyDescriptor(Math,'PI').enumerable,Object.getOwnPropertyDescriptor(Math,'PI').configurable);`],
 ['imul signed 32-bit product',`console.log(Math.imul(0xffffffff,5),Math.imul(0x7fffffff,2),Math.imul(-1,-1),Math.imul(),Math.imul(2));`],
 ['clz32 leading zero counts',`console.log(Math.clz32(),Math.clz32(0),Math.clz32(1),Math.clz32(0x80000000),Math.clz32(-1),Math.clz32(0x100000000));`],
 ['integer Math coercion and metadata',`var s='';function v(x){return {valueOf(){s+=x;return x;}};}console.log(Math.imul(v(2),v(3)),s,Math.clz32(v(8)),Math.imul.length,Math.clz32.length);`],
 ['fround conversion and rounding',`console.log(Math.fround(1.337),Math.fround(1e50),Math.fround(1e-50),Object.is(Math.fround(-0),-0),Math.fround.length);`],
 ['fround missing and coercion',`var x=Math.fround();var s='';var y={valueOf(){s+='v';return 1.5;}};console.log(x!==x,Math.fround(y),s);`],
 ['hypot scaled values and specials',`console.log(Math.hypot(),Math.hypot(3,4),Math.hypot(1e308,1e308),Math.hypot(1e-300,1e-300),Math.hypot(NaN,Infinity),Math.hypot(Infinity,NaN),Math.hypot(-0,0),Math.hypot.length);`],
 ['hypot converts every argument in order',`var s='';function v(x){return {valueOf(){s+=x;return x==='a'?NaN:x==='b'?Infinity:3;}};}console.log(Math.hypot(v('a'),v('b'),v('c')),s);`],
 ['random range, metadata and advancing state',`var a=Math.random(),b=Math.random();console.log(a>=0,a<1,b>=0,b<1,a!==b,Math.random.length,Math.random.name);`],
];
for(const [name,source] of cases)test(`Math: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('Math: min and max survive coercion callbacks under stress GC',()=>{
 const source=`var a={valueOf:function(){for(var i=0;i<30;i++)({x:i});return -0;}};var b={valueOf:function(){for(var i=0;i<30;i++)({x:i});return 0;}};console.log(Object.is(Math.min(b,a),-0),Object.is(Math.max(a,b),0));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('Math: hypot survives coercion callbacks under stress GC',()=>{
 const source=`var s='';function v(n){return {valueOf(){for(var i=0;i<25;i++)({x:i});s+=n;return n;}};}console.log(Math.hypot(v(3),v(4)),s);`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
test('Math: sin cos tan finite values and signed zero',()=>{
 const source=`console.log(Math.sin(0.5),Math.cos(0.5),Math.tan(0.5),Object.is(Math.sin(-0),-0),Math.cos(0),Object.is(Math.tan(-0),-0));`;
 const run=runNative(linkPe(generate(compileToIR(source))));assert.equal(run.status,0,run.stderr.toString());
 const parts=run.stdout.toString().trim().split(' ');
 for(const [i,expected] of [Math.sin(.5),Math.cos(.5),Math.tan(.5)].entries())assert.ok(Math.abs(Number(parts[i])-expected)<1e-15,`${i}: ${parts[i]}`);
 assert.deepEqual(parts.slice(3),['true','1','true']);
});
test('Math: trigonometric argument coercion survives stress GC',()=>{
 const source=`var x={valueOf(){for(var i=0;i<40;i++)({v:i});return 0;}};console.log(Math.sin(x),Math.cos(x),Math.tan(x));`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
