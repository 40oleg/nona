// HTTP server soak test (#516): builds bench/http/soak-server.mjs with Nona,
// runs it under steady load from a load generator in this process for hours,
// samples the server's memory, handles and latency, and checks that it stays
// healthy. Writes <outdir>/http-soak.json and <outdir>/http-soak.md and exits
// with 1 when a pass criterion fails.
//
//   npm run build && node scripts/http-soak.mjs            # 3 hours
//   node scripts/http-soak.mjs --smoke                     # 5 minutes
//   node scripts/http-soak.mjs --out soak-report
//
// Environment: NONA_SOAK_MINUTES (default 180; 5 with --smoke),
// NONA_SOAK_WARMUP_MINUTES (10; 1 with --smoke), NONA_SOAK_SAMPLE_SECONDS
// (60; 10 with --smoke), NONA_SOAK_CONNECTIONS (concurrent workers, 32),
// NONA_SOAK_PAUSE_MS (pause of every worker between requests, 0),
// NONA_SOAK_MIX (route weights, e.g. text=1,json=1), NONA_SOAK_SERVER (a
// prebuilt server executable, or bench/http/soak-server.mjs to run it under
// Node.js; skips the build). The executable is built into bench/results/.
import http from "node:http";
import net from "node:net";
import os from "node:os";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const smoke = args.includes("--smoke");
const outIndex = args.indexOf("--out");
const outDir = resolve(outIndex >= 0 ? args[outIndex + 1] : "soak-report");

function envNumber(name, fallback) {
    const value = process.env[name];
    if (value === undefined || value === "") return fallback;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
        console.error(`${name} must be a non-negative number, got ${value}`);
        process.exit(2);
    }
    return n;
}

const config = {
    smoke,
    minutes: envNumber("NONA_SOAK_MINUTES", smoke ? 5 : 180),
    warmupMinutes: envNumber("NONA_SOAK_WARMUP_MINUTES", smoke ? 1 : 10),
    sampleSeconds: envNumber("NONA_SOAK_SAMPLE_SECONDS", smoke ? 10 : 60),
    connections: envNumber("NONA_SOAK_CONNECTIONS", 32),
    pauseMs: envNumber("NONA_SOAK_PAUSE_MS", 0),
    // Comparison window of the RSS and latency criteria: 30 minutes, or a
    // quarter of the time after warm-up in shorter runs.
    windowMinutes: 0,
    requestTimeoutMs: 30000,
    settleSeconds: 8,
    limits: {
        rssGrowth: 0.1,
        p99Growth: 0.2,
        p99SlackMs: 0.5,
        socketSlack: 2,
        fdSlack: 4,
        resourceSlack: 2,
    },
};
config.windowMinutes = Math.min(
    30,
    Math.max(0, config.minutes - config.warmupMinutes) / 4,
);
if (config.minutes <= config.warmupMinutes) {
    console.error("NONA_SOAK_MINUTES must be larger than the warm-up");
    process.exit(2);
}

const PATHS = {
    text: "/text",
    close: "/text",
    json: "/json",
    big: "/big",
    missing: "/missing",
    throw: "/throw",
};

// The request mix, in percent. NONA_SOAK_MIX=text=1,json=1 replaces it (to
// isolate a route).
let mix = [
    ["text", 35],
    ["json", 28],
    ["big", 5],
    ["echo", 12],
    ["close", 10],
    ["slow", 4],
    ["missing", 3],
    ["throw", 3],
];
if (process.env.NONA_SOAK_MIX) {
    mix = process.env.NONA_SOAK_MIX.split(",").map((item) => {
        const [name, weight] = item.split("=");
        return [name.trim(), Number(weight ?? 1)];
    });
    for (const [name, weight] of mix)
        if (!PATHS[name] && name !== "echo" && name !== "slow") {
            console.error(`unknown route ${name} in NONA_SOAK_MIX`);
            process.exit(2);
        } else if (!(weight > 0)) {
            console.error(`bad weight for ${name} in NONA_SOAK_MIX`);
            process.exit(2);
        }
}
const mixTotal = mix.reduce((sum, [, weight]) => sum + weight, 0);
function pickRoute() {
    let r = Math.random() * mixTotal;
    for (const [name, weight] of mix) if ((r -= weight) < 0) return name;
    return mix[0][0];
}

