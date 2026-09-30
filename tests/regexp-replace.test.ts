import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';

test('RegExp Symbol.replace handles captures, patterns and callbacks',()=>expectProgram(`
  console.log('abc'.replace(/b/,'X'));
  console.log('abab'.replace(/a/g,'X'));
  console.log('ab'.replace(/(a)(b)/,'$2$1'));
  console.log('ab'.replace(/(?<x>a)b/,'$<x>!'));
  console.log('abc'.replace(/b/,(match,index,input)=>match+index+input));
  console.log('abc'.replace(/b/,'$$-$&-$'+String.fromCharCode(96)+'-$'+String.fromCharCode(39)));
  console.log('abc'.replace(/z/,'X'));
`,'aXc\nXbXb\nba\na!\nab1abcc\na$-b-a-cc\nabc\n'));
