import {test} from 'node:test';
import {expectProgram} from './helpers/program.js';
import assert from 'node:assert/strict';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkPe} from '../src/backend/pe/writer.js';
import {runNative} from './helpers/native.js';

test('RegExp literal and constructor allocate native objects',()=>expectProgram(`
  let literal=/ab+/gi;
  let constructed=new RegExp('cd','m');
  console.log(typeof literal,literal instanceof RegExp,Object.getPrototypeOf(literal)===RegExp.prototype,literal.lastIndex);
  console.log(typeof constructed,constructed instanceof RegExp,constructed.lastIndex);
  literal.lastIndex=3;console.log(literal.lastIndex);
  console.log(literal.source,literal.flags,new RegExp('x','ig').flags,RegExp.prototype.source,RegExp.prototype.flags);
  console.log(literal.toString(),RegExp.prototype.toString.call({source:'x',flags:'m'}));
`,'object true true 0\nobject true 0\n3\nab+ gi gi (?:) \n/ab+/gi /x/m\n'));

test('RegExp constructor rejects invalid and repeated flags',()=>expectProgram(`
  for(let flags of ['gg','z','v','uii']){
    try{new RegExp('x',flags)}catch(error){console.log(error.name)}
  }
`,'SyntaxError\nSyntaxError\nSyntaxError\nSyntaxError\n'));

test('RegExp copies native patterns and call reuses an existing instance',()=>expectProgram(`
  let original=/cat/gi;
  console.log(RegExp(original)===original,RegExp(original,undefined)===original);
  let copy=new RegExp(original),override=new RegExp(original,'m');
  console.log(copy===original,copy.source,copy.flags,copy.lastIndex);
  console.log(override.source,override.flags,RegExp(original,'y')===original);
`,'true true\nfalse cat gi 0\ncat m false\n'));

test('RegExp flag accessors and generic flags getter',()=>expectProgram(`
  let re=new RegExp('x','yimgus');
  console.log(re.global,re.ignoreCase,re.multiline,re.dotAll,re.unicode,re.sticky,re.flags);
  let get=Object.getOwnPropertyDescriptor(RegExp.prototype,'flags').get;
  console.log(get.call({global:1,ignoreCase:0,multiline:'x',dotAll:false,unicode:true,sticky:[]}));
  console.log(RegExp.prototype.global,RegExp.prototype.flags);
`,'true true true true true true gimsuy\ngmuy\nundefined \n'));

test('RegExp source escapes slash and line terminators',()=>expectProgram(String.raw`
  console.log(new RegExp('/').source==='\\/',new RegExp('\n').source==='\\n');
  console.log(new RegExp('\u2028').source==='\\u2028',new RegExp('\u2029').source==='\\u2029');
  console.log(/a\/b/.source==='a\\/b',new RegExp('/').toString()==='/\\//');
`,'true true\ntrue true\ntrue true\n'));

test('RegExp test matches plain UTF-16 substrings without flags',()=>expectProgram(`
  let re=new RegExp('needle');
  console.log(re.test('hay needle stack'),re.test('haystack'),new RegExp('').test('anything'));
  console.log(new RegExp('猫').test('黒猫'),new RegExp('cat').test('concatenate'));
  try{new RegExp('a+').test('aaa')}catch(error){console.log(error.name)}
`,'true false true\ntrue true\nTypeError\n'));

test('RegExp exec returns match metadata for plain patterns',()=>expectProgram(`
  let match=new RegExp('猫').exec('黒猫白猫');
  console.log(match[0],match.index,match.input,match.groups,match.length);
  console.log(new RegExp('missing').exec('hay')===null);
  let empty=new RegExp('').exec('abc');console.log(empty[0],empty.index,empty.length);
`,'猫 1 黒猫白猫 undefined 1\ntrue\n 0 1\n'));

test('global and sticky plain matches use lastIndex',()=>expectProgram(`
  let g=/cat/g,s='cat-cat';
  console.log(g.exec(s).index,g.lastIndex,g.exec(s).index,g.lastIndex,g.exec(s),g.lastIndex);
  let y=/cat/y;y.lastIndex=4;
  console.log(y.exec(s).index,y.lastIndex,y.exec(s),y.lastIndex);
  let plain=/cat/;plain.lastIndex=2;
  console.log(plain.exec(s).index,plain.lastIndex);
  let numeric=/cat/g;numeric.lastIndex=3.9;
  console.log(numeric.exec(s).index,numeric.lastIndex);
  let sticky=/cat/y;sticky.lastIndex=1;
  console.log(sticky.exec(s),sticky.lastIndex);
  let empty=new RegExp('','g');empty.lastIndex=2;
  console.log(empty.exec('abc').index,empty.lastIndex);
`,'0 3 4 7 null 0\n4 7 null 0\n0 2\n4 7\nnull 0\n2 2\n'));

test('RegExp test invokes an overridden exec method',()=>expectProgram(`
  let re=/x/;re.exec=function(){return {0:'x'}};console.log(re.test('no'));
  re.exec=function(){return null};console.log(re.test('x'));
  re.exec=function(){return 3};try{re.test('x')}catch(error){console.log(error.name)}
`,'true\nfalse\nTypeError\n'));

test('RegExp internal strings survive stress GC',()=>{
 const source=String.raw`let re=/needle/gi;for(let i=0;i<12;i++){String(i)+String(i)}let m=new RegExp('needle').exec('xneedle');console.log(re instanceof RegExp,re.lastIndex,Object.getPrototypeOf(re)===RegExp.prototype,re.source,re.flags,re.toString(),new RegExp('needle').test('xneedle'),m[0],m.index,new RegExp('/').source==='\\/')`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'true 0 true needle gi /needle/gi true needle 1 true\n');
});
