// Pure/source/fake-child tests only. No driver entrypoint, compiler or observer runs.
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { deflateRawSync } from "node:zlib";
let s = {};
let c = {};
try {
    s = await import("./http-latency615-support.mjs");
} catch (e) {
    if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
}
try {
    c = await import("./http-latency615.mjs");
} catch (e) {
    if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
}
const api = (name) => {
    assert.equal(
        typeof s[name],
        "function",
        `missing support behavior: ${name}`,
    );
    return s[name];
};
const head = "a".repeat(40),
    tree = "b".repeat(40),
    workflowHash = "c".repeat(64);
function admission() {
    return {
        event: "workflow_dispatch",
        mode: "latency615-triad",
        repository: "40oleg/nona",
        headRepository: "40oleg/nona",
        ref: "refs/heads/nona/issue-615",
        actor: "40oleg",
        triggeringActor: "40oleg",
        attempt: "1",
        sha: head,
        checkout: head,
        tree,
        workflowSha: head,
        workflowRef:
            "40oleg/nona/.github/workflows/http-keepalive.yml@refs/heads/nona/issue-615",
        workflowHash,
        workflowId: 402730666,
        expectedWorkflowId: "402730666",
        expectedHead: head,
        expectedTree: tree,
        expectedWorkflowHash: workflowHash,
        sourceIdentityHash: "d".repeat(64),
        nonce: "triad-20261102-ab12",
        actions: "true",
        contextEnvironment: "github-hosted",
        runnerEnvironment: "github-hosted",
        platform: "win32",
        arch: "x64",
        node: "v26.9.0",
        runnerOS: "Windows",
        runnerArch: "X64",
        runner: "GitHub Actions 1234",
        run: "1234567",
        job: "latency615-triad",
    };
}
function receipt() {
    return {
        schemaVersion: 1,
        repository: { id: 123, fullName: "40oleg/nona" },
        workflow: {
            id: 402730666,
            path: ".github/workflows/http-keepalive.yml",
        },
        run: {
            id: 41476110342,
            attempt: 1,
            event: "pull_request",
            headRepository: "40oleg/nona",
            headBranch: "nona/issue-615",
            headSha: "3c4fe0d93964bebf243bf39fdd72880bca1abb2c",
        },
        job: {
            id: 125381994170,
            name: "HTTP keep-alive (windows-latest)",
            attempt: 1,
            status: "completed",
            conclusion: "failure",
            runnerId: 1234,
            runnerName: "GitHub Actions 1000035679",
            runnerGroupName: "GitHub Actions",
        },
        artifact: {
            id: 13158691140,
            name: "http-601-windows-latest",
            runId: 41476110342,
            headSha: "3c4fe0d93964bebf243bf39fdd72880bca1abb2c",
            sizeInBytes: 4569517,
            digest: "sha256:237b876954736a60cdc9bd9102a680099f9811377ad7f9c79919e005f59493dc",
        },
    };
}
function hist(n = 2, bin = 100) {
    const counts = Array(2000).fill(0);
    counts[bin] = n;
    return { n, counts };
}
function intervals() {
    return [
        {
            index: 0,
            phase: "baseline",
            start: 0,
            end: 0,
            t: 0,
            histogram: hist(0),
            swap: [0, 0],
            stats: { start: 0, end: 1, available: true },
        },
        ...Array.from({ length: 30 }, (_, i) => ({
            index: i + 1,
            phase: "load",
            start: i * 10000,
            end: (i + 1) * 10000,
            t: (i + 1) * 10,
            histogram: hist(),
            swap: [(i + 1) * 10000, (i + 1) * 10000 + 0.01],
            stats: {
                start: (i + 1) * 10000 + 0.02,
                end: (i + 1) * 10000 + 1,
                available: true,
            },
        })),
        {
            index: 31,
            phase: "after",
            start: 300000,
            end: 308000,
            t: 308,
            histogram: hist(1),
            swap: [308000, 308000.01],
            stats: { start: 308000.02, end: 308001, available: true },
        },
    ].map((r) => ({
        ...r,
        absolute: {
            timeOrigin: 1700000000000,
            loadStart: r.phase === "baseline" ? null : 1000,
            start: r.phase === "baseline" ? 900 : 1000 + r.start,
            end: r.phase === "baseline" ? 900 : 1000 + r.end,
            swap:
                r.phase === "baseline"
                    ? [900, 900]
                    : r.swap.map((v) => 1000 + v),
            stats:
                r.phase === "baseline"
                    ? [900, 901]
                    : [1000 + r.stats.start, 1000 + r.stats.end],
        },
    }));
}
function zip(name, bytes) {
    const n = Buffer.from(name),
        compressed = deflateRawSync(bytes),
        l = Buffer.alloc(30),
        d = Buffer.alloc(46),
        e = Buffer.alloc(22);
    l.writeUInt32LE(0x04034b50);
    l.writeUInt16LE(20, 4);
    l.writeUInt16LE(8, 8);
    l.writeUInt32LE(compressed.length, 18);
    l.writeUInt32LE(bytes.length, 22);
    l.writeUInt16LE(n.length, 26);
    d.writeUInt32LE(0x02014b50);
    d.writeUInt16LE(20, 4);
    d.writeUInt16LE(20, 6);
    d.writeUInt16LE(8, 10);
    d.writeUInt32LE(compressed.length, 20);
    d.writeUInt32LE(bytes.length, 24);
    d.writeUInt16LE(n.length, 28);
    const local = Buffer.concat([l, n, compressed]),
        directory = Buffer.concat([d, n]);
    e.writeUInt32LE(0x06054b50);
    e.writeUInt16LE(1, 8);
    e.writeUInt16LE(1, 10);
    e.writeUInt32LE(directory.length, 12);
    e.writeUInt32LE(local.length, 16);
    return Buffer.concat([local, directory, e]);
}

