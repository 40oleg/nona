import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// util.types predicates check the internal slot, not the prototype chain (#470),
// compared with Node.js under GC stress.
const programs: Record<string, string> = {
    "real instances": `
const { types } = process.getBuiltinModule("node:util");
const v = { isDate: new Date(), isMap: new Map(), isSet: new Set(), isRegExp: /x/g, isWeakMap: new WeakMap(), isWeakSet: new WeakSet(), isPromise: Promise.resolve(1), isArrayBuffer: new ArrayBuffer(4) };
for (const k of Object.keys(v)) console.log(k, types[k](v[k]));
console.log(types.isAnyArrayBuffer(v.isArrayBuffer), types.isSharedArrayBuffer(v.isArrayBuffer), types.isNativeError(new TypeError("x")));`,
    "prototype-only objects": `
const { types } = process.getBuiltinModule("node:util");
const c = { isDate: Date, isMap: Map, isSet: Set, isRegExp: RegExp, isWeakMap: WeakMap, isWeakSet: WeakSet, isPromise: Promise, isArrayBuffer: ArrayBuffer };
for (const k of Object.keys(c)) console.log(k, types[k](Object.create(c[k].prototype)), types[k](c[k].prototype), types[k]({}), types[k](null), types[k](1));
console.log(types.isAnyArrayBuffer(Object.create(ArrayBuffer.prototype)), types.isNativeError(Object.create(Error.prototype)), types.isNativeError(Object.setPrototypeOf(new RangeError("x"), null)), types.isNativeError(new (class E extends Error {})()), types.isNativeError({}));`,
    "null prototype": `
const { types } = process.getBuiltinModule("node:util");
const v = { isDate: new Date(), isMap: new Map(), isSet: new Set(), isRegExp: /x/, isWeakMap: new WeakMap(), isWeakSet: new WeakSet(), isPromise: Promise.resolve(1), isArrayBuffer: new ArrayBuffer(4) };
for (const k of Object.keys(v)) { Object.setPrototypeOf(v[k], null); console.log(k, types[k](v[k])); }`,
    "subclass instances": `
const { types } = process.getBuiltinModule("node:util");
class D extends Date {} class M extends Map {} class S extends Set {} class R extends RegExp {} class WM extends WeakMap {} class WS extends WeakSet {} class P extends Promise {} class A extends ArrayBuffer {}
console.log(types.isDate(new D()), types.isMap(new M()), types.isSet(new S()), types.isRegExp(new R("x")), types.isWeakMap(new WM()), types.isWeakSet(new WS()), types.isPromise(P.resolve(1)), types.isArrayBuffer(new A(2)));
console.log(types.isMap(new S()), types.isSet(new M()), types.isWeakMap(new WS()), types.isDate(new M()));`,
};
for (const [name, source] of Object.entries(programs))
    test(`util.types brand checks: ${name}`, () => {
        const expected = runOracle(source).stdout;
        const run = runOnHost(source);
        assert.equal(run.error, undefined);
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout, expected);
    });
