import { test } from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

interface Phase {
    files: string[];
    env: Record<string, string | undefined>;
    suffix: string;
}

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
    planShardPhases(
        names: string[],
        env: Record<string, string | undefined>,
        stressed: string[],
    ): Phase[];
    runShardPhases(phases: Phase[], run: (phase: Phase) => number): number;
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
    entryPattern(entry: string): RegExp;
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

// Only the spawn and filesystem boundaries are replaced: execute the actual
// entry point, planner and concurrency helper without starting any child tests.
async function shardMain(
    names: string[],
    env: Record<string, string | undefined> = {},
    stressed: string[] = [],
    statuses: (number | null)[] = [],
    args = ["--shard", "1/1", "--timings-out", "work/test-timings-1.json"],
) {
    const calls: { args: string[]; env: Phase["env"] }[] = [];
    const output: string[] = [];
    const script = resolve("scripts/run-shard.mjs");
    const childProcess = {
        argv: ["mock-node", script, ...args],
        execPath: "mock-node",
        env: { ...env },
        exitCode: 0,
    };
    // Remove only ESM declarations to run the entry point with injected imports;
    // this needs no experimental VM-module flag in the ordinary CI test runner.
    const source = readFileSync(script, "utf8")
        .replace(/^import .*;\r?$/gm, "")
        .replace(/^export /gm, "")
        .replaceAll("import.meta.url", "scriptUrl");
    runInNewContext(source, {
        ...(await import("node:path")),
        ...(await import("node:url")),
        ...(await suites()),
        scriptUrl: pathToFileURL(script).href,
        process: childProcess,
        console: { log: (line: string) => output.push(line) },
        existsSync: () => true,
        readdirSync: () => names.map((name) => name + ".test.js"),
        readFileSync: (file: string) => {
            if (file.endsWith("gc-stress.json"))
                return JSON.stringify({ always: stressed });
            assert.ok(file.endsWith("timings.json"), file);
            return JSON.stringify({ seconds: {} });
        },
        mkdirSync: () => undefined,
        spawnSync: (
            _command: string,
            args: string[],
            options: { env: Phase["env"] },
        ) => {
            const index = calls.length;
            calls.push({ args: [...args], env: { ...options.env } });
            return { status: index < statuses.length ? statuses[index] : 0 };
        },
    });
    return { calls, output, status: childProcess.exitCode };
}

test("the assigned literal http-agent runs alone after its cohort peers", async () => {
    const names = [
        "http-agent",
        "http-agent-fixtures",
        "http-agent-retained-control",
        "http-agent-source",
        "http-agent.test",
        "z",
    ];
    const { planShardPhases } = await shards();
    const phases = planShardPhases(names, {}, []);
    assert.deepEqual(
        phases.map((phase) => phase.files),
        [names.slice(1), ["http-agent"]],
    );
    assert.deepEqual(
        phases.flatMap((phase) => phase.files).sort(),
        [...names].sort(),
    );
    assert.equal(
        new Set(phases.flatMap((phase) => phase.files)).size,
        names.length,
    );
    assert.deepEqual(names, [
        "http-agent",
        "http-agent-fixtures",
        "http-agent-retained-control",
        "http-agent-source",
        "http-agent.test",
        "z",
    ]);
});

test("main isolates Agent with merged c1 arguments and child environment", async () => {
    for (const concurrency of [undefined, "6", "0"]) {
        const env = {
            NONA_TEST_CONCURRENCY: concurrency,
            RUNNER_ENVIRONMENT: "github-hosted",
            NONA_GC_STRESS: "on",
            KEEP: "inherited",
        };
        const { calls, status } = await shardMain(["http-agent", "peer"], env);
        assert.equal(status, 0);
        assert.equal(calls.length, 2);
        const [peer, agent] = calls;
        assert.ok(peer && agent);
        assert.deepEqual(
            peer.args.filter((arg) => arg.endsWith(".test.js")),
            [join("dist", "tests", "peer.test.js")],
        );
        assert.deepEqual(
            peer.args.filter((arg) => arg.startsWith("--test-concurrency")),
            concurrency === "6" ? ["--test-concurrency=6"] : [],
        );
        assert.deepEqual(peer.env, env);
        assert.deepEqual(
            agent.args.filter((arg) => arg.startsWith("--test-concurrency")),
            ["--test-concurrency=1"],
        );
        assert.deepEqual(agent.env, { ...env, NONA_TEST_CONCURRENCY: "1" });
    }
});

