import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {runNative} from './helpers/native.js';
import {expectProgram} from './helpers/program.js';

test('let and const shadow lexically without overwriting outer bindings',()=>{
  expectProgram('let x=1;{let x=2;const y=x+1;console.log(x,y);}console.log(x);','2 3\n1\n');
});
test('let without initializer initializes to undefined at its declaration',()=>{
  expectProgram('let x;console.log(x);x=4;console.log(x);','undefined\n4\n');
});
test('lexical function locals shadow globals and coexist with var hoisting',()=>{
  expectProgram('let x=8;function f(a){console.log(v);let x=a;{const x=4;console.log(x);}var v=3;return x+v;}console.log(f(2),x);','undefined\n4\n5 8\n');
});
test('for lexical scope encloses condition update and body only',()=>{
  expectProgram('let i=9;for(let i=0;i<3;i++)console.log(i);console.log(i);','0\n1\n2\n9\n');
});
test('re-entering block creates fresh uninitialized lexical slots',()=>{
  expectProgram('for(var i=0;i<3;i++){let x;console.log(x);x=i;}','undefined\nundefined\nundefined\n');
});
test('unexecuted assignment to const does not cause a compile-time failure',()=>{
  expectProgram('if(false){x=2;}const x=1;console.log(x);','1\n');
});
test('switch shares lexical scope across clauses and supports fallthrough initialization',()=>{
  expectProgram('let x=8;switch(1){case 1:let x=2;case 2:console.log(x);break;}console.log(x);','2\n8\n');
});
test('switch discriminant reads outer binding before entering its lexical scope',()=>{
  expectProgram('let x=2;switch(x){case 2:let x=3;console.log(x);}console.log(x);','3\n2\n');
});
for(const [name,source,stdout] of [
  ['read TDZ','let x=1;{console.log(x);let x=2;}',''],
  ['typeof TDZ','{console.log(typeof x);let x;}',''],
  ['write TDZ','x=1;let x;',''],
  ['self initializer','let x=x;',''],
  ['global TDZ through function','function f(){return x;}console.log(f());let x=1;',''],
  ['const write','const x=1;x=2;',''],
  ['const update','const x=1;x++;',''],
  ['const RHS effects','const x=1;x=console.log("rhs");','rhs\n'],
  ['compound TDZ order','x+=console.log("bad");let x;',''],
  ['switch skipped declaration','switch(2){case 1:let x=1;case 2:console.log(x);}',''],
  ['block TDZ reset','for(var i=0;i<2;i++){if(i)console.log(x);let x=1;}',''],
] as const)test(name+' fails at runtime',()=>{
  const result=compile(source,{fileName:'lexical.js',target:'win32-x64'});
  assert.equal(result.ok,true,JSON.stringify(result));if(!result.ok)return;
  const run=runNative(result.image);assert.equal(run.error,undefined);assert.equal(run.status,1);
  assert.equal(run.stdout.toString(),stdout);assert.match(run.stderr.toString(),/Nona runtime error/);
});
for(const source of [
  'let x;let x;', 'let x;var x;', '{let x;{var x;}}',
  'const x;', 'function f(x){let x;}', 'let f;function f(){}',
  'if(true)let x=1;', 'while(false)const x=1;', 'label:let x=1;',
  'switch(1){case 1:let x;case 2:let x;}', 'for(let i=0;i<1;i++){var i;}',
])test('lexical early error: '+source,()=>assert.equal(compile(source,{fileName:'lexical.js',target:'win32-x64'}).ok,false));
