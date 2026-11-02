// Hosted startup investigation only. No runtime repair or product acceptance.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { startupChildEnv } from "./http-startup-env.mjs";
import {
    retained,
    startupAllowed,
    startupPlan,
    probeSource,
    validateZipInventory,
    campaignMs,
    snapshotCommand,
    snapshotEvidence,
    inspectionCoverage,
    inspectionSchedule,
    captureText as untrackedCapture,
} from "./http-startup-plan.mjs";
import {
    hashFile,
    runTrial,
    supervise,
    classifyTermination,
} from "./http-crash.mjs";
import {
    collectProvenance,
    dependencyStatus,
} from "./http-crash-provenance.mjs";

const save = (file, value) =>
    writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const git = (...args) =>
    execFileSync("git", args, {
        encoding: "utf8",
        env: startupChildEnv(),
    }).trim();
const children = [];
function track(pid, command, args) {
    children.push({
        pid,
        command,
        args,
        parentPid: process.pid,
        startedAt: new Date().toISOString(),
    });
    save(resolve("work/http-startup/children.json"), children);
}
const captureText = (command, args, options) =>
    untrackedCapture(command, args, {
        ...options,
        env: startupChildEnv(options.env),
        onStart(pid) {
            track(pid, command, args);
            options.onStart?.(pid);
        },
    });

function verify(output) {
    mkdirSync(output, { recursive: true });
    const event = read(process.env.GITHUB_EVENT_PATH);
    const provenance = collectProvenance(process.env, event, startupChildEnv());
    const head = git("rev-parse", "HEAD");
    const compilerSourceTree = git("rev-parse", "HEAD:src");
    const originalCompilerSourceTree = git("rev-parse", `${retained.head}:src`);
    Object.assign(provenance, {
        startupMode: process.env.STARTUP_MODE,
        expectedCommit: process.env.STARTUP_EXPECTED_SHA,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        driverPid: process.pid,
        dispatchInputs: event.inputs,
        imageOS: process.env.ImageOS,
        imageVersion: process.env.ImageVersion,
        compilerSourceTree,
        originalCompilerSourceTree,
        retained,
        originalIsAncestor:
            execFileSync("git", ["merge-base", retained.head, head], {
                encoding: "utf8",
                env: startupChildEnv(),
            }).trim() === retained.head,
        dependency: dependencyStatus(head, startupChildEnv()),
    });
    if (
        !startupAllowed(
            process.env,
            head,
            process.platform,
            process.arch,
            process.version,
        )
    )
        provenance.errors.push("Rejected startup identity/ref/commit/platform");
    if (
        !provenance.originalIsAncestor ||
        compilerSourceTree !== originalCompilerSourceTree
    )
        provenance.errors.push(
            "Retained head must be an ancestor with unchanged src tree",
        );
    provenance.verified = provenance.errors.length === 0;
    save(join(output, "provenance.json"), provenance);
    if (!provenance.verified) throw Error(provenance.errors.join("; "));
    return provenance;
}

