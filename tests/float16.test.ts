import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { emitRuntime } from "../src/runtime/index.js";
import { compile, hostTarget } from "../src/compiler.js";
import { requireHostTarget } from "../src/target.js";
import { fullRuntimeLink } from "../src/link.js";

// Node.js before 24 has the half-precision built-ins behind a V8 flag.
const oracleFlags =
    typeof (Math as { f16round?: unknown }).f16round === "function"
        ? []
        : ["--js-float16array"];

function compareWithOracle(source: string, gcStress = true): void {
    const expected = runOracle(source, { flags: oracleFlags }).stdout;
    const run = runOnHost(source, { gcStress });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, expected);
}

test("Math.f16round rounds to nearest, ties to even", () =>
    compareWithOracle(`
var f = Math.f16round, p = Math.pow;
function show(x) { var r = f(x); return Object.is(r, -0) ? '-0' : String(r); }
console.log([0, -0, NaN, Infinity, -Infinity, 65504, 65519.99, 65520, -65520, 1e300, -1e-300].map(show).join());
console.log([5.960464477539063e-8, 5.960464477539063e-8 / 2, -5.960464477539063e-8 / 2, 2.98023223876953125e-8 * (1 + p(2, -52)), 2.98023223876953125e-8 * (1 - p(2, -53)), 3 * 2.98023223876953125e-8, 5 * 2.98023223876953125e-8].map(show).join());
console.log([1 + p(2, -11), 1 + p(2, -11) + p(2, -40), 1 + 3 * p(2, -11), 1 - p(2, -12), 1.337, -2.5, 1 / 3, 0.1].map(show).join());
console.log([p(2, -14), p(2, -14) - p(2, -25), p(2, -14) - p(2, -24), p(2, -15), 6.097555160522461e-5, 1e-5, -3.0517578125e-5, 4e-8].map(show).join());
console.log(f(), f(undefined), f('1.5'), f({ valueOf: function () { return 2049; } }), f(true), f(null), f(4099));
`));

// The loops are long: they run in full without stress GC and sampled under it.
const randomDoubles = (count: number) => `
var s = 0x2545f491, d = new DataView(new ArrayBuffer(8)), out = [];
function next() { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s >>> 0; }
function bits(x) { if (x !== x) return 'NaN'; d.setFloat64(0, x); return d.getUint32(0).toString(16) + ':' + d.getUint32(4).toString(16); }
for (var i = 0; i < ${count}; i++) {
    var r = next(), hi, lo = next(), kind = i % 4;
    if (kind === 0) { hi = r; }
    else if (kind === 1) { hi = (r & 0x80000000) | ((990 + (r >>> 20) % 50) << 20) | (next() & 0xfffff); }
    else if (kind === 2) { hi = (r & 0x80000000) | ((997 + (r >>> 20) % 35) << 20) | (next() & 0xffc00) | 0x200; lo = 0; }
    else { hi = (r & 0x80000000) | ((997 + (r >>> 20) % 35) << 20) | (next() & 0xffc00) | 0x1ff; lo = 0xffffffff; }
    d.setUint32(0, hi >>> 0); d.setUint32(4, lo >>> 0);
    out.push(bits(Math.f16round(d.getFloat64(0))));
    if (out.length === 50) { console.log(out.join()); out = []; }
}
`;
test("Math.f16round matches Node.js on many doubles", () => {
    compareWithOracle(randomDoubles(3000), false);
    compareWithOracle(randomDoubles(100));
});

test("Math.f16round and DataView float16 methods are ordinary built-ins", () =>
    compareWithOracle(`
function describe(o, k) { var d = Object.getOwnPropertyDescriptor(o, k); return [k, typeof d.value, d.writable, d.enumerable, d.configurable, d.value.length, d.value.name, Object.keys(d.value).length].join(); }
console.log(describe(Math, 'f16round'));
console.log(describe(DataView.prototype, 'getFloat16'));
console.log(describe(DataView.prototype, 'setFloat16'));
try { new Math.f16round(1); } catch (e) { console.log(e.name); }
try { DataView.prototype.getFloat16.call({}, 0); } catch (e) { console.log(e.name); }
try { DataView.prototype.setFloat16.call(new ArrayBuffer(2), 0, 1); } catch (e) { console.log(e.name); }
`));

