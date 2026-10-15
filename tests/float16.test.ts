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
    ]) {
        assert.ok(!names.has(symbol), symbol);
        assert.ok(
            emitRuntime({ operations: new Set() }).fragments.some(
                (f) => f.name === symbol,
            ),
            symbol,
        );
    }
    // Without the part the methods are absent; a computed name does not select it.
    const source = `var k = 'f16' + 'round', g = 'get' + 'Float16';
console.log(typeof Math[k], typeof DataView.prototype[g], Math.fround(1.1));`;
    const off = runOnHost(source, {
        gcStress: false,
        link: { ...fullRuntimeLink, float16: false },
    });
    assert.equal(off.status, 0, off.stderr);
    assert.equal(off.stdout, "undefined undefined 1.100000023841858\n");
    const on = runOnHost(source, { gcStress: false });
    assert.equal(on.stdout, "function function 1.100000023841858\n");
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
});
