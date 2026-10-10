import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';

// Element sites (`a[i]`, `a[i] = v`) go through rt.elementGet / rt.elementSet
// (src/runtime/array-elements.ts): dense slots, typed array elements and
// string code units are answered directly; everything else is generic.

function expectOracle(source:string):void {
 const expected=runOracle(source).stdout;
 for(const gcStress of [true,false]){
  const native=runOnHost(source,{gcStress});
  assert.equal(native.error,undefined);
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,expected,`gcStress: ${gcStress}`);
 }
}

test('element reads of dense arrays keep holes, prototype elements and getters',()=>expectOracle(`
var a = [1, 2, , 4];
console.log(a[0], a[1], a[2], a[3], a[4], a[-1], a[1.5], a['1'], a[NaN], a[-0], a[2 ** 53]);
Array.prototype[2] = 'proto'; console.log(a[2], [][2], a.length);
delete Array.prototype[2];
Object.defineProperty(Array.prototype, 5, {get() { return 'getter:' + this.length; }, configurable: true});
console.log(a[5], [1][5]);
delete Array.prototype[5];
Object.prototype[7] = 'objproto'; console.log(a[7], ({})[7]); delete Object.prototype[7];
var d = [1, 2, 3]; Object.defineProperty(d, 0, {get() { return 'g0'; }}); console.log(d[0], d[1]);
var o = {0: 'a', 1: 'b'}; o[2] = 'c'; console.log(o[0], o[1], o[2], o[3], o['0']);
var proto = [, 'inherited']; var child = Object.create(proto); console.log(child[1], child[0]);
var k = {toString() { return '1'; }}; console.log(a[k], [5, 6][true], ({true: 't'})[true]);
var sym = Symbol('s'), so = {[sym]: 'sym'}; console.log(so[sym]);
(function () { console.log(arguments[0], arguments[1]); arguments[0] = 'changed'; console.log(arguments[0]); })('p', 'q');
var fn = function () {}; fn[0] = 'f'; console.log(fn[0]);
try { null[0]; } catch (e) { console.log(e.constructor.name); }
try { undefined[0] = 1; } catch (e) { console.log(e.constructor.name); }
console.log((5)[0], true[0]);
var g = []; for (var i = 0; i < 100; i++) g[i] = i * 2; g.length = 50; console.log(g[49], g[50], g.length);
var sp = []; sp[1000000] = 'far'; console.log(sp[1000000], sp[999999], sp.length);
var sum = 0; for (var j = 0; j < 3000; j++) { g[j % 50] = j; sum += g[j % 50]; } console.log(sum);
`));

test('element writes respect setters, frozen and non-extensible arrays and readonly elements',()=>expectOracle(`
var w = [0, 0, 0]; w[1] = 'x'; w[3] = 'y'; w[10] = 'z'; console.log(w.length, w[1], w[3], w[10], w[5]);
var seen = 0;
Object.defineProperty(Array.prototype, 20, {set(v) { seen = v; }, configurable: true});
var h = []; h[20] = 99; console.log(seen, h.length, h[20]);
delete Array.prototype[20];
var f = Object.freeze([1, 2, 3]); f[0] = 9; console.log(f[0]);
try { (function () { 'use strict'; f[1] = 9; })(); } catch (e) { console.log(e.constructor.name, f[1]); }
var s = Object.seal([1, 2]); s[0] = 7; s[2] = 8; console.log(s[0], s[2], s.length);
var ne = Object.preventExtensions([1, 2]); ne[0] = 5; ne[5] = 6; console.log(ne[0], ne[5], ne.length);
var d = [1, 2, 3]; Object.defineProperty(d, 1, {value: 'ro', writable: false}); d[1] = 'changed'; console.log(d[1]);
try { (function () { 'use strict'; d[1] = 'again'; })(); } catch (e) { console.log(e.constructor.name, d[1]); }
var log = []; var acc = [1, 2]; Object.defineProperty(acc, 0, {set(v) { log.push(v); }, get() { return 'a'; }});
acc[0] = 'set'; console.log(acc[0], log.join());
var p = new Proxy([10, 20], {get(t, k) { return 'proxy:' + String(k); }, set(t, k, v) { console.log('set', k, v); return true; }});
console.log(p[0], p[1]); p[0] = 5;
var ro = {}; Object.defineProperty(ro, 0, {value: 1}); ro[0] = 2; console.log(ro[0]);
`));