async function restore(output, signal) {
    const headers = {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    };
    const api = async (path) => {
        const result = await fetch(
            `https://api.github.com/repos/40oleg/nona/${path}`,
            {
                headers,
                signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
            },
        );
        if (!result.ok) throw Error(`GitHub API ${result.status}: ${path}`);
        return result;
    };
    const artifact = await (
        await api(`actions/artifacts/${retained.artifact}`)
    ).json();
    const run = await (await api(`actions/runs/${retained.run}`)).json();
    save(join(output, "retained-api.json"), { artifact, run });
    if (
        String(artifact.id) !== retained.artifact ||
        artifact.expired ||
        artifact.digest !== `sha256:${retained.zipHash}` ||
        String(artifact.workflow_run?.id) !== retained.run ||
        run.head_sha !== retained.head ||
        run.conclusion !== "failure" ||
        !(
            artifact.size_in_bytes > 0 &&
            artifact.size_in_bytes < 32 * 1024 * 1024
        )
    )
        throw Error("Retained artifact/run identity mismatch");
    const zip = await api(`actions/artifacts/${retained.artifact}/zip`);
    const chunks = [];
    let size = 0;
    for await (const chunk of zip.body) {
        size += chunk.byteLength;
        if (size > artifact.size_in_bytes)
            throw Error("Oversized ZIP download");
        chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== artifact.size_in_bytes)
        throw Error("ZIP download size mismatch");
    const archive = join(output, "retained.zip");
    writeFileSync(archive, bytes);
    if (hashFile(archive) !== retained.zipHash)
        throw Error("Original ZIP digest mismatch");
    const inventoryDir = join(output, "zip-inventory");
    let result = await captureText(
        "pwsh",
        [
            "-NoProfile",
            "-File",
            "scripts/http-startup-artifact.ps1",
            "inventory",
            "-Output",
            output,
        ],
        { directory: inventoryDir, timeoutMs: 30000, signal },
    );
    if (
        result.code !== 0 ||
        result.reason ||
        result.error ||
        result.dropped.stdout ||
        result.dropped.stderr
    )
        throw Error("ZIP inventory incomplete");
    const entries = validateZipInventory(
        read(join(inventoryDir, "stdout.log")),
    );
    save(join(output, "zip-inventory.json"), entries);
    result = await captureText(
        "pwsh",
        [
            "-NoProfile",
            "-File",
            "scripts/http-startup-artifact.ps1",
            "extract",
            "-Output",
            output,
        ],
        { directory: join(output, "zip-extract"), timeoutMs: 30000, signal },
    );
    if (result.code !== 0 || result.reason || result.error)
        throw Error("ZIP extraction incomplete");
    const root = join(output, "retained");
    const p = read(join(root, "provenance.json"));
    const trial = read(join(root, "trial-3", "trial.json"));
    const control = read(join(root, "trial-1", "trial.json"));
    const controlSpawn = JSON.parse(
        readFileSync(join(root, "trial-1", "client.jsonl"), "utf8").split(
            "\n",
        )[0],
    );
    const build = read(
        join(root, "reference-stress", "build", "termination.json"),
    );
    const binary = join(root, "reference-stress", "nona-http.exe");
    const source = join(root, "reference.mjs");
    if (
        !p.verified ||
        p.errors.length ||
        p.repository !== "40oleg/nona" ||
        p.checkout.head !== retained.head ||
        p.checkout.expectedHead !== retained.head ||
        p.checkout.tree !== retained.tree ||
        p.workflow.runId !== retained.run ||
        !p.dependency.isAncestor ||
        p.dependency.commit !==
            dependencyStatus(retained.head, startupChildEnv()).commit ||
        trial.sha !== retained.head ||
        trial.runtime !== "nona" ||
        trial.gc !== "stress" ||
        trial.fixture !== "reference" ||
        trial.imageHash !== retained.imageHash ||
        trial.sourceHash !== retained.sourceHash ||
        control.sourceHash !== retained.sourceHash ||
        control.runtime !== "node" ||
        controlSpawn.event !== "spawn" ||
        !/[/\\]reference\.mjs$/.test(controlSpawn.args?.[0] ?? "") ||
        hashFile(binary) !== retained.imageHash ||
        hashFile(source) !== retained.sourceHash ||
        build.code !== 0 ||
        build.reason !== null ||
        build.error !== null ||
        build.signal !== null ||
        !existsSync(binary + ".asm")
    )
        throw Error("Retained source/compiler/image provenance mismatch");
    // Source-supported original compiler path; no rebuild is called retained.
    const originalBuilder = execFileSync(
        "git",
        ["show", `${retained.head}:scripts/http-crash-build.mjs`],
        { env: startupChildEnv() },
    );
    writeFileSync(join(output, "original-build-entry.mjs"), originalBuilder);
    save(join(output, "retained-verification.json"), {
        verified: true,
        retained,
        source,
        binary,
        build,
        originalProvenance: p,
        originalCompileOptions: {
            fileName: controlSpawn.args[0],
            target: "win32-x64",
            module: true,
            gcStress: true,
            printAsm: true,
        },
        originalFileNameProvenance:
            "Same absolute reference source path recorded by original Node control spawn; public compiler receives sourcePath in original driver. Compiler argv was not separately retained.",
        sourceHash: hashFile(source),
        imageHash: hashFile(binary),
        assemblyHash: hashFile(binary + ".asm"),
        compilerSourceTree: git("rev-parse", `${retained.head}:src`),
        originalBuildEntryHash: hashFile(
            join(output, "original-build-entry.mjs"),
        ),
        originalBuildEntrypoint:
            "scripts/http-crash-build.mjs at retained head, public compile; collectSourceUsage/requestLink; builtin pruning",
        limitation:
            "Artifact records source/image hashes and compiler child status, not a reproducible compiler-binary hash; source tree and original entry retained. No regeneration substituted.",
    });
    return { binary, source };
}

