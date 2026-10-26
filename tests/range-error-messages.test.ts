import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

const source = `const cases = [
    () => (1).toFixed(101), () => (1).toPrecision(0), () => (1).toExponential(101),
    () => (1).toString(1), () => "a".repeat(-1), () => String.fromCodePoint(-1),
    () => "a".normalize("X"), () => new Array(-1), () => new Uint8Array(-1),
    () => new DataView(new ArrayBuffer(2)).getInt32(0),
    () => new Date(NaN).toISOString(),
];
for (const f of cases) { try { f(); } catch (e) { console.log(e.name + ": " + e.message); } }`;

// Messages that Node.js words differently (they include the bad value).
const valueMessages = new Map([
    ["RangeError: Invalid count value: -1", "RangeError: Invalid count value"],
    ["RangeError: Invalid code point -1", "RangeError: Invalid code point"],
    [
        "RangeError: Invalid typed array length: -1",
        "RangeError: Invalid typed array length",
    ],
]);

test("RangeErrors from built-in argument checks name the check", () => {
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    const expected = runOracle(source)
        .stdout.split("\n")
        .map((line) => valueMessages.get(line) ?? line)
        .join("\n");
    assert.equal(run.stdout, expected);
    assert.equal(run.stdout.split("\n").length, 12);
    assert.doesNotMatch(run.stdout, /Invalid operation/);
});
