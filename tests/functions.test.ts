import { test } from 'node:test';
import { expectProgram } from './helpers/program.js';
test('recursion',()=>expectProgram('function f(n){if(n<2)return 1;return n*f(n-1);}console.log(f(6));','720\n'));
test('many arguments and missing defaults',()=>expectProgram('function f(a,b,c,d,e){console.log(a,e);}f(1,2,3,4,5);f(1);','1 5\n1 undefined\n'));
test('nested calls preserve earlier arguments',()=>expectProgram('var x=0;function n(){return ++x;}function p(a,b){console.log(a,b);}p(n(),n());','1 2\n'));
test('var alias preserves parameter',()=>expectProgram('function f(x){var x;return x;}console.log(f(7));','7\n'));
test('mutual recursion and all returns',()=>expectProgram('function a(n){return n?b(n-1):true;}function b(n){return n?a(n-1):false;}function c(){return;}function d(){}console.log(a(8),c(),d());','true undefined undefined\n'));
test('large frame probes stack pages',()=>expectProgram('function f(){'+Array.from({length:600},(_,i)=>'var v'+i+'='+i+';').join('')+'return v599;}console.log(f());','599\n'));
