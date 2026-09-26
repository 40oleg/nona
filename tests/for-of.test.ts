import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import {runOracle} from './helpers/oracle.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

const cases:[string,string][]=[
  ['array values',`var s='';for(var x of [1,2,3])s+=x;console.log(s);`],
  ['existing binding',`var x=0;for(x of [4,5]){}console.log(x);`],
  ['property assignment target',`var o={x:0},s='';for(o.x of [4,5])s+=o.x;console.log(s,o.x);`],
  ['computed target each iteration',`var o={},n=0;for(o[(n++,'x')] of [1,2]){}console.log(n,o.x);`],
  ['holes and prototype',`var a=[1,,3];Array.prototype[1]=7;var s='';for(var x of a)s+=x+',';console.log(s);delete Array.prototype[1];`],
  ['break and continue',`var s='';for(var x of [1,2,3,4]){if(x===2)continue;if(x===4)break;s+=x;}console.log(s);`],
  ['dynamic length',`var a=[1,2];var s='';for(var x of a){s+=x;if(x===1)a[2]=3;}console.log(s);`],
  ['non-array rejected',`try{for(var x of 3){} }catch(e){console.log(e instanceof TypeError);}`],
  ['string code points',`var s='';for(var ch of 'A😀B')s+=ch+'|';console.log(s);`],
  ['lone surrogates',`var s='';for(var ch of '\\ud800X\\udc00')s+=ch.length+',';console.log(s);`],
  ['empty string and continue',`var s='';for(var ch of '')s+=ch;for(var ch of 'abc'){if(ch==='b')continue;s+=ch;}console.log(s);`],
  ['custom iterable',`var o={[Symbol.iterator]:function(){var i=0;return {next:function(){return i<3?{value:++i,done:false}:{done:true};}}}};var s='';for(var x of o)s+=x;console.log(s);`],
  ['lazy iterator calls',`var s='',o={[Symbol.iterator]:function(){var i=0;return {next:function(){s+='n';return {value:++i,done:i>3};}}}};for(var x of o){s+=x;if(x===2)break;}console.log(s);`],
  ['array iterator override',`var a=[1,2];a[Symbol.iterator]=function(){return {next:function(){return {done:true};}}};var s='';for(var x of a)s+=x;console.log(s);`],
  ['iterator method cached',`var i=0,o={[Symbol.iterator]:function(){return {next:function(){return {value:++i,done:i>2};}}}};var s='';for(var x of o)s+=x;console.log(s);`],
  ['boxed string iterable',`var s='';for(var x of Object('ab'))s+=x;console.log(s);`],
  ['iterator method API',`var a=[4,5],i=a[Symbol.iterator]();console.log(i.next().value,i.next().value,i.next().done,i[Symbol.iterator]()===i);`],
  ['iterator first next',`var i=[4,5][Symbol.iterator]();console.log(i.next().value);`],
  ['iterator self',`var i=[4,5][Symbol.iterator]();console.log(i[Symbol.iterator]()===i);`],
  ['array values identity',`console.log(Array.prototype.values===Array.prototype[Symbol.iterator],[2].values().next().value);`],
  ['array keys iterator',`var a=[4,,6],i=a.keys();console.log(i.next().value,i.next().value,i.next().value,i.next().done);`],
  ['array entries iterator',`var a=[4,,6],i=a.entries(),x=i.next().value,y=i.next().value,z=i.next().value;console.log(x[0],x[1],y[0],y[1],z[0],z[1],i.next().done);`],
  ['for-of array entries',`var a=[3,4],s='';for(var pair of a.entries())s+=pair[0]+':'+pair[1]+';';console.log(s);`],
  ['arguments iterator',`function f(){var s='';for(var x of arguments)s+=x;return s;}console.log(f(1,2,3));`],
  ['strict arguments iterator',`function f(){'use strict';var s='';for(var x of arguments)s+=x;return s;}console.log(f('a','b'));`],
  ['lexical loop bindings',`var s='';for(let x of [1,2])s+=x;for(const y of [3,4])s+=y;console.log(s);`],
  ['fresh captured binding',`var f=[],i=0;for(let x of [1,2,3]){f[i]=function(){return x;};i++;}console.log(f[0](),f[1](),f[2]());`],
  ['lexical TDZ in RHS',`var x=[1];try{for(let x of x){}}catch(e){console.log(e instanceof ReferenceError);}`],
  ['labeled continue',`var s='';outer:for(var x of [1,2,3]){if(x===2)continue outer;s+=x;}console.log(s);`],
  ['labeled break closes iterator',`var s='',o={[Symbol.iterator]:function(){return {next:function(){return {value:1,done:false};},return:function(){s='closed';return {};}}}};outer:for(var x of o)break outer;console.log(s);`],
  ['IteratorClose on break',`var s='',o={[Symbol.iterator]:function(){var i=0;return {next:function(){return {value:++i,done:false};},return:function(){s+='closed';return {};}}}};for(var x of o){s+=x;break;}console.log(s);`],
  ['IteratorClose on return',`var s='',o={[Symbol.iterator]:function(){return {next:function(){return {value:1,done:false};},return:function(){s+='closed';return {};}}}};function f(){for(var x of o)return x;}console.log(f(),s);`],
  ['continue keeps iterator open',`var s='',o={[Symbol.iterator]:function(){var i=0;return {next:function(){return {value:++i,done:i>2};},return:function(){s+='closed';return {};}}}};for(var x of o){if(x===1)continue;s+=x;}console.log(s);`],
  ['IteratorClose on throw',`var s='',o={[Symbol.iterator]:function(){return {next:function(){return {value:1,done:false};},return:function(){s+='closed';return {};}}}};try{for(var x of o)throw 7;}catch(e){console.log(e,s);}`],
  ['IteratorClose on body error',`var s='',o={[Symbol.iterator]:function(){return {next:function(){return {value:1,done:false};},return:function(){s+='closed';return {};}}}};try{for(var x of o)null.x;}catch(e){console.log(e instanceof TypeError,s);}`],
  ['step failure skips IteratorClose',`var s='',o={[Symbol.iterator]:function(){return {next:function(){throw 7;},return:function(){s+='closed';return {};}}}};try{for(var x of o){}}catch(e){console.log(e,s);}`],
  ['bad return result on break',`var o={[Symbol.iterator]:function(){return {next:function(){return {value:1,done:false};},return:function(){return 3;}}}};try{for(var x of o)break;}catch(e){console.log(e instanceof TypeError);}`],
  ['body throw beats return throw',`var o={[Symbol.iterator]:function(){return {next:function(){return {value:1,done:false};},return:function(){throw 9;}}}};try{for(var x of o)throw 7;}catch(e){console.log(e);}`],
];
for(const [name,source] of cases)test(`for...of: ${name}`,()=>expectProgram(source,runOracle(source).stdout));

