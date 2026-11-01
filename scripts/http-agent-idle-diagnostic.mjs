// #616: bounded, one-attempt hosted evidence, never a replacement for full CI.
// Importing this module in the small Node tests cannot load the compiler.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
    appendFileSync,
    chmodSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makePlan } from "./http-agent-idle-sources.mjs";
export { makePlan };

export const SOURCE_PIN = "7b4b56cc7eb644870dd2cc270d82a0815618b8ae";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "work", "idle616-diagnostic");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path, value) =>
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const git = (args, cwd = root, input) => {
    const result = spawnSync("git", args, { cwd, input, windowsHide: true });
    if (result.error || result.status !== 0)
        throw new Error(
            "git " +
                args.join(" ") +
                ": " +
                (result.error?.message ?? result.stderr.toString()),
        );
    return result.stdout.toString().trim();
};
const blob = (path) => {
    const bytes = readFileSync(path);
    return { path, bytes: bytes.length, sha256: sha(bytes) };
};
const errorRecord = (error) =>
    error
        ? {
              ...Object.fromEntries(
                  Object.getOwnPropertyNames(error).map((name) => [
                      name,
                      error[name],
                  ]),
              ),
              name: error.name,
              message: error.message,
              stack: error.stack,
          }
        : null;

export function hostedGuard(env, platform, arch, version, head) {
    assert.equal(env.GITHUB_ACTIONS, "true");
    assert.equal(env.RUNNER_ENVIRONMENT, "github-hosted");
    assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
    assert.equal(env.GITHUB_REPOSITORY, "40oleg/nona");
    assert.match(env.GITHUB_REF ?? "", /^refs\/heads\//);
    assert.notEqual(env.GITHUB_REF, "refs/heads/main");
    assert.match(env.DIAGNOSTIC_COMMIT ?? "", /^[0-9a-f]{40}$/);
    assert.equal(env.DIAGNOSTIC_COMMIT, head);
    assert.equal(env.GITHUB_SHA, head);
    assert.equal(arch, "x64");
    assert.ok(platform === "linux" || platform === "win32");
    assert.equal(env.DIAGNOSTIC_TARGET, platform + "-x64");
    assert.equal(version, "v26.9.0");
    // compileModuleToIR defaults must be the original helper's defaults.
    for (const name of [
        "NONA_NO_BUILTIN_PRUNING",
        "NONA_NO_INLINE",
        "NONA_SHAPE_STATS",
        "NONA_CALL_STATS",
        "NONA_COVERAGE",
    ])
        assert.ok(!env[name], "Unexpected compiler override: " + name);
}

export function verifyOriginals(cwd = root) {
    const paths = [
        "src",
        "tests/helpers",
        "tests/http-agent.test.ts",
        "tests/http-agent-fixtures.test.ts",
        "tests/http-agent-source.test.ts",
        "tests/http-agent-retained-control.test.ts",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "scripts/build.mjs",
        "scripts/lib-sources.mjs",
    ];
    const entries = git(["ls-tree", "-r", SOURCE_PIN, "--", ...paths], cwd)
        .split("\n")
        .map((line) => {
            const match = /^\d+ blob ([a-f0-9]{40})\t(.+)$/.exec(line);
            assert.ok(match, "Malformed pinned tree entry");
            return { gitBlob: match[1], path: match[2] };
        });
    assert.ok(
        entries.length > 100,
        "Incomplete compiler/fixture pin inventory",
    );
    // One read-only batch; --path filters account for Windows checkout CRLF.
    const actual = git(
        ["hash-object", "--stdin-paths"],
        cwd,
        entries.map((entry) => entry.path).join("\n") + "\n",
    ).split("\n");
    assert.equal(actual.length, entries.length);
    entries.forEach((entry, i) => {
        assert.equal(
            actual[i],
            entry.gitBlob,
            "Original changed: " + entry.path,
        );
        entry.rawSha256 = blob(join(cwd, entry.path)).sha256;
    });
    return {
        sourcePin: SOURCE_PIN,
        sourceTree: git(["rev-parse", SOURCE_PIN + "^{tree}"], cwd),
        files: entries,
        compilerSourceSha256: sha(JSON.stringify(entries)),
    };
}

// Direct execution with byte-preserving pipes. No runOnHost/HostRun string
// conversion or early stdout assertion can discard stderr, signal or errors.
export function supervise(command, args, cwd, id, boundMs, env = process.env) {
    assert.ok(Number.isInteger(boundMs) && boundMs > 0 && boundMs <= 180000);
    mkdirSync(cwd, { recursive: true });
    const prefix = join(cwd, id);
    const stdoutPath = prefix + ".stdout.bin",
        stderrPath = prefix + ".stderr.bin";
    writeFileSync(stdoutPath, Buffer.alloc(0));
    writeFileSync(stderrPath, Buffer.alloc(0));
    const start = process.hrtime.bigint();
    const elapsed = () => Number(process.hrtime.bigint() - start) / 1e6;
    const receipt = {
        id,
        command,
        args,
        cwd,
        boundMs,
        startedAt: new Date().toISOString(),
        status: null,
        signal: null,
        error: null,
        deadlineExceeded: false,
        exitSeen: false,
        closeSeen: false,
        forcedPipeCleanup: false,
        pipes: {
            stdoutEnded: false,
            stderrEnded: false,
            stdoutClosed: false,
            stderrClosed: false,
        },
        events: [],
    };
    return new Promise((resolveRun) => {
        let child,
            deadline,
            cleanup,
            finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(deadline);
            clearTimeout(cleanup);
            receipt.durationMs = elapsed();
            receipt.stdout = blob(stdoutPath);
            receipt.stderr = blob(stderrPath);
            json(prefix + ".receipt.json", receipt);
            resolveRun(receipt);
        };
        const kill = () => {
            receipt.deadlineExceeded = true;
            receipt.events.push({
                event: "deadline",
                ms: elapsed(),
                signal: "SIGKILL",
            });
            child.kill("SIGKILL");
            cleanup = setTimeout(() => {
                receipt.forcedPipeCleanup = true;
                child.stdout.destroy();
                child.stderr.destroy();
                finish();
            }, 2000);
        };
        try {
            child = spawn(command, args, {
                cwd,
                env,
                windowsHide: true,
                stdio: ["ignore", "pipe", "pipe"],
                shell: false,
            });
        } catch (error) {
            receipt.error = errorRecord(error);
            finish();
            return;
        }
        for (const [name, path] of [
            ["stdout", stdoutPath],
            ["stderr", stderrPath],
        ]) {
            child[name].on("data", (bytes) => appendFileSync(path, bytes));
            child[name].on("end", () => {
                receipt.pipes[name + "Ended"] = true;
                receipt.events.push({ event: name + "-end", ms: elapsed() });
            });
            child[name].on("close", () => {
                receipt.pipes[name + "Closed"] = true;
                receipt.events.push({ event: name + "-close", ms: elapsed() });
            });
            child[name].on("error", (error) => {
                receipt.error = errorRecord(error);
            });
        }
        child.on("error", (error) => {
            receipt.error = errorRecord(error);
            receipt.events.push({ event: "error", ms: elapsed() });
        });
        child.on("exit", (status, signal) => {
            receipt.status = status;
            receipt.signal = signal;
            receipt.exitSeen = true;
            receipt.events.push({
                event: "exit",
                status,
                signal,
                ms: elapsed(),
            });
        });
        child.on("close", (status, signal) => {
            receipt.status = status;
            receipt.signal = signal;
            receipt.closeSeen = true;
            receipt.events.push({
                event: "close",
                status,
                signal,
                ms: elapsed(),
            });
            finish();
        });
        deadline = setTimeout(kill, boundMs);
    });
}