test("isolation keeps shard assignment, exclusions and list membership", async () => {
    const { assignShards } = await shards();
    const names = [
        "a",
        "http-agent",
        "http-agent-fixtures",
        "program-corpus-one",
        "z",
    ];
    const included = ["a", "http-agent", "http-agent-fixtures", "z"];
    assert.deepEqual(assignShards(included, {}, 4), [
        ["a"],
        ["http-agent"],
        ["http-agent-fixtures"],
        ["z"],
    ]);
    for (const count of [1, 2, 3, 4, 5]) {
        const assigned = assignShards(included, {}, count);
        const executed: string[] = [];
        for (let index = 1; index <= count; index++) {
            const args = [
                "--shard",
                `${index}/${count}`,
                "--exclude",
                "program-corpus*",
            ];
            const listed = await shardMain(
                names,
                {},
                [],
                [],
                [...args, "--list"],
            );
            assert.deepEqual(listed.output, assigned[index - 1]);
            assert.equal(listed.calls.length, 0);
            const run = await shardMain(names, {}, [], [], args);
            const files = run.calls.flatMap((call) =>
                call.args
                    .filter((arg) => arg.endsWith(".test.js"))
                    .map((file) =>
                        file
                            .split(/[\\/]/)
                            .at(-1)
                            ?.replace(/\.test\.js$/, ""),
                    ),
            );
            assert.deepEqual([...files].sort(), assigned[index - 1]);
            executed.push(
                ...files.filter((file): file is string => file !== undefined),
            );
        }
        assert.deepEqual(executed.sort(), included);
    }
    const excluded = await shardMain(
        names,
        {},
        [],
        [],
        ["--shard", "1/1", "--exclude", "http-agent,program-corpus*"],
    );
    assert.equal(excluded.calls.length, 1);
    assert.ok(
        excluded.calls.every(
            (call) =>
                !call.args.some((arg) =>
                    /[\\/]http-agent\.test\.js$/.test(arg),
                ),
        ),
    );
});

test("no-Agent phases preserve empty shards, GC cohorts and timing suffixes", async () => {
    const { planShardPhases } = await shards();
    assert.deepEqual(planShardPhases([], {}, []), []);
    for (const env of [
        {},
        { NONA_GC_STRESS_SCOPE: "all", NONA_TEST_CONCURRENCY: "4" },
    ]) {
        assert.deepEqual(planShardPhases(["a", "gc"], env, ["gc"]), [
            { files: ["a", "gc"], env, suffix: "" },
        ]);
    }
    const env = {
        NONA_GC_STRESS_SCOPE: "marked",
        NONA_GC_STRESS: "on",
        NONA_TEST_CONCURRENCY: "4",
    };
    assert.deepEqual(planShardPhases(["a", "gc"], env, ["gc"]), [
        { files: ["a"], env: { ...env, NONA_GC_STRESS: "off" }, suffix: "" },
        { files: ["gc"], env, suffix: "-stress" },
    ]);
    for (const names of [[], ["a"], ["gc"], ["a", "gc"]]) {
        const run = await shardMain(names, env, ["gc"]);
        assert.equal(run.calls.length, names.length);
        for (const call of run.calls)
            assert.ok(call.args.includes("--test-concurrency=4"));
    }
    const selfHosted = await shardMain(["peer"], {
        RUNNER_ENVIRONMENT: "self-hosted",
    });
    assert.ok(selfHosted.calls[0]?.args.includes("--test-concurrency=3"));
});

