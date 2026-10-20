import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compileToIR } from "../src/compiler.js";

// Method call sites (#47): the read of `object.name` that feeds a call with
// `object` as the receiver has method entries for several receiver shapes
// (rt.icMethod), and a plain function callee's code is called directly.
// Every change to the methods after the sites are warm, and every callee
// that is not a plain function, must behave as before.
const agree = (source: string) => {
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
};

test("method sites over more than four classes follow redefinition, deletion, getters and setPrototypeOf", () =>
    agree(String.raw`
class A { constructor(x) { this.x = x; } m() { return 'A' + this.x; } scaled() { return this.m() + '!'; } }
class B extends A { m() { return 'B' + this.x; } }
class C extends A {}
class D extends A { m() { return 'D' + this.x; } }
class E extends B { m() { return super.m() + 'E'; } }
class F extends C { m() { return 'F' + super.m(); } }
const objs = [new A(1), new B(2), new C(3), new D(4), new E(5), new F(6)];
const all = () => objs.map((o) => o.m()).join(',') + '|' + objs.map((o) => o.scaled()).join(',');
const out = [];
for (let i = 0; i < 30; i++) out.push(objs[i % 6].m());
out.push(all());
A.prototype.m = function () { return 'a' + this.x; };
out.push(all());
B.prototype.m = function () { return 'b' + this.x; };
out.push(all());
delete D.prototype.m;
out.push(all());
Object.defineProperty(B.prototype, 'm', { get() { return () => 'getter:' + this.x; }, configurable: true });
out.push(all());
Object.setPrototypeOf(objs[0], D.prototype);
Object.setPrototypeOf(objs[3], E.prototype);
out.push(all());
objs[2].m = function () { return 'own' + this.x; };
out.push(all());
delete objs[2].m;
out.push(all());
let caught = '';
try { delete A.prototype.m; objs[0].m(); } catch (e) { caught = e.constructor.name; }
out.push(caught);
console.log(out.join('\n'));
`));

test("callees that are not plain functions take the general path", () =>
    agree(String.raw`
'use strict';
const out = [];
class K { constructor(v) { this.v = v; } m() { return 'plain' + this.v; } }
const k = new K(1), j = new K(2);
const variants = [
    function () { return 'fn' + this.v; },
    function () { return 'bound' + this.v; }.bind({ v: 'B' }),
    () => 'arrow' + typeof this,
    new Proxy(function () { return 'proxy' + this.v; }, {}),
    new Proxy(function () { return 'trap'; }, { apply(t, self, args) { return 'apply' + self.v + args.length; } }),
    function* () { yield 'gen' + this.v; },
    async function () { return 'async'; },
    class Inner {},
    42,
    undefined,
];
for (const variant of variants) {
    K.prototype.m = variant;
    for (const o of [k, j, k]) {
        try {
            const r = o.m(1, 2);
            out.push(typeof r === 'object' && r !== null && 'next' in r ? r.next().value : r instanceof Promise ? 'promise' : String(r));
        } catch (e) { out.push(e.constructor.name); }
    }
}
const deep = { m(n) { return n === 0 ? 0 : 1 + this.m(n - 1); } };
out.push(deep.m(3000));
console.log(out.join(','));
`));

test("primitive receivers keep sloppy boxing and strict this", () =>
    agree(String.raw`
String.prototype.sloppy = function () { return typeof this + ':' + (this instanceof String) + ':' + this.length; };
String.prototype.strict = function () { 'use strict'; return typeof this + ':' + this.length; };
Number.prototype.twice = function () { 'use strict'; return this * 2; };
Boolean.prototype.not = function () { return !this.valueOf(); };
const out = [];
for (const s of ['x', 'yy', 'zzz']) out.push(s.sloppy(), s.strict(), s.charCodeAt(0), s.toUpperCase());
for (let i = 0; i < 4; i++) out.push((i).twice(), (i % 2 === 0).not(), i.toFixed(1));
const arr = [3, 1, 2];
arr.push(4); out.push(arr.indexOf(2), arr.join('-'), arr.map((x) => x * 2).join());
const map = new Map([[1, 'one']]); out.push(map.get(1), map.has(2));
console.log(out.join(','));
`));

test("i % n over int32, negative, -0, NaN, Infinity and fractional operands", () =>
    agree(String.raw`
const shapes = [{ k: () => 1 }, { k: () => 2 }, { k: () => 3 }];
let s = 0;
for (let i = 0; i < 300; i++) s += shapes[i % 3].k();
const values = [5, -5, 0, -0, 3, -3, 2.5, -2.5, NaN, Infinity, -Infinity, 2147483647, -2147483648];
const out = [s];
for (const x of values) for (const n of values) { const r = x % n; out.push(Object.is(r, -0) ? '-0' : String(r)); }
console.log(out.join(','));
`));

test("method calls are flagged on the read and the call, other calls are not", () => {
    const ir = compileToIR(
        "class P { m(x) { return x } }\nconst p = new P();\nlet s = 0;\nfor (let i = 0; i < 3; i++) { s += p.m(i); s += new P().m(1); }\nconst f = p.m;\nf.call(p, 1);\np.hasOwnProperty('m');\n",
    );
    const ops = ir.functions.flatMap((fn) =>
        fn.blocks.flatMap((block) => block.operations),
    );
    const reads = ops.filter(
        (op) => op.kind === "property" && op.keyName === "m",
    );
    assert.ok(reads.length >= 3);
    assert.equal(
        reads.filter((op) => op.kind === "property" && op.method).length,
        2,
    );
    const invokes = ops.filter((op) => op.kind === "invoke" && op.method);
    assert.equal(invokes.length, 2);
    assert.ok(
        !ops.some(
            (op) =>
                op.kind === "property" &&
                op.method &&
                (op.keyName === "call" || op.keyName === "hasOwnProperty"),
        ),
    );
});
