import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {runOracle} from './helpers/oracle.js';
import {runNative} from './helpers/native.js';

const options={fileName:'declarations.js',target:'win32-x64' as const};

const earlyErrors=[
  'let x;let x;', 'const x=1;let x;', 'let x;var x;',
  '{let x;{var x;}}', '{function x(){}let x;}',
  'function f(x){let x;}', 'function f(){let x;var x;}',
  'try{}catch(e){let e;}', 'try{}catch(e){const e=1;}',
  'switch(0){case 0:let x;case 1:const x=1;}',
  'for(let i=0;i<1;i++){var i;}',
];

for(const source of earlyErrors)test('declaration early error: '+source,()=>{
  assert.equal(compile(source,options).ok,false);
});

const accepted=[
  'var x;var x;console.log(x);',
  'function f(){var x;function x(){return 3;}var x;console.log(x());}f();',
  'try{throw 1;}catch(e){var e;console.log(e);}',
  'function f(a,a){var a;return a;}console.log(f(1,2));',
  'let x=1;{let x=2;{var y=3;}console.log(x,y);}console.log(x,y);',
];

for(const source of accepted)test('accepted declaration set: '+source,()=>{
  const result=compile(source,options);assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)return;
  const native=runNative(result.image);assert.equal(native.error,undefined);assert.equal(native.status,0,native.stderr.toString());
  assert.equal(native.stdout.toString(),runOracle(source).stdout);
});
