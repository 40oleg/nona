import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

test("util.format keeps the sign of -0 for %s, %d and %i", () => {
    const source = `import util from 'node:util';
console.log(util.format("%s %d %i", -0, -0, -0.5));
console.log(util.format("%f %s", -0, 0));
`;
    for (const gcStress of [false, true]) {
        const run = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
            gcStress,
        });
        assert.equal(run.native.error, undefined);
        assert.equal(run.native.status, 0, run.native.stderr);
        assert.equal(run.native.stdout, run.oracle);
        assert.equal(run.native.stdout, "-0 -0 -0\n0 0\n");
    }
});