test("marked and all GC modes preserve inherited settings in every child", async () => {
    const { planShardPhases } = await shards();
    for (const scope of [undefined, "all", "marked"]) {
        for (const setting of [undefined, "off", "on", "OFF"]) {
            for (const agentMarked of [false, true]) {
                const env = {
                    NONA_GC_STRESS_SCOPE: scope,
                    NONA_GC_STRESS: setting,
                    NONA_TEST_CONCURRENCY: "7",
                    KEEP: "yes",
                };
                const stressed = agentMarked ? ["gc", "http-agent"] : ["gc"];
                const names = ["gc", "http-agent", "peer"];
                const phases = planShardPhases(names, env, stressed);
                assert.deepEqual(
                    phases.flatMap((phase) => phase.files).sort(),
                    names,
                );
                const { calls } = await shardMain(names, env, stressed);
                assert.equal(calls.length, scope === "marked" ? 3 : 2);
                const executed = calls.flatMap((call) => {
                    const files = call.args
                        .filter((arg) => arg.endsWith(".test.js"))
                        .map((file) =>
                            file
                                .split(/[\\/]/)
                                .at(-1)
                                ?.replace(/\.test\.js$/, ""),
                        );
                    const agent = files.includes("http-agent");
                    if (agent) assert.deepEqual(files, ["http-agent"]);
                    const marked = files.every(
                        (name) => name !== undefined && stressed.includes(name),
                    );
                    assert.deepEqual(call.env, {
                        ...env,
                        NONA_GC_STRESS:
                            scope === "marked" && !marked ? "off" : setting,
                        NONA_TEST_CONCURRENCY: agent ? "1" : "7",
                    });
                    assert.ok(
                        call.args.includes(
                            `--test-concurrency=${agent ? 1 : 7}`,
                        ),
                    );
                    return files;
                });
                assert.deepEqual(executed.sort(), names);
                assert.deepEqual(env, {
                    NONA_GC_STRESS_SCOPE: scope,
                    NONA_GC_STRESS: setting,
                    NONA_TEST_CONCURRENCY: "7",
                    KEEP: "yes",
                });
            }
        }
    }
});

test("each ordinary, isolated and GC phase writes a distinct existing-pattern timing report", async () => {
    for (const [stressed, want] of [
        [
            [],
            ["work/test-timings-1.json", "work/test-timings-1-http-agent.json"],
        ],
        [
            ["gc"],
            [
                "work/test-timings-1.json",
                "work/test-timings-1-http-agent.json",
                "work/test-timings-1-stress.json",
            ],
        ],
        [
            ["gc", "http-agent"],
            [
                "work/test-timings-1.json",
                "work/test-timings-1-stress.json",
                "work/test-timings-1-stress-http-agent.json",
            ],
        ],
    ] as const) {
        const { calls } = await shardMain(
            ["gc", "http-agent", "peer"],
            stressed.length ? { NONA_GC_STRESS_SCOPE: "marked" } : {},
            [...stressed],
        );
        const destinations = calls.flatMap((call) =>
            call.args
                .filter((arg) =>
                    arg.startsWith("--test-reporter-destination=work/"),
                )
                .map((arg) => arg.slice("--test-reporter-destination=".length)),
        );
        assert.deepEqual(destinations, want);
        assert.equal(new Set(destinations).size, calls.length);
    }
});

test("every planned phase runs after first or later failure and returns the first failure", async () => {
    const { planShardPhases, runShardPhases } = await shards();
    const phases = planShardPhases(
        ["gc", "http-agent", "peer"],
        { NONA_GC_STRESS_SCOPE: "marked" },
        ["gc"],
    );
    for (const [statuses, want] of [
        [[0, 0, 0], 0],
        [[7, 0, 0], 7],
        [[0, 4, 0], 4],
        [[0, 0, 9], 9],
        [[7, 4, 9], 7],
    ] as const) {
        const seen: string[][] = [];
        const status = runShardPhases(phases, (phase) => {
            const index = seen.length;
            seen.push(phase.files);
            return statuses[index] ?? 0;
        });
        assert.deepEqual(seen, [["peer"], ["http-agent"], ["gc"]]);
        assert.equal(status, want);
        const run = await shardMain(
            ["gc", "http-agent", "peer"],
            { NONA_GC_STRESS_SCOPE: "marked" },
            ["gc"],
            [...statuses],
        );
        assert.equal(run.calls.length, 3);
        assert.equal(run.status, want);
    }
    const failedSpawn = await shardMain(
        ["http-agent", "peer"],
        {},
        [],
        [null, 9],
    );
    assert.equal(failedSpawn.calls.length, 2);
    assert.equal(failedSpawn.status, 1);
});
