import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';

test('String.matchAll and RegExp Symbol.matchAll return lazy matches',()=>expectProgram(`
  var matches='aba'.matchAll(/a/g);
  console.log(matches.next().value.index,matches.next().value.index,matches.next().done);
  console.log(Object.prototype.toString.call(matches));
  var re=/a/g;re.lastIndex=2;
  var copy=re[Symbol.matchAll]('aba');
  console.log(copy.next().value.index,re.lastIndex,copy.next().done);
  try{'a'.matchAll(/a/)}catch(error){console.log(error.name)}
`,'0 2 true\n[object RegExp String Iterator]\n2 2 true\nTypeError\n'));
