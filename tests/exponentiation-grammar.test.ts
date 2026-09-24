import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {expectProgram} from './helpers/program.js';

const syntax=(source:string)=>parse(lex(source));

test('lexer uses longest match for exponentiation assignment',()=>{
 assert.deepEqual(lex('a**=b**c').slice(0,-1).map(t=>t.text),['a','**=','b','**','c']);
});

test('exponentiation is right associative and binds above multiplication',()=>{
 const body=(syntax('2*3**2**2;').body[0] as any).expression;
 assert.equal(body.operator,'*');
 assert.equal(body.right.operator,'**');
 assert.equal(body.right.right.operator,'**');
});

test('exponentiation unary grammar accepts only the permitted sides',()=>{
 for(const source of ['-2**2;','+2**2;','!2**2;','~2**2;','typeof x**2;','void 0**2;'])
  assert.equal(compile(source,{fileName:'power.js',target:'win32-x64'}).ok,false,source);
 for(const source of ['(-2)**2;','2**-2;','2**+2;','2**(-2);'])
  assert.doesNotThrow(()=>syntax(source),source);
});

test('compound exponentiation evaluates one reference in specification order',()=>{
 expectProgram('let log="";let o={x:2};function base(){log+="b";return o;}function key(){log+="k";return "x";}function rhs(){log+="r";o.x=3;return 2;}base()[key()]**=rhs();console.log(log,o.x);',
  'bkr 4\n');
});

test('compound exponentiation is right associative',()=>{
 expectProgram('let a=2,b=3;a**=b**=2;console.log(a,b);','512 9\n');
});
