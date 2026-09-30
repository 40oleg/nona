import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';

test('String.search dispatches Symbol.search and restores RegExp lastIndex',()=>expectProgram(`
  console.log('abc'.search(/b/));
  console.log('abc'.search(/z/));
  console.log('abc'.search({[Symbol.search](value){return value.length+1}}));
  console.log('abc'.search('b'));
  var re=/b/g;re.lastIndex=2;console.log('abc'.search(re),re.lastIndex);
  console.log(Object.getOwnPropertyDescriptor(String.prototype,'search').enumerable);
  console.log(Object.getOwnPropertyDescriptor(RegExp.prototype,Symbol.search).enumerable);
`,'1\n-1\n4\n1\n1 2\nfalse\nfalse\n'));