const expectedPlan = [
    [
        "original-stress",
        true,
        "on",
        ["native", "oracle-unstaged", "node-staged"],
    ],
    ["normal-off", false, "off", ["native", "node-normal"]],
    ["scalar-stress", true, "on", ["native", "node-scalar"]],
    ["trace-stress", true, "on", ["native", "node-trace"]],
];
const originalHashes = [
    "3a56740f611c7b8c983180cd1f47f5fd86a2748a9eeb53f591cbb8ad721ca764",
    "2a7ed3b3c82fce0911892574dd73f314def670a890e8ea9ee83a8b5584343abf",
];
function checkBlob(value, verifyFiles) {
    assert.equal(typeof value.path, "string");
    assert.ok(value.path.length > 0);
    assert.ok(Number.isInteger(value.bytes) && value.bytes >= 0);
    assert.match(value.sha256, /^[a-f0-9]{64}$/);
    if (verifyFiles) assert.deepEqual(blob(value.path), value);
}
function checkRun(run, verifyFiles) {
    assert.equal(run.status, 0);
    assert.equal(run.signal, null);
    assert.equal(run.error, null);
    assert.equal(run.deadlineExceeded, false);
    assert.equal(run.forcedPipeCleanup, false);
    assert.equal(run.exitSeen, true);
    assert.equal(run.closeSeen, true);
    assert.ok(!run.skipped && !run.cancelled && !run.todo);
    for (const field of [
        "stdoutEnded",
        "stderrEnded",
        "stdoutClosed",
        "stderrClosed",
    ])
        assert.equal(run.pipes[field], true);
    assert.ok(Number.isFinite(run.durationMs) && run.durationMs >= 0);
    assert.ok(Number.isFinite(Date.parse(run.startedAt)));
    assert.equal(typeof run.command, "string");
    assert.ok(run.command.length > 0);
    assert.ok(
        Array.isArray(run.args) &&
            run.args.every((arg) => typeof arg === "string"),
    );
    assert.equal(typeof run.cwd, "string");
    assert.ok(
        Array.isArray(run.events) &&
            run.events.some((e) => e.event === "exit") &&
            run.events.some((e) => e.event === "close"),
    );
    checkBlob(run.stdout, verifyFiles);
    checkBlob(run.stderr, verifyFiles);
    assert.equal(run.stderr.bytes, 0);
}

