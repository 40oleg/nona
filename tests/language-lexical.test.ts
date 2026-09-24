import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {expectProgram} from './helpers/program.js';

test('Unicode identifiers binary octal and code point string escapes execute natively',()=>{
  expectProgram('var число=0b101+0o7;console.log(число,"\\u{1F600}",0B11,0O10);','12 😀 3 8\n');
});
test('identifier escapes resolve to the same name and preserve astral code points',()=>{
  expectProgram('var \\u0061=3;var 𐐀=4;var a\\u200C=5;console.log(a,\\u{10400},a‌);','3 4 5\n');
});
test('Unicode names work for functions parameters and labels',()=>{
  expectProgram('function сумма(число){return число+1;}var x=0;выход:do{x=сумма(x);break выход;}while(true);console.log(x);','1\n');
});
test('string identity escapes and ES2019 line separator characters are preserved',()=>{
  expectProgram('console.log("\\q\\z", "a\u2028b", "c\u2029d");','qz a\u2028b c\u2029d\n');
});
test('Unicode string escapes handle supplementary and surrogate values',()=>{
  expectProgram('console.log("\\u{0}\\u{10ffff}","\\u{d800}","\\u{000041}");','\0􏿿 � A\n');
});
test('escaped console property identifiers resolve normally',()=>{
  expectProgram('c\\u006fnsole.l\\u006fg(9);','9\n');
});
for(const source of [
  'var x=0b;', 'var x=0o;', 'var x=0b102;', 'var x=0o8;',
  'var x=0b1abc;', 'var x=1число;', 'var x="\\u{}";', 'var x="\\u{110000}";',
  'var \\u0030=1;', 'var \\u{1f600}=1;', 'var \\u0069f=1;',
  'var a\\u002d=1;', 'var \\uD800=1;', 'var \\x61=1;',
  'var x=1;\u180ex++;', 'var 😀=1;',
])test('malformed modern lexical syntax rejected: '+source,()=>assert.equal(compile(source,{fileName:'lex.js',target:'win32-x64'}).ok,false));
test('diagnostics retain UTF16 offsets after supplementary identifiers',()=>{
  const source='var 𐐀=1; var x=0b2;';
  const result=compile(source,{fileName:'lex.js',target:'win32-x64'});
  assert.equal(result.ok,false);
  if(!result.ok)assert.equal(result.diagnostics[0]!.span.start,source.indexOf('0b2'));
});