const BIG = Buffer.alloc(1048576, "b");
const TEXT = "Hello, soak!";
const SLOW_ABORT_BYTES = 32768;

// Latency histogram with buckets about 1% wide, from 1 µs to minutes.
const BUCKET_BASE = Math.log(1.01);
const BUCKETS = 2000;
function newHistogram() {
    return { counts: new Uint32Array(BUCKETS), n: 0 };
}
function record(histogram, ms) {
    const us = Math.max(1, ms * 1000);
    const i = Math.min(BUCKETS - 1, Math.ceil(Math.log(us) / BUCKET_BASE));
    histogram.counts[i]++;
    histogram.n++;
}
function merge(histograms) {
    const out = newHistogram();
    for (const h of histograms) {
        for (let i = 0; i < BUCKETS; i++) out.counts[i] += h.counts[i];
        out.n += h.n;
    }
    return out;
}
function quantile(histogram, q) {
    if (histogram.n === 0) return null;
    const target = Math.ceil(histogram.n * q);
    let seen = 0;
    for (let i = 0; i < BUCKETS; i++) {
        seen += histogram.counts[i];
        if (seen >= target) return Math.exp(i * BUCKET_BASE) / 1000;
    }
    return null;
}

function median(values) {
    const v = values.filter((x) => x !== null && x !== undefined);
    if (v.length === 0) return null;
    v.sort((a, b) => a - b);
    const m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function freePort() {
    return new Promise((resolvePort, reject) => {
        const s = net.createServer();
        s.on("error", reject);
        s.listen(0, "127.0.0.1", () => {
            const { port } = s.address();
            s.close(() => resolvePort(port));
        });
    });
}

function gitCommit() {
    try {
        return execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: root,
            encoding: "utf8",
        }).trim();
    } catch {
        return null;
    }
}

// --- Build and start the server -------------------------------------------

mkdirSync(outDir, { recursive: true });
const target = process.platform === "win32" ? "win32-x64" : "linux-x64";
let serverPath = process.env.NONA_SOAK_SERVER;
if (!serverPath) {
    const buildDir = join(root, "bench", "results");
    mkdirSync(buildDir, { recursive: true });
    serverPath = join(
        buildDir,
        process.platform === "win32" ? "soak-server.exe" : "soak-server",
    );
    console.log(`building the soak server for ${target}`);
    const build = spawnSync(
        process.execPath,
        [
            join(root, "dist", "cli.js"),
            "build",
            join(root, "bench", "http", "soak-server.mjs"),
            "-o",
            serverPath,
            "--target",
            target,
            "--module",
        ],
        { stdio: "inherit" },
    );
    if (build.status !== 0) {
        console.error("building the soak server failed (run npm run build?)");
        process.exit(1);
    }
}

let loadStart = 0;
const port = await freePort();
const serverLog = [];
// A .mjs/.js server runs under Node.js, to compare with Nona.
const child = /\.[cm]?js$/.test(serverPath)
    ? spawn(process.execPath, [serverPath, String(port)], {
          stdio: ["ignore", "pipe", "pipe"],
      })
    : spawn(serverPath, [String(port)], {
          stdio: ["ignore", "pipe", "pipe"],
      });
let stopping = false;
let crash = null;
const childExited = new Promise((r) => child.on("exit", r));
child.on("exit", (code, signal) => {
    if (!stopping) {
        crash = { code, signal, atSeconds: Math.round(elapsedSeconds()) };
        if (loadStart) discardNearCrash();
        // Windows exceptions, e.g. 0xc0000005 for an access violation.
        if (code > 255) crash.hex = "0x" + code.toString(16);
        console.error(
            `the server exited during the run (code ${code}, signal ${signal})`,
        );
    }
});
child.on("error", (error) => {
    crash = { error: error.message, atSeconds: elapsedSeconds() };
});
function keepLog(chunk) {
    for (const line of chunk.toString().split(/\r?\n/))
        if (line && serverLog.length < 200) serverLog.push(line);
}
child.stdout.on("data", keepLog);
child.stderr.on("data", keepLog);
function killServer() {
    stopping = true;
    if (child.exitCode === null && child.signalCode === null) child.kill();
}
process.on("exit", killServer);
process.on("SIGINT", () => {
    console.error("interrupted");
    killServer();
    process.exit(130);
});

