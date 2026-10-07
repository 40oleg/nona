import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lex } from '../src/frontend/lexer.js';
import { parse } from '../src/frontend/parser.js';
import { bind } from '../src/frontend/binder.js';
import { lower } from '../src/ir/lower.js';

test('long literal data concatenations lower without recursive expression frames',()=>{
 const chunks=Array.from({length:1850},(_,i)=>String(i%10));
 const ir=lower(bind(parse(lex('var data='+chunks.map(chunk=>JSON.stringify(chunk)).join('+')+';'))));
 const operations=ir.functions[0]!.blocks.flatMap(block=>block.operations);
 assert.ok(operations.some(op=>op.kind==='constant'&&op.value===chunks.join('')));
 assert.ok(!operations.some(op=>op.kind==='binary'&&op.operator==='+'));
});

test('literal string folding retains numeric additions and operand calls',()=>{
 const ir=lower(bind(parse(lex('var numeric=1+2+"3";var effect="a"+value()+"b";'))));
 const operations=ir.functions[0]!.blocks.flatMap(block=>block.operations);
 assert.equal(operations.filter(op=>op.kind==='binary'&&op.operator==='+').length,4);
 assert.ok(operations.some(op=>op.kind==='invoke'));
});

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
