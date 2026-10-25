import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

// A run under GC stress takes over a minute for these sample sets, so only the
// small case uses it.
function expectOracle(source: string, modes = [false]): void {
    for (const gcStress of modes) {
        const run = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
            gcStress,
        });
        assert.equal(run.native.error, undefined);
        assert.equal(run.native.status, 0, run.native.stderr);
        assert.equal(run.oracleStatus, 0);
        assert.equal(run.native.stdout, run.oracle);
    }
}

const values = `
import util from "node:util";
const samples = [
    { a: 1, b: [1, 2] },
    { a: { b: { c: { d: { e: 1 } } } } },
    [[1, [2, [3, [4]]]]],
    { name: "x".repeat(30), other: "y".repeat(30), third: "z".repeat(30) },
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
    ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"],
    { list: [{ id: 1, tags: ["a", "b"] }, { id: 2, tags: [] }], empty: {}, none: [] },
    new Map([["k", { v: [1, 2] }], ["m", new Set([1, 2])]]),
    { f() {}, nested: { arr: [1, { x: 1 }] } },
];
`;

for (const compact of ["false", "true", "3", "2", "1", "0"])
    test(`util.inspect compact: ${compact} matches Node.js`, () =>
        expectOracle(
            `${values}
for (const depth of [2, null])
    for (const s of samples)
        console.log(util.inspect(s, { compact: ${compact}, depth }));
`,
        ));

test("util.inspect compact: false puts every property on its own line", () =>
    expectOracle(
        `import util from "node:util";
console.log(util.inspect({ a: 1, b: [1, 2] }, { compact: false }));
`,
        [false, true],
    ));

test("util.inspect compact with a narrow breakLength matches Node.js", () =>
    expectOracle(`${values}
for (const compact of [true, 3])
    for (const s of samples)
        console.log(util.inspect(s, { compact, depth: null, breakLength: 40 }));
`));