await new Promise((ready, reject) => {
    const timer = setTimeout(
        () => reject(new Error("the server did not print its ready line")),
        30000,
    );
    let text = "";
    child.stdout.on("data", (chunk) => {
        text += chunk;
        if (text.includes("ready")) {
            clearTimeout(timer);
            ready();
        }
    });
    child.on("exit", () => reject(new Error("the server exited at startup")));
}).catch((error) => {
    console.error(error.message);
    console.error(serverLog.join("\n"));
    killServer();
    process.exit(1);
});

// --- Load generator -------------------------------------------------------

const counters = {
    ok: 0,
    deliberate: { missing: 0, throw: 0, slowAborted: 0 },
    failed: 0,
    failures: {},
    // Failures in the NEAR_CRASH_MS before a crash: its consequences.
    nearCrash: {},
};
const failureExamples = [];
let interval = { requests: 0, deliberate: 0, failed: 0, hist: newHistogram() };
let jsonLength = null;
let running = false;

function elapsedSeconds() {
    return loadStart ? (performance.now() - loadStart) / 1000 : 0;
}

// Failures of the last NEAR_CRASH_MS, so that the ones a crash causes before
// its exit event arrives (ECONNRESET, ECONNREFUSED) can be taken back.
const NEAR_CRASH_MS = 2000;
let recentFailures = [];

function fail(route, reason) {
    // Requests that fail after a crash are its consequence, not new failures.
    if (crash !== null) return;
    const now = performance.now();
    counters.failed++;
    interval.failed++;
    const key = `${route}: ${reason}`;
    counters.failures[key] = (counters.failures[key] || 0) + 1;
    const example = { atSeconds: elapsedSeconds(), route, reason };
    if (failureExamples.length < 20) failureExamples.push(example);
    recentFailures = recentFailures.filter((f) => now - f.at <= NEAR_CRASH_MS);
    recentFailures.push({ at: now, key, example });
}

// Moves the failures recorded just before a crash to counters.nearCrash.
function discardNearCrash() {
    const now = performance.now();
    for (const f of recentFailures) {
        if (now - f.at > NEAR_CRASH_MS) continue;
        counters.failed--;
        interval.failed = Math.max(0, interval.failed - 1);
        if (--counters.failures[f.key] === 0) delete counters.failures[f.key];
        counters.nearCrash[f.key] = (counters.nearCrash[f.key] || 0) + 1;
        const i = failureExamples.indexOf(f.example);
        if (i >= 0) failureExamples.splice(i, 1);
    }
    recentFailures = [];
}

function checkResponse(route, res, body) {
    const status = res.statusCode;
    switch (route) {
        case "text":
        case "close":
            if (status !== 200) return `status ${status}`;
            if (body.toString() !== TEXT) return "wrong body";
            return null;
        case "json": {
            if (status !== 200) return `status ${status}`;
            if (jsonLength === null) jsonLength = body.length;
            if (body.length !== jsonLength) return "wrong body length";
            let doc;
            try {
                doc = JSON.parse(body.toString());
            } catch {
                return "invalid JSON";
            }
            if (!Array.isArray(doc.items) || doc.items.length !== 24)
                return "wrong JSON content";
            return null;
        }
        case "big":
            if (status !== 200) return `status ${status}`;
            if (!/chunked/i.test(res.headers["transfer-encoding"] || ""))
                return "not chunked";
            if (!body.equals(BIG)) return `wrong body (${body.length} bytes)`;
            return null;
        case "missing":
            return status === 404 ? null : `status ${status}`;
        case "throw":
            return status === 500 ? null : `status ${status}`;
    }
    return `unknown route ${route}`;
}

