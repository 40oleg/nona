import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';
import {compile} from '../src/compiler.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';
import {lower} from '../src/ir/lower.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';

const cases:[string,string][]=[
 ['primitive valueOf and toString brands','console.log(true.valueOf(),false.toString(),(3).valueOf(),(3).toString(),"abc".valueOf(),"abc".toString());'],
 ['boxed values and prototype initial values','let v={}.valueOf;console.log(v.call(true).valueOf(),v.call(3).valueOf(),v.call("ab").toString());console.log(true.__proto__.valueOf(),(3).__proto__.valueOf(),"x".__proto__.valueOf());'],
 ['primitive method metadata and source','console.log((3).toString.name,(3).toString.length,(3).valueOf.length,true.toString.length,"x".toString.length,(3).toString.toString());'],
 ['wrapper methods compose with call apply bind','let n=(3).toString.bind(255,16),s="x".valueOf,b=true.toString;console.log(n(),s.apply("ab",[]),b.call(false));'],
 ['radix integers and default radix','console.log((255).toString(16),(-255).toString(16),(100).toString(2),(35).toString(36),(255).toString(),(255).toString(undefined));'],
 ['radix conversion and truncation','console.log((255).toString("16"),(255).toString(16.9),(35).toString(36.9),(8).toString([2]));'],
 ['radix fractions and rounding','console.log((0.1).toString(2),(0.1).toString(3),(1.1).toString(16),(0.9999999999999999).toString(3),(-12.375).toString(8));'],
 ['special values and signed zero in radices','console.log(NaN.toString(2),Infinity.toString(36),(-Infinity).toString(16),(-0).toString(2),(0).toString(36),1/(-0).valueOf());'],
 ['large and tiny radix values','let values=[5e-324,2.2250738585072014e-308,1.7976931348623157e308,9007199254740992,1e30];for(let i=0;i<values.length;i++){console.log(values[i].toString(2),values[i].toString(3),values[i].toString(36));}'],
];
for(const [name,source] of cases)test(name,()=>expectProgram(source,runOracle(source).stdout));
for(const source of ['true.valueOf.call(3);','"x".toString.call({});','(3).valueOf.call("3");','(3).toString.call(null);','(3).toString(1);','(3).toString(37);','(3).toString(NaN);','NaN.toString(1);','Infinity.toString(Infinity);','new (3).toString();'])test('wrapper brand or radix error: '+source,()=>{
 const result=compile(source,{fileName:'wrapper-error.js',target:'win32-x64'});assert.equal(result.ok,true);if(!result.ok)return;
 const run=runNative(result.image);assert.equal(run.error,undefined);assert.equal(run.status,1);assert.match(run.stderr.toString(),/Nona runtime error/);
});
test('radix output and boxed primitive payload survive GC',()=>{
 const source='let v={}.valueOf,s=v.call("x"+42),a=(0.1).toString(3);for(let i=0;i<40;i++){({x:i});}console.log(s.valueOf(),a);';
 const run=runNative(linkPe(generate(lower(bind(parse(lex(source)))),{gcStress:true})));
 assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr.toString());assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('seeded finite binary64 patterns match Node in every radix 2 through 36',()=>{
 let state=0x8e1d5a739cb4f206n;
 const values=[Number.MIN_VALUE,Number.MAX_VALUE,Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,0.1,0.5,0.9999999999999999,1.0000000000000002,1e21,-1e-7];
 const bytes=new DataView(new ArrayBuffer(8));
 for(let i=0;i<40;i++){
  state=BigInt.asUintN(64,state*6364136223846793005n+1442695040888963407n);bytes.setBigUint64(0,state,true);
  const value=bytes.getFloat64(0,true);if(Number.isFinite(value)&&value!==0)values.push(value);
 }
 const source='let values=['+values.map(value=>String(value)).join(',')+'];for(let i=0;i<values.length;i++){for(let radix=2;radix<=36;radix++){console.log(values[i].toString(radix));}}';
 expectProgram(source,runOracle(source).stdout);
});
