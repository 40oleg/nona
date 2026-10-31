import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

function expectOracle(source: string): void {
    for (const gcStress of [false, true]) {
        const started = performance.now();
        const run = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
            gcStress,
        });
        const diagnostic = JSON.stringify(
            {
                gcStress,
                elapsedMs: Math.round(performance.now() - started),
                error: run.native.error?.stack,
                status: run.native.status,
                stdout: run.native.stdout,
                stderr: run.native.stderr,
                oracleStatus: run.oracleStatus,
                oracle: run.oracle,
            },
            null,
            2,
        );
        assert.equal(run.native.error, undefined, diagnostic);
        assert.equal(run.native.status, 0, diagnostic);
        assert.equal(run.oracleStatus, 0, diagnostic);
        assert.equal(run.native.stdout, run.oracle, diagnostic);
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