// One request on the worker's keep-alive agent.
function request(agent, route) {
    return new Promise((done) => {
        const started = performance.now();
        let settled = false;
        const settle = (error) => {
            if (settled) return;
            settled = true;
            interval.requests++;
            if (error) fail(route, error);
            else {
                record(interval.hist, performance.now() - started);
                if (route === "missing" || route === "throw") {
                    counters.deliberate[route]++;
                    interval.deliberate++;
                } else counters.ok++;
            }
            done();
        };
        const options = {
            host: "127.0.0.1",
            port,
            agent,
            method: "GET",
            path: PATHS[route],
            headers: {},
        };
        let payload = null;
        if (route === "echo") {
            payload = randomBytes(1024 + Math.floor(Math.random() * 64512));
            options.method = "POST";
            options.path = "/echo";
            options.headers["Content-Type"] = "application/octet-stream";
            options.headers["Content-Length"] = payload.length;
        }
        if (route === "close") options.headers.Connection = "close";
        const req = http.request(options, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("error", (e) => settle(`response error ${e.code || e}`));
            res.on("aborted", () => settle("response aborted"));
            res.on("end", () => {
                const body = Buffer.concat(chunks);
                if (route === "echo") {
                    if (res.statusCode !== 200)
                        settle(`status ${res.statusCode}`);
                    else if (!body.equals(payload))
                        settle(`wrong echo (${body.length}/${payload.length})`);
                    else settle(null);
                } else settle(checkResponse(route, res, body));
            });
        });
        req.setTimeout(config.requestTimeoutMs, () => {
            settle("timeout");
            req.destroy();
        });
        req.on("error", (e) => settle(`socket error ${e.code || e.message}`));
        req.end(payload);
    });
}

// A slow client: reads part of /slow on its own connection and disconnects.
function slowClient() {
    return new Promise((done) => {
        let settled = false;
        const settle = (error) => {
            if (settled) return;
            settled = true;
            interval.requests++;
            if (error) fail("slow", error);
            else {
                counters.deliberate.slowAborted++;
                interval.deliberate++;
            }
            done();
        };
        const req = http.get(
            { host: "127.0.0.1", port, path: "/slow", agent: false },
            (res) => {
                if (res.statusCode !== 200) {
                    settle(`status ${res.statusCode}`);
                    req.destroy();
                    return;
                }
                let received = 0;
                res.on("data", (c) => {
                    received += c.length;
                    if (received >= SLOW_ABORT_BYTES && !settled) {
                        settle(null);
                        req.destroy();
                    }
                });
                res.on("error", () => {});
                res.on("end", () => settle("ended before the abort"));
            },
        );
        req.setTimeout(config.requestTimeoutMs, () => {
            settle("timeout");
            req.destroy();
        });
        req.on("error", (e) => settle(`socket error ${e.code || e.message}`));
    });
}

const agents = [];
async function worker() {
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    agents.push(agent);
    while (running) {
        const route = pickRoute();
        if (route === "slow") await slowClient();
        else await request(agent, route);
        if (config.pauseMs) await sleep(config.pauseMs);
    }
}

// --- Sampling -------------------------------------------------------------

function fetchStats() {
    return new Promise((done) => {
        const req = http.get(
            { host: "127.0.0.1", port, path: "/__stats", agent: false },
            (res) => {
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("error", () => done(null));
                res.on("end", () => {
                    try {
                        done(JSON.parse(Buffer.concat(chunks).toString()));
                    } catch {
                        done(null);
                    }
                });
            },
        );
        req.setTimeout(10000, () => req.destroy());
        req.on("error", () => done(null));
    });
}

function procRss() {
    if (process.platform !== "linux") return null;
    try {
        const status = readFileSync(`/proc/${child.pid}/status`, "utf8");
        const m = /VmRSS:\s*(\d+)\s*kB/.exec(status);
        return m ? Number(m[1]) * 1024 : null;
    } catch {
        return null;
    }
}

