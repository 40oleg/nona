import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compileToIR } from "../src/compiler.js";

// Scalar replacement of non-escaping object and array literals (#236): a
// literal only read through constant own keys becomes slots. The IR checks
// say which functions keep their allocation; every program runs with and
// without GC stress and is compared with Node.js.

function expectProgram(source: string): void {
    const expected = runOracle(source).stdout;
    for (const gcStress of [true, false]) {
        const native = runOnHost(source, { gcStress });
        assert.equal(native.error, undefined);
        assert.equal(native.status, 0, native.stderr);
        assert.equal(native.stdout, expected, `gcStress: ${gcStress}`);
    }
}

/** The number of newObject operations of each named function. */
function allocations(source: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const fn of compileToIR(source).functions)
        result[fn.name] = fn.blocks.reduce(
            (n, block) =>
                n +
                block.operations.filter((op) => op.kind === "newObject").length,
            0,
        );
    return result;
}

const replaced = `
function getArea(width, height) { const rectangle = { width, height }; return rectangle.width * rectangle.height; }
function sumPair(a, b) { const p = [a, b]; return p[0] + p[1] + p.length; }
function loop(n) { let s = 0; for (let i = 0; i < n; i++) { const o = { x: i, y: -i }; s += o.x * 2 + o.y; } return s; }
function tdz(v) { let o = { v, w: [v] }; return o.v; }
function lets(v) { let o; o = { v }; const q = o; return q.v; }
function keys(a) { const o = { length: a, 'quoted key': a + 1 }; return o.length + o['quoted key']; }
function elements(a) { const p = [a, -0, NaN, 's', { k: a }]; return [Object.is(p[1], -0), p[2], p[3] + p[0], p[4].k, p.length]; }
function duplicate(f) { const o = { a: f('a'), b: f('b'), a: f('c') }; return o.a + o.b; }
function conditional(c) { const o = { yes: 1, no: 2 }; return c ? o.yes : o.no; }
function swap(a, b) { const t = [b, a]; a = t[0]; b = t[1]; return a + '/' + b; }
`;

test("scalar replacement: non-escaping literals lose their allocation", () => {
    const counts = allocations(replaced);
    for (const name of [
        "getArea",
        "sumPair",
        "loop",
        "lets",
        "keys",
        "duplicate",
        "conditional",
        "swap",
    ])
        assert.equal(counts[name], 0, name);
    // The inner literal only escapes into the outer one, which is replaced.
    assert.equal(counts["tdz"], 0);
    // The object in the array goes too; only the returned array remains.
    assert.equal(counts["elements"], 1);
});

test("scalar replacement: replaced literals compute the same values", () =>
    expectProgram(`${replaced}
const order = [];
const f = (k) => (order.push(k), k);
console.log(getArea(3, 4), getArea(-0, 5), getArea(NaN, 1), getArea('2', '3'));
console.log(sumPair(1, 2), sumPair('a', 'b'), sumPair({}, 1), sumPair(-0, -0));
console.log(loop(10), tdz({ z: 1 }).z, lets(-0), keys(5), keys('x'));
console.log(JSON.stringify(elements(7)), duplicate(f), order.join(), conditional(true), conditional(0));
console.log(swap(1, 2), swap('x', { toString() { return 'y'; } }));`));

const escaping = `
const sink = [];
function passed(a) { const o = { a }; sink.push(o); return o.a; }
function returned(a) { const o = { a }; return o; }
function captured(a) { const o = { a }; return () => o.a; }
function compared(a) { const o = { a }; const b = o; return [o === b, o.a]; }
function forIn(a) { const o = { a, b: 2 }; const ks = []; for (const k in o) ks.push(k); return ks.join() + o.a; }
function keysOf(a) { const o = { a }; return Object.keys(o).join() + o.a; }
function spreadObject(a) { const o = { a }; const c = { ...o }; return c.a + o.a; }
function spreadArray(a) { const p = [a, 2]; return [...p].length + p[0]; }
function json(a) { const o = { a }; return JSON.stringify(o) + o.a; }
function alias(a) { const o = { x: a }; const b = o; b.x = 5; return o.x; }
function assigned(a) { const o = { x: a }; o.x = 1; return o.x; }
function deleted(a) { const o = { x: a }; delete o.x; return o.x; }
function has(a) { const o = { x: a }; return ('x' in o) + o.x; }
function computed(a, k) { const o = { x: a }; return o[k]; }
function index(a, i) { const p = [a, a]; return p[i]; }
function method(a) { const o = { a, get() { return this.a; } }; return o.get() + o.a; }
function proto(a) { const o = { __proto__: { inherited: 1 }, a }; return o.inherited + o.a; }
function accessor(a) { const o = { get a() { return a; }, b: 1 }; return o.a + o.b; }
function typed(a) { const o = { a }; return typeof o + o.a; }
function thrown(a) { const o = { a }; try { throw o; } catch (e) { return e.a; } }
function stale(n) { let keep, s = 0; for (let i = 0; i < n; i++) { const o = { x: i }; if (i === 0) keep = o; s += keep.x; } return s; }
function previous(n) { let o = { x: 0 }; for (let i = 0; i < n; i++) o = { x: o.x + 1 }; return o.x; }
function maybe(c) { var o; if (c) o = { x: 1 }; try { return o.x; } catch (e) { return e.constructor.name; } }
`;

