import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runOnHost} from './helpers/host.js';

// `typeof x === 'name'` compiles to a test of the value's tag (lower.ts,
// codegen.ts) instead of a type string and a string comparison.
function expectOracle(source:string):void {
 const expected=runOracle(source).stdout;
 const run=runOnHost(source,{gcStress:true});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,expected);
}

test('typeof comparisons with a string literal agree with typeof for every kind of value',()=>expectOracle(`
var values = [undefined, null, true, false, 0, -0, NaN, 1.5, 'x', '', 'a' + String(1), Symbol('s'), 10n, {}, [], function () {}, class {}, () => 1,
  new Proxy({}, {}), new Proxy(function () {}, {}), Proxy.revocable(function () {}, {}).proxy, Object.create(null), new Date(0), /r/, new Map(),
  async function () {}, function* () {}, Math.max.bind(Math), Math.max, new Error('e'), (function () { return arguments; })(), new Uint8Array(2), Object(1), Object('s')];
var rows = [];
values.forEach(function (v) {
  rows.push([typeof v,
    typeof v === 'undefined', typeof v === 'object', typeof v === 'boolean', typeof v === 'number', typeof v === 'string',
    typeof v === 'symbol', typeof v === 'bigint', typeof v === 'function', typeof v === 'Object', typeof v === '',
    typeof v !== 'object', typeof v != 'function', 'string' === typeof v, 'number' !== typeof v, typeof v == 'undefined'].join());
});
console.log(rows.join('\\n'));
console.log(typeof undeclaredVariable === 'undefined', typeof undeclaredVariable !== 'undefined', 'undefined' == typeof alsoUndeclared);
var calls = 0; function f() { calls++; return 1; }
console.log(typeof f() === 'number', calls, typeof (calls++, 'x') !== 'string', calls);
var s = 'abc'; for (var i = 0; i < 3; i++) s += i;
console.log(typeof s === 'string', typeof (s + s) === 'string', typeof s === 'object');
try { typeof tdz === 'undefined'; let tdz = 1; } catch (e) { console.log(e instanceof ReferenceError); }
var o = { get p() { calls++; return null; } };
console.log(typeof o.p === 'object', calls);
if (typeof o === 'object' && typeof o.p !== 'function') console.log('branch');
`));
