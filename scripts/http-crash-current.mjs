// Manual hosted diagnostic only. Never imports the compiler in this process.
import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    appendFileSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runTrial } from "./http-crash.mjs";
import { serverSource } from "./http-crash-fixture.mjs";
import { startupChildEnv } from "./http-startup-env.mjs";
import {
    currentCheckResult,
    projectionPlan,
    projectionAcceptance,
    sourceCommit,
    driverSha256,
    serverSha256,
    controlledReferenceSha256,
} from "./http-crash-current-policy.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const save = (file, value) =>
    writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const errorInfo = (error) => ({
    name: error.name,
    code: error.code,
    message: error.message,
    stack: error.stack,
});
const cleanExit = (t) =>
    t?.closed === true &&
    t?.code === 0 &&
    t.signal === null &&
    t.reason === null &&
    t.error === null &&
    !t.cleanupError &&
    t.dropped?.stdout === 0 &&
    t.dropped?.stderr === 0;

// The wrapper owns its server subtree. On interruption/deadline kill that tree
// while its direct child handle is still live, before awaiting close/restoration.
export function boundedChild(
    command,
    args,
    { directory, env, signal, timeoutMs, tree = false },
) {
    mkdirSync(directory, { recursive: true });
    // No child may exist until both raw sinks have been initialized.
    for (const stream of ["stdout", "stderr"])
        writeFileSync(join(directory, stream + ".log"), "");
    const started = Date.now();
    const child = spawn(command, args, {
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
    });
    const dropped = { stdout: 0, stderr: 0 },
        bytes = { stdout: 0, stderr: 0 };
    let reason = null,
        error = null,
        treeCleanup,
        cleanupTimer,
        timer;
    let settled = false;
    return new Promise((done) => {
        const remember = (e) => {
            error ??= errorInfo(e);
        };
        const finish = (code, childSignal, closed, cleanupError) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            clearTimeout(cleanupTimer);
            signal?.removeEventListener("abort", aborted);
            process.removeListener("exit", exit);
            const receipt = {
                pid: child.pid ?? null,
                code,
                signal: childSignal,
                closed,
                reason,
                error,
                dropped,
                elapsedMs: Date.now() - started,
                ...(treeCleanup ? { treeCleanup } : {}),
                ...(cleanupError
                    ? { cleanupError: errorInfo(cleanupError) }
                    : {}),
            };
            try {
                save(join(directory, "termination.json"), receipt);
            } catch (e) {
                remember(e);
                receipt.error = error;
            }
            done(receipt);
        };
        const stop = (why) => {
            if (settled || reason) return;
            reason = why;
            // Start the fallback before any best-effort tree/handle operations.
            cleanupTimer = setTimeout(() => {
                for (const release of [
                    () => child.stdout.destroy(),
                    () => child.stderr.destroy(),
                    () => child.unref(),
                ]) {
                    try {
                        release();
                    } catch (e) {
                        remember(e);
                    }
                }
                finish(
                    child.exitCode,
                    child.signalCode,
                    false,
                    new Error(
                        "Child close/cleanup exceeded five seconds; cleanup unconfirmed",
                    ),
                );
            }, 5000);
            const live = child.exitCode === null && child.signalCode === null;
            if (tree && child.pid && live) {
                try {
                    const killed = spawnSync(
                        "taskkill",
                        ["/PID", String(child.pid), "/T", "/F"],
                        {
                            windowsHide: true,
                            encoding: "utf8",
                            timeout: 10000,
                            env,
                        },
                    );
                    treeCleanup = {
                        pass: killed.status === 0 && !killed.error,
                        status: killed.status,
                        signal: killed.signal,
                        stdout: killed.stdout,
                        stderr: killed.stderr,
                        error: killed.error && errorInfo(killed.error),
                    };
                } catch (e) {
                    remember(e);
                    treeCleanup = { pass: false, error: errorInfo(e) };
                }
            } else if (tree) {
                treeCleanup = {
                    pass: false,
                    status: null,
                    reason: "Direct child exited before pipe close; subtree cleanup unconfirmed",
                };
            }
            if (live) {
                try {
                    child.kill("SIGKILL");
                } catch (e) {
                    remember(e);
                }
            }
        };
        const aborted = () => stop("aborted");
        const exit = () => stop("driver-exit");
        const failed = (e) => {
            if (settled) return;
            remember(e);
            stop("io-error");
        };
        child.on("error", (e) => {
            remember(e);
            stop("child-error");
        });
        child.on("close", (code, childSignal) =>
            finish(code, childSignal, true),
        );
        for (const stream of ["stdout", "stderr"]) {
            child[stream].on("error", failed);
            child[stream].on("data", (chunk) => {
                if (settled || error) return;
                try {
                    const kept = chunk.subarray(
                        0,
                        Math.max(0, 4 * 1024 * 1024 - bytes[stream]),
                    );
                    appendFileSync(join(directory, stream + ".log"), kept);
                    bytes[stream] += kept.length;
                    dropped[stream] += chunk.length - kept.length;
                } catch (e) {
                    failed(e);
                }
            });
        }
        signal?.addEventListener("abort", aborted, { once: true });
        process.once("exit", exit);
        timer = setTimeout(() => stop("deadline"), timeoutMs);
        if (signal?.aborted) aborted();
    });
}