test("admission rejects a changed identity before execution, never invents future pins", () => {
    const admit = api("admit");
    assert.equal(admit(admission()).nonce, "triad-20261102-ab12");
    for (const [key, value] of Object.entries({
        event: "pull_request",
        mode: "normal",
        repository: "fork/nona",
        headRepository: "fork/nona",
        ref: "refs/pull/629/merge",
        actor: "intruder",
        triggeringActor: "intruder",
        attempt: "2",
        sha: "e".repeat(40),
        checkout: "e".repeat(40),
        tree: "e".repeat(40),
        workflowSha: "e".repeat(40),
        workflowRef:
            "40oleg/nona/.github/workflows/http-keepalive.yml@refs/heads/main",
        workflowHash: "e".repeat(64),
        workflowId: 1,
        expectedHead: "",
        expectedTree: "",
        expectedWorkflowHash: "",
        sourceIdentityHash: "",
        nonce: "../bad",
        actions: "false",
        contextEnvironment: "self-hosted",
        runnerEnvironment: "self-hosted",
        platform: "linux",
        arch: "arm64",
        node: "v26.10.0",
        runnerOS: "Linux",
        runnerArch: "ARM64",
        runner: "",
        run: "",
        job: "",
    }))
        assert.throws(
            () => admit({ ...admission(), [key]: value }),
            undefined,
            key,
        );
});
test("canonical source metadata rejects false identities and duplicate JSON keys", () => {
    const canonical = api("canonicalSource"),
        strict = api("parseJson");
    assert.equal(canonical(receipt()), JSON.stringify(receipt()));
    for (const [section, key, value] of [
        ["repository", "id", 0],
        ["repository", "fullName", "fork/nona"],
        ["workflow", "path", "other.yml"],
        ["run", "id", 1],
        ["run", "attempt", 2],
        ["run", "headRepository", "fork/nona"],
        ["run", "headSha", head],
        ["job", "id", 1],
        ["job", "status", "queued"],
        ["job", "conclusion", "success"],
        ["job", "runnerName", "self-hosted"],
        ["artifact", "id", 1],
        ["artifact", "sizeInBytes", 10],
        ["artifact", "digest", "sha256:" + "0".repeat(64)],
    ]) {
        const r = structuredClone(receipt());
        r[section][key] = value;
        assert.throws(() => canonical(r), undefined, `${section}.${key}`);
    }
    assert.throws(() => strict('{"a":1,"a":2}'));
    assert.throws(() => strict('{"a":{"b":1,"b":2}}'));
    assert.throws(() => strict("{"));
    assert.deepEqual(strict('{"a":[1,{"b":"b"}]}'), { a: [1, { b: "b" }] });
});
test("bounded ZIP validates directory and bytes before exposing any allowlisted entry", () => {
    const read = api("readArchive"),
        hash = api("sha256"),
        data = Buffer.from("inert fixture"),
        b = zip("safe.txt", data);
    const pin = {
        size: b.length,
        sha256: hash(b),
        entries: [{ name: "safe.txt", size: data.length, sha256: hash(data) }],
    };
    assert.deepEqual(read(b, pin).get("safe.txt"), data);
    for (const name of [
        "../safe.txt",
        "C:/safe.txt",
        "safe.txt:ads",
        "AUX",
        "a\\b",
        "/root",
        "a./b",
        "a /b",
    ]) {
        const bad = zip(name, data);
        assert.throws(
            () =>
                read(bad, {
                    ...pin,
                    size: bad.length,
                    sha256: hash(bad),
                    entries: [{ ...pin.entries[0], name }],
                }),
            undefined,
            name,
        );
    }
    assert.throws(() => read(b.subarray(0, -1), pin));
    assert.throws(() => read(b, { ...pin, sha256: "0".repeat(64) }));
    assert.throws(() =>
        read(b, {
            ...pin,
            entries: [{ ...pin.entries[0], sha256: "0".repeat(64) }],
        }),
    );
    const bomb = Buffer.from(b);
    bomb.writeUInt32LE(11 * 1024 * 1024, b.readUInt32LE(b.length - 6) + 24);
    assert.throws(() => read(bomb, { ...pin, sha256: hash(bomb) }));
});
test("unsafe Windows paths and sibling roots cannot be materialized or removed", () => {
    const owned = api("ownedPath");
    assert.equal(
        owned("C:\\work", "C:\\work\\a\\file.txt"),
        "C:\\work\\a\\file.txt",
    );
    for (const p of [
        "C:\\work2\\x",
        "C:\\work",
        "C:relative",
        "\\\\host\\share",
        "C:\\work\\..\\x",
        "C:\\work\\x:ads",
        "C:\\work\\CON",
        "C:\\work\\x.",
        "C:\\work\\x ",
    ])
        assert.throws(() => owned("C:\\work", p), undefined, p);
});
test("fixed child environment strips auth, proxies, hooks and all workload overrides", () => {
    const env = api("armEnvironment")(
        {
            SystemRoot: "C:\\Windows",
            PATH: "safe",
            TEMP: "C:\\tmp",
            GITHUB_TOKEN: "secret",
            HTTP_PROXY: "secret",
            NODE_OPTIONS: "--import evil",
            NONA_SOAK_MINUTES: "0.1",
            NONA_GC_STRESS: "1",
        },
        "C:\\stage\\soak-server.exe",
    );
    assert.equal(env.NONA_SOAK_MINUTES, "5");
    assert.equal(env.NONA_SOAK_WARMUP_MINUTES, "1");
    assert.equal(env.NONA_SOAK_SAMPLE_SECONDS, "10");
    assert.equal(env.NONA_SOAK_CONNECTIONS, "1");
    assert.equal(env.NONA_SOAK_MIX, "big=1");
    assert.equal(env.NONA_SOAK_PAUSE_MS, "0");
    for (const k of [
        "GITHUB_TOKEN",
        "HTTP_PROXY",
        "NODE_OPTIONS",
        "NONA_GC_STRESS",
    ])
        assert.equal(env[k], undefined);
});
test("source patch is additive and roundtrips exact protected request/evaluator bytes", () => {
    const patch = api("patchDriver"),
        unpatch = api("unpatchDriver");
    assert.ok(
        process.env.LATENCY615_TEST_INPUT,
        "explicit inert original source fixture required",
    );
    const original = readFileSync(process.env.LATENCY615_TEST_INPUT),
        result = patch(original);
    assert.deepEqual(unpatch(result.source, result.recipe), original);
    const source = original.toString();
    for (const [start, end] of [
        ["function request(agent, route)", "// A slow client:"],
        ["function worker()", "// --- Sampling"],
        ["// --- Criteria", "const report = {"],
    ]) {
        const part = source.slice(source.indexOf(start), source.indexOf(end));
        assert.ok(part.length > 100);
        assert.ok(result.source.toString().includes(part), start);
    }
    for (const bad of [
        Buffer.from(source + "\n"),
        Buffer.from("\ufeff" + source),
        Buffer.from(source.replaceAll("\n", "\r\n")),
        Buffer.from(source.replace("let stopping = false;", "")),
        original.subarray(0, -1),
    ])
        assert.throws(() => patch(bad));
});
test("original histogram and OR predicate are exercised as inert VM functions", () => {
    api("patchDriver");
    const text = readFileSync(process.env.LATENCY615_TEST_INPUT, "utf8");
    const math = text.slice(
        text.indexOf("const BUCKET_BASE"),
        text.indexOf("function median"),
    );
    const ctx = vm.createContext({});
    vm.runInContext(
        math + "\nthis.result={newHistogram,record,merge,quantile};",
        ctx,
    );
    const h = ctx.result.newHistogram();
    ctx.result.record(h, 1);
    ctx.result.record(h, 2);
    assert.equal(h.n, 2);
    assert.equal(
        [...h.counts].reduce((a, b) => a + b),
        2,
    );
    assert.ok(ctx.result.quantile(h, 0.99) >= 2);
    const verdict = api("originalLatencyPass");
    assert.equal(verdict(10, 11.9), true);
    assert.equal(verdict(1, 1.4), true);
    assert.equal(verdict(4.058, 4.903), false);
    assert.equal(verdict(null, 1), false);
});
test("raw 2000-bin intervals retain original asymmetric windows and reject incomplete cuts", () => {
    const validate = api("validateIntervals"),
        good = intervals();
    const r = validate(good, 300.01);
    assert.deepEqual(r.headIndices, [7, 8, 9, 10, 11, 12]);
    assert.deepEqual(r.tailIndices, [24, 25, 26, 27, 28, 29, 30]);
    assert.equal(r.head.n, 12);
    assert.equal(r.tail.n, 14);
    assert.equal(r.after.n, 1);
    for (const mutate of [
        (a) => a.pop(),
        (a) => a.splice(10, 1),
        (a) => a[2].start++,
        (a) => (a[2].end = -1),
        (a) => (a[2].index = 1),
        (a) => a[2].histogram.n++,
        (a) => a[2].histogram.counts.pop(),
        (a) => (a[2].histogram.counts[1] = -1),
        (a) => (a[2].histogram.counts[100] = 4294967296),
        (a) => (a[2].histogram = hist(0)),
        (a) => (a[2].stats.available = false),
        (a) => a[2].swap.reverse(),
    ]) {
        const a = structuredClone(good);
        mutate(a);
        assert.throws(() => validate(a, 300.01));
    }
});
test("CPU coverage keeps actual brackets, gaps and unknowns without invented zeros", () => {
    const coverage = api("counterCoverage");
    const points = [0, 10, 20].map((n, i) => ({
        sequence: i + 1,
        send: n,
        receive: n + 0.1,
        identity: "42/123",
        available: true,
        totalMs: n * 10,
        userMs: n * 7,
        privilegedMs: n * 3,
        ticks: n * 1000,
        frequency: 1000,
    }));
    assert.equal(coverage(points, 1, 19).complete, true);
    for (const mutate of [
        (p) => p.pop(),
        (p) => (p[1].available = false),
        (p) => (p[1].totalMs = null),
        (p) => (p[1].totalMs = -1),
        (p) => (p[1].identity = "42/reused"),
        (p) => (p[1].sequence = 1),
        (p) => (p[1].ticks = -1),
        (p) => (p[1].receive = 30),
        (p) => (p[1].frequency = 2000),
    ]) {
        const p = structuredClone(points);
        mutate(p);
        assert.equal(coverage(p, 1, 19).complete, false);
    }
    const missing = coverage([], 1, 19);
    assert.equal(missing.complete, false);
    assert.equal(missing.uncoveredMs, 18);
    assert.equal(missing.deltaMs, null);
});
class FakeChild extends EventEmitter {
    constructor() {
        super();
        this.stdout = new PassThrough();
        this.stderr = new PassThrough();
        this.pid = 123;
        this.exitCode = null;
        this.signalCode = null;
    }
}
test("process receipts distinguish error, OS exit, stream closure and actual close", async () => {
    assert.equal(typeof c.observeChild, "function");
    const child = new FakeChild(),
        r = c.observeChild(child);
    child.emit("exit", 3221225477, null);
    assert.equal(r.receipt.complete, false);
    child.stdout.emit("end");
    child.stdout.emit("close");
    child.stderr.emit("end");
    child.stderr.emit("close");
    child.emit("close", 3221225477, null);
    await r.closed;
    assert.equal(r.receipt.complete, true);
    assert.equal(r.receipt.exit.hex, "0xc0000005");
    assert.equal(r.receipt.exit.code, 3221225477);
    const failed = new FakeChild(),
        f = c.observeChild(failed);
    failed.emit(
        "error",
        Object.assign(new Error("missing"), { code: "ENOENT" }),
    );
    failed.emit("close", -2, null);
    await f.closed;
    assert.equal(f.receipt.complete, false);
    assert.equal(f.receipt.errors[0].code, "ENOENT");
    const pipe = new FakeChild(),
        p = c.observeChild(pipe);
    pipe.emit("exit", 0, null);
    pipe.stdout.emit("error", new Error("broken pipe"));
    pipe.emit("close", 0, null);
    await p.closed;
    assert.equal(p.receipt.complete, false);
});
test("finite triad retains failing A, never retries and stops on unsafe cleanup or budget", async () => {
    assert.equal(typeof c.runTriad, "function");
    let now = 0;
    const seen = [];
    const io = {
        now: () => now,
        gap: async (ms) => {
            now += ms;
        },
        arm: async (name) => {
            seen.push(name);
            now += 310000;
            return {
                name,
                originalCriteriaPass: name !== "nativeA",
                telemetryComplete: true,
                cleanupComplete: true,
                workloadCompleted: true,
                exitCode: name === "nativeA" ? 1 : 0,
            };
        },
    };
    const r = await c.runTriad(io, 0);
    assert.deepEqual(seen, ["nativeA", "node", "nativeB"]);
    assert.equal(r.exitCode, 1);
    assert.equal(r.accepted, false);
    assert.equal(r.arms[0].exitCode, 1);
    now = 0;
    seen.length = 0;
    const unsafe = await c.runTriad(
        {
            ...io,
            arm: async (name) => {
                seen.push(name);
                return { name, cleanupComplete: false };
            },
        },
        0,
    );
    assert.deepEqual(seen, ["nativeA"]);
    assert.equal(unsafe.arms[1].status, "not-started");
    now = 1200000;
    seen.length = 0;
    const late = await c.runTriad(io, 0);
    assert.equal(seen.length, 0);
    assert.equal(late.exitCode, 1);
    assert.match(late.arms[0].reason, /budget/);
    now = 0;
    const all = await c.runTriad(
        {
            ...io,
            arm: async (name) => ({
                name,
                originalCriteriaPass: true,
                telemetryComplete: true,
                cleanupComplete: true,
                workloadCompleted: true,
                exitCode: 0,
                provenanceComplete: true,
                observerHealthy: true,
                errors: [],
            }),
        },
        0,
    );
    assert.equal(all.exitCode, 0);
    assert.equal(all.accepted, false);
});
test("manual triad preserves the complete ordinary hosted job and its manual admission", () => {
    const digest = api("normalJobDigest"),
        yaml = readFileSync(
            new URL("../.github/workflows/http-keepalive.yml", import.meta.url),
        );
    assert.equal(
        digest(yaml),
        "7c23f626d88cdffc9d4eae2e3761ec8ece3f95213bd765cf6388e2565f29513a",
    );
    assert.ok(yaml.toString().includes("timeout-minutes: 31"));
    assert.ok(yaml.toString().includes("latency615-triad:"));
});

