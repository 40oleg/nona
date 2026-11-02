import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import {
    BASELINE,
    BASELINE_BLOB,
    DEADLINES,
    aggregateEnvironment,
    buildOptions,
    buildDecision,
    decide,
    fixtureSource,
    makeEnvironment,
    readConfig,
    requireHosted,
    schedule,
    verifyAggregate,
} from "./process-environment-startup.mjs";

const candidate = "1".repeat(40);
const args = [
    "--baseline",
    BASELINE,
    "--candidate",
    candidate,
    "--candidate-process-blob",
    "2".repeat(40),
    "--baseline-root",
    "work/old",
    "--candidate-root",
    "work/new",
    "--out",
    "work/evidence",
];

test("host gate rejects local, self-hosted, wrong-platform and unpinned Node configurations", () => {
    const host = {
        actions: "true",
        environment: "github-hosted",
        platform: "win32",
        arch: "x64",
        node: "v26.9.0",
    };
    requireHosted(host);
    requireHosted({ ...host, platform: "linux" });
    for (const change of [
        { actions: undefined },
        { environment: "self-hosted" },
        { platform: "darwin" },
        { arch: "arm64" },
        { node: "v26.10.0" },
    ])
        assert.throws(() => requireHosted({ ...host, ...change }));
});

test("comparison requires exact pins, bounded balanced pairs and fixed deadlines", () => {
    const config = readConfig(args);
    assert.equal(config.baselineBlob, BASELINE_BLOB);
    assert.equal(config.pairs, 2);
    assert.deepEqual(DEADLINES, {
        readiness: 60000,
        hard: 90000,
        probe: 10000,
        cleanup: 5000,
    });
    for (const invalid of [
        [],
        [...args, "--pairs", "1"],
        [...args, "--pairs", "5"],
        [...args, "--timeout", "120000"],
        [...args, "--pairs", "2", "--pairs", "4"],
    ]) {
        assert.throws(() => readConfig(invalid));
    }
    assert.throws(() =>
        readConfig(args.map((x) => (x === candidate ? "main" : x))),
    );
    assert.throws(() =>
        readConfig(args.map((x) => (x === candidate ? BASELINE : x))),
    );
    assert.throws(() =>
        readConfig(args.map((x) => (x === BASELINE ? "3".repeat(40) : x))),
    );
    assert.equal(readConfig([...args, "--pairs", "4"]).pairs, 4);
});

test("synthetic fixtures count OS and stress entries and enforce equal UTF-16 volume", () => {
    for (const platform of ["win32", "linux"]) {
        for (const gc of ["off", "on"]) {
            for (const [shape, count] of [
                ["base", 39],
                ["few", 40],
                ["many", 150],
            ]) {
                const env = makeEnvironment({
                    platform,
                    gc,
                    shape,
                    temporary: platform === "win32" ? "C:\\safe" : "/safe",
                });
                assert.equal(Object.getPrototypeOf(env), null);
                assert.equal(Object.keys(env).length, count);
                assert.equal(env.NONA_GC_STRESS, gc === "off" ? "off" : "on");
                const aggregate = aggregateEnvironment(env);
                assert.equal(aggregate.count, count);
                assert.equal(aggregate.descriptorErrors, 0);
                assert.ok(verifyAggregate(aggregate, env));
                if (shape !== "base") assert.equal(aggregate.units, 9221);
                if (platform === "win32") {
                    assert.equal(env.SystemRoot, "C:\\Windows");
                    assert.equal(
                        new Set(Object.keys(env).map((k) => k.toUpperCase()))
                            .size,
                        count,
                    );
                }
            }
        }
    }
    assert.throws(() =>
        makeEnvironment({
            platform: "darwin",
            gc: "off",
            shape: "base",
            temporary: "/safe",
        }),
    );
    assert.throws(() =>
        makeEnvironment({
            platform: "win32",
            gc: "on",
            shape: "few",
            temporary: "x".repeat(10000),
        }),
    );
});

test("Windows fixtures explicitly supply every libuv-required variable before sizing", () => {
    // Complete required_vars list in Node v26.9.0 deps/uv/src/win/process.c.
    // Missing entries can be injected from the parent despite an explicit env.
    const required = {
        HOMEDRIVE: "C:",
        HOMEPATH: "\\nona-synthetic-user",
        LOGONSERVER: "\\\\NONA-SYNTHETIC",
        PATH: "C:\\Windows\\System32;C:\\Windows",
        SYSTEMDRIVE: "C:",
        SYSTEMROOT: "C:\\Windows",
        TEMP: "C:\\safe",
        USERDOMAIN: "NONA-SYNTHETIC",
        USERNAME: "nona-synthetic-user",
        USERPROFILE: "C:\\nona-synthetic-user",
        WINDIR: "C:\\Windows",
    };
    for (const gc of ["off", "on"])
        for (const [shape, count] of [
            ["base", 39],
            ["few", 40],
            ["many", 150],
        ]) {
            const env = makeEnvironment({
                platform: "win32",
                shape,
                gc,
                temporary: "C:\\safe",
            });
            for (const [name, value] of Object.entries(required)) {
                const aliases = Object.keys(env).filter(
                    (key) => key.toUpperCase() === name,
                );
                assert.equal(aliases.length, 1, `${shape}/${gc}: ${name}`);
                assert.equal(env[aliases[0]], value, `${shape}/${gc}: ${name}`);
            }
            const aggregate = aggregateEnvironment(env);
            assert.equal(aggregate.count, count);
            assert.equal(aggregate.descriptorErrors, 0);
            if (shape !== "base") assert.equal(aggregate.units, 9221);
        }
});

