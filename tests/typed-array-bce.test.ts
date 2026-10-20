import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, compileToIR } from "../src/compiler.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Counted typed array loops are versioned (src/ir/typed-loops.ts, #240): a
// guard on entry selects a copy whose element accesses have no receiver and
// bounds tests, or the original loop.

function expectOracle(source: string, gcStress = true): void {
    const native = runOnHost(source, { gcStress });
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, runOracle(source).stdout);
}

/** The number of versioned loops of the program's own functions. */
function versioned(source: string): number {
    const ir = compileToIR(source, "/app.js");
    let count = 0;
    for (const fn of ir.functions)
        if (!fn.id.startsWith("js.regexpVm."))
            for (const block of fn.blocks)
                for (const op of block.operations)
                    if (op.kind === "call" && op.target === "rt.typedLoopGuard")
                        count++;
    return count;
}

test("which loops are versioned", () => {
    const loop = (body: string, head = "let i = 0; i < a.length; i++") =>
        `function f(a, b, n, g) { let s = 0; for (${head}) { ${body} } return s; }`;
    assert.equal(versioned(loop("s += a[i] * a[i];")), 1);
    assert.equal(
        versioned(loop("a[i] = i * 0.5;", "let i = 0; i < n; i++")),
        1,
    );
    assert.equal(versioned(loop("b[i] = a[i] + 1;")), 1);
    assert.equal(versioned(loop("const v = a[i]; s = s + v;")), 1);
    assert.equal(versioned(loop("if (a[i] > 1) s++; else s--;")), 1);
    // A call, a property other than length, a reassigned receiver, another key.
    assert.equal(versioned(loop("s += g(a[i]);")), 0);
    assert.equal(versioned(loop("s += a[i] + b.x;")), 0);
    assert.equal(versioned(loop("s += a[i]; a = b;")), 0);
    assert.equal(versioned(loop("s += a[i + 1];")), 0);
    assert.equal(versioned(loop("s += a[i]; i += 2;")), 0);
    assert.equal(versioned(loop("s += a[i] instanceof g;")), 0);
    // A bound the loop changes.
    assert.equal(
        versioned(loop("s += a[i]; n--;", "let i = 0; i < n; i++")),
        0,
    );
    // Script bindings at the top level, as in bench/13_typed.js.
    assert.equal(
        versioned(
            "const N = 8; const a = new Float64Array(N); let s = 0;\nfor (let i = 0; i < N; i++) s += a[i];\nconsole.log(s);",
        ),
        1,
    );
});

const helpers = `
function show(x) { return typeof x === 'number' && Object.is(x, -0) ? '-0' : typeof x === 'bigint' ? x + 'n' : String(x); }
function sum(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; }
function sumTo(a, n) { let s = 0; for (let i = 0; i < n; i++) s += a[i]; return s; }
function list(a) { let out = ''; for (let i = 0; i < a.length; i++) out = out + a[i] + ','; return out; }
function fill(a, v) { for (let i = 0; i < a.length; i++) a[i] = v; return a; }
function iota(a) { for (let i = 0; i < a.length; i++) a[i] = i; return a; }
function copy(a, b) { for (let i = 0; i < a.length; i++) b[i] = a[i]; return b; }
function from(a, k) { let out = ''; for (let i = k; i < a.length; i++) out = out + a[i] + ','; return out; }
function signs(a) { let out = ''; for (let i = 0; i < a.length; i++) out = out + (1 / a[i] < 0 ? '-' : '+'); return out; }
`;

