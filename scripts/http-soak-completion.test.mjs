import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import {
    mkdtempSync,
    readFileSync,
    rmSync,
    mkdirSync,
    writeFileSync,
    readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import * as evidence from "./http-soak-evidence.mjs";
import {
    checkResponse,
    newHistogram,
    record,
    quantile,
    evaluateRun,
} from "./http-soak-support.mjs";

const { readConfig } = evidence;

const driver = readFileSync(
    new URL("./http-soak.mjs", import.meta.url),
    "utf8",
);

// Execute the real collector AND scheduling loop. Virtual intervals carry one
// latency observation, except the clipped last interval, which has only a
// deliberate slow abort. The final boundary matches #640's uploaded report;
// preceding timings and histograms here are synthetic, not recovered raw data.
async function collectBoundary(
    config = readConfig(
        {
            NONA_SOAK_MINUTES: "0.15",
            NONA_SOAK_WARMUP_MINUTES: "0.02",
            NONA_SOAK_SAMPLE_SECONDS: "0.2",
        },
        false,
    ),
    driftMs = null,
) {
    let now = 1000;
    let ticks = 0;
    const replayBoundary = config.minutes === 0.15 && driftMs === null;
    const interval = () => ({
        requests: 0,
        deliberate: 0,
        failed: 0,
        hist: newHistogram(),
    });
    const baseline = {
        rss: 1000000,
        openSockets: 1,
        fds: 10,
        activeResources: 2,
    };
    const context = {
        config,
        receipt: { samples: [] },
        interval: interval(),
        performance: { now: () => now },
        loadStart: 1000,
        elapsedSeconds: () => (now - 1000) / 1000,
        fetchStats: async () => ({ memory: { rss: 1000000 }, ...baseline }),
        procRss: () => 1000000,
        procFds: () => 10,
        newHistogram,
        quantile,
        console: { log() {} },
        writeFailureReceipt() {},
        outDir: "unused",
        crash: null,
        fail() {
            assert.fail("unexpected statistics failure");
        },
        workers: [],
        agents: [],
        running: true,
        sleep: async (ms) => {
            ticks++;
            // Drift accumulates before the deadline, just as in the real run.
            now = replayBoundary
                ? 1000 + (ticks <= 44 ? ticks * (8953.2504 / 44) : 9000.3675)
                : now + ms + (driftMs ?? 0);
            context.interval.requests++;
            if (replayBoundary && ticks === 45) context.interval.deliberate++;
            else record(context.interval.hist, 1);
        },
    };
    const sampling = driver.slice(
        driver.indexOf("    const samples = receipt.samples;"),
        driver.indexOf("    // --- Run "),
    );
    const loop = driver.slice(
        driver.indexOf("    const endAt = loadStart"),
        driver.indexOf('    receipt.phase = "settle";'),
    );
    return runInNewContext(
        `(async () => {
        ${sampling}
        lastSampleAt = loadStart;
        ${loop}
        return { samples, histograms, loadSeconds };
    })()`,
        context,
    );
}

function boundaryEvidence(
    collected,
    config = readConfig(
        {
            NONA_SOAK_MINUTES: "0.15",
            NONA_SOAK_WARMUP_MINUTES: "0.02",
            NONA_SOAK_SAMPLE_SECONDS: "0.2",
        },
        false,
    ),
) {
    return {
        ...collected,
        config,
        crash: null,
        counters: {
            ok: collected.histograms.reduce((n, h) => n + h.n, 0),
            deliberate: {
                missing: 0,
                throw: 0,
                slowAborted: collected.samples.reduce(
                    (n, s) => n + s.deliberate,
                    0,
                ),
            },
            failed: 0,
            failures: {},
            nearCrash: {},
        },
        baseline: { openSockets: 1, fds: 10, activeResources: 2 },
        after: { openSockets: 1, fds: 10, activeResources: 2 },
    };
}

test("terminal partial from the real collector preserves raw accounting and is not a comparison observation", async () => {
    const collected = await collectBoundary();
    const e = boundaryEvidence(collected);
    const result = evaluateRun(e);
    assert.equal(
        result.criteria.find((c) => c.name === "comparison sample coverage")
            .pass,
        true,
    );
    assert.equal(result.summary.pass, true);
    assert.equal(collected.samples.length, 45);
    const last = collected.samples.at(-1);
    assert.ok(Math.abs(last.intervalStart - 8.9532504) < 1e-12);
    assert.ok(Math.abs(last.intervalEnd - 9.0003675) < 1e-12);
    assert.equal(last.observation, "terminal-partial");
    assert.equal(last.requests, 1);
    assert.equal(last.deliberate, 1);
    assert.equal(last.failed, 0);
    assert.equal(last.p99, null);
    assert.equal(collected.histograms.at(-1).n, 0);
    assert.equal(
        collected.samples.reduce((n, s) => n + s.requests, 0),
        45,
    );
    assert.equal(result.summary.requests, 45);
    assert.equal(result.summary.deliberate.slowAborted, 1);
});

test("nonempty terminal partial is excluded from both latency and RSS comparisons", async () => {
    const e = boundaryEvidence(await collectBoundary());
    record(e.histograms.at(-1), 1000);
    e.samples.at(-1).rss = 1000000000;
    const result = evaluateRun(e);
    assert.equal(result.summary.pass, true);
    assert.equal(result.summary.p99Tail, 1.008);
    assert.equal(result.summary.rssTail, 1000000);
});

// Synthetic malformed evidence, not recovered bins from a hosted report.
// Removing bin validation must fail coverage even for an excluded snapshot.
for (const observation of ["complete", "terminal-partial"]) {
    for (const [name, mutate] of [
        [
            "actual Uint32Array count/n mismatch",
            (h) => {
                assert.ok(h.counts instanceof Uint32Array);
                for (let i = 0; i < h.counts.length; i++) h.counts[i] *= 2;
                assert.equal(h.n, 1);
                assert.equal(
                    h.counts.reduce((sum, count) => sum + count, 0),
                    2,
                );
            },
        ],
        ["zero n with a nonzero bin", (h) => (h.n = 0)],
        ["n greater than bin sum", (h) => (h.n = 2)],
        ["missing n", (h) => delete h.n],
        ["string n", (h) => (h.n = "1")],
        ["fractional n", (h) => (h.n = 1.5)],
        ["negative n", (h) => (h.n = -1)],
        ["NaN n", (h) => (h.n = NaN)],
        ["infinite n", (h) => (h.n = Infinity)],
        ["unsafe n", (h) => (h.n = Number.MAX_SAFE_INTEGER + 1)],
        ["missing counts", (h) => delete h.counts],
        ["missing bin", (h) => delete h.counts[1999]],
        ["sparse counts", (h) => (h.counts = new Array(2000))],
        ["string bin", (h) => (h.counts[1999] = "0")],
        ["fractional bin", (h) => (h.counts[1999] = 0.5)],
        ["negative bin", (h) => (h.counts[1999] = -1)],
        ["NaN bin", (h) => (h.counts[1999] = NaN)],
        ["infinite bin", (h) => (h.counts[1999] = Infinity)],
        ["null bin", (h) => (h.counts[1999] = null)],
        ["bigint bin", (h) => (h.counts[1999] = 0n)],
        [
            "negative bins with matching total",
            (h) => {
                h.counts[1998] = -1;
                h.counts[1999] = 1;
            },
        ],
        [
            "fractional bins with matching total",
            (h) => {
                h.counts.fill(0);
                h.counts[1998] = 0.5;
                h.counts[1999] = 0.5;
            },
        ],
        [
            "bin above Uint32 representation bound with matching n",
            (h) => {
                h.counts.fill(0);
                h.counts[1999] = 0x100000000;
                h.n = 0x100000000;
            },
        ],
        [
            "unsafe bin total with matching unsafe n",
            (h) => {
                h.counts.fill(0);
                h.counts[0] = Number.MAX_SAFE_INTEGER;
                h.counts[1999] = 1;
                h.n = Number.MAX_SAFE_INTEGER + 1;
            },
        ],
    ]) {
        test(`malformed ${observation} histogram: ${name} fails closed without crashing reporting`, async () => {
            const e = boundaryEvidence(await collectBoundary());
            const index =
                observation === "complete" ? 40 : e.histograms.length - 1;
            const h = e.histograms[index];
            if (h.n === 0) record(h, 1);
            if (name !== "actual Uint32Array count/n mismatch")
                h.counts = Array.from(h.counts);
            mutate(h);
            let result;
            assert.doesNotThrow(() => (result = evaluateRun(e)));
            for (const criterion of [
                "comparison sample coverage",
                "p99 latency stable",
                "RSS growth after warm-up",
            ]) {
                assert.equal(
                    result.criteria.find((c) => c.name === criterion).pass,
                    false,
                    criterion,
                );
            }
            assert.equal(result.summary.pass, false);
            assert.doesNotThrow(() => JSON.stringify(result));
        });
    }
}

for (const [name, mutate] of [
    [
        "complete empty interval",
        (e) => {
            e.histograms[40] = newHistogram();
            e.samples[40].p99 = null;
        },
    ],
    [
        "missing complete interval despite sufficient sample count",
        (e) => {
            e.samples.splice(40, 1);
            e.histograms.splice(40, 1);
        },
    ],
    [
        "missing initial raw interval",
        (e) => {
            e.samples.shift();
            e.histograms.shift();
        },
    ],
    [
        "missing terminal raw snapshot",
        (e) => {
            e.samples.pop();
            e.histograms.pop();
        },
    ],
    [
        "gap before terminal partial",
        (e) => {
            e.samples.at(-1).intervalStart += 0.01;
        },
    ],
    [
        "overlapping complete intervals",
        (e) => {
            e.samples[40].intervalStart -= 0.01;
        },
    ],
    [
        "short nonterminal interval with latency",
        (e) => {
            e.samples[40].intervalEnd -= 0.1;
        },
    ],
    [
        "unmarked terminal partial",
        (e) => {
            delete e.samples.at(-1).observation;
        },
    ],
    [
        "terminal partial called complete",
        (e) => {
            e.samples.at(-1).observation = "complete";
        },
    ],
    [
        "complete interval called terminal partial",
        (e) => {
            e.samples[40].observation = "terminal-partial";
        },
    ],
    [
        "unknown observation kind",
        (e) => {
            e.samples[40].observation = "unknown";
        },
    ],
    [
        "missing terminal boundary",
        (e) => {
            delete e.samples.at(-1).intervalEnd;
        },
    ],
    [
        "null terminal boundary",
        (e) => {
            e.samples.at(-1).intervalEnd = null;
        },
    ],
    [
        "nonfinite complete boundary",
        (e) => {
            e.samples[40].intervalEnd = NaN;
        },
    ],
    [
        "missing histogram",
        (e) => {
            e.histograms[40] = undefined;
        },
    ],
    [
        "malformed histogram",
        (e) => {
            e.histograms[40] = { n: 1 };
        },
    ],
    [
        "unknown RSS",
        (e) => {
            e.samples[40].rss = null;
        },
    ],
    [
        "early completion",
        (e) => {
            e.loadSeconds = 8.99;
        },
    ],
    [
        "unknown load duration",
        (e) => {
            e.loadSeconds = Infinity;
        },
    ],
    [
        "comparison end too far before actual load end",
        (e) => {
            e.loadSeconds = 12;
        },
    ],
    [
        "clean early child exit",
        (e) => {
            e.crash = { code: 0, signal: null };
        },
    ],
    [
        "crashed child",
        (e) => {
            e.crash = { code: 17, signal: null };
        },
    ],
]) {
    test(`${name} still fails comparison coverage with a terminal partial`, async () => {
        const e = boundaryEvidence(await collectBoundary());
        mutate(e);
        const result = evaluateRun(e);
        assert.equal(
            result.criteria.find((c) => c.name === "comparison sample coverage")
                .pass,
            false,
        );
        assert.equal(result.summary.pass, false);
    });
}

test("terminal request failures are retained even though their partial interval is excluded", async () => {
    const e = boundaryEvidence(await collectBoundary());
    e.samples.at(-1).failed = 1;
    e.counters.failed = 1;
    e.counters.failures = { "text: wrong body": 1 };
    const result = evaluateRun(e);
    assert.equal(
        result.criteria.find((c) => c.name === "comparison sample coverage")
            .pass,
        true,
    );
    assert.equal(
        result.criteria.find((c) => c.name === "no failed requests").pass,
        false,
    );
    assert.equal(result.summary.failed, 1);
    assert.equal(result.summary.requests, 46);
    assert.equal(e.samples.at(-1).failed, 1);
    assert.equal(result.summary.pass, false);
});

for (const [name, config, want, minimum] of [
    ["default", readConfig({}, false), "30/30 samples", 30],
    ["smoke", readConfig({}, true), "6/6 samples", 6],
]) {
    test(`${name} complete windows retain sample counts and reject a missing observation`, async () => {
        const collected = await collectBoundary(config);
        const e = boundaryEvidence(collected, config);
        assert.equal(e.samples.at(-1).observation, "complete");
        assert.equal(evaluateRun(e).summary.pass, true);
        const coverage = evaluateRun(e).criteria.find(
            (c) => c.name === "comparison sample coverage",
        );
        assert.equal(coverage.value, want);
        assert.equal(
            coverage.limit,
            `at least ${minimum} complete samples per window`,
        );
        // Older evidence with genuinely complete intervals remains eligible.
        for (const s of e.samples) delete s.observation;
        assert.equal(evaluateRun(e).summary.pass, true);
        const lastHistogram = e.histograms.at(-1);
        e.histograms[e.histograms.length - 1] = newHistogram();
        assert.equal(
            evaluateRun(e).summary.pass,
            false,
            "a full-duration final empty observation must fail",
        );
        e.histograms[e.histograms.length - 1] = lastHistogram;
        const index = name === "default" ? 15 : 8;
        e.samples.splice(index, 1);
        e.histograms.splice(index, 1);
        const result = evaluateRun(e);
        assert.equal(
            result.criteria.find((c) => c.name === "comparison sample coverage")
                .pass,
            false,
        );
        assert.equal(result.summary.pass, false);
    });
    test(`${name} clock drift still provides the required complete comparison windows`, async () => {
        const e = boundaryEvidence(
            await collectBoundary(config, 0.0001),
            config,
        );
        const result = evaluateRun(e);
        assert.equal(e.samples.at(-1).observation, "terminal-partial");
        assert.equal(
            result.criteria.find((c) => c.name === "comparison sample coverage")
                .value,
            want,
        );
        assert.equal(result.summary.pass, true);
    });
}

test("short windows still require two complete samples after excluding a nonempty terminal partial", async () => {
    const config = readConfig(
        {
            NONA_SOAK_MINUTES: "0.006",
            NONA_SOAK_WARMUP_MINUTES: "0",
            NONA_SOAK_SAMPLE_SECONDS: "0.2",
        },
        false,
    );
    const e = boundaryEvidence(await collectBoundary(config), config);
    assert.equal(e.samples.length, 2);
    assert.equal(e.samples.at(-1).observation, "terminal-partial");
    assert.ok(e.histograms.at(-1).n > 0);
    const result = evaluateRun(e);
    const coverage = result.criteria.find(
        (c) => c.name === "comparison sample coverage",
    );
    assert.equal(coverage.value, "1/1 samples");
    assert.equal(coverage.limit, "at least 2 complete samples per window");
    assert.equal(coverage.pass, false);
    assert.equal(result.summary.pass, false);
});

test("a short run ending on a full sampling boundary keeps its final observation", async () => {
    const config = readConfig(
        {
            NONA_SOAK_MINUTES: "0.15",
            NONA_SOAK_WARMUP_MINUTES: "0.02",
            NONA_SOAK_SAMPLE_SECONDS: "0.2",
        },
        false,
    );
    const e = boundaryEvidence(await collectBoundary(config, 0), config);
    assert.equal(e.samples.length, 45);
    assert.equal(e.samples.at(-1).observation, "complete");
    assert.equal(evaluateRun(e).summary.pass, true);
    e.histograms[e.histograms.length - 1] = newHistogram();
    assert.equal(evaluateRun(e).summary.pass, false);
});

// Execute the driver's actual load-generator functions, including their counters
// and worker loop. Only the network boundary is fake; no listener or load starts.
function loadGenerator() {
    const connections = [];
    const agents = [];
    function connect(options, respond) {
        const req = new EventEmitter();
        const res = new EventEmitter();
        res.statusCode = 200;
        res.complete = false;
        let destroyed = false;
        req.setTimeout = (_ms, callback) => (req.timeout = callback);
        req.end = () => {};
        req.destroy = () => {
            if (destroyed) return;
            destroyed = true;
            res.emit("aborted");
            res.emit(
                "error",
                Object.assign(new Error("aborted"), { code: "ECONNRESET" }),
            );
            res.emit("close");
            req.emit("close");
        };
        connections.push({ options, req, res, respond: () => respond(res) });
        return req;
    }
    const start = driver.indexOf("    const counters =");
    const end = driver.indexOf("    function procRss()", start);
    assert.ok(start > 0 && end > start, "load-generator function boundaries");
    const api = runInNewContext(
        driver.slice(start, end) +
            `\n({ slowClient, request, fetchStats, worker, counters, routeCounts,
                interval: () => interval,
                start: () => { running = true; },
                stop: () => { running = false; } })`,
        {
            http: {
                get: connect,
                request: connect,
                Agent: class {
                    constructor() {
                        agents.push(this);
                    }
                },
            },
            receipt: {},
            config: readConfig({}, false),
            SLOW_ABORT_BYTES: 32768,
            port: 1234,
            PATHS: { text: "/text" },
            pickRoute: () => "slow",
            performance: { now: () => 1000 },
            loadStart: 1000,
            crash: null,
            Buffer,
            newHistogram,
            record,
            checkResponse,
        },
    );
    return { ...api, connections, agents };
}

async function isSettled(promise) {
    let settled = false;
    promise.then(() => (settled = true));
    // Promise progress only: a pending worker must fail, never time out green.
    await new Promise(setImmediate);
    return settled;
}

// Run the entire CLI body with virtual time and inert network/child boundaries.
// It still uses the real configuration, criteria, cleanup and disk reporters.
async function runDriver(mode) {
    const dir = mkdtempSync(join(tmpdir(), "http-soak-completion-"));
    let now = 1000;
    let nextId = 0;
    const timers = new Map();
    const schedule = (callback, ms = 0) => {
        const id = ++nextId;
        timers.set(id, { at: now + ms, callback });
        return id;
    };
    const stderr = [];
    const agents = [];
    const active = new Set();
    let closed = false;
    const child = new EventEmitter();
    Object.assign(child, {
        pid: 42424242,
        exitCode: null,
        signalCode: null,
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill() {
            schedule(() => exitServer(null, "SIGTERM"));
        },
    });
    function exitServer(code, signal = null) {
        child.exitCode = code;
        child.signalCode = signal;
        child.stderr.emit(
            "data",
            Buffer.from("fixture original exit stderr\n"),
        );
        for (const req of [...active]) req.destroy();
        child.emit("exit", code, signal);
        // close follows exit and drained stdio; cleanup must wait for it.
        schedule(() => {
            closed = true;
            child.emit("close", code, signal);
        }, 50);
    }
    function connect(options, respond) {
        const req = new EventEmitter();
        const res = new EventEmitter();
        res.statusCode = 200;
        let timeout;
        let destroyed = false;
        let responded = false;
        const release = () => {
            timers.delete(timeout);
            active.delete(req);
        };
        req.setTimeout = (ms, callback) => {
            timeout = schedule(callback, ms);
        };
        req.destroy = () => {
            if (destroyed) return;
            destroyed = true;
            release();
            if (responded) {
                res.emit("aborted");
                res.emit(
                    "error",
                    Object.assign(new Error("aborted"), { code: "ECONNRESET" }),
                );
                res.emit("close");
            } else req.emit("error", new Error("socket closed"));
            req.emit("close");
        };
        active.add(req);
        schedule(() => {
            if (child.exitCode !== null || child.signalCode !== null) {
                release();
                req.emit(
                    "error",
                    Object.assign(new Error("refused"), {
                        code: "ECONNREFUSED",
                    }),
                );
                return;
            }
            responded = true;
            respond(res);
            if (options.path === "/slow") {
                res.emit("data", Buffer.alloc(1));
                return; // The injected server exit interrupts both slow workers.
            }
            const body =
                options.path === "/__stats"
                    ? JSON.stringify({
                          memory: { rss: 1000000 },
                          openSockets: 1,
                          activeResources: 2,
                      })
                    : mode === "wrong-body"
                      ? "wrong"
                      : "Hello, soak!";
            res.emit("data", Buffer.from(body));
            res.complete = true;
            res.emit("end");
            res.emit("close");
            release();
        }, 10);
        req.end = () => {};
        return req;
    }
    const proc = new EventEmitter();
    Object.assign(proc, {
        argv: [process.execPath, "scripts/http-soak.mjs", "--out", dir],
        env: {
            NONA_SOAK_SERVER: resolve("bench/http/soak-server.mjs"),
            NONA_SOAK_MINUTES: "0.15",
            NONA_SOAK_WARMUP_MINUTES: "0.02",
            NONA_SOAK_SAMPLE_SECONDS: "0.2",
            NONA_SOAK_CONNECTIONS: "2",
            NONA_SOAK_MIX: typeof mode === "number" ? "slow=1" : "text=1",
        },
        platform: process.platform,
        execPath: process.execPath,
        version: process.version,
        exitCode: undefined,
        exit(code) {
            this.exitCode = code;
        },
    });
    let completed = false;
    try {
        const start = driver.indexOf("const receipt =");
        const execution = runInNewContext(
            driver
                .slice(start)
                .replaceAll(
                    "import.meta.url",
                    JSON.stringify(
                        new URL("./http-soak.mjs", import.meta.url).href,
                    ),
                ),
            {
                ...evidence,
                checkResponse,
                newHistogram,
                record,
                quantile,
                evaluateRun,
                process: proc,
                performance: { now: () => now },
                console: {
                    log() {},
                    error: (...args) => stderr.push(args.join(" ")),
                },
                Buffer,
                dirname,
                join,
                resolve,
                fileURLToPath,
                mkdirSync,
                readFileSync,
                readdirSync,
                writeFileSync,
                setTimeout: schedule,
                clearTimeout: (id) => timers.delete(id),
                execFileSync: (_command, args) =>
                    args[0] === "status" ? "" : "a".repeat(40),
                spawn() {
                    schedule(() =>
                        child.stdout.emit("data", Buffer.from("ready 1234\n")),
                    );
                    if (typeof mode === "number")
                        schedule(() => exitServer(mode), 1800);
                    return child;
                },
                net: {
                    createServer() {
                        return {
                            on() {},
                            address: () => ({ port: 1234 }),
                            listen(_port, _host, callback) {
                                callback();
                            },
                            close(callback) {
                                callback();
                            },
                        };
                    },
                },
                http: {
                    get: connect,
                    request: connect,
                    Agent: class {
                        constructor() {
                            agents.push(this);
                        }
                        destroy() {
                            this.destroyed = true;
                        }
                    },
                },
            },
        );
        execution.then(() => (completed = true));
        await new Promise(setImmediate);
        for (let i = 0; timers.size && !completed && i < 10000; i++) {
            const [id, timer] = [...timers].sort(
                (a, b) => a[1].at - b[1].at,
            )[0];
            timers.delete(id);
            now = timer.at;
            timer.callback();
            await new Promise(setImmediate);
        }
        return {
            mode,
            completed,
            exitCode: proc.exitCode ?? 0,
            closed,
            agentsDestroyed: agents.filter((a) => a.destroyed).length,
            report: JSON.parse(
                readFileSync(join(dir, "http-soak.json"), "utf8"),
            ),
            markdown: readFileSync(join(dir, "http-soak.md"), "utf8"),
            stderr,
        };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

for (const mode of [17, 0, "healthy", "wrong-body"]) {
    test(`actual CLI finalizes reports and cleanup for ${mode}`, async (t) => {
        const result = await runDriver(mode);
        t.diagnostic(JSON.stringify(result));
        assert.equal(
            result.completed,
            true,
            "main must finish, not leave Node's default exit 0",
        );
        assert.equal(result.closed, true, "child close must be awaited");
        assert.equal(
            result.agentsDestroyed,
            2,
            "both workers must drain before agent cleanup",
        );
        const { report } = result;
        assert.equal(
            report.failure,
            undefined,
            "replace the incomplete receipt with final criteria",
        );
        assert.equal(report.summary.acceptancePass, false);
        assert.match(result.markdown, /\| Criterion \|/);
        assert.match(result.markdown, /\| Phase \|/);
        if (typeof mode === "number") {
            assert.equal(result.exitCode, 1);
            assert.equal(report.crash.code, mode);
            assert.equal(report.crash.signal, null);
            assert.equal(report.summary.pass, false);
            assert.equal(report.summary.after, null);
            assert.equal(report.summary.deliberate.slowAborted, 0);
            assert.equal(report.summary.failed, 0);
            assert.equal(
                Object.values(report.summary.failuresNearCrash).reduce(
                    (a, b) => a + b,
                    0,
                ),
                2,
            );
            assert.match(
                report.serverLog.join("\n"),
                /fixture original exit stderr/,
            );
            assert.match(
                result.stderr.join("\n"),
                new RegExp(`code ${mode}, signal null`),
            );
            assert.match(result.markdown, new RegExp(`"code":${mode}`));
        } else {
            assert.equal(report.crash, null);
            assert.notEqual(report.summary.after, null);
            assert.equal(report.summary.pass, mode === "healthy");
            assert.equal(result.exitCode, mode === "healthy" ? 0 : 1);
            const load = report.samples.filter((s) => s.phase === "load");
            assert.ok(
                load.every((s) =>
                    ["complete", "terminal-partial"].includes(s.observation),
                ),
            );
            assert.equal(
                report.samples.reduce((n, s) => n + s.requests, 0),
                report.summary.requests,
            );
            if (mode === "wrong-body")
                assert.ok(report.summary.failures["text: wrong body"] > 0);
        }
    });
}

for (const event of ["aborted", "error", "close"]) {
    test(`slow response ${event} before the threshold settles once as a failure`, async () => {
        const h = loadGenerator();
        const pending = h.slowClient();
        const { res, req, respond } = h.connections[0];
        respond();
        res.emit("data", Buffer.alloc(32767));
        res.emit(
            event,
            Object.assign(new Error("reset"), { code: "ECONNRESET" }),
        );
        assert.equal(
            await isSettled(pending),
            true,
            "slow promise must settle",
        );
        req.destroy();
        res.emit("end");
        assert.equal(h.interval().requests, 1);
        assert.equal(h.interval().failed, 1);
        assert.equal(h.counters.failed, 1);
        assert.equal(
            Object.values(h.counters.failures).reduce((a, b) => a + b, 0),
            1,
        );
        assert.equal(h.counters.deliberate.slowAborted, 0);
        assert.equal(h.interval().deliberate, 0);
        assert.equal(h.routeCounts.slow, undefined);
    });
}

test("slow response reaching the threshold succeeds once despite destroy events", async () => {
    const h = loadGenerator();
    const pending = h.slowClient();
    const { res, respond } = h.connections[0];
    respond();
    res.emit("data", Buffer.alloc(16384));
    assert.equal(await isSettled(pending), false);
    res.emit("data", Buffer.alloc(16384));
    assert.equal(await isSettled(pending), true);
    res.emit("end");
    assert.equal(h.interval().requests, 1);
    assert.equal(h.counters.failed, 0);
    assert.equal(h.counters.deliberate.slowAborted, 1);
    assert.equal(h.interval().deliberate, 1);
    assert.equal(h.routeCounts.slow, 1);
});

for (const event of ["end", "timeout", "socket-error", "status"]) {
    test(`slow response ${event} before intentional abort remains a failure`, async () => {
        const h = loadGenerator();
        const pending = h.slowClient();
        const { res, req, respond } = h.connections[0];
        if (event === "status") res.statusCode = 503;
        respond();
        if (event === "timeout") req.timeout();
        else if (event === "socket-error")
            req.emit("error", new Error("reset"));
        else if (event === "end") res.emit("end");
        assert.equal(await isSettled(pending), true);
        assert.equal(h.counters.failed, 1);
        assert.equal(h.counters.deliberate.slowAborted, 0);
        assert.equal(h.interval().requests, 1);
    });
}

test("both workers drain after premature slow responses", async () => {
    const h = loadGenerator();
    h.start();
    const workers = [h.worker(), h.worker()];
    assert.equal(h.connections.length, 2);
    h.stop();
    for (const { res, respond } of h.connections) {
        respond();
        res.emit("aborted");
    }
    assert.equal(await isSettled(Promise.all(workers)), true);
    assert.equal(h.counters.failed, 2);
    assert.equal(h.interval().requests, 2);
});

test("ordinary response close before end settles as failure", async () => {
    const h = loadGenerator();
    const pending = h.request({}, "text");
    const { res, respond } = h.connections[0];
    respond();
    res.emit("close");
    assert.equal(await isSettled(pending), true);
    assert.equal(h.counters.failed, 1);
    assert.equal(h.counters.ok, 0);
    assert.equal(h.interval().requests, 1);
});

for (const event of ["aborted", "error", "close"]) {
    test(`statistics response ${event} returns unavailable instead of stranding sampling`, async () => {
        const h = loadGenerator();
        const pending = h.fetchStats();
        const { res, respond } = h.connections[0];
        respond();
        res.emit(event, new Error("reset"));
        assert.equal(await isSettled(pending), true);
        assert.equal(await pending, null);
    });
}