const nativeIo = {
    read: readFileSync,
    write: writeFileSync,
    mkdir: mkdirSync,
    hash,
    capture: boundedChild,
    runTrial,
    serverSource: () => serverSource(false),
};

// Injectable external boundaries permit pure in-memory orchestration controls.
// Default execution remains guarded by main's exact hosted provenance checks.
export async function runCurrent({ root, origin, env, signal }, io = nativeIo) {
    if (io === nativeIo)
        assert.deepEqual(
            verifyCurrent(env),
            origin,
            "Verified matching hosted origin required",
        );
    const out = join(root, "work", "http602-current");
    io.mkdir(out, { recursive: true });
    const write = (file, value) =>
        io.write(file, JSON.stringify(value, null, 2) + "\n");
    const digestFile = (file) => io.hash(io.read(file));
    const sourceRoot = join(out, "soak-source");
    const driver = join(sourceRoot, "scripts", "http-soak.mjs");
    const reference = join(sourceRoot, "bench", "http", "soak-server.mjs");
    const summary = {
        origin,
        sourceCommit,
        driverSha256,
        serverSha256,
        controlledReferenceSha256,
        pressure: [],
        projection: [],
        diagnosticComplete: false,
        productAcceptance: false,
        historicalCausalRepair: "unproved",
        forcedGcOffMeansZeroCollections: false,
        limits: {
            driverMs: 28 * 60000,
            wrapperMs: 9 * 60000,
            buildMs: 120000,
            trialMs: 90000,
            jobMinutes: 35,
        },
        interpretation:
            "Original AB5 server continuous c32 correctness/resource witness and separate controlled-reference c1 queued-close projections only. The sources differ in stats and exception topology; AB5 pressure does not establish continuous c32 behavior of the frozen controlled reference. Original reports and verdicts are retained. p99 alone is observational. No runtime fix, issue closure or release acceptance.",
        dumpCollection:
            "No SDK installation or dump/environment inventory; raw stdout/stderr, process termination and own compiler assembly are retained.",
    };
    const checkpoint = () => write(join(out, "summary.json"), summary);
    const quiescent = (t) =>
        t?.closed === true &&
        !t.cleanupError &&
        (!t.treeCleanup || t.treeCleanup.pass === true);
    checkpoint();
    try {
        assert.equal(
            digestFile(driver),
            driverSha256,
            "Frozen original driver changed",
        );
        assert.equal(
            digestFile(reference),
            serverSha256,
            "Frozen original server changed",
        );
        assert.equal(
            digestFile(
                join(
                    root,
                    "tests",
                    "fixtures",
                    "http-crash",
                    "soak-server.mjs",
                ),
            ),
            controlledReferenceSha256,
            "Controlled source reference changed",
        );
        const compiler = join(root, "dist", "src", "compiler.js");
        summary.compiler = {
            sha: origin.head,
            tree: origin.tree,
            entrySha256: digestFile(compiler),
        };
        const baseEnv = startupChildEnv(env);
        for (const runtime of ["native-off", "node"]) {
            const directory = join(out, "pressure", runtime);
            io.mkdir(directory, { recursive: true });
            const arm = {
                runtime,
                accepted: false,
                status: "starting",
                forcedGc: "off",
                connections: 32,
                minutes: 5,
            };
            summary.pressure.push(arm);
            checkpoint();
            try {
                assert.ok(!signal?.aborted, "Driver deadline/interruption");
                arm.termination = await io.capture(
                    origin.nodeExecutable,
                    [join(root, "scripts", "http-soak-check.mjs")],
                    {
                        directory: join(directory, "wrapper"),
                        timeoutMs: 9 * 60000,
                        signal,
                        tree: true,
                        env: {
                            ...baseEnv,
                            NONA_RUNNER_ENVIRONMENT: "github-hosted",
                            NONA_SOAK_PROFILE: "http602-current",
                            NONA_SOAK_RUNTIME: runtime,
                            NONA_GC_STRESS: "off",
                            NONA_CACHE: "0",
                        },
                    },
                );
                assert.ok(
                    cleanExit(arm.termination),
                    "Wrapper failed/interrupted/truncated",
                );
                const receipt = JSON.parse(
                    io.read(join(directory, "verification.json"), "utf8"),
                );
                arm.verification = "verification.json";
                assert.equal(
                    receipt.pass,
                    true,
                    "Shared correctness/resource/cleanup decision failed",
                );
                assert.equal(receipt.correctnessSmoke?.pass, true);
                assert.equal(
                    receipt.restoration?.pass,
                    true,
                    "Wrapper did not verify source restoration",
                );
                assert.ok(
                    !receipt.cleanupError &&
                        !receipt.failure &&
                        !receipt.restorationError,
                );
                assert.equal(receipt.profile, "http602-current");
                assert.equal(receipt.runtime, runtime);
                assert.equal(receipt.originalHarnessSha256, driverSha256);
                assert.equal(receipt.serverSourceSha256, serverSha256);
                assert.equal(receipt.nodeExecutable, origin.nodeExecutable);
                assert.equal(
                    receipt.nodeExecutableSha256,
                    origin.nodeExecutableSha256,
                );
                for (const [key, value] of Object.entries({
                    commit: origin.head,
                    run: origin.run,
                    attempt: origin.attempt,
                    runner: origin.runner,
                    environment: "github-hosted",
                    node: origin.node,
                }))
                    assert.equal(
                        receipt.identity?.[key],
                        value,
                        `Wrong pressure ${key}`,
                    );
                for (const [key, value] of Object.entries({
                    minutes: 5,
                    warmupMinutes: 1,
                    sampleSeconds: 10,
                    mix: "big=1",
                    connections: 32,
                }))
                    assert.equal(
                        receipt.settings?.[key],
                        value,
                        `Wrong pressure ${key}`,
                    );
                if (runtime === "native-off") {
                    assert.equal(receipt.build?.status, 0);
                    assert.equal(receipt.build.signal, null);
                    assert.ok(
                        !receipt.build.error &&
                            receipt.build.args.at(-1) === "off",
                    );
                    assert.match(receipt.binarySha256, /^[a-f0-9]{64}$/);
                    assert.equal(receipt.compilerCommit, origin.head);
                    assert.equal(
                        receipt.compilerEntrySha256,
                        summary.compiler.entrySha256,
                    );
                } else assert.equal(receipt.build?.skipped, true);
                arm.accepted = true;
            } catch (error) {
                arm.failure = errorInfo(error);
            } finally {
                // A timed-out wrapper can die before its finally. Restore only
                // its recorded bytes, never a foreign or concurrently edited file.
                try {
                    assert.ok(
                        quiescent(arm.termination),
                        "Unconfirmed wrapper quiescence; refuse source mutation",
                    );
                    let restoredBy = "wrapper/original";
                    if (digestFile(driver) !== driverSha256) {
                        const patch = JSON.parse(
                            io.read(
                                join(directory, "http-soak.patch.json"),
                                "utf8",
                            ),
                        );
                        const original = io.read(
                            join(directory, "http-soak.original.mjs"),
                        );
                        assert.equal(io.hash(original), driverSha256);
                        assert.equal(patch.originalSha256, driverSha256);
                        assert.match(patch.executedSha256, /^[a-f0-9]{64}$/);
                        assert.equal(
                            digestFile(driver),
                            patch.executedSha256,
                            "Foreign driver; untouched",
                        );
                        io.write(driver, original);
                        restoredBy = "guarded fallback; arm remains failed";
                    }
                    assert.equal(digestFile(driver), driverSha256);
                    arm.restoration = {
                        pass: true,
                        restoredBy,
                        sha256: driverSha256,
                    };
                } catch (error) {
                    arm.restoration = { pass: false, error: errorInfo(error) };
                    arm.accepted = false;
                }
                arm.status = arm.accepted ? "observed" : "failed";
                write(join(directory, "orchestration.json"), arm);
                checkpoint();
            }
            assert.ok(
                quiescent(arm.termination),
                "Unconfirmed wrapper quiescence; stop subsequent workloads",
            );
        }
        const projectionRoot = join(out, "projection");
        io.mkdir(projectionRoot, { recursive: true });
        const controlled = join(projectionRoot, "controlled.mjs");
        io.write(controlled, io.serverSource());
        const sourceHash = digestFile(controlled);
        const images = new Map();
        for (const gc of ["off", "stress"]) {
            const directory = join(projectionRoot, gc),
                binary = join(directory, "nona-http.exe");
            io.mkdir(directory, { recursive: true });
            const image = {
                gc,
                compilerSha: origin.head,
                compilerTree: origin.tree,
                compilerEntrySha256: summary.compiler.entrySha256,
                sourceHash,
                pass: false,
            };
            try {
                assert.ok(!signal?.aborted, "Driver deadline/interruption");
                image.termination = await io.capture(
                    origin.nodeExecutable,
                    [
                        join(root, "scripts", "http-crash-build.mjs"),
                        controlled,
                        binary,
                        gc,
                    ],
                    {
                        directory: join(directory, "build"),
                        timeoutMs: 120000,
                        signal,
                        env: startupChildEnv(baseEnv, {
                            NONA_GC_STRESS: gc === "stress" ? "on" : "off",
                            NONA_CACHE: "0",
                        }),
                    },
                );
                assert.ok(
                    cleanExit(image.termination),
                    "Controlled compiler failed/interrupted/truncated",
                );
                assert.equal(
                    io.read(join(directory, "build", "stderr.log"), "utf8"),
                    "",
                );
                image.imageHash = digestFile(binary);
                image.pass = true;
                images.set(gc, { binary, ...image });
            } catch (error) {
                image.failure = errorInfo(error);
            }
            write(join(directory, "image.json"), image);
            assert.ok(
                quiescent(image.termination),
                "Unconfirmed compiler quiescence; stop subsequent workloads",
            );
        }
        for (const spec of projectionPlan()) {
            const directory = join(projectionRoot, spec.id);
            io.mkdir(directory, { recursive: true });
            const result = {
                spec,
                acceptance: {
                    accepted: false,
                    status: "failed",
                    unsentCloseObserved: false,
                    reason: "Not executed",
                },
            };
            summary.projection.push(result);
            checkpoint();
            let termination,
                trialStarted = false;
            try {
                assert.ok(!signal?.aborted, "Driver deadline/interruption");
                const native = spec.runtime === "nona",
                    image = images.get(spec.gc);
                assert.ok(
                    !native || image?.pass,
                    "Matching native image build unavailable",
                );
                const metadata = {
                    sha: origin.head,
                    tree: origin.tree,
                    workflowSha: origin.workflowSha,
                    workflowRun: origin.run,
                    workflowAttempt: origin.attempt,
                    nodeVersion: origin.node,
                    runnerName: origin.runner,
                    sourceHash,
                    imageHash: native
                        ? image.imageHash
                        : origin.nodeExecutableSha256,
                    compilerSha: native ? origin.head : null,
                    gcStress: native ? spec.gc : "n/a",
                };
                trialStarted = true;
                const row = await io.runTrial(spec, {
                    directory,
                    command: native ? image.binary : origin.nodeExecutable,
                    args: native ? [] : [controlled],
                    metadata,
                    startupMs: 60000,
                    hardMs: 90000,
                    signal,
                    env: startupChildEnv(baseEnv, {
                        NONA_GC_STRESS: spec.gc === "stress" ? "on" : "off",
                        NONA_CACHE: "0",
                    }),
                });
                // runTrial resolves its existing receipt only after actual close.
                termination = row.termination;
                result.rawVerdict = row.verdict;
                result.actualSettings = row.settings;
                for (const [key, value] of Object.entries(metadata))
                    assert.equal(row[key], value, `Wrong trial ${key}`);
                result.acceptance = projectionAcceptance(spec, row, {
                    trial: io.read(join(directory, "trial.json"), "utf8"),
                    termination: io.read(
                        join(directory, "termination.json"),
                        "utf8",
                    ),
                    stdout: io.read(join(directory, "stdout.log"), "utf8"),
                    stderr: io.read(join(directory, "stderr.log"), "utf8"),
                    client: io.read(join(directory, "client.jsonl"), "utf8"),
                });
            } catch (error) {
                result.failure = errorInfo(error);
            }
            write(join(directory, "current-acceptance.json"), result);
            checkpoint();
            assert.ok(
                !trialStarted || (termination && !termination.cleanupError),
                "Unconfirmed projection quiescence; stop subsequent workloads",
            );
        }
        // A per-row observation never substitutes for its matching Node control.
        const acceptedControls = new Map(
            summary.projection
                .filter(
                    (other) =>
                        other.spec.runtime === "node" &&
                        other.acceptance.accepted,
                )
                .map((other) => [other.spec.state, other]),
        );
        for (const result of summary.projection) {
            const control = acceptedControls.get(result.spec.state);
            result.matchedNodeAccepted =
                !!control &&
                [
                    "keepAliveTimeout",
                    "keepAliveTimeoutBuffer",
                    "timeout",
                    "requestTimeout",
                    "headersTimeout",
                ].every(
                    (key) =>
                        result.actualSettings?.[key] ===
                        control.actualSettings?.[key],
                );
            result.rawAcceptance = result.acceptance;
            if (!result.matchedNodeAccepted && result.acceptance.accepted)
                result.acceptance = {
                    ...result.acceptance,
                    accepted: false,
                    status: "failed",
                    unsentCloseObserved: false,
                    reason: "Matching Node projection did not meet strict acceptance",
                };
            result.pairedAccepted =
                result.acceptance.accepted && result.matchedNodeAccepted;
            write(
                join(projectionRoot, result.spec.id, "current-acceptance.json"),
                result,
            );
        }
        summary.diagnosticComplete =
            summary.pressure.length === 2 &&
            summary.pressure.every((a) => a.accepted) &&
            summary.projection.length === 6 &&
            summary.projection.every((r) => r.pairedAccepted);
    } catch (error) {
        summary.failure = errorInfo(error);
    } finally {
        checkpoint();
    }
    return summary;
}

