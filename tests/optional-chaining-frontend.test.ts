import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {lex} from '../src/frontend/lexer.js';
import {parse} from '../src/frontend/parser.js';
import {bind} from '../src/frontend/binder.js';

const syntax=(source:string)=>parse(lex(source));
const check=(source:string)=>bind(syntax(source));

test('question-dot token excludes a following decimal digit',()=>{
 assert.deepEqual(lex('a?.b').slice(0,-1).map(t=>t.text),['a','?.','b']);
 assert.deepEqual(lex('a?.3:0').slice(0,-1).map(t=>t.text),['a','?','.3',':','0']);
});

test('parser flattens one continuous optional chain',()=>{
 const e=(syntax('obj.m?.(x)?.[key].z;').body[0] as any).expression;
 assert.equal(e.kind,'OptionalChain');
 assert.equal(e.base.kind,'Identifier');
 assert.deepEqual(e.links.map((x:any)=>[x.kind,x.optional,x.computed??null]),[
  ['property',false,false],['call',true,null],['property',true,true],['property',false,false]
 ]);
});

test('parentheses end a chain instead of extending its links',()=>{
 const e=(syntax('(a?.b).c;').body[0] as any).expression;
 assert.equal(e.kind,'Member');
 assert.equal(e.object.kind,'OptionalChain');
});

for(const source of ['a?.b=1;','a?.b++;','++a?.b;','new a?.b();','super?.x;','a?.;','a?.[x;'])
 test('invalid optional-chain syntax: '+source,()=>assert.equal(compile(source,{fileName:'optional.js',target:'win32-x64'}).ok,false));

test('grouped constructor and optional super method call bind',()=>{
 assert.doesNotThrow(()=>check('function f(){return new (a?.b)();}'));
 assert.doesNotThrow(()=>check('let o={m(){return super.x?.();}};'));
});