test("counter coverage tolerates unavailable points outside covered windows but rejects interior gaps", () => {
    const f = api("counterCoverage"),
        point = (sequence, ms) => ({
            sequence,
            send: ms,
            receive: ms + 0.1,
            identity: "p/creation",
            available: true,
            totalMs: ms,
            userMs: ms / 2,
            privilegedMs: ms / 2,
            ticks: ms + 1,
            frequency: 1000,
        });
    const covered = [
        point(1, 0),
        point(2, 10000),
        point(3, 20000),
        { ...point(4, 30000), available: false, totalMs: null },
    ];
    assert.equal(f(covered, 1, 19000).complete, true);
    assert.equal(
        f([point(1, 0), point(2, 30000)], 1, 19000).complete,
        false,
        "unobserved long gap",
    );
});
test("instrumentation emits nonblocking drain endpoint and raw sample CPU points with IO errors retained", () => {
    const patch = api("patchDriver")(
        readFileSync(process.env.LATENCY615_TEST_INPUT),
    );
    const span = patch.recipe.find((r) => r.id === "runtime").span;
    let t = 100;
    const stdout = [],
        files = {};
    const fakeProcess = new EventEmitter();
    fakeProcess.pid = 7;
    fakeProcess.cpuUsage = () => ({ user: 12, system: 3 });
    fakeProcess.stdout = { write: (b) => stdout.push(b) };
    const context = vm.createContext({
        Buffer,
        structuredClone,
        process: fakeProcess,
        performance: { now: () => ++t, timeOrigin: 1000 },
        Date,
        outDir: "inert",
        __l615Append: (p, b) => {
            files[p] = (files[p] ?? "") + b;
        },
        __l615Write: (p, b) => {
            files[p] = b;
        },
    });
    vm.runInContext(span + "\nthis.observer=__l615;", context);
    vm.runInContext(
        '__l615.start(100); __l615.residual("load.drained", {hist:{n:1,counts:new Uint32Array(2000)},requests:1,deliberate:0,failed:0}, {ok:1});',
        context,
    );
    assert.ok(
        stdout.some((b) => b.includes('"load.drained"')),
        "counter endpoint during original settle",
    );
    const current = { requests: 1, deliberate: 0, failed: 0, hist: hist(1) };
    context.current = current;
    vm.runInContext(
        'const cut=__l615.cut(110,current,{ok:1});__l615.swapped(cut);__l615.stats(cut,{});__l615.interval(1,{phase:"load",t:10},current,cut,{ok:1});',
        context,
    );
    assert.ok(
        files["inert/events.jsonl"].includes('"sample"'),
        "driver CPU at each existing sample",
    );
    context.__l615Append = () => {
        throw Error("disk failure");
    };
    // New runtime receives a failing injected writer; no exception escapes.
    const bad = vm.createContext({
        Buffer,
        structuredClone,
        process: fakeProcess,
        performance: { now: () => ++t, timeOrigin: 1000 },
        Date,
        outDir: "inert",
        __l615Append: () => {
            throw Error("disk failure");
        },
        __l615Write: () => {
            throw Error("disk failure");
        },
    });
    vm.runInContext(span + "\nthis.state=__l615.state;", bad);
    assert.ok(bad.state.errors.length > 0);
    assert.doesNotThrow(() => fakeProcess.emit("exit", 1));
});
test("passive full archive verifies all pins and retains the actual old failed report", () => {
    const read = api("readArchive");
    assert.ok(process.env.LATENCY615_TEST_ZIP);
    const entries = read(readFileSync(process.env.LATENCY615_TEST_ZIP));
    assert.equal(entries.size, 22);
    api("verifyNative")(entries.get("soak/soak-server.exe"));
    const report = api("parseJson")(entries.get("soak/http-soak.json"));
    assert.equal(report.summary.pass, false);
    assert.equal(report.summary.failed, 0);
    assert.equal(report.summary.ok, 124966);
    assert.equal(
        report.criteria.find((c) => c.name === "p99 latency stable").pass,
        false,
    );
});
test("original self-contained evaluator keeps ratio OR slack, RSS, handles and crash verdicts", () => {
    const source = readFileSync(process.env.LATENCY615_TEST_INPUT, "utf8");
    const math = source.slice(
        source.indexOf("const BUCKET_BASE"),
        source.indexOf("function sleep"),
    );
    const round = source.slice(
        source.indexOf("function round(v)"),
        source.indexOf("// --- Run"),
    );
    const evaluator = source.slice(
        source.indexOf("// --- Criteria"),
        source.indexOf("const report = {"),
    );
    function evaluate(headBin, tailBin, crash = null) {
        const hs = hist(10, headBin),
            ts = hist(10, tailBin);
        const context = vm.createContext({
            config: {
                warmupMinutes: 1,
                windowMinutes: 1,
                limits: {
                    rssGrowth: 0.1,
                    p99Growth: 0.2,
                    p99SlackMs: 0.5,
                    socketSlack: 2,
                    fdSlack: 4,
                    resourceSlack: 2,
                },
            },
            samples: [
                { phase: "load", t: 70, rss: 100 },
                { phase: "load", t: 300, rss: 95 },
            ],
            histograms: [hs, ts],
            loadSeconds: 300.01,
            crash,
            baseline: { openSockets: 1, fds: null, activeResources: 0 },
            after: { openSockets: 1, fds: null, activeResources: 0 },
            counters: {
                ok: 20,
                failed: 0,
                deliberate: { missing: 0, throw: 0, slowAborted: 0 },
                failures: {},
                nearCrash: {},
            },
            failureExamples: [],
        });
        vm.runInContext(
            math +
                round +
                evaluator +
                "\nthis.verdict={pass,criteria,p99Head,p99Tail};",
            context,
        );
        return context.verdict;
    }
    assert.equal(evaluate(926, 941).pass, true, "ratio alone passes");
    assert.equal(evaluate(694, 725).pass, true, "absolute slack alone passes");
    const failed = evaluate(835, 854);
    assert.equal(failed.pass, false);
    assert.equal(
        failed.criteria.find((c) => c.name === "p99 latency stable").pass,
        false,
    );
    assert.equal(evaluate(835, 835, { code: 3221225477 }).pass, false);
});
test("persistent counter bridge rejects unmatched replies without a second process/query retry", async () => {
    assert.equal(typeof c.CounterBridge, "function");
    const child = new FakeChild();
    child.stdin = new PassThrough();
    let launches = 0;
    child.stdin.on("data", (b) => {
        const q = JSON.parse(b);
        queueMicrotask(() =>
            child.stdout.emit(
                "data",
                Buffer.from(
                    JSON.stringify({ sequence: q.sequence + 1, ok: true }) +
                        "\n",
                ),
            ),
        );
    });
    const records = [];
    const bridge = new c.CounterBridge(
        "inert.ps1",
        { SystemRoot: "C:\\Windows" },
        (r) => records.push(r),
        {
            spawnChild: () => {
                launches++;
                return child;
            },
            requestTimeoutMs: 20,
        },
    );
    await assert.rejects(
        bridge.request("sample", { keys: ["nativeA.harness"] }),
    );
    assert.equal(bridge.healthy, false);
    assert.equal(launches, 1);
    assert.ok(records.some((r) => r.kind === "bridge.protocolError"));
});
test("owned exclusive filesystem creation leaves an unrelated sentinel untouched", () => {
    assert.equal(typeof c.createOwnedDirectory, "function");
    assert.equal(typeof c.writeExclusive, "function");
    assert.ok(process.env.LATENCY615_EVIDENCE_ROOT);
    const root = process.env.LATENCY615_EVIDENCE_ROOT;
    const child = c.createOwnedDirectory(
        root,
        root + "\\disposable-owned-fixture",
    );
    const sentinel = child + "\\sentinel.txt";
    c.writeExclusive(sentinel, "untouched");
    assert.throws(() => c.writeExclusive(sentinel, "overwrite"));
    assert.equal(readFileSync(sentinel, "utf8"), "untouched");
    assert.throws(() => c.createOwnedDirectory(root, root + "2\\sibling"));
    assert.throws(() => c.createOwnedDirectory(root, child));
});