export function validateReport(report, verifyFiles = false, plan) {
    assert.equal(report.schema, 1);
    assert.equal(report.complete, true);
    assert.equal(report.identity.sourcePin, SOURCE_PIN);
    assert.match(report.identity.head, /^[a-f0-9]{40}$/);
    assert.match(report.identity.tree, /^[a-f0-9]{40}$/);
    assert.equal(report.cases.length, 4);
    report.cases.forEach((entry, i) => {
        const [id, requested, selection, runs] = expectedPlan[i];
        assert.equal(entry.id, id);
        checkBlob(entry.source, verifyFiles);
        assert.ok(entry.source.bytes > 0);
        if (plan) assert.equal(entry.source.sha256, sha(plan[i].source));
        if (i < 2) assert.equal(entry.source.sha256, originalHashes[i]);
        const build = entry.build;
        assert.equal(build.requestedGC, requested);
        assert.equal(build.moduleLoadSelection, selection);
        assert.equal(build.actualGC, requested && selection !== "off");
        assert.equal(build.target, report.identity.target);
        assert.equal(build.head, report.identity.head);
        assert.equal(build.tree, report.identity.tree);
        assert.equal(build.sourceSha256, entry.source.sha256);
        assert.match(build.compilerSha256, /^[a-f0-9]{64}$/);
        assert.deepEqual(build.options, { gcStress: requested });
        assert.equal(
            build.pipeline,
            "compileModuleToIR(source, entry) -> generate(ir, {gcStress}) -> linkHost(program)",
        );
        assert.equal(typeof build.imageRetained, "boolean");
        if (!build.imageRetained) assert.equal(entry.comparison.ok, true);
        checkBlob(build.image, verifyFiles && build.imageRetained);
        assert.ok(build.image.bytes > 0);
        checkRun(entry.builder, verifyFiles);
        assert.equal(entry.builder.boundMs, 180000);
        assert.equal(entry.runs.length, runs.length);
        entry.runs.forEach((run, j) => {
            assert.equal(run.id, runs[j]);
            checkRun(run, verifyFiles);
            assert.ok(run.stdout.bytes > 0, "Empty case output");
            checkBlob(run.source, verifyFiles);
            assert.ok(run.source.bytes > 0);
            assert.equal(run.boundMs, j === 0 && requested ? 180000 : 60000);
            if (j === 0) {
                assert.equal(run.source.sha256, entry.source.sha256);
                assert.equal(run.executableSha256, build.image.sha256);
                assert.equal(run.engine, "native");
                assert.equal(run.actualGC, requested);
            } else {
                assert.equal(run.engine, "node");
                assert.equal(run.actualGC, false);
                assert.match(run.executableSha256, /^[a-f0-9]{64}$/);
                if (plan)
                    assert.equal(
                        run.source.sha256,
                        sha(plan[i].controls[j - 1].source),
                    );
            }
        });
        assert.equal(entry.comparison.ok, true);
    });
    return true;
}

