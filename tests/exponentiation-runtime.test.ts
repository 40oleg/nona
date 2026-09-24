import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';

test('power follows ES Number special cases',()=>{
 const source='console.log(2**3,2**-2,(-2)**3,(-2)**2,(-2)**.5,NaN**0,1**Infinity,(-1)**Infinity,2**Infinity,2**-Infinity,.5**Infinity,.5**-Infinity,0**-2,1/((-0)**3),1/((-0)**2),Infinity**-1,(-Infinity)**3);';
 expectProgram(source,runOracle(source).stdout);
});

test('power covers overflow underflow subnormal and near-one values',()=>{
 const source='console.log(2**1023,2**1024,2**-1074,2**-1075,(1+2.220446049250313e-16)**4503599627370496,.5**1074,(-2)**2147483647);';
 expectProgram(source,runOracle(source).stdout);
});

test('power performs both ToNumber conversions left to right',()=>{
 const source='let s="";let r={valueOf:function(){s+="r";return 3;}};let l={valueOf:function(){s+="l";r.valueOf=function(){s+="R";return 2;};return 2;}};console.log(l**r,s);';
 expectProgram(source,'4 lR\n');
});

test('power coercion exceptions unwind roots before later allocation',()=>{
 const source='let s="";let r={valueOf(){s+="r";return 2;}};let l={valueOf(){s+="l";throw 7;}};try{l**r;}catch(e){for(let i=0;i<30;i++)({x:""+i});console.log(e,s);}';
 expectProgram(source,'7 l\n');
});

test('seeded finite power corpus agrees with Node rendering',()=>{
 let seed=0x6a09e667f3bcc909n;
 const rows:string[]=[];
 for(let i=0;i<96;i++){
  seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);
  const base=((Number(seed>>11n)/2**53)*4)-2;
  seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);
  const exponent=((Number(seed>>11n)/2**53)*40)-20;
  rows.push(`console.log((${base})**(${exponent}));`);
 }
 const source=rows.join('');
 const result=compile(source,{fileName:'power-corpus.js',target:'win32-x64'});
 assert.ok(result.ok);
 const native=runNative(result.image);
 assert.equal(native.status,0,native.stderr.toString());
 const actual=native.stdout.toString().trim().split('\n').map(Number);
 const expected=runOracle(source).stdout.trim().split('\n').map(Number);
 const bits=(value:number)=>{const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,value);return view.getBigUint64(0);};
 assert.equal(actual.length,expected.length);
 for(let i=0;i<actual.length;i++){
  if(Number.isNaN(expected[i]!)){assert.ok(Number.isNaN(actual[i]),`row ${i}`);continue;}
  const a=bits(actual[i]!),e=bits(expected[i]!),distance=a>e?a-e:e-a;
  assert.ok(distance<=1n,`row ${i}: ${actual[i]} vs ${expected[i]} (${distance} ULP)`);
 }
});
