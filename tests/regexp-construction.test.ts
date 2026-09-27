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

test('RegExp test invokes an overridden exec method',()=>expectProgram(`
  let re=/x/;re.exec=function(){return {0:'x'}};console.log(re.test('no'));
  re.exec=function(){return null};console.log(re.test('x'));
  re.exec=function(){return 3};try{re.test('x')}catch(error){console.log(error.name)}
`,'true\nfalse\nTypeError\n'));

test('RegExp internal strings survive stress GC',()=>{
 const source=`let re=/needle/gi;for(let i=0;i<12;i++){String(i)+String(i)}let m=new RegExp('needle').exec('xneedle');console.log(re instanceof RegExp,re.lastIndex,Object.getPrototypeOf(re)===RegExp.prototype,re.source,re.flags,re.toString(),new RegExp('needle').test('xneedle'),m[0],m.index)`;
 const run=runNative(linkPe(generate(compileToIR(source),{gcStress:true})));
 assert.equal(run.status,0,run.stderr.toString());
 assert.equal(run.stdout.toString(),'true 0 true needle gi /needle/gi true needle 1\n');
});