test("aggregate counts entry terminators, equals signs, final NUL and UTF-16 code units", () => {
    const env = { X: "😀", Y: "a=b" };
    assert.deepEqual(aggregateEnvironment(env), {
        count: 2,
        units: 12,
        descriptorErrors: 0,
    });
    assert.equal(aggregateEnvironment({}).units, 1);
    assert.equal(
        verifyAggregate({ ...aggregateEnvironment(env), count: 3 }, env),
        false,
    );
    assert.equal(
        verifyAggregate({ ...aggregateEnvironment(env), units: 13 }, env),
        false,
    );
    assert.equal(
        verifyAggregate(
            { ...aggregateEnvironment(env), descriptorErrors: 1 },
            env,
        ),
        false,
    );
    assert.equal(verifyAggregate(null, env), false);
});

test("every shape and GC mode has serial AB/BA pairs and alternating Node controls", () => {
    const plan = schedule(2);
    assert.equal(plan.length, 36);
    for (const shape of ["base", "few", "many"])
        for (const gc of ["off", "on"]) {
            const rows = plan.filter((r) => r.shape === shape && r.gc === gc);
            assert.deepEqual(
                rows.map((r) => r.engine),
                [
                    "node",
                    "baseline",
                    "candidate",
                    "candidate",
                    "baseline",
                    "node",
                ],
            );
            assert.deepEqual(
                rows.map((r) => r.pair),
                [0, 0, 0, 1, 1, 1],
            );
        }
    assert.equal(new Set(plan.map((r) => r.id)).size, plan.length);
});

test("GC build options are explicit and cannot be disabled by inherited build configuration", () => {
    assert.deepEqual(buildOptions("fixture.mjs", "win32", "on"), {
        fileName: "fixture.mjs",
        target: "win32-x64",
        module: true,
        gcStress: true,
        fullRuntime: false,
    });
    assert.equal(buildOptions("fixture.mjs", "linux", "off").gcStress, false);
});

test("failed builds retain other controls only after verified tree cleanup", () => {
    assert.deepEqual(
        buildDecision({ code: 0, signal: null, cleanupVerified: true }),
        { usable: true, continue: true },
    );
    for (const failure of [
        { code: 1 },
        { signal: "SIGKILL" },
        { timeout: true },
        { error: { code: "ENOENT" } },
    ])
        assert.deepEqual(
            buildDecision({
                code: 0,
                signal: null,
                cleanupVerified: true,
                ...failure,
            }),
            { usable: false, continue: true },
        );
    assert.deepEqual(
        buildDecision({ code: 0, signal: null, cleanupVerified: false }),
        { usable: false, continue: false },
    );
});

function good() {
    return {
        engine: "candidate",
        shape: "many",
        gc: "on",
        pair: 0,
        readyMs: 25,
        probeMs: 4,
        totalMs: 30,
        aggregateVerified: true,
        probeVerified: true,
        cleanupVerified: true,
        code: 0,
        signal: null,
        timeout: null,
        errors: [],
    };
}

test("decision never treats missing, timed-out, unverified or partial evidence as passing", () => {
    const expected = [{ id: "a" }];
    assert.equal(decide([{ ...good(), id: "a" }], expected).pass, true);
    assert.equal(decide([], expected).pass, false);
    assert.equal(
        decide([{ ...good(), id: "a", notStarted: true }], expected).complete,
        false,
    );
    for (const change of [
        { code: 1 },
        { signal: "SIGKILL" },
        { readyMs: null },
        { readyMs: -1 },
        { readyMs: 60001 },
        { totalMs: 90001 },
        { totalMs: -1 },
        { probeMs: null },
        { timeout: "readiness" },
        { aggregateVerified: false },
        { probeVerified: false },
        { cleanupVerified: false },
        { errors: ["spawn"] },
    ]) {
        assert.equal(
            decide([{ ...good(), id: "a", ...change }], expected).pass,
            false,
        );
    }
    assert.equal(
        decide(
            [
                { ...good(), id: "a" },
                { ...good(), id: "a" },
            ],
            expected,
        ).pass,
        false,
    );
    assert.equal(decide([{ ...good(), id: "b" }], expected).pass, false);
    assert.equal(
        decide(
            [{ ...good(), engine: "node", id: "a" }],
            [
                { id: "a", engine: "node" },
                { id: "b", engine: "node" },
            ],
        ).nodeControlsPass,
        false,
    );
});