async function loadPlan() {
    const { agentCases } = await import(
        pathToFileURL(join(root, "dist/tests/helpers/http-agent-cases.js"))
    );
    const { agentProgram } = await import(
        pathToFileURL(join(root, "dist/tests/helpers/http-agent-policy.js"))
    );
    const witness = agentCases.find((entry) => entry.id === "idle-timeout");
    const plan = makePlan(witness, agentProgram);
    assert.equal(sha(plan[0].source), originalHashes[0]);
    assert.equal(sha(plan[1].source), originalHashes[1]);
    return { plan, expected: witness.expected.join("\n") + "\n" };
}

function compiledInventory() {
    const files = [];
    const visit = (directory) => {
        for (const entry of readdirSync(directory, {
            withFileTypes: true,
        }).sort((a, b) => a.name.localeCompare(b.name))) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (entry.name.endsWith(".js")) files.push(blob(path));
        }
    };
    visit(join(root, "dist/src"));
    for (const name of [
        "host",
        "program",
        "http-agent-cases",
        "http-agent-policy",
    ])
        files.push(blob(join(root, "dist/tests/helpers", name + ".js")));
    assert.ok(files.length > 100);
    return { files, sha256: sha(JSON.stringify(files)) };
}

function identity() {
    const head = git(["rev-parse", "HEAD"]);
    const partial = {
        sourcePin: SOURCE_PIN,
        head,
        tree: git(["rev-parse", "HEAD^{tree}"]),
        target: process.platform + "-" + process.arch,
        node: process.version,
        requestedCommit: process.env.DIAGNOSTIC_COMMIT,
        checkout: process.env.GITHUB_SHA,
        ref: process.env.GITHUB_REF,
        workflowRef: process.env.GITHUB_WORKFLOW_REF,
        runId: process.env.GITHUB_RUN_ID,
        runAttempt: process.env.GITHUB_RUN_ATTEMPT,
        runnerEnvironment: process.env.RUNNER_ENVIRONMENT,
        runnerOS: process.env.RUNNER_OS,
    };
    json(join(output, "identity.json"), partial);
    hostedGuard(
        process.env,
        process.platform,
        process.arch,
        process.version,
        head,
    );
    const originals = verifyOriginals();
    json(join(output, "originals.json"), originals);
    return {
        ...partial,
        sourceTree: originals.sourceTree,
        compilerSourceSha256: originals.compilerSourceSha256,
    };
}

// Only this hosted entry imports any compiler/backend/helper modules. The parent
// spawns a fresh Node process for EVERY build with on/off set before module load.
async function hostedBuild(caseId) {
    const host = identity();
    const { plan } = await loadPlan();
    const item = plan.find((entry) => entry.id === caseId);
    assert.ok(item, "Unknown case");
    assert.equal(process.env.NONA_GC_STRESS, item.selection);
    const moduleLoadSelection = process.env.NONA_GC_STRESS;
    const directory = join(output, item.id);
    const entry = join(directory, "native", "main.mjs");
    const source = readFileSync(entry, "utf8");
    assert.equal(source, item.source);
    const compiler = compiledInventory();
    json(join(directory, "compiler.json"), compiler);
    // Pin verification above includes the module-load off guard in codegen.ts.
    // Record the derived effective setting explicitly; normal is never forced GC.
    const actualGC = item.requestedGC && moduleLoadSelection !== "off";
    const { compileModuleToIR } = await import("../dist/src/compiler.js");
    const { generate } = await import("../dist/src/backend/x64/codegen.js");
    const { linkHost } = await import("../dist/tests/helpers/program.js");
    const ir = compileModuleToIR(source, entry);
    assert.equal(ir.runtimePrelude, true);
    const program = generate(ir, { gcStress: item.requestedGC });
    const imagePath = join(
        directory,
        "native",
        process.platform === "win32" ? "image.exe" : "image",
    );
    writeFileSync(imagePath, linkHost(program));
    chmodSync(imagePath, 0o755);
    json(join(directory, "build.json"), {
        head: host.head,
        tree: host.tree,
        target: host.target,
        sourceSha256: sha(source),
        image: blob(imagePath),
        compilerSha256: compiler.sha256,
        requestedGC: item.requestedGC,
        moduleOptions: {
            host: "default nodeModuleHost",
            scriptPrelude: "",
            target: host.target,
            lowering: { inline: true },
        },
        runtimeLink:
            "generate default full runtime; no link option or public compile profile",
        moduleLoadSelection,
        actualGC,
        effectiveSelectionEvidence:
            "pinned codegen module-load off guard + fresh-process environment + generate options (derived, not independent runtime telemetry)",
        imageRetained: true,
        options: { gcStress: item.requestedGC },
        pipeline:
            "compileModuleToIR(source, entry) -> generate(ir, {gcStress}) -> linkHost(program)",
    });
}

