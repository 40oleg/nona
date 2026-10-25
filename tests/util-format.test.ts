import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

test("util.format %s calls a user-defined toString", () => {
    const source = `
import util from 'node:util';
class Point { constructor() { this.x = 1; } toString() { return 'P(1)'; } }
class Sub extends Point {}
console.log(util.format('%s|%s|%s', { toString() { return 'custom'; } }, new Point(), new Sub()));
console.log(util.format('%s', { a: 1 }));
console.log(util.format('%s', new Error('boom')).includes('boom'));
console.log(util.format('%s %s %s', [1, 2], new Date(0), null));
`;
    for (const gcStress of [false, true]) {
        const run = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
            gcStress,
        });
        assert.equal(run.native.error, undefined);
        assert.equal(run.native.status, 0, run.native.stderr);
        assert.equal(run.oracleStatus, 0);
        assert.equal(run.native.stdout, run.oracle);
        assert.match(run.native.stdout, /^custom\|P\(1\)\|P\(1\)$/m);
    }
});

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