test('typed array element sites keep integer-indexed semantics',()=>expectOracle(`
var u8 = new Uint8Array(4), i8 = new Int8Array(2), c8 = new Uint8ClampedArray(2), u16 = new Uint16Array(2), i16 = new Int16Array(2);
var u32 = new Uint32Array(2), i32 = new Int32Array(2), f32 = new Float32Array(2), f64 = new Float64Array(2);
u8[0] = 300; u8[1] = -1; u8[2] = 1.9; u8[3] = NaN; console.log(u8[0], u8[1], u8[2], u8[3], u8[4], u8[-1], u8[1.5], u8[-0]);
i8[0] = 200; i8[1] = -129; c8[0] = 300; c8[1] = 1.5; console.log(i8[0], i8[1], c8[0], c8[1]);
u16[0] = -1; i16[0] = 40000; u32[0] = -1; i32[0] = 3e9; console.log(u16[0], i16[0], u32[0], i32[0]);
f32[0] = 0.1; f64[0] = 0.1; f32[1] = Infinity; f64[1] = -0; console.log(f32[0], f64[0], f32[1], Object.is(f64[1], -0));
u8[1e20] = 5; i32[1] = 2 ** 64 + 7; u8[10] = 1; console.log(u8[1e20], i32[1], u8[10], Object.keys(u8).length);
var big = new BigInt64Array(2); big[0] = 5n; console.log(big[0], typeof big[1]);
try { big[1] = 1; } catch (e) { console.log(e.constructor.name); }
Object.prototype[3] = 'nope'; Object.prototype[9] = 'nope'; console.log(new Uint8Array(4)[3], new Uint8Array(4)[9]); delete Object.prototype[3]; delete Object.prototype[9];
var sub = new Uint8Array(new ArrayBuffer(8), 4, 2); sub[0] = 7; sub[1] = 8; console.log(sub[0], sub[1], new Uint8Array(sub.buffer)[4], new Uint16Array(sub.buffer)[2]);
var calls = 0; u8[0] = {valueOf() { calls++; return 42; }}; u8[1] = '7'; console.log(u8[0], u8[1], calls);
var t = 0; for (var i = 0; i < 4000; i++) { f64[i & 1] = i * 0.5; t += f64[i & 1]; } console.log(t);
`));

test('string element reads give one-unit strings',()=>expectOracle(`
var s = 'h\\u00e9llo\\u20ac\\ud83d\\ude00';
console.log(s[0], s[1], s[5], s[6], s[7], s[-1], s[1.5], s['2'], s[s.length], s.length);
console.log(s[0] === 'h', s[1] === '\\u00e9', typeof s[0], s[0] + s[2], s[0].length, s[255]);
var all = ''; for (var i = 0; i < 256; i++) all += String.fromCharCode(i); var same = true;
for (var j = 0; j < 256; j++) if (all[j] !== String.fromCharCode(j) || all[j].charCodeAt(0) !== j) same = false;
console.log(same);
String.prototype[0] = 'proto0'; String.prototype[9] = 'proto9'; console.log('ab'[0], 'ab'[9]); delete String.prototype[0]; delete String.prototype[9];
var box = new String('xy'); console.log(box[0], box[1], box[2]);
var parts = []; var text = 'abcabc'; for (var k = 0; k < 6000; k++) parts.push(text[k % 6]); console.log(parts.join('').length, parts.slice(0, 7).join(''));
`));

test('element sites of a detached typed array go generic',()=>{
 const native=runOnHost(`
var buffer = new ArrayBuffer(8), view = new Uint8Array(buffer), f = new Float64Array(buffer);
view[0] = 1; console.log(view[0], f.length);
ArrayBuffer.__nonaDetachInternal(buffer);
console.log(view[0], view.length, f[0]); view[0] = 3; f[0] = 1.5; console.log(view[0], f[0], Object.keys(view).length);
`,{gcStress:true});
 assert.equal(native.status,0,native.stderr);
 assert.equal(native.stdout,'1 1\nundefined 0 undefined\nundefined undefined 0\n');
});
