import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compileToIR } from "../src/compiler.js";
import type { Operation } from "../src/ir/model.js";

// Array literals without holes or spread are created with their element
// table and store their elements into it (#48, rt.newArrayLiteral). Every
// program runs with and without GC stress and is compared with Node.js.

function expectProgram(source: string): void {
    const expected = runOracle(source).stdout;
    for (const gcStress of [true, false]) {
        const native = runOnHost(source, { gcStress });
        assert.equal(native.error, undefined);
        assert.equal(native.status, 0, native.stderr);
        assert.equal(native.stdout, expected, `gcStress: ${gcStress}`);
    }
}

test("array literals: which literals are created with their elements", () => {
    const flags: (string | undefined)[] = [];
    for (const fn of compileToIR(
        `const s = [1]; console.log([[], [1, 2], [1, , 3], [...s, 1], [s, s.length], Array(5000).fill(0), [1, 2, 3, 4, 5, 6, 7, 8, 9]]);`,
    ).functions)
        for (const block of fn.blocks)
            for (const op of block.operations as Operation[])
                if (op.kind === "newObject" && op.array)
                    flags.push(
                        op.elementValues
                            ? "filled"
                            : op.elements
                              ? "elements"
                              : undefined,
                    );
    // [1], [], [1, 2], [1, , 3], [...s, 1], [s, s.length], the nine
    // elements, then the outer literal: a literal of up to eight elements is
    // created after its elements, filled in one pass (#48).
    assert.deepEqual(flags, [
        "filled",
        undefined,
        "filled",
        undefined,
        undefined,
        "filled",
        "elements",
        "filled",
    ]);
});

const cases: [string, string][] = [
    [
        "elements, length and later changes",
        `
const rows = [];
for (let i = 0; i < 200; i++) rows.push([i, 'x' + i, {i}, [i, [i + 1]], null, undefined, i / 2]);
let sum = 0; for (const r of rows) sum += r[0] + r[2].i + r[3][1][0] + r.length;
const a = rows[5]; a.push('pushed'); a.length = 3; a[10] = 'far'; a.sort();
const b = rows[6]; b.reverse(); b.splice(1, 2, 'in'); b.unshift('first');
console.log(sum, JSON.stringify(a), JSON.stringify(b), Object.keys(rows[7]).join(), rows[8].indexOf(null), rows[9].includes(undefined));`,
    ],
    [
        "definitions do not call setters on Array.prototype",
        `
let calls = 0;
Object.defineProperty(Array.prototype, 1, {set(v) { calls++; }, get() { return 'proto'; }, configurable: true});
const a = [10, 20, 30]; const holey = [1, , 3];
console.log(calls, a[1], holey[1], Object.getOwnPropertyNames(a).join(), a.hasOwnProperty(1));
delete Array.prototype[1];
Object.freeze(Array.prototype); const c = ['still', 'works']; console.log(c.join(' '), Object.isFrozen(c));`,
    ],
    [
        "values that throw, yield or await while the literal is built",
        `
let n = 0; const boom = () => { if (++n % 3 === 0) throw new Error('boom ' + n); return n; };
const made = []; for (let i = 0; i < 6; i++) { try { made.push([boom(), new Array(20).fill(i), [boom(), 'x'.repeat(i)]]); } catch (e) { made.push(e.message); } }
console.log(JSON.stringify(made));
function* gen() { const a = [yield 1, yield 2, 3]; return a; }
const it = gen(); it.next(); it.next('A'); console.log(JSON.stringify(it.next('B').value));
(async () => { const a = [await 1, [await Promise.resolve(2)]]; console.log(JSON.stringify(a)); })();`,
    ],
    [
        "long literals and many short-lived arrays",
        `
const long = [${Array.from({ length: 300 }, (_, i) => i).join(",")}];
let keep = null, sum = 0;
for (let i = 0; i < 1500; i++) { const o = {a: i, b: [i, i + 1], c: {d: i}}; if (i % 100 === 0) keep = o; sum += o.b[1] - o.c.d; }
console.log(long.length, long[299], long.reduce((x, y) => x + y, 0), sum, keep.b.join());`,
    ],
    [
        "tables inside the array cell: capacity boundaries, growth and redefinition",
        `
// Up to eight table slots live in the array's own cell (inlineElementCapacity).
const sizes = [[1], [1, 2, 3, 4], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8, 9]];
const out = [];
for (const a of sizes) { const n = a.length; a.push(n + 1); a.push(n + 2); for (let i = 0; i < 20; i++) a.push(i); out.push(a.length, a[n], a[a.length - 1]); }
const d = [1, 2, 3]; Object.defineProperty(d, 1, {get() { return 'getter'; }, enumerable: true}); out.push(d.join(), Object.keys(d).join());
const f = Object.freeze([1, 2]); try { 'use strict'; f[0] = 9; } catch (e) {} out.push(f.join(), Object.isFrozen(f));
const p = [1, 2, 3]; const child = Object.create(p); out.push(child[1], child.length);
const s = ['b', 'c', 'a']; s.sort(); s.length = 1; s[5] = 'z'; out.push(JSON.stringify(s));
const sp = [1, 2, 3, 4]; sp.splice(1, 2, 'x', 'y', 'z', 'w', 'v'); out.push(sp.join());
const shifted = [1, 2, 3]; shifted.shift(); shifted.unshift(0, 0, 0, 0, 0, 0, 0, 0); out.push(shifted.join());
let kept = []; for (let i = 0; i < 3000; i++) { const t = [i, i * 2, [i]]; if (i % 500 === 0) kept.push(t); }
for (const t of kept) t.push('later', 'more', 'still', 'grown', 'again', 'and', 'again');
out.push(JSON.stringify(kept.map(t => [t[0], t[2][0], t.length])));
console.log(out.join('|'));`,
    ],
    [
        "small literals filled in one pass: allocation, throws, sizes 1 to 9",
        `
let n = 0;
const boom = () => { if (++n % 4 === 0) throw new Error('boom' + n); return n; };
const out = [];
for (let i = 0; i < 12; i++) {
    try { out.push([boom(), [i, new Array(30).fill(i).join('')], {i}, 'x'.repeat(i)]); } catch (e) { out.push(e.message); }
}
const sizes = [[1], [1, 2], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8, 9]];
for (const a of sizes) { a.push('p'); a[a.length + 1] = 'q'; }
const g = [1, 2, 3]; g.length = 1; g.push(4, 5, 6, 7, 8, 9, 10);
console.log(JSON.stringify(out), JSON.stringify(sizes), JSON.stringify(g), 3 in sizes[0]);`,
    ],
];
for (const [name, source] of cases)
    test(`array literals: ${name}`, () => expectProgram(source));
