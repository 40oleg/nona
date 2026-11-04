// Pure VM/FakeChild checks: never run the driver entrypoint or a real process.
// Like http-latency615.test.mjs, use explicitly supplied, already-owned bytes.
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import {
    patchDriver,
    unpatchDriver,
    sha256,
} from "./http-latency615-support.mjs";
import {
    instrumentLegacyCompletion,
    legacyCorrectnessSmoke,
} from "./http-soak-smoke-policy.mjs";

const original = readFileSync(process.env.LATENCY615_TEST_INPUT);
const wrapperUrl = new URL("./http-soak-check.mjs", import.meta.url);
const wrapper = readFileSync(wrapperUrl, "utf8")
    .replace(/^import[\s\S]*?;\r?\n/gm, "")
    .replaceAll("import.meta.url", JSON.stringify(wrapperUrl.href));
const pin = "ab5ea083d793e0a665fde8b0a4b33bc1fa67208e";
class FakeChild extends EventEmitter {
    pid = 42;
    exitCode = null;
    signalCode = null;
    stdout = new EventEmitter();
    stderr = new EventEmitter();
}
class MemoryFiles extends Map {
    get(p) {
        return super.get(p.replaceAll("\\", "/"));
    }
    set(p, b) {
        return super.set(p.replaceAll("\\", "/"), b);
    }
    has(p) {
        return super.has(p.replaceAll("\\", "/"));
    }
}

// Execute only original histogram/sample/evaluator functions and the inserted
// hooks, with deterministic clock, CPU and statistics. No scheduling or requests.
async function sampleDriver(source, out, files, env, tailBin, mode) {
    let now = 1000;
    let stdout = "";
    const proc = new EventEmitter();
    Object.assign(proc, {
        env,
        pid: 7,
        cpuUsage: () => ({ user: 12, system: 3 }),
        stdout: { write: (value) => (stdout += value) },
        exit(code) {
            if (mode === "during-exit") throw Error("late exit exception");
            this.exitCode = code;
            this.emit("exit", code);
        },
    });
    const append = (p, b) => files.set(p, (files.get(p) ?? "") + b);
    const write = (p, b) => {
        files.set(p, String(b));
        if (mode === "before-exit" && p === join(out, "http-soak.md"))
            throw Error("late report exception");
    };
    const child = new FakeChild();
    const ctx = vm.createContext({
        Buffer,
        structuredClone,
        Date,
        process: proc,
        performance: { now: () => now, timeOrigin: 1700000000000 },
        outDir: out,
        join,
        child,
        serverPath: "inert-server",
        smoke: true,
        os: {
            release: () => "inert",
            arch: () => "x64",
            cpus: () => [{ model: "inert" }],
            totalmem: () => 1024,
        },
        gitCommit: () => "inert",
        target: "linux-x64",
        serverLog: [],
        mix: [["big", 1]],
        writeFileSync: write,
        readFileSync: (p) => files.get(p),
        __l615Append: append,
        __l615Write: write,
        __diagAppendFileSync: append,
        console: { log: (value) => (stdout += value + "\n") },
        fetchStats: async () => ({
            memory: { rss: 100 },
            openSockets: 1,
            activeResources: 0,
            errors: 0,
            uncaught: 0,
        }),
        procRss: () => 100,
        procFds: () => null,
    });
    const slice = (start, end) =>
        source.slice(source.indexOf(start), source.indexOf(end));
    const hook = (id) => {
        const start = `/* latency615:${id}:begin */`;
        return source.includes(start)
            ? slice(start, `/* latency615:${id}:end */`)
            : "";
    };
    vm.runInContext(
        source.slice(0, source.indexOf("import {")) +
            hook("runtime") +
            slice("function envNumber", "const PATHS") +
            slice("const BUCKET_BASE", "function sleep") +
            slice("const counters = {", "let jsonLength") +
            "let loadStart = 0, crash = null; function elapsedSeconds() { return loadStart ? (performance.now()-loadStart)/1000 : 0; }\n" +
            slice("const samples = [];", "// --- Run") +
            "const __l615SpawnBefore = 999;\n" +
            hook("server") +
            slice("const __diagOut", "let stopping = false;"),
        ctx,
    );
    child.stdout.emit("data", Buffer.from("raw stdout\n"));
    child.stderr.emit("data", Buffer.from("raw stderr\n"));
    vm.runInContext("var baseline, after;", ctx);
    await vm.runInContext(
        '(async () => { baseline = await sample("baseline"); })()',
        ctx,
    );
    now = 2000;
    vm.runInContext(
        "loadStart = 2000; lastSampleAt = loadStart;\n" + hook("start"),
        ctx,
    );
    for (let i = 1; i <= 30; i++) {
        now = 2000 + i * 10000;
        const n = i === 30 ? 9587 : 5000;
        const bin = i > 24 ? tailBin : 818;
        vm.runInContext(
            `interval.requests = ${n}; interval.hist.n = ${n}; interval.hist.counts[${bin}] = ${n}; counters.ok += ${n};`,
            ctx,
        );
        await vm.runInContext('sample("load")', ctx);
    }
    vm.runInContext(
        "var loadSeconds = 300;\n" +
            hook("stop") +
            hook("drained") +
            hook("settle"),
        ctx,
    );
    now = 310000;
    await vm.runInContext(
        '(async () => { after = await sample("after"); })()',
        ctx,
    );
    vm.runInContext(hook("kill"), ctx);
    if (mode !== "orphan") child.emit("exit", 0, null);
    child.stdout.emit("end");
    child.stdout.emit("close");
    child.stderr.emit("end");
    child.stderr.emit("close");
    child.emit("close", 0, null);
    if (mode === "failed-request")
        vm.runInContext(
            "counters.failed = 1; counters.failures.test = 1;",
            ctx,
        );
    try {
        vm.runInContext(source.slice(source.indexOf("// --- Criteria")), ctx);
    } catch (error) {
        proc.emit("uncaughtExceptionMonitor", error);
        proc.exitCode = 1;
        proc.emit("exit", 1);
    }
    return { code: proc.exitCode, stdout };
}

