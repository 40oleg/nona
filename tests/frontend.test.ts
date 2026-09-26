import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lex } from '../src/frontend/lexer.js';
import { parse } from '../src/frontend/parser.js';
import { bind } from '../src/frontend/binder.js';

const syntax = (s: string) => parse(lex(s));
const check = (s: string) => bind(syntax(s));

for(const [spelling,value] of [['0xAf',175],['.25e+2',25],['12.',12],['1e-2',0.01],['"\\x41\\u0042"','AB'],['"a\\\r\nb"','ab'],['"\\n\\r\\t\\b\\f\\v\\0"','\n\r\t\b\f\v\0']] as const)
  test('literal decoding '+JSON.stringify(spelling),()=>assert.equal(lex(spelling)[0]!.value,value));
for(const source of ['/* missing','"\\x0G"','"\\u000"','"a\nb"','for(var i=0\ni<2;i++){}','while(true){break x;}'])test('malformed syntax '+JSON.stringify(source),()=>assert.throws(()=>check(source)));
test('break and continue ASI at line break',()=>assert.doesNotThrow(()=>check('var x=0;while(x<2){x++;continue\n x=99;}while(true){break\n x=4;}')));

test('strict directive recognition keeps parentheses and escape spelling', () => {
  for (const source of ['("use strict");', '"use\\x20strict";', 'function f(){("use strict");}', 'function f(){"use\\x20strict";}']) assert.doesNotThrow(() => check(source));
  for (const source of ['"use strict";', 'function f(){"hello";"use strict";}']) assert.doesNotThrow(() => check(source));
  assert.equal(syntax('"use strict";').strict,true);
  assert.equal(syntax('("use strict");').strict,false);
  assert.equal(syntax('"use\\x20strict";').strict,false);
});
test('invalid lvalue diagnostics identify the operator', () => {
  for (const [source, start] of [['1=2;', 1], ['++1;', 0]] as const) assert.throws(() => check(source), (e:any) => e.diagnostics[0].span.start === start);
});

test('lexer decodes literals and keeps line breaks across comments', () => {
  const t = lex('var x="a\\0\\u4e16"; /*\n*/ x += .5e2;');
  assert.equal(t[3]!.value, 'a\0世');
  assert.equal(t[5]!.lineBreakBefore, true);
  assert.equal(t[7]!.value, 50);
});
test('parser preserves precedence and assignment associativity', () => {
  const p = syntax('var a,b; a=b=1+2*3;');
  const expr = (p.body[1] as any).expression;
  assert.equal(expr.kind, 'Assignment');
  assert.equal(expr.right.right.operator, '+');
  assert.equal(expr.right.right.right.operator, '*');
});
test('ASI after return and before postfix maintains separate statements', () => {
  const p = syntax('function f(){return\n1;} var x=0; x\n++x;');
  assert.equal((p.body[0] as any).body.body[0].argument, null);
  assert.equal(p.body.length, 4);
});
test('hoisting resolves local references, duplicate var preserves parameter', () => {
  const b = check('var g=1;function f(a){console.log(x);var x;var a;return g+a;}');
  assert.equal(b.globals.length, 2); // g and the mutable function binding f.
  assert.equal(b.functions[0]!.locals.length, 2);
  assert.equal(b.functions[0]!.parameters.length, 1);
});
test('mutual recursion and missing typeof are valid', () => {
  assert.doesNotThrow(() => check('function a(n){return n?b(n-1):0;}function b(n){return a(n);}console.log(typeof missing,a(2));'));
});
test('all supported expression operators and statements bind', () => {
  assert.doesNotThrow(() => check('var a=1,b=2; a+=b;a-=b;a*=b;a/=b;a%=b; ++a;b--;if(a!=b&&a!==b||a==b){a=a<=b?+a:-b;}else a=!a;while(a>0){a--;if(a>=2)continue;break;}for(var i=0;i<2;i++){console.log(i);}for(;;)break;'));
});
for (const source of [
  'new;', 'this=1;',
  'function f(a,a){"use strict";}',
  '"use strict";delete missing;', 'var x=012;', 'var x="\\12";',
  'while(true){break label;}', 'return 1;', 'break;', 'continue;',
  'try{}catch(){}',
  'var x=/a/;',
  'if(true)function f(){}', '1=2;', 'var x=1e;', 'var x="unterminated',
]) test(`unsupported input rejected: ${source}`, () => assert.throws(() => check(source)));

test('explicit exceptions bind with named and optional catch parameters', () => {
  assert.doesNotThrow(() => check('try{throw 1;}catch(e){console.log(e);}try{throw undefined;}catch{}'));
});

test('diagnostics carry the offending token position', () => {
  assert.throws(() => check('var x=1;\nclass X{}'), (e: any) => {
    assert.equal(e.diagnostics[0].span.start, 9);
    return true;
  });
});
