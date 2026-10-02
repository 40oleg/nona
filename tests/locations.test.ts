import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLiveness} from '../src/ir/liveness.js';
import {assignLocations,destinations} from '../src/ir/locations.js';
import {compileToIR} from '../src/compiler.js';
import type {FunctionIR} from '../src/ir/model.js';

/** Every slot written by an operation has a location of its own among the slots live before it. */
function checkFunction(fn:FunctionIR):void {
 const liveness=analyzeLiveness(fn),{location,count}=assignLocations(fn,liveness);
 assert.equal(location.length,fn.slotCount);
 for(const l of location){assert.ok(l>=0&&l<count,`location ${l} of ${count}`);}
 for(let i=0;i<fn.parameterCount;i++)for(let j=0;j<fn.slotCount;j++)if(j!==i)assert.notEqual(location[i],location[j],`parameter ${i} shares a location with slot ${j} in ${fn.id}`);
 for(const block of fn.blocks){
  const before=liveness.get(block.id)!.before;
  for(const [index,op] of block.operations.entries()){
   const dests=destinations(op);
   for(const d of dests){
    for(const s of before[index]!)if(s!==d)assert.notEqual(location[d],location[s],`${fn.id} block ${block.id} op ${index}: slot ${d} shares a location with live slot ${s}`);
    for(const e of dests)if(e!==d)assert.notEqual(location[d],location[e],`${fn.id}: destinations ${d} and ${e} share a location`);
   }
   if(op.kind==='pushHandler')for(let j=0;j<fn.slotCount;j++)if(j!==op.error)assert.notEqual(location[op.error],location[j],`handler error slot ${op.error} shares a location with slot ${j}`);
  }
 }
}

test('slots with disjoint live ranges share frame locations',()=>{
 const ir=compileToIR('function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); } console.log(fib(10));');
 const fib=ir.functions.find(fn=>fn.name==='fib')!;
 const {count}=assignLocations(fib,analyzeLiveness(fib));
 assert.ok(count<fib.slotCount,`${count} locations for ${fib.slotCount} slots`);
 for(const fn of ir.functions)checkFunction(fn);
});

test('locations never alias live slots, parameters or handler error slots',()=>{
 const ir=compileToIR(`
  function f(a, b) { let s = 0; for (let i = 0; i < a; i++) { try { s += g(i, b); } catch (e) { s -= e.length; } finally { s++; } } return s; }
  function g(x, y) { if (x > y) throw "big"; return x * y; }
  function* gen(n) { for (let i = 0; i < n; i++) yield i; }
  async function h(p) { const v = await p; return [...gen(v)].map(x => x + 1); }
  class C { constructor(w) { this.w = w; } m() { return this.w; } }
  class D extends C { constructor() { super(1); this.z = super.m(); } }
  console.log(f(3, 2), new D().z);
 `);
 for(const fn of ir.functions)checkFunction(fn);
});
