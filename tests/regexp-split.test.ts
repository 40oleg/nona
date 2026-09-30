import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';

test('RegExp Symbol.split handles sticky matching, captures and limits',()=>expectProgram(`
  console.log('a,b,c'.split(/,/).join('|'));
  console.log('a,b,c'.split(/(,)/).join('|'));
  console.log('abc'.split(/(?:)/).join('|'));
  console.log('abc'.split(/b/,1).join('|'));
  console.log(''.split(/(?:)/).length);
`,'a|b|c\na|,|b|,|c\na|b|c\na\n0\n'));
