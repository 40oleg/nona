import assert from "node:assert/strict";
import { test } from "node:test";
import {
    checkResponse,
    evaluateRun,
    newHistogram,
    record,
} from "./http-soak-support.mjs";
import {
    readConfig,
    serverIdentity,
    acceptancePass,
    waitForReady,
    writeFailureReceipt,
} from "./http-soak-evidence.mjs";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendSummary } from "./http-soak-summary.mjs";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";

test("invalid CLI duration preserves exit status and original configuration failure without starting a server", () => {
    const dir = mkdtempSync(join(tmpdir(), "http-soak-cli-"));
    try {
        const result = spawnSync(
            process.execPath,
            ["scripts/http-soak.mjs", "--out", dir],
            {
                env: {
                    ...process.env,
                    NONA_SOAK_MINUTES: "5",
                    NONA_SOAK_WARMUP_MINUTES: "10",
                },
                encoding: "utf8",
                timeout: 5000,
            },
        );
        assert.equal(result.status, 2);
        assert.match(result.stderr, /larger than the warm-up/);
        const report = JSON.parse(
            readFileSync(join(dir, "http-soak.json"), "utf8"),
        );
        assert.equal(report.failure.name, "RangeError");
        assert.equal(report.phase, "configuration");
        assert.equal(report.server, undefined);
        assert.equal(report.summary.pass, false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("missing workflow report creates a failure receipt and preserves existing summary", () => {
    const dir = mkdtempSync(join(tmpdir(), "http-soak-summary-"));
    try {
        const summary = join(dir, "summary.md");
        writeFileSync(summary, "primary build failure\n");
        appendSummary(join(dir, "reports"), summary, "failure");
        const report = JSON.parse(
            readFileSync(join(dir, "reports", "http-soak.json"), "utf8"),
        );
        assert.equal(report.summary.pass, false);
        assert.match(report.failure.message, /No HTTP soak report.*failure/);
        assert.match(
            readFileSync(summary, "utf8"),
            /^primary build failure\n# HTTP soak test: FAIL/,
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("missing Markdown preserves the existing JSON primary failure and partial samples", () => {
    const dir = mkdtempSync(join(tmpdir(), "http-soak-partial-"));
    try {
        writeFileSync(
            join(dir, "http-soak.json"),
            JSON.stringify({
                phase: "startup",
                samples: [{ t: 2 }],
                failure: {
                    name: "Error",
                    message: "primary spawn failure",
                    code: "ENOENT",
                    signal: null,
                    stack: "original stack",
                },
                summary: { pass: false },
            }),
        );
        appendSummary(dir, join(dir, "summary.md"), "failure");
        const report = JSON.parse(
            readFileSync(join(dir, "http-soak.json"), "utf8"),
        );
        assert.equal(report.failure.message, "primary spawn failure");
        assert.equal(report.failure.code, "ENOENT");
        assert.equal(report.failure.stack, "original stack");
        assert.deepEqual(report.samples, [{ t: 2 }]);
        assert.match(
            readFileSync(join(dir, "summary.md"), "utf8"),
            /primary spawn failure/,
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("invalid duration, warm-up, sampling and workers reject before any server starts", () => {
    for (const env of [
        { NONA_SOAK_MINUTES: "0" },
        { NONA_SOAK_MINUTES: "5" },
        { NONA_SOAK_MINUTES: "NaN" },
        { NONA_SOAK_WARMUP_MINUTES: "-1" },
        { NONA_SOAK_WARMUP_MINUTES: "180" },
        { NONA_SOAK_SAMPLE_SECONDS: "0" },
        { NONA_SOAK_CONNECTIONS: "0.5" },
        { NONA_SOAK_CONNECTIONS: "Infinity" },
    ])
        assert.throws(() => readConfig(env, false), RangeError);
    const config = readConfig({}, false);
    assert.equal(config.minutes, 180);
    assert.equal(config.warmupMinutes, 10);
    assert.equal(config.windowMinutes, 30);
    assert.equal(readConfig({}, true).warmupMinutes, 1);
});

test("readiness requires a complete exact-port line and removes listeners", async () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    let ready = false;
    const result = waitForReady(child, 1234, 1000).then(() => (ready = true));
    child.stdout.emit("data", Buffer.from("already\nready 12345\nrea"));
    await Promise.resolve();
    assert.equal(ready, false);
    child.stdout.emit("data", Buffer.from("dy 1234\n"));
    await result;
    assert.equal(ready, true);
    assert.equal(child.stdout.listenerCount("data"), 0);
    assert.equal(child.listenerCount("exit"), 0);
    assert.equal(child.listenerCount("error"), 0);
});

test("readiness rejects startup error, clean early exit and missing ready line promptly", async () => {
    for (const mode of ["error", "exit", "timeout"]) {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        const result = waitForReady(child, 1234, 5);
        if (mode === "error")
            child.emit(
                "error",
                Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }),
            );
        if (mode === "exit") child.emit("exit", 0, null);
        await assert.rejects(
            result,
            mode === "error"
                ? /ENOENT/
                : mode === "exit"
                  ? /startup.*code 0/
                  : /ready line/,
        );
        assert.equal(child.stdout.listenerCount("data"), 0);
    }
});

test("failure receipts retain original code, stderr, partial samples and fail both verdicts", () => {
    const dir = mkdtempSync(join(tmpdir(), "http-soak-unit-"));
    try {
        writeFailureReceipt(
            dir,
            {
                phase: "startup",
                serverLog: ["original stderr"],
                samples: [{ t: 1 }],
                summary: { pass: true },
            },
            Object.assign(new Error("spawn failed"), { code: "ENOENT" }),
        );
        const report = JSON.parse(
            readFileSync(join(dir, "http-soak.json"), "utf8"),
        );
        assert.equal(report.failure.code, "ENOENT");
        assert.equal(report.failure.message, "spawn failed");
        assert.deepEqual(report.samples, [{ t: 1 }]);
        assert.deepEqual(report.serverLog, ["original stderr"]);
        assert.equal(report.summary.pass, false);
        assert.equal(report.summary.acceptancePass, false);
        assert.match(
            readFileSync(join(dir, "http-soak.md"), "utf8"),
            /original stderr/,
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("provenance distinguishes Node source from native image and unknown external origin", () => {
    const dir = mkdtempSync(join(tmpdir(), "http-soak-identity-"));
    try {
        const path = join(dir, "control.mjs");
        writeFileSync(path, "abc");
        const node = serverIdentity({
            serverPath: path,
            built: false,
            commit: "checkout",
            target: "linux-x64",
        });
        assert.equal(node.kind, "node");
        assert.equal(node.target, null);
        assert.equal(
            node.sourceSha256,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        );
        assert.equal(node.imageSha256, null);
        assert.equal(node.measuredSourceCommit, null);
        const native = serverIdentity({
            serverPath: path + ".exe",
            built: false,
            commit: "checkout",
            target: "win32-x64",
        });
        assert.equal(native.kind, "native");
        assert.equal(native.measuredSourceCommit, null);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

function nativeAcceptanceEvidence() {
    return {
        config: readConfig({}, false),
        checkoutDirty: false,
        server: {
            kind: "native",
            imageSha256: "a".repeat(64),
            measuredSourceCommit: "b".repeat(40),
            sourceCommitBasis: "built from checkout",
        },
        mix: {
            text: 35,
            json: 28,
            big: 5,
            echo: 12,
            close: 10,
            slow: 4,
            missing: 3,
            throw: 3,
        },
        routeCounts: {
            text: 1,
            json: 1,
            big: 1,
            echo: 1,
            close: 1,
            slow: 1,
            missing: 1,
            throw: 1,
        },
        summary: { pass: true },
    };
}

test("short, control, reduced mix and unknown-image evidence never satisfy native acceptance", () => {
    const full = nativeAcceptanceEvidence();
    assert.equal(acceptancePass(full), true);
    for (const change of [
        (e) => (e.config.minutes = 5),
        (e) => (e.server.kind = "node"),
        (e) => (e.mix.big = 0),
        (e) => (e.routeCounts.big = 0),
        (e) => (e.server.imageSha256 = null),
        (e) => (e.server.sourceCommitBasis = "caller supplied (unverified)"),
        (e) => (e.summary.pass = false),
    ]) {
        const e = structuredClone(full);
        change(e);
        assert.equal(acceptancePass(e), false);
    }
});

for (const [name, checkoutDirty, expected] of [
    ["clean", false, true],
    ["dirty", true, false],
    ["unknown", null, false],
    ["undefined", undefined, false],
    ["missing", undefined, false],
]) {
    test(`${name} checkout provenance gives native acceptance ${expected} without changing configured pass`, () => {
        const e = nativeAcceptanceEvidence();
        if (name === "missing") delete e.checkoutDirty;
        else e.checkoutDirty = checkoutDirty;
        assert.equal(acceptancePass(e), expected);
        assert.equal(e.summary.pass, true);
    });

    test(`driver uses recorded ${name} checkout provenance for native acceptance ${expected}`, () => {
        // Execute only the real verdict call: no server, load or timers.
        const source = readFileSync(
            new URL("./http-soak.mjs", import.meta.url),
            "utf8",
        );
        const call = source.match(
            /summary\.acceptancePass = acceptancePass\(\{[\s\S]*?\}\);/,
        );
        assert.ok(call, "driver acceptance call must be present");
        const e = nativeAcceptanceEvidence();
        if (name === "missing") delete e.checkoutDirty;
        else e.checkoutDirty = checkoutDirty;
        runInNewContext(call[0], {
            acceptancePass,
            receipt: e,
            config: e.config,
            mix: Object.entries(e.mix),
            routeCounts: e.routeCounts,
            summary: e.summary,
        });
        assert.equal(e.summary.acceptancePass, expected);
        assert.equal(e.summary.pass, true);
    });
}

test("response checks cover text, chunking, big data and deliberate statuses", () => {
    assert.equal(
        checkResponse("text", { statusCode: 200 }, Buffer.from("Hello, soak!")),
        null,
    );
    assert.equal(
        checkResponse("close", { statusCode: 200 }, Buffer.from("wrong")),
        "wrong body",
    );
    const response = {
        statusCode: 200,
        headers: { "transfer-encoding": "chunked" },
    };
    assert.equal(
        checkResponse("big", response, Buffer.alloc(1048576, "b")),
        null,
    );
    assert.match(
        checkResponse("big", response, Buffer.alloc(1048576, "c")),
        /wrong body/,
    );
    assert.equal(
        checkResponse("big", { statusCode: 200, headers: {} }, Buffer.alloc(0)),
        "not chunked",
    );
    assert.equal(
        checkResponse("missing", { statusCode: 404 }, Buffer.alloc(0)),
        null,
    );
    assert.equal(
        checkResponse("throw", { statusCode: 200 }, Buffer.alloc(0)),
        "status 200",
    );
});

// Independent copy of the documented wire contract, including nested values.
function document() {
    return {
        generated: "soak",
        version: 1,
        items: Array.from({ length: 24 }, (_, i) => ({
            id: i,
            name: `item-${i}`,
            price: i * 1.25,
            active: i % 3 !== 0,
            sizes: [i, i + 1, i + 2],
            owner: { id: 1000 + i, login: `user${i}` },
        })),
        tags: Object.fromEntries(
            Array.from({ length: 24 }, (_, i) => [`tag${i}`, i % 2 === 0]),
        ),
    };
}
test("JSON rejects same-length corruption, including the first response", () => {
    const doc = document();
    doc.items[7].owner.login = "xxxx7";
    assert.equal(
        checkResponse(
            "json",
            { statusCode: 200 },
            Buffer.from(JSON.stringify(doc)),
        ),
        "wrong JSON content",
    );
    assert.equal(
        checkResponse(
            "json",
            { statusCode: 200 },
            Buffer.from(JSON.stringify(document())),
        ),
        null,
    );
    for (const mutate of [
        (d) => (d.version = 2),
        (d) => (d.tags.tag0 = false),
        (d) => (d.items[0].sizes[1] = 9),
    ]) {
        const d = document();
        mutate(d);
        assert.equal(
            checkResponse(
                "json",
                { statusCode: 200 },
                Buffer.from(JSON.stringify(d)),
            ),
            "wrong JSON content",
        );
    }
});

function evidence(tailLatency = 1) {
    const times = [
        0,
        ...Array.from({ length: 180 }, (_, i) => (i + 1) * 60),
        10808,
    ];
    const samples = times.map((t, i) => ({
        phase: i === 0 ? "baseline" : i === 181 ? "after" : "load",
        t,
        rss: 1000000,
        openSockets: 1,
        fds: 10,
        activeResources: 2,
    }));
    return {
        config: {
            minutes: 180,
            warmupMinutes: 10,
            windowMinutes: 30,
            sampleSeconds: 60,
            limits: {
                rssGrowth: 0.1,
                p99Growth: 0.2,
                p99SlackMs: 0.5,
                socketSlack: 2,
                fdSlack: 4,
                resourceSlack: 2,
            },
        },
        samples,
        histograms: times.map((t) => {
            const h = newHistogram();
            record(h, t > 9000 ? tailLatency : 1);
            return h;
        }),
        crash: null,
        counters: {
            ok: 180,
            deliberate: { missing: 0, throw: 0, slowAborted: 0 },
            failed: 0,
            failures: {},
            nearCrash: {},
        },
        baseline: samples[0],
        after: samples.at(-1),
        loadSeconds: 10800,
    };
}
test("p99 enforces the ratio even below the former half-millisecond allowance", () => {
    assert.equal(evaluateRun(evidence()).summary.pass, true);
    const result = evaluateRun(evidence(1.4));
    assert.equal(
        result.criteria.find((c) => c.name === "p99 latency stable").pass,
        false,
    );
    assert.equal(result.summary.pass, false);
});
test("RSS and handles keep their original budgets and unknown counters cannot pass", () => {
    for (const change of [
        (e) => {
            for (const s of e.samples) if (s.t >= 9000) s.rss = 1100000;
        },
        (e) => (e.after.fds = 15),
        (e) => {
            for (const s of [e.baseline, e.after]) {
                s.fds = null;
                s.openSockets = null;
                s.activeResources = null;
            }
        },
        (e) => (e.counters.failed = 1),
    ]) {
        const e = evidence();
        change(e);
        assert.equal(evaluateRun(e).summary.pass, false);
    }
});

test("a histogram that crosses warm-up is excluded from the comparison window", () => {
    const e = evidence();
    e.samples[10].t = 600.2;
    e.samples[10].intervalStart = 540;
    e.samples[10].intervalEnd = 600.2;
    e.histograms[10] = newHistogram();
    record(e.histograms[10], 100);
    const result = evaluateRun(e);
    assert.equal(result.summary.pass, true);
    assert.ok(result.summary.p99Head < 1.02);
});
test("incomplete duration and insufficient comparison samples fail", () => {
    for (const change of [
        (e) => (e.loadSeconds = 100),
        (e) => {
            e.samples = [
                e.samples[0],
                e.samples[11],
                e.samples[180],
                e.samples[181],
            ];
            e.histograms = e.histograms.slice(0, 4);
        },
        (e) => (e.crash = { code: 0, signal: null, atSeconds: 100 }),
        (e) => (e.crash = { code: 17, signal: null, atSeconds: 100 }),
    ]) {
        const e = evidence();
        change(e);
        assert.equal(evaluateRun(e).summary.pass, false);
    }
});
