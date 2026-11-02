// Diagnostic only: no product repair and no automatic issue closure.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    appendFileSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import http from "node:http";
import net from "node:net";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { referenceBlob, serverSource } from "./http-crash-fixture.mjs";
import {
    diagnosticShardAcceptance,
    acceptanceFiles,
} from "./http-crash-acceptance.mjs";
import { diagnosticArgs, shardPlan } from "./http-crash-plan.mjs";
export { diagnosticAcceptance } from "./http-crash-acceptance.mjs";

export const hashFile = (file) =>
    createHash("sha256").update(readFileSync(file)).digest("hex");
const save = (file, value) =>
    writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

export { trialMatrix } from "./http-crash-plan.mjs";
export function classifyTermination(result, workload, ready) {
    if (result.error) return "infrastructure-error";
    const code = result.code === null ? null : result.code >>> 0;
    if (
        (code !== null && code >= 0x80000000) ||
        ["SIGSEGV", "SIGBUS", "SIGILL", "SIGABRT"].includes(result.signal)
    )
        return "native-fault";
    if (result.reason === "aborted") return "interrupted";
    if (!ready)
        return result.reason === "deadline"
            ? "startup-timeout"
            : "startup-failure";
    if (result.reason === "deadline" || workload.hangs) return "hang";
    if (!result.reason) return "unexpected-exit";
    if (workload.wrongOutput) return "wrong-output";
    if (workload.errors) return "client-error";
    return "observed-no-fault";
}

// Every subprocess is direct (no shell/grandchildren). Logs are written as they
// arrive, including on early exit; memory/log volume is bounded independently.
export function supervise(
    command,
    args,
    { directory, timeoutMs, env, signal, onLine },
) {
    mkdirSync(directory, { recursive: true });
    const started = Date.now();
    const child = spawn(command, args, {
        env: env ?? process.env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
    });
    let reason = null;
    let error = null;
    const bytes = { stdout: 0, stderr: 0 };
    const dropped = { stdout: 0, stderr: 0 };
    for (const stream of ["stdout", "stderr"]) {
        let pending = "";
        writeFileSync(join(directory, stream + ".log"), "");
        child[stream].on("data", (data) => {
            const room = Math.max(0, 4 * 1024 * 1024 - bytes[stream]);
            const kept = data.subarray(0, room);
            appendFileSync(join(directory, stream + ".log"), kept);
            bytes[stream] += kept.length;
            dropped[stream] += data.length - kept.length;
            pending += data.toString();
            let end;
            while ((end = pending.indexOf("\n")) >= 0) {
                onLine?.(pending.slice(0, end).trim(), stream);
                pending = pending.slice(end + 1);
            }
            if (pending.length > 65536) pending = pending.slice(-65536);
        });
    }
    const stop = (why) => {
        if (child.exitCode === null && child.signalCode === null) {
            reason ??= why;
            child.kill("SIGKILL");
        }
    };
    const aborted = () => stop("aborted");
    signal?.addEventListener("abort", aborted, { once: true });
    // A synchronous exit fallback covers an uncaught driver error as well.
    const onExit = () => stop("driver-exit");
    process.on("exit", onExit);
    const timer = setTimeout(() => stop("deadline"), timeoutMs);
    const done = new Promise((done) => {
        child.on("error", (e) => {
            error = { name: e.name, code: e.code, message: e.message };
        });
        child.on("close", (code, childSignal) => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", aborted);
            process.removeListener("exit", onExit);
            const result = {
                pid: child.pid ?? null,
                code,
                signal: childSignal,
                hex: code === null ? null : "0x" + (code >>> 0).toString(16),
                reason,
                error,
                elapsedMs: Date.now() - started,
                dropped,
            };
            save(join(directory, "termination.json"), result);
            done(result);
        });
    });
    if (signal?.aborted) aborted();
    return { child, done, stop };
}

async function freePort() {
    const socket = net.createServer();
    await new Promise((done, reject) => {
        socket.once("error", reject);
        socket.listen(0, "127.0.0.1", done);
    });
    const port = socket.address().port;
    await new Promise((done) => socket.close(done));
    return port;
}

