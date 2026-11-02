import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { resolve, join } from "node:path";
import { test } from "node:test";
import { createContext, runInContext, runInNewContext } from "node:vm";
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
    verifyReady,
    visibilityFor,
    admitEvent,
    runCondition,
} from "./process-environment-startup.mjs";

const candidate = "1".repeat(40);

test("native fixture never enumerates the actual environment Proxy across readiness or proof", () => {
    // Pin the real diagnostic boundary, including the runtime's real lookup
    // traps. Restoring either aggregateEnvironment(env) or a post-ready full
    // scan must fail. Host mutations stay synthetic; no compiler is imported.
    const source = readFileSync(
        new URL("../src/lib/runtime/process.js", import.meta.url),
        "utf8",
    );
    const extensions = readFileSync(
        new URL("../src/lib/runtime/process-extensions.js", import.meta.url),
        "utf8",
    );
    const initializer = source.slice(
        source.indexOf("    var env={};"),
        source.indexOf("    function exitStatus("),
    );
    const proxy = extensions.slice(
        extensions.indexOf("    function wideString("),
        extensions.indexOf("var signalListenerCount="),
    );
    assert.ok(initializer.length && proxy.endsWith("process.env=env;"));
    for (const count of [32, 150]) {
        const environment = [
            "NONA_CASE=first",
            "7=numeric",
            "constructor=collision",
            "toString=collision",
            "π=unicode",
            "__proto__=collision",
            "NONA_GC_STRESS=off",
        ];
        while (environment.length < count)
            environment.push(`NONA_SAFE_${environment.length}=s`);
        const listeners = {},
            lines = [];
        let code,
            ownKeys = 0;
        const context = createContext({
            environment,
            TextEncoder,
            process: {
                platform: "win32",
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
            console: {
                log(line) {
                    lines.push(line);
                },
            },
            observeKeys() {
                ownKeys++;
            },
        });
        runInContext(
            `var windows=true,platform="win32",defineProperty=Object.defineProperty,createObject=Object.create,encoder=new TextEncoder(),__nonaRegexpVm={};
            var host={replaceEnvironment(){},SetEnvironmentVariableW(){return true},GetLastError(){return 203}};
            ${initializer}
            ${proxy}
            var folds=0,upper=String.prototype.toUpperCase;
            String.prototype.toUpperCase=function(){folds++;return Reflect.apply(upper,this,[])};
            process.env=new Proxy(process.env,{ownKeys(target){observeKeys();return Reflect.ownKeys(target)}});
        `,
            context,
            { timeout: 1000 },
        );
        runInContext(fixtureSource(), context, { timeout: 1000 });
        const before = {
            count,
            ownKeys,
            folds: runInContext("folds", context),
        };
        // Retain the real RED measurement before any failing assertion.
        console.log("native boundary before READY", JSON.stringify(before));
        assert.equal(
            ownKeys,
            0,
            "READY must not enumerate the environment Proxy",
        );
        assert.ok(
            before.folds <= 8 * (count + 1),
            "READY uses a fixed small sentinel set",
        );
        assert.equal(lines.length, 1);
        listeners.data(
            JSON.stringify(
                Object.fromEntries(
                    environment.map((entry) => {
                        const i = entry.indexOf("=");
                        return [entry.slice(0, i), entry.slice(i + 1)];
                    }),
                ),
            ),
        );
        listeners.end();
        console.log(
            "native boundary after proof",
            JSON.stringify({
                count,
                ownKeys,
                folds: runInContext("folds", context) - before.folds,
            }),
        );
        assert.equal(
            ownKeys,
            0,
            "post-ready native proof must not enumerate the environment Proxy",
        );
        assert.ok(
            runInContext("folds", context) - before.folds <= 40 * (count + 1),
            "proof uses bounded observations and mutations",
        );
        assert.equal(code, 0);
        assert.equal(lines.length, 2);
    }
});
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
        parentAggregateVerified: true,
        visibility: "sampled-native",
        readyVerified: true,
        aggregateVerified: null,
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
        { aggregateVerified: true },
        { parentAggregateVerified: false },
        { readyVerified: false },
        { visibility: "full-node-control" },
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
        {
            ...good(),
            id: "c",
            engine: "node",
            visibility: "full-node-control",
            aggregateVerified: true,
            code: 1,
        },
    ];
    const result = decide(rows, plan);
    assert.equal(result.pass, false);
    assert.equal(result.contrary.length, 1);
    assert.equal(result.nodeControlsPass, false);
    assert.equal(result.historical602Acceptance, false);
    assert.equal(result.nativeTimingImprovementEstablished, false);
});