test("versioned loops over every element type, with bounds below, at and above the length", () =>
    expectOracle(
        helpers +
            `
const values = [0, 1, -1, 300, -129, 70000, 2 ** 31, 2 ** 32 + 5, 1.5, -1.5, 2.5, NaN, Infinity, -0, 1e20, 0.1];
for (const C of [Uint8Array, Int8Array, Uint8ClampedArray, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array]) {
    const a = new C(values.length);
    for (let i = 0; i < a.length; i++) a[i] = values[i];
    console.log(C.name, list(a), sum(a), sumTo(a, 3), sumTo(a, 2.5), sumTo(a, 100), sumTo(a, NaN), sumTo(a, '4'));
    console.log(list(fill(new C(3), 300.7)), signs(fill(new C(2), -0)), list(iota(new C(4))));
    console.log(list(fill(new C(2), '7')), list(fill(new C(2), true)), list(fill(new C(2), undefined)));
}
for (const C of [BigInt64Array, BigUint64Array]) {
    const a = new C(4);
    for (let i = 0; i < a.length; i++) a[i] = 2n ** 63n + BigInt(i);
    let total;
    try { total = sum(a); } catch (e) { total = e.constructor.name; }
    console.log(C.name, list(a), total);
    try { fill(a, 1); } catch (e) { console.log(e.constructor.name); }
    try { console.log(list(copy(a, new Float64Array(4)))); } catch (e) { console.log(e.constructor.name); }
    console.log(list(fill(a, 5n)), list(copy(a, new C(2))), list(copy(new C(2), a)));
}
const c = new Uint8ClampedArray(6), clamp = [1.5, 2.5, 300, -5, 0.5, NaN];
for (let i = 0; i < c.length; i++) c[i] = clamp[i] + 0;
console.log(list(c), list(copy(new Float64Array([254.5, 255.5, -0.5, 3.49]), new Uint8ClampedArray(4))));
const base = iota(new Uint8Array(12));
console.log(list(base.subarray(3, 7)), sum(new Int16Array(base.buffer, 2, 3)), list(copy(base.subarray(8), new Float32Array(6))));
`,
    ));

test("starts that are negative, fractional, -0 or not Numbers", () =>
    expectOracle(
        helpers +
            `
const a = iota(new Float64Array(5));
for (const k of [0, -0, 2, 4, 5, 9, -1, -0.5, 0.5, 1.5, NaN, Infinity, 2 ** 53]) console.log(show(k), from(a, k));
let out = '';
for (let i = -2; i < a.length; i++) out += show(a[i]) + ',';
for (let i = 0.25; i < a.length; i++) out += show(a[i]) + ',';
for (let i = -0; i < a.length; i++) out += show(a[i]) + ',';
console.log(out);
`,
    ));

test("detached and resizable buffers before and inside the loop", () =>
    expectOracle(
        helpers +
            `
const a = iota(new Float64Array(4));
const moved = a.buffer.transfer();
console.log(a.length, sum(a), sumTo(a, 4), list(fill(a, 1)), new Float64Array(moved).join());
const b = iota(new Int32Array(6));
let s = 0;
for (let i = 0; i < 6; i++) { if (i === 3) b.buffer.transfer(); s += b[i] === undefined ? 1000 : b[i]; b[i] = 7; }
console.log(s, b.length, sumTo(b, 6));
const c = iota(new Uint8Array(8));
const kept = [];
for (let i = 0; i < 8; i++) { kept.push(c[i]); if (i === 2) c.buffer.transferToFixedLength(); }
console.log(kept.join(), c.length);
const rab = new ArrayBuffer(16, { maxByteLength: 64 });
const tracking = new Uint8Array(rab), fixed = new Uint8Array(rab, 4, 8);
iota(tracking);
console.log(list(tracking), list(fixed), sumTo(tracking, 16));
rab.resize(8);
console.log(list(tracking), list(fixed), sumTo(tracking, 16), sumTo(fixed, 8));
const seen = [];
rab.resize(16);
for (let i = 0; i < 16; i++) { if (i === 6) rab.resize(4); seen.push(show(tracking[i])); tracking[i] = 50; }
console.log(seen.join(), list(tracking), fixed.length);
`,
    ));

test("conversions that would run user code keep the loop on the generic path", () =>
    expectOracle(
        helpers +
            `
const a = iota(new Float64Array(6));
let detacher = { valueOf() { console.log('valueOf'); a.buffer.transfer(); return 0; } };
let s = detacher;
for (let i = 0; i < a.length; i++) s += a[i];
console.log(show(s), a.length);
const b = iota(new Float64Array(4));
let t = 0;
const odd = { valueOf() { b.buffer.transfer(); return 1; } };
for (let i = 0; i < b.length; i++) { t += b[i]; if (i === 1) t = odd; }
console.log(show(t), b.length);
function store(target, v) { for (let i = 0; i < target.length; i++) target[i] = v; return target; }
const c = new Float64Array(3);
console.log(list(store(c, { valueOf() { console.log('store'); return 2; } })));
const d = new Float64Array(3);
console.log(list(store(d, { valueOf() { d.buffer.transfer(); return 3; } })), d.length);
`,
    ));