test("DataView get/setFloat16: endianness, conversions and bounds", () =>
    compareWithOracle(`
var b = new ArrayBuffer(6), v = new DataView(b, 1, 4), bytes = new Uint8Array(b);
console.log(v.setFloat16(0, 1.337), v.setFloat16(2, -65504, true));
console.log(bytes.join(), v.getUint16(0), v.getUint16(2, true), v.getFloat16(0), v.getFloat16(2, true), v.getFloat16(0, true), v.getFloat16(2));
v.setFloat16(0, 70000, 1); v.setFloat16(2, -1e-8, 0); console.log(bytes.join(), v.getFloat16(0, 'yes'), Object.is(v.getFloat16(2), -0));
v.setFloat16(0, 5.960464477539063e-8); console.log(v.getUint16(0), v.getFloat16(0));
v.setFloat16(1.9, '0.5'); console.log(v.getFloat16(1), v.getFloat16('1'), v.getFloat16(1.5), bytes.join());
v.setFloat16(0); console.log(v.getFloat16(), v.getFloat16(NaN), v.getFloat16(undefined, true));
v.setFloat16(2, Infinity); console.log(v.getFloat16(2), v.getUint16(2).toString(16));
var log = '';
function value(x) { return { valueOf: function () { log += x; return 1; } }; }
for (var offset of [3, 4, -1, Infinity, -Infinity, 2 ** 53]) {
    try { v.getFloat16(offset); console.log('read', offset); } catch (e) { console.log('get', offset, e.name); }
    try { v.setFloat16(offset, value('v')); console.log('wrote', offset); } catch (e) { console.log('set', offset, e.name, log); }
    log = '';
}
try { v.getFloat16({ valueOf: function () { throw new Error('index'); } }); } catch (e) { console.log(e.message); }
try { v.setFloat16(0, { valueOf: function () { throw new Error('value'); } }); } catch (e) { console.log(e.message); }
v.setFloat16(2, value('a'), { valueOf: function () { log += 'endian'; } }); console.log(log, v.getFloat16(2));
`));

test("DataView float16 methods reject a detached buffer after converting", () =>
    compareWithOracle(`
var detach = typeof ArrayBuffer.__nonaDetachInternal === 'function' ? ArrayBuffer.__nonaDetachInternal : function (b) { b.transfer(); };
var b = new ArrayBuffer(4), v = new DataView(b), calls = 0;
detach(b);
try { v.getFloat16(0); } catch (e) { console.log(e.name); }
try { v.getFloat16(8); } catch (e) { console.log(e.name); }
try { v.getFloat16(-1); } catch (e) { console.log(e.name); }
try { v.setFloat16(0, { valueOf: function () { calls++; return 1; } }); } catch (e) { console.log(e.name, calls); }
try { v.setFloat16(8, { valueOf: function () { calls++; return 1; } }); } catch (e) { console.log(e.name, calls); }
try { v.setFloat16(Infinity, { valueOf: function () { calls++; return 1; } }); } catch (e) { console.log(e.name, calls); }
`));

const bitPatterns = (step: number) => `
var v = new DataView(new ArrayBuffer(2)), d = new DataView(new ArrayBuffer(8)), hash = 0, nans = 0, mismatches = 0, zeros = '';
for (var h = 0; h < 0x10000; h += ${step}) {
    v.setUint16(0, h, h & 1);
    var x = v.getFloat16(0, h & 1);
    if (x !== x) { nans++; hash = (Math.imul(hash, 31) + 12345) | 0; continue; }
    d.setFloat64(0, x);
    hash = (Math.imul(hash, 31) + d.getUint32(0)) | 0;
    hash = (Math.imul(hash, 31) + d.getUint32(4)) | 0;
    if (Math.f16round(x) !== x) mismatches++;
    v.setFloat16(0, x, h & 2);
    if (v.getUint16(0, h & 2) !== h) mismatches++;
    if (x === 0) zeros += Object.is(x, -0) ? '-' : '+';
}
v.setFloat16(0, NaN); var y = v.getFloat16(0);
console.log(hash, nans, mismatches, zeros, y !== y, (v.getUint16(0) & 0x7c00) === 0x7c00 && (v.getUint16(0) & 0x3ff) !== 0);
`;
test("every binary16 bit pattern round-trips through DataView", () => {
    compareWithOracle(bitPatterns(1), false);
    compareWithOracle(bitPatterns(0x3f1));
});

