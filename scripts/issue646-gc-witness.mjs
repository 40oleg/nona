// One candidate witness, never a retry/profile campaign. Imports are metadata-only.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    appendFileSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadCases, pins } from "./native-gc-diagnosis-cases.mjs";
import { serializeExecution } from "../tests/helpers/execution.ts";

const published = "401c15587504a2ab81884a5fc95dad835767b1bc";
const main = "37fc352d771113653813c18b0442681428c314f6";
const script = fileURLToPath(import.meta.url);
const supportFiles = [
    ".github/workflows/issue646-gc-witness.yml",
    "scripts/issue646-gc-witness.mjs",
    "scripts/issue646-gc-witness-source.test.mjs",
];
const gcNames = [
    "block lookup accepts only requested payload bytes across cell and mapping sizes (#646)",
    "interior lookup and weak mark queries track collection epochs and cell reuse (#646)",
    "large interior lookup survives page-map growth, tombstones and shorter cached reuse (#646)",
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path, value) =>
    writeFileSync(
        path,
        JSON.stringify(serializeExecution(value), null, 2) + "\n",
    );
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const passed = (run) =>
    Boolean(
        run &&
        run.status === 0 &&
        run.signal === null &&
        !run.error &&
        !run.timedOut,
    );

export function changedSupport(files) {
    assert.ok(Array.isArray(files));
    return files.some(
        (file) =>
            supportFiles.includes(file.filename) &&
            ["added", "modified"].includes(file.status),
    );
}
export function overlayIdentity(x) {
    assert.equal(x.historicalSource, pins.http);
    assert.match(x.candidateHead, /^[a-f0-9]{40}$/u);
    assert.notEqual(x.candidateHead, x.historicalSource);
    assert.equal(x.baselineMemory, x.mainMemory);
    assert.equal(x.baselineMemory, x.publishedMemory);
    assert.equal(x.baselineGC, x.mainGC);
    assert.equal(x.baselineGC, x.candidateGC);
    assert.notEqual(
        x.baselineMemory,
        x.candidateMemory,
        "Missing candidate overlay",
    );
    return {
        historicalSource: x.historicalSource,
        acceptedMain: main,
        publishedCandidateBase: published,
        candidateHead: x.candidateHead,
        modifiedHistoricalTree: true,
        overlayFile: "src/runtime/memory.ts",
        beforeSha256: sha(x.baselineMemory),
        overlaySha256: sha(x.candidateMemory),
        gcSha256: sha(x.baselineGC),
        imageIdentity:
            "New candidate image; no equality with historical image is asserted",
    };
}
export function originalRequest(entries) {
    assert.equal(entries.length, 1);
    assert.equal(entries[0].calls.length, 1);
    const call = entries[0].calls[0];
    assert.equal(call.kind, "modules");
    assert.equal(call.args[2].gcStress, true);
    assert.equal(call.args[2].timeoutMs, undefined);
    assert.equal(typeof call.args[2].oracleSource, "string");
    assert.notEqual(call.args[0][call.args[1]], call.args[2].oracleSource);
    return { name: entries[0].name, kind: call.kind, args: call.args };
}
export function gates(x) {
    const attempts = x.http?.attempts ?? [];
    const native = attempts.filter((a) => a.kind === "native"),
        node = attempts.filter((a) => a.kind === "node");
    return {
        gc: Boolean(
            x.prerequisites &&
            passed(x.gc?.launcher) &&
            x.gc.testsPassed === true &&
            x.gc.executions?.length === 3 &&
            x.gc.executions.every(passed),
        ),
        http: Boolean(
            x.prerequisites &&
            passed(x.http?.launcher) &&
            x.http.assertionsPassed === true &&
            attempts.length === 2 &&
            native.length === 1 &&
            node.length === 1 &&
            attempts.every(passed) &&
            native[0].timeout === 180000 &&
            node[0].timeout === 60000 &&
            /^[a-f0-9]{64}$/u.test(native[0].imageSha256 ?? "") &&
            /^[a-f0-9]{64}$/u.test(native[0].stdoutSha256 ?? "") &&
            native[0].stdoutSha256 === node[0].stdoutSha256 &&
            attempts.every((a) => a.stderrSha256 === sha("")),
        ),
        nativeAttempts: native.length,
        nodeAttempts: node.length,
    };
}
export function gcTestsPassed(tap) {
    const names = tap
        .split(/\r?\n/u)
        .filter((line) => /^ok \d+ - /u.test(line))
        .map((line) => line.replace(/^ok \d+ - /u, "").replaceAll("\\#", "#"));
    return (
        JSON.stringify(names) === JSON.stringify(gcNames) &&
        [
            ["tests", 3],
            ["pass", 3],
            ["fail", 0],
            ["cancelled", 0],
            ["skipped", 0],
            ["todo", 0],
        ].every(([key, value]) =>
            new RegExp(`^# ${key} ${value}\\r?$`, "mu").test(tap),
        )
    );
}
export function streamMatches(value, bytes, encoding) {
    if (!Buffer.isBuffer(bytes)) return false;
    if (typeof value === "string")
        return (
            encoding !== "buffer" &&
            Buffer.isEncoding(encoding ?? "utf8") &&
            value === bytes.toString(encoding ?? "utf8")
        );
    return Boolean(
        (encoding === undefined || encoding === "buffer") &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Reflect.ownKeys(value).length === 2 &&
        Object.hasOwn(value, "encoding") &&
        Object.hasOwn(value, "data") &&
        value.encoding === "base64" &&
        typeof value.data === "string" &&
        Buffer.from(value.data, "base64").toString("base64") === value.data &&
        Buffer.from(value.data, "base64").equals(bytes),
    );
}
function hosted() {
    assert.equal(process.env.GITHUB_ACTIONS, "true", "Hosted-only witness");
    assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
    assert.equal(process.versions.node, "26.9.0");
    assert.equal(process.env.GITHUB_REPOSITORY, "40oleg/nona");
    assert.equal(
        process.env.GITHUB_RUN_ATTEMPT,
        "1",
        "Reruns would duplicate attempts",
    );
}
async function api(path) {
    const response = await fetch(
        `https://api.github.com/repos/40oleg/nona/${path}`,
        {
            headers: {
                authorization: `Bearer ${process.env.GH_TOKEN}`,
                accept: "application/vnd.github+json",
            },
            signal: AbortSignal.timeout(15000),
        },
    );
    assert.equal(response.status, 200, `Unavailable GitHub evidence: ${path}`);
    return response.json();
}
async function currentHead() {
    const pr = await api("pulls/647");
    assert.equal(pr.state, "open");
    assert.equal(pr.draft, true);
    assert.equal(pr.user.login, "40oleg");
    assert.equal(pr.head.repo.full_name, "40oleg/nona");
    assert.equal(pr.head.user.login, "40oleg");
    assert.equal(pr.head.ref, "nona/issue-646");
    assert.equal(pr.head.sha, process.env.WITNESS_HEAD, "Stale head");
    for (const label of ["full-ci", "gc-stress"])
        assert.ok(
            pr.labels.some((x) => x.name === label),
            `Preapply ${label}`,
        );
    return pr;
}
async function preflight(out) {
    const event = read(process.env.GITHUB_EVENT_PATH);
    assert.ok(
        ["pull_request", "workflow_dispatch"].includes(
            process.env.GITHUB_EVENT_NAME,
        ),
    );
    const head = event.pull_request?.head.sha ?? process.env.GITHUB_SHA;
    assert.match(head, /^[a-f0-9]{40}$/u);
    process.env.WITNESS_HEAD = head;
    if (process.env.GITHUB_EVENT_NAME === "pull_request")
        assert.equal(event.number, 647);
    else assert.equal(process.env.GITHUB_REF, "refs/heads/nona/issue-646");
    json(join(out, "pr.json"), await currentHead());
    const files = [];
    let complete = false;
    for (let page = 1; page <= 30; page++) {
        const commit = await api(`commits/${head}?per_page=100&page=${page}`);
        json(join(out, `commit-${page}.json`), commit);
        assert.equal(commit.sha, head);
        assert.ok(Array.isArray(commit.files));
        files.push(...commit.files);
        if (commit.files.length < 100) {
            complete = true;
            break;
        }
    }
    assert.ok(complete, "Truncated per-commit filenames");
    const execute =
        process.env.GITHUB_EVENT_NAME === "workflow_dispatch" ||
        changedSupport(files);
    if (execute) {
        // Includes failed/cancelled runs: no silent repeat of an existing attempt.
        const runs = await api(`actions/runs?head_sha=${head}&per_page=100`);
        json(join(out, "runs.json"), runs);
        assert.ok(runs.total_count < 100, "Incomplete run inventory");
        assert.ok(
            !runs.workflow_runs.some(
                (r) =>
                    r.id !== Number(process.env.GITHUB_RUN_ID) &&
                    r.path?.split("@")[0] === supportFiles[0],
            ),
            "This head already has a witness run",
        );
    }
    appendFileSync(
        process.env.GITHUB_OUTPUT,
        `head=${head}\nexecute=${execute}\n`,
    );
    json(join(out, "preflight.json"), {
        head,
        execute,
        complete,
        run: process.env.GITHUB_RUN_ID,
        attempt: process.env.GITHUB_RUN_ATTEMPT,
    });
}
function git(root, args) {
    const result = spawnSync("git", args, {
        cwd: root,
        maxBuffer: 64 * 1024 * 1024,
        timeout: 30000,
        windowsHide: true,
    });
    assert.ok(passed(result), `git ${args[0]} failed: ${result.stderr}`);
    return result.stdout;
}
function prepare(out, candidate, historical) {
    for (const name of [
        "GITHUB_RUN_ID",
        "GITHUB_JOB",
        "RUNNER_NAME",
        "ImageOS",
        "ImageVersion",
    ])
        assert.ok(process.env[name], `Missing run/image identity: ${name}`);
    assert.equal(
        git(candidate, ["rev-parse", "HEAD"]).toString().trim(),
        process.env.WITNESS_HEAD,
    );
    assert.equal(
        git(historical, ["rev-parse", "HEAD"]).toString().trim(),
        pins.http,
    );
    assert.equal(git(candidate, ["status", "--porcelain"]).length, 0);
    assert.equal(git(historical, ["status", "--porcelain"]).length, 0);
    git(candidate, ["merge-base", "--is-ancestor", published, "HEAD"]);
    const blob = (root, ref, file) =>
        git(root, ["show", `${ref}:src/runtime/${file}.ts`]).toString();
    const memory = readFileSync(join(candidate, "src/runtime/memory.ts"));
    const identity = overlayIdentity({
        historicalSource: pins.http,
        candidateHead: process.env.WITNESS_HEAD,
        baselineMemory: blob(historical, "HEAD", "memory"),
        mainMemory: blob(candidate, main, "memory"),
        publishedMemory: blob(candidate, published, "memory"),
        baselineGC: blob(historical, "HEAD", "gc"),
        mainGC: blob(candidate, main, "gc"),
        candidateGC: blob(candidate, "HEAD", "gc"),
        candidateMemory: memory.toString(),
    });
    // Only memory.ts may differ in production, even in the candidate checkout.
    assert.equal(
        git(candidate, ["diff", "--name-only", published, "HEAD", "--", "src/"])
            .toString()
            .trim(),
        "src/runtime/memory.ts",
    );
    writeFileSync(
        join(out, "historical-tree.tar"),
        git(historical, ["archive", "--format=tar", "HEAD"]),
    );
    writeFileSync(
        join(out, "candidate.patch"),
        git(candidate, ["diff", "--binary", published, "HEAD"]),
    );
    writeFileSync(
        join(out, "memory.before.ts"),
        blob(historical, "HEAD", "memory"),
    );
    writeFileSync(join(out, "memory.after.ts"), memory);
    copyFileSync(
        join(candidate, "tests/gc.test.ts"),
        join(out, "candidate-gc.test.ts"),
    );
    copyFileSync(
        join(candidate, "src/runtime/memory.ts"),
        join(historical, "src/runtime/memory.ts"),
    );
    assert.equal(
        git(historical, ["diff", "--name-only"]).toString().trim(),
        "src/runtime/memory.ts",
    );
    const diff = git(historical, ["diff", "--binary", "--", "."]);
    writeFileSync(join(out, "historical-overlay.patch"), diff);
    const sourceFiles = [
        "src/runtime/memory.ts",
        "src/runtime/gc.ts",
        "tests/http-agent.test.ts",
        "tests/helpers/http-agent-cases.ts",
        "tests/helpers/http-agent-policy.ts",
        "tests/helpers/host.ts",
        "tests/helpers/native.ts",
        "tests/helpers/program.ts",
    ];
    json(join(out, "provenance.json"), {
        ...identity,
        overlayDiffSha256: sha(diff),
        helperHead: process.env.WITNESS_HEAD,
        helperSha256: sha(readFileSync(script)),
        gcTestSha256: sha(readFileSync(join(candidate, "tests/gc.test.ts"))),
        sourceFiles: sourceFiles.map((file) => ({
            file,
            sha256: sha(readFileSync(join(historical, file))),
            baselineBlob: git(historical, ["rev-parse", `HEAD:${file}`])
                .toString()
                .trim(),
        })),
        baselineBlobs: [
            pins.http,
            main,
            published,
            process.env.WITNESS_HEAD,
        ].map((ref) => ({
            ref,
            memory: git(candidate, [
                "rev-parse",
                `${ref}:src/runtime/memory.ts`,
            ])
                .toString()
                .trim(),
            gc: git(candidate, ["rev-parse", `${ref}:src/runtime/gc.ts`])
                .toString()
                .trim(),
        })),
        run: process.env.GITHUB_RUN_ID,
        attempt: process.env.GITHUB_RUN_ATTEMPT,
        job: process.env.GITHUB_JOB,
        runUrl: `https://github.com/40oleg/nona/actions/runs/${process.env.GITHUB_RUN_ID}`,
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        runner: process.env.RUNNER_NAME,
        imageOS: process.env.ImageOS,
        imageVersion: process.env.ImageVersion,
        historicalFailuresCleared: false,
        releaseAcceptance: false,
    });
}
// Observe the unchanged helper/request once. Only Node-side output capture uses
// Buffers; decode the return to the helper's requested encoding, including output.
export function observeExecutions(out, root) {
    mkdirSync(out, { recursive: true });
    const key = Symbol.for("nona.issue646.witness-spawn");
    globalThis[key] = (command, args, options) => {
        const kind = command === process.execPath ? "node" : "native";
        const directory = join(
            out,
            `${String(readdirSync(out).length + 1).padStart(2, "0")}-${kind}`,
        );
        mkdirSync(directory);
        const image = kind === "native" ? readFileSync(command) : null;
        if (image) writeFileSync(join(directory, "image.bin"), image);
        json(join(directory, "attempt.json"), {
            kind,
            command,
            args,
            options,
            // options are the original helper options, not the collector options.
            streamEncoding: options.encoding ?? "buffer",
            captureEncoding: "buffer",
            timeout: options.timeout,
            commandSha256: sha(readFileSync(command)),
            imageSha256: image && sha(image),
            workerPid: process.pid,
            started: new Date().toISOString(),
        });
        const started = performance.now();
        const raw = spawnSync(command, args, {
            ...options,
            encoding: "buffer",
        });
        const elapsedMs = performance.now() - started;
        // Keep raw and helper-shaped results separately, including failure/null
        // fields. A missing stream never becomes an empty successful capture.
        for (const stream of ["stdout", "stderr"]) {
            if (!Buffer.isBuffer(raw[stream])) continue;
            writeFileSync(join(directory, `${stream}.bin`), raw[stream]);
            json(join(directory, `${stream}.bin.sha256.json`), {
                sha256: sha(raw[stream]),
            });
        }
        json(join(directory, "raw-result.json"), { ...raw, elapsedMs });
        const result = { ...raw };
        if (options.encoding && options.encoding !== "buffer") {
            const decode = (value) =>
                Buffer.isBuffer(value)
                    ? value.toString(options.encoding)
                    : value;
            for (const stream of ["stdout", "stderr"])
                if (Object.hasOwn(result, stream))
                    result[stream] = decode(result[stream]);
            if (Array.isArray(result.output))
                result.output = result.output.map(decode);
        }
        json(join(directory, "result.json"), {
            ...result,
            elapsedMs,
        });
        return result;
    };
    const prefix = pathToFileURL(join(root, "dist/tests/helpers") + "/").href;
    return registerHooks({
        resolve(specifier, context, next) {
            if (
                specifier === "node:child_process" &&
                context.parentURL?.startsWith(prefix)
            )
                return {
                    url: "nona-gc-witness:child-process",
                    shortCircuit: true,
                };
            return next(specifier, context);
        },
        load(url, context, next) {
            if (url !== "nona-gc-witness:child-process")
                return next(url, context);
            return {
                format: "module",
                shortCircuit: true,
                source: `export * from 'node:child_process'; export const spawnSync = (...args) => globalThis[Symbol.for('nona.issue646.witness-spawn')](...args);`,
            };
        },
    });
}
async function httpWorker(out, root) {
    assert.equal(process.env.NONA_GC_STRESS, "on");
    assert.equal(process.arch, "x64");
    assert.ok(["win32", "linux"].includes(process.platform));
    const provenance = read(join(out, "../provenance.json"));
    assert.equal(provenance.candidateHead, process.env.WITNESS_HEAD);
    assert.equal(git(root, ["rev-parse", "HEAD"]).toString().trim(), pins.http);
    assert.equal(
        sha(readFileSync(join(root, "src/runtime/memory.ts"))),
        provenance.overlaySha256,
    );
    const entries = await loadCases(root, "http");
    const request = originalRequest(entries);
    json(join(out, "request.json"), {
        ...request,
        historicalSource: pins.http,
        candidateHead: process.env.WITNESS_HEAD,
        modifiedHistoricalTree: true,
        gcSelection: process.env.NONA_GC_STRESS,
    });
    const hooks = observeExecutions(join(out, "attempts"), root);
    let result,
        error,
        assertionsPassed = false;
    try {
        const host = await import(
            pathToFileURL(join(root, "dist/tests/helpers/host.js"))
        );
        result = host.runModulesOnHost(...request.args);
        entries[0].calls[0].result = result;
        entries[0].replay();
        assertionsPassed = true;
    } catch (caught) {
        error = caught;
    } finally {
        hooks.deregister();
        json(join(out, "worker-result.json"), {
            result,
            error,
            assertionsPassed,
        });
    }
    if (!assertionsPassed) process.exitCode = 1;
}
function stopTree(child) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null)
        return { needed: false };
    if (process.platform === "win32")
        return {
            needed: true,
            pid: child.pid,
            result: spawnSync(
                "taskkill",
                ["/PID", String(child.pid), "/T", "/F"],
                { windowsHide: true, timeout: 10000 },
            ),
        };
    try {
        process.kill(-child.pid, "SIGKILL");
        return { needed: true, pid: child.pid, groupKilled: true };
    } catch (error) {
        return { needed: true, pid: child.pid, error };
    }
}
const children = new Set();
async function command(out, name, executable, args, cwd, timeout, env = {}) {
    const directory = join(out, name);
    mkdirSync(directory, { recursive: true });
    json(join(directory, "invocation.json"), {
        executable,
        args,
        cwd,
        timeout,
        env,
        started: new Date().toISOString(),
    });
    const child = spawn(executable, args, {
        cwd,
        env: { ...process.env, ...env },
        windowsHide: true,
        detached: process.platform !== "win32",
    });
    children.add(child);
    for (const stream of ["stdout", "stderr"]) {
        writeFileSync(join(directory, `${stream}.bin`), "");
        child[stream].on("data", (bytes) =>
            appendFileSync(join(directory, `${stream}.bin`), bytes),
        );
    }
    let timedOut = false,
        error,
        cleanup;
    const timer = setTimeout(() => {
        timedOut = true;
        cleanup = stopTree(child);
        json(join(directory, "deadline-cleanup.json"), cleanup);
    }, timeout);
    const result = await new Promise((done) => {
        child.on("error", (caught) => {
            error = caught;
        });
        child.on("close", (status, signal) =>
            done({ status, signal, error, timedOut, cleanup }),
        );
    });
    clearTimeout(timer);
    children.delete(child);
    json(join(directory, "launcher.json"), result);
    return passed(result);
}
async function run(out, candidate, historical) {
    assert.equal(process.arch, "x64");
    assert.ok(["win32", "linux"].includes(process.platform));
    assert.equal(process.env.NONA_GC_STRESS, "on");
    assert.ok(
        !existsSync(join(out, "provenance.json")),
        "Never overwrite an attempt",
    );
    writeFileSync(
        join(out, "run-started.json"),
        JSON.stringify({
            head: process.env.WITNESS_HEAD,
            run: process.env.GITHUB_RUN_ID,
            started: new Date().toISOString(),
        }),
        { flag: "wx" },
    );
    const deadline = setTimeout(() => {
        json(join(out, "controller-timeout.json"), { limitMs: 720000 });
        process.exit(1);
    }, 720000);
    process.on("exit", () => {
        if (children.size)
            json(
                join(out, "controller-cleanup.json"),
                [...children].map(stopTree),
            );
    });
    for (const signal of ["SIGINT", "SIGTERM"])
        process.on(signal, () => {
            json(join(out, "cancelled.json"), { signal });
            process.exit(1);
        });
    try {
        json(join(out, "current-pr.json"), await currentHead());
        prepare(out, candidate, historical);
        // npm is launched via its JS entrypoint, without a shell on Windows.
        const npm = join(
            dirname(process.execPath),
            process.platform === "win32"
                ? "node_modules/npm/bin/npm-cli.js"
                : "../lib/node_modules/npm/bin/npm-cli.js",
        );
        for (const [name, root] of [
            ["candidate", candidate],
            ["historical", historical],
        ]) {
            if (
                !(await command(
                    out,
                    `${name}-dependencies`,
                    process.execPath,
                    [npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
                    root,
                    60000,
                ))
            ) {
                process.exitCode = 1;
                continue;
            }
            if (
                !(await command(
                    out,
                    `${name}-build`,
                    process.execPath,
                    [join(root, "scripts/build.mjs")],
                    root,
                    60000,
                ))
            ) {
                process.exitCode = 1;
                continue;
            }
            if (name === "candidate") {
                await currentHead();
                json(join(out, "gc-inventory.json"), {
                    sourceHead: process.env.WITNESS_HEAD,
                    tests: gcNames,
                    pattern: "\\(#646\\)$",
                    concurrency: 1,
                    gcSelection: "on",
                    helperAndTarget:
                        "unchanged candidate tests/gc.test.ts native helper and linkHost",
                });
                if (
                    !(await command(
                        out,
                        "gc",
                        process.execPath,
                        [
                            "--test",
                            "--test-concurrency=1",
                            "--test-name-pattern=\\(#646\\)$",
                            "--test-reporter=tap",
                            "dist/tests/gc.test.js",
                        ],
                        root,
                        210000,
                        { NONA_EXECUTION_EVIDENCE: join(out, "gc/executions") },
                    ))
                )
                    process.exitCode = 1;
            } else {
                mkdirSync(join(out, "http"), { recursive: true });
                // Recheck admission immediately before the sole HTTP attempt.
                await currentHead();
                if (
                    !(await command(
                        out,
                        "http",
                        process.execPath,
                        [script, "http-worker", join(out, "http"), root],
                        root,
                        270000,
                    ))
                )
                    process.exitCode = 1;
            }
        }
    } finally {
        clearTimeout(deadline);
    }
}
function walk(root) {
    if (!existsSync(root)) return [];
    return readdirSync(root).flatMap((name) => {
        const file = join(root, name);
        return statSync(file).isDirectory() ? walk(file) : [file];
    });
}
function httpStreamsMatch(directory, attempt, result, raw) {
    const encoding = attempt.options?.encoding ?? "buffer";
    if (
        attempt.captureEncoding !== "buffer" ||
        attempt.streamEncoding !== encoding ||
        (encoding !== "buffer" && !Buffer.isEncoding(encoding)) ||
        !result ||
        !raw ||
        !Array.isArray(raw.output) ||
        !Array.isArray(result.output) ||
        raw.output.length < 3 ||
        raw.output.length !== result.output.length
    )
        return false;
    for (const key of ["status", "signal", "pid", "error"])
        if (JSON.stringify(raw[key]) !== JSON.stringify(result[key]))
            return false;
    for (const stream of ["stdout", "stderr"]) {
        const file = join(directory, `${stream}.bin`);
        const hashFile = file + ".sha256.json";
        if (!existsSync(file) || !existsSync(hashFile)) return false;
        const bytes = readFileSync(file);
        if (
            sha(bytes) !== read(hashFile).sha256 ||
            !streamMatches(raw[stream], bytes, "buffer") ||
            !streamMatches(result[stream], bytes, encoding) ||
            !streamMatches(
                raw.output[stream === "stdout" ? 1 : 2],
                bytes,
                "buffer",
            )
        )
            return false;
    }
    return raw.output.every((value, index) => {
        if (value === null) return result.output[index] === null;
        const bytes =
            typeof value?.data === "string"
                ? Buffer.from(value.data, "base64")
                : null;
        return (
            streamMatches(value, bytes, "buffer") &&
            streamMatches(result.output[index], bytes, encoding)
        );
    });
}
export function verify(out) {
    const optional = (file) => (existsSync(file) ? read(file) : null);
    const attempts = [];
    let httpIntegrity = true,
        gcIntegrity = true;
    for (const file of walk(join(out, "http/attempts")).filter((f) =>
        f.endsWith("attempt.json"),
    )) {
        const attempt = read(file),
            directory = dirname(file),
            result = optional(join(directory, "result.json")),
            raw = optional(join(directory, "raw-result.json"));
        const retained = {
            ...attempt,
            ...result,
            status: result?.status ?? null,
        };
        attempts.push(retained);
        httpIntegrity &&= httpStreamsMatch(directory, attempt, result, raw);
        for (const stream of ["stdout", "stderr"]) {
            const bytes = join(directory, `${stream}.bin`);
            retained[`${stream}Sha256`] = existsSync(bytes)
                ? sha(readFileSync(bytes))
                : null;
        }
        if (attempt.kind === "native")
            httpIntegrity &&=
                existsSync(join(directory, "image.bin")) &&
                sha(readFileSync(join(directory, "image.bin"))) ===
                    attempt.imageSha256;
    }
    const gcExecutions = walk(join(out, "gc/executions"))
        .filter((f) => f.endsWith("result.json"))
        .map((file) => {
            const directory = dirname(file);
            for (const name of ["image.bin", "stdout.bin", "stderr.bin"]) {
                const bytes = join(directory, name),
                    hash = optional(bytes + ".sha256.json");
                gcIntegrity &&= Boolean(
                    hash &&
                    existsSync(bytes) &&
                    sha(readFileSync(bytes)) === hash.sha256,
                );
            }
            const result = read(file);
            for (const stream of ["stdout", "stderr"]) {
                const bytes = join(directory, `${stream}.bin`);
                gcIntegrity &&=
                    existsSync(bytes) &&
                    streamMatches(result[stream], readFileSync(bytes));
            }
            return {
                ...result,
                imageSha256: optional(join(directory, "image.bin.sha256.json"))
                    ?.sha256,
            };
        });
    const tap = existsSync(join(out, "gc/stdout.bin"))
        ? readFileSync(join(out, "gc/stdout.bin"), "utf8")
        : "";
    const buildPassed = (name) =>
        passed(optional(join(out, `${name}-dependencies/launcher.json`))) &&
        passed(optional(join(out, `${name}-build/launcher.json`)));
    const report = {
        prerequisites: Boolean(
            optional(join(out, "provenance.json")) &&
            !optional(join(out, "failure.json")) &&
            !optional(join(out, "controller-timeout.json")) &&
            !optional(join(out, "cancelled.json")),
        ),
        gc: {
            launcher: optional(join(out, "gc/launcher.json")),
            executions: gcExecutions,
            testsPassed:
                buildPassed("candidate") && gcIntegrity && gcTestsPassed(tap),
        },
        http: {
            launcher: optional(join(out, "http/launcher.json")),
            attempts,
            assertionsPassed:
                buildPassed("historical") &&
                httpIntegrity &&
                optional(join(out, "http/worker-result.json"))
                    ?.assertionsPassed === true,
        },
    };
    const outcome = {
        ...gates(report),
        run: process.env.GITHUB_RUN_ID,
        attempt: process.env.GITHUB_RUN_ATTEMPT,
        candidateHead: process.env.WITNESS_HEAD,
        historicalSource: pins.http,
        modifiedHistoricalTree: true,
        historicalFailuresCleared: false,
        releaseAcceptance: false,
        gcExecutions: gcExecutions.length,
        gcIntegrity,
        httpIntegrity,
        httpOutcomes: attempts
            .slice(0, 8)
            .map(
                ({
                    kind,
                    status,
                    signal,
                    error,
                    pid,
                    timeout,
                    elapsedMs,
                    imageSha256,
                    stdoutSha256,
                    stderrSha256,
                    streamEncoding,
                    captureEncoding,
                }) => ({
                    kind,
                    status,
                    signal,
                    error,
                    pid,
                    timeout,
                    elapsedMs,
                    imageSha256,
                    stdoutSha256,
                    stderrSha256,
                    streamEncoding,
                    captureEncoding,
                }),
            ),
        gcOutcomes: gcExecutions
            .slice(0, 8)
            .map(({ status, signal, error, elapsedMs, imageSha256 }) => ({
                status,
                signal,
                error,
                elapsedMs,
                imageSha256,
            })),
        missingReports: [
            "provenance.json",
            "gc/launcher.json",
            "http/launcher.json",
            "http/worker-result.json",
        ].filter((file) => !existsSync(join(out, file))),
    };
    json(join(out, "reports.json"), report);
    json(
        join(out, "raw-index.json"),
        walk(out)
            .filter(
                (f) =>
                    !["raw-index.json", "outcome.json"].includes(
                        f.slice(out.length + 1),
                    ),
            )
            .map((file) => ({
                file: file.slice(out.length + 1),
                bytes: statSync(file).size,
                sha256: sha(readFileSync(file)),
            })),
    );
    json(join(out, "outcome.json"), outcome);
    if (!outcome.gc || !outcome.http) process.exitCode = 1;
}
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    const [mode, output, candidate, historical] = process.argv.slice(2);
    hosted();
    const out = resolve(output);
    mkdirSync(out, { recursive: true });
    try {
        if (mode === "preflight") await preflight(out);
        else if (mode === "run")
            await run(out, resolve(candidate), resolve(historical));
        else if (mode === "http-worker")
            await httpWorker(out, resolve(candidate));
        else if (mode === "verify") verify(out);
        else throw Error("Unknown witness mode");
    } catch (error) {
        json(join(out, "failure.json"), {
            mode,
            error,
            historicalFailuresCleared: false,
            releaseAcceptance: false,
        });
        process.exitCode = 1;
    }
}