test("shadowed lengths, subclasses, proxies, shared buffers and other receivers", () =>
    expectOracle(
        helpers +
            `
const own = iota(new Float64Array(3));
Object.defineProperty(own, 'length', { value: 6 });
console.log(list(own), sum(own));
const proto = iota(new Int32Array(3));
Object.setPrototypeOf(proto, Object.create(Int32Array.prototype, { length: { get() { return 5; } } }));
console.log(list(proto), sum(proto));
class Big extends Float64Array { get length() { return 4; } }
class Plain extends Float64Array {}
console.log(list(iota(new Big(2))), list(iota(new Plain(3))));
const target = iota(new Float64Array(3));
const proxy = new Proxy(target, { get(t, k) { if (k !== 'length') console.log('get', String(k)); return Reflect.get(t, k); } });
console.log(sum(proxy));
console.log(list(iota(new Int32Array(new SharedArrayBuffer(16)))));
const short = new Float64Array(2);
console.log(list(copy(iota(new Float64Array(5)), short)), list(copy(new Float64Array(1), iota(new Uint8Array(3)))));
console.log(sum([1, 2, 3]), sum('123'), sum({ length: 2, 0: 5, 1: 6 }), list([, 1, , 3]));
Object.defineProperty(Object.prototype, '0', { get() { return 'inherited'; }, set(v) { console.log('setter', v); }, configurable: true });
const holes = [, 1, , 3];
console.log(list(holes), list(fill(holes, 9)), holes.hasOwnProperty(0), list(new Float64Array(2)));
delete Object.prototype[0];
// (Node's own output uses Uint8Arrays: shadow the getter on Int8Array.prototype.)
Object.defineProperty(Int8Array.prototype, 'length', { get() { return 2; }, configurable: true });
console.log(list(iota(new Int8Array(4))), sum(new Int8Array([5, 6, 7])));
delete Int8Array.prototype.length;
console.log(list(iota(new Int8Array(4))));
`,
    ));

test("top-level loops over script bindings, nested loops and exceptions", () =>
    expectOracle(
        `
const N = 9;
const a = new Float64Array(N);
for (let i = 0; i < N; i++) a[i] = i * 0.5;
let s = 0;
for (let i = 0; i < N; i++) s += a[i] * a[i];
const b = new Float64Array(N);
for (let i = 0; i < N; i++) b[i] = a[i] + 1;
console.log(s, b.join());
const m = new Int32Array(12);
for (let r = 0; r < 3; r++) for (let i = 0; i < m.length; i++) m[i] = m[i] + r + i;
console.log(m.join());
try { const big = new BigInt64Array(3); for (let i = 0; i < big.length; i++) big[i] = i; } catch (e) { console.log(e.constructor.name); }
let label = 'x';
for (let i = 0; i < 3; i++) label = label + a[i];
console.log(label);
let u;
try { for (let i = 0; i < N; i++) u += a[i]; } catch (e) { console.log(e.constructor.name); }
console.log(u);
`,
    ));

test("the versioned loop body of a Float64Array sum calls no element stub", () => {
    const result = compile(
        "function f(a){let s=0; for(let i=0;i<a.length;i++) s+=a[i]*a[i]; return s}\nconsole.log(f(new Float64Array([1, 2])));\n",
        { fileName: "/app.js", target: "linux-x64", printAsm: true },
    );
    assert.ok(result.ok, result.ok ? "" : JSON.stringify(result.diagnostics));
    const f = result
        .assembly!.split(/^js\.fn\.0:$/m)[1]!
        .split(/^js\.fn\.0\.end:$/m)[0]!;
    // The guard branches to the copy's header, the first block after it
    // (its own branch on the result may jump there too);
    // the copy's back edge jumps there.
    const [, afterGuard] = f.split(/call rt\.typedLoopGuard\n/);
    assert.ok(afterGuard, "the loop guard");
    const header = /^js\.fn\.0\.block\.(\d+):$/m.exec(afterGuard)![1]!;
    const start = afterGuard.indexOf(`js.fn.0.block.${header}:`),
        end = afterGuard.indexOf(`jmp js.fn.0.block.${header}\n`, start);
    assert.ok(start >= 0 && end > start, "the versioned loop");
    const body = afterGuard.slice(start, end);
    assert.doesNotMatch(body, /call rt\.elementGet/);
    assert.doesNotMatch(body, /call rt\.getLengthCached/);
    assert.match(body, /movsd xmm0, \[r11\]/, "the Float64 load");
    // The original loop is the fallback.
    const rest = afterGuard.slice(end);
    assert.match(rest, /call rt\.getLengthCached/);
    assert.match(rest, /call rt\.elementGet/);
});
