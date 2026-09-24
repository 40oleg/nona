import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lex } from '../src/frontend/lexer.js';
import { parse } from '../src/frontend/parser.js';
import { bind } from '../src/frontend/binder.js';
import { lower } from '../src/ir/lower.js';

test('lowerer keeps top-level initialization separate from function declarations', () => {
  const ir = lower(bind(parse(lex('var g=1;function f(x){return x+g;}console.log(f(2));'))));
  assert.equal(ir.functions.length, 2);
  assert.equal(ir.functions[1]!.parameterCount, 1);
  assert.ok(ir.functions[0]!.blocks.flatMap(b=>b.operations).some(o=>o.kind==='storeGlobal'));
});
test('short circuit emits a branch rather than unconditional RHS evaluation', () => {
  const ir = lower(bind(parse(lex('var x=0;false&&(x=1);'))));
  assert.ok(ir.functions[0]!.blocks.some(b=>b.terminator.kind==='branch'));
});
test('optional chain lowers to nullish branches and one join',()=>{
 const ir=lower(bind(parse(lex('let o=null;console.log(o?.x?.());'))));
 const blocks=ir.functions[0]!.blocks;
 assert.ok(blocks.filter(b=>b.terminator.kind==='branch').length>=2);
 assert.ok(blocks.flatMap(b=>b.operations).some(o=>o.kind==='invoke'));
});