function procFds() {
    if (process.platform !== "linux") return null;
    try {
        return readdirSync(`/proc/${child.pid}/fd`).length;
    } catch {
        return null;
    }
}

const samples = [];
const histograms = [];
let lastSampleAt = 0;
async function sample(phase) {
    const now = performance.now();
    const seconds = lastSampleAt ? (now - lastSampleAt) / 1000 : 0;
    lastSampleAt = now;
    const current = interval;
    interval = { requests: 0, deliberate: 0, failed: 0, hist: newHistogram() };
    const stats = await fetchStats();
    if (!stats && phase !== "baseline" && crash === null)
        fail("__stats", "no statistics");
    const rssProc = procRss();
    const s = {
        phase,
        time: new Date().toISOString(),
        t: Math.round(elapsedSeconds()),
        rss: rssProc ?? stats?.memory?.rss ?? null,
        rssStats: stats?.memory?.rss ?? null,
        maxRss: stats?.maxRss ?? null,
        heapUsed: stats?.memory?.heapUsed ?? null,
        heapTotal: stats?.memory?.heapTotal ?? null,
        external: stats?.memory?.external ?? null,
        fds: procFds(),
        openSockets: stats?.openSockets ?? null,
        activeResources: stats?.activeResources ?? null,
        serverRequests: stats?.requests ?? null,
        serverErrors: stats?.errors ?? null,
        uncaught: stats?.uncaught ?? null,
        requests: current.requests,
        rps:
            seconds > 0
                ? Math.round((current.requests / seconds) * 10) / 10
                : 0,
        p50: round(quantile(current.hist, 0.5)),
        p99: round(quantile(current.hist, 0.99)),
        deliberate: current.deliberate,
        failed: current.failed,
    };
    samples.push(s);
    histograms.push(current.hist);
    const mb = (v) => (v === null ? "-" : (v / 1048576).toFixed(1));
    console.log(
        `[${phase} ${(s.t / 60).toFixed(1)} min] rss ${mb(s.rss)} MB, heap ${mb(s.heapUsed)}/${mb(s.heapTotal)} MB, ` +
            `fds ${s.fds ?? "-"}, sockets ${s.openSockets ?? "-"}, ${s.rps} req/s, ` +
            `p50 ${s.p50 ?? "-"} ms, p99 ${s.p99 ?? "-"} ms, deliberate ${s.deliberate}, failed ${s.failed}`,
    );
    return s;
}

function round(v) {
    return v === null ? null : Math.round(v * 1000) / 1000;
}

// --- Run ------------------------------------------------------------------

console.log(
    `soak: ${config.minutes} min (warm-up ${config.warmupMinutes} min), ` +
        `${config.connections} connections, sample every ${config.sampleSeconds} s, server on port ${port}`,
);
await sleep(1000);
const baseline = await sample("baseline");
loadStart = performance.now();
lastSampleAt = loadStart;
running = true;
const workers = [];
for (let i = 0; i < config.connections; i++) workers.push(worker());

const endAt = loadStart + config.minutes * 60000;
while (performance.now() < endAt && crash === null) {
    const next = Math.min(endAt, lastSampleAt + config.sampleSeconds * 1000);
    while (performance.now() < next && crash === null)
        await sleep(Math.min(1000, next - performance.now()));
    if (crash !== null) break;
    await sample("load");
}
running = false;
await Promise.all(workers);
for (const agent of agents) agent.destroy();
const loadSeconds = elapsedSeconds();
if (crash === null) await sleep(config.settleSeconds * 1000);
const after = crash === null ? await sample("after") : null;
stopping = true;
killServer();
await Promise.race([childExited, sleep(5000)]);

// --- Criteria -------------------------------------------------------------

const warmup = config.warmupMinutes * 60;
const windowSeconds = config.windowMinutes * 60;
const loadSamples = samples
    .map((s, i) => ({ s, h: histograms[i] }))
    .filter(({ s }) => s.phase === "load");
