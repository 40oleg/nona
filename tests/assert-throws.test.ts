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

const prelude = `
import assert from 'node:assert';
const cases = [{ message: 'abd' }, /zz/, TypeError, () => false];
const thrown = new Error('abc');
function report(op, expected, e) {
    console.log(op, e.name, e.code, e.operator, e.actual === thrown,
        e.expected === expected, e instanceof assert.AssertionError);
}
`;

test("assert.throws throws AssertionError when the error does not match", () =>
    expectOracle(`${prelude}
for (const expected of cases) {
    try { assert.throws(() => { throw thrown; }, expected); console.log('no throw'); }
    catch (e) {
        report('throws', expected, e);
        if (typeof expected !== 'object' || expected instanceof RegExp) console.log(JSON.stringify(e.message));
    }
}
`));

test("assert.rejects throws AssertionError when the error does not match", () =>
    expectOracle(`${prelude}
for (const expected of cases) {
    try { await assert.rejects(Promise.reject(thrown), expected); console.log('no throw'); }
    catch (e) {
        report('rejects', expected, e);
        if (typeof expected !== 'object' || expected instanceof RegExp) console.log(JSON.stringify(e.message));
    }
}
`));

test("assert.throws and rejects accept matching errors and keep validation errors", () =>
    expectOracle(`${prelude}
assert.throws(() => { throw thrown; }, Error);
assert.throws(() => { throw thrown; }, /abc/);
assert.throws(() => { throw thrown; }, { message: 'abc' });
assert.throws(() => { throw thrown; }, () => true);
await assert.rejects(Promise.reject(thrown), { message: /ab/ });
const own = new RangeError('own');
try { assert.throws(() => { throw thrown; }, () => { throw own; }); }
catch (e) { console.log('throws', e === own); }
try { await assert.rejects(Promise.reject(thrown), () => { throw own; }); }
catch (e) { console.log('rejects', e === own); }
try { assert.throws(() => { throw thrown; }, TypeError, 'custom'); }
catch (e) { console.log(e.name, e.message); }
`));
