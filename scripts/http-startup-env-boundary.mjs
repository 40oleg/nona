// Hosted diagnostic only. No compilation, live debugger or product acceptance.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { restore } from "./http-startup.mjs";
import { retained, captureText } from "./http-startup-plan.mjs";
import { startupChildEnv } from "./http-startup-env.mjs";
import { hashFile, runTrial } from "./http-crash.mjs";
import {
    collectProvenance,
    dependencyPin,
    dependencyStatus,
    mainPin,
} from "./http-crash-provenance.mjs";
import { serverSource } from "./http-crash-fixture.mjs";
import {
    algorithm,
    driverPin,
    campaignMs,
    receiptPath,
    envAllowed,
    blockMetrics,
    conditions,
    envPlan,
    trialEvidence,
    completedEvidence,
} from "./http-startup-env-boundary-plan.mjs";

const output = resolve("work/http-startup");
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const save = (file, value, exclusive = false) =>
    writeFileSync(
        file,
        JSON.stringify(value, null, 2) + "\n",
        exclusive ? { flag: "wx" } : {},
    );
const git = (...args) =>
    execFileSync("git", args, {
        encoding: "utf8",
        env: startupChildEnv(),
        timeout: 10000,
    }).trim();
const sha = (text) => createHash("sha256").update(text).digest("hex");

// Called before any git/helper/workload child. The workflow supplies no token in --verify.
function identity() {
    if (
        !envAllowed(
            process.env,
            process.env.GITHUB_SHA,
            process.platform,
            process.arch,
            process.version,
        )
    )
        throw Error("Rejected env-602 identity/ref/SHA/platform/Node");
    const event = read(process.env.GITHUB_EVENT_PATH);
    if (
        event.repository?.full_name !== "40oleg/nona" ||
        event.repository?.owner?.login !== "40oleg" ||
        event.inputs?.diagnostic_mode !== "env-602" ||
        event.inputs?.diagnostic_sha !== process.env.GITHUB_SHA
    )
        throw Error("Rejected env-602 repository/owner/manual inputs");
    return event;
}

function verify(snapshot) {
    const event = identity();
    const head = git("rev-parse", "HEAD"),
        tree = git("rev-parse", "HEAD^{tree}"),
        src = git("rev-parse", "HEAD:src"),
        pinnedSrc = git("rev-parse", `${driverPin}:src`);
    if (
        head !== process.env.GITHUB_SHA ||
        src !== pinnedSrc ||
        git("diff", driverPin, "--", "src") !== "" ||
        git("ls-files", "--others", "--exclude-standard", "src") !== ""
    )
        throw Error("Driver SHA/src mismatch");
    const ancestors = [driverPin, mainPin].map((pin) =>
        dependencyStatus(head, startupChildEnv(), pin),
    );
    if (
        ancestors.some(
            (a) => !a.isAncestor || a.exitCode !== 0 || a.error !== null,
        )
    )
        throw Error("Driver must descend 8fd and integrated main ba94");
    if (sha(serverSource(true)) !== retained.sourceHash)
        throw Error("Current reference bytes differ from retained source");
    if (snapshot) {
        if (
            Object.keys(process.env).some((k) => k.toUpperCase() === "GH_TOKEN")
        )
            throw Error(
                "Parent aggregate must precede restoration token injection",
            );
        const provenance = collectProvenance(
            process.env,
            event,
            startupChildEnv(),
        );
        if (!provenance.verified) throw Error(provenance.errors.join("; "));
        const metrics = blockMetrics(process.env);
        const generated = conditions(process.env, metrics);
        const receipt = {
            ...provenance,
            mode: "env-602",
            algorithm,
            driverPid: null,
            driver: { head, tree, src, ancestors },
            imageProducer: retained,
            platform: process.platform,
            arch: process.arch,
            node: process.version,
            nodeExecutable: process.execPath,
            runnerImage: process.env.ImageOS,
            runnerImageVersion: process.env.ImageVersion,
            parentAggregate: metrics,
            conditions: generated.map(({ id, metrics }) => ({ id, metrics })),
            capturedAt: new Date().toISOString(),
            preToken: true,
        };
        mkdirSync(output, { recursive: true });
        save(resolve(receiptPath), receipt, true);
        return receipt;
    }
    const p = read(resolve(receiptPath));
    if (
        p.verified !== true ||
        p.errors?.length !== 0 ||
        p.preToken !== true ||
        p.mode !== "env-602" ||
        p.algorithm !== algorithm ||
        p.driver?.head !== head ||
        p.driver.tree !== tree ||
        p.driver.src !== src ||
        p.checkout?.head !== head ||
        p.checkout.expectedHead !== head ||
        p.checkout.tree !== tree ||
        p.node !== process.version ||
        p.nodeExecutable !== process.execPath ||
        p.platform !== process.platform ||
        p.arch !== process.arch ||
        p.repository !== process.env.GITHUB_REPOSITORY ||
        p.event?.name !== process.env.GITHUB_EVENT_NAME ||
        p.event.ref !== process.env.GITHUB_REF ||
        p.event.sha !== head ||
        p.workflow?.sha !== head ||
        p.workflow.ref !== process.env.GITHUB_WORKFLOW_REF ||
        p.workflow.runId !== process.env.GITHUB_RUN_ID ||
        p.workflow.runAttempt !== process.env.GITHUB_RUN_ATTEMPT ||
        p.runner?.name !== process.env.RUNNER_NAME ||
        p.runner.environment !== "github-hosted" ||
        p.runner.os !== "Windows" ||
        p.runnerImage !== process.env.ImageOS ||
        p.runnerImageVersion !== process.env.ImageVersion ||
        JSON.stringify(p.imageProducer) !== JSON.stringify(retained) ||
        JSON.stringify(p.driver.ancestors) !== JSON.stringify(ancestors)
    )
        throw Error("Missing/stale/foreign aggregate provenance");
    if (
        p.dependency?.commit !== dependencyPin ||
        p.dependency.isAncestor !== true ||
        p.dependency.exitCode !== 0 ||
        p.dependency.error !== null ||
        !Number.isFinite(Date.parse(p.capturedAt))
    )
        throw Error("Corrupt dependency/snapshot receipt");
    const generated = conditions(process.env, p.parentAggregate);
    if (
        JSON.stringify(p.conditions) !==
        JSON.stringify(generated.map(({ id, metrics }) => ({ id, metrics })))
    )
        throw Error("Changed base/aggregate metrics");
    return p;
}

