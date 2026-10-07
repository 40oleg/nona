import {test} from 'node:test';
import assert from 'node:assert/strict';
import {propagateCopies, coalesceMoves} from '../src/ir/copies.js';
import type {FunctionIR, Operation, Terminator} from '../src/ir/model.js';

// Hand-built IR pins the production guards corresponding to verification/.
// These tests check the TypeScript pass; they do not prove its correspondence.
function block(operations:Operation[],value=3):FunctionIR {
 return {id:'moves',name:'moves',parameterCount:2,localCount:0,slotCount:5,
  maxArguments:0,blocks:[{id:0,operations,terminator:{kind:'return',value}}]};
}
const add=(numeric=true):Operation=>({kind:'binary',dest:2,operator:'+',left:0,right:1,numeric});
const copy:Operation={kind:'copy',dest:0,source:2};

test('copy forwarding substitutes equal slots at the point of use',()=>{
 const fn=block([{kind:'copy',dest:2,source:0},
  {kind:'binary',dest:3,operator:'+',left:2,right:1}]);
 assert.deepEqual(propagateCopies(fn).blocks[0]!.operations,
  [{kind:'binary',dest:3,operator:'+',left:0,right:1}]);
});

test('source redefinition invalidates an alias instead of changing its snapshot',()=>{
 const fn=block([{kind:'copy',dest:2,source:0},{kind:'constant',dest:0,value:9},
  {kind:'binary',dest:3,operator:'+',left:2,right:0}]);
 assert.deepEqual(propagateCopies(fn).blocks[0]!.operations,fn.blocks[0]!.operations);
});

test('destination redefinition invalidates a forwarded return',()=>{
 const fn=block([{kind:'copy',dest:2,source:0},{kind:'constant',dest:2,value:9}],2);
 const optimized=propagateCopies(fn).blocks[0]!;
 assert.deepEqual(optimized.operations,[{kind:'constant',dest:2,value:9}]);
 assert.deepEqual(optimized.terminator,{kind:'return',value:2});
});

test('coalescing reads operands before overwriting an aliased destination',()=>{
 const result=coalesceMoves(block([add(),copy],0)).blocks[0]!;
 assert.deepEqual(result.operations,[{kind:'binary',dest:0,operator:'+',left:0,right:1,numeric:true}]);
});

test('a temporary observed after the copy prevents coalescing',()=>{
 const fn=block([add(),copy,{kind:'storeGlobal',index:0,source:0}],2);
 assert.deepEqual(coalesceMoves(fn),fn);
});

test('a temporary observed in a successor block prevents coalescing',()=>{
 const fn=block([add(),copy],0);
 fn.blocks[0]!.terminator={kind:'jump',target:1};
 fn.blocks.push({id:1,operations:[{kind:'storeGlobal',index:0,source:0}],
  terminator:{kind:'return',value:2}});
 assert.deepEqual(coalesceMoves(fn),fn);
});

test('generic coercing operations are excluded from destination coalescing',()=>{
 const fn=block([add(false),copy],0);
 assert.deepEqual(coalesceMoves(fn),fn);
});

test('mapped arguments prevent slot alias propagation',()=>{
 const fn=block([{kind:'newArguments',dest:4,parameters:[0,1]},
  {kind:'copy',dest:2,source:0},{kind:'binary',dest:3,operator:'+',left:2,right:1}]);
 assert.strictEqual(propagateCopies(fn),fn);
});

test('dead moves disappear while a live constant and its exact Number bits remain',()=>{
 const fn=block([{kind:'constant',dest:2,value:999},{kind:'constant',dest:3,value:-0}]);
 const optimized=propagateCopies(fn).blocks[0]!;
 assert.equal(optimized.operations.length,1);
 const op=optimized.operations[0]!;
 assert.equal(op.kind,'constant');
 assert.ok(op.kind==='constant'&&Object.is(op.value,-0));
});

test('forwarded returns preserve NaN, negative zero and object identity without arithmetic',()=>{
 const fn=block([{kind:'copy',dest:2,source:0}],2);
 const optimized=propagateCopies(fn).blocks[0]!;
 assert.deepEqual(optimized.operations,[]);
 assert.deepEqual(optimized.terminator,{kind:'return',value:0});
 const returnValue=(term:Terminator,slots:unknown[])=>{
  assert.equal(term.kind,'return');
  return term.kind==='return'?slots[term.value]:undefined;
 };
 const object={identity:1};
 for(const value of [-0,NaN,object]){
  assert.ok(Object.is(returnValue(optimized.terminator,[value]),value));
 }
});
