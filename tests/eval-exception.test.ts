import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';

// The documented eval exception (docs/es2020-contract.md, roadmap 0.19).
test('eval: reflection, non-string arguments and empty sources',()=>{
 const run=runOnHost(`const d = Object.getOwnPropertyDescriptor(globalThis, 'eval');
console.log(typeof eval, eval.name, eval.length, d.writable, d.enumerable, d.configurable, Object.getPrototypeOf(eval) === Function.prototype);
const o = {}; console.log(eval(o) === o, eval(42), eval(), eval(' \\n\\t'), (0, eval)(''));
try { new eval('1'); } catch (e) { console.log(e.name); }`);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,'function eval 1 true false true true\ntrue 42 undefined undefined undefined\nTypeError\n');
});

test('eval and Function with run-time sources throw EvalError',()=>{
 const run=runOnHost(`for (const f of [() => eval(String(1) + ' + 1'), () => (0, eval)(['var x'][0]), () => Function('a', 'return' + ' a'), () => new Function(String(1))]) {
 try { f(); console.log('no error'); } catch (e) { console.log(e.name, e.message.startsWith('Nona compiles ahead of time')); } }`);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,'EvalError true\nEvalError true\nEvalError true\nEvalError true\n');
});