// All inspector processes are direct children of this driver. -pvr avoids
// suspending target threads. Running thread contexts can be unavailable or
// inconsistent; exit zero alone is never reported as a captured stack.
async function inspectBaseline(directory, signal) {
    const receipt = {
        status: "waiting-for-pid",
        attachMode: "-pvr (noninvasive, nonsuspending)",
        samples: [],
        snapshots: [],
        perturbation:
            "External process queries and CDB memory/context reads can affect scheduling. Running contexts may be unavailable/inconsistent; no mechanism inferred.",
    };
    const manifest = join(directory, "inspection.json");
    save(manifest, receipt);
    const trialFile = join(directory, "trial.json");
    let start;
    try {
        let trial;
        while (!signal.aborted) {
            if (existsSync(trialFile)) {
                trial = read(trialFile);
                if (trial.pid) break;
            }
            await delay(25, undefined, { signal });
        }
        if (!trial?.pid || signal.aborted) return;
        start = Date.parse(trial.startedAt);
        const cdb = join(
            process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)",
            "Windows Kits/10/Debuggers/x64/cdb.exe",
        );
        receipt.pid = trial.pid;
        for (const targetMs of inspectionSchedule.samples) {
            const seconds = targetMs / 1000;
            await delay(
                Math.max(0, start + seconds * 1000 - Date.now()),
                undefined,
                { signal },
            );
            if (
                signal.aborted ||
                Date.now() >= start + 58000 ||
                read(trialFile).status !== "starting"
            )
                break;
            const sampleDir = join(directory, `cpu-${seconds}`);
            const sampling = await captureText(
                "pwsh",
                [
                    "-NoProfile",
                    "-Command",
                    `$p=Get-Process -Id ${trial.pid} -ErrorAction Stop; @{pid=$p.Id;cpuMs=$p.TotalProcessorTime.TotalMilliseconds;workingSetBytes=$p.WorkingSet64;privateBytes=$p.PrivateMemorySize64;utc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress`,
                ],
                { directory: sampleDir, timeoutMs: 2000, signal },
            );
            const sample = {
                targetMs: seconds * 1000,
                actualElapsedMs: Date.now() - start,
                termination: sampling,
                raw: sampleDir,
                status: "incomplete",
            };
            if (
                sampling.code === 0 &&
                !sampling.reason &&
                !sampling.error &&
                sampling.dropped.stdout === 0 &&
                sampling.dropped.stderr === 0 &&
                readFileSync(join(sampleDir, "stderr.log"), "utf8") === ""
            ) {
                try {
                    sample.data = read(join(sampleDir, "stdout.log"));
                    if (
                        sample.data.pid === trial.pid &&
                        Number.isFinite(sample.data.cpuMs) &&
                        sample.data.cpuMs >= 0 &&
                        sample.data.workingSetBytes > 0
                    )
                        sample.status = "sampled";
                } catch {
                    /* Partial/missing CPU output is incomplete. */
                }
            }
            receipt.samples.push(sample);
            save(manifest, receipt);
            if (
                !inspectionSchedule.snapshots.includes(targetMs) ||
                signal.aborted
            )
                continue;
            const snapshotStarted = Date.now();
            const command = snapshotCommand(trial.pid, start, snapshotStarted);
            const snapshot = {
                targetMs: seconds * 1000,
                startElapsedMs: snapshotStarted - start,
                startedAt: new Date(snapshotStarted).toISOString(),
                debugger: cdb,
                attachMode: receipt.attachMode,
                status: "unavailable",
                ...command,
                unavailableReason: !command
                    ? "Snapshot cutoff reached"
                    : !existsSync(cdb)
                      ? "CDB executable unavailable"
                      : null,
            };
            receipt.snapshots.push(snapshot);
            save(manifest, receipt);
            if (existsSync(cdb) && command) {
                const target = join(directory, `cdb-${seconds}`);
                // No symbol server/network waits, invasive attach, break-in,
                // dump, execution commands or runtime instrumentation.
                save(manifest, receipt);
                snapshot.termination = await captureText(cdb, snapshot.args, {
                    directory: target,
                    timeoutMs: snapshot.timeoutMs,
                    signal,
                    onStart(pid) {
                        snapshot.debuggerPid = pid;
                        save(manifest, receipt);
                    },
                    env: startupChildEnv(),
                });
                snapshot.raw = target;
                const raw = readFileSync(join(target, "stdout.log"), "utf8");
                // Retain raw PCs/module bases regardless of symbol/context errors.
                Object.assign(
                    snapshot,
                    snapshotEvidence(
                        raw,
                        snapshot.termination,
                        readFileSync(join(target, "stderr.log"), "utf8"),
                    ),
                );
            }
            const snapshotEnded = Date.now();
            snapshot.endedAt = new Date(snapshotEnded).toISOString();
            snapshot.endElapsedMs = snapshotEnded - start;
            save(manifest, receipt);
        }
        receipt.status = "finished";
    } catch (error) {
        receipt.status = signal.aborted ? "stopped-with-trial" : "incomplete";
        receipt.error = String(error);
    } finally {
        for (const snapshot of receipt.snapshots) {
            if (!snapshot.endedAt) {
                const snapshotEnded = Date.now();
                snapshot.endedAt = new Date(snapshotEnded).toISOString();
                snapshot.endElapsedMs = snapshotEnded - start;
                snapshot.status = "incomplete";
            }
        }
        save(manifest, receipt);
    }
}