test("full Node control emits aggregates and exercises safe semantics in a VM", () => {
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
        runInNewContext(fixtureSource({ full: true }), context, {
            timeout: 1000,
        });
        assert.equal(lines.length, 1);
        const aggregate = JSON.parse(lines[0].slice("NONA_ENV_READY ".length));
        assert.deepEqual(verifyReady(aggregate, env, "node"), {
            readyVerified: true,
            aggregateVerified: true,
        });
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
        fixtureSource({ full: true }),
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
            JSON.parse(lines[0].slice("NONA_ENV_READY ".length)).aggregate,
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

test("readiness never promotes sampled native visibility to an aggregate claim", () => {
    const env = { X: "a" };
    assert.equal(visibilityFor("candidate"), "sampled-native");
    assert.deepEqual(verifyReady({ sentinels: true }, env, "candidate"), {
        readyVerified: true,
        aggregateVerified: null,
    });
    assert.equal(
        verifyReady(
            {
                sentinels: true,
                aggregate: { count: 1, units: 5, descriptorErrors: 0 },
            },
            env,
            "candidate",
        ).readyVerified,
        false,
    );
    assert.equal(
        verifyReady({ sentinels: false }, env, "candidate").readyVerified,
        false,
    );
    assert.equal(
        verifyReady({ sentinels: true }, env, "node").readyVerified,
        false,
    );
    assert.deepEqual(
        verifyReady(
            {
                sentinels: true,
                aggregate: { count: 1, units: 5, descriptorErrors: 0 },
            },
            env,
            "node",
        ),
        { readyVerified: true, aggregateVerified: true },
    );
    assert.equal(
        verifyReady(
            {
                sentinels: true,
                aggregate: { count: 1, units: 6, descriptorErrors: 0 },
            },
            env,
            "node",
        ).readyVerified,
        false,
    );
});

test("hosted admission rejects a fork, different PR/owner/ref/event and dispatch pin drift", () => {
    const pr = {
        number: 639,
        state: "open",
        user: { login: "40oleg" },
        head: {
            sha: candidate,
            ref: "nona/issue-638",
            repo: { full_name: "40oleg/nona", owner: { login: "40oleg" } },
        },
        base: { ref: "main", repo: { full_name: "40oleg/nona" } },
    };
    const input = {
        name: "pull_request",
        repository: "40oleg/nona",
        owner: "40oleg",
        ref: "refs/pull/639/merge",
        sha: "3".repeat(40),
        actor: "40oleg",
        candidate,
        candidateBlob: "2".repeat(40),
        pairs: "2",
        event: { action: "synchronize", number: 639, pull_request: pr },
    };
    assert.equal(admitEvent(input).candidate, candidate);
    for (const change of [
        { name: "pull_request_target" },
        { repository: "fork/nona" },
        { owner: "fork" },
        { ref: "refs/heads/main" },
        { candidate: "4".repeat(40) },
        { candidateBlob: BASELINE_BLOB },
        { pairs: "4" },
        { event: { ...input.event, number: 638 } },
        { event: { ...input.event, action: "closed" } },
        {
            event: {
                ...input.event,
                pull_request: { ...pr, user: { login: "fork" } },
            },
        },
        {
            event: {
                ...input.event,
                pull_request: { ...pr, head: { ...pr.head, ref: "other" } },
            },
        },
        {
            event: {
                ...input.event,
                pull_request: {
                    ...pr,
                    head: {
                        ...pr.head,
                        repo: {
                            full_name: "fork/nona",
                            owner: { login: "fork" },
                        },
                    },
                },
            },
        },
        {
            event: {
                ...input.event,
                pull_request: { ...pr, base: { ...pr.base, ref: "later" } },
            },
        },
    ])
        assert.throws(() => admitEvent({ ...input, ...change }));
    const dispatch = {
        ...input,
        name: "workflow_dispatch",
        ref: "refs/heads/nona/issue-638",
        sha: candidate,
        event: {
            inputs: { candidate, candidate_blob: "2".repeat(40), pairs: "2" },
        },
    };
    assert.equal(admitEvent(dispatch).candidate, candidate);
    for (const change of [
        { actor: "fork" },
        { ref: "refs/heads/main" },
        { sha: "3".repeat(40) },
        {
            event: {
                inputs: { ...dispatch.event.inputs, candidate: "4".repeat(40) },
            },
        },
        {
            event: {
                inputs: {
                    ...dispatch.event.inputs,
                    candidate_blob: "5".repeat(40),
                },
            },
        },
    ])
        assert.throws(() => admitEvent({ ...dispatch, ...change }));
});

test("real measurement callbacks retain raw failures and fail closed on protocol, stream and cleanup defects", async () => {
    const directory = resolve(
        "work/review/638-repair",
        `callbacks-${process.pid}`,
    );
    assert.equal(
        existsSync(directory),
        false,
        "never overwrite callback evidence",
    );
    mkdirSync(directory, { recursive: true });
    const env = makeEnvironment({
        platform: "linux",
        shape: "base",
        gc: "off",
        temporary: "/safe",
    });
    const cases = [
        { id: "native", pass: true },
        { id: "node", engine: "node", pass: true },
        { id: "node-wrong-volume", engine: "node", badVolume: true },
        { id: "bad-sentinel", badSentinel: true },
        { id: "bad-selected-value", mismatches: 1 },
        { id: "bad-alias-mutation", semantics: false },
        { id: "duplicate-ready", duplicate: true },
        { id: "stderr", stderr: "raw failure\n" },
        { id: "partial-output", tail: "partial raw failure" },
        { id: "stdout-error", streamError: "stdout" },
        { id: "stderr-error", streamError: "stderr" },
        { id: "stdin-error", streamError: "stdin" },
        { id: "cleanup-unverified", absent: false },
        { id: "status-failure", code: 7 },
    ];
    for (const spec of cases) {
        const engine = spec.engine ?? "candidate",
            item = { id: spec.id, engine, shape: "base", gc: "off", pair: 0 };
        const ready = {
            sentinels: !spec.badSentinel,
            ...(engine === "node"
                ? {
                      aggregate: {
                          count: 39,
                          units: spec.badVolume
                              ? 0
                              : aggregateEnvironment(env).units,
                          descriptorErrors: 0,
                      },
                  }
                : {}),
        };
        const spawnChild = () => {
            const child = new EventEmitter();
            Object.assign(child, {
                pid: 123,
                stdin: new PassThrough(),
                stdout: new PassThrough(),
                stderr: new PassThrough(),
                kill() {},
                unref() {},
            });
            child.stdin.on("finish", () =>
                queueMicrotask(() => {
                    child.stdout.write(
                        `NONA_ENV_PROBE ${JSON.stringify({ mismatches: spec.mismatches ?? 0, semantics: spec.semantics ?? true })}\n`,
                    );
                    if (spec.stderr) child.stderr.write(spec.stderr);
                    if (spec.tail) child.stdout.write(spec.tail);
                    try {
                        if (spec.streamError)
                            child[spec.streamError].emit(
                                "error",
                                Object.assign(
                                    new Error("synthetic stream failure"),
                                    { code: "EIO" },
                                ),
                            );
                    } finally {
                        child.emit("exit", spec.code ?? 0, null);
                        child.emit("close", spec.code ?? 0, null);
                    }
                }),
            );
            queueMicrotask(() => {
                const line = `NONA_ENV_READY ${JSON.stringify(ready)}\n`;
                child.stdout.write(line.slice(0, 10));
                child.stdout.write(line.slice(10));
                if (spec.duplicate) child.stdout.write(line);
            });
            return child;
        };
        const row = await runCondition(
            item,
            "fake-child",
            [],
            env,
            join(directory, spec.id),
            directory,
            () => {},
            new AbortController().signal,
            { spawnChild, pidAbsent: () => spec.absent !== false },
        );
        // All streams/results have been written synchronously by runCondition
        // before inspecting a decision. No native child or OS PID is touched.
        assert.equal(decide([row], [item]).pass, spec.pass === true, spec.id);
        assert.equal(
            row.aggregateVerified,
            engine === "node" ? !spec.badVolume : null,
            spec.id,
        );
        assert.equal(row.code, spec.code ?? 0, spec.id);
        if (spec.stderr)
            assert.equal(
                readFileSync(join(directory, spec.id, "stderr.log"), "utf8"),
                spec.stderr,
            );
        if (spec.tail)
            assert.ok(
                readFileSync(
                    join(directory, spec.id, "stdout.log"),
                    "utf8",
                ).endsWith(spec.tail),
            );
        if (spec.streamError)
            assert.ok(
                row.errors.some(
                    (error) =>
                        error.stream === spec.streamError &&
                        error.code === "EIO",
                ),
            );
    }
});