test("zero result also requires provenance, observer health and an empty error state", async () => {
    const good = {
        originalCriteriaPass: true,
        telemetryComplete: true,
        cleanupComplete: true,
        workloadCompleted: true,
        exitCode: 0,
        provenanceComplete: true,
        observerHealthy: true,
        errors: [],
    };
    for (const changed of [
        { provenanceComplete: false },
        { observerHealthy: false },
        { errors: [{ message: "unresolved collection failure" }] },
    ]) {
        let now = 0;
        const r = await c.runTriad(
            {
                now: () => now,
                gap: async (ms) => {
                    now += ms;
                },
                arm: async (name) => ({ ...good, ...changed, name }),
            },
            0,
        );
        assert.equal(r.exitCode, 1);
    }
});
test("approved arm environment cannot select an alternate fixture or native filename", () => {
    const env = api("armEnvironment");
    for (const name of [
        "C:\\stage\\error-control.mjs",
        "C:\\stage\\other.exe",
        "C:\\stage\\soak-server.js",
        "relative.exe",
    ])
        assert.throws(() => env({}, name));
});

test("retrieval retains HTTP failures and bounded prefixes before rejecting without retries", async () => {
    assert.equal(typeof c.retrieveFile, "function");
    let calls = 0;
    const saved = [];
    const request = async () => {
        calls++;
        return {
            status: 403,
            headers: new Headers(),
            body: (async function* () {
                yield Buffer.from("denied");
            })(),
        };
    };
    await assert.rejects(
        c.retrieveFile(
            "https://api.github.com/repos/40oleg/nona/actions/artifacts/13158691140",
            {
                token: "private",
                deadline: 1000,
                cap: 10,
                request,
                now: () => 0,
                retain: (r) => saved.push(r),
            },
        ),
    );
    assert.equal(calls, 1);
    assert.equal(saved[0].status, 403);
    assert.equal(saved[0].raw.toString(), "denied");
    assert.ok(saved[0].error);
    saved.length = 0;
    await assert.rejects(
        c.retrieveFile(
            "https://raw.githubusercontent.com/40oleg/nona/pin/fixture",
            {
                deadline: 1000,
                cap: 4,
                now: () => 0,
                request: async () => ({
                    status: 200,
                    headers: new Headers(),
                    body: (async function* () {
                        yield Buffer.from("too much data");
                    })(),
                }),
                retain: (r) => saved.push(r),
            },
        ),
    );
    assert.equal(saved[0].raw.length, 4);
    assert.equal(saved[0].complete, false);
});
test("artifact redirects strip credentials and reject unapproved destinations", async () => {
    assert.equal(typeof c.retrieveFile, "function");
    const requests = [],
        saved = [];
    const request = async (url, opts) => {
        requests.push({ url, headers: opts.headers });
        if (requests.length === 1)
            return {
                status: 302,
                headers: new Headers({
                    location:
                        "https://productionresultssa.blob.core.windows.net/inert?redacted",
                }),
                body: { cancel: async () => {} },
            };
        return {
            status: 200,
            headers: new Headers(),
            body: (async function* () {
                yield Buffer.from("zip");
            })(),
        };
    };
    assert.equal(
        (
            await c.retrieveFile(
                "https://api.github.com/repos/40oleg/nona/actions/artifacts/13158691140/zip",
                {
                    archive: true,
                    token: "secret",
                    deadline: 1000,
                    cap: 10,
                    request,
                    now: () => 0,
                    retain: (r) => saved.push(r),
                },
            )
        ).toString(),
        "zip",
    );
    assert.equal(requests[0].headers.Authorization, "Bearer secret");
    assert.equal(requests[1].headers.Authorization, undefined);
    assert.ok(!JSON.stringify(saved).includes("redacted"));
    let calls = 0;
    await assert.rejects(
        c.retrieveFile(
            "https://api.github.com/repos/40oleg/nona/actions/artifacts/13158691140/zip",
            {
                archive: true,
                deadline: 1000,
                cap: 10,
                now: () => 0,
                request: async () => {
                    calls++;
                    return {
                        status: 302,
                        headers: new Headers({
                            location: "https://evil.example/file",
                        }),
                        body: { cancel: async () => {} },
                    };
                },
                retain: () => {},
            },
        ),
    );
    assert.equal(calls, 1);
});
test("phase cleanup has one absolute budget and rejects a recycled identity", async () => {
    assert.equal(typeof c.settleOwnedArm, "function");
    let time = 0;
    const commands = [];
    const io = {
        now: () => time,
        deadline: 20,
        keys: ["A.harness", "A.server"],
        identities: { "A.harness": "1/old", "A.server": "2/old" },
        registered: Promise.resolve(),
        receipt: { complete: true },
        closed: Promise.resolve(),
        request: async (op, arg) => {
            commands.push(op);
            time += 8;
            if (op === "sample")
                return {
                    points: [
                        {
                            key: "A.harness",
                            identity: "1/old",
                            available: true,
                            exited: true,
                        },
                        {
                            key: "A.server",
                            identity: "2/old",
                            available: true,
                            exited: true,
                        },
                    ],
                };
            return {};
        },
    };
    assert.equal((await c.settleOwnedArm(io)).complete, true);
    assert.deepEqual(commands, ["sample", "sample"]);
    commands.length = 0;
    time = 0;
    await assert.rejects(
        c.settleOwnedArm({
            ...io,
            request: async () => ({
                points: [
                    {
                        key: "A.harness",
                        identity: "1/recycled",
                        available: true,
                        exited: false,
                    },
                ],
            }),
        }),
    );
    assert.equal(commands.length, 0);
    time = 0;
    await assert.rejects(
        c.settleOwnedArm({
            ...io,
            request: async () => {
                time += 30;
                return { points: [] };
            },
        }),
    );
});