test('for...of: string code points survive stress GC',()=>{
  const source=`var s='';for(var ch of 'A😀B😀C'){for(var i=0;i<30;i++)({v:''+i});s+=ch;}console.log(s);`;
  const image=linkPe(generate(compileToIR(source),{gcStress:true}));
  const run=runNative(image);
  assert.equal(run.status,0,run.stderr.toString());
  assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('for...of: custom iterator survives stress GC',()=>{
  const source=`var s='',o={[Symbol.iterator]:function(){var i=0;return {next:function(){for(var j=0;j<20;j++)({x:j});return {value:++i,done:i>3};},return:function(){s+='closed';return {};}}}};for(var x of o){s+=x;if(x===2)break;}console.log(s);`;
  const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
  assert.equal(run.status,0,run.stderr.toString());
  assert.equal(run.stdout.toString(),runOracle(source).stdout);
});

test('for...of: lexical captures survive stress GC',()=>{
  const source=`var f=[],i=0;for(let x of [1,2,3]){f[i]=function(){return x;};for(var j=0;j<20;j++)({x:j});i++;}console.log(f[0](),f[1](),f[2]());`;
  const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
  assert.equal(run.status,0,run.stderr.toString());
  assert.equal(run.stdout.toString(),runOracle(source).stdout);
});
