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
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    checkResponse,
    newHistogram,
    record,
    quantile,
    evaluateRun,
} from "./http-soak-support.mjs";
import {
    readConfig,
    serverIdentity,
    machineIdentity,
    acceptancePass,
    waitForReady,
    writeFailureReceipt,
    hashFile,
} from "./http-soak-evidence.mjs";

const receipt = {
    phase: "configuration",
    started: new Date().toISOString(),
    machine: machineIdentity(),
    samples: [],
    serverLog: [],
};
const cliArgs = process.argv.slice(2);
const outIndex = cliArgs.indexOf("--out");
const outDir = resolve(
    outIndex >= 0 && cliArgs[outIndex + 1]
        ? cliArgs[outIndex + 1]
        : "soak-report",
);
let cleanup = async () => {};
let terminating = false;
async function failure(error, status = 1) {
    if (terminating) return;
    terminating = true;
    console.error(error.stack ?? error);
    try {
        await cleanup();
    } catch (cleanupError) {
        console.error("server cleanup:", cleanupError);
    }
    try {
        writeFailureReceipt(outDir, receipt, error);
    } catch (reportError) {
        console.error("could not write failure receipt:", reportError);
    }
    process.exit(status);
}
for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () =>
        failure(
            Object.assign(new Error("interrupted by " + signal), { signal }),
            signal === "SIGINT" ? 130 : 143,
        ),
    );

