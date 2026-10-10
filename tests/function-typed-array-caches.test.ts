import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {cachedFunctionKind,typedArrayFields,namedTypedArrayKind} from '../src/runtime/property-cache.js';
import {FunctionKind} from '../src/runtime/functions.js';
import {TypedArrayKind,TypedArrayLayout} from '../src/runtime/typed-array.js';
import {ArrayBufferLayout} from '../src/runtime/array-buffer.js';

// Inline caches for function objects and typed arrays as receivers (#192,
// src/runtime/property-cache.ts): a read site remembers the own property
// node of a function object (static members, `Ctor.prototype`, `f.length`),
// and a `.length` site answers a typed array's length without calling the
// %TypedArray%.prototype.length getter. Every site runs several rounds so the
// later ones hit; the programs change the objects between rounds. Each runs
// with and without GC stress and is compared with Node.js.

function expectProgram(source:string):void {
 const expected=runOracle(source).stdout;
 for(const gcStress of [true,false]){
  const native=runOnHost(source,{gcStress});
  assert.equal(native.error,undefined);
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,expected,`gcStress: ${gcStress}`);
 }
}

test('the constants spelled out in property-cache.ts match their definitions',()=>{
 assert.equal(cachedFunctionKind,FunctionKind);
 assert.equal(namedTypedArrayKind,TypedArrayKind);
 assert.deepEqual(typedArrayFields,{buffer:TypedArrayLayout.buffer,length:TypedArrayLayout.length,detached:ArrayBufferLayout.detached});
});

const cases:[string,string][]=[
 ['static members and prototypes of functions and classes',`
function Parser() {} Parser.prototype.next = function () { return 'next'; };
Parser.helper = function (x) { return x + 1; }; Parser.LIMIT = 3;
class Util { static twice(x) { return 2 * x; } static get computed() { return 'getter'; } }
class Sub extends Util {}
const out = [];
for (let round = 0; round < 6; round++) {
  out.push([Parser.helper(round), Parser.LIMIT, Parser.prototype.next(), Util.twice(round), Util.computed, Sub.twice(1), Sub.computed, typeof Sub.prototype].join(','));
  if (round === 1) Parser.LIMIT = 4;
  if (round === 2) delete Parser.LIMIT;
  if (round === 3) { Object.defineProperty(Parser, 'LIMIT', {get() { return 'accessor'; }, configurable: true}); Util.twice = x => -x; }
  if (round === 4) { Object.defineProperty(Parser, 'LIMIT', {value: 'frozen', writable: false, configurable: true}); Sub.twice = () => 'own'; }
}
console.log(out.join(' | '));`],
 ['one site sees many functions',`
const fns = [];
for (let i = 0; i < 20; i++) { const f = function () {}; f.tag = i; if (i % 3 === 0) f.extra = 'x'; fns.push(f); }
fns.push(Object.assign(() => 0, {tag: 'arrow'}));
let s = '';
for (let round = 0; round < 3; round++) for (const f of fns) s += f.tag + ':' + f.extra + ':' + f.length + ':' + f.name + ';';
Function.prototype.extra = 'inherited';
for (const f of fns) s += f.extra;
delete Function.prototype.extra;
console.log(s.length, s.slice(0, 120), s.slice(-60));`],
 ['length and name of functions',`
function three(a, b, c) {}
const bound = three.bind(null, 1);
const out = [];
for (let round = 0; round < 6; round++) {
  out.push([three.length, three.name, bound.length, bound.name, (function () {}).length].join(','));
  if (round === 1) Object.defineProperty(three, 'length', {value: 7});
  if (round === 2) delete three.length;
  if (round === 3) Object.defineProperty(Function.prototype, 'length', {get() { return 'proto'; }, configurable: true});
  if (round === 4) Object.defineProperty(three, 'length', {get() { return 'own getter'; }, configurable: true});
}
console.log(out.join(' | '));`],
 ['typed array length',`
const arrays = [new Uint8Array(3), new Float64Array(5), new Int32Array(new ArrayBuffer(16), 4, 2), new BigInt64Array(1), new Uint8ClampedArray(0)];
class Mine extends Uint16Array {} arrays.push(new Mine(9));
const out = [];
// Rounds 4 and 5 redefine %TypedArray%.prototype.length and
// Float64Array.prototype.length; both are restored before printing, because
// Node.js writes stdout through Buffer (a Uint8Array) and asserts on its length.
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const savedLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length');
for (let round = 0; round < 7; round++) {
  out.push(arrays.map(a => a.length).join(','));
  if (round === 1) Object.defineProperty(arrays[0], 'length', {value: 'own'});
  if (round === 2) Object.setPrototypeOf(arrays[1], {length: 'plain prototype'});
  if (round === 3) Object.defineProperty(Mine.prototype, 'length', {value: 'subclass'});
  if (round === 4) Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype), 'length', {get() { return 'redefined:' + this.byteLength; }, configurable: true});
  if (round === 5) Object.defineProperty(Float64Array.prototype, 'length', {get() { return 'f64'; }, configurable: true});
}
Object.defineProperty(typedArrayPrototype, 'length', savedLength);
delete Float64Array.prototype.length;
out.push(arrays.map(a => a.length).join(','));
console.log(out.join(' | '));
let total = 0; const big = new Uint8Array(64); for (let r = 0; r < 2000; r++) for (let i = 0; i < big.length; i += 8) total += big.length;
console.log(total);`],
 ['functions and typed arrays across collections',`
function F() {} F.count = 0;
let sum = 0;
for (let i = 0; i < 3000; i++) {
  const g = function () {}; g.v = i; sum += g.v + F.count + g.length;
  const t = new Uint8Array(i % 7); sum += t.length;
  F.count = i & 3; const garbage = [i, {i}];
}
console.log(sum);`],
];
for(const [name,source] of cases)test(`function and typed array caches: ${name}`,()=>expectProgram(source));

test('a detached typed array reports length 0 at a cached site',()=>{
 const native=runOnHost(`
const buffer = new ArrayBuffer(8), view = new Uint8Array(buffer), out = [];
for (let round = 0; round < 4; round++) { out.push(view.length); if (round === 1) ArrayBuffer.__nonaDetachInternal(buffer); }
console.log(out.join());`,{gcStress:false});
 assert.equal(native.status,0,native.stderr);
 assert.equal(native.stdout,'8,8,0,0\n');
});

test('typed arrays and functions of another realm keep their own intrinsics',()=>{
 const source=`
var other = __nonaCreateRealm();
var a = new other.Uint8Array(4), b = new Uint8Array(2), f = new other.Function('return 1');
var out = [];
for (var round = 0; round < 4; round++) {
  out.push(a.length + ',' + b.length + ',' + f.length + ',' + f.name);
  if (round === 1) other.Object.defineProperty(other.Object.getPrototypeOf(other.Uint8Array.prototype), 'length', {get: function () { return 'other'; }, configurable: true});
}
console.log(out.join(' | '));`;
 for(const gcStress of [true,false]){
  const native=runOnHost(source,{gcStress,realms:1});
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,'4,2,0,anonymous | 4,2,0,anonymous | other,2,0,anonymous | other,2,0,anonymous\n');
 }
});
