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

test('RegExp subclass preserves its prototype and replace override',()=>expectProgram(`
  class CustomRegExp extends RegExp {
    [Symbol.replace](...args){return '!'+super[Symbol.replace](...args)}
  }
  var re=new CustomRegExp('a','g');
  console.log(re instanceof CustomRegExp,Object.getPrototypeOf(re)===CustomRegExp.prototype);
  console.log('aba'.replaceAll(re,'X'));
`,'true true\n!XbX\n'));