async function main() {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const args = process.argv.slice(2);
    const smoke = args.includes("--smoke");
    if (outIndex >= 0 && !cliArgs[outIndex + 1])
        throw new Error("--out requires a directory");
    const config = readConfig(process.env, smoke);
    receipt.config = config;
    receipt.commit = gitCommit();
    const sourcePath = join(root, "bench", "http", "soak-server.mjs");
    receipt.workloadSource = { path: sourcePath, sha256: hashFile(sourcePath) };
    try {
        receipt.checkoutDirty =
            execFileSync(
                "git",
                ["status", "--porcelain", "--untracked-files=no"],
                { cwd: root, encoding: "utf8" },
            ).trim() !== "";
    } catch {
        receipt.checkoutDirty = null;
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
                throw new RangeError(`unknown route ${name} in NONA_SOAK_MIX`);
            } else if (!Number.isFinite(weight) || !(weight > 0)) {
                throw new RangeError(`bad weight for ${name} in NONA_SOAK_MIX`);
            }
    }
    const mixTotal = mix.reduce((sum, [, weight]) => sum + weight, 0);
    function pickRoute() {
        let r = Math.random() * mixTotal;
        for (const [name, weight] of mix) if ((r -= weight) < 0) return name;
        return mix[0][0];
    }

    const SLOW_ABORT_BYTES = config.slowAbortBytes;

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
    const built = !serverPath;
    receipt.phase = "build";
    receipt.mix = Object.fromEntries(mix);
    function identify() {
        receipt.server = serverIdentity({
            serverPath,
            sourcePath,
            built,
            commit: receipt.commit,
            sourceCommit:
                resolve(serverPath) === sourcePath
                    ? receipt.commit
                    : (process.env.NONA_SOAK_SOURCE_COMMIT ?? null),
            target,
            compilerPath: join(root, "dist", "cli.js"),
        });
    }
    if (serverPath) {
        serverPath = resolve(serverPath);
        identify();
    }
    if (!serverPath) {
        const buildDir = join(root, "bench", "results");
        mkdirSync(buildDir, { recursive: true });
        serverPath = join(
            buildDir,
            process.platform === "win32" ? "soak-server.exe" : "soak-server",
        );
        identify();
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
            { encoding: "utf8" },
        );
        receipt.serverLog.push(build.stdout ?? "", build.stderr ?? "");
        process.stdout.write(build.stdout ?? "");
        process.stderr.write(build.stderr ?? "");
        if (build.error) throw build.error;
        if (build.status !== 0)
            throw Object.assign(
                new Error(
                    "building the soak server failed (run npm run build?)",
                ),
                { code: build.status, signal: build.signal },
            );
    }

    identify();
    receipt.phase = "startup";
    let loadStart = 0;
    const port = await freePort();
    const serverLog = receipt.serverLog;
    // A .mjs/.js server runs under Node.js, to compare with Nona.
    const child = /\.[cm]?js$/i.test(serverPath)
        ? spawn(process.execPath, [serverPath, String(port)], {
              stdio: ["ignore", "pipe", "pipe"],
          })
        : spawn(serverPath, [String(port)], {
              stdio: ["ignore", "pipe", "pipe"],
          });
    receipt.server.pid = child.pid ?? null;
    receipt.server.port = port;
    let stopping = false;
    let crash = null;
    const childClosed = new Promise((r) => child.on("close", r));
    child.on("exit", (code, signal) => {
        if (!stopping) {
            crash = { code, signal, atSeconds: Math.round(elapsedSeconds()) };
            receipt.crash = crash;
            if (loadStart) discardNearCrash();
            // Windows exceptions, e.g. 0xc0000005 for an access violation.
            if (code > 255) crash.hex = "0x" + code.toString(16);
            console.error(
                `the server exited during the run (code ${code}, signal ${signal})`,
            );
        }
    });
    child.on("error", (error) => {
        crash = {
            error: error.message,
            code: error.code,
            atSeconds: elapsedSeconds(),
        };
        receipt.crash = crash;
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
    cleanup = async () => {
        killServer();
        let timer;
        try {
            await Promise.race([
                childClosed,
                new Promise((r) => {
                    timer = setTimeout(r, 5000);
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
        if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
            await childClosed;
        }
    };
    await waitForReady(child, port, config.startupTimeoutMs);
    receipt.phase = "baseline";

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
    receipt.failureExamples = failureExamples;
    let interval = {
        requests: 0,
        deliberate: 0,
        failed: 0,
        hist: newHistogram(),
    };
    receipt.counters = counters;
    const routeCounts = {};
    receipt.routeCounts = routeCounts;
    let running = false;

    function elapsedSeconds() {
        return loadStart ? (performance.now() - loadStart) / 1000 : 0;
    }

    // Failures of the last NEAR_CRASH_MS, so that the ones a crash causes before
    // its exit event arrives (ECONNRESET, ECONNREFUSED) can be taken back.
    const NEAR_CRASH_MS = config.nearCrashMs;
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
        recentFailures = recentFailures.filter(
            (f) => now - f.at <= NEAR_CRASH_MS,
        );
        recentFailures.push({ at: now, key, example });
    }

    // Moves the failures recorded just before a crash to counters.nearCrash.
    function discardNearCrash() {
        const now = performance.now();
        for (const f of recentFailures) {
            if (now - f.at > NEAR_CRASH_MS) continue;
            counters.failed--;
            interval.failed = Math.max(0, interval.failed - 1);
            if (--counters.failures[f.key] === 0)
                delete counters.failures[f.key];
            counters.nearCrash[f.key] = (counters.nearCrash[f.key] || 0) + 1;
            const i = failureExamples.indexOf(f.example);
            if (i >= 0) failureExamples.splice(i, 1);
        }
        recentFailures = [];
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
                    routeCounts[route] = (routeCounts[route] ?? 0) + 1;
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
                            settle(
                                `wrong echo (${body.length}/${payload.length})`,
                            );
                        else settle(null);
                    } else settle(checkResponse(route, res, body));
                });
            });
            req.setTimeout(config.requestTimeoutMs, () => {
                settle("timeout");
                req.destroy();
            });
            req.on("error", (e) =>
                settle(`socket error ${e.code || e.message}`),
            );
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
                    routeCounts.slow = (routeCounts.slow ?? 0) + 1;
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
            req.on("error", (e) =>
                settle(`socket error ${e.code || e.message}`),
            );
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

    const samples = receipt.samples;
    const histograms = [];
    let lastSampleAt = 0;
    async function sample(phase) {
        const now = performance.now();
        const seconds = lastSampleAt ? (now - lastSampleAt) / 1000 : 0;
        const intervalStart =
            loadStart && lastSampleAt ? (lastSampleAt - loadStart) / 1000 : 0;
        const intervalEnd = loadStart ? (now - loadStart) / 1000 : 0;
        lastSampleAt = now;
        const current = interval;
        interval = {
            requests: 0,
            deliberate: 0,
            failed: 0,
            hist: newHistogram(),
        };
        const stats = await fetchStats();
        if (!stats && phase !== "baseline" && crash === null)
            fail("__stats", "no statistics");
        const rssProc = procRss();
        const s = {
            phase,
            time: new Date().toISOString(),
            t: Math.round(elapsedSeconds()),
            intervalStart,
            intervalEnd,
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
        // An interrupted job still has the most recent complete sample on disk.
        writeFailureReceipt(
            outDir,
            receipt,
            new Error("run incomplete: final criteria not evaluated yet"),
        );
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
    await sleep(config.baselineSettleSeconds * 1000);
    const baseline = await sample("baseline");
    loadStart = performance.now();
    lastSampleAt = loadStart;
    running = true;
    receipt.phase = "load";
    const workers = [];
    for (let i = 0; i < config.connections; i++) workers.push(worker());

    const endAt = loadStart + config.minutes * 60000;
    while (performance.now() < endAt && crash === null) {
        const next = Math.min(
            endAt,
            lastSampleAt + config.sampleSeconds * 1000,
        );
        while (performance.now() < next && crash === null)
            await sleep(Math.min(1000, next - performance.now()));
        if (crash !== null) break;
        await sample("load");
    }
    running = false;
    await Promise.all(workers);
    for (const agent of agents) agent.destroy();
    const loadSeconds = elapsedSeconds();
    receipt.phase = "settle";
    if (crash === null) await sleep(config.settleSeconds * 1000);
    const after = crash === null ? await sample("after") : null;
    stopping = true;
    await cleanup();

    // --- Criteria -------------------------------------------------------------

    const { criteria, summary } = evaluateRun({
        config,
        samples,
        histograms,
        crash,
        counters,
        baseline,
        after,
        loadSeconds,
        failureExamples,
    });
    criteria.push({
        name: "configured routes covered",
        pass: mix.every(([route]) => routeCounts[route] > 0),
        value: JSON.stringify(routeCounts),
        limit: "at least one successful request on every configured route",
    });
    summary.pass = criteria.every((c) => c.pass);
    const pass = summary.pass;
    const totalRequests = summary.requests;
    summary.acceptancePass = acceptancePass({
        config,
        server: receipt.server,
        mix: Object.fromEntries(mix),
        routeCounts,
        summary,
    });
    receipt.summary = summary;
    receipt.phase = "complete";
    const report = {
        test: "http-soak",
        config,
        mix: Object.fromEntries(mix),
        machine: receipt.machine,
        node: process.version,
        commit: receipt.commit,
        checkoutDirty: receipt.checkoutDirty,
        workloadSource: receipt.workloadSource,
        server: receipt.server,
        routeCounts,
        target: receipt.server.target,
        started: baseline.time,
        crash,
        summary,
        criteria,
        samples,
        serverLog,
    };
    writeFileSync(
        join(outDir, "http-soak.json"),
        JSON.stringify(report, null, 2),
    );

    const mb = (v) =>
        v === null || v === undefined ? "-" : (v / 1048576).toFixed(1);
    const md = [];
    md.push(
        `# HTTP soak test: ${pass ? "PASS (configured run)" : "FAIL"}`,
        "",
        `Native three-hour acceptance: ${summary.acceptancePass ? "PASS" : "NOT SATISFIED"}.`,
        "",
        `Server identity: ${JSON.stringify(report.server)}`,
        "",
    );
    md.push(
        `${report.started}, commit ${report.commit ?? "?"}, ${report.server.kind} (${report.target ?? "no native target"}), Node.js ${report.node} load generator, ` +
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
    return pass ? 0 : 1;
}

main()
    .then((code) => {
        process.exitCode = code;
    })
    .catch((error) => failure(error, error instanceof RangeError ? 2 : 1));
