import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Failed writes throw TypeErrors with the message of other engines (#511).
function expectOracle(source: string): void {
    const expected = runOracle(source).stdout;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, expected);
}

test("assignment to const and class name names the operation", () =>
    expectOracle(`"use strict";
const t = (f) => { try { f(); } catch (e) { console.log(e.constructor === TypeError, e.message); } };
t(() => { const c = 1; c = 2; });
t(() => { const c = 1; c += 2; });
t(() => { class K { static m() { K = 1; } } K.m(); });
t(() => { const f = function g() { g = 1; }; f(); });
`));

test("setPrototypeOf cycles and non-extensible objects name the failure", () =>
    expectOracle(`
const t = (f) => { try { f(); console.log("no error"); } catch (e) { console.log(e.constructor === TypeError, e.message); } };
t(() => { const a = {}; Object.setPrototypeOf(a, Object.create(a)); });
t(() => { const a = {}; a.__proto__ = Object.create(a); });
t(() => { Object.setPrototypeOf(Object.preventExtensions({}), {}); });
`));

test("the issue's failed assignments have the messages of Node.js", () =>
    expectOracle(`"use strict";
const tries = [
    () => { const c = 1; c = 2; },
    () => { Object.freeze({ a: 1 }).a = 2; },
    () => { ({ get v() { return 1; } }).v = 2; },
    () => { Object.preventExtensions({}).x = 1; },
    () => { const a = {}; Object.setPrototypeOf(a, Object.create(a)); },
];
for (const f of tries) { try { f(); } catch (e) { console.log(e instanceof TypeError, e.message); } }
`));

test("failed strict [[Set]] names the property and the object", () =>
    expectOracle(`"use strict";
const t = (f) => { try { f(); console.log("no error"); } catch (e) { console.log(e instanceof TypeError, e.message); } };
t(() => { Object.create(Object.freeze({ a: 1 })).a = 2; });
t(() => { const o = {}; Object.defineProperty(o, "k", { value: 1 }); o.k = 2; });
t(() => { const s = Symbol("s"), o = {}; Object.defineProperty(o, s, { value: 1 }); o[s] = 2; });
t(() => { class Foo { get v() { return 1; } } new Foo().v = 2; });
t(() => { class Foo {} const o = new Foo(); Object.defineProperty(o, "a", { value: 1 }); o.a = 2; });
t(() => { Object.freeze(new (class Foo {})()).a = 2; });
t(() => { Object.freeze([]).push(1); });
t(() => { Object.freeze([])[0] = 1; });
t(() => { Object.freeze([1])[0] = 2; });
t(() => { const a = []; Object.defineProperty(a, "length", { writable: false }); a[0] = 1; });
t(() => { const a = []; Object.defineProperty(a, "length", { writable: false }); a.length = 0; });
t(() => { const o = Object.create(null); Object.defineProperty(o, "a", { value: 1 }); o.a = 2; });
t(() => { const o = Object.create(null); Object.defineProperty(o, "a", { get() {} }); o.a = 2; });
t(() => { (function f() {}).name = 1; });
t(() => { Math.PI = 1; });
t(() => { NaN = 1; });
t(() => { globalThis.Infinity = 1; });
t(() => { "abc".x = 1; });
t(() => { "abc"[0] = 1; });
t(() => { "abc".length = 1; });
t(() => { (5).x = 1; });
t(() => { new String("abc")[1] = "z"; });
`));

test("sloppy writes and Reflect.set still fail silently", () =>
    expectOracle(`
const frozen = Object.freeze({ a: 1 }), getter = { get v() { return 1; } };
frozen.a = 2; frozen.b = 3; getter.v = 2; NaN = 1; "abc".x = 1;
console.log(frozen.a, frozen.b, getter.v, NaN);
console.log(Reflect.set(frozen, "a", 2), Reflect.set(frozen, "b", 2), Reflect.set(getter, "v", 2));
console.log((() => { "use strict"; return Reflect.set(Object.preventExtensions({}), "x", 1); })());
`));