// After a crash the windows would overlap: the RSS and latency criteria are
// not evaluated (and fail).
const fullRun = crash === null;
const missing = fullRun
    ? "not enough samples"
    : "not evaluated: the run ended early";
const headWindow = loadSamples.filter(
    ({ s }) => fullRun && s.t > warmup && s.t <= warmup + windowSeconds + 1,
);
const tailWindow = loadSamples.filter(
    ({ s }) => fullRun && s.t >= loadSeconds - windowSeconds - 1,
);
const criteria = [];
function criterion(name, pass, value, limit) {
    criteria.push({ name, pass, value, limit });
}

criterion(
    "no crash",
    crash === null,
    crash === null ? "the server ran to the end" : JSON.stringify(crash),
    "no exit before the end",
);
criterion(
    "no failed requests",
    counters.failed === 0,
    String(counters.failed),
    "0 (404, 500 and aborted /slow are deliberate)",
);

const rssHead = median(headWindow.map(({ s }) => s.rss));
const rssTail = median(tailWindow.map(({ s }) => s.rss));
const rssGrowth =
    rssHead && rssTail !== null ? (rssTail - rssHead) / rssHead : null;
criterion(
    "RSS growth after warm-up",
    rssGrowth !== null && rssGrowth < config.limits.rssGrowth,
    rssGrowth === null
        ? missing
        : `${(rssGrowth * 100).toFixed(1)}% (${(rssHead / 1048576).toFixed(1)} → ${(rssTail / 1048576).toFixed(1)} MB, medians)`,
    `< ${config.limits.rssGrowth * 100}%`,
);

function handleCheck(field, slack) {
    if (!after || baseline[field] === null || after[field] === null)
        return null;
    return {
        pass: after[field] <= baseline[field] + slack,
        text: `${field} ${baseline[field]} → ${after[field]}`,
    };
}
const handles = [
    handleCheck("openSockets", config.limits.socketSlack),
    handleCheck("fds", config.limits.fdSlack),
    handleCheck("activeResources", config.limits.resourceSlack),
].filter(Boolean);
criterion(
    "handles back to the baseline",
    after !== null && handles.length > 0 && handles.every((h) => h.pass),
    after === null
        ? "no post-load sample"
        : handles.map((h) => h.text).join(", "),
    `baseline + ${config.limits.socketSlack} sockets, + ${config.limits.fdSlack} fds, + ${config.limits.resourceSlack} resources`,
);

const p99Head = quantile(merge(headWindow.map(({ h }) => h)), 0.99);
const p99Tail = quantile(merge(tailWindow.map(({ h }) => h)), 0.99);
const p99Growth = p99Head && p99Tail !== null ? p99Tail / p99Head - 1 : null;
criterion(
    "p99 latency stable",
    p99Growth !== null &&
        (p99Growth <= config.limits.p99Growth ||
            p99Tail - p99Head <= config.limits.p99SlackMs),
    p99Growth === null
        ? missing
        : `${p99Head.toFixed(2)} → ${p99Tail.toFixed(2)} ms (${p99Growth >= 0 ? "+" : ""}${(p99Growth * 100).toFixed(1)}%)`,
    `last ${+config.windowMinutes.toFixed(2)} min ≤ first ${+config.windowMinutes.toFixed(2)} min after warm-up + ${config.limits.p99Growth * 100}% (or + ${config.limits.p99SlackMs} ms)`,
);

const pass = criteria.every((c) => c.pass);
const totalRequests =
    counters.ok +
    counters.deliberate.missing +
    counters.deliberate.throw +
    counters.deliberate.slowAborted +
    counters.failed;
