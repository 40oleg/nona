import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expectProgram} from './helpers/program.js';
import {regexpVmSource} from '../src/runtime/regexp-vm-source.js';
import {lex} from '../src/frontend/lexer.js';

test('RegExp literals use the Nona grammar during lexing',()=>{
  assert.equal(lex(String.raw`/\u{000000003f}/u`)[0]?.kind,'regexp');
  assert.equal(lex('/[𝌆]/u')[0]?.kind,'regexp');
  assert.throws(()=>lex('/(?<x>a)|(?<x>b)/'),/Invalid regular expression pattern/);
  for(const pattern of ['/{2}/','/.(?<=.)?/','/.(?=.)?/u',String.raw`/(?<a>.)\k/`])
    assert.throws(()=>lex(pattern),/Invalid regular expression pattern/);
  assert.equal(lex('/(?=a)?a/')[0]?.kind,'regexp');
});

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

test('RegExp lookbehind matches backwards with captures and greedy repeats',()=>expectProgram(`
  let pair=/(?<=(\\w{2}))def/.exec('abcdef');
  console.log(pair[0],pair[1]);
  let repeated=/(?<=(b+))c/.exec('abbbbbbc');
  console.log(repeated[0],repeated[1]);
  let choice=/(?<=(bc)|(cd))./.exec('abcd');
  console.log(choice[0],choice[1],choice[2]);
`,'def bc\nc bbbbbb\nd bc undefined\n'));

test('RegExp named groups decode Unicode escapes and validate identifiers',()=>expectProgram(`
  let found=/(?<\\u{72f8}>x)\\k<\\u{72f8}>/u.exec('xx');
  console.log(found.groups.狸);
  try{new RegExp('(?<🦊>x)');console.log('accepted')}catch(error){console.log(error instanceof SyntaxError)}
  try{new RegExp('(?<2bad>x)');console.log('accepted')}catch(error){console.log(error instanceof SyntaxError)}
`,'x\ntrue\ntrue\n'));

test('RegExp Unicode classes combine astral characters and escaped surrogate pairs',()=>expectProgram(`
  console.log(/[𝌆]/u.test('𝌆'),/[^𝌆]/u.test('𝌆'));
  console.log(/[\\ud834\\udf06]/u.test('𝌆'),/[\\u{1d306}]/u.test('𝌆'));
  console.log(new RegExp('\\\\u{000000003f}','u').test('?'));
`,'true false\ntrue true\ntrue\n'));

test('RegExp simple repeats backtrack after long Unicode runs',()=>expectProgram(String.raw`
  let letters='A'.repeat(1300);
  console.log(/^\p{L}+!$/u.test(letters+'!'),/^\p{L}+?A!$/u.test(letters+'!'));
  let sequence='a'.repeat(1300)+'b';
  console.log(/a+ab/.test(sequence),/(?<=a{1100})b/.test(sequence));
  let intrinsic=Uint32Array;
  let byteIntrinsic=Uint8Array, fillIntrinsic=Uint8Array.prototype.fill;
  Uint32Array=function(){throw new Error('replaced')};
  Uint8Array=function(){throw new Error('replaced')};
  byteIntrinsic.prototype.fill=function(){throw new Error('replaced')};
  try{console.log(/^\p{L}+!$/u.test(letters+'!'))}finally{
    Uint32Array=intrinsic;
    Uint8Array=byteIntrinsic;
    byteIntrinsic.prototype.fill=fillIntrinsic
  }
`,'true true\ntrue true\ntrue\n'));

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