async function runWrapper({
    bytes = original,
    revision = pin,
    tailBin = 842,
    exitCode,
    mode,
} = {}) {
    const files = new MemoryFiles(),
        calls = [];
    const root = resolve(dirname(fileURLToPath(wrapperUrl)), "..");
    const out = join(root, "work", "http-601", "soak");
    const sourcePath = join(
        root,
        "work",
        "http-601-soak-source",
        "scripts",
        "http-soak.mjs",
    );
    files.set(sourcePath, bytes);
    const proc = {
        platform: "linux",
        env: {},
        execPath: "inert-node",
        stdout: { write() {} },
        stderr: { write() {} },
        kill(...args) {
            calls.push({ kill: args });
            assert.equal(mode, "orphan", "unexpected orphan cleanup");
        },
    };
    const ctx = vm.createContext({
        assert,
        createHash,
        dirname,
        join,
        resolve,
        fileURLToPath,
        patchDriver,
        instrumentLegacyCompletion,
        legacyCorrectnessSmoke,
        process: proc,
        console: { error() {} },
        hostedIdentity: () => ({
            commit: "6beb53a80e2e7e8eb0d61312fff19c0474fb363b",
        }),
        mkdirSync() {},
        readFileSync: (p, encoding) => {
            const b = files.get(p) ?? Buffer.from("inert build bytes");
            return encoding ? String(b) : Buffer.from(b);
        },
        writeFileSync: (p, b) => files.set(p, b),
        appendFileSync: (p, b) => files.set(p, (files.get(p) ?? "") + b),
        spawnSync: (command, args, options) => {
            calls.push({ command, args, options });
            return {
                status: 0,
                signal: null,
                stdout: command === "git" ? revision : "",
                stderr: "",
            };
        },
        spawn: (command, args, options) => {
            calls.push({ command, args, options });
            const child = new FakeChild();
            queueMicrotask(async () => {
                try {
                    const result = await sampleDriver(
                        String(files.get(sourcePath)),
                        out,
                        files,
                        options.env,
                        tailBin,
                        mode,
                    );
                    child.stdout.emit("data", Buffer.from(result.stdout));
                    if (mode === "child-error")
                        child.emit("error", Error("late child error"));
                    const code = exitCode ?? result.code;
                    child.exitCode = code;
                    child.emit("exit", code, null);
                    child.emit("close", code, null);
                } catch (error) {
                    child.emit("error", error);
                    child.exitCode = 1;
                    child.emit("close", 1, null);
                }
            });
            return child;
        },
        setTimeout: (fn, ms) => {
            calls.push({ deadline: ms });
            return 1;
        },
        clearTimeout() {},
    });
    await vm.runInContext("(async () => {\n" + wrapper + "\n})()", ctx);
    return {
        files,
        out,
        calls,
        exitCode: proc.exitCode,
        report: JSON.parse(files.get(join(out, "verification.json"))),
    };
}

