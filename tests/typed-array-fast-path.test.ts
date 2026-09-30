import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';

function expectOracle(source:string,gcStress=true):void {
 const native=runOnHost(source,{gcStress});
 assert.equal(native.error,undefined);
 assert.equal(native.status,0,native.stderr);
 assert.equal(native.stdout,runOracle(source).stdout);
}

test('Number-keyed typed array reads and writes keep integer-indexed semantics',()=>expectOracle(`
var u = new Uint8Array(4); u[0] = 300; u[1] = -1; u[2] = 1.9; u[3] = -1.9;
console.log(u[0], u[1], u[2], u[3], u[4], u[-1], u[1.5], u[NaN], u[-0], u['1'], u['01']);
u[4] = 9; u[-1] = 9; u[1.5] = 9; u[NaN] = 7; u[Infinity] = 1; console.log(u.join(), u[4], Object.keys(u).join());
var i8 = new Int8Array(2); i8[0] = 200; i8[1] = -129; console.log(i8[0], i8[1]);
var u16 = new Uint16Array(2); u16[0] = 70000; u16[1] = -2; var i16 = new Int16Array(1); i16[0] = 40000; console.log(u16[0], u16[1], i16[0]);
var u32 = new Uint32Array(2); u32[0] = -1; u32[1] = 2 ** 40 + 3; var i32 = new Int32Array(2); i32[0] = 4294967295; i32[1] = 2 ** 53; console.log(u32[0], u32[1], i32[0], i32[1]);
var f32 = new Float32Array(3); f32[0] = 0.1; f32[1] = NaN; f32[2] = -0; console.log(f32[0], f32[1], Object.is(f32[2], -0));
var f64 = new Float64Array(2); f64[0] = 0.1; f64[1] = -Infinity; console.log(f64[0], f64[1]);
var c = new Uint8ClampedArray(3); c[0] = 300; c[1] = 1.5; c[2] = -5; console.log(c.join());
var big = new BigInt64Array(1); big[0] = 5n; console.log(big[0], typeof big[0]);
var sub = u.subarray(1, 3); sub[0] = 42; console.log(sub[0], sub[1], sub[2], u[1]);
var view = new Uint16Array(new ArrayBuffer(8), 2, 2); view[1] = 513; console.log(new Uint8Array(view.buffer).join());
u[0] = { valueOf() { return 77; } }; u[1] = '12'; u[2] = true; console.log(u[0], u[1], u[2]);
u['-0'] = 1; u['Infinity'] = 2; u['NaN'] = 3; u['1.5'] = 4; u['1e3'] = 5; u.foo = 6; u['-x'] = 7; u['Inf'] = 8;
console.log(u['-0'], u['Infinity'], u['1e3'], u.foo, u['-x'], u['Inf'], 'Infinity' in u, '1e3' in u, 'foo' in u, u.length, u.byteOffset, Object.keys(u).join());
var o = []; o[0] = 1; o[2.5] = 2; o[1e21] = 3; console.log(o.length, Object.keys(o).join());
var k = { toString() { console.log('key'); return 0; } }; u[k] = 5; console.log(u[0]);
`));

test('typed array fast paths honour proxies and strict mode',()=>expectOracle(`
'use strict';
var u = new Uint8Array([1, 2, 3]);
var p = new Proxy(u, { get(t, k) { return 'proxied ' + String(k); }, set(t, k, v) { console.log('set', String(k), v); return true; } });
console.log(p[0]); p[1] = 5; console.log(u[1]);
u[0] = 9; u[2] = 1.5; console.log(u.join());
console.log(Reflect.apply(String.fromCharCode, null, new Uint16Array([104, 105])), Math.max.apply(null, {length: 3, 0: 1, 1: 5, 2: 3}), Math.min.apply(null, new Proxy([4, 2], {})));
var sum = 0; var big = new Float64Array(5000); for (var i = 0; i < 5000; i++) big[i] = i / 2; for (var j = 0; j < 5000; j++) sum += big[j]; console.log(sum);
`,false));

test('TypedArray.prototype.set copies typed and array sources',()=>expectOracle(`
var a=new Uint8Array(6); a.set(new Float32Array([1.5, 300, -1]), 1); console.log(a.join());
var o=new Uint16Array([1,2,3,4]); o.set(o.subarray(0,3),1); console.log(o.join());
var b=new BigInt64Array(2); b.set(new BigUint64Array([5n, 2n**64n-1n])); console.log(b.join());
try{ new Uint8Array(1).set(new BigInt64Array(1)); }catch(e){console.log(e.name)}
var f=new Float64Array(2); f.set(new Int8Array([-5, 7])); console.log(f.join());
a.set([7,8]); console.log(a.join());
var big = new Uint8Array(3000), copy = new Uint8Array(3000); for (var i = 0; i < 3000; i++) big[i] = i; copy.set(big); console.log(copy[2999], copy[256]);
`,false));
