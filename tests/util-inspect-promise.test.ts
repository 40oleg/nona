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

test("util.inspect shows pending, fulfilled and rejected promises", () =>
    expectOracle(`import util from 'node:util';
console.log(util.inspect(Promise.resolve(2)));
console.log(util.inspect(new Promise(() => {})));
const r = Promise.reject(3); r.catch(() => {});
console.log(util.inspect(r));
console.log(util.inspect(Promise.resolve({ a: [1, 'x'] })));
console.log(util.inspect({ p: Promise.resolve(1) }));
console.log(util.inspect({ p: { q: Promise.resolve(1) } }, { depth: 0 }));
`));

test("util.inspect does not mark a rejected promise as handled", () =>
    expectOracle(`import util from 'node:util';
process.on('unhandledRejection', (reason) => console.log('unhandled', reason));
const r = Promise.reject(7);
console.log(util.inspect(r));
`));
