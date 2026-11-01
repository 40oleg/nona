import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// util.getSystemErrorName maps libuv error numbers to names (#506), compared
// with Node.js under GC stress.
const programs: Record<string, string> = {
    "unknown negative number": `
const util = process.getBuiltinModule("node:util");
console.log(util.getSystemErrorName(-99999));`,
    "invalid arguments": `
const util = process.getBuiltinModule("node:util");
for (const v of [2, 0, 1.5, "x"])
    try { util.getSystemErrorName(v); console.log("no error"); } catch (e) { console.log(e.name, e.code, e.message); }`,
};
for (const [name, source] of Object.entries(programs))
    test(`util.getSystemErrorName: ${name}`, () => {
        const expected = runOracle(source).stdout;
        const run = runOnHost(source);
        assert.equal(run.error, undefined);
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout, expected);
    });

test("util.getSystemErrorName: known codes", () => {
    const source = `
const util = process.getBuiltinModule("node:util");
console.log(util.getSystemErrorName(-2), util.getSystemErrorName(-13), util.getSystemErrorName(-17));`;
    const run = runOnHost(source);
    assert.equal(run.error, undefined);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim(), "ENOENT EACCES EEXIST");
    // The libuv numbers differ on Windows, so Node.js is the oracle only elsewhere.
    if (process.platform !== "win32")
        assert.equal(run.stdout, runOracle(source).stdout);
});
