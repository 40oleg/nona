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

test("assert.throws without a throw reports Missing expected exception", () =>
    expectOracle(`
import assert from 'node:assert';
const show = (f) => {
    try { f(); console.log('no throw'); }
    catch (e) {
        console.log(e.name, JSON.stringify(e.message), e.operator,
            e.generatedMessage, e instanceof assert.AssertionError);
    }
};
show(() => assert.throws(() => 1, 'my msg'));
show(() => assert.throws(() => 1));
show(() => assert.throws(() => 1, TypeError));
show(() => assert.throws(() => 1, TypeError, 'my msg'));
show(() => assert.throws(() => 1, /x/, 'my msg'));
const err = new RangeError('custom');
try { assert.throws(() => 1, TypeError, err); }
catch (e) { console.log(e === err, e.message, e.operator, e.generatedMessage); }
`));

test("assert.rejects without a rejection reports Missing expected rejection", () =>
    expectOracle(`
import assert from 'node:assert';
const show = async (f) => {
    try { await f(); console.log('no throw'); }
    catch (e) {
        console.log(e.name, JSON.stringify(e.message), e.operator,
            e.generatedMessage, e instanceof assert.AssertionError);
    }
};
async function main() {
    await show(() => assert.rejects(Promise.resolve(1), 'my msg'));
    await show(() => assert.rejects(Promise.resolve(1)));
    await show(() => assert.rejects(Promise.resolve(1), TypeError));
    await show(() => assert.rejects(async () => 1, TypeError, 'my msg'));
    const err = new RangeError('custom');
    try { await assert.rejects(Promise.resolve(1), TypeError, err); }
    catch (e) { console.log(e === err, e.message, e.operator, e.generatedMessage); }
}
await main();
`));
