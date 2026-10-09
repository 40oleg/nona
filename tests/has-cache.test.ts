import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';

// Caches for `'name' in object` and `hasOwnProperty` on shaped objects
// (src/runtime/has-cache.ts, issue #195). Every site is run several times so
// the second and later rounds hit the cache; the cases change the objects
// and their prototype chains between rounds. Each runs under GC stress
// (which also advances the shape epoch at every collection, so few rounds
// hit) and without it (where the later rounds hit), and is compared with
// Node.js.

function expectProgram(source:string):void {
 const expected=runOracle(source).stdout;
 for(const gcStress of [true,false]){
  const native=runOnHost(source,{gcStress});
  assert.equal(native.error,undefined);
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,expected,`gcStress: ${gcStress}`);
 }
}

const cases:[string,string][]=[
 ['own, inherited and missing keys across shapes',`
class Base { method() { return 1; } }
class Point extends Base { constructor(x) { super(); this.x = x; if (x & 1) this.odd = true; } }
const objects = [new Point(1), new Point(2), {x: 1}, {y: 2, x: 3}, Object.create(null), Object.create({x: 9})];
const rows = [];
for (let round = 0; round < 3; round++)
  for (const o of objects) rows.push(['x' in o, 'odd' in o, 'method' in o, 'toString' in o, 'nothing' in o].map(Number).join(''));
console.log(rows.join(' '));`],
 ['a key added to or removed from the chain after the cache filled',`
const top = {}; const middle = Object.create(top); const leaf = Object.create(middle); leaf.own = 1;
const log = [];
for (let round = 0; round < 8; round++) {
  log.push(('deep' in leaf) + '/' + ('own' in leaf) + '/' + ('mid' in leaf));
  if (round === 1) top.deep = 1;
  if (round === 2) middle.mid = 2;
  if (round === 3) delete top.deep;
  if (round === 4) Object.setPrototypeOf(middle, {deep: 'again'});
  if (round === 5) Object.defineProperty(middle, 'mid', {get() { return 0; }, configurable: true});
  if (round === 6) Object.prototype.deep = 'everywhere';
}
delete Object.prototype.deep;
console.log(log.join(' '));`],
 ['the receiver changes its prototype or its own keys',`
const a = {kind: 'a'}, b = {kind: 'b', extra: 1};
const o = Object.create(a); o.v = 1;
const seen = [];
for (let round = 0; round < 6; round++) {
  seen.push(('extra' in o) + ':' + ('v' in o) + ':' + ('w' in o));
  if (round === 1) Object.setPrototypeOf(o, b);
  if (round === 2) o.w = 1;
  if (round === 3) delete o.v;
  if (round === 4) Object.setPrototypeOf(o, null);
}
console.log(seen.join(' '));`],
 ['chains through arrays, functions, wrappers, proxies and the global object',`
const arr = [1, 2]; arr.tag = 1; const onArray = Object.create(arr); onArray.z = 1;
function fn() {} fn.flag = 1; const onFunction = Object.create(fn); onFunction.z = 1;
const onString = Object.create(new String('abc')); onString.z = 1;
const proxied = Object.create(new Proxy({}, {has(target, key) { return key === 'trap'; }})); proxied.z = 1;
const onGlobal = Object.create(globalThis); onGlobal.z = 1; var scriptGlobal = 1;
const out = [];
for (let round = 0; round < 3; round++) {
  out.push([
    'tag' in onArray, 'length' in onArray, 'push' in onArray,
    'flag' in onFunction, 'name' in onFunction, 'call' in onFunction, 'prototype' in onFunction,
    'length' in onString, 'charAt' in onString,
    'trap' in proxied, 'other' in proxied, 'z' in proxied,
    'scriptGlobal' in onGlobal, 'Math' in onGlobal, 'later' in onGlobal,
  ].map(Number).join(''));
  if (round === 0) { arr.late = 1; fn.late = 1; globalThis.later = 1; }
}
console.log(out.join(' '));`],
 ['hasOwnProperty as a method and through call',`
const hasOwn = Object.prototype.hasOwnProperty;
const proto = {inherited: 1};
const objects = [{a: 1}, {a: 2, b: 3}, Object.create(proto), [1, 2], 'text', Object.assign(Object.create(proto), {a: 0})];
const out = [];
for (let round = 0; round < 3; round++) for (const o of objects) {
  const key = round === 2 ? 'b' : 'a';
  out.push([hasOwn.call(o, 'a'), hasOwn.call(o, key), hasOwn.call(o, 'inherited'), hasOwn.call(o, '0'), hasOwn.call(o, 'length'),
    typeof o === 'object' && o.hasOwnProperty('a'), typeof o === 'object' && o.hasOwnProperty(key)].map(Number).join(''));
}
console.log(out.join(' '));
const late = {a: 1}; const r = [];
for (let round = 0; round < 4; round++) { r.push(late.hasOwnProperty('b') + '' + hasOwn.call(late, 'a')); if (round === 1) late.b = 2; if (round === 2) delete late.a; }
console.log(r.join(' '));`],
 ['keys that are not plain strings, and replaced callees',`
const hasOwn = Object.prototype.hasOwnProperty;
const sym = Symbol('s'); const o = {a: 1, 1: 'one'}; o[sym] = 2;
const out = [];
for (let round = 0; round < 3; round++) {
  out.push([o.hasOwnProperty(sym), o.hasOwnProperty(1), o.hasOwnProperty('1'), o.hasOwnProperty(1.5), hasOwn.call(o, {toString() { return 'a'; }}), o.hasOwnProperty()].map(Number).join(''));
}
console.log(out.join(' '));
const custom = {hasOwnProperty(key) { return 'custom ' + key; }};
const fake = {call(self, key) { return 'fake ' + key; }};
for (let round = 0; round < 2; round++) console.log(custom.hasOwnProperty('x'), fake.call({}, 'y'), Function.prototype.call.call(hasOwn, {y: 1}, 'y'));
let calls = 0; const counted = {get hasOwnProperty() { calls++; return hasOwn; }, z: 1};
for (let round = 0; round < 3; round++) counted.hasOwnProperty('z');
console.log(calls);
try { hasOwn.call(null, 'a'); } catch (e) { console.log(e.constructor.name); }
try { hasOwn.call(undefined, 'a'); } catch (e) { console.log(e.constructor.name); }
try { console.log('x' in 1); } catch (e) { console.log(e.constructor.name); }
const shadow = Object.create({hasOwnProperty() { return 'shadowed'; }}); shadow.a = 1; console.log(shadow.hasOwnProperty('a'));`],
 ['many objects and collections keep answers right',`
const objects = [];
for (let i = 0; i < 400; i++) { const o = {}; o['k' + (i % 7)] = i; o.common = i; objects.push(o); }
let inCount = 0, ownCount = 0;
for (let round = 0; round < 5; round++) for (const o of objects) {
  if ('k3' in o) inCount++;
  if (o.hasOwnProperty('k' + (round % 7))) ownCount++;
  const garbage = {a: [round], b: 'x' + round};
}
console.log(inCount, ownCount);`],
];
for(const [name,source] of cases)test(`in/hasOwnProperty caches: ${name}`,()=>expectProgram(source));

test('`in` with a literal name and hasOwnProperty calls get cache records',()=>{
 // The runtime's own JavaScript preludes have sites too: count the program's.
 const records=(source:string)=>generate(compileToIR(source)).fragments.filter(f=>f.name.startsWith('hc.')).length;
 const base=records(`const o = {a: 1};\nconsole.log(o[0], o.a);`);
 assert.equal(records(`const o = {a: 1};\nconsole.log('a' in o, o.hasOwnProperty('a'), Object.prototype.hasOwnProperty.call(o, 'a'), 0 in o, o[0], o.a);`)-base,3);
});
