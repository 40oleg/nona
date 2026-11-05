import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
    loadCases,
    diagnosticPlan,
    pins,
} from "./native-gc-diagnosis-cases.mjs";
import { serializeExecution } from "../tests/helpers/execution.ts";

const script = fileURLToPath(import.meta.url);
const json = (file, value) =>
    writeFileSync(
        file,
        JSON.stringify(serializeExecution(value), null, 2) + "\n",
    );
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const [mode, argument] = process.argv.slice(2);
assert.ok(["--run", "--worker", "--verify"].includes(mode));
const root = process.cwd();
const out = resolve("work/native-gc-diagnosis");

function stopTree(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === "win32")
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            windowsHide: true,
            timeout: 10000,
        });
    else {
        try {
            process.kill(-child.pid, "SIGKILL");
        } catch {}
    }
}

function outcomeFailed(outcome) {
    const native = outcome.result?.native ?? outcome.result;
    const oracle = outcome.result?.oracleRun ?? outcome.oracle;
    return Boolean(
        outcome.error ||
        !native ||
        native.status !== 0 ||
        native.signal ||
        native.error ||
        !oracle ||
        oracle.status !== 0 ||
        oracle.signal ||
        oracle.error ||
        native.stdout !== oracle.stdout,
    );
}

function replayResult(result) {
    // JSON evidence represents absent Error fields as null. Restore the helper's
    // undefined error for the unchanged assertions; retain the raw report as-is.
    for (const run of [result, result?.native, result?.oracleRun])
        if (run?.error === null) delete run.error;
    return result;
}

function hosted() {
    assert.equal(
        process.env.GITHUB_ACTIONS,
        "true",
        "Native diagnosis is hosted-only",
    );
    assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
    assert.equal(process.versions.node, "26.9.0");
    assert.equal(process.env.NONA_GC_STRESS, "on");
}