test("triad telemetry requires per-core, coordinator and observer CPU coverage without zero filling", () => {
    const coverage = api("triadCounterCoverage");
    const record = (ms, i) => ({
        send: ms,
        receive: ms + 0.1,
        frequency: 1000,
        ticksStart: ms,
        ticksEnd: ms + 1,
        points: ["A.harness", "A.server"].map((key) => ({
            key,
            identity: key + "/birth",
            available: true,
            totalMs: ms / 2,
            userMs: ms / 3,
            privilegedMs: ms / 6,
        })),
        observer: {
            identity: "observer/birth",
            available: true,
            totalMs: ms / 4,
            userMs: ms / 8,
            privilegedMs: ms / 8,
        },
        host: {
            at: ms,
            receive: ms + 0.1,
            cpus: [
                { user: ms, sys: ms, idle: ms, nice: 0, irq: 0 },
                { user: ms, sys: ms, idle: ms, nice: 0, irq: 0 },
            ],
            coordinatorCpu: { user: ms * 100, system: ms * 100 },
        },
    });
    const counters = Array.from({ length: 4 }, (_, i) => record(i * 10000, i));
    const events = [0, 10000, 20000, 30000].map((mono) => ({
        cpu: { mono, user: mono * 100, system: mono * 100 },
    }));
    const records = [
        {
            phase: "load",
            start: 0,
            end: 18000,
            swap: [18000, 18000.01],
            stats: { start: 18000.02, end: 18001 },
            absolute: {
                timeOrigin: 1700000000000,
                loadStart: 1000,
                start: 1000,
                end: 19000,
                swap: [19000, 19000.01],
                stats: [19000.02, 19001],
            },
        },
    ];
    const input = {
        counters,
        events,
        mapping: { driverMono: 0, coordinatorLower: 0, coordinatorUpper: 0.01 },
        intervals: records,
        windows: { headIndices: [0], tailIndices: [0] },
        identities: {
            "A.harness": "A.harness/birth",
            "A.server": "A.server/birth",
        },
        cpuCount: 2,
        harnessPid: 123,
    };
    const good = coverage(input);
    assert.equal(good.complete, true);
    for (const source of [
        "host.cpu.0",
        "host.cpu.1",
        "coordinator",
        "observer",
        "driver",
        "A.harness",
        "A.server",
    ])
        assert.ok(
            good.sources.some((s) => s.source === source),
            source,
        );
    const missing = structuredClone(input);
    missing.counters[1].observer.totalMs = null;
    assert.equal(coverage(missing).complete, false);
    const reset = structuredClone(input);
    reset.counters[1].host.cpus[0].user = -1;
    assert.equal(coverage(reset).complete, false);
    const changed = structuredClone(input);
    changed.counters[0].points[0].identity = "recycled";
    assert.equal(coverage(changed).complete, false);
    for (const mutate of [
        (r) => (r.absolute.start = 20000),
        (r) => (r.absolute.end = r.absolute.start),
        (r) => (r.absolute.end = NaN),
        (r) => r.absolute.end++,
        (r) => r.absolute.loadStart++,
        (r) => (r.absolute.timeOrigin = Infinity),
    ]) {
        const bad = structuredClone(input);
        mutate(bad.intervals[0]);
        assert.throws(() => coverage(bad), "invalid selected absolute span");
    }
});
test("full 480-second postspawn allowance survives time spent preparing an arm", async () => {
    let now = 60000;
    const bounds = [];
    await c.runTriad(
        {
            now: () => now,
            gap: async (ms) => {
                now += ms;
            },
            arm: async (name, b) => {
                bounds.push(b);
                now += 100;
                assert.equal(b.armMs, 480000);
                assert.ok(now <= b.latestSpawnAt);
                now += 310000;
                return {
                    name,
                    cleanupComplete: true,
                    observerHealthy: true,
                    provenanceComplete: true,
                    workloadCompleted: true,
                    telemetryComplete: true,
                    originalCriteriaPass: true,
                    exitCode: 0,
                };
            },
        },
        0,
    );
    assert.equal(bounds.length, 3);
});

test("expired cleanup cannot issue even a retained-handle terminate after the phase deadline", async () => {
    let now = 0;
    const ops = [];
    const points = [
        {
            key: "A.harness",
            identity: "1/birth",
            available: true,
            exited: false,
        },
        { key: "A.server", identity: "2/birth", available: true, exited: true },
    ];
    await assert.rejects(
        c.settleOwnedArm({
            now: () => now,
            deadline: 20,
            keys: ["A.harness", "A.server"],
            identities: { "A.harness": "1/birth", "A.server": "2/birth" },
            registered: Promise.resolve(),
            receipt: { complete: true },
            closed: Promise.resolve(),
            request: async (op) => {
                ops.push(op);
                await Promise.resolve();
                now = 20;
                return { points };
            },
        }),
    );
    assert.deepEqual(ops, ["sample"]);
});
test("a fake arm exceeding its finite lifetime is retained and blocks later arms", async () => {
    let now = 0;
    const calls = [];
    const result = await c.runTriad(
        {
            now: () => now,
            gap: async (ms) => {
                now += ms;
            },
            arm: async (name) => {
                calls.push(name);
                now += 500001;
                return {
                    name,
                    originalCriteriaPass: true,
                    telemetryComplete: true,
                    cleanupComplete: true,
                    workloadCompleted: true,
                    exitCode: 0,
                    provenanceComplete: true,
                    observerHealthy: true,
                };
            },
        },
        0,
    );
    assert.deepEqual(calls, ["nativeA"]);
    assert.equal(result.exitCode, 1);
    assert.ok(result.arms[0].budgetError);
});

test("late stream/process errors invalidate a previously closed receipt; byte caps bound retention", async () => {
    const child = new FakeChild(),
        o = c.observeChild(child, { limit: 4 });
    child.emit("exit", 0, null);
    for (const p of [child.stdout, child.stderr]) {
        p.emit("end");
        p.emit("close");
    }
    child.emit("close", 0, null);
    await o.closed;
    assert.equal(o.receipt.complete, true);
    child.emit("error", new Error("late"));
    assert.equal(o.receipt.complete, false);
    const capped = new FakeChild(),
        r = c.observeChild(capped, { limit: 4 });
    for (let i = 0; i < 100; i++)
        capped.stdout.emit("data", Buffer.from("12345"));
    assert.ok(r.receipt.errors.length <= 2);
    assert.equal(r.receipt.streams.stdout.bytes, 500);
});
test("observer stdin errors are retained and reject the pending query without escaping", async () => {
    const child = new FakeChild();
    child.stdin = new PassThrough();
    const bridge = new c.CounterBridge(
        "inert.ps1",
        { SystemRoot: "C:\\Windows" },
        () => {},
        { spawnChild: () => child, requestTimeoutMs: 20 },
    );
    const pending = bridge.request("sample", { keys: ["nativeA.harness"] });
    await Promise.resolve();
    assert.doesNotThrow(() =>
        child.stdin.emit(
            "error",
            Object.assign(new Error("pipe closed"), { code: "EPIPE" }),
        ),
    );
    await assert.rejects(pending);
    assert.equal(bridge.healthy, false);
});

