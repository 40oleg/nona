import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';

test('RegExp Symbol.replace handles captures, patterns and callbacks',()=>expectProgram(`
  console.log('abc'.replace(/b/,'X'));
  console.log('abab'.replace(/a/g,'X'));
  console.log('ab'.replace(/(a)(b)/,'$2$1'));
  console.log('ab'.replace(/(?<x>a)b/,'$<x>!'));
  console.log('abc'.replace(/b/,(match,index,input)=>match+index+input));
  console.log('abc'.replace(/b/,'$$-$&-$'+String.fromCharCode(96)+'-$'+String.fromCharCode(39)));
  console.log('abc'.replace(/z/,'X'));
`,'aXc\nXbXb\nba\na!\nab1abcc\na$-b-a-cc\nabc\n'));

test('global replace and replaceAll take linear time in the number of matches',()=>{
 // 100 000 matches each: joining the pieces once instead of appending to one string.
 const source=`var s='ab cd! '.repeat(50000),t=Date.now();
var a=s.replace(/\\s+/g,''),b=s.replace(/ /g,'_'),c=s.replaceAll(' ','-'),d=s.replace(/(c)(d)/g,'$2$1');
console.log(a.length,b.length,c.length,d.slice(0,8),Date.now()-t<20000);`;
 expectProgram(source,runOracle(source).stdout);
});