if (mode === "--worker") {
    hosted();
    const request = read(argument);
    const directory = resolve(request.directory);
    process.env.NONA_EXECUTION_EVIDENCE = join(directory, "executions");
    mkdirSync(process.env.NONA_EXECUTION_EVIDENCE, { recursive: true });
    const observer = spawn(
        process.execPath,
        [
            join(root, "scripts/native-gc-sample.mjs"),
            String(process.pid),
            join(directory, "samples.jsonl"),
        ],
        { stdio: "ignore", windowsHide: true },
    );
    let result, oracle, error;
    try {
        const host = await import(
            pathToFileURL(join(root, "dist/tests/helpers/host.js"))
        );
        const oracleHelper = await import(
            pathToFileURL(join(root, "dist/tests/helpers/oracle.js"))
        );
        try {
            result =
                request.kind === "modules"
                    ? host.runModulesOnHost(...request.args)
                    : host.runOnHost(...request.args);
        } catch (caught) {
            error = caught;
        }
        // Preserve the original Node control even if the native call failed.
        if (request.oracleArgs) {
            try {
                oracle = oracleHelper.runOracle(...request.oracleArgs);
            } catch (caught) {
                error ??= caught;
            }
        }
    } catch (caught) {
        error = caught;
    } finally {
        observer.kill();
        await new Promise((done) => {
            if (observer.exitCode !== null || observer.signalCode !== null)
                done();
            else observer.once("exit", done);
        });
        json(join(directory, "worker-result.json"), { result, oracle, error });
    }
    process.exitCode = error ? 1 : 0;
} else if (mode === "--run") {
    hosted();
    const group = argument;
    const plan = diagnosticPlan(group);
    assert.equal(
        spawnSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
        }).stdout.trim(),
        pins[group],
    );
    assert.equal(process.env.NONA_DIAGNOSTIC_SOURCE, pins[group]);
    assert.ok(
        process.platform === "linux" ||
            (group === "http"
                ? process.platform === "win32" && process.arch === "x64"
                : process.platform === "darwin" && process.arch === "arm64"),
        "Unexpected runner target",
    );
    mkdirSync(out, { recursive: true });
    assert.ok(
        !existsSync(join(out, "plan.json")),
        "Never overwrite an earlier attempt",
    );
    json(join(out, "plan.json"), {
        ...plan,
        runner: process.env.RUNNER_NAME,
        imageOS: process.env.ImageOS,
        imageVersion: process.env.ImageVersion,
        diagnosticCommit: process.env.DIAGNOSTIC_COMMIT,
        started: new Date().toISOString(),
    });
    const cases = await loadCases(root, group);
    const originals = [];
    for (const entry of cases) {
        for (let i = 0; i < entry.calls.length; i++) {
            const call = entry.calls[i];
            assert.notEqual(call.kind, "oracle");
            const next = entry.calls[i + 1];
            const oracleCall =
                next?.kind === "oracle" ? entry.calls[++i] : undefined;
            originals.push({
                caseName: entry.name,
                kind: call.kind,
                args: call.args,
                oracleArgs: oracleCall?.args,
                call,
                oracleCall,
            });
        }
    }
    assert.equal(originals.length, plan.originalNative);
    const selected = originals.filter(
        (item) =>
            (item.kind === "modules" ? item.args[2] : item.args[1]).gcStress,
    );
    const first = selected[0],
        last = selected.at(-1);
    const marked = structuredClone({
        kind: first.kind,
        args: first.args,
        oracleArgs: first.oracleArgs,
    });
    const memory =
        "try { if (typeof process === 'object' && typeof process.memoryUsage === 'function') console.error('NONA_DIAGNOSTIC_MEMORY', JSON.stringify(process.memoryUsage())); } catch (error) { console.error('NONA_DIAGNOSTIC_MEMORY_UNAVAILABLE', String(error)); }\n";
    const marker =
        "console.error('NONA_DIAGNOSTIC_SCENARIO_ENTER', Date.now());\n" +
        memory;
    const end =
        "\nconsole.error('NONA_DIAGNOSTIC_SCENARIO_END', Date.now());\n" +
        memory;
    if (marked.kind === "modules") {
        const [files, entry] = marked.args;
        const progress =
            group === "http"
                ? "const nonaLog = console.log; console.log = function(...args) { console.error('NONA_HTTP_PROGRESS', Date.now()); return nonaLog(...args); };\n"
                : "";
        files[entry] = marker + progress + files[entry] + end;
        // This is explicitly a native-only diagnostic variant. Keep Node's
        // original control and identify its distinct source in the request.
        marked.args[2].oracleSource ??= first.args[0][entry];
    } else marked.args[0] = marker + marked.args[0] + end;
    const startup =
        group === "regexp"
            ? {
                  kind: "host",
                  args: ["console.log('startup-ready');", { gcStress: true }],
                  oracleArgs: ["console.log('startup-ready');"],
              }
            : {
                  kind: "modules",
                  args: [
                      {
                          "main.mjs":
                              group === "http"
                                  ? "import 'node:http';\nconsole.log('startup-ready');"
                                  : "import 'node:assert';\nconsole.log('startup-ready');",
                      },
                      "main.mjs",
                      { gcStress: true },
                  ],
              };
    const manifest = [];
    let sequence = 0;
    const children = new Set();
    const controllerDeadline = setTimeout(() => {
        json(join(out, "controller-timeout.json"), {
            elapsedLimitMs: plan.controllerBoundMs,
        });
        process.exit(1);
    }, plan.controllerBoundMs);
    process.on("exit", () => {
        for (const child of children) stopTree(child);
    });
    async function run(item, phase) {
        const id = String(++sequence).padStart(2, "0") + "-" + phase;
        const directory = join(out, id);
        mkdirSync(directory);
        const request = {
            id,
            phase,
            caseName: item.caseName,
            kind: item.kind,
            args: item.args,
            oracleArgs: item.oracleArgs,
            directory,
            source: pins[group],
        };
        json(join(directory, "request.json"), request);
        manifest.push({ id, phase, caseName: item.caseName });
        json(join(out, "manifest.json"), manifest);
        const child = spawn(
            process.execPath,
            [script, "--worker", join(directory, "request.json")],
            { windowsHide: true, detached: process.platform !== "win32" },
        );
        children.add(child);
        let stdout = "",
            stderr = "";
        child.stdout.on("data", (bytes) => {
            stdout += bytes;
            writeFileSync(join(directory, "worker.stdout"), stdout);
        });
        child.stderr.on("data", (bytes) => {
            stderr += bytes;
            writeFileSync(join(directory, "worker.stderr"), stderr);
        });
        const timer = setTimeout(() => stopTree(child), plan.workerBoundMs);
        const outcome = await new Promise((done) => {
            child.on("error", (error) => done({ error }));
            child.on("close", (status, signal) => done({ status, signal }));
        });
        clearTimeout(timer);
        children.delete(child);
        json(join(directory, "launcher.json"), outcome);
        const file = join(directory, "worker-result.json");
        return existsSync(file)
            ? read(file)
            : { error: { message: "Missing worker result", outcome } };
    }
    const outcomes = [];
    // All original programs and Node controls finish before any comparison.
    for (const original of originals) {
        const result = await run(original, "original");
        outcomes.push(result);
        original.call.result = replayResult(result.result);
        original.call.thrown = result.error;
        if (original.oracleCall) {
            original.oracleCall.result = replayResult(result.oracle);
            original.oracleCall.thrown = result.error;
        }
    }
    const assertions = cases.map((entry) => {
        try {
            entry.replay();
            return { name: entry.name, passed: true };
        } catch (error) {
            return { name: entry.name, passed: false, error };
        }
    });
    json(join(out, "original-assertions.json"), assertions);
    // Two selected unchanged images, no synthetic load and no suite campaign.
    outcomes.push(
        ...(await Promise.all([
            run(first, "concurrent-2"),
            run(last, "concurrent-2"),
        ])),
    );
    // Retain the existing isolated HTTP tail as a separate result, never a fix.
    if (group === "http") outcomes.push(await run(first, "isolated-tail"));
    outcomes.push(await run(marked, "marked-native-only"));
    outcomes.push(await run(startup, "startup-control"));
    clearTimeout(controllerDeadline);
    const failures = outcomes.map((outcome, index) => ({
        id: manifest[index].id,
        failed: outcomeFailed(outcome),
    }));
    json(join(out, "final.json"), {
        completed: true,
        executions: sequence,
        assertions,
        failures,
        workerErrors: outcomes.filter((item) => item.error),
        interpretation:
            "Common cause unresolved. Comparisons and instrumented successes do not clear original failures; HTTP behavior remains owned by #616. Current-head release CI is still required.",
    });
    if (
        assertions.some((item) => !item.passed) ||
        failures.some((item) => item.failed)
    )
        process.exitCode = 1;
} else {
    // Evidence completeness is independent of witness success. Partial evidence
    // is still uploaded, but never accepted as a completed diagnosis.
    const plan = read(join(out, "plan.json"));
    const manifest = read(join(out, "manifest.json"));
    const final = read(join(out, "final.json"));
    const provenance = resolve("work/native-gc-provenance");
    assert.equal(read(join(provenance, "context.json")).source, plan.pin);
    assert.equal(
        read(join(provenance, "original-job.json")).head_sha,
        plan.pin,
    );
    assert.equal(read(join(provenance, "build.json")).status, 0);
    for (const file of [
        "pinned-tree.tar",
        "original-job.log",
        "original-run.json",
    ])
        assert.ok(
            statSync(join(provenance, file)).size > 0,
            "Missing pinned source/log evidence",
        );
    assert.equal(final.completed, true);
    assert.equal(final.assertions.length, plan.originalGroups);
    assert.equal(manifest.length, plan.totalNative);
    assert.equal(final.executions, plan.totalNative);
    for (const [phase, count] of Object.entries({
        original: plan.originalNative,
        "concurrent-2": 2,
        "isolated-tail": plan.tailNative,
        "marked-native-only": 1,
        "startup-control": 1,
    }))
        assert.equal(
            manifest.filter((item) => item.phase === phase).length,
            count,
            phase,
        );
    let native = 0,
        node = 0;
    for (const item of manifest) {
        const directory = join(out, item.id);
        const request = read(join(directory, "request.json"));
        read(join(directory, "launcher.json"));
        read(join(directory, "worker-result.json"));
        const samples = readFileSync(join(directory, "samples.jsonl"), "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
        assert.ok(
            samples.some(
                (sample) =>
                    sample.status === 0 &&
                    typeof sample.stdout === "string" &&
                    sample.stdout.length > 0,
            ),
            "Missing successful external observations",
        );
        const executionRoot = join(directory, "executions");
        for (const name of readdirSync(executionRoot)) {
            const evidence = join(executionRoot, name);
            read(join(evidence, "input.json"));
            const result = read(join(evidence, "result.json"));
            assert.ok(Object.hasOwn(result, "signal"));
            assert.ok(Object.hasOwn(result, "status"));
            assert.ok(
                Number.isFinite(result.elapsedMs) && result.elapsedMs >= 0,
            );
            for (const stream of ["stdout.bin", "stderr.bin"]) {
                const bytes = readFileSync(join(evidence, stream));
                assert.equal(
                    createHash("sha256").update(bytes).digest("hex"),
                    read(join(evidence, stream + ".sha256.json")).sha256,
                );
            }
            if (/^(module-oracle|script-oracle)-/u.test(name)) node++;
            if (/^(host|modules)-/u.test(name)) {
                native++;
                const timings = read(join(evidence, "timings.json"));
                for (const key of ["compileMs", "generateMs", "linkMs"])
                    assert.ok(
                        Number.isFinite(timings[key]) && timings[key] >= 0,
                        key,
                    );
                const image = readFileSync(join(evidence, "image.bin"));
                assert.equal(
                    createHash("sha256").update(image).digest("hex"),
                    read(join(evidence, "image.bin.sha256.json")).sha256,
                );
            }
        }
        assert.equal(request.source, plan.pin);
    }
    assert.equal(native, plan.totalNative);
    assert.equal(node, plan.totalNode);
    json(join(out, "verified.json"), { native, node, complete: true });
}