const summary = {
    pass,
    loadSeconds: Math.round(loadSeconds),
    requests: totalRequests,
    ok: counters.ok,
    deliberate: counters.deliberate,
    failed: counters.failed,
    failures: counters.failures,
    failuresNearCrash: counters.nearCrash,
    failureExamples,
    averageRps:
        Math.round((totalRequests / Math.max(1, loadSeconds)) * 10) / 10,
    rssHead,
    rssTail,
    p99Head: round(p99Head),
    p99Tail: round(p99Tail),
    baseline: {
        openSockets: baseline.openSockets,
        fds: baseline.fds,
        activeResources: baseline.activeResources,
    },
    after: after && {
        openSockets: after.openSockets,
        fds: after.fds,
        activeResources: after.activeResources,
    },
};
const report = {
    test: "http-soak",
    config,
    mix: Object.fromEntries(mix),
    machine: {
        platform: process.platform,
        release: os.release(),
        arch: process.arch,
        cpu: os.cpus()[0]?.model ?? null,
        cpus: os.cpus().length,
        memory: os.totalmem(),
    },
    node: process.version,
    commit: gitCommit(),
    target,
    started: baseline.time,
    crash,
    summary,
    criteria,
    samples,
    serverLog,
};
writeFileSync(join(outDir, "http-soak.json"), JSON.stringify(report, null, 2));

const mb = (v) =>
    v === null || v === undefined ? "-" : (v / 1048576).toFixed(1);
const md = [];
md.push(`# HTTP soak test: ${pass ? "PASS" : "FAIL"}`, "");
md.push(
    `${report.started}, commit ${report.commit ?? "?"}, ${target}, Node.js ${report.node} load generator, ` +
        `${report.machine.cpu} (${report.machine.cpus} CPUs), ${(report.machine.memory / 1073741824).toFixed(1)} GB.`,
    "",
);
md.push(
    `${config.minutes} min of load (warm-up ${config.warmupMinutes} min, comparison windows ${config.windowMinutes} min), ` +
        `${config.connections} connections, pause ${config.pauseMs} ms, a sample every ${config.sampleSeconds} s. ` +
        `${totalRequests} requests (${summary.averageRps} req/s): ${counters.ok} ok, ` +
        `${counters.deliberate.missing} 404, ${counters.deliberate.throw} 500, ` +
        `${counters.deliberate.slowAborted} aborted /slow, ${counters.failed} failed.`,
    "",
);
md.push(
    "| Criterion | Result | Limit | Verdict |",
    "| --- | --- | --- | --- |",
);
for (const c of criteria)
    md.push(
        `| ${c.name} | ${c.value} | ${c.limit} | ${c.pass ? "pass" : "**FAIL**"} |`,
    );
md.push("");
if (counters.failed > 0) {
    md.push("Failures:", "");
    for (const [key, n] of Object.entries(counters.failures))
        md.push(`- ${key}: ${n}`);
    md.push("");
}
if (Object.keys(counters.nearCrash).length > 0) {
    md.push(
        `Not counted: failures in the ${NEAR_CRASH_MS / 1000} s before the crash (its consequences):`,
        "",
    );
    for (const [key, n] of Object.entries(counters.nearCrash))
        md.push(`- ${key}: ${n}`);
    md.push("");
}
md.push(
    "| Phase | Min | RSS MB | max RSS MB | heapUsed MB | heapTotal MB | external MB | fds | sockets | resources | req/s | p50 ms | p99 ms | deliberate | failed |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
);
for (const s of samples)
    md.push(
        `| ${s.phase} | ${(s.t / 60).toFixed(1)} | ${mb(s.rss)} | ${mb(s.maxRss)} | ${mb(s.heapUsed)} | ${mb(s.heapTotal)} | ${mb(s.external)} | ` +
            `${s.fds ?? "-"} | ${s.openSockets ?? "-"} | ${s.activeResources ?? "-"} | ${s.rps} | ${s.p50 ?? "-"} | ${s.p99 ?? "-"} | ${s.deliberate} | ${s.failed} |`,
    );
md.push("");
writeFileSync(join(outDir, "http-soak.md"), md.join("\n"));

console.log("");
for (const c of criteria)
    console.log(
        `${c.pass ? "pass" : "FAIL"}  ${c.name}: ${c.value} (limit ${c.limit})`,
    );
console.log(`\n${pass ? "PASS" : "FAIL"}; reports in ${outDir}`);
process.exit(pass ? 0 : 1);
