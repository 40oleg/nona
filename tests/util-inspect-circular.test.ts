import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

function expectOracle(source: string): string {
    let out = "";
    for (const gcStress of [false, true]) {
        const run = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
            gcStress,
        });
        assert.equal(run.native.error, undefined);
        assert.equal(run.native.status, 0, run.native.stderr);
        assert.equal(run.oracleStatus, 0);
        assert.equal(run.native.stdout, run.oracle);
        out = run.native.stdout;
    }
    return out;
}

test("util.inspect marks circular targets with <ref *N>", () => {
    const out = expectOracle(`import util from 'node:util';
const o = { a: 1 }; o.self = o;
console.log(util.inspect(o));
const p = { q: {} }; p.q.back = p.q; p.me = p;
console.log(util.inspect(p));
`);
    assert.equal(
        out,
        "<ref *1> { a: 1, self: [Circular *1] }\n" +
            "<ref *2> { q: <ref *1> { back: [Circular *1] }, me: [Circular *2] }\n",
    );
});

test("util.inspect numbers circular arrays, Maps and wide objects", () => {
    expectOracle(`import util from 'node:util';
const a = [1]; a.push(a);
console.log(util.inspect(a));
const m = new Map(); m.set('self', m);
console.log(util.inspect(m));
const s = new Set(); s.add(s);
console.log(util.inspect(s));
const w = { first: 'a'.repeat(30), second: 'b'.repeat(30), third: 'c'.repeat(20) };
w.self = w;
console.log(util.inspect(w));
const n = { inner: { text: 'x'.repeat(60), more: 'y'.repeat(20) } }; n.inner.up = n;
console.log(util.inspect(n));
`);
});