export function compare(entry, expected) {
    const normalizedExpected = expected.replaceAll("\r\n", "\n");
    const observations = [];
    let failure = entry.runs.length ? null : { message: "Zero executed cases" };
    for (const run of entry.runs) {
        try {
            checkRun(run, true);
            const text = readFileSync(run.stdout.path, "utf8").replaceAll(
                "\r\n",
                "\n",
            );
            // Exact cases use every byte of decoded stdout, normalizing only
            // CRLF. Only a validated observer suffix can be separated below.
            let base = text;
            const observation = {
                id: run.id,
                matchesOriginalExpected: false,
            };
            observations.push(observation);
            // The end assertion requires the absolute end of stdout, including
            // its final newline; no trailing output or blank line is permitted.
            if (entry.id === "scalar-stress") {
                const scalar =
                    /\ndiagnostic scalar (true|false) (true|false)\n(?![\s\S])/.exec(
                        text,
                    );
                assert.ok(scalar, "Missing/malformed scalar liveness");
                // Keep the preceding newline in the full original output.
                // Extra/duplicate markers before this suffix stay in base.
                base = text.slice(0, scalar.index + 1);
                observation.scalar = {
                    destroyedBeforeArm: scalar[1] === "true",
                    freeBeforeArm: scalar[2] === "true",
                };
            }
            if (entry.id === "trace-stress") {
                const match =
                    /\ndiagnostic trace ([1-9]\d*) false\n((?:trace [^\n]+\n)+)(?![\s\S])/.exec(
                        text,
                    );
                assert.ok(match, "Missing/malformed/overflowed trace");
                base = text.slice(0, match.index + 1);
                const rows = match[2]
                    .slice(0, -1)
                    .split("\n")
                    .map((line) => {
                        assert.match(
                            line,
                            /^trace(?: -?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?){4}$/,
                            "Malformed trace numeric fields",
                        );
                        return line.split(" ").slice(1).map(Number);
                    });
                assert.equal(rows.length, Number(match[1]));
                assert.ok(
                    rows.every(
                        (row) => row.length === 4 && row.every(Number.isFinite),
                    ),
                );
                assert.ok(
                    rows.every(
                        (row) =>
                            [
                                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14,
                            ].includes(row[0]) && row[1] >= 0,
                    ),
                    "Unknown event code or invalid timestamp",
                );
                assert.ok(
                    rows.every((row, i) => i === 0 || row[1] >= rows[i - 1][1]),
                );
                for (const code of [1, 2, 4, 5, 6, 7, 9, 10, 13])
                    assert.ok(
                        rows.some((row) => row[0] === code),
                        "Missing trace event " + code,
                    );
                assert.ok(
                    rows.some((row) => row[0] === 1 && row[2] === 6000),
                    "Missing default peer arm",
                );
                observation.trace = rows;
            }
            observation.matchesOriginalExpected = base === normalizedExpected;
            assert.equal(base, normalizedExpected);
        } catch (error) {
            failure ??= errorRecord(error);
        }
    }
    return { ok: failure === null, error: failure, observations };
}

