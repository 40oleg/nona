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