test("contrary native evidence and failed Node controls remain separate from scaling", () => {
    const plan = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const rows = [
        { ...good(), id: "a", engine: "baseline", readyMs: 20 },
        { ...good(), id: "b", engine: "candidate", readyMs: 40 },
        { ...good(), id: "c", engine: "node", code: 1 },
    ];
    const result = decide(rows, plan);
    assert.equal(result.pass, false);
    assert.equal(result.contrary.length, 1);
    assert.equal(result.nodeControlsPass, false);
    assert.equal(result.historical602Acceptance, false);
    assert.equal(result.nativeTimingImprovementEstablished, false);
});

test("actual generated fixture emits only aggregates and exercises safe semantics in a VM", () => {
    for (const platform of ["win32", "linux"]) {
        const env = makeEnvironment({
            platform,
            shape: "few",
            gc: "on",
            temporary: "/safe",
        });
        // Mock Windows lookup behavior only; no child, compiler or native work.
        const actual =
            platform === "win32"
                ? new Proxy(env, {
                      get(t, k) {
                          const key =
                              typeof k === "string" &&
                              Object.keys(t).find(
                                  (x) => x.toUpperCase() === k.toUpperCase(),
                              );
                          return key ? t[key] : Reflect.get(t, k);
                      },
                      has(t, k) {
                          return (
                              typeof k === "string" &&
                              Object.keys(t).some(
                                  (x) => x.toUpperCase() === k.toUpperCase(),
                              )
                          );
                      },
                      getOwnPropertyDescriptor(t, k) {
                          const key = Object.keys(t).find(
                              (x) => x.toUpperCase() === k.toUpperCase(),
                          );
                          return key
                              ? Object.getOwnPropertyDescriptor(t, key)
                              : undefined;
                      },
                      set(t, k, v) {
                          const key =
                              Object.keys(t).find(
                                  (x) => x.toUpperCase() === k.toUpperCase(),
                              ) || k;
                          t[key] = v;
                          return true;
                      },
                      deleteProperty(t, k) {
                          const key =
                              Object.keys(t).find(
                                  (x) => x.toUpperCase() === k.toUpperCase(),
                              ) || k;
                          return delete t[key];
                      },
                  })
                : env;
        const lines = [];
        const listeners = {};
        const context = {
            console: { log: (s) => lines.push(s) },
            process: {
                platform,
                env: actual,
                stdin: {
                    setEncoding() {},
                    on(name, fn) {
                        listeners[name] = fn;
                    },
                },
                exit(code) {
                    assert.equal(code, 0);
                },
            },
        };
        runInNewContext(fixtureSource(), context, { timeout: 1000 });
        assert.equal(lines.length, 1);
        const aggregate = JSON.parse(lines[0].slice("NONA_ENV_READY ".length));
        assert.ok(verifyAggregate(aggregate, env));
        listeners.data(JSON.stringify(env));
        listeners.end();
        assert.equal(
            lines[1],
            'NONA_ENV_PROBE {"mismatches":0,"semantics":true}',
        );
        assert.equal(lines.length, 2);
    }
});

test("fixture rejects equal-volume wrong values without disclosing names or values", () => {
    const expected = makeEnvironment({
        platform: "linux",
        shape: "few",
        gc: "off",
        temporary: "/safe",
    });
    const actual = Object.assign(Object.create(null), expected);
    actual.NONA_PADDING = "q".repeat(expected.NONA_PADDING.length);
    const lines = [],
        listeners = {};
    let code;
    runInNewContext(
        fixtureSource(),
        {
            console: { log: (line) => lines.push(line) },
            process: {
                platform: "linux",
                env: actual,
                stdin: {
                    setEncoding() {},
                    on(event, fn) {
                        listeners[event] = fn;
                    },
                },
                exit(value) {
                    code = value;
                },
            },
        },
        { timeout: 1000 },
    );
    assert.ok(
        verifyAggregate(
            JSON.parse(lines[0].slice("NONA_ENV_READY ".length)),
            expected,
        ),
    );
    listeners.data(JSON.stringify(expected));
    listeners.end();
    assert.equal(code, 2);
    assert.equal(lines[1], 'NONA_ENV_PROBE {"mismatches":1,"semantics":true}');
    assert.ok(
        lines.every(
            (line) => !line.includes("NONA_PADDING") && !line.includes("qqq"),
        ),
    );
});
