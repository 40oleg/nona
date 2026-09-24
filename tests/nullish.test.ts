import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {expectProgram} from './helpers/program.js';

test('nullish coalescing replaces only null and undefined',()=>{
  expectProgram('console.log(null??1,undefined??2,0??3,false??4,""??5,NaN??6);','1 2 0 false  NaN\n');
});
test('nullish coalescing evaluates the left once and skips unneeded effects',()=>{
  expectProgram('let n=0;function f(){n++;return null;}console.log(f()??++n,0??++n,n);','2 0 2\n');
});
test('nullish chains preserve precedence with conditional and comma expressions',()=>{
  expectProgram('console.log(undefined??null??7,(0??1)?2:3,(null??2,4),1+2??4);','7 3 4 3\n');
});
test('parentheses allow explicit nullish logical combinations',()=>{
  expectProgram('console.log((null??false)||3,null??(false||4),(true&&null)??5,true&&(null??6));','3 4 5 6\n');
});
for(const source of ['1??2||3;','1||2??3;','1??2&&3;','1&&2??3;'])
  test('unparenthesized logical nullish mixture rejected: '+source,()=>assert.equal(compile(source,{fileName:'nullish.js',target:'win32-x64'}).ok,false));
