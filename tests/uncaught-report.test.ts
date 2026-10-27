import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runOnHost } from "./helpers/host.js";

// Uncaught exceptions are reported on stderr with exit code 1 when the
// program does not link the process prelude (#501).

const cases: readonly { source: string; line: string; oracle: boolean }[] = [
    {
        source: 'throw new TypeError("bad thing");',
        line: "TypeError: bad thing",
        oracle: true,
    },
    {
        source: 'async function main() { await null; throw new TypeError("async boom"); }\nmain();',
        line: "TypeError: async boom",
        oracle: true,
    },
    {
        source: 'console.log("before");setTimeout(() => { throw new RangeError("late"); }, 1);',
        line: "RangeError: late",
        oracle: true,
    },
    {
        source: 'Promise.resolve().then(() => { throw new SyntaxError("job"); });',
        line: "SyntaxError: job",
        oracle: true,
    },
    {
        source: 'Promise.reject(new Error("x"));',
        line: "Error: x",
        oracle: true,
    },
    {
        source: "throw 42;",
        line: "42",
        oracle: true,
    },
    {
        source: "Promise.reject(42);",
        line: 'UnhandledPromiseRejection: The promise rejected with the reason "42".',
        oracle: false,
    },
];

for (const { source, line, oracle } of cases)
    test(`uncaught exception without process: ${source}`, () => {
        assert.doesNotMatch(source, /process/);
        const run = runOnHost(source);
        assert.equal(run.error, undefined);
        assert.equal(run.status, 1);
        const lines = run.stderr.split(/\r?\n/);
        assert.equal(lines[0], line, run.stderr);
        assert.doesNotMatch(run.stderr, /Nona runtime error/);
        if (!oracle) return;
        // runOracle rejects a failing program: run Node.js directly.
        const expected = spawnSync(process.execPath, ["-e", source], {
            encoding: "utf8",
            timeout: 60_000,
            windowsHide: true,
        });
        assert.equal(run.status, expected.status);
        assert.equal(run.stdout, expected.stdout);
        assert.ok(
            expected.stderr.split(/\r?\n/).includes(line),
            expected.stderr,
        );
    });

test("an uncaught exception with process linked keeps its report", () => {
    const run = runOnHost('process.title;throw new TypeError("bad thing");');
    assert.equal(run.status, 1);
    assert.equal(run.stderr.split(/\r?\n/)[0], "TypeError: bad thing");
});
