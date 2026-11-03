// Hosted-only coordinator. Importing this module performs no IO or process work.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import {
    appendFileSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    existsSync,
    lstatSync,
    realpathSync,
    openSync,
    closeSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
    PINS,
    BUDGET,
    sha256,
    admit,
    nonce,
    parseJson,
    canonicalSource,
    ownedPath,
    armEnvironment,
    systemEnvironment,
    readArchive,
    verifyNative,
    patchDriver,
    validateIntervals,
    histogramQuantile,
    triadCounterCoverage,
} from "./http-latency615-support.mjs";
export const errorInfo = (e) => ({
    name: e.name,
    code: e.code,
    message: e.message,
    stack: e.stack,
});
const hex = (code) =>
    Number.isInteger(code) && code > 255
        ? "0x" + (code >>> 0).toString(16)
        : null;
export function observeChild(
    child,
    {
        data = () => {},
        event = () => {},
        limit = 4 * 1024 * 1024,
        now = () => performance.now(),
    } = {},
) {
    const receipt = {
        pid: child.pid,
        events: [],
        errors: [],
        droppedEvents: 0,
        droppedErrors: 0,
        streams: {
            stdout: { bytes: 0, end: false, close: false },
            stderr: { bytes: 0, end: false, close: false },
        },
        exit: null,
        close: null,
        complete: false,
    };
    const failure = (e) => {
        if (receipt.errors.length < 64) receipt.errors.push(errorInfo(e));
        else receipt.droppedErrors++;
        receipt.complete = false;
    };
    const record = (kind, value = {}) => {
        const e = { kind, mono: now(), ...value };
        if (receipt.events.length < 256) receipt.events.push(e);
        else {
            receipt.droppedEvents++;
            receipt.complete = false;
        }
        try {
            event(e);
        } catch (e) {
            failure(e);
        }
    };
    const refresh = () => {
        receipt.complete =
            !!receipt.exit &&
            !!receipt.close &&
            !receipt.droppedEvents &&
            !receipt.droppedErrors &&
            receipt.errors.length === 0 &&
            Object.values(receipt.streams).every(
                (s) => s.end && s.close && !s.error && !s.limitReached,
            );
    };
    for (const name of ["stdout", "stderr"]) {
        const stream = child[name],
            state = receipt.streams[name];
        if (!stream) {
            failure(Error("missing " + name));
            continue;
        }
        stream.on("data", (b) => {
            state.bytes += b.length;
            if (receipt.close && !state.late) {
                state.late = true;
                failure(Error("late " + name + " data after close"));
                record(name + ".late");
            }
            if (state.bytes > limit) {
                if (!state.limitReached) {
                    state.limitReached = true;
                    failure(Error(name + " byte cap"));
                    record(name + ".limit");
                }
                return;
            }
            try {
                data(name, b);
            } catch (e) {
                failure(e);
            }
            refresh();
        });
        for (const kind of ["end", "close"])
            stream.on(kind, () => {
                if (state[kind] || receipt.close)
                    failure(Error("duplicate/late " + name + "." + kind));
                state[kind] = true;
                record(name + "." + kind);
                refresh();
            });
        stream.on("error", (e) => {
            state.error = errorInfo(e);
            failure(e);
            record(name + ".error", errorInfo(e));
            refresh();
        });
    }
    child.on("error", (e) => {
        failure(e);
        record("error", errorInfo(e));
        refresh();
    });
    child.on("exit", (code, signal) => {
        if (receipt.exit || receipt.close)
            failure(Error("duplicate/late exit"));
        receipt.exit = { code, signal, hex: hex(code) };
        record("exit", receipt.exit);
        refresh();
    });
    const closed = new Promise((resolve) =>
        child.on("close", (code, signal) => {
            if (receipt.close) failure(Error("duplicate close"));
            receipt.close = { code, signal, hex: hex(code) };
            record("close", receipt.close);
            refresh();
            resolve(receipt);
        }),
    );
    record("spawn", { pid: child.pid });
    return { receipt, closed };
}
export async function runTriad(io, started) {
    const arms = [];
    let stopped = null;
    const ledger = [];
    const deadline = started + BUDGET.total;
    for (const [i, name] of ["nativeA", "node", "nativeB"].entries()) {
        const remaining = deadline - io.now();
        const reserve =
            BUDGET.observer +
            BUDGET.report +
            BUDGET.headroom +
            (2 - i) * BUDGET.gap;
        ledger.push({
            phase: name,
            at: io.now(),
            remaining,
            required: BUDGET.arm + BUDGET.cleanup + reserve,
        });
        if (!stopped && remaining < BUDGET.arm + BUDGET.cleanup + reserve)
            stopped = "insufficient full arm/cleanup/finalization budget";
        if (stopped) {
            arms.push({ name, status: "not-started", reason: stopped });
            continue;
        }
        let result;
        const armStarted = io.now();
        try {
            result = await io.arm(name, {
                deadline: Math.min(deadline - reserve, io.now() + BUDGET.arm),
                cleanupMs: BUDGET.cleanup,
                armMs: BUDGET.arm,
                latestSpawnAt: deadline - reserve - BUDGET.arm - BUDGET.cleanup,
            });
        } catch (e) {
            result = {
                name,
                status: "error",
                errors: [errorInfo(e)],
                cleanupComplete: false,
            };
        }
        if (io.now() - armStarted > BUDGET.arm + BUDGET.cleanup) {
            result.budgetError = "arm/owned-cleanup lifetime exceeded";
            stopped = "arm budget exceeded";
        }
        arms.push({ ...result, name });
        if (
            !result.cleanupComplete ||
            result.provenanceComplete === false ||
            result.observerHealthy === false
        )
            stopped = "uncertain owned cleanup/provenance/observer";
        if (i < 2 && !stopped) await io.gap(BUDGET.gap);
    }
    const complete =
        arms.length === 3 &&
        arms.every(
            (a) =>
                a.originalCriteriaPass === true &&
                a.workloadCompleted === true &&
                a.telemetryComplete === true &&
                a.cleanupComplete === true &&
                a.exitCode === 0 &&
                !a.budgetError &&
                a.provenanceComplete === true &&
                a.observerHealthy === true &&
                (!a.errors || a.errors.length === 0),
        );
    return {
        accepted: false,
        experimentComplete: complete,
        exitCode: complete ? 0 : 1,
        arms,
        ledger,
        deadline,
        elapsedMs: io.now() - started,
        limits: [
            "Instrumented fixed-order repeatability observations only; observer overhead is retained.",
            "Original failed p99 remains failed. No source/CI/#602/#516/release acceptance or cause established.",
        ],
    };
}
function bounded(promise, ms, label) {
    assert.ok(ms > 0, `${label}: budget exhausted`);
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error(`${label}: deadline`)), ms);
        }),
    ]).finally(() => clearTimeout(timer));
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function writeExclusive(file, bytes) {
    const fd = openSync(file, "wx");
    try {
        writeFileSync(fd, bytes);
    } finally {
        closeSync(fd);
    }
}
function noLinks(p) {
    let current = path.parse(p).root;
    for (const part of p.slice(current.length).split(path.sep)) {
        if (!part) continue;
        current = path.join(current, part);
        if (existsSync(current)) {
            const s = lstatSync(current);
            assert.ok(!s.isSymbolicLink(), "no link/reparse: " + current);
            assert.equal(
                realpathSync.native(current).toLowerCase(),
                path.resolve(current).toLowerCase(),
                "real path alias",
            );
        }
    }
}
export function createOwnedDirectory(root, p) {
    ownedPath(root, p);
    noLinks(root);
    noLinks(path.dirname(p));
    mkdirSync(p);
    noLinks(p);
    return p;
}
function json(p, v) {
    writeExclusive(p, JSON.stringify(v, null, 2) + "\n");
}
function lines(p) {
    const text = readFileSync(p, "utf8");
    assert.ok(Buffer.byteLength(text) <= 8 * 1024 * 1024);
    assert.ok(text.endsWith("\n"), "truncated JSONL");
    return text.trimEnd().split("\n").map(parseJson);
}
function revision(arg, cwd) {
    return execFileSync("git", ["rev-parse", arg], {
        cwd,
        encoding: "utf8",
        timeout: 3000,
        windowsHide: true,
        maxBuffer: 4096,
    }).trim();
}
function identity(env) {
    return {
        runner: env.RUNNER_NAME,
        job: env.GITHUB_JOB,
        run: env.GITHUB_RUN_ID,
        hostname: os.hostname(),
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        executable: process.execPath,
        executableHash: sha256(readFileSync(process.execPath)),
        image: env.ImageOS ?? null,
        imageVersion: env.ImageVersion ?? null,
        cpu: os.cpus().map((c) => c.model),
        memory: os.totalmem(),
        release: os.release(),
    };
}
// One small persistent protocol for retained Windows process handles. It never
// accepts a shell command, arbitrary query, or a PID-only kill operation.
export class CounterBridge {
    constructor(
        script,
        env,
        record,
        {
            spawnChild = spawn,
            requestTimeoutMs = 2000,
            now = () => performance.now(),
            wallNow = () => Date.now(),
        } = {},
    ) {
        this.now = now;
        this.requestTimeoutMs = requestTimeoutMs;
        this.sequence = 0;
        this.pending = null;
        this.failure = null;
        this.stopState = "running";
        this.readiness = "starting";
        this.admission = null;
        this.observerIdentity = null;
        this.record = (value) => {
            try {
                record(value);
            } catch (e) {
                this.fail(e);
            }
        };
        this.buffer = "";
        this.healthy = false;
        this.queue = Promise.resolve();
        this.spawnBefore = wallNow();
        this.child = spawnChild(
            path.join(
                env.SystemRoot,
                "System32",
                "WindowsPowerShell",
                "v1.0",
                "powershell.exe",
            ),
            [
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                script,
            ],
            {
                env: systemEnvironment(env),
                windowsHide: true,
                stdio: ["pipe", "pipe", "pipe"],
            },
        );
        this.spawnAfter = wallNow();
        this.observed = observeChild(this.child, {
            data: (name, b) => {
                this.record({ kind: "bridge." + name, raw: b.toString() });
                if (this.failure) return;
                if (name !== "stdout") return;
                try {
                    this.buffer += b;
                    assert.ok(
                        this.buffer.length <= 65536,
                        "bridge response cap",
                    );
                    let at;
                    while ((at = this.buffer.indexOf("\n")) >= 0) {
                        const line = this.buffer.slice(0, at).trimEnd();
                        this.buffer = this.buffer.slice(at + 1);
                        const value = parseJson(line);
                        assert.ok(
                            this.pending &&
                                value.sequence === this.pending.sequence,
                            "unmatched bridge response",
                        );
                        const p = this.pending;
                        const received = this.now();
                        this.record({
                            kind: "bridge.response",
                            send: p.send,
                            receive: received,
                            value,
                        });
                        if (this.failure) return;
                        if (p.op === "hello") {
                            assert.ok(
                                received < this.admission.deadline,
                                "observer admission deadline",
                            );
                            assert.equal(
                                value.ok,
                                true,
                                "observer hello rejected",
                            );
                            const h = value.hello;
                            assert.ok(h, "observer hello required");
                            assert.equal(
                                h.protocol,
                                "nona-latency615-observer",
                                "observer protocol",
                            );
                            assert.equal(
                                h.version,
                                1,
                                "observer protocol version",
                            );
                            assert.ok(
                                Number.isSafeInteger(h.pid) && h.pid > 0,
                                "observer PID",
                            );
                            assert.equal(
                                h.pid,
                                this.child.pid,
                                "observer spawned PID",
                            );
                            assert.equal(
                                typeof h.creationTicks,
                                "string",
                                "observer creation ticks string",
                            );
                            assert.match(h.creationTicks, /^[1-9][0-9]{17}$/);
                            assert.equal(typeof h.creationUtc, "string");
                            assert.match(
                                h.creationUtc,
                                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/,
                            );
                            const utcMs = Date.parse(
                                h.creationUtc.slice(0, 23) + "Z",
                            );
                            assert.ok(
                                Number.isSafeInteger(utcMs),
                                "observer creation UTC",
                            );
                            assert.equal(
                                new Date(utcMs).toISOString(),
                                h.creationUtc.slice(0, 23) + "Z",
                            );
                            const ticks = BigInt(h.creationTicks);
                            assert.equal(
                                ticks,
                                621355968000000000n +
                                    BigInt(utcMs) * 10000n +
                                    BigInt(h.creationUtc.slice(23, 27)),
                                "observer creation UTC/ticks binding",
                            );
                            assert.ok(
                                this.spawnBefore <= this.spawnAfter &&
                                    utcMs >= this.spawnBefore &&
                                    utcMs <= this.spawnAfter,
                                "observer creation outside spawned bracket",
                            );
                            assert.equal(
                                h.identity,
                                `${h.pid}/${h.creationTicks}`,
                                "observer creation identity",
                            );
                            assert.equal(
                                typeof h.powershellVersion,
                                "string",
                                "observed PowerShell version required",
                            );
                            assert.match(
                                h.powershellVersion,
                                /^\d+\.\d+(?:\.\d+){0,2}$/,
                            );
                            this.observerIdentity = h.identity;
                        }
                        assert.equal(
                            value.observer?.identity,
                            this.observerIdentity,
                            "observer reply identity binding",
                        );
                        this.pending = null;
                        if (p.op === "stop" && value.ok === true)
                            this.stopState = "acknowledged";
                        p.resolve({
                            ...value,
                            send: p.send,
                            receive: received,
                        });
                    }
                } catch (e) {
                    this.fail(e);
                    this.record({
                        kind: "bridge.protocolError",
                        error: errorInfo(e),
                    });
                }
            },
            event: (e) => {
                this.record({ kind: "bridge.lifecycle", event: e });
                if (
                    e.kind === "error" ||
                    e.kind.endsWith(".error") ||
                    e.kind.endsWith(".limit") ||
                    e.kind.endsWith(".late") ||
                    this.observed?.receipt.errors.length
                )
                    this.fail(
                        Object.assign(
                            Error(e.message ?? "observer " + e.kind),
                            e,
                        ),
                    );
                if (
                    [
                        "exit",
                        "close",
                        "stdout.end",
                        "stdout.close",
                        "stderr.end",
                        "stderr.close",
                    ].includes(e.kind)
                ) {
                    // Stop writes its ACK and exits without waiting for stdin.
                    // OS exit and stderr EOF can precede buffered stdout data;
                    // retain them provisionally while the requested ACK is due.
                    // stdout EOF/child close cannot precede that ACK's data.
                    const awaitingStopAck =
                        this.stopState === "requested" &&
                        ["exit", "stderr.end", "stderr.close"].includes(e.kind);
                    if (
                        (this.stopState !== "acknowledged" &&
                            !awaitingStopAck) ||
                        (["exit", "close"].includes(e.kind) &&
                            (e.code !== 0 || e.signal !== null))
                    )
                        this.fail(
                            Object.assign(
                                Error("observer unexpected " + e.kind),
                                { event: e },
                            ),
                        );
                }
            },
        });
        this.child.stdin.on("error", (e) => {
            this.fail(e);
            this.record({ kind: "bridge.stdin.error", error: errorInfo(e) });
        });
    }
    fail(error) {
        this.failure ??= error;
        this.healthy = false;
        if (this.readiness === "starting" && this.admission)
            this.admission.error ??= errorInfo(this.failure);
        this.readiness = "failed";
        this.pending?.reject(this.failure);
        this.pending = null;
    }
    checkLive() {
        if (
            !this.failure &&
            (this.observed.receipt.errors.length ||
                this.observed.receipt.exit ||
                this.observed.receipt.close ||
                this.child.exitCode !== null ||
                this.child.signalCode !== null ||
                this.child.stdin.destroyed ||
                this.child.stdin.writableEnded)
        )
            this.fail(Error("observer is not live"));
        if (this.failure) throw this.failure;
        assert.equal(this.stopState, "running", "observer not running");
    }
    assertLive() {
        this.checkLive();
        assert.ok(
            this.healthy && this.readiness === "ready",
            "observer not ready",
        );
    }
    async admit(started, deadline = started + BUDGET.total) {
        if (this.failure) throw this.failure;
        assert.equal(
            this.admission,
            null,
            "observer admission already attempted",
        );
        const begin = this.now();
        this.admission = {
            started: begin,
            deadline: Math.min(
                started + BUDGET.preflight,
                deadline - BUDGET.observer - BUDGET.report - BUDGET.headroom,
            ),
            spawn: {
                pid: this.child.pid,
                before: this.spawnBefore,
                after: this.spawnAfter,
            },
            ack: null,
        };
        try {
            assert.ok(
                Number.isFinite(this.admission.deadline) &&
                    begin < this.admission.deadline,
                "observer admission budget exhausted",
            );
            const ack = await this.query("hello");
            this.checkLive();
            assert.ok(
                this.now() < this.admission.deadline,
                "observer admission deadline",
            );
            this.admission.ack = ack;
            this.admission.validated = this.now();
            this.admission.elapsedMs = this.admission.validated - begin;
            this.record({ kind: "bridge.ready", admission: this.admission });
            this.checkLive();
            assert.ok(
                this.now() < this.admission.deadline,
                "observer admission deadline",
            );
            this.admission.readyAt = this.now();
            // A parsed ACK admits only this observer. Workload ownership,
            // counters and cleanup still require their existing proofs.
            this.readiness = "ready";
            this.healthy = true;
            return ack;
        } catch (e) {
            this.fail(e);
            throw this.failure;
        }
    }
    request(op, fields = {}) {
        assert.ok(
            ["register", "sample", "terminate", "stop"].includes(op),
            "fixed observer operation",
        );
        return this.query(op, fields);
    }
    query(op, fields = {}) {
        const result = this.queue.then(async () => {
            if (op === "hello") this.checkLive();
            else this.assertLive();
            assert.ok(!this.pending, "observer pending query");
            const sequence = ++this.sequence,
                send = this.now();
            const allowed =
                op === "hello"
                    ? this.admission.deadline - send
                    : this.requestTimeoutMs;
            if (op === "hello" && !(allowed > 0)) {
                this.fail(Error("observer admission budget exhausted"));
                throw this.failure;
            }
            const command = { sequence, op, ...fields };
            this.record({ kind: "bridge.request", send, command });
            if (this.failure) throw this.failure;
            if (op === "hello" && this.now() >= this.admission.deadline) {
                this.fail(Error("observer admission deadline before write"));
                throw this.failure;
            }
            if (op === "stop") this.stopState = "requested";
            const response = new Promise((resolve, reject) => {
                this.pending = { sequence, send, op, resolve, reject };
                this.child.stdin.write(JSON.stringify(command) + "\n", (e) => {
                    if (e) {
                        this.fail(e);
                    } else {
                        this.record({
                            kind: "bridge.write",
                            sequence,
                            op,
                            mono: this.now(),
                        });
                    }
                });
            });
            try {
                const timeout =
                    op === "hello"
                        ? this.admission.deadline - this.now()
                        : allowed;
                if (op === "hello" && !(timeout > 0)) {
                    this.fail(Error("observer admission deadline after write"));
                    // Consume the pending rejection (or an already buffered
                    // reply) without creating any new wait past the deadline.
                    await response.catch(() => {});
                    throw this.failure;
                }
                const r = await bounded(
                    response,
                    timeout,
                    op === "hello" ? "observer admission" : "observer query",
                );
                assert.equal(r.ok, true, JSON.stringify(r));
                return r;
            } catch (e) {
                this.fail(e);
                throw this.failure;
            }
        });
        this.queue = result.catch(() => {});
        return result;
    }
    async stop() {
        try {
            const result = await this.request("stop");
            if (this.failure) throw this.failure;
            assert.equal(this.stopState, "acknowledged");
            this.child.stdin.end();
            await bounded(
                this.observed.closed,
                18000,
                "observer OS/pipe shutdown",
            );
            if (this.failure) throw this.failure;
            assert.ok(this.observed.receipt.complete);
            assert.equal(this.observed.receipt.exit.code, 0);
            assert.equal(this.observed.receipt.exit.signal, null);
            this.stopState = "closed";
            this.readiness = "closed";
            return result;
        } catch (e) {
            this.fail(e);
            throw this.failure;
        }
    }
}
// Exact hosted retrieval only; injected transport/retention keeps local tests inert.
export async function retrieveFile(
    url,
    {
        token,
        deadline,
        cap = 1048576,
        archive = false,
        request = fetch,
        now = () => performance.now(),
        retain,
    },
) {
    const original = url,
        started = now(),
        chunks = [];
    let status = null,
        complete = false,
        failure = null;
    assert.ok(
        [
            "https://api.github.com",
            "https://raw.githubusercontent.com",
        ].includes(new URL(url).origin),
        "fixed input origin",
    );
    const abort = new AbortController(),
        allowed = Math.min(10000, deadline - started);
    assert.ok(allowed > 0, "retrieval budget");
    const timer = setTimeout(() => abort.abort(), allowed);
    try {
        const operation = async () => {
            let authorization =
                new URL(url).origin === "https://api.github.com";
            for (let redirect = 0; redirect < 3; redirect++) {
                const response = await request(url, {
                    redirect: "manual",
                    signal: abort.signal,
                    headers: authorization
                        ? {
                              Authorization: `Bearer ${token}`,
                              Accept: "application/vnd.github+json",
                              "X-GitHub-Api-Version": "2026-03-10",
                          }
                        : {},
                });
                status = response.status;
                if ([301, 302, 303, 307, 308].includes(status)) {
                    const next = new URL(response.headers.get("location"), url);
                    await response.body?.cancel();
                    assert.ok(
                        archive &&
                            next.protocol === "https:" &&
                            !next.username &&
                            !next.password &&
                            !next.port &&
                            (next.hostname.endsWith(".blob.core.windows.net") ||
                                next.hostname.endsWith(
                                    ".actions.githubusercontent.com",
                                ) ||
                                next.hostname.endsWith(
                                    ".githubusercontent.com",
                                )),
                        "artifact redirect allowlist",
                    );
                    url = next.href;
                    authorization = false;
                    continue;
                }
                let size = 0;
                for await (const chunk of response.body) {
                    const room = cap - size;
                    chunks.push(
                        Buffer.from(chunk).subarray(0, Math.max(0, room)),
                    );
                    size += chunk.length;
                    assert.ok(size <= cap, "retrieval byte cap");
                }
                assert.equal(status, 200, "retrieval status");
                assert.ok(now() <= deadline, "preflight deadline");
                complete = true;
                return Buffer.concat(chunks);
            }
            throw Error("redirect bound");
        };
        return await bounded(operation(), allowed, "retrieval request/body");
    } catch (e) {
        failure = errorInfo(e);
        throw e;
    } finally {
        clearTimeout(timer);
        abort.abort();
        const raw = Buffer.concat(chunks);
        retain({
            url: original,
            status,
            observed: new Date().toISOString(),
            elapsedMs: now() - started,
            bytes: raw.length,
            sha256: sha256(raw),
            complete,
            error: failure,
            raw,
        });
    }
}
async function retrieve(env, output, deadline) {
    const base = "https://api.github.com/repos/40oleg/nona";
    const token = env.GH_TOKEN;
    assert.ok(token, "job-only read token required");
    let seq = 0;
    const get = (url, cap = 1048576, archive = false) =>
        retrieveFile(url, {
            token,
            deadline,
            cap,
            archive,
            retain: ({ raw, ...record }) => {
                const id = ++seq;
                writeExclusive(path.join(output, `retrieval-${id}.raw`), raw);
                json(path.join(output, `retrieval-${id}.json`), record);
            },
        });
    const current = parseJson(
        await get(`${base}/actions/runs/${env.GITHUB_RUN_ID}`),
    );
    const artifact = parseJson(
        await get(`${base}/actions/artifacts/${PINS.artifact}`),
    );
    assert.equal(artifact.expired, false, "artifact expired");
    const sourceRun = parseJson(await get(`${base}/actions/runs/${PINS.run}`));
    const sourceWorkflow = parseJson(
        await get(`${base}/actions/workflows/${sourceRun.workflow_id}`),
    );
    const sourceJob = parseJson(await get(`${base}/actions/jobs/${PINS.job}`));
    assert.equal(sourceWorkflow.id, sourceRun.workflow_id);
    assert.equal(sourceJob.run_id, PINS.run);
    assert.equal(sourceJob.run_attempt, 1);
    assert.equal(artifact.workflow_run.id, PINS.run);
    assert.equal(artifact.workflow_run.repository_id, sourceRun.repository.id);
    assert.equal(sourceRun.repository.full_name, PINS.repository);
    assert.equal(sourceRun.head_repository.full_name, PINS.repository);
    const receipt = {
        schemaVersion: 1,
        repository: {
            id: sourceRun.repository.id,
            fullName: sourceRun.repository.full_name,
        },
        workflow: { id: sourceWorkflow.id, path: sourceWorkflow.path },
        run: {
            id: sourceRun.id,
            attempt: sourceRun.run_attempt,
            event: sourceRun.event,
            headRepository: sourceRun.head_repository.full_name,
            headBranch: sourceRun.head_branch,
            headSha: sourceRun.head_sha,
        },
        job: {
            id: sourceJob.id,
            name: sourceJob.name,
            attempt: sourceJob.run_attempt,
            status: sourceJob.status,
            conclusion: sourceJob.conclusion,
            runnerId: sourceJob.runner_id,
            runnerName: sourceJob.runner_name,
            runnerGroupName: sourceJob.runner_group_name,
        },
        artifact: {
            id: artifact.id,
            name: artifact.name,
            runId: artifact.workflow_run.id,
            headSha: artifact.workflow_run.head_sha,
            sizeInBytes: artifact.size_in_bytes,
            digest: artifact.digest,
        },
    };
    const canonical = canonicalSource(receipt);
    assert.equal(
        sha256(canonical),
        env.SOURCE_IDENTITY_SHA256,
        "parent source metadata receipt",
    );
    writeExclusive(path.join(output, "source-identity.json"), canonical);
    const zip = await get(
        `${base}/actions/artifacts/${PINS.artifact}/zip`,
        PINS.zipSize,
        true,
    );
    writeExclusive(path.join(output, "original-failure.zip"), zip);
    const entries = readArchive(zip);
    const commit = parseJson(await get(`${base}/git/commits/${PINS.checkout}`));
    assert.equal(commit.sha, PINS.checkout);
    assert.equal(commit.tree.sha, PINS.sourceTree);
    assert.deepEqual(
        commit.parents.map((p) => p.sha),
        ["cbd9d287fd2cdd3b5e65bdc592d88e91b3fab876", PINS.sourceHead],
    );
    const fixture = await get(
        `https://raw.githubusercontent.com/40oleg/nona/${PINS.fixtureCommit}/bench/http/soak-server.mjs`,
        1024 * 1024,
    );
    assert.equal(sha256(fixture), PINS.fixture);
    return { current, receipt, entries, fixture };
}
function requireReport(report, telemetry, intervals) {
    for (const [k, v] of Object.entries({
        smoke: true,
        minutes: 5,
        warmupMinutes: 1,
        sampleSeconds: 10,
        connections: 1,
        pauseMs: 0,
        requestTimeoutMs: 30000,
        settleSeconds: 8,
        windowMinutes: 1,
    }))
        assert.equal(report.config[k], v, k);
    assert.deepEqual(report.config.limits, {
        rssGrowth: 0.1,
        p99Growth: 0.2,
        p99SlackMs: 0.5,
        socketSlack: 2,
        fdSlack: 4,
        resourceSlack: 2,
    });
    assert.deepEqual(report.mix, { big: 1 });
    assert.equal(report.node, PINS.node);
    assert.equal(report.target, "win32-x64");
    assert.equal(typeof report.summary.pass, "boolean");
    assert.equal(report.criteria.length, 5);
    assert.equal(
        report.summary.pass,
        report.criteria.every((c) => c.pass === true),
    );
    const windows = validateIntervals(intervals, telemetry.loadSeconds);
    assert.deepEqual(windows.headIndices, telemetry.headIndices);
    assert.deepEqual(windows.tailIndices, telemetry.tailIndices);
    assert.deepEqual(windows.head, telemetry.head);
    assert.deepEqual(windows.tail, telemetry.tail);
    assert.equal(histogramQuantile(windows.head), telemetry.p99Head);
    assert.equal(histogramQuantile(windows.tail), telemetry.p99Tail);
    assert.equal(telemetry.pass, report.summary.pass);
    return windows;
}
async function hostedArm(context, name, bounds) {
    const {
        env,
        output,
        stage,
        bridge,
        driver,
        native,
        fixture,
        initialIdentity,
    } = context;
    const folder = createOwnedDirectory(output, path.join(output, name));
    const started = performance.now();
    const server = name === "node" ? fixture : native;
    const result = {
        name,
        serverKind: name === "node" ? "node" : "native",
        status: "started",
        originalCriteriaPass: false,
        workloadCompleted: false,
        telemetryComplete: false,
        cleanupComplete: false,
        provenanceComplete: true,
        observerHealthy: true,
        errors: [],
        counters: [],
        mapping: null,
    };
    const persist = () => {
        try {
            writeFileSync(
                path.join(folder, "arm-receipt.json"),
                JSON.stringify(result, null, 2),
            );
        } catch (e) {
            result.errors.push(errorInfo(e));
            result.observerHealthy = false;
        }
    };
    const keys = { harness: name + ".harness", server: name + ".server" };
    let ownedHarness = false,
        ownedServer = false,
        registration = Promise.resolve(),
        observed,
        child,
        tick,
        endpointTimer,
        postSpawnDeadline;
    const counterPoint = async () => {
        const send = performance.now();
        const cpus = os.cpus().map((c) => c.times),
            coordinatorCpu = process.cpuUsage();
        const host = {
            at: send,
            receive: performance.now(),
            cpus,
            coordinatorCpu,
        };
        const response = await bridge.request("sample", {
            keys: Object.values(keys),
        });
        result.counters.push({ host, ...response });
        persist();
    };
    const enqueue = (fn) => {
        registration = registration
            .then(async () => {
                if (result.observerHealthy) await fn();
            })
            .catch((e) => {
                result.observerHealthy = false;
                result.errors.push(errorInfo(e));
                persist();
            });
    };
    try {
        assert.deepEqual(
            identity(env),
            initialIdentity,
            "same VM/Node identity before arm",
        );
        assert.equal(sha256(readFileSync(driver)), context.driverHash);
        verifyNative(readFileSync(native));
        assert.equal(sha256(readFileSync(fixture)), PINS.fixture);
        json(path.join(folder, "identity.before.json"), initialIdentity);
        const before = Date.now(),
            spawnMono = performance.now();
        assert.ok(
            spawnMono <= bounds.latestSpawnAt,
            "full postspawn arm/cleanup/finalization budget at spawn",
        );
        postSpawnDeadline = spawnMono + bounds.armMs;
        result.command = {
            executable: process.execPath,
            args: [driver, "--smoke", "--out", folder],
            before,
            spawnMono,
            guardMs: bounds.armMs,
            deadline: postSpawnDeadline,
        };
        bridge.assertLive();
        child = spawn(process.execPath, [driver, "--smoke", "--out", folder], {
            cwd: stage,
            env: armEnvironment(env, server),
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let buffer = "";
        observed = observeChild(child, {
            data: (stream, b) => {
                appendFileSync(
                    path.join(folder, "harness." + stream + ".log"),
                    b,
                );
                if (stream !== "stdout") return;
                buffer += b;
                assert.ok(buffer.length <= 65536, "harness line cap");
                let i;
                while ((i = buffer.indexOf("\n")) >= 0) {
                    const line = buffer.slice(0, i);
                    buffer = buffer.slice(i + 1);
                    if (!line.startsWith("__latency615__")) continue;
                    const e = parseJson(line.slice(14));
                    if (e.kind === "origin") {
                        assert.equal(result.mapping, null);
                        result.mapping = {
                            driverMono: e.mono,
                            coordinatorLower: spawnMono,
                            coordinatorUpper: performance.now(),
                            uncertaintyMs: performance.now() - spawnMono,
                        };
                    }
                    if (e.kind === "load.start" || e.kind === "load.drained")
                        enqueue(counterPoint);
                    if (e.kind === "load.drained")
                        endpointTimer = setTimeout(
                            () => enqueue(counterPoint),
                            5000,
                        );
                    if (e.kind === "server.spawn") {
                        assert.equal(ownedServer, false);
                        assert.equal(e.serverPath, server);
                        enqueue(async () => {
                            const ack = await bridge.request("register", {
                                key: keys.server,
                                pid: e.pid,
                                exe:
                                    name === "node" ? process.execPath : native,
                                before: e.before,
                                after: e.after,
                            });
                            ownedServer = true;
                            result.serverIdentity = ack;
                            await counterPoint();
                        });
                    }
                }
            },
            event: () => {},
        });
        result.harness = observed.receipt;
        const ack = await bridge.request("register", {
            key: keys.harness,
            pid: child.pid,
            exe: process.execPath,
            before,
            after: Date.now(),
        });
        ownedHarness = true;
        result.harnessIdentity = ack;
        tick = setInterval(() => enqueue(counterPoint), 10000);
        await bounded(
            observed.closed,
            postSpawnDeadline - performance.now(),
            "480s postspawn harness/process/pipe guard",
        );
        await registration;
        result.exitCode = observed.receipt.exit?.code ?? null;
        result.signal = observed.receipt.exit?.signal ?? null;
        const report = parseJson(
            readFileSync(path.join(folder, "http-soak.json")),
        );
        result.originalCriteriaPass = report.summary.pass === true;
        result.criteria = report.criteria;
        const telemetry = parseJson(
                readFileSync(path.join(folder, "telemetry.json")),
            ),
            state = parseJson(
                readFileSync(path.join(folder, "telemetry-state.json")),
            ),
            intervals = lines(path.join(folder, "intervals.jsonl")),
            events = lines(path.join(folder, "events.jsonl"));
        const windows = requireReport(report, telemetry, intervals);
        result.workloadCompleted =
            report.crash === null && telemetry.loadSeconds >= 300;
        assert.equal(state.complete, true);
        assert.deepEqual(state.errors, []);
        assert.equal(state.exitCode, result.exitCode);
        assert.equal(result.exitCode, result.originalCriteriaPass ? 0 : 1);
        assert.ok(observed.receipt.complete, "harness OS and pipe receipt");
        for (const kind of [
            "server.spawn",
            "server.exit",
            "server.close",
            "server.stdout.end",
            "server.stdout.close",
            "server.stderr.end",
            "server.stderr.close",
            "load.start",
            "load.stop",
            "load.drained",
            "settle.start",
            "settle.end",
            "residual.final",
            "final",
            "harness.jsExit",
        ])
            assert.equal(events.filter((e) => e.kind === kind).length, 1, kind);
        assert.ok(
            !events.some(
                (e) =>
                    e.kind.endsWith(".error") ||
                    e.kind === "uncaughtExceptionMonitor",
            ),
        );
        assert.ok(result.mapping && ownedServer);
        result.coverage = triadCounterCoverage({
            counters: result.counters,
            events,
            mapping: result.mapping,
            intervals,
            windows,
            identities: {
                [keys.harness]: result.harnessIdentity.identity,
                [keys.server]: result.serverIdentity.identity,
            },
            cpuCount: initialIdentity.cpu.length,
            harnessPid: child.pid,
        });
        assert.equal(
            result.coverage.complete,
            true,
            "counter coverage incomplete",
        );
        result.telemetryComplete = true;
    } catch (e) {
        result.errors.push(errorInfo(e));
        result.status = "error";
        if (!bridge.healthy) result.observerHealthy = false;
    } finally {
        clearInterval(tick);
        clearTimeout(endpointTimer);
        const cleanupDeadline = performance.now() + bounds.cleanupMs;
        try {
            const cleanup = await settleOwnedArm({
                now: () => performance.now(),
                deadline: cleanupDeadline,
                registered: registration,
                keys: Object.values(keys),
                identities: {
                    [keys.harness]: ownedHarness
                        ? result.harnessIdentity.identity
                        : null,
                    [keys.server]: ownedServer
                        ? result.serverIdentity.identity
                        : null,
                },
                closed: observed?.closed,
                receipt: observed?.receipt,
                request: (op, fields) => bridge.request(op, fields),
            });
            result.cleanupBefore = cleanup.before;
            result.cleanupAfter = cleanup.after;
            const serverEvents = lines(path.join(folder, "events.jsonl"));
            for (const kind of [
                "server.exit",
                "server.close",
                "server.stdout.end",
                "server.stdout.close",
                "server.stderr.end",
                "server.stderr.close",
            ])
                assert.equal(
                    serverEvents.filter((e) => e.kind === kind).length,
                    1,
                    "owned server pipe proof: " + kind,
                );
            assert.deepEqual(
                identity(env),
                initialIdentity,
                "same VM/Node after arm",
            );
            verifyNative(readFileSync(native));
            assert.equal(sha256(readFileSync(fixture)), PINS.fixture);
            assert.equal(sha256(readFileSync(driver)), context.driverHash);
            json(path.join(folder, "identity.after.json"), initialIdentity);
            result.cleanupComplete = true;
            result.provenanceComplete = true;
        } catch (e) {
            result.errors.push(errorInfo(e));
            result.cleanupComplete = false;
            if (child && observed && !observed.receipt.close) {
                child.stdout?.destroy();
                child.stderr?.destroy();
                child.unref();
            }
        }
        result.harness = observed?.receipt ?? null;
        result.exitCode =
            observed?.receipt.exit?.code ?? result.exitCode ?? null;
        result.signal = observed?.receipt.exit?.signal ?? result.signal ?? null;
        result.elapsedMs = performance.now() - started;
        result.observerHealthy &&= bridge.healthy;
        persist();
    }
    return result;
}
export async function settleOwnedArm(io) {
    const receipts = [];
    const within = async (operation, label) => {
        assert.ok(io.now() < io.deadline, "cleanup remaining budget");
        const result = await bounded(
            operation(),
            io.deadline - io.now(),
            label,
        );
        assert.ok(io.now() <= io.deadline, "cleanup deadline");
        return result;
    };
    await within(() => io.registered, "pending owned registration");
    assert.equal(io.keys.length, 2);
    for (const key of io.keys)
        assert.ok(io.identities[key], "retained ownership required");
    const sample = async () => {
        const r = await within(
            () => io.request("sample", { keys: io.keys }),
            "owned exit query",
        );
        receipts.push(r);
        assert.equal(r.points.length, 2);
        assert.deepEqual(
            r.points.map((p) => p.key).sort(),
            [...io.keys].sort(),
        );
        for (const p of r.points) {
            assert.equal(
                p.identity,
                io.identities[p.key],
                "exact retained creation identity",
            );
            assert.equal(p.available, true);
            assert.equal(typeof p.exited, "boolean");
        }
        return r;
    };
    const before = await sample();
    for (const p of before.points)
        if (!p.exited)
            await within(
                () =>
                    io.request("terminate", {
                        key: p.key,
                        identity: p.identity,
                    }),
                "retained process termination",
            );
    await within(() => io.closed, "owned harness OS/pipe settlement");
    const after = await sample();
    assert.ok(
        after.points.every((p) => p.exited),
        "owned process exit proof",
    );
    assert.equal(io.receipt.complete, true, "owned pipe settlement");
    return { complete: true, before, after };
}
export async function main(env = process.env) {
    const started = performance.now(),
        deadline = started + BUDGET.total;
    let output, bridge, summary;
    const failures = [];
    try {
        // Admission values supplied by Actions and the parent; H1/T1/W1 remain
        // unknown until publication. No selected-ref acceptance is claimed here.
        assert.equal(env.GITHUB_ACTIONS, "true");
        assert.equal(process.platform, "win32");
        assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
        nonce(env.DISPATCH_NONCE);
        const workspace = realpathSync.native(env.GITHUB_WORKSPACE),
            temp = realpathSync.native(env.RUNNER_TEMP);
        noLinks(workspace);
        noLinks(temp);
        const work = path.join(workspace, "work");
        if (!existsSync(work)) createOwnedDirectory(workspace, work);
        const prefix = path.join(work, "http-latency615");
        if (!existsSync(prefix))
            createOwnedDirectory(path.join(workspace, "work"), prefix);
        output = createOwnedDirectory(
            prefix,
            path.join(
                prefix,
                `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}-${env.DISPATCH_NONCE}`,
            ),
        );
        json(path.join(output, "started.json"), {
            started,
            deadline,
            wall: new Date().toISOString(),
            accepted: false,
            budget: BUDGET,
        });
        const workflow = path.join(workspace, PINS.workflowPath);
        const fetched = await retrieve(env, output, started + BUDGET.preflight);
        const current = fetched.current;
        const admission = admit({
            event: env.GITHUB_EVENT_NAME,
            mode: env.DIAGNOSTIC_MODE,
            repository: env.GITHUB_REPOSITORY,
            headRepository: current.head_repository.full_name,
            ref: env.GITHUB_REF,
            actor: env.GITHUB_ACTOR,
            triggeringActor: env.GITHUB_TRIGGERING_ACTOR,
            attempt: env.GITHUB_RUN_ATTEMPT,
            sha: env.GITHUB_SHA,
            checkout: revision("HEAD", workspace),
            tree: revision("HEAD^{tree}", workspace),
            workflowSha: env.GITHUB_WORKFLOW_SHA,
            workflowRef: env.GITHUB_WORKFLOW_REF,
            workflowHash: sha256(readFileSync(workflow)),
            workflowId: current.workflow_id,
            expectedWorkflowId: env.EXPECTED_WORKFLOW_ID,
            expectedHead: env.EXPECTED_HEAD,
            expectedTree: env.EXPECTED_TREE,
            expectedWorkflowHash: env.EXPECTED_WORKFLOW_SHA256,
            sourceIdentityHash: env.SOURCE_IDENTITY_SHA256,
            nonce: env.DISPATCH_NONCE,
            actions: env.GITHUB_ACTIONS,
            contextEnvironment: env.NONA_RUNNER_ENVIRONMENT,
            runnerEnvironment: env.RUNNER_ENVIRONMENT,
            platform: process.platform,
            arch: process.arch,
            node: process.version,
            runnerOS: env.RUNNER_OS,
            runnerArch: env.RUNNER_ARCH,
            runner: env.RUNNER_NAME,
            run: env.GITHUB_RUN_ID,
            job: env.GITHUB_JOB,
        });
        assert.equal(current.id, Number(env.GITHUB_RUN_ID));
        assert.equal(current.run_attempt, 1);
        assert.equal(current.head_sha, env.EXPECTED_HEAD);
        assert.equal(current.event, "workflow_dispatch");
        assert.equal(current.head_branch, PINS.branch);
        assert.equal(current.repository.full_name, PINS.repository);
        assert.equal(current.path, PINS.workflowPath);
        assert.equal(current.actor.login, env.GITHUB_ACTOR);
        assert.equal(
            current.triggering_actor.login,
            env.GITHUB_TRIGGERING_ACTOR,
        );
        json(path.join(output, "admission.json"), admission);
        const original = createOwnedDirectory(
            output,
            path.join(output, "original-failure"),
        );
        for (const [name, b] of fetched.entries)
            writeExclusive(path.join(original, name.replaceAll("/", "--")), b);
        const oldRunner = parseJson(fetched.entries.get("runner.json")),
            verification = parseJson(
                fetched.entries.get("soak/verification.json"),
            );
        assert.equal(oldRunner.commit, PINS.checkout);
        assert.equal(oldRunner.run, String(PINS.run));
        assert.equal(oldRunner.runner, "GitHub Actions 1000035679");
        assert.equal(verification.originalHarnessSha256, PINS.driver);
        assert.equal(verification.binarySha256, PINS.native);
        assert.equal(verification.identity.commit, PINS.checkout);
        assert.equal(
            parseJson(fetched.entries.get("soak/http-soak.json")).summary.pass,
            false,
        );
        const tempPrefix = path.join(temp, "nona-latency615");
        if (!existsSync(tempPrefix)) createOwnedDirectory(temp, tempPrefix);
        const stage = createOwnedDirectory(
            tempPrefix,
            path.join(
                tempPrefix,
                `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}-${env.DISPATCH_NONCE}`,
            ),
        );
        createOwnedDirectory(stage, path.join(stage, "scripts"));
        const inputs = createOwnedDirectory(
                output,
                path.join(output, "inputs"),
            ),
            native = path.join(stage, "soak-server.exe"),
            fixture = path.join(stage, "soak-server.mjs"),
            driver = path.join(stage, "scripts", "http-soak.mjs");
        const nativeBytes = fetched.entries.get("soak/soak-server.exe");
        verifyNative(nativeBytes);
        writeExclusive(native, nativeBytes);
        writeExclusive(fixture, fetched.fixture);
        writeExclusive(path.join(inputs, "soak-server.mjs"), fetched.fixture);
        const patch = patchDriver(
            fetched.entries.get("soak/http-soak.original.mjs"),
        );
        writeExclusive(driver, patch.source);
        writeExclusive(
            path.join(inputs, "http-soak.original.mjs"),
            fetched.entries.get("soak/http-soak.original.mjs"),
        );
        writeExclusive(
            path.join(inputs, "http-soak.executed.mjs"),
            patch.source,
        );
        json(path.join(inputs, "patch-recipe.json"), patch.recipe);
        const observerSource = path.join(
                workspace,
                "scripts",
                "fixtures",
                "http-latency615-counters.ps1",
            ),
            observer = path.join(stage, "counters.ps1"),
            observerBytes = readFileSync(observerSource);
        writeExclusive(observer, observerBytes);
        writeExclusive(path.join(inputs, "counters.ps1"), observerBytes);
        const initialIdentity = identity(env);
        json(path.join(output, "manifest.json"), {
            admission,
            identity: initialIdentity,
            pins: PINS,
            driverHash: patch.sha256,
            observerHash: sha256(observerBytes),
            stage,
            output,
            setupElapsedMs: performance.now() - started,
            accepted: false,
            sourceIdentity: fetched.receipt,
            sourceTree: PINS.sourceTree,
            compilerEntry:
                "historical reported hash only; compiler absent and unused",
            cleanupPolicy:
                "No recursive staging deletion; preserve owned files for hosted teardown. Teardown is not process-cleanup proof.",
            clockPolicy:
                "origin-message monotonic bracket mapping; PowerShell ticks retained in their own domain",
            observerOverhead:
                "Not subtracted; sync sidecar writes and coarse counter queries may perturb timing",
        });
        assert.ok(
            performance.now() - started <= BUDGET.preflight,
            "60s preflight/recovery budget",
        );
        bridge = new CounterBridge(observer, env, (e) =>
            appendFileSync(
                path.join(output, "observer.jsonl"),
                JSON.stringify(e) + "\n",
            ),
        );
        await bridge.admit(started, deadline);
        const context = {
            env,
            output,
            stage,
            bridge,
            driver,
            native,
            fixture,
            initialIdentity,
            driverHash: patch.sha256,
        };
        summary = await runTriad(
            {
                now: () => performance.now(),
                gap: pause,
                arm: (name, bounds) => hostedArm(context, name, bounds),
            },
            started,
        );
    } catch (e) {
        failures.push(errorInfo(e));
        summary ??= {
            accepted: false,
            experimentComplete: false,
            exitCode: 1,
            arms: ["nativeA", "node", "nativeB"].map((name) => ({
                name,
                status: "not-started",
                reason: bridge?.admission?.error
                    ? "observer admission failure"
                    : "admission/preflight failure",
            })),
        };
    } finally {
        if (bridge) {
            try {
                await bounded(
                    bridge.stop(),
                    Math.min(
                        BUDGET.observer - 2000,
                        deadline - performance.now() - 2000,
                    ),
                    "observer finalization",
                );
            } catch (e) {
                failures.push(errorInfo(e));
                bridge.child.kill();
                try {
                    await bounded(
                        bridge.observed.closed,
                        1000,
                        "observer reap",
                    );
                } catch (e) {
                    failures.push(errorInfo(e));
                    bridge.child.stdout.destroy();
                    bridge.child.stderr.destroy();
                    bridge.child.unref();
                }
            }
        }
        summary ??= {
            accepted: false,
            experimentComplete: false,
            exitCode: 1,
            arms: [],
        };
        summary.observerReceipt = bridge?.observed.receipt ?? null;
        summary.observerAdmission = bridge?.admission ?? null;
        summary.errors = failures;
        const reportStarted = performance.now();
        summary.elapsedMs = performance.now() - started;
        if (failures.length || summary.elapsedMs > BUDGET.total) {
            summary.experimentComplete = false;
            summary.exitCode = 1;
        }
        if (output) {
            for (const arm of summary.arms) {
                const d = path.join(output, arm.name);
                if (!existsSync(d)) createOwnedDirectory(output, d);
                const f = path.join(d, "arm-receipt.json");
                if (!existsSync(f)) json(f, arm);
            }
            const manifest = [];
            function walk(d) {
                for (const e of awaitlessReaddir(d, { withFileTypes: true })) {
                    const p = path.join(d, e.name);
                    if (e.isDirectory()) walk(p);
                    else {
                        const b = readFileSync(p);
                        manifest.push({
                            path: path.relative(output, p),
                            bytes: b.length,
                            sha256: sha256(b),
                        });
                    }
                }
            }
            walk(output);
            json(path.join(output, "files.json"), manifest);
            summary.finalization = {
                reportMs: performance.now() - reportStarted,
                reportLimitMs: BUDGET.report,
                remainingMs: deadline - performance.now(),
                sharedSetupUploadReserveMs: BUDGET.sharedSetupUpload,
                uploadStatus:
                    "pending Actions upload and parent exact-run readback",
            };
            summary.elapsedMs = performance.now() - started;
            if (
                summary.elapsedMs > BUDGET.total ||
                summary.finalization.reportMs > BUDGET.report
            ) {
                summary.exitCode = 1;
                summary.experimentComplete = false;
                summary.errors.push({
                    message: "coordinator/finalization budget exceeded",
                });
            }
            json(path.join(output, "summary.json"), summary);
        }
        console.log(JSON.stringify(summary));
    }
    return summary.exitCode;
}
// Kept at module scope solely as an inert fs binding, never a scan on import.
import { readdirSync as awaitlessReaddir } from "node:fs";
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
    process.exitCode = await main();
