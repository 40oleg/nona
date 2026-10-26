import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// structuredClone (src/lib/runtime/structured-clone.js).
function expectOracle(source: string): void {
    const expected = runOracle(source).stdout;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, expected);
}

test("structuredClone clones the issue example", () =>
    expectOracle(`
const src = { a: [1, new Map([[1, { b: 2 }]])], d: new Date(0), s: new Set([1]), u: new Uint8Array([1, 2]) };
src.self = src;
const c = structuredClone(src);
console.log(c !== src, c.self === c, c.a[1].get(1).b, c.d.getTime(), c.s.has(1), c.u[1]);
try { structuredClone(() => 1); } catch (e) { console.log(e.name); }
`));

test("structuredClone preserves cycles, shared references and holes", () =>
    expectOracle(`
var shared = { n: 1 }, a = [shared, shared, , 4];
a.extra = "x"; a.push(a);
var c = structuredClone(a);
console.log(c.length, c[0] === c[1], c[0] !== shared, 2 in c, c.extra, c[4] === c);
var m = new Map(); m.set(m, m); m.set("s", new Set([m]));
var cm = structuredClone(m);
console.log(cm.get(cm) === cm, cm.get("s").has(cm), cm !== m);
var o = { get g() { return 5; }, [Symbol("k")]: 1, f: 2 };
var co = structuredClone(o);
console.log(Object.keys(co).join(), Object.getOwnPropertyDescriptor(co, "g").value, Object.getOwnPropertySymbols(co).length);
class P { constructor() { this.x = 1; } }
var cp = structuredClone(new P());
console.log(cp.x, cp instanceof P, Object.getPrototypeOf(cp) === Object.prototype);
console.log(structuredClone(1n), structuredClone("s"), structuredClone(null), structuredClone(undefined), Object.is(structuredClone(-0), -0));
`));

test("structuredClone clones RegExp, Date and boxed primitives", () =>
    expectOracle(`
var r = /a(b)/gi; r.lastIndex = 3;
var cr = structuredClone(r);
console.log(cr.source, cr.flags, cr.lastIndex, cr !== r);
var d = new Date(12345), cd = structuredClone(d);
console.log(cd.getTime(), cd instanceof Date, cd !== d, isNaN(structuredClone(new Date(NaN))));
var b = [new Boolean(false), new Number(3), new String("str"), Object(5n)].map(function (x) { return structuredClone(x); });
console.log(b.map(function (x) { return typeof x + ":" + Object.prototype.toString.call(x) + ":" + x.valueOf(); }).join());
`));

test("structuredClone clones Map and Set nesting", () =>
    expectOracle(`
var v = { k: [1] };
var m = new Map([[v, new Set([v, 2])], ["a", new Map([[1, 2]])]]);
var c = structuredClone(m);
var keys = [...c.keys()], inner = c.get(keys[0]);
console.log(c.size, keys[0] !== v, keys[0].k[0], inner.size, [...inner][0] === keys[0], c.get("a").get(1));
`));

test("structuredClone keeps views sharing one cloned buffer", () =>
    expectOracle(`
var buf = new ArrayBuffer(8), u8 = new Uint8Array(buf), u16 = new Uint16Array(buf, 2, 2), dv = new DataView(buf, 4, 4);
u8.set([1, 2, 3, 4, 5, 6, 7, 8]);
var c = structuredClone({ buf, u8, u16, dv, f: new Float64Array([1.5, 2]), bi: new BigInt64Array([5n]) });
console.log(c.buf !== buf, c.u8.buffer === c.buf, c.u16.buffer === c.buf, c.dv.buffer === c.buf);
console.log(c.u16.byteOffset, c.u16.length, c.dv.byteOffset, c.dv.byteLength, c.f[0], c.bi[0], c.f.constructor.name);
c.u8[0] = 99;
console.log(u8[0], c.u16[0], c.buf.byteLength);
console.log(structuredClone(Buffer.from("ab")).constructor.name);
`));

test("structuredClone clones Error types with cause", () =>
    expectOracle(`
for (var C of [Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError]) {
    var e = new C("msg", { cause: { n: 1 } }), c = structuredClone(e);
    console.log(c.name, c.message, c instanceof C, c.cause.n, c.stack === e.stack, Object.keys(c).length);
}
var custom = new Error("m"); custom.name = "Weird";
var cc = structuredClone(custom);
console.log(cc.name, cc instanceof Error);
var nested = new Error("outer", { cause: new TypeError("inner") });
console.log(structuredClone(nested).cause instanceof TypeError, "cause" in structuredClone(new Error("x")));
`));

test("structuredClone throws DataCloneError for uncloneable values", () =>
    expectOracle(`
var t = function (v) {
    try { structuredClone(v); console.log("no error"); }
    catch (e) { console.log(e.name, e.code, e instanceof DOMException, e instanceof Error); }
};
t(function () {}); t(Symbol("s")); t({ a: Symbol("s") }); t({ f() {} }); t([() => 1]);
t(new WeakMap()); t(new WeakSet()); t(Promise.resolve(1)); t(new Map([[1, function () {}]]));
try { structuredClone(); } catch (e) { console.log(e.constructor === TypeError); }
`));

test("structuredClone transfer detaches ArrayBuffers", () =>
    expectOracle(`
var ab = new ArrayBuffer(4), u = new Uint8Array(ab); u.set([1, 2, 3, 4]);
var c = structuredClone({ u }, { transfer: [ab] });
console.log(ab.byteLength, u.length, c.u.length, c.u[3], c.u.buffer.byteLength);
var t = function (f) { try { f(); console.log("no error"); } catch (e) { console.log(e.name); } };
t(function () { structuredClone(1, { transfer: [{}] }); });
var b = new ArrayBuffer(1);
t(function () { structuredClone(1, { transfer: [b, b] }); });
console.log(b.byteLength);
t(function () { structuredClone(ab); });
var z = new ArrayBuffer(2);
t(function () { structuredClone(function () {}, { transfer: [z] }); });
console.log(z.byteLength);
`));