function ownership(phase) {
    execFileSync(
        "pwsh",
        [
            "-NoProfile",
            "-File",
            "scripts/http-startup-cleanup.ps1",
            "-Phase",
            phase,
        ],
        {
            env: startupChildEnv(),
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
            timeout: 10000,
        },
    );
}
function register(pid, command, args, startedAt) {
    if (!pid) throw Error("Missing owned child PID");
    save(join(output, "env-ownership-request.json"), {
        pid,
        parentPid: process.pid,
        command,
        args,
        startedAt,
    });
    ownership("register");
}

async function main() {
    const phase = process.argv[2];
    if (
        !["--verify", "--admit-helper", undefined].includes(phase) ||
        process.argv.length > 3
    )
        throw Error("Unexpected env diagnostic arguments");
    const p = verify(phase === "--verify");
    if (phase) {
        if (phase === "--verify")
            save(
                join(output, "env-boundary.json"),
                {
                    provenance: p,
                    planned: envPlan(),
                    results: [],
                    completed: [],
                    missing: envPlan().map((p) => p.id),
                    status: "verified-awaiting-run",
                    productFix: false,
                    full57Accepted: false,
                },
                true,
            );
        return;
    }
    // Separate runtime owner, without rewriting the immutable pre-token receipt.
    save(
        join(output, "env-owner.json"),
        {
            driverPid: process.pid,
            head: p.driver.head,
            tree: p.driver.tree,
            run: p.workflow.runId,
            attempt: p.workflow.runAttempt,
        },
        true,
    );
    const started = Date.now(),
        controller = new AbortController();
    const report = {
        provenance: p,
        planned: envPlan(),
        results: [],
        status: "running",
        startedAt: new Date(started).toISOString(),
        campaignMs,
        productFix: false,
        full57Accepted: false,
        interpretation:
            "Current aggregate pressure, not historical environment reconstruction. Single fixed-order evidence is conditional; no GC ownership or definitive cause inference.",
    };
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
    const saveReport = () => {
        report.elapsedMs = Date.now() - started;
        report.attempted = report.results.map((r) => r.id);
        report.completed = report.results
            .filter((r) => r.status === "finished")
            .map((r) => r.id);
        report.missing = report.planned
            .filter((p) => !report.completed.includes(p.id))
            .map((p) => p.id);
        save(join(output, "env-boundary.json"), report);
    };
    saveReport();
    try {
        const original = await restore(
            output,
            controller.signal,
            (command, args, options) =>
                captureText(command, args, {
                    ...options,
                    env: startupChildEnv(),
                    onStart(pid) {
                        register(pid, command, args, new Date().toISOString());
                    },
                }),
        );
        const originalReceipt = read(
            join(output, "retained-verification.json"),
        );
        if (
            !originalReceipt.verified ||
            hashFile(original.source) !== retained.sourceHash ||
            readFileSync(original.source, "utf8") !== serverSource(true) ||
            hashFile(original.binary) !== retained.imageHash ||
            originalReceipt.assemblyHash !== hashFile(original.binary + ".asm")
        )
            throw Error("Restored source/image/assembly verification mismatch");
        report.restored = {
            sourceHash: hashFile(original.source),
            imageHash: hashFile(original.binary),
            assemblyHash: originalReceipt.assemblyHash,
            receipt: originalReceipt,
        };
        const generated = conditions(process.env, p.parentAggregate);
        for (const spec of report.planned) {
            if (controller.signal.aborted) break;
            const condition = generated.find((c) => c.id === spec.condition),
                directory = join(output, `trial-${spec.id}`);
            const command =
                    spec.runtime === "node"
                        ? process.execPath
                        : original.binary,
                args = spec.runtime === "node" ? [original.source] : [];
            const row = {
                id: spec.id,
                status: "starting",
                startedAt: new Date().toISOString(),
                condition: spec.condition,
                metrics: condition.metrics,
            };
            report.results.push(row);
            saveReport();
            let poll,
                registered = false,
                ownershipError = null;
            const tryRegister = () => {
                if (registered || ownershipError) return;
                const file = join(directory, "trial.json");
                if (!existsSync(file)) return;
                const trial = read(file);
                if (!trial.pid) return;
                try {
                    register(
                        trial.pid,
                        command,
                        [...args, String(trial.port)],
                        trial.startedAt,
                    );
                    registered = true;
                } catch (error) {
                    ownershipError = String(error.message);
                }
            };
            try {
                // Direct runTrial: never feed generated padding through captureText/startupChildEnv again.
                poll = setInterval(tryRegister, 25);
                row.trial = await runTrial(spec, {
                    directory,
                    command,
                    args,
                    env: condition.env,
                    signal: controller.signal,
                    startupMs: 60000,
                    hardMs: 90000,
                    observationMs: 22000,
                    metadata: {
                        sha: p.driver.head,
                        tree: p.driver.tree,
                        sourceHash: retained.sourceHash,
                        imageHash: hashFile(command),
                        imageCompilerHead:
                            spec.runtime === "nona" ? retained.head : null,
                    },
                });
                tryRegister();
                const raw = {};
                for (const [key, name] of Object.entries({
                    trial: "trial.json",
                    termination: "termination.json",
                    stdout: "stdout.log",
                    stderr: "stderr.log",
                    client: "client.jsonl",
                }))
                    raw[key] = readFileSync(join(directory, name), "utf8");
                raw.expectedImageHash =
                    spec.runtime === "nona"
                        ? retained.imageHash
                        : hashFile(process.execPath);
                raw.expectedDriver = {
                    sha: p.driver.head,
                    tree: p.driver.tree,
                    imageCompilerHead:
                        spec.runtime === "nona" ? retained.head : null,
                };
                row.evidence = trialEvidence(
                    spec,
                    row.trial,
                    raw,
                    command,
                    args,
                );
                row.rawVerdict = row.trial.verdict;
                row.status = "finished";
            } catch (error) {
                row.status = "operational-failure";
                row.error = String(error.stack ?? error);
                row.evidence = {
                    passed: false,
                    errors: [String(error.message)],
                };
            } finally {
                clearInterval(poll);
                row.ownership = { registered, error: ownershipError };
                if (!registered || ownershipError)
                    row.evidence = {
                        passed: false,
                        errors: [
                            ...(row.evidence?.errors ?? []),
                            "Missing/failed owned-child registration",
                        ],
                    };
                row.endedAt = new Date().toISOString();
                saveReport();
            }
        }
        report.status = completedEvidence(report.results)
            ? "six-conditions-passed"
            : "failing-or-incomplete";
    } catch (error) {
        report.status = "operational-failure";
        report.error = String(error.stack ?? error);
    } finally {
        clearTimeout(timer);
        controller.abort();
        process.removeListener("SIGINT", interrupt);
        process.removeListener("SIGTERM", terminate);
        report.interruption = interruption;
        try {
            ownership("cleanup");
            report.cleanup = read(join(output, "cleanup.json"));
        } catch (error) {
            report.cleanupError = String(error.message);
        }
        if (
            interruption ||
            report.cleanupError ||
            !Array.isArray(report.cleanup) ||
            report.cleanup.some(
                (r) =>
                    !["already absent", "stopped owned child"].includes(
                        r.status,
                    ),
            )
        )
            report.status = "failing-or-incomplete";
        saveReport();
    }
    if (
        !completedEvidence(report.results) ||
        interruption ||
        report.cleanupError ||
        !Array.isArray(report.cleanup) ||
        report.cleanup.some(
            (r) =>
                r.status !== "already absent" &&
                r.status !== "stopped owned child",
        )
    )
        process.exitCode = 1;
}
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    try {
        await main();
    } catch (error) {
        if (process.argv[2] !== "--admit-helper") {
            mkdirSync(output, { recursive: true });
            const file = join(output, "env-boundary.json");
            const partial = existsSync(file)
                ? read(file)
                : {
                      planned: envPlan(),
                      results: [],
                      completed: [],
                      missing: envPlan().map((p) => p.id),
                  };
            save(file, {
                ...partial,
                status: "rejected",
                error: String(error.message),
                productFix: false,
                full57Accepted: false,
            });
        }
        console.error(String(error.message));
        process.exitCode = 1;
    }
}
