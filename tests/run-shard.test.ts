import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The split of the Windows test files into CI shards (scripts/run-shard.mjs, #370).
interface Shards {
    assignShards(
        names: string[],
        timings: Record<string, number>,
        count: number,
    ): string[][];
    parseShard(text: string): { index: number; count: number };
    shardableNames(root: string, exclude: string[]): string[];
    loadTimings(): Record<string, number>;
}
const shards = async () =>
    (await import(
        pathToFileURL(resolve("scripts/run-shard.mjs")).href
    )) as Shards;

test("every file is in exactly one shard and the shards are balanced", async () => {
    const { assignShards } = await shards();
    const names = Array.from({ length: 50 }, (_, i) => "t" + i);
    const timings: Record<string, number> = {};
    names.forEach((name, i) => (timings[name] = (i * 7) % 23));
    delete timings.t3; // falls back to the mean
    const split = assignShards(names, timings, 4);
    assert.equal(split.length, 4);
    assert.deepEqual(split.flat().sort(), [...names].sort());
    const mean =
        Object.values(timings).reduce((a, b) => a + b, 0) /
        Object.keys(timings).length;
    const loads = split.map((shard) =>
        shard.reduce((sum, name) => sum + (timings[name] ?? mean), 0),
    );
    assert.ok(Math.max(...loads) - Math.min(...loads) <= 22, String(loads));
    // Deterministic: the same input gives the same split.
    assert.deepEqual(assignShards([...names].reverse(), timings, 4), split);
});

test("the real test files split into shards that cover all of them", async () => {
    const { assignShards, shardableNames, loadTimings } = await shards();
    const names = shardableNames(".", ["program-corpus*"]);
    assert.ok(names.includes("run-shard"));
    assert.ok(!names.some((name) => name.startsWith("program-corpus")));
    const split = assignShards(names, loadTimings(), 4);
    assert.deepEqual(split.flat().sort(), names);
});

test("shard arguments are validated", async () => {
    const { parseShard } = await shards();
    assert.deepEqual(parseShard("2/4"), { index: 2, count: 4 });
    for (const bad of ["0/4", "5/4", "1/0", "x", ""])
        assert.throws(() => parseShard(bad));
});

// node --test concurrency of the CI test scripts (scripts/run-suite.mjs, #380).
interface Suites {
    testConcurrency(
        env: Record<string, string | undefined>,
    ): number | undefined;
    testConcurrencyArgs(env: Record<string, string | undefined>): string[];
}
const suites = async () =>
    (await import(
        pathToFileURL(resolve("scripts/run-suite.mjs")).href
    )) as Suites;

test("self-hosted runners run few test files at once", async () => {
    const { testConcurrency, testConcurrencyArgs } = await suites();
    assert.equal(testConcurrency({ RUNNER_ENVIRONMENT: "self-hosted" }), 3);
    assert.deepEqual(
        testConcurrencyArgs({ RUNNER_ENVIRONMENT: "self-hosted" }),
        ["--test-concurrency=3"],
    );
    // NONA_TEST_CONCURRENCY wins everywhere; invalid values are ignored.
    assert.equal(
        testConcurrency({
            RUNNER_ENVIRONMENT: "self-hosted",
            NONA_TEST_CONCURRENCY: "6",
        }),
        6,
    );
    assert.equal(testConcurrency({ NONA_TEST_CONCURRENCY: "2" }), 2);
    assert.equal(
        testConcurrency({
            RUNNER_ENVIRONMENT: "self-hosted",
            NONA_TEST_CONCURRENCY: "0",
        }),
        3,
    );
    // GitHub-hosted runners and local runs keep Node's default.
    assert.equal(
        testConcurrency({ RUNNER_ENVIRONMENT: "github-hosted" }),
        undefined,
    );
    assert.deepEqual(testConcurrencyArgs({}), []);
});