export async function runTrial(spec, options) {
    const { directory, command, args = [], signal } = options;
    mkdirSync(directory, { recursive: true });
    const report = {
        ...spec,
        ...options.metadata,
        route: "/big",
        startedAt: new Date().toISOString(),
        status: "starting",
        settings: null,
        port: null,
        limits: {
            startupMs: options.startupMs ?? 60000,
            observationMs: options.observationMs ?? 8500,
            rounds: spec.state === "keepalive" ? 4 : 1,
            hardMs: options.hardMs ?? 90000,
        },
        workload: {
            requests: 0,
            completed: 0,
            wrongOutput: 0,
            errors: 0,
            hangs: 0,
        },
        termination: null,
    };
    const manifest = join(directory, "trial.json");
    save(manifest, report);
    const port = await freePort();
    report.port = port;
    const trace = (event) =>
        appendFileSync(
            join(directory, "client.jsonl"),
            JSON.stringify({ ms: Date.now() - started, ...event }) + "\n",
        );
    const started = Date.now();
    let markReady;
    const ready = new Promise((done) => {
        markReady = done;
    });
    const requests = new Set();
    const sockets = new Set();
    const observedSockets = new Map();
    const socketClosures = [];
    const observeSocket = (socket, client) => {
        if (observedSockets.has(socket)) return;
        const id = observedSockets.size + 1;
        observedSockets.set(socket, id);
        trace({ event: "client-socket", socket: id, client });
        socketClosures.push(
            new Promise((done) => {
                socket.once("close", (hadError) => {
                    trace({
                        event: "client-close",
                        socket: id,
                        client,
                        hadError,
                    });
                    done();
                });
            }),
        );
    };
    const agent = new http.Agent({
        keepAlive: true,
        maxSockets: spec.concurrency,
    });
    const child = supervise(command, [...args, String(port)], {
        directory,
        timeoutMs: report.limits.hardMs,
        signal,
        env: {
            ...(options.env ?? process.env),
            DIAG_LISTENERS: spec.listeners,
            DIAG_STATE: spec.state,
            DIAG_CHUNK_BYTES: String(spec.chunkBytes),
            DIAG_CHUNKS: String(spec.chunks),
        },
        onLine(line, stream) {
            if (stream !== "stdout") return;
            if (line.startsWith("diagnostic ")) {
                try {
                    const event = JSON.parse(line.slice(11));
                    if (event.event === "settings") {
                        report.settings = event;
                        save(manifest, report);
                    }
                } catch {
                    /* Raw line is retained even if invalid. */
                }
            }
            if (line === `ready ${port}`) markReady(true);
        },
    });
    trace({ event: "spawn", pid: child.child.pid, command, args });
    report.pid = child.child.pid;
    save(manifest, report);
    let startupTimer;
    let observationTimer;
    let stopping = false;
    let didReady = false;
    const request = (client, round) =>
        new Promise((done) => {
            report.workload.requests++;
            let finished = false;
            const finish = () => {
                if (finished) return;
                finished = true;
                requests.delete(req);
                done();
            };
            const req = http.get(
                { host: "127.0.0.1", port, path: "/big", agent },
                (res) => {
                    let bytes = 0;
                    let valid =
                        res.statusCode === 200 &&
                        res.headers["transfer-encoding"] === "chunked";
                    res.on("data", (data) => {
                        bytes += data.length;
                        for (const byte of data)
                            if (byte !== 98) {
                                valid = false;
                                break;
                            }
                    });
                    res.on("end", () => {
                        if (!valid || bytes !== spec.chunkBytes * spec.chunks)
                            report.workload.wrongOutput++;
                        report.workload.completed++;
                        trace({
                            event: "response",
                            client,
                            round,
                            bytes,
                            valid,
                            reused: req.reusedSocket,
                            status: res.statusCode,
                            headers: res.headers,
                        });
                        finish();
                    });
                    res.on("error", (error) => {
                        if (!stopping) report.workload.errors++;
                        trace({
                            event: "response-error",
                            client,
                            round,
                            name: error.name,
                            code: error.code,
                            message: error.message,
                        });
                        finish();
                    });
                },
            );
            requests.add(req);
            req.on("socket", (socket) => observeSocket(socket, client));
            req.on("error", (error) => {
                if (!stopping) report.workload.errors++;
                trace({
                    event: "request-error",
                    client,
                    round,
                    name: error.name,
                    code: error.code,
                    message: error.message,
                });
                finish();
            });
            req.setTimeout(Math.min(7000, report.limits.observationMs), () => {
                if (!stopping) report.workload.hangs++;
                trace({ event: "request-timeout", client, round });
                req.destroy();
            });
            trace({ event: "request", client, round });
        });
    try {
        didReady = await Promise.race([
            ready,
            child.done.then(() => false),
            new Promise((done) => {
                startupTimer = setTimeout(
                    () => done(false),
                    report.limits.startupMs,
                );
            }),
        ]);
        clearTimeout(startupTimer);
        if (!didReady) child.stop("deadline");
        else {
            const keepAlive = Number(report.settings?.keepAliveTimeout);
            const buffer = Number(report.settings?.keepAliveTimeoutBuffer);
            const timeoutWindow =
                keepAlive + (Number.isFinite(buffer) ? buffer : 0) + 1500;
            if (!options.observationMs && Number.isFinite(timeoutWindow))
                report.limits.observationMs = Math.min(
                    15000,
                    Math.max(8500, timeoutWindow),
                );
            report.timeoutWindowCovered =
                Number.isFinite(timeoutWindow) &&
                report.limits.observationMs >= timeoutWindow;
            report.status = "observing";
            save(manifest, report);
            const load = async () => {
                if (spec.state === "queued-timeout") {
                    // Pause reads so the peer retains output. Do not infer that
                    // a queue remains nonempty: the server trace is the evidence.
                    for (let i = 0; i < spec.concurrency; i++) {
                        const socket = net.connect(port, "127.0.0.1", () => {
                            socket.write(
                                "GET /big HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\n\r\n",
                            );
                            socket.pause();
                            trace({ event: "paused-peer", client: i });
                        });
                        sockets.add(socket);
                        observeSocket(socket, i);
                        socket.on("error", (error) => {
                            if (!stopping) report.workload.errors++;
                            trace({
                                event: "peer-error",
                                client: i,
                                name: error.name,
                                code: error.code,
                                message: error.message,
                            });
                        });
                        report.workload.requests++;
                    }
                } else {
                    // At most one outstanding request per client; bounded rounds.
                    await Promise.all(
                        Array.from(
                            { length: spec.concurrency },
                            async (_, client) => {
                                const rounds = report.limits.rounds;
                                for (
                                    let round = 0;
                                    round < rounds && !stopping;
                                    round++
                                ) {
                                    await request(client, round);
                                    await delay(5);
                                }
                            },
                        ),
                    );
                }
                // Idle and queued trials continue observing through the server's
                // actual timeout. Settings are reported, never assumed to be 5 s.
            };
            const loading = load().catch((error) => {
                report.driverError = String(error.stack ?? error);
                child.stop("driver-error");
            });
            await Promise.race([
                child.done,
                new Promise((done) => {
                    observationTimer = setTimeout(
                        done,
                        report.limits.observationMs,
                    );
                }),
            ]);
            if (["keepalive", "idle-timeout"].includes(spec.state))
                report.workload.hangs += requests.size;
            stopping = true;
            child.stop("observation-complete");
            for (const req of requests) req.destroy();
            for (const socket of sockets) socket.destroy();
            agent.destroy();
            await loading;
        }
    } finally {
        clearTimeout(startupTimer);
        clearTimeout(observationTimer);
        stopping = true;
        for (const req of requests) req.destroy();
        for (const socket of sockets) socket.destroy();
        agent.destroy();
        for (const socket of observedSockets.keys()) socket.destroy();
        await Promise.all(socketClosures);
        child.stop("driver-cleanup");
        report.termination = await child.done;
        report.verdict = classifyTermination(
            report.termination,
            report.workload,
            didReady,
        );
        if (
            ((didReady && !report.settings) || report.driverError) &&
            report.verdict !== "native-fault"
        )
            report.verdict = "infrastructure-error";
        report.status = "finished";
        report.elapsedMs = Date.now() - started;
        trace({ event: "termination", ...report.termination });
        save(manifest, report);
    }
    return report;
}