async function main() {
    const output = resolve("work/http-startup");
    const provenance = verify(output);
    if (process.argv.includes("--verify")) return;
    const started = Date.now();
    const controller = new AbortController();
    let interruption = null;
    const abort = (reason) => {
        interruption ??= reason;
        controller.abort();
    };
    const interrupt = () => abort("SIGINT"),
        terminate = () => abort("SIGTERM");
    const timer = setTimeout(() => abort("campaign-deadline"), campaignMs);
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    const report = {
        provenance,
        planned: startupPlan(),
        results: [],
        status: "running",
        startedAt: new Date(started).toISOString(),
        campaignMs,
        productFix: false,
    };
    const saveReport = () => {
        report.elapsedMs = Date.now() - started;
        save(join(output, "startup.json"), report);
    };
    saveReport();
    try {
        const original = await restore(output, controller.signal);
        for (const plan of report.planned) {
            const remaining = campaignMs - (Date.now() - started);
            if (
                controller.signal.aborted ||
                (plan.optional && remaining < 120000 + 90000 + 5000)
            ) {
                report.status = "bounded-incomplete";
                break;
            }
            const directory = join(output, `trial-${plan.id}`);
            mkdirSync(directory, { recursive: true });
            const row = {
                ...plan,
                imageCompilerHead:
                    plan.id === "retained-reference"
                        ? retained.head
                        : provenance.checkout.head,
                fixtureOriginHead: [
                    "retained-reference",
                    "instrumented-reference",
                    "helper-reference",
                ].includes(plan.id)
                    ? retained.head
                    : provenance.checkout.head,
                status: "starting",
                startedAt: new Date().toISOString(),
            };
            report.results.push(row);
            saveReport();
            let binary = original.binary,
                source = original.source;
            if (plan.id !== "retained-reference") {
                source = join(directory, "source.mjs");
                writeFileSync(
                    source,
                    probeSource(plan.id, readFileSync(original.source, "utf8")),
                );
                if (
                    plan.id === "helper-reference" &&
                    hashFile(source) !== retained.sourceHash
                )
                    throw Error(
                        "Helper comparison source differs from exact retained source",
                    );
                binary = join(directory, "nona-http.exe");
                Object.assign(row, {
                    source,
                    sourceHash: hashFile(source),
                    image: binary,
                });
                saveReport();
                row.build = await captureText(
                    process.execPath,
                    [
                        "scripts/http-startup-build.mjs",
                        source,
                        binary,
                        plan.id === "helper-reference" ? "helper" : "public",
                    ],
                    {
                        directory: join(directory, "build"),
                        timeoutMs: plan.compilerMs,
                        signal: controller.signal,
                        env: startupChildEnv(process.env, {
                            NONA_GC_STRESS: "on",
                            NONA_CACHE: "0",
                        }),
                    },
                );
                saveReport();
                if (
                    row.build.code !== 0 ||
                    row.build.error ||
                    row.build.reason
                ) {
                    row.status = "build-incomplete";
                    continue;
                }
            }
            Object.assign(row, {
                source,
                image: binary,
                sourceHash: hashFile(source),
                imageHash: hashFile(binary),
                assemblyHash: hashFile(binary + ".asm"),
            });
            saveReport();
            if (
                [
                    "retained-reference",
                    "instrumented-reference",
                    "helper-reference",
                ].includes(plan.id)
            ) {
                const inspection = new AbortController();
                const onAbort = () => inspection.abort();
                controller.signal.addEventListener("abort", onAbort, {
                    once: true,
                });
                const inspecting =
                    plan.id === "retained-reference"
                        ? inspectBaseline(directory, inspection.signal)
                        : Promise.resolve();
                try {
                    row.trial = await runTrial(
                        {
                            id: `trial-${plan.id}`,
                            fixture: "reference",
                            listeners: "original",
                            concurrency: 1,
                            state: "keepalive",
                            chunkBytes: 65536,
                            chunks: 16,
                            runtime: "nona",
                            gc: "stress",
                        },
                        {
                            directory,
                            command: binary,
                            env: startupChildEnv(),
                            signal: controller.signal,
                            startupMs: 60000,
                            hardMs: 90000,
                            observationMs: 22000,
                            metadata: {
                                sha: provenance.checkout.head,
                                sourceHash: row.sourceHash,
                                imageHash: row.imageHash,
                                imageCompilerHead: row.imageCompilerHead,
                                fixtureOriginHead: row.fixtureOriginHead,
                            },
                        },
                    );
                    row.rawVerdict = row.trial.verdict;
                } finally {
                    inspection.abort();
                    await inspecting;
                    controller.signal.removeEventListener("abort", onAbort);
                }
            } else {
                const checkpoints = [];
                const expected = {
                    console: "checkpoint console",
                    stdout: "checkpoint after-stdout-write",
                    "http-import": "checkpoint after-import",
                    "http-listen": "checkpoint after-listen",
                }[plan.id];
                let child;
                child = supervise(binary, [], {
                    directory,
                    env: startupChildEnv(),
                    timeoutMs: 90000,
                    signal: controller.signal,
                    onLine(line, stream) {
                        if (stream === "stdout")
                            checkpoints.push({
                                line,
                                observedAt: new Date().toISOString(),
                            });
                        if (plan.id === "http-listen" && line === expected)
                            child.stop("observation-complete");
                    },
                });
                track(child.child.pid, binary, []);
                const startupTimer = setTimeout(
                    () => child.stop("deadline"),
                    60000,
                );
                try {
                    row.termination = await child.done;
                } finally {
                    clearTimeout(startupTimer);
                }
                row.checkpoints = checkpoints;
                const reached = checkpoints.some((e) => e.line === expected);
                row.rawVerdict = classifyTermination(
                    row.termination,
                    { errors: 0, hangs: 0, wrongOutput: 0 },
                    reached,
                );
                // Finite probes should exit normally; unlike the server, no
                // coordinated stop is needed after their last console marker.
                if (
                    plan.id !== "http-listen" &&
                    reached &&
                    row.termination.code === 0 &&
                    !row.termination.reason &&
                    !row.termination.error
                )
                    row.rawVerdict = "checkpoint-complete";
                row.completeEvidence =
                    row.termination.dropped.stdout === 0 &&
                    row.termination.dropped.stderr === 0 &&
                    readFileSync(join(directory, "stderr.log"), "utf8") === "";
                save(join(directory, "trial.json"), {
                    ...row,
                    id: `trial-${plan.id}`,
                    pid: row.termination.pid,
                    verdict: row.rawVerdict,
                });
            }
            row.status = "finished";
            row.endedAt = new Date().toISOString();
            saveReport();
            if (
                row.rawVerdict === "native-fault" ||
                row.rawVerdict === "infrastructure-error"
            )
                break;
        }
        report.status =
            report.results.length === report.planned.length &&
            report.results.every((r) => r.status === "finished") &&
            !controller.signal.aborted
                ? "attempts-complete"
                : "bounded-incomplete";
    } catch (error) {
        report.status = "incomplete";
        report.error = String(error.stack ?? error);
    } finally {
        clearTimeout(timer);
        report.interrupted = controller.signal.aborted;
        report.interruption = interruption;
        controller.abort();
        process.removeListener("SIGINT", interrupt);
        process.removeListener("SIGTERM", terminate);
        report.completed = report.results.filter(
            (r) => r.status === "finished",
        ).length;
        saveReport();
    }
    // Completion is evidence availability only. A deadline, fault or missing
    // inspector capture never becomes green product acceptance.
    const baseline = report.results[0];
    const inspectionFile = join(
        output,
        "trial-retained-reference",
        "inspection.json",
    );
    try {
        const directory = join(output, "trial-retained-reference");
        report.inspectionCoverage = inspectionCoverage({
            inspection: existsSync(inspectionFile)
                ? read(inspectionFile)
                : null,
            trial: read(join(directory, "trial.json")),
            client: readFileSync(join(directory, "client.jsonl"), "utf8"),
            stdout: readFileSync(join(directory, "stdout.log"), "utf8"),
            stderr: readFileSync(join(directory, "stderr.log"), "utf8"),
            endedAt: baseline?.endedAt,
            expectedSha: provenance.checkout.head,
        });
    } catch (error) {
        report.inspectionCoverage = inspectionCoverage();
        report.inspectionCoverage.errors.push(String(error));
    }
    report.inspectionComplete = report.inspectionCoverage.complete;
    saveReport();
    if (
        report.status !== "attempts-complete" ||
        !report.inspectionComplete ||
        report.results.some(
            (r) =>
                r.completeEvidence === false ||
                !["checkpoint-complete", "observed-no-fault"].includes(
                    r.rawVerdict,
                ),
        ) ||
        baseline?.imageHash !== retained.imageHash
    )
        process.exitCode = 1;
}
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
    await main();
