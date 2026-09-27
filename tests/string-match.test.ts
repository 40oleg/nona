import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';

test('String.match dispatches Symbol.match and RegExp global matching',()=>expectProgram(`
  console.log('aab'.match(/a/)[0]);
  console.log('aab'.match(/a/g).join(','));
  console.log('zzz'.match(/a/g));
  console.log('abc'.match({[Symbol.match](value){return value+'!'}}));
  console.log('aab'.match('a')[0]);
  console.log(Object.getOwnPropertyDescriptor(String.prototype,'match').enumerable);
  console.log(Object.getOwnPropertyDescriptor(RegExp.prototype,Symbol.match).enumerable);
`,'a\na,a\nnull\nabc!\na\nfalse\nfalse\n'));