// The only observer is an EventEmitter; replies/lifecycle events are synchronous
// or microtasks. No process, observer script, clock delay or workload is run.
function fakeBridge(record = () => {}) {
    const child = new FakeChild(),
        commands = [];
    child.stdin = new PassThrough();
    child.stdin.on("data", (b) => {
        const q = JSON.parse(b);
        commands.push(q);
        queueMicrotask(() =>
            child.stdout.emit(
                "data",
                Buffer.from(
                    JSON.stringify({ sequence: q.sequence, ok: true }) + "\n",
                ),
            ),
        );
    });
    const bridge = new c.CounterBridge(
        "inert.ps1",
        { SystemRoot: "C:\\Windows" },
        record,
        { spawnChild: () => child, requestTimeoutMs: 50 },
    );
    return { bridge, child, commands };
}
function fakeObserverClose(child, code = 0) {
    child.exitCode = code;
    child.emit("exit", code, null);
    for (const stream of [child.stdout, child.stderr]) {
        stream.emit("end");
        stream.emit("close");
    }
    child.emit("close", code, null);
}
test("idle observer exit and close latch failure and cannot be waived by later stop", async () => {
    for (const kind of ["exit", "close"]) {
        const { bridge, child, commands } = fakeBridge();
        await bridge.request("sample", { keys: ["nativeA.harness"] });
        child.emit(kind, 0, null);
        assert.equal(bridge.healthy, false, kind + " with no pending query");
        const failure = bridge.failure;
        assert.match(failure.message, /observer.*(exit|close)/);
        await assert.rejects(bridge.request("sample"), (e) => e === failure);
        await assert.rejects(bridge.stop(), (e) => e === failure);
        assert.equal(
            commands.length,
            1,
            "unhealthy observer receives no further command",
        );
        assert.equal(bridge.failure, failure);
    }
});
test("observer record sink failure is sticky even if later writes succeed", async () => {
    for (const failingKind of [
        "bridge.lifecycle",
        "bridge.stdout",
        "bridge.response",
        "bridge.request",
    ]) {
        const original = Object.assign(new Error("owned record sink failed"), {
            code: "ENOSPC",
        });
        let failOnce = true;
        const { bridge, child } = fakeBridge((r) => {
            if (r.kind === failingKind && failOnce) {
                failOnce = false;
                throw original;
            }
        });
        await assert.rejects(bridge.request("sample"), (e) => e === original);
        assert.equal(bridge.healthy, false, failingKind);
        assert.equal(bridge.failure, original);
        assert.doesNotThrow(() =>
            child.emit("error", new Error("later lifecycle failure")),
        );
        await assert.rejects(bridge.stop(), (e) => e === original);
        assert.equal(bridge.failure, original);
    }
});
test("idle observer process and stream errors retain the original failure details", async () => {
    for (const target of ["process", "stdout", "stderr"]) {
        const { bridge, child, commands } = fakeBridge();
        await bridge.request("sample");
        const original = Object.assign(
            new Error("idle " + target + " failure"),
            { code: "EIO" },
        );
        (target === "process" ? child : child[target]).emit("error", original);
        assert.equal(bridge.healthy, false);
        assert.equal(bridge.failure.message, original.message);
        assert.equal(bridge.failure.code, original.code);
        assert.equal(bridge.failure.stack, original.stack);
        await assert.rejects(
            bridge.request("sample"),
            (e) => e === bridge.failure,
        );
        assert.equal(commands.length, 1);
    }
});
test("only acknowledged requested stop permits zero-exit complete observer shutdown", async () => {
    const { bridge, child } = fakeBridge();
    child.stdin.on("finish", () => fakeObserverClose(child));
    await bridge.request("sample");
    await bridge.stop();
    assert.equal(bridge.healthy, true);
    assert.equal(bridge.observed.receipt.complete, true);
    assert.equal(bridge.observed.receipt.exit.code, 0);
    await assert.rejects(bridge.request("sample"));
    child.emit("error", new Error("late observer error"));
    assert.equal(bridge.healthy, false);
});
for (const early of ["exit", "stderr", "exit-and-stderr"])
    test(`requested stop accepts buffered stdout ACK after ${early} delivery`, async () => {
        const records = [];
        const { bridge, child } = fakeBridge((r) => records.push(r));
        await bridge.request("sample");
        child.stdin.removeAllListeners("data");
        records.length = 0;
        child.stdin.on("data", (b) => {
            const q = JSON.parse(b);
            assert.equal(q.op, "stop");
            queueMicrotask(() => {
                // The observer wrote its reply and exited immediately. OS exit
                // and the independent stderr pipe can arrive before stdout data.
                const exit = () => {
                    child.exitCode = 0;
                    child.emit("exit", 0, null);
                };
                const stderr = () => {
                    child.stderr.emit("end");
                    child.stderr.emit("close");
                };
                if (early.includes("exit")) exit();
                if (early.includes("stderr")) stderr();
                child.stdout.emit(
                    "data",
                    Buffer.from(
                        JSON.stringify({ sequence: q.sequence, ok: true }) +
                            "\n",
                    ),
                );
                // Data always precedes its own EOF; no stdin.finish handshake.
                child.stdout.emit("end");
                child.stdout.emit("close");
                if (!early.includes("exit")) exit();
                if (!early.includes("stderr")) stderr();
                child.emit("close", 0, null);
            });
        });
        const result = await bridge.stop();
        assert.equal(result.sequence, 2);
        assert.equal(result.ok, true);
        assert.equal(bridge.failure, null);
        assert.equal(bridge.healthy, true);
        assert.equal(bridge.stopState, "closed");
        assert.equal(bridge.observed.receipt.complete, true);
        assert.equal(bridge.observed.receipt.exit.code, 0);
        assert.equal(bridge.observed.receipt.exit.signal, null);
        assert.equal(bridge.observed.receipt.close.code, 0);
        assert.equal(bridge.observed.receipt.close.signal, null);
        assert.deepEqual(bridge.observed.receipt.errors, []);
        const order = records.map((r) => r.event?.kind ?? r.kind);
        for (const kind of ["exit", "stderr.end", "stderr.close"])
            if (early.includes(kind.split(".")[0]))
                assert.ok(order.indexOf(kind) < order.indexOf("bridge.stdout"));
        assert.ok(order.indexOf("bridge.stdout") < order.indexOf("stdout.end"));
        assert.ok(order.indexOf("bridge.response") < order.indexOf("close"));
    });
