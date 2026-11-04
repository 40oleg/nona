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
import {
    instrumentLegacyCompletion,
    legacyCorrectnessSmoke,
} from "./http-soak-smoke-policy.mjs";
import { patchDriver } from "./http-latency615-support.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Only these fixed cases are supported. Existing callers retain c1/native.
const profile = process.env.NONA_SOAK_PROFILE ?? "current";
const runtime = process.env.NONA_SOAK_RUNTIME ?? "native";
assert.ok(
    (profile === "current" && runtime === "native") ||
        (profile === "http602-current" &&
            ["native-off", "node"].includes(runtime)),
    "unsupported soak profile/runtime",
);
const current602 = profile === "http602-current";
const sourceRoot = current602
    ? join(root, "work", "http602-current", "soak-source")
    : join(root, "work", "http-601-soak-source");
const out = current602
    ? join(root, "work", "http602-current", "pressure", runtime)
    : join(root, "work", "http-601", "soak");
const connections = current602 ? 32 : 1;
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
writeFileSync(join(out, "harness-exit.json"), "");
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
let original;
let sourcePatched = false;
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
    original = readFileSync(source);
    report.originalHarnessSha256 = hash(original);
    report.serverSourceSha256 = hash(readFileSync(serverSource));
    if (current602) {
        assert.equal(
            report.serverSourceSha256,
            "3bae7410ac2d9afcb9a9e1431919a2aa5b5ca352db578769810a24f0ac718f60",
            "original reference server changed",
        );
        report.profile = profile;
        report.runtime = runtime;
        report.sourceRoot = sourceRoot;
        report.output = out;
        report.nodeExecutable = process.execPath;
        report.nodeExecutableSha256 = hash(readFileSync(process.execPath));
    }
    // Apply the accepted, byte-pinned lossless observer before wrapper logging.
    // It owns raw stdout/stderr; keep the wrapper's event/exit cleanup receipts.
    writeFileSync(
        join(out, "http-soak.original.mjs"),
        original,
        current602 ? { flag: "wx" } : undefined,
    );
    const lossless = patchDriver(original);
    const driver = lossless.source.toString("utf8");
    const marker = "let stopping = false;";
    assert.equal(
        driver.split(marker).length,
        2,
        "soak diagnostic insertion point changed",
    );
    const diagnostics = `
const __diagOut = process.env.NONA_SOAK_DIAGNOSTICS;
let __diagSequence = 0;
process.on("exit", code => __diagAppendFileSync(__diagOut + "/harness-exit.json", JSON.stringify({time: new Date().toISOString(), code})));
function __diagEvent(event, value) {
    __diagAppendFileSync(__diagOut + "/server-events.jsonl", JSON.stringify({sequence: ++__diagSequence, time: new Date().toISOString(), event, ...value}) + "\\n");
}
__diagEvent("spawn", {pid: child.pid, serverPath});
child.on("error", error => __diagEvent("error", {name: error.name, code: error.code, message: error.message, stack: error.stack}));
child.on("exit", (code, signal) => __diagEvent("exit", {code, signal, hex: code > 255 ? "0x" + code.toString(16) : undefined}));
`;
    const importMarker = "import { mkdirSync,";
    assert.equal(
        driver.split(importMarker).length,
        2,
        "soak diagnostic import changed",
    );
    const instrumented = instrumentLegacyCompletion(driver)
        .replace(
            importMarker,
            "import { appendFileSync as __diagAppendFileSync, mkdirSync,",
        )
        .replace(marker, diagnostics + "\n" + marker);
    report.executedHarnessSha256 = hash(instrumented);
    writeFileSync(source, instrumented);
    sourcePatched = true;
    writeFileSync(join(out, "http-soak.executed.mjs"), instrumented);
    writeFileSync(
        join(out, "http-soak.patch.json"),
        JSON.stringify(
            {
                sourceCommit,
                originalSha256: report.originalHarnessSha256,
                losslessSha256: lossless.sha256,
                executedSha256: report.executedHarnessSha256,
                recipe: lossless.recipe,
            },
            null,
            2,
        ) + "\n",
    );
    report.diagnostics =
        "Accepted lossless intervals, selections, CPU and phase/process/pipe receipts plus raw server logs, wrapper cleanup and final driver completion/error receipts; original workload, reports and pass criteria unchanged. A separate smoke correctness decision defers only p99.";
    const target = process.platform === "win32" ? "win32-x64" : "linux-x64";
    const args = current602
        ? [
              join(root, "scripts", "http-crash-build.mjs"),
              serverSource,
              binary,
              "off",
          ]
        : [
              join(root, "dist", "cli.js"),
              "build",
              serverSource,
              "-o",
              binary,
              "--target",
              target,
              "--module",
          ];
    if (runtime === "node") {
        report.build = {
            skipped: true,
            reason: "Node control executes the frozen original source; no native image",
        };
    } else {
        const build = spawnSync(process.execPath, args, {
            cwd: root,
            encoding: "utf8",
            timeout: 120000,
            maxBuffer: 16 * 1024 * 1024,
            ...(current602
                ? { env: { ...process.env, NONA_GC_STRESS: "off" } }
                : {}),
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
            readFileSync(
                join(root, "dist", current602 ? "src/compiler.js" : "cli.js"),
            ),
        );
    }
    const server = runtime === "node" ? serverSource : binary;
    report.command = `NONA_SOAK_MIX=big=1 NONA_SOAK_CONNECTIONS=${connections} node scripts/http-soak.mjs --smoke`;
    report.settings = {
        minutes: 5,
        warmupMinutes: 1,
        sampleSeconds: 10,
        mix: "big=1",
        connections,
        server,
    };
    for (const name of [
        "server.stdout.log",
        "server.stderr.log",
        "server-events.jsonl",
        "harness.stdout.log",
        "harness.stderr.log",
        "driver-completion.json",
        "driver-errors.jsonl",
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
                NONA_SOAK_CONNECTIONS: String(connections),
                NONA_SOAK_MINUTES: "5",
                NONA_SOAK_WARMUP_MINUTES: "1",
                NONA_SOAK_SAMPLE_SECONDS: "10",
                NONA_SOAK_SERVER: server,
                NONA_SOAK_DIAGNOSTICS: out.replaceAll("\\", "/"),
                ...(current602 ? { NONA_GC_STRESS: "off" } : {}),
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
    // Keep native process exit distinct from close (which also waits for pipes).
    // The recovered harness records its earlier JavaScript exit event separately.
    child.on("exit", (code, signal) => {
        report.events.push({
            event: "harness.exit",
            code,
            signal,
            time: new Date().toISOString(),
        });
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
    report.correctnessSmoke = legacyCorrectnessSmoke(
        {
            json: readFileSync(join(out, "http-soak.json"), "utf8"),
            markdown: readFileSync(join(out, "http-soak.md"), "utf8"),
            stdout: readFileSync(join(out, "harness.stdout.log"), "utf8"),
            stderr: readFileSync(join(out, "harness.stderr.log"), "utf8"),
            exit: report.exit,
            events: report.events,
            serverEvents: readFileSync(join(out, "server-events.jsonl"), "utf8")
                .trim()
                .split(/\r?\n/)
                .map((line) => JSON.parse(line)),
            jsExit: JSON.parse(
                readFileSync(join(out, "harness-exit.json"), "utf8"),
            ),
            completion: JSON.parse(
                readFileSync(join(out, "driver-completion.json"), "utf8"),
            ),
            driverErrors: readFileSync(
                join(out, "driver-errors.jsonl"),
                "utf8",
            ),
        },
        current602 ? { expectedConnections: 32 } : undefined,
    );
    if (current602)
        assert.equal(
            readFileSync(join(out, "server.stderr.log"), "utf8"),
            "",
            "unexpected server stderr",
        );
    report.pass = report.correctnessSmoke.pass;
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
    if (current602 && sourcePatched) {
        try {
            // Restore only our exact executed bytes from the immutable original.
            // A changed checkout belongs to someone else: fail without writing.
            assert.equal(
                hash(readFileSync(source)),
                report.executedHarnessSha256,
                "refuse restoration: executed driver changed",
            );
            assert.equal(
                hash(readFileSync(join(out, "http-soak.original.mjs"))),
                report.originalHarnessSha256,
                "refuse restoration: original evidence changed",
            );
            assert.equal(hash(original), report.originalHarnessSha256);
            writeFileSync(source, original);
            assert.equal(
                hash(readFileSync(source)),
                report.originalHarnessSha256,
            );
            report.restoration = {
                pass: true,
                originalSha256: report.originalHarnessSha256,
                executedSha256: report.executedHarnessSha256,
            };
        } catch (error) {
            report.restorationError = errorInfo(error);
            report.pass = false;
            process.exitCode = 1;
        }
    }
    if (current602 && report.cleanupError) {
        report.pass = false;
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
