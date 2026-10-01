import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';

// Unbounded recursion throws a catchable RangeError on the main stack, inside
// generators (their own stacks) and through getters/proxies; proper tail calls
// in strict code still run at constant depth.
test('stack overflow throws RangeError and the program continues',()=>{
 const run=runOnHost(`function deep(n) { return n === 0 ? 0 : 1 + deep(n - 1); }
let caught = 0; for (let i = 0; i < 3; i++) { try { deep(1e8); } catch (e) { if (e instanceof RangeError) caught++; } }
console.log(caught, deep(1000));
function* g() { try { deep(1e8); } catch (e) { yield e.name; } yield 'after'; }
console.log([...g()].join());
const p = new Proxy({}, { get(t, k, r) { return r[k]; } }); try { p.x; } catch (e) { console.log('proxy', e.name); }
class A { constructor(n) { this.c = n ? new A(n - 1) : null; } } try { new A(1e8); } catch (e) { console.log('ctor', e.name); }
try { deep(1e8); } finally { console.log('finally ran'); }`,{gcStress:false});
 assert.equal(run.status,1);
 assert.equal(run.stdout,'3 1000\nRangeError,after\nproxy RangeError\nctor RangeError\nfinally ran\n');
});

test('proper tail calls do not consume stack',()=>{
 const run=runOnHost(`"use strict"; function count(n, acc) { if (n === 0) return acc; return count(n - 1, acc + 1); } console.log(count(2000000, 0));`,{gcStress:false});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,'2000000\n');
});