export function verifyCurrent(env = process.env) {
    const out = resolve("work", "http602-current");
    mkdirSync(out, { recursive: true });
    // Fixed, bounded identity fields only; never enumerate the environment.
    const safe = (value) =>
        typeof value === "string" && /^[a-zA-Z0-9 ._/@:-]{0,256}$/.test(value)
            ? value
            : null;
    const admit = (head, phase) => {
        const result = currentCheckResult(
            env,
            head,
            process.platform,
            process.arch,
            process.version,
        );
        // This receipt precedes rejection and any Git/driver/compiler work.
        // It is separate from the stable origin compared by --verify/runCurrent.
        save(join(out, "admission.json"), {
            phase,
            ...result,
            identity: {
                repository: safe(env.GITHUB_REPOSITORY),
                event: safe(env.GITHUB_EVENT_NAME),
                mode: safe(env.HTTP602_MODE),
                ref: safe(env.GITHUB_REF),
                head: safe(head),
                sha: safe(env.GITHUB_SHA),
                expectedSha: safe(env.HTTP602_EXPECTED_SHA),
                workflowSha: safe(env.GITHUB_WORKFLOW_SHA),
                workflowRef: safe(env.GITHUB_WORKFLOW_REF),
                run: safe(env.GITHUB_RUN_ID),
                attempt: safe(env.GITHUB_RUN_ATTEMPT),
                runner: safe(env.RUNNER_NAME),
                environment: safe(env.RUNNER_ENVIRONMENT),
                runnerOs: safe(env.RUNNER_OS),
                image: safe(env.ImageOS),
                imageVersion: safe(env.ImageVersion),
                platform: process.platform,
                arch: process.arch,
                node: process.version,
            },
        });
        assert.equal(
            result.allowed,
            true,
            `Exact hosted current diagnostic provenance required: ${result.failedConditions.join(", ")}`,
        );
    };
    admit(env.GITHUB_SHA, "environment");
    const revision = (arg) =>
        execFileSync("git", ["rev-parse", arg], {
            encoding: "utf8",
            timeout: 10000,
        }).trim();
    const head = revision("HEAD"),
        tree = revision("HEAD^{tree}");
    admit(head, "checkout");
    assert.match(tree, /^[a-f0-9]{40}$/);
    return {
        head,
        tree,
        workflowSha: env.GITHUB_WORKFLOW_SHA,
        workflowRef: env.GITHUB_WORKFLOW_REF,
        workflowFileSha256: hash(
            readFileSync(".github/workflows/native-platforms.yml"),
        ),
        run: env.GITHUB_RUN_ID,
        attempt: env.GITHUB_RUN_ATTEMPT,
        ref: env.GITHUB_REF,
        runner: env.RUNNER_NAME,
        environment: env.RUNNER_ENVIRONMENT,
        image: env.ImageOS,
        imageVersion: env.ImageVersion,
        node: process.version,
        nodeExecutable: process.execPath,
        nodeExecutableSha256: hash(readFileSync(process.execPath)),
        sourceCommit,
        driverSha256,
        serverSha256,
        controlledReferenceSha256,
    };
}

async function main() {
    const args = process.argv.slice(2);
    assert.ok(
        args.length === 0 || (args.length === 1 && args[0] === "--verify"),
        "Expected no args or --verify",
    );
    const origin = verifyCurrent();
    const root = resolve("."),
        out = join(root, "work", "http602-current");
    mkdirSync(out, { recursive: true });
    if (args[0] === "--verify") {
        save(join(out, "provenance.json"), origin);
        return;
    }
    assert.deepEqual(
        JSON.parse(readFileSync(join(out, "provenance.json"), "utf8")),
        origin,
        "Candidate/workflow/runner changed after verification",
    );
    const controller = new AbortController(),
        abort = () => controller.abort();
    const timer = setTimeout(abort, 28 * 60000);
    process.once("SIGINT", abort);
    process.once("SIGTERM", abort);
    try {
        const result = await runCurrent({
            root,
            origin,
            env: process.env,
            signal: controller.signal,
        });
        if (!result.diagnosticComplete) process.exitCode = 1;
    } finally {
        clearTimeout(timer);
        process.removeListener("SIGINT", abort);
        process.removeListener("SIGTERM", abort);
    }
}
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    await main().catch((error) => {
        console.error(error.stack ?? error);
        process.exitCode = 1;
    });
}