test("normal wrapper defers only smoke p99 while retaining lossless intervals and original exit 1", async () => {
    const run = await runWrapper();
    assert.ok(
        run.files.has(join(run.out, "intervals.jsonl")),
        "normal smoke is missing lossless interval instrumentation",
    );
    const json = (name) => JSON.parse(run.files.get(join(run.out, name)));
    const intervals = String(run.files.get(join(run.out, "intervals.jsonl")))
        .trim()
        .split("\n")
        .map(JSON.parse);
    assert.deepEqual(
        intervals.map(({ index, phase, start, end }) => ({
            index,
            phase,
            start,
            end,
        })),
        [
            { index: 0, phase: "baseline", start: 0, end: 0 },
            ...Array.from({ length: 30 }, (_, i) => ({
                index: i + 1,
                phase: "load",
                start: i * 10000,
                end: (i + 1) * 10000,
            })),
            { index: 31, phase: "after", start: 300000, end: 308000 },
        ],
    );
    for (const [index, bin, n] of [
        [7, 818, 5000],
        [30, 842, 9587],
    ]) {
        const expected = Array(2000).fill(0);
        expected[bin] = n;
        assert.deepEqual(intervals[index].histogram, { n, counts: expected });
        assert.deepEqual(intervals[index].cpu, {
            mono: index === 7 ? 72000 : 302000,
            user: 12,
            system: 3,
        });
        assert.deepEqual(intervals[index].absolute, {
            timeOrigin: 1700000000000,
            start: index === 7 ? 62000 : 292000,
            end: index === 7 ? 72000 : 302000,
            loadStart: 2000,
            swap: index === 7 ? [72000, 72000] : [302000, 302000],
            stats: index === 7 ? [72000, 72000] : [302000, 302000],
        });
    }
    const telemetry = json("telemetry.json"),
        scalar = json("http-soak.json");
    assert.deepEqual(telemetry.headIndices, [7, 8, 9, 10, 11, 12]);
    assert.deepEqual(telemetry.tailIndices, [24, 25, 26, 27, 28, 29, 30]);
    const headCounts = Array(2000).fill(0),
        tailCounts = Array(2000).fill(0);
    headCounts[818] = 30000;
    tailCounts[818] = 5000;
    tailCounts[842] = 34587;
    assert.deepEqual(telemetry.head, { n: 30000, counts: headCounts });
    assert.deepEqual(telemetry.tail, { n: 39587, counts: tailCounts });
    assert.equal(scalar.summary.p99Head, 3.427);
    assert.equal(scalar.summary.p99Tail, 4.351);
    assert.equal(scalar.summary.ok, 154587);
    assert.equal(scalar.summary.failed, 0);
    assert.equal(scalar.summary.pass, false);
    assert.equal(telemetry.pass, false);
    assert.equal(json("telemetry-state.json").exitCode, 1);
    assert.equal(json("harness-exit.json").code, 1);
    assert.equal(run.exitCode, undefined);
    assert.equal(run.report.pass, true, JSON.stringify(run.report.failure));
    assert.equal(run.report.correctnessSmoke.originalPass, false);
    assert.equal(run.report.correctnessSmoke.acceptancePass, false);
    assert.equal(run.report.correctnessSmoke.p99.gating, false);
    assert.equal(json("driver-completion.json").code, 1);
    assert.equal(
        json("driver-completion.json").json,
        run.files.get(join(run.out, "http-soak.json")),
    );
    assert.equal(
        json("driver-completion.json").markdown,
        run.files.get(join(run.out, "http-soak.md")),
    );
    assert.match(
        run.files.get(join(run.out, "http-soak.md")),
        /^# HTTP soak test: FAIL\n/,
    );
    assert.match(
        run.files.get(join(run.out, "harness.stdout.log")),
        /\nFAIL; reports in /,
    );
    assert.equal(run.files.get(join(run.out, "driver-errors.jsonl")), "");
    assert.equal(run.files.get(join(run.out, "harness.stderr.log")), "");
    const events = String(run.files.get(join(run.out, "events.jsonl")))
        .trim()
        .split("\n")
        .map(JSON.parse);
    for (const kind of [
        "origin",
        "server.spawn",
        "load.start",
        "load.stop",
        "load.drained",
        "settle.start",
        "settle.end",
        "server.kill.request",
        "server.exit",
        "server.close",
        "server.stdout.end",
        "server.stderr.close",
        "harness.jsExit",
    ])
        assert.ok(
            events.some((e) => e.kind === kind),
            kind,
        );
    assert.equal(events.find((e) => e.kind === "harness.jsExit").code, 1);
});