test("float16 built-ins are linked only when a program can reach them", () => {
    const runtime = emitRuntime({ operations: new Set(), float16: false });
    const names = new Set(runtime.fragments.map((f) => f.name));
    for (const symbol of [
        "rt.float16FromDouble",
        "rt.float16ToDouble",
        "rt.Math.f16round.fn",
        "rt.dataViewGetFloat16.fn",
        "rt.dataViewSetFloat16.fn",
        "rt.Float16Array",
        "rt.float16arrayPrototype",
        "rt.float16Convert.fn",
    ]) {
        assert.ok(!names.has(symbol), symbol);
        assert.ok(
            emitRuntime({ operations: new Set() }).fragments.some(
                (f) => f.name === symbol,
            ),
            symbol,
        );
    }
    // Without the part the methods and Float16Array are absent; a computed
    // name does not select it.
    const source = `var k = 'f16' + 'round', g = 'get' + 'Float16', c = 'Float' + '16Array';
console.log(typeof Math[k], typeof DataView.prototype[g], typeof globalThis[c], c in globalThis, Math.fround(1.1));`;
    const off = runOnHost(source, {
        gcStress: false,
        link: { ...fullRuntimeLink, float16: false },
    });
    assert.equal(off.status, 0, off.stderr);
    assert.equal(
        off.stdout,
        "undefined undefined undefined false 1.100000023841858\n",
    );
    const on = runOnHost(source, { gcStress: false });
    assert.equal(
        on.stdout,
        "function function function true 1.100000023841858\n",
    );
    // A program without float16 names has the same size as before the feature.
    const target = hostTarget ?? requireHostTarget();
    const size = (text: string, link: string[] = []) => {
        const result = compile(text, { fileName: "/app.js", target, link });
        assert.ok(result.ok);
        return result.image.length;
    };
    const plain =
        "console.log(Math.fround(1.1), new DataView(new ArrayBuffer(4)).getFloat32(0));";
    assert.ok(size(plain) < size(plain, ["float16"]));
    assert.ok(size(plain) < size(plain + "Math.f16round(1);"));
    const typed = "console.log(new Float32Array([1.1]).sort().join());";
    assert.ok(size(typed) < size(typed + "new Float16Array(1);"));
});

test("Float16Array construction, rounding on store and conversions", () =>
    compareWithOracle(`
function show(a) { return Array.prototype.map.call(a, function (x) { return Object.is(x, -0) ? '-0' : String(x); }).join(); }
var p = Math.pow, tiny = 2.98023223876953125e-8;
var a = new Float16Array([1, 1.337, 65504, 65519.99, 65520, -65520, -0, NaN, tiny, -tiny, tiny * (1 + p(2, -52)), 3 * tiny, 1 + p(2, -11), 1 + 3 * p(2, -11), 0.1, 1e-5]);
console.log(a.length, a.byteLength, a.BYTES_PER_ELEMENT, Float16Array.BYTES_PER_ELEMENT, show(a));
console.log(show(new Float16Array(3)), show(new Float16Array(new Set([2.5, '1.5', true]))), show(new Float16Array({ length: 2, 0: 4099, 1: '-2049' })));
var f32 = new Float32Array([1.337, 70000, 1e-8, -0, NaN]), f64 = new Float64Array([65519.99, 65520, tiny * 3, 1 / 3]);
var h32 = new Float16Array(f32), h64 = new Float16Array(f64);
console.log(show(h32), show(h64), show(new Float32Array(h32)), show(new Float64Array(h64)), show(new Uint8Array(new Float16Array([300.5, -1, 2.75]))));
var buffer = new ArrayBuffer(10), view = new Float16Array(buffer, 2, 3), bytes = new Uint8Array(buffer), dv = new DataView(buffer);
view[0] = 1.5; view[1] = -2; view[2] = 65520; view[3] = 7;
console.log(view.length, view.byteOffset, bytes.join(), dv.getFloat16(2, true), dv.getFloat16(4, true), dv.getFloat16(6, true), view[3]);
dv.setFloat16(4, 0.333, true); dv.setUint16(6, 0x7e01, true); console.log(view[1], view[2], show(new Float16Array(buffer, 8)));
var x = new Float16Array(2); x[0] = '1.5'; x[1] = { valueOf: function () { return 2049; } };
console.log(show(x), Object.getOwnPropertyDescriptor(x, 1).value, Reflect.set(x, 0, 4099), x[0]);
Object.defineProperty(x, 0, { value: -1e-8 }); console.log(show(x));
try { new Float16Array(buffer, 1); } catch (e) { console.log(e.name); }
try { new Float16Array(new ArrayBuffer(3)); } catch (e) { console.log(e.name); }
try { Float16Array(2); } catch (e) { console.log(e.name); }
`));