async function main() {
    // Heavy trials must never fall through to the owner's overflow runner.
    if (
        process.env.GITHUB_ACTIONS !== "true" ||
        process.env.RUNNER_ENVIRONMENT !== "github-hosted" ||
        process.platform !== "win32" ||
        process.arch !== "x64" ||
        !process.version.startsWith("v26.")
    )
        throw new Error(
            "Diagnostics require GitHub-hosted Windows x64 and Node 26",
        );
    const selection = diagnosticArgs(process.argv.slice(2));
    const { trials: matrix, ...shard } = shardPlan(selection.shard);
    const output = resolve(selection.directory);
    mkdirSync(output, { recursive: true });
    const controller = new AbortController();
    const abort = () => controller.abort();
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
    }).trim();
    const origin = JSON.parse(
        readFileSync(join(output, "provenance.json"), "utf8"),
    );
    if (
        !origin.verified ||
        origin.checkout.head !== sha ||
        JSON.stringify(origin.shard) !== JSON.stringify(shard)
    )
        throw Error(
            "Verified matching shard provenance required before compilation",
        );
    const metadata = {
        sha,
        tree: origin.checkout.tree,
        shard,
        globalPlanned: 57,
        workflowAttempt: process.env.GITHUB_RUN_ATTEMPT,
        nodeVersion: process.version,
        os: process.platform,
        arch: process.arch,
        runnerName: process.env.RUNNER_NAME,
        runnerEnvironment: process.env.RUNNER_ENVIRONMENT,
        runnerImage: process.env.ImageOS,
        runnerImageVersion: process.env.ImageVersion,
        workflowRun: process.env.GITHUB_RUN_ID,
        referenceBlob,
        symbols:
            "Matching own-function assembly retained; PE function/source map unavailable. CDB supplies loaded module bases and OS symbols.",
    };
    const results = [];
    save(join(output, "matrix.json"), { metadata, planned: matrix, results });
    const campaignTimer = setTimeout(abort, 20 * 60 * 1000);
    process.once("SIGINT", abort);
    process.once("SIGTERM", abort);
    const images = new Map();
    try {
        for (const spec of matrix) {
            if (controller.signal.aborted) break;
            const key = `${spec.fixture}-${spec.gc}`;
            const sourcePath = join(output, `${spec.fixture}.mjs`);
            writeFileSync(
                sourcePath,
                serverSource(spec.fixture === "reference"),
            );
            let command = process.execPath;
            let args = [sourcePath];
            if (spec.runtime === "nona") {
                if (!images.has(key)) {
                    const binary = join(output, key, "nona-http.exe");
                    mkdirSync(join(output, key), { recursive: true });
                    const build = await supervise(
                        process.execPath,
                        [
                            "scripts/http-crash-build.mjs",
                            sourcePath,
                            binary,
                            spec.gc,
                        ],
                        {
                            directory: join(output, key, "build"),
                            timeoutMs: 120000,
                            env: {
                                ...process.env,
                                NONA_GC_STRESS: "on",
                                NONA_CACHE: "0",
                            },
                            signal: controller.signal,
                        },
                    ).done;
                    if (build.code !== 0 || build.error || build.reason)
                        throw new Error(
                            `Build failed for ${key}; see retained build logs`,
                        );
                    images.set(key, binary);
                    save(join(output, key, "build", "image.json"), {
                        sourceHash: hashFile(sourcePath),
                        imageHash: hashFile(binary),
                        sha,
                        tree: metadata.tree,
                        gc: spec.gc,
                    });
                }
                command = images.get(key);
                args = [];
            }
            console.log(
                `${spec.id}: ${spec.runtime}/${spec.gc} ${spec.listeners} ${spec.state} c=${spec.concurrency}`,
            );
            const report = await runTrial(spec, {
                directory: join(output, spec.id),
                command,
                args,
                signal: controller.signal,
                ...(spec.fixture === "reference"
                    ? { observationMs: 22000 }
                    : {}),
                metadata: {
                    ...metadata,
                    sourceHash: hashFile(sourcePath),
                    imageHash: hashFile(command),
                },
            });
            results.push(report);
            save(join(output, "matrix.json"), {
                metadata,
                planned: matrix,
                results,
            });
            // Stop on the first native fault: preserve its dump before further
            // trials can overwrite WER's bounded retention or use more disk.
            if (
                report.verdict === "native-fault" ||
                report.verdict === "infrastructure-error"
            )
                break;
        }
    } finally {
        clearTimeout(campaignTimer);
        process.removeListener("SIGINT", abort);
        process.removeListener("SIGTERM", abort);
        save(join(output, "matrix.json"), {
            metadata,
            planned: matrix,
            results,
            interrupted: controller.signal.aborted,
            completed: results.length,
            counts: results.reduce((out, row) => {
                out[row.verdict] = (out[row.verdict] ?? 0) + 1;
                return out;
            }, {}),
            nextExperiment:
                "If no native fault: compare the same traced matrix at 4d75a9d9 and the #601 before/after commits on hosted Windows; match queue/close sequence and fault signature before minimizing. No product fix established; #602 remains open.",
        });
    }
    // Separate infrastructure/scenario acceptance; retain all raw classifications
    // and matrix reports unchanged. Incomplete matrices and interruption fail.
    const retainedMatrix = JSON.parse(
        readFileSync(join(output, "matrix.json"), "utf8"),
    );
    const provenancePath = join(output, "provenance.json");
    let provenance;
    try {
        provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
    } catch {
        provenance = null;
    }
    const acceptance = diagnosticShardAcceptance(
        retainedMatrix,
        acceptanceFiles(output, retainedMatrix),
        provenance,
        selection.shard,
    );
    save(join(output, "acceptance.json"), acceptance);
    if (!acceptance.shardAccepted) process.exitCode = 1;
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
    await main();