test("scalar replacement: escaping literals keep their allocation", () => {
    const counts = allocations(escaping);
    for (const name of [
        "passed",
        "returned",
        "captured",
        "compared",
        "forIn",
        "keysOf",
        "json",
        "alias",
        "assigned",
        "deleted",
        "has",
        "computed",
        "index",
        "method",
        "proto",
        "accessor",
        "typed",
        "thrown",
        "stale",
        "maybe",
    ])
        assert.ok(counts[name]! >= 1, name);
    assert.ok(counts["spreadObject"]! >= 2);
    assert.ok(counts["spreadArray"]! >= 2);
    assert.equal(counts["previous"], 2);
});

test("scalar replacement: escaping literals behave as before", () =>
    expectProgram(`${escaping}
console.log(passed(1), sink.length, returned(2).a, captured(3)(), JSON.stringify(compared(4)));
console.log(forIn(5), keysOf(6), spreadObject(7), spreadArray(8), json(9));
console.log(alias(1), assigned(2), deleted(3), has(4), computed(5, 'x'), computed(5, 'y'), index(6, 1), index(6, 2));
console.log(method(1), proto(2), accessor(3), typed(4), thrown(5), stale(5), previous(4), maybe(true), maybe(false));`));

test("scalar replacement: missing keys read inherited getters", () => {
    const source = `
Object.defineProperty(Object.prototype, 'missing', { get() { return 'object getter'; }, configurable: true });
Object.defineProperty(Array.prototype, 2, { get() { return 'array getter'; }, configurable: true });
Object.defineProperty(Array.prototype, 'first', { get() { return this[0]; }, configurable: true });
function key(a) { const o = { a }; return o.missing + o.a; }
function outside(a) { const p = [a, a]; return p[2] + p[0]; }
function named(a) { const p = [a]; return p.first; }
console.log(key(1), outside(2), named(3), [1, 2].length);`;
    const counts = allocations(source);
    for (const name of ["key", "outside", "named"])
        assert.equal(counts[name], 1, name);
    expectProgram(source);
});

test("scalar replacement: initializers keep their order and exceptions", () => {
    const source = `
const log = [];
const step = (v) => (log.push(v), v);
function ordered() { const o = { a: step(1), b: step(2), c: step(3) }; const p = [step(4), o.c, step(5)]; return o.a + o.b + p[1] + p[2]; }
function throwing(n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    try { const o = { a: step(i), b: i % 2 ? (() => { throw new Error('odd ' + i); })() : i }; s += o.a + o.b; }
    catch (e) { s += '[' + e.message + ']'; }
  }
  return s;
}
function* generator(a) { const o = { x: yield a, y: a }; return o.x + o.y; }
const g = generator(1); g.next();
console.log(ordered(), throwing(4), log.join(), g.next(10).value);`;
    const counts = allocations(source);
    for (const name of ["ordered", "throwing", "generator"])
        assert.equal(counts[name], 0, name);
    expectProgram(source);
});

test("scalar replacement: with and direct eval", () => {
    const source = `
function viaWith(a, scope) { const o = { a }; with (scope) { return o.a; } }
function viaEval(a) { const o = { a }; return eval('o.a') + o.a; }
function evalAssigns(a) { let o = { a }; eval('o = { a: 10 }'); return o.a; }
console.log(viaWith(1, {}), viaWith(1, { o: { a: 'shadow' } }), viaEval(2), evalAssigns(3));`;
    const counts = allocations(source);
    assert.equal(counts["viaWith"], 1);
    assert.equal(counts["evalAssigns"], 1);
    expectProgram(source);
});
