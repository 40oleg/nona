import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';

test('String.replaceAll handles string and RegExp searches',()=>expectProgram(`
  console.log('abab'.replaceAll('a','X'));
  console.log('abab'.replaceAll(/a/g,'X'));
  console.log('aba'.replaceAll('a',(match,index)=>match+index));
  console.log('ab'.replaceAll('','-'));
  console.log('aba'.replaceAll('a','$&$'+String.fromCharCode(96)));
  try{'aba'.replaceAll(/a/,'X')}catch(error){console.log(error.name)}
`,'XbXb\nXbXb\na0ba2\n-a-b-\nabaab\nTypeError\n'));