test("stop without acknowledgement or with bad exit/pipes never becomes expected healthy shutdown", async () => {
    for (const mode of ["unacknowledged", "bad-exit", "missing-pipes"]) {
        const { bridge, child } = fakeBridge();
        if (mode === "unacknowledged") {
            child.stdin.removeAllListeners("data");
            child.stdin.on("data", () =>
                queueMicrotask(() => fakeObserverClose(child)),
            );
        } else {
            child.stdin.on("finish", () => {
                if (mode === "bad-exit") fakeObserverClose(child, 1);
                else {
                    child.emit("exit", 0, null);
                    child.emit("close", 0, null);
                }
            });
        }
        await assert.rejects(bridge.stop());
        assert.equal(bridge.healthy, false, mode);
        await assert.rejects(bridge.request("sample"));
    }
});
test("provisional stop events never waive bad ACKs, exit status or sticky errors", async () => {
    for (const mode of [
        "unmatched",
        "failed",
        "malformed",
        "nonzero",
        "signal",
        "process-error",
        "stdout-error",
        "stderr-error",
        "record-error",
    ]) {
        const records = [];
        const original = Object.assign(new Error(mode + " failure"), {
            code: "EIO",
        });
        const { bridge, child } = fakeBridge((r) => {
            records.push(r);
            if (mode === "record-error" && r.event?.kind === "stderr.end")
                throw original;
        });
        await bridge.request("sample");
        child.stdin.removeAllListeners("data");
        child.stdin.on("data", (b) => {
            const q = JSON.parse(b);
            queueMicrotask(() => {
                child.exitCode = mode === "nonzero" ? 1 : 0;
                child.signalCode = mode === "signal" ? "SIGTERM" : null;
                child.emit("exit", child.exitCode, child.signalCode);
                child.stderr.emit("end");
                child.stderr.emit("close");
                if (mode.endsWith("-error") && mode !== "record-error") {
                    const target = mode.split("-")[0];
                    (target === "process" ? child : child[target]).emit(
                        "error",
                        original,
                    );
                }
                child.stdout.emit(
                    "data",
                    Buffer.from(
                        mode === "malformed"
                            ? "invalid JSON\n"
                            : JSON.stringify({
                                  sequence:
                                      q.sequence +
                                      (mode === "unmatched" ? 1 : 0),
                                  ok: mode !== "failed",
                              }) + "\n",
                    ),
                );
                // A failed ACK is rejected by request itself, even without EOF.
                if (mode === "failed") return;
                child.stdout.emit("end");
                child.stdout.emit("close");
                child.emit("close", child.exitCode, child.signalCode);
            });
        });
        await assert.rejects(bridge.stop());
        const failure = bridge.failure;
        assert.ok(failure, mode);
        assert.equal(bridge.healthy, false, mode);
        if (mode.endsWith("-error")) {
            assert.equal(failure.message, original.message);
            assert.equal(failure.code, "EIO");
            assert.equal(failure.stack, original.stack);
        }
        const rawCount = records.length;
        child.emit("error", new Error("later error cannot replace " + mode));
        assert.ok(records.length > rawCount);
        await assert.rejects(bridge.request("sample"), (e) => e === failure);
        await assert.rejects(bridge.stop(), (e) => e === failure);
        assert.equal(bridge.failure, failure);
        assert.ok(records.some((r) => r.event?.kind === "exit"));
        assert.ok(records.some((r) => r.kind === "bridge.stdout"));
        assert.equal(
            records.filter((r) => r.kind === "bridge.request").length,
            2,
            "failed observer receives no later request",
        );
    }
});
test("idle pipe terminal events cannot be made provisional by a later stop", async () => {
    for (const name of ["stdout", "stderr"])
        for (const kind of ["end", "close"]) {
            const { bridge, child, commands } = fakeBridge();
            await bridge.request("sample");
            child[name].emit(kind);
            const failure = bridge.failure;
            assert.ok(failure);
            assert.equal(bridge.healthy, false);
            await assert.rejects(bridge.stop(), (e) => e === failure);
            assert.equal(commands.length, 1);
        }
});
test("requested stop deadlines reject late ACK and missing close without clearing the first failure", async () => {
    const source = readFileSync(
        new URL("./http-latency615.mjs", import.meta.url),
        "utf8",
    );
    for (const phase of ["ACK", "close"]) {
        const child = new FakeChild(),
            timers = new Map(),
            records = [];
        child.stdin = new PassThrough();
        const sandbox = vm.createContext({
            assert,
            path: { join: (...xs) => xs.join("/") },
            systemEnvironment: s.systemEnvironment,
            observeChild: c.observeChild,
            parseJson: s.parseJson,
            errorInfo: c.errorInfo,
            performance,
            setTimeout: (fn, ms) => {
                timers.set(ms, fn);
                return ms;
            },
            clearTimeout: (id) => timers.delete(id),
        });
        vm.runInContext(
            source.slice(
                source.indexOf("function bounded("),
                source.indexOf("const pause ="),
            ) +
                source
                    .slice(
                        source.indexOf("export class CounterBridge"),
                        source.indexOf("// Exact hosted retrieval"),
                    )
                    .replace("export class", "class") +
                "\nthis.CounterBridge = CounterBridge;",
            sandbox,
        );
        const bridge = new sandbox.CounterBridge(
            "inert.ps1",
            { SystemRoot: "C:\\Windows" },
            (r) => records.push(r),
            { spawnChild: () => child },
        );
        let command;
        child.stdin.on("data", (b) => {
            command = JSON.parse(b);
            queueMicrotask(() => {
                child.exitCode = 0;
                child.emit("exit", 0, null);
                child.stderr.emit("end");
                child.stderr.emit("close");
                if (phase === "close") {
                    child.stdout.emit(
                        "data",
                        Buffer.from(
                            JSON.stringify({
                                sequence: command.sequence,
                                ok: true,
                            }) + "\n",
                        ),
                    );
                    child.stdout.emit("end");
                    child.stdout.emit("close");
                }
            });
        });
        const stopping = bridge.stop();
        const rejected = assert.rejects(stopping, /deadline/);
        const budget = phase === "ACK" ? 2000 : 18000;
        // Drive the actual bounded() timer deterministically, without waiting.
        for (let i = 0; i < 20 && !timers.has(budget); i++)
            await Promise.resolve();
        assert.ok(timers.has(budget), phase + " existing deadline armed");
        assert.equal(bridge.healthy, true, "terminal evidence is provisional");
        assert.equal(bridge.observed.receipt.complete, false);
        timers.get(budget)();
        await rejected;
        const failure = bridge.failure;
        assert.equal(bridge.healthy, false);
        if (phase === "ACK") {
            child.stdout.emit(
                "data",
                Buffer.from(
                    JSON.stringify({ sequence: command.sequence, ok: true }) +
                        "\n",
                ),
            );
            child.stdout.emit("end");
            child.stdout.emit("close");
        }
        child.emit("close", 0, null);
        assert.equal(bridge.observed.receipt.complete, true);
        assert.equal(
            bridge.healthy,
            false,
            "late receipt cannot restore health",
        );
        assert.equal(bridge.failure, failure);
        await assert.rejects(bridge.request("sample"), (e) => e === failure);
        assert.equal(
            records.filter((r) => r.kind === "bridge.request").length,
            1,
        );
        assert.equal(timers.size, 0);
    }
});
test("actual next hosted arm refuses idle observer loss before any harness spawn", async () => {
    const source = readFileSync(
        new URL("./http-latency615.mjs", import.meta.url),
        "utf8",
    );
    const arm = source.slice(
        source.indexOf("async function hostedArm("),
        source.indexOf("export async function settleOwnedArm("),
    );
    for (const kind of ["exit", "close", "live"]) {
        const { bridge, child } = fakeBridge();
        await bridge.request("sample");
        if (kind !== "live") child.emit(kind, 0, null);
        let harnessSpawns = 0;
        const sandbox = vm.createContext({
            assert,
            bridge,
            path: { join: (...xs) => xs.join("/") },
            createOwnedDirectory: (_, p) => p,
            performance: { now: () => 100 },
            Date,
            identity: () => ({ vm: "same" }),
            readFileSync: (p) => p,
            sha256: (p) => p,
            verifyNative: () => {},
            PINS: { fixture: "fixture" },
            json: () => {},
            writeFileSync: () => {},
            errorInfo: c.errorInfo,
            process: { execPath: "inert-node" },
            armEnvironment: () => ({}),
            spawn: () => {
                harnessSpawns++;
                throw Error("unsafe harness was spawned");
            },
            clearInterval: () => {},
            clearTimeout: () => {},
            settleOwnedArm: async () => {
                throw Error("no registered workload");
            },
        });
        vm.runInContext(arm + "\nthis.hostedArm = hostedArm;", sandbox);
        const result = await sandbox.hostedArm(
            {
                bridge,
                env: {},
                output: "owned",
                stage: "stage",
                driver: "driver",
                driverHash: "driver",
                native: "native",
                fixture: "fixture",
                initialIdentity: { vm: "same" },
            },
            "node",
            { latestSpawnAt: 200, armMs: 480000, cleanupMs: 20000 },
        );
        assert.equal(
            harnessSpawns,
            kind === "live" ? 1 : 0,
            kind + " pre-spawn boundary",
        );
        if (kind !== "live") {
            assert.equal(result.observerHealthy, false);
            assert.ok(result.errors.some((e) => /observer/.test(e.message)));
        } else
            assert.ok(
                result.errors.some((e) =>
                    /unsafe harness was spawned/.test(e.message),
                ),
            );
    }
});