test("Float16Array prototype methods", () =>
    compareWithOracle(`
function show(a) { return Array.prototype.map.call(a, function (x) { return Object.is(x, -0) ? '-0' : String(x); }).join(); }
var t = new Float16Array(5); t.set([1.1, 2.2]); t.set(new Float32Array([3.3]), 2); t.set(new Uint8Array([7, 9]), 3);
console.log(show(t), show(t.subarray(1, 3)), show(t.slice(1, 3)), show(t.map(function (x) { return x * 3; })), show(t.filter(function (x) { return x > 2; })));
console.log(show(Float16Array.from([1.0009765625, 1.00048828125])), show(Float16Array.from([1, 2], function (x) { return x / 3; })), show(Float16Array.of(0.1, 0.2, -0)));
console.log(show(new Float16Array(3).fill(1.337)), show(new Float16Array(4).fill(65520, 1, 3)), show(new Float16Array([1, 2, 3, 4, 5]).copyWithin(0, 2)), show(new Float16Array([1, 2, 3]).reverse()));
var c = new Float16Array([1, 2, 3, 4]);
console.log(c.join('|'), c.toString(), c.at(-1), c.reduce(function (s, v) { return s + v; }), c.find(function (v) { return v > 2; }), c.findLastIndex(function (v) { return v < 3; }), c.every(function (v) { return v > 0; }), c.some(isNaN));
console.log([...c.entries()].join(';'), [...c.keys()].join(), [...new Float16Array([0.3])].join(), c.includes(4), c.includes(0.1), c.indexOf(3), c.lastIndexOf(9));
var u = new Uint8Array(8); u.set([1, 2, 3, 4, 5, 6]); var h = new Float16Array(u.buffer, 2, 2); h.set(new Uint8Array(u.buffer, 1, 2)); console.log(u.join(), show(h));
var s = new Float16Array([3, 1, 2]); s.sort(function (x, y) { return y - x; }); console.log(show(s));
console.log(Object.prototype.toString.call(c), c[Symbol.toStringTag], Float16Array.name, Float16Array.length, Object.getPrototypeOf(Float16Array) === Object.getPrototypeOf(Int8Array));
console.log(Object.getOwnPropertyNames(Float16Array).join(), Object.getOwnPropertyNames(Float16Array.prototype).join(), Float16Array.prototype.constructor === Float16Array, Float16Array.prototype.BYTES_PER_ELEMENT);
console.log(String(c), Object.prototype.toString.call(c.slice()), ArrayBuffer.isView(c), Object.prototype.toString.call(Float16Array.prototype));
try { crypto.getRandomValues(new Float16Array(2)); } catch (e) { console.log(e.name); }
`));

// Node.js 22's flagged Float16Array sorts by bit pattern and compares -0
// wrongly in indexOf, so these expectations are the spec results.
test("Float16Array sort and search compare numbers, not bit patterns", () => {
    const source = `
function show(a) { return Array.prototype.map.call(a, function (x) { return Object.is(x, -0) ? '-0' : String(x); }).join(); }
var s = new Float16Array([3, -1, NaN, 0, -0, 2, -Infinity, 0.5, -2, 1e4, -1e4, 0.001]); s.sort(); console.log(show(s));
var a = new Float16Array([1, -0, NaN, 0, 1.337]);
console.log(a.indexOf(NaN), a.includes(NaN), a.lastIndexOf(NaN), a.indexOf(0), a.indexOf(-0), a.lastIndexOf(-0), a.includes(-0), a.includes(1.337), a.indexOf(a[4]), a.indexOf(1, 1));
try { Atomics.load(new Float16Array(new SharedArrayBuffer(4)), 0); } catch (e) { console.log(e.name); }
try { Atomics.store(new Float16Array(4), 0, 1); } catch (e) { console.log(e.name); }
`;
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
        run.stdout,
        "-Infinity,-10000,-2,-1,-0,0,0.0010004043579101562,0.5,2,3,10000,NaN\n" +
            "-1 true -1 1 1 3 true false 4 -1\nTypeError\nTypeError\n",
    );
});

test("Float16Array elements agree byte for byte with DataView float16", () =>
    compareWithOracle(`
var bytes = new Uint8Array(64), h = new Float16Array(bytes.buffer), v = new DataView(bytes.buffer), bad = 0, sum = 0;
for (var i = 0; i < 32; i++) h[i] = (i - 16) * 1234.567 / (i + 1) * Math.pow(2, -(i % 28));
for (var i = 0; i < 32; i++) {
    if (!Object.is(v.getFloat16(2 * i, true), h[i])) bad++;
    v.setFloat16(2 * i, h[i] * 3, true);
    if (!Object.is(Math.f16round(h[i]), h[i])) bad++;
    sum = (Math.imul(sum, 31) + bytes[2 * i] + 256 * bytes[2 * i + 1]) | 0;
}
console.log(bad, sum, bytes.slice(0, 12).join(), Array.prototype.join.call(new Uint16Array(bytes.buffer, 0, 6)));
var w = new Uint16Array([0x0001, 0x03ff, 0x0400, 0x7bff, 0x7c00, 0xfc00, 0x8000, 0x7e00, 0x3c01]);
console.log(Array.prototype.join.call(new Float16Array(w.buffer)), Array.prototype.join.call(new Uint16Array(new Float16Array(new Float16Array(w.buffer)).buffer)));
`));
