// Reuse #516's pinned, unmerged soak harness for #601 without incorporating
// that separate implementation into this PR. CI checks out only its two source
// files into work/http-601-soak-source. The server is built by this checkout's
// compiler; the workload and all original pass criteria remain unchanged.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    appendFileSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hostedIdentity } from "./http-keepalive-check.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "work", "http-601-soak-source");
const out = join(root, "work", "http-601", "soak");
const sourceCommit = "ab5ea083d793e0a665fde8b0a4b33bc1fa67208e";
const source = join(sourceRoot, "scripts", "http-soak.mjs");
const serverSource = join(sourceRoot, "bench", "http", "soak-server.mjs");
const binary = join(
    out,
    "soak-server" + (process.platform === "win32" ? ".exe" : ""),
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const errorInfo = (error) => ({
    name: error.name,
    code: error.code,
    message: error.message,
    stack: error.stack,
});
mkdirSync(out, { recursive: true });
const report = {
    sourceRepository: "https://github.com/40oleg/nona",
    sourcePullRequest: 603,
    sourceCommit,
    events: [],
    pass: false,
};
let child;
let closed;
let cleanupTimer;
try {
    report.identity = hostedIdentity();
    const revision = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: sourceRoot,
        encoding: "utf8",
        timeout: 10000,
    });
    assert.ifError(revision.error);
    assert.equal(revision.status, 0, revision.stderr);
    assert.equal(
        revision.stdout.trim(),
        sourceCommit,
        "unexpected #516 source revision",
    );
    const original = readFileSync(source, "utf8");
    report.originalHarnessSha256 = hash(original);
    report.serverSourceSha256 = hash(readFileSync(serverSource));
    // Add raw logs and process event records only. Preserve an exact original
    // beside the executed copy, and reject a changed insertion point.
    writeFileSync(join(out, "http-soak.original.mjs"), original);
    const marker = "let stopping = false;";
    assert.equal(
        original.split(marker).length,
        2,
        "soak diagnostic insertion point changed",
    );
    const diagnostics = `
const __diagOut = process.env.NONA_SOAK_DIAGNOSTICS;
let __diagSequence = 0;
function __diagEvent(event, value) {
    __diagAppendFileSync(__diagOut + "/server-events.jsonl", JSON.stringify({sequence: ++__diagSequence, time: new Date().toISOString(), event, ...value}) + "\\n");
}
__diagEvent("spawn", {pid: child.pid, serverPath});
child.stdout.on("data", chunk => __diagAppendFileSync(__diagOut + "/server.stdout.log", chunk));
child.stderr.on("data", chunk => __diagAppendFileSync(__diagOut + "/server.stderr.log", chunk));
child.on("error", error => __diagEvent("error", {name: error.name, code: error.code, message: error.message, stack: error.stack}));
child.on("exit", (code, signal) => __diagEvent("exit", {code, signal, hex: code > 255 ? "0x" + code.toString(16) : undefined}));
`;
    const importMarker = "import { mkdirSync,";
    assert.equal(
        original.split(importMarker).length,
        2,
        "soak diagnostic import changed",
    );
    const instrumented = original
        .replace(
            importMarker,
            "import { appendFileSync as __diagAppendFileSync, mkdirSync,",
        )
        .replace(marker, diagnostics + "\n" + marker);
    writeFileSync(source, instrumented);
    writeFileSync(join(out, "http-soak.executed.mjs"), instrumented);
    report.executedHarnessSha256 = hash(instrumented);
    report.diagnostics =
        "Raw server stdout/stderr and spawn/error/exit events only; workload and pass criteria unchanged.";
    const target = process.platform === "win32" ? "win32-x64" : "linux-x64";
    const args = [
        join(root, "dist", "cli.js"),
        "build",
        serverSource,
        "-o",
        binary,
        "--target",
        target,
        "--module",
    ];
    const build = spawnSync(process.execPath, args, {
        cwd: root,
        encoding: "utf8",
        timeout: 120000,
        maxBuffer: 16 * 1024 * 1024,
    });
    report.build = {
        args,
        status: build.status,
        signal: build.signal,
        stdout: build.stdout,
        stderr: build.stderr,
        error: build.error && errorInfo(build.error),
    };
    assert.ifError(build.error);
    assert.equal(
        build.status,
        0,
        "current compiler could not build recovered soak server",
    );
    report.binarySha256 = hash(readFileSync(binary));
    report.compilerCommit = report.identity.commit;
    report.compilerEntrySha256 = hash(
        readFileSync(join(root, "dist", "cli.js")),
    );
    report.command =
        "NONA_SOAK_MIX=big=1 NONA_SOAK_CONNECTIONS=1 node scripts/http-soak.mjs --smoke";
    report.settings = {
        minutes: 5,
        warmupMinutes: 1,
        sampleSeconds: 10,
        mix: "big=1",
        connections: 1,
        server: binary,
    };
    for (const name of [
        "server.stdout.log",
        "server.stderr.log",
        "server-events.jsonl",
    ])
        writeFileSync(join(out, name), "");
    child = spawn(
        process.execPath,
        ["scripts/http-soak.mjs", "--smoke", "--out", out],
        {
            cwd: sourceRoot,
            detached: process.platform !== "win32",
            stdio: ["ignore", "pipe", "pipe"],
            env: {
                ...process.env,
                NONA_SOAK_MIX: "big=1",
                NONA_SOAK_CONNECTIONS: "1",
                NONA_SOAK_MINUTES: "5",
                NONA_SOAK_WARMUP_MINUTES: "1",
                NONA_SOAK_SAMPLE_SECONDS: "10",
                NONA_SOAK_SERVER: binary,
                NONA_SOAK_DIAGNOSTICS: out.replaceAll("\\", "/"),
            },
        },
    );
    report.events.push({
        event: "harness.spawn",
        pid: child.pid,
        time: new Date().toISOString(),
    });
    closed = new Promise((done) =>
        child.on("close", (code, signal) => {
            report.exit = { code, signal };
            report.events.push({
                event: "harness.close",
                code,
                signal,
                time: new Date().toISOString(),
            });
            done();
        }),
    );
    child.on("error", (error) => {
        report.spawnError = errorInfo(error);
    });
    child.stdout.on("data", (chunk) => {
        appendFileSync(join(out, "harness.stdout.log"), chunk);
        process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
        appendFileSync(join(out, "harness.stderr.log"), chunk);
        process.stderr.write(chunk);
    });
    let timeout;
    try {
        await Promise.race([
            closed,
            new Promise((_, reject) => {
                timeout = setTimeout(() => {
                    report.events.push({
                        event: "harness.timeout",
                        time: new Date().toISOString(),
                    });
                    reject(
                        new Error(
                            "soak exceeded its eight-minute process deadline",
                        ),
                    );
                }, 8 * 60000);
            }),
        ]);
    } finally {
        clearTimeout(timeout);
    }
    assert.ifError(report.spawnError);
    assert.deepEqual(
        report.exit,
        { code: 0, signal: null },
        "original soak harness returned failure",
    );
    const soak = JSON.parse(readFileSync(join(out, "http-soak.json"), "utf8"));
    assert.equal(soak.summary.failed, 0, "soak recorded failed requests");
    assert.ok(
        soak.summary.ok >= 100,
        "soak must complete at least 100 responses",
    );
    assert.equal(soak.summary.pass, true, "original soak pass criteria failed");
    assert.equal(soak.crash, null);
    assert.deepEqual(soak.mix, { big: 1 });
    assert.equal(soak.config.connections, 1);
    report.pass = true;
} catch (error) {
    report.failure = errorInfo(error);
    console.error(error.stack || error);
    process.exitCode = 1;
} finally {
    if (child && child.exitCode === null && child.signalCode === null) {
        terminateTree();
        let timer;
        try {
            await Promise.race([
                closed,
                new Promise((_, reject) => {
                    timer = setTimeout(
                        () =>
                            reject(
                                new Error(
                                    "soak process cleanup exceeded five seconds",
                                ),
                            ),
                        5000,
                    );
                }),
            ]);
        } catch (error) {
            report.cleanupError = errorInfo(error);
            report.pass = false;
            process.exitCode = 1;
            child.stdout.destroy();
            child.stderr.destroy();
            child.unref();
        } finally {
            clearTimeout(timer);
        }
    }
    if (cleanupTimer) clearTimeout(cleanupTimer);
    // A successful harness must have reaped its native server. Check this even
    // when the original runner exited nonzero, so an orphan is never hidden.
    try {
        const events = readFileSync(join(out, "server-events.jsonl"), "utf8")
            .trim()
            .split(/\r?\n/)
            .map((line) => JSON.parse(line));
        report.serverEvents = events;
        const spawnEvent = events.find((entry) => entry.event === "spawn");
        if (
            spawnEvent?.pid &&
            !events.some((entry) => entry.event === "exit")
        ) {
            report.pass = false;
            process.exitCode = 1;
            try {
                process.kill(spawnEvent.pid, "SIGKILL");
                report.orphanCleanup = { pid: spawnEvent.pid };
            } catch (error) {
                if (error.code !== "ESRCH")
                    report.cleanupError = errorInfo(error);
            }
        }
    } catch (error) {
        report.pass = false;
        report.diagnosticsError = errorInfo(error);
        process.exitCode = 1;
    }
    writeFileSync(
        join(out, "verification.json"),
        JSON.stringify(report, null, 2) + "\n",
    );
}

function terminateTree() {
    if (!child?.pid) return;
    if (process.platform === "win32") {
        const killed = spawnSync(
            "taskkill",
            ["/PID", String(child.pid), "/T", "/F"],
            { encoding: "utf8", timeout: 10000 },
        );
        report.cleanup = {
            status: killed.status,
            stdout: killed.stdout,
            stderr: killed.stderr,
            error: killed.error && errorInfo(killed.error),
        };
    } else {
        try {
            process.kill(-child.pid, "SIGTERM");
        } catch (error) {
            if (error.code !== "ESRCH") report.cleanupError = errorInfo(error);
        }
        cleanupTimer = setTimeout(() => {
            try {
                process.kill(-child.pid, "SIGKILL");
            } catch (error) {
                if (error.code !== "ESRCH")
                    report.cleanupError = errorInfo(error);
            }
        }, 3000);
    }
}