async function campaign() {
    const report = {
        schema: 1,
        complete: false,
        purpose:
            "One attempt per case; discriminating evidence only, no causal conclusion or full-CI readiness",
        budget: {
            attemptsPerCase: 1,
            nativeCases: 4,
            nodeControls: 5,
            buildBoundMs: 180000,
            jobMinutes: 45,
        },
        cases: [],
    };
    const save = () => json(join(output, "report.json"), report);
    save();
    try {
        report.identity = identity();
        save();
        const { plan, expected } = await loadPlan();
        json(
            join(output, "plan.json"),
            plan.map((item) => ({
                id: item.id,
                requestedGC: item.requestedGC,
                moduleLoadSelection: item.selection,
                sourceSha256: sha(item.source),
                nativeBoundMs: item.nativeBoundMs,
                controls: item.controls.map((control) => ({
                    id: control.id,
                    sourceSha256: sha(control.source),
                    actualGC: false,
                    boundMs: control.boundMs,
                })),
                apiDeadlines: {
                    clientIdleMs: 200,
                    serverKeepAliveMs: 5000,
                    serverBufferMs: 1000,
                    cleanupWatchdogMs: item.requestedGC ? null : 6000,
                    nodeCleanupWatchdogMs: 6000,
                },
            })),
        );
        const nodeHash = blob(process.execPath).sha256;
        for (const item of plan) {
            const directory = join(output, item.id);
            const nativeDirectory = join(directory, "native");
            mkdirSync(nativeDirectory, { recursive: true });
            const sourcePath = join(nativeDirectory, "main.mjs");
            writeFileSync(sourcePath, item.source);
            const entry = {
                id: item.id,
                source: blob(sourcePath),
                runs: [],
                build: null,
            };
            report.cases.push(entry);
            save();
            try {
                entry.builder = await supervise(
                    process.execPath,
                    [fileURLToPath(import.meta.url), "--hosted-build", item.id],
                    directory,
                    "builder",
                    180000,
                    { ...process.env, NONA_GC_STRESS: item.selection },
                );
                checkRun(entry.builder, true);
                entry.build = JSON.parse(
                    readFileSync(join(directory, "build.json"), "utf8"),
                );
                assert.deepEqual(
                    blob(entry.build.image.path),
                    entry.build.image,
                );
                assert.deepEqual(blob(sourcePath), entry.source);
                const native = await supervise(
                    entry.build.image.path,
                    [],
                    nativeDirectory,
                    "native",
                    item.nativeBoundMs,
                );
                Object.assign(native, {
                    source: entry.source,
                    executableSha256: entry.build.image.sha256,
                    engine: "native",
                    actualGC: entry.build.actualGC,
                });
                json(join(nativeDirectory, "native.receipt.json"), native);
                entry.runs.push(native);
                save();
            } catch (error) {
                entry.buildError = errorRecord(error);
                save();
            }
            // Keep controls even when a build/native fails. No retries or filtering.
            for (const control of item.controls) {
                const cwd = join(directory, control.id);
                mkdirSync(cwd, { recursive: true });
                const path = join(cwd, "main.mjs");
                writeFileSync(path, control.source);
                const run = await supervise(
                    process.execPath,
                    [path],
                    cwd,
                    control.id,
                    control.boundMs,
                );
                Object.assign(run, {
                    source: blob(path),
                    executableSha256: nodeHash,
                    engine: "node",
                    actualGC: false,
                });
                json(join(cwd, control.id + ".receipt.json"), run);
                entry.runs.push(run);
                save();
            }
            entry.comparison = compare(entry, expected);
            save();
            if (
                entry.build &&
                entry.runs.length === item.controls.length + 1 &&
                entry.comparison.ok
            ) {
                // Retain hashes/receipts for successes, binaries only for fault replay.
                assert.deepEqual(
                    blob(entry.build.image.path),
                    entry.build.image,
                );
                rmSync(entry.build.image.path);
                entry.build.imageRetained = false;
                json(join(directory, "build.json"), entry.build);
                save();
            }
        }
        report.complete = true;
        validateReport(report, true, plan);
        save();
    } catch (error) {
        report.complete = false;
        report.error = errorRecord(error);
        save();
        throw error;
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    mkdirSync(output, { recursive: true });
    try {
        if (process.argv[2] === "--identity") identity();
        else if (process.argv[2] === "--hosted-build")
            await hostedBuild(process.argv[3]);
        else if (process.argv.length === 2) await campaign();
        else throw new Error("Unknown diagnostic command");
    } catch (error) {
        json(
            join(
                output,
                "entry-error" +
                    (process.argv[3] ? "-" + process.argv[3] : "") +
                    ".json",
            ),
            errorRecord(error),
        );
        console.error(error);
        process.exitCode = 1;
    }
}