test("composition is reversible and preserves normal settings, deadline and raw cleanup receipts", async () => {
    const run = await runWrapper({ tailBin: 818 });
    const executed = String(
        run.files.get(join(run.out, "http-soak.executed.mjs")),
    );
    assert.ok(
        run.files.has(join(run.out, "http-soak.patch.json")),
        "missing composition patch receipt",
    );
    const receipt = JSON.parse(
        run.files.get(join(run.out, "http-soak.patch.json")),
    );
    const loggingStart = executed.indexOf("\nconst __diagOut");
    const loggingEnd = executed.indexOf("let stopping = false;", loggingStart);
    const completed = (
        executed.slice(0, loggingStart) + executed.slice(loggingEnd)
    ).replace(
        "import { appendFileSync as __diagAppendFileSync, mkdirSync,",
        "import { mkdirSync,",
    );
    const lossless = patchDriver(original).source;
    assert.equal(completed, instrumentLegacyCompletion(lossless.toString()));
    assert.deepEqual(unpatchDriver(lossless, receipt.recipe), original);
    assert.equal(receipt.originalSha256, sha256(original));
    assert.equal(receipt.losslessSha256, sha256(lossless));
    assert.equal(receipt.executedSha256, sha256(executed));
    assert.equal(run.report.originalHarnessSha256, receipt.originalSha256);
    assert.equal(run.report.executedHarnessSha256, receipt.executedSha256);
    assert.equal(
        String(run.files.get(join(run.out, "http-soak.original.mjs"))),
        original.toString(),
    );
    assert.deepEqual(run.report.settings, {
        minutes: 5,
        warmupMinutes: 1,
        sampleSeconds: 10,
        mix: "big=1",
        connections: 1,
        server: join(run.out, "soak-server"),
    });
    const launch = run.calls.find(
        (c) => c.args?.[0] === "scripts/http-soak.mjs",
    );
    assert.deepEqual(Array.from(launch.args), [
        "scripts/http-soak.mjs",
        "--smoke",
        "--out",
        run.out,
    ]);
    for (const [key, value] of Object.entries({
        NONA_SOAK_MINUTES: "5",
        NONA_SOAK_WARMUP_MINUTES: "1",
        NONA_SOAK_SAMPLE_SECONDS: "10",
        NONA_SOAK_MIX: "big=1",
        NONA_SOAK_CONNECTIONS: "1",
    }))
        assert.equal(launch.options.env[key], value);
    assert.ok(run.calls.some((c) => c.deadline === 480000));
    assert.equal(run.report.pass, true);
    assert.equal(run.exitCode, undefined);
    assert.deepEqual(
        run.report.serverEvents.map((e) => e.event),
        ["spawn", "exit"],
    );
    assert.equal(
        String(run.files.get(join(run.out, "server.stdout.log"))),
        "raw stdout\n",
    );
    assert.equal(
        String(run.files.get(join(run.out, "server.stderr.log"))),
        "raw stderr\n",
    );
    assert.equal(
        JSON.parse(run.files.get(join(run.out, "harness-exit.json"))).code,
        0,
    );
});

test("changed revision, pin or insertion markers are refused before build or execution", async () => {
    for (const options of [
        { revision: "0".repeat(40) },
        {
            bytes: Buffer.from(
                original
                    .toString()
                    .replace("let stopping = false;", "let stopping = true; "),
            ),
        },
        {
            bytes: Buffer.from(
                original
                    .toString()
                    .replace(
                        "import { mkdirSync,",
                        "import { mkdirSync,".replace("mkdir", "noDir"),
                    ),
            ),
        },
        {
            bytes: Buffer.from(
                original.toString().replace("p99Growth: 0.2", "p99Growth: 0.9"),
            ),
        },
    ]) {
        const run = await runWrapper(options);
        assert.equal(run.report.pass, false);
        assert.equal(run.exitCode, 1);
        assert.equal(
            run.calls.length,
            1,
            "no build or workload after pin refusal",
        );
        assert.ok(!run.files.has(join(run.out, "http-soak.executed.mjs")));
    }
});

test("contradictory scalar verdict and native exit still fail the normal wrapper", async () => {
    const scalar = await runWrapper({ exitCode: 0 });
    assert.equal(scalar.report.pass, false);
    assert.equal(scalar.exitCode, 1);
    assert.ok(scalar.report.failure);
    const exit = await runWrapper({ tailBin: 818, exitCode: 1 });
    assert.equal(exit.report.pass, false);
    assert.equal(exit.exitCode, 1);
    assert.ok(exit.report.failure);
});

for (const mode of [
    "failed-request",
    "before-exit",
    "during-exit",
    "child-error",
    "orphan",
])
    test(`actual composed wrapper fails closed on ${mode}`, async () => {
        const run = await runWrapper({ mode });
        assert.equal(run.report.pass, false);
        assert.equal(run.exitCode, 1);
        assert.ok(run.report.failure);
        if (mode === "before-exit" || mode === "during-exit")
            assert.match(
                run.files.get(join(run.out, "driver-errors.jsonl")),
                /late .* exception/,
            );
        if (mode === "orphan") {
            assert.equal(run.report.orphanCleanup.pid, 42);
            assert.deepEqual(run.calls.find((c) => c.kill).kill, [
                42,
                "SIGKILL",
            ]);
        }
    });
