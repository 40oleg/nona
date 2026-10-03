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

test('RegExp nullable repeats backtrack and preserve required captures',()=>expectProgram(`
  let match=/(a?b??)*/.exec('ab');
  console.log(match[0],match[1]);
  console.log('abc'.match(/(?:(?=(abc)))?a/)[1]);
  console.log('abc'.match(/(?:(?=(abc))){1,1}a/)[1]);
`,'ab b\nundefined\nabc\n'));

test('RegExp whitespace escapes include ES2020 Unicode spaces',()=>expectProgram(`
  for(let code of [0x1680,0x2000,0x202f,0x205f,0x3000,0xfeff]){
    let value=String.fromCharCode(code);
    console.log(/\\s/.test(value),/\\S/.test(value),value.replace(/\\S+/g,'x')===value);
  }
`,'true false true\n'.repeat(6)));

test('RegExp VM backtracks on explicit stacks without a step limit',()=>expectProgram(String.raw`
  let long='ab'.repeat(20000)+'c';
  console.log(/(?:a|b)*c/.exec(long)[0].length,/(a|b)*?c/.exec(long)[1]);
  let haystack='x'.repeat(100000)+'abc123-'+'y'.repeat(1000)+'abc456-',found=[],re=/abc(\d{3})-/g,m;
  while((m=re.exec(haystack))!==null)found.push(m[1]+'@'+m.index);
  console.log(found.join(' '));
  console.log(JSON.stringify(/(z)((a+)?(b+)?(c))*/.exec('zaacbbbcac')));
  console.log(JSON.stringify(/(a*)*b/.exec('aaab')),JSON.stringify(/(a?)*?b/.exec('ab')),JSON.stringify(/(?:a{0,2}){3}b/.exec('aaaab')));
  console.log(JSON.stringify(/(.*?)a(?!(a+)b\2c)\2(.*)/.exec('baaabaac')));
  console.log(/(a+)+b/.test('a'.repeat(24)+'b'),JSON.stringify(/^(?:(a)|b)*$/.exec('ab')));
  console.log(JSON.stringify(/(?<=(\d+)(\d+))$/.exec('1053')),JSON.stringify(/[^"]*"/.exec('abc"d')));
  console.log(JSON.stringify(/\u{1F600}+?./u.exec('\u{1F600}\u{1F600}x')),JSON.stringify(/(?<=\u{1F600}{2})x/u.exec('\u{1F600}\u{1F600}x')));
`,'40001 b\n123@100000 456@101007\n'+
  '["zaacbbbcac","z","ac","a",null,"c"]\n'+
  '["aaab","aaa"] ["ab","a"] ["aaaab"]\n'+
  '["baaabaac","ba",null,"abaac"]\n'+
  'true ["ab",null]\n'+
  '["","1","053"] ["abc\\""]\n'+
  '["😀😀"] ["x"]\n'));

// Linear-time fallback (roadmap item 12): past the backtracking budget an
// eligible pattern is matched by the Pike VM, with the same result.
test('catastrophic patterns finish through the linear-time fallback',()=>expectProgram(String.raw`
  const a='a'.repeat(28);
  console.log(/(a+)+b/.test(a),/(?:a|aa)*c/.exec(a+'b'),/^(\w+\s?)*$/.test('word '.repeat(6)+'!'));
  const m=/(a+)+(b)?/.exec(a+'x');console.log(m[0].length,m[1].length,m[2]);
`,'false null false\n28 28 undefined\n'));

test('the Pike VM finds the match the backtracker finds',()=>{
  const cases:[string,string,string][]=[['(a|ab)(c|bcd)(d*)','','abcd'],['(z)((a+)?(b+)?(c))*','','zaacbbbcac'],['(a+)+b','','aaab'],['(?:a|b)*?c','','ababc'],
    ['\\b\\w+\\b','','  hello world'],['x{2,3}?','','xxxx'],['(\\d+)-(\\d+)?','','12-'],['^(?:(a)|b)+$','m','ab\nba'],['[^"]*"','i','abc"d'],
    ['(.)*?x','','abcx'],['(a{2})+','','aaaaa'],['(?:(a)|(b))+','','ab'],['a$|b','m','a\nb'],['(a?b){2,3}','','ababab']];
  const native=`let vm=${regexpVmSource};vm.setBacktrackBudget(0);
  for(const [p,f,s] of ${JSON.stringify(cases)}){const c=vm.compile(p,f),r=vm.execute(c,s,0,false);
   if(r===null){console.log('null');continue}
   const parts=[s.slice(r.start,r.end)];for(let g=1;g<=c.groups;g++){const b=r.captures[g*2];parts.push(b===4294967295?'-':s.slice(b,r.captures[g*2+1]))}
   console.log(r.start+':'+parts.join('|'))}`;
  const expected=cases.map(([p,f,s])=>{const m=new RegExp(p,f).exec(s);return m?m.index+':'+[...m].map(x=>x===undefined?'-':x).join('|'):'null'}).join('\n')+'\n';
  expectProgram(native,expected);
});

// A pattern whose every alternative starts with ^ (no m flag) is only tried
// at index 0 (#107): a failing exec on a long string is constant time.
test('anchored patterns are tried only at the start of the input',()=>{
  const cases:[string,string,string,number][]=[['^abc','','xabc',0],['^abc','g','abcabc',3],['^a|^b','','cab',0],['^(?:a|b)c','','bc',0],['(^a)|b','','cb',0],
    ['^b','m','a\nb',0],['^a','y','ab',0],['^a','y','ba',1],['^(a+)+$','','aaaa!',0],['(?:^x|^y)z','','yz',0],['^','g','abc',2],['^\\w+','','  word',0]];
  const native=`let vm=${regexpVmSource};
  for(const [p,f,s,start] of ${JSON.stringify(cases)}){const r=vm.execute(vm.compile(p,f),s,start,f.includes('y'));console.log(r===null?'null':r.start+'-'+r.end)}
  const long='x'.repeat(100000)+'abc';let found=0;
  for(let i=0;i<500;i++)if(vm.execute(vm.compile('^abc',''),long,0,false)!==null)found++;
  console.log(found)`;
  const expected=cases.map(([p,f,s,start])=>{const re=new RegExp(p,f.includes('y')||f.includes('g')?f:f+'g');re.lastIndex=start;const m=re.exec(s);return m?m.index+'-'+(m.index+m[0].length):'null'}).join('\n')+'\n0\n';
  expectProgram(native,expected);
});
