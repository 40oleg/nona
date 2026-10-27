import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

function expectOracle(source: string): void {
    for (const gcStress of [false, true]) {
        const run = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
            gcStress,
        });
        assert.equal(run.native.error, undefined);
        assert.equal(run.native.status, 0, run.native.stderr);
        assert.equal(run.oracleStatus, 0);
        assert.equal(run.native.stdout, run.oracle);
    }
}

test("assert.ifError wraps an Error in an AssertionError", () =>
    expectOracle(`
import assert from 'node:assert';
try { assert.ifError(new TypeError('x')); console.log('no throw'); }
catch (e) {
    console.log(e.name, e.code, e.operator, JSON.stringify(e.message),
        e.actual.name, e instanceof assert.AssertionError);
}
`));

test("assert.ifError wraps non-error values", () =>
    expectOracle(`
import assert from 'node:assert';
for (const v of ['boom', 0, false, { a: 1 }]) {
    try { assert.ifError(v); console.log('no throw'); }
    catch (e) {
        console.log(e.name, e.operator, JSON.stringify(e.message), e.actual === v);
    }
}
`));

test("assert.ifError ignores null and undefined", () =>
    expectOracle(`
import assert from 'node:assert';
assert.ifError(null);
assert.ifError(undefined);
console.log('ok');
`));
