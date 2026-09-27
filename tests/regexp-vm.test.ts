import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {regexpVmSource} from '../src/runtime/regexp-vm-source.js';

test('RegExp VM parses groups, alternatives and quantifiers in native code',()=>expectProgram(`
  let vm=${regexpVmSource};
  let one=vm.execute(vm.compile('(a+)(b)',''),'xaab',0,false);
  console.log(one.start,one.end,one.captures[2],one.captures[3],one.captures[4],one.captures[5]);
  let two=vm.execute(vm.compile('(?:ab|cd)\\\\d?',''),'xcd2',0,false);
  console.log(two.start,two.end);
  let three=vm.execute(vm.compile('[Nn]?ever',''),'Never',0,false);
  console.log(three.start,three.end);
  let four=vm.execute(vm.compile('a{2,4}?',''),'aaaaa',0,false);
  console.log(four.start,four.end);
`,'1 4 1 3 3 4\n1 4\n0 5\n0 2\n'));

test('RegExp Unicode properties match categories, scripts and supplementary points',()=>expectProgram(`
  console.log(/\\p{L}+/u.exec('12αβ')[0]);
  console.log(/\\P{ASCII}+/u.exec('abαβ')[0]);
  console.log(/[\\p{Script=Greek}]+/u.exec('abαβ')[0]);
  console.log(/\\p{General_Category=Decimal_Number}+/u.exec('ab123')[0]);
  console.log(/\\p{scx=Hira}/u.test('ー'),/\\p{sc=Hira}/u.test('ー'));
  console.log(/\\p{Script=Deseret}/u.test('𐐀'));
  console.log(/\\p{Cn}/u.test('\u0378'),/\\p{Script=Unknown}/u.test('\u0378'));
  console.log(/\\p{LC}+/u.exec('12Aa')[0]);
  console.log(/\\p{L}/.test('p{L}'));
`,'αβ\nαβ\nαβ\n123\ntrue false\ntrue\ntrue true\nAa\ntrue\n'));