test("invalid selected CPU spans cannot be complete even with no points or plausible endpoints", () => {
    const coverage = api("counterCoverage");
    const points = [0, 30].map((t, i) => ({
        sequence: i + 1,
        send: t,
        receive: t + 0.1,
        ticks: t + 1,
        frequency: 1000,
        identity: "same/birth",
        available: true,
        totalMs: t,
        userMs: t / 2,
        privilegedMs: t / 2,
    }));
    for (const [start, end] of [
        [20, 10],
        [10, 10],
        [NaN, 10],
        [0, Infinity],
        [-Infinity, 10],
    ]) {
        for (const raw of [[], points]) {
            const r = coverage(raw, start, end);
            assert.equal(r.complete, false, `invalid span ${start},${end}`);
            assert.equal(r.deltaMs, null);
            assert.ok(r.errors.length > 0);
        }
    }
});
test("absolute interval cuts must agree with relative cuts and one load clock", () => {
    const validate = api("validateIntervals"),
        good = intervals();
    assert.ok(validate(good, 300.01).headIndices.length > 0);
    for (const mutate of [
        (r) => (r[7].absolute.start = r[7].absolute.end + 1),
        (r) => (r[7].absolute.end = r[7].absolute.start),
        (r) => (r[7].absolute.start = NaN),
        (r) => (r[7].absolute.end = Infinity),
        (r) => r[7].absolute.end++,
        (r) => r[7].absolute.loadStart++,
        (r) => r[7].absolute.timeOrigin++,
        (r) => (r[7].absolute.timeOrigin = NaN),
        (r) => r[7].absolute.swap[0]++,
        (r) => r[7].absolute.stats[1]++,
    ]) {
        const bad = structuredClone(good);
        mutate(bad);
        assert.throws(
            () => validate(bad, 300.01),
            "absolute corruption must be rejected",
        );
    }
});
test("actual sidecar fractional monotonic cuts validate without invented clock tolerance", () => {
    const patch = api("patchDriver")(
        readFileSync(process.env.LATENCY615_TEST_INPUT),
    );
    const span = patch.recipe.find((r) => r.id === "runtime").span;
    const records = [];
    let mono = 100.123456789;
    const fakeProcess = new EventEmitter();
    fakeProcess.pid = 7;
    fakeProcess.cpuUsage = () => ({ user: 12, system: 3 });
    fakeProcess.stdout = { write: () => {} };
    const context = vm.createContext({
        Buffer,
        structuredClone,
        process: fakeProcess,
        Date,
        outDir: "inert",
        performance: {
            now: () => (mono += 0.00001),
            timeOrigin: 1700000000000.123,
        },
        __l615Append: (p, b) => {
            if (p.endsWith("/intervals.jsonl")) records.push(JSON.parse(b));
        },
        __l615Write: () => {},
    });
    vm.runInContext(span + "\nthis.o = __l615;", context);
    const emit = (index, phase, end, t, n) => {
        mono = end;
        const current = {
            requests: n,
            deliberate: 0,
            failed: 0,
            hist: hist(n),
        };
        const cut = context.o.cut(end, current, { ok: n });
        context.o.swapped(cut);
        context.o.stats(cut, {});
        context.o.interval(index, { phase, t }, current, cut, { ok: n });
    };
    emit(0, "baseline", 200.123456789, 0, 0);
    const loadStart = 1000.123456789;
    context.o.start(loadStart);
    for (let i = 1; i <= 30; i++)
        emit(i, "load", loadStart + i * 10000, i * 10, 2);
    emit(31, "after", loadStart + 308000, 308, 1);
    const windows = api("validateIntervals")(records, 300.01);
    assert.deepEqual(windows.headIndices, [7, 8, 9, 10, 11, 12]);
    assert.deepEqual(windows.tailIndices, [24, 25, 26, 27, 28, 29, 30]);
});

test("definite counter resets outside a comparison window remain telemetry errors", () => {
    const f = api("counterCoverage");
    const points = [0, 10, 20, 30].map((t, i) => ({
        sequence: i + 1,
        send: t,
        receive: t + 0.1,
        identity: "same/birth",
        available: true,
        totalMs: t,
        userMs: t / 2,
        privilegedMs: t / 2,
        ticks: t + 1,
        frequency: 1000,
    }));
    points[3].totalMs = -1;
    assert.equal(f(points, 1, 19).complete, false);
});

test("sidecar keeps raw swap/stats brackets and counts the final telemetry write", () => {
    const patch = api("patchDriver")(
            readFileSync(process.env.LATENCY615_TEST_INPUT),
        ),
        span = patch.recipe.find((r) => r.id === "runtime").span;
    let t = 100;
    const files = {};
    const fake = new EventEmitter();
    fake.cpuUsage = () => ({ user: 1, system: 1 });
    fake.stdout = { write: () => {} };
    const context = vm.createContext({
        Buffer,
        structuredClone,
        process: fake,
        performance: { now: () => ++t, timeOrigin: 1000 },
        Date,
        outDir: "inert",
        __l615Append: (p, b) => {
            files[p] = (files[p] ?? "") + b;
        },
        __l615Write: (p, b) => {
            files[p] = b;
        },
    });
    vm.runInContext(span + "\nthis.o=__l615;", context);
    context.current = { requests: 1, deliberate: 0, failed: 0, hist: hist(1) };
    vm.runInContext(
        '__l615.start(100);const cut=__l615.cut(110,current,{ok:1});__l615.swapped(cut);__l615.stats(cut,{});__l615.interval(1,{phase:"load",t:10},current,cut,{ok:1});',
        context,
    );
    const r = JSON.parse(files["inert/intervals.jsonl"]);
    assert.ok(Array.isArray(r.absolute.swap), "missing raw swap bracket");
    assert.ok(Array.isArray(r.absolute.stats), "missing raw stats bracket");
    assert.equal(r.absolute.swap.length, 2);
    assert.equal(r.absolute.stats.length, 2);
    const before = context.o.state.writes;
    context.o.final({ pass: true });
    assert.equal(context.o.state.writes, before + 2);
});

test("actual workflow conditions preserve normal PR/main/manual jobs and isolate only diagnostic concurrency", () => {
    const yaml = readFileSync(
        new URL("../.github/workflows/http-keepalive.yml", import.meta.url),
        "utf8",
    );
    const normal = /hosted-http:[\s\S]*?\n {8}if: ([^\n]+)/
        .exec(yaml)[1]
        .replace(
            "github.event.pull_request.labels.*.name",
            "github.event.pull_request.labels.map(l=>l.name)",
        );
    const diagnostic = /latency615-triad:\n {8}if: ([^\n]+)/.exec(yaml)[1];
    const group = / {4}group: \$\{\{ (.*) \}\}/.exec(yaml)[1],
        cancel = / {4}cancel-in-progress: \$\{\{ (.*) \}\}/.exec(yaml)[1];
    for (const [event, mode, labels, wantNormal, wantDiagnostic] of [
        ["push", "", [], true, false],
        ["pull_request", "", [], false, false],
        ["pull_request", "", ["full-ci"], true, false],
        ["workflow_dispatch", "", [], true, false],
        ["workflow_dispatch", "normal", [], true, false],
        ["workflow_dispatch", "latency615-triad", [], true, true],
    ]) {
        const context = {
            github: {
                event_name: event,
                repository: "40oleg/nona",
                head_ref: "",
                sha: "abc",
                event: {
                    pull_request: { labels: labels.map((name) => ({ name })) },
                },
            },
            inputs: { diagnostic_mode: mode, dispatch_nonce: "valid-nonce" },
            contains: (a, v) => a.includes(v),
            format: (f, ...args) =>
                f.replace(/\{([0-9]+)\}/g, (_, i) => args[Number(i)]),
        };
        assert.equal(vm.runInNewContext(normal, context), wantNormal);
        assert.equal(vm.runInNewContext(diagnostic, context), wantDiagnostic);
        assert.equal(vm.runInNewContext(cancel, context), !wantDiagnostic);
        assert.equal(
            vm.runInNewContext(group, context),
            wantDiagnostic
                ? "http-latency615-40oleg/nona-valid-nonce"
                : "http-keepalive-40oleg/nona-abc",
        );
    }
});
test("workflow nonce validation writes only a validated distinct artifact and fixed output child", () => {
    const yaml = readFileSync(
            new URL("../.github/workflows/http-keepalive.yml", import.meta.url),
            "utf8",
        ),
        script = /node --input-type=module -e '([^']+)'/
            .exec(yaml)[1]
            .replace(/import [^;]+;/g, "");
    function run(nonce, head) {
        const writes = [];
        const ctx = {
            nonce: api("nonce"),
            appendFileSync: (file, data) => writes.push({ file, data }),
            process: {
                env: {
                    DISPATCH_NONCE: nonce,
                    EXPECTED_HEAD: head,
                    GITHUB_RUN_ID: "123",
                    GITHUB_RUN_ATTEMPT: "1",
                    GITHUB_OUTPUT: "inert-output",
                },
            },
        };
        return { writes, execute: () => vm.runInNewContext(script, ctx) };
    }
    const good = run("valid-nonce", "a".repeat(40));
    good.execute();
    assert.equal(good.writes.length, 1);
    assert.ok(
        good.writes[0].data.includes(
            "artifact=latency615-triad-" +
                "a".repeat(40) +
                "-123-1-valid-nonce\n",
        ),
    );
    assert.ok(
        good.writes[0].data.includes(
            "path=work/http-latency615/123-1-valid-nonce\n",
        ),
    );
    for (const [n, h] of [
        ["../evil", "a".repeat(40)],
        ["valid-nonce", "unpublished"],
    ]) {
        const bad = run(n, h);
        assert.throws(bad.execute);
        assert.equal(bad.writes.length, 0);
    }
});
