// #638: bounded hosted-only environment startup comparison. Importing this
// module is pure; configuration/aggregation/decision tests need no compiler.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    appendFileSync,
    chmodSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { hostname, release } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const BASELINE = "cbd9d287fd2cdd3b5e65bdc592d88e91b3fab876";
export const BASELINE_BLOB = "e32b22cb33372868a2bf979600b78337f0f73e2e";
export const DEADLINES = Object.freeze({
    readiness: 60000,
    hard: 90000,
    probe: 10000,
    cleanup: 5000,
});
const shapes = ["base", "few", "many"];
const modes = ["off", "on"];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const errorInfo = (error) => ({
    name: error.name,
    code: error.code,
    message: error.message,
});

export function readConfig(args) {
    const allowed = new Set([
        "baseline",
        "candidate",
        "candidate-process-blob",
        "baseline-root",
        "candidate-root",
        "out",
        "pairs",
    ]);
    const values = {};
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].slice(2);
        assert.ok(
            args[i].startsWith("--") && allowed.has(key),
            "unknown option",
        );
        assert.ok(
            !Object.hasOwn(values, key) &&
                args[i + 1] &&
                !args[i + 1].startsWith("--"),
            "duplicate/missing option",
        );
        values[key] = args[i + 1];
    }
    for (const key of allowed)
        if (key !== "pairs") assert.ok(values[key], `required --${key}`);
    for (const key of ["baseline", "candidate", "candidate-process-blob"])
        assert.match(
            values[key],
            /^[0-9a-f]{40}$/,
            "full immutable Git SHA required",
        );
    assert.equal(
        values.baseline,
        BASELINE,
        "baseline is the accepted #638 main",
    );
    assert.notEqual(values.candidate, BASELINE);
    assert.notEqual(values["candidate-process-blob"], BASELINE_BLOB);
    const pairs = Number(values.pairs ?? "2");
    assert.ok(
        [2, 4].includes(pairs),
        "pairs must be 2 or 4 (balanced and bounded)",
    );
    return {
        baseline: values.baseline,
        candidate: values.candidate,
        baselineBlob: BASELINE_BLOB,
        candidateBlob: values["candidate-process-blob"],
        baselineRoot: resolve(values["baseline-root"]),
        candidateRoot: resolve(values["candidate-root"]),
        out: resolve(values.out),
        pairs,
    };
}

// Volume convention: sum(key.length + 1 for '=' + value.length + 1 for NUL)
// plus one final NUL, in JavaScript UTF-16 code units, including on POSIX.
export function aggregateEnvironment(env) {
    const keys = Object.keys(env);
    let units = 1,
        descriptorErrors = 0;
    for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(env, key);
        if (
            !descriptor ||
            !descriptor.writable ||
            !descriptor.enumerable ||
            !descriptor.configurable ||
            typeof descriptor.value !== "string"
        )
            descriptorErrors++;
        units += key.length + 2 + String(env[key]).length;
    }
    return { count: keys.length, units, descriptorErrors };
}

export function makeEnvironment({ platform, shape, gc, temporary }) {
    assert.ok(["win32", "linux"].includes(platform));
    assert.ok(shapes.includes(shape) && modes.includes(gc));
    assert.ok(typeof temporary === "string" && !temporary.includes("\0"));
    const env = Object.create(null);
    // These are literals or an explicitly-created experiment directory. No
    // parent environment is enumerated, copied, logged or hashed.
    if (platform === "win32")
        Object.assign(env, {
            SystemRoot: "C:\\Windows",
            WINDIR: "C:\\Windows",
            SystemDrive: "C:",
            ComSpec: "C:\\Windows\\System32\\cmd.exe",
            PATH: "C:\\Windows\\System32;C:\\Windows",
            TEMP: temporary,
            TMP: temporary,
            // Complete libuv's required_vars allowlist before sizing. Otherwise
            // Node can inject missing entries from the parent's environment.
            HOMEDRIVE: "C:",
            HOMEPATH: "\\nona-synthetic-user",
            LOGONSERVER: "\\\\NONA-SYNTHETIC",
            USERDOMAIN: "NONA-SYNTHETIC",
            USERNAME: "nona-synthetic-user",
            USERPROFILE: "C:\\nona-synthetic-user",
        });
    else
        Object.assign(env, {
            PATH: "/usr/bin:/bin",
            LANG: "C",
            TMPDIR: temporary,
        });
    Object.assign(env, {
        NONA_GC_STRESS: gc === "off" ? "off" : "on",
        NONA_CASE: "first",
        7: "numeric",
        constructor: "collision",
        toString: "collision",
        π: "unicode",
    });
    env.__proto__ = "collision";
    for (let i = 0; Object.keys(env).length < 39; i++)
        env[`NONA_SAFE_${String(i).padStart(3, "0")}`] = "s";
    if (shape !== "base") {
        env.NONA_PADDING = "";
        if (shape === "many")
            for (let i = 0; Object.keys(env).length < 150; i++)
                env[`NONA_EXTRA_${String(i).padStart(3, "0")}`] = "s";
        const padding = 9221 - aggregateEnvironment(env).units;
        assert.ok(
            padding >= 0,
            "safe paths exceed fixed fixture volume; not comparable",
        );
        env.NONA_PADDING = "p".repeat(padding);
        assert.equal(aggregateEnvironment(env).units, 9221);
    }
    assert.equal(
        Object.keys(env).length,
        { base: 39, few: 40, many: 150 }[shape],
    );
    if (platform === "win32")
        assert.equal(
            new Set(Object.keys(env).map((key) => key.toUpperCase())).size,
            Object.keys(env).length,
        );
    return env;
}

export function verifyAggregate(actual, env) {
    const expected = aggregateEnvironment(env);
    return (
        actual !== null &&
        typeof actual === "object" &&
        actual.count === expected.count &&
        actual.units === expected.units &&
        actual.descriptorErrors === 0
    );
}

export function schedule(pairs) {
    assert.ok([2, 4].includes(pairs));
    const plan = [];
    for (const shape of shapes)
        for (const gc of modes)
            for (let pair = 0; pair < pairs; pair++) {
                const order =
                    pair % 2 === 0
                        ? ["node", "baseline", "candidate"]
                        : ["candidate", "baseline", "node"];
                for (const engine of order)
                    plan.push({
                        id: `${shape}-${gc}-${pair}-${engine}`,
                        shape,
                        gc,
                        pair,
                        engine,
                    });
            }
    return plan;
}

export function buildOptions(fileName, platform, gc) {
    return {
        fileName,
        target: platform === "win32" ? "win32-x64" : "linux-x64",
        module: true,
        gcStress: gc === "on",
        fullRuntime: false,
    };
}

export function buildDecision(record) {
    return {
        usable:
            record.code === 0 &&
            record.signal === null &&
            record.cleanupVerified === true &&
            !record.error &&
            !record.timeout,
        continue: record.cleanupVerified === true,
    };
}

// Native source is identical for old/new and both GC modes/platforms. Only the
// Node control includes full enumeration; never charge Proxy scans to native
// startup or its bounded post-ready proof. Both paths observe real process.env.
export function fixtureSource({ full = false } = {}) {
    return `${full ? `const aggregateEnvironment=${aggregateEnvironment.toString()};` : ""}
const env=process.env;
const selected=["NONA_CASE","7","constructor","toString","π","__proto__","NONA_GC_STRESS"];
const sentinels=env.NONA_CASE==="first"&&env["7"]==="numeric"&&env.constructor==="collision"&&env.toString==="collision"&&env["π"]==="unicode"&&env.__proto__==="collision"&&(env.NONA_GC_STRESS==="off"||env.NONA_GC_STRESS==="on");
let input="";
process.stdin.setEncoding("utf8");
process.stdin.on("data",chunk=>{input+=chunk});
process.stdin.on("end",()=>{
  try {
    const expected=JSON.parse(input);
    let mismatches=0;
    ${
        full
            ? `const keys=Object.keys(env), wanted=Object.keys(expected);
    if(keys.length!==wanted.length)mismatches++;
    for(const key of wanted)if(!Object.prototype.hasOwnProperty.call(env,key)||env[key]!==expected[key])mismatches++;
    for(const key of keys)if(!Object.prototype.hasOwnProperty.call(expected,key))mismatches++;`
            : `for(const key of selected)if(env[key]!==expected[key])mismatches++;`
    }
    const upper="NONA_CASE",lower="nona_case",windows=process.platform==="win32";
    let semantics=env[upper]==="first";
    if(windows){
      const d=Object.getOwnPropertyDescriptor(env,lower);
      semantics=semantics&&env[lower]==="first"&&(lower in env)&&!!d&&d.value==="first"&&d.writable&&d.enumerable&&d.configurable;
      env[lower]="changed";semantics=semantics&&env[upper]==="changed";
      delete env[lower];semantics=semantics&&!(upper in env);
      env[upper]="reinserted";semantics=semantics&&env[lower]==="reinserted";
    }else{
      semantics=semantics&&!(lower in env);
      env[lower]="distinct";semantics=semantics&&env[upper]==="first"&&env[lower]==="distinct";
      delete env[upper];semantics=semantics&&env[lower]==="distinct"&&!(upper in env);
      env[upper]="reinserted";semantics=semantics&&env[lower]==="distinct"&&env[upper]==="reinserted";
    }
    console.log("NONA_ENV_PROBE "+JSON.stringify({mismatches,semantics}));
    process.exit(mismatches===0&&semantics?0:2);
  }catch(error){console.log("NONA_ENV_PROBE_ERROR");process.exit(3)}
});
console.log("NONA_ENV_READY "+JSON.stringify({sentinels${full ? ",aggregate:aggregateEnvironment(env)" : ""}}));
`;
}

export function visibilityFor(engine) {
    assert.ok(["node", "baseline", "candidate"].includes(engine));
    return engine === "node" ? "full-node-control" : "sampled-native";
}

export function verifyReady(actual, env, engine) {
    const full = visibilityFor(engine) === "full-node-control";
    return {
        readyVerified:
            actual?.sentinels === true &&
            (full
                ? verifyAggregate(actual.aggregate, env)
                : actual !== null &&
                  typeof actual === "object" &&
                  Object.keys(actual).length === 1 &&
                  !Object.hasOwn(actual, "aggregate")),
        aggregateVerified: full
            ? verifyAggregate(actual?.aggregate, env)
            : null,
    };
}

function rowPass(row) {
    return (
        Number.isFinite(row.readyMs) &&
        row.readyMs >= 0 &&
        row.readyMs <= DEADLINES.readiness &&
        Number.isFinite(row.probeMs) &&
        row.probeMs >= 0 &&
        row.probeMs <= DEADLINES.probe &&
        Number.isFinite(row.totalMs) &&
        row.totalMs >= 0 &&
        row.totalMs <= DEADLINES.hard &&
        row.parentAggregateVerified === true &&
        row.visibility === visibilityFor(row.engine) &&
        row.readyVerified === true &&
        (row.engine === "node"
            ? row.aggregateVerified === true
            : row.aggregateVerified === null) &&
        row.probeVerified === true &&
        row.cleanupVerified === true &&
        row.code === 0 &&
        row.signal === null &&
        row.timeout === null &&
        row.errors.length === 0
    );
}

export function decide(rows, plan) {
    const complete =
        rows.length === plan.length &&
        rows.every((row) => !row.notStarted) &&
        new Set(rows.map((row) => row.id)).size === plan.length &&
        plan.every((item) => rows.some((row) => row.id === item.id));
    const contrary = [];
    for (const row of rows.filter((row) => row.engine === "candidate")) {
        const old = rows.find(
            (other) =>
                other.engine === "baseline" &&
                other.shape === row.shape &&
                other.gc === row.gc &&
                other.pair === row.pair,
        );
        if (old && rowPass(old) && (!rowPass(row) || row.readyMs > old.readyMs))
            contrary.push({
                shape: row.shape,
                gc: row.gc,
                pair: row.pair,
                baselineReadyMs: old.readyMs,
                candidateReadyMs: row.readyMs,
                candidatePass: rowPass(row),
            });
    }
    return {
        pass: complete && rows.every(rowPass),
        complete,
        nodeControlsPass:
            plan.some((row) => row.engine === "node") &&
            plan
                .filter((row) => row.engine === "node")
                .every(
                    (item) =>
                        rows.filter(
                            (row) =>
                                row.id === item.id && row.engine === "node",
                        ).length === 1 &&
                        rowPass(rows.find((row) => row.id === item.id)),
                ),
        contrary,
        nativeTimingImprovementEstablished: false,
        historical602Acceptance: false,
        interpretation:
            "Report paired raw startup timings and failures; investigate contrary results. This bounded minimal fixture does not establish a timing improvement or #602 acceptance.",
    };
}

export function requireHosted(host) {
    assert.equal(host.actions, "true", "GitHub Actions only");
    assert.equal(
        host.environment,
        "github-hosted",
        "GitHub-hosted only; no self-hosted fallback",
    );
    assert.ok(["win32", "linux"].includes(host.platform));
    assert.equal(host.arch, "x64");
    assert.equal(host.node, "v26.9.0");
}

// The workflow admits only the existing owner PR or an owner dispatch at the
// very same branch/head. A PR merge SHA is never a candidate source pin.
export function admitEvent({
    name,
    repository,
    owner,
    ref,
    sha,
    actor,
    event,
    candidate,
    candidateBlob,
    pairs = "2",
}) {
    assert.equal(repository, "40oleg/nona");
    assert.equal(owner, "40oleg");
    assert.match(candidate, /^[0-9a-f]{40}$/);
    assert.match(candidateBlob, /^[0-9a-f]{40}$/);
    assert.notEqual(candidate, BASELINE);
    assert.notEqual(candidateBlob, BASELINE_BLOB);
    assert.ok(["2", "4"].includes(pairs));
    if (name === "pull_request") {
        const pr = event.pull_request;
        assert.ok(["opened", "synchronize", "reopened"].includes(event.action));
        assert.equal(event.number, 639);
        assert.equal(pr.number, 639);
        assert.equal(pr.state, "open");
        assert.equal(pr.user.login, "40oleg");
        assert.equal(pr.head.repo.full_name, repository);
        assert.equal(pr.head.repo.owner.login, owner);
        assert.equal(pr.head.ref, "nona/issue-638");
        assert.equal(pr.head.sha, candidate);
        assert.equal(pr.base.repo.full_name, repository);
        assert.equal(pr.base.ref, "main");
        assert.equal(ref, "refs/pull/639/merge");
        assert.equal(pairs, "2");
    } else {
        assert.equal(name, "workflow_dispatch");
        assert.equal(actor, "40oleg");
        assert.equal(ref, "refs/heads/nona/issue-638");
        assert.equal(sha, candidate);
        assert.equal(event.inputs.candidate, candidate);
        assert.equal(event.inputs.candidate_blob, candidateBlob);
        assert.equal(event.inputs.pairs, pairs);
    }
    return { candidate, candidateBlob, pairs, event: name, ref };
}

function hostedIdentity() {
    requireHosted({
        actions: process.env.GITHUB_ACTIONS,
        environment: process.env.NONA_RUNNER_ENVIRONMENT,
        platform: process.platform,
        arch: process.arch,
        node: process.version,
    });
    for (const field of [
        "GITHUB_RUN_ID",
        "GITHUB_RUN_ATTEMPT",
        "GITHUB_SHA",
        "GITHUB_WORKFLOW_REF",
        "GITHUB_WORKFLOW_SHA",
        "RUNNER_NAME",
        "ImageOS",
        "ImageVersion",
    ])
        assert.ok(process.env[field], `missing hosted identity: ${field}`);
    return {
        run: process.env.GITHUB_RUN_ID,
        attempt: process.env.GITHUB_RUN_ATTEMPT,
        workflowCommit: process.env.GITHUB_SHA,
        event: process.env.GITHUB_EVENT_NAME,
        workflowRef: process.env.GITHUB_WORKFLOW_REF,
        workflowSha: process.env.GITHUB_WORKFLOW_SHA,
        runner: process.env.RUNNER_NAME,
        image: process.env.ImageOS,
        imageVersion: process.env.ImageVersion,
        hostname: hostname(),
        osRelease: release(),
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        nodeSha256: sha256(readFileSync(process.execPath)),
    };
}

function git(root, args) {
    const result = spawnSync("git", ["-C", root, ...args], {
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
    });
    assert.ifError(result.error);
    assert.equal(
        result.status,
        0,
        `Git provenance check failed: ${result.stdout}\n${result.stderr}`,
    );
    return result.stdout.trim();
}

// Hash an ordered manifest of repository/build files, never process.env. The
// full per-file manifest is retained so the aggregate can be independently checked.
function treeManifest(root, folder) {
    const files = [];
    function walk(directory) {
        for (const entry of readdirSync(directory, {
            withFileTypes: true,
        }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
            const path = join(directory, entry.name);
            assert.ok(!entry.isSymbolicLink(), "no symlinks in measured tree");
            if (entry.isDirectory()) walk(path);
            else if (entry.isFile())
                files.push({
                    path: relative(root, path).split(sep).join("/"),
                    sha256: sha256(readFileSync(path)),
                });
        }
    }
    walk(join(root, folder));
    assert.ok(files.length > 0, "empty provenance tree");
    return { sha256: sha256(JSON.stringify(files)), files };
}

function verifyCheckout(root, commit, blob) {
    assert.equal(git(root, ["rev-parse", "HEAD"]), commit);
    assert.equal(
        git(root, ["status", "--porcelain", "--untracked-files=no"]),
        "",
        "tracked checkout must be clean before builds",
    );
    assert.equal(
        git(root, ["rev-parse", `${commit}:src/lib/runtime/process.js`]),
        blob,
    );
    assert.equal(
        git(root, ["hash-object", "src/lib/runtime/process.js"]),
        blob,
    );
    return {
        commit,
        processBlob: blob,
        sourceTree: git(root, ["rev-parse", `${commit}:src`]),
        sourceManifest: treeManifest(root, "src"),
        packageSha256: sha256(readFileSync(join(root, "package.json"))),
        lockSha256: sha256(readFileSync(join(root, "package-lock.json"))),
        buildScriptSha256: sha256(
            readFileSync(join(root, "scripts/build.mjs")),
        ),
    };
}

// This process is the only child started by each measurement; the fixture has
// no child_process imports. Close/reap + PID absence verify direct-child cleanup.
function absent(pid) {
    if (!pid) return true;
    try {
        process.kill(pid, 0);
        return false;
    } catch (error) {
        return error.code === "ESRCH";
    }
}

// Compiler build.mjs starts tsc. Keep its whole tree inside the build deadline
// and stream raw output, including partial failures, before launching anything
// else. Measurements themselves use only the descendant-free fixture below.
async function runBuild(args, cwd, env, prefix, abortSignal) {
    for (const suffix of ["stdout.log", "stderr.log", "events.jsonl"])
        writeFileSync(`${prefix}.${suffix}`, "");
    const started = performance.now();
    const record = {
        code: null,
        signal: null,
        timeout: false,
        cleanupVerified: false,
        events: [],
    };
    const event = (kind, fields = {}) => {
        const entry = { ms: performance.now() - started, kind, ...fields };
        record.events.push(entry);
        appendFileSync(`${prefix}.events.jsonl`, JSON.stringify(entry) + "\n");
        writeFileSync(
            `${prefix}.result.json`,
            JSON.stringify(record, null, 2) + "\n",
        );
    };
    return await new Promise((done) => {
        let child,
            timer,
            cleanupTimer,
            closed = false,
            finished = false,
            treeKillStarted = false,
            treeKillVerified = true;
        const groupAbsent = () => {
            if (!child?.pid) return true;
            if (process.platform === "win32") return absent(child.pid);
            return absent(-child.pid);
        };
        const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            clearTimeout(cleanupTimer);
            abortSignal.removeEventListener("abort", abort);
            record.cleanupVerified =
                closed && groupAbsent() && treeKillVerified;
            record.totalMs = performance.now() - started;
            event("cleanup", { verified: record.cleanupVerified });
            done(record);
        };
        const kill = () => {
            if (closed || treeKillStarted) return;
            treeKillStarted = true;
            cleanupTimer = setTimeout(() => {
                // Do not hold the driver open on an unverified tree. Remaining
                // work is withheld and the hosted runner must finish cleanup.
                child?.stdin?.destroy();
                child?.stdout?.destroy();
                child?.stderr?.destroy();
                child?.unref();
                finish();
            }, DEADLINES.cleanup);
            event("kill-tree", { pid: child?.pid });
            if (child?.pid) {
                if (process.platform === "win32") {
                    // Kill descendants BEFORE killing their parent. The fixed
                    // system utility receives only our numeric child PID.
                    const killed = spawnSync(
                        "C:\\Windows\\System32\\taskkill.exe",
                        ["/PID", String(child.pid), "/T", "/F"],
                        {
                            env,
                            encoding: "utf8",
                            timeout: DEADLINES.cleanup,
                            windowsHide: true,
                        },
                    );
                    treeKillVerified = killed.status === 0 && !killed.error;
                    event("taskkill", {
                        code: killed.status,
                        signal: killed.signal,
                        error: killed.error && errorInfo(killed.error),
                        stdout: killed.stdout,
                        stderr: killed.stderr,
                    });
                    if (!treeKillVerified) {
                        try {
                            child.kill("SIGKILL");
                        } catch (error) {
                            event("kill-error", errorInfo(error));
                        }
                    }
                } else {
                    try {
                        process.kill(-child.pid, "SIGKILL");
                    } catch (error) {
                        if (error.code !== "ESRCH") {
                            treeKillVerified = false;
                            event("kill-error", errorInfo(error));
                        }
                    }
                }
            }
        };
        const abort = () => {
            record.error = { code: "INTERRUPTED" };
            kill();
        };
        try {
            child = spawn(process.execPath, args, {
                cwd,
                env,
                windowsHide: true,
                detached: process.platform !== "win32",
                stdio: ["ignore", "pipe", "pipe"],
            });
            event("spawn", { pid: child.pid });
        } catch (error) {
            record.error = errorInfo(error);
            closed = true;
            finish();
            return;
        }
        child.stdout.on("data", (chunk) =>
            appendFileSync(`${prefix}.stdout.log`, chunk),
        );
        child.stderr.on("data", (chunk) =>
            appendFileSync(`${prefix}.stderr.log`, chunk),
        );
        child.on("error", (error) => {
            record.error = errorInfo(error);
            event("error", record.error);
        });
        child.on("exit", (code, signal) => {
            record.code = code;
            record.signal = signal;
            event("exit", { code, signal });
        });
        child.on("close", (code, signal) => {
            closed = true;
            record.code = code;
            record.signal = signal;
            event("close", { code, signal });
            finish();
        });
        timer = setTimeout(() => {
            record.timeout = true;
            kill();
        }, 180000);
        abortSignal.addEventListener("abort", abort, { once: true });
        if (abortSignal.aborted) abort();
    });
}

export async function runCondition(
    item,
    command,
    args,
    env,
    directory,
    cwd,
    persist,
    abortSignal,
    { spawnChild = spawn, pidAbsent = absent } = {},
) {
    mkdirSync(directory, { recursive: true });
    for (const name of ["stdout.log", "stderr.log", "events.jsonl"])
        writeFileSync(join(directory, name), "");
    let started = 0;
    const row = {
        ...item,
        readyMs: null,
        probeMs: null,
        visibility: visibilityFor(item.engine),
        parentAggregateVerified:
            aggregateEnvironment(env).descriptorErrors === 0,
        aggregateVerified: item.engine === "node" ? false : null,
        readyVerified: false,
        probeVerified: false,
        cleanupVerified: false,
        code: null,
        signal: null,
        timeout: null,
        errors: [],
        expected: aggregateEnvironment(env),
        events: [],
    };
    let child,
        closed = false,
        finished = false,
        probeStarted,
        buffer = "",
        readyCount = 0,
        probeCount = 0;
    let readinessTimer, probeTimer, hardTimer, cleanupTimer;
    const elapsed = () => performance.now() - started;
    const event = (kind, fields = {}) => {
        const value = { ms: elapsed(), kind, ...fields };
        row.events.push(value);
        appendFileSync(
            join(directory, "events.jsonl"),
            JSON.stringify(value) + "\n",
        );
    };
    const save = () => {
        writeFileSync(
            join(directory, "result.json"),
            JSON.stringify(row, null, 2) + "\n",
        );
        persist(row);
    };
    const fail = (reason) => {
        row.errors.push(reason);
        event("failure", { reason });
    };
    const kill = (classification) => {
        row.timeout ??= classification;
        if (closed) return;
        event("kill", { classification });
        if (child?.pid) {
            try {
                child.kill("SIGKILL");
            } catch (error) {
                fail(errorInfo(error));
            }
        }
        save();
    };
    save();
    // Exclude evidence setup/checkpoint I/O from measured process startup.
    started = performance.now();
    return await new Promise((done) => {
        const abort = () => kill("interrupted");
        const finish = () => {
            if (finished) return;
            finished = true;
            for (const timer of [
                readinessTimer,
                probeTimer,
                hardTimer,
                cleanupTimer,
            ])
                clearTimeout(timer);
            abortSignal.removeEventListener("abort", abort);
            row.totalMs = elapsed();
            if (row.totalMs > DEADLINES.hard) row.timeout ??= "hard";
            row.cleanupVerified = closed && pidAbsent(child?.pid);
            if (buffer !== "") fail("unterminated fixture protocol output");
            event("cleanup", {
                verified: row.cleanupVerified,
                closed,
                pidAbsent: pidAbsent(child?.pid),
            });
            save();
            done(row);
        };
        try {
            child = spawnChild(command, args, {
                cwd,
                env,
                windowsHide: true,
                stdio: ["pipe", "pipe", "pipe"],
            });
            row.pid = child.pid;
            event("spawn", { pid: child.pid });
        } catch (error) {
            fail(errorInfo(error));
            closed = true;
            finish();
            return;
        }
        readinessTimer = setTimeout(
            () => kill("readiness"),
            DEADLINES.readiness,
        );
        hardTimer = setTimeout(() => kill("hard"), DEADLINES.hard);
        cleanupTimer = setTimeout(() => {
            kill("cleanup-unverified");
            fail("close/reap missing after hard deadline + cleanup grace");
            child.stdin.destroy();
            child.stdout.destroy();
            child.stderr.destroy();
            child.unref();
            finish();
        }, DEADLINES.hard + DEADLINES.cleanup);
        abortSignal.addEventListener("abort", abort, { once: true });
        if (abortSignal.aborted) abort();
        child.on("error", (error) => {
            fail(errorInfo(error));
            save();
        });
        child.stdin.on("error", (error) => {
            fail({ stream: "stdin", ...errorInfo(error) });
            save();
        });
        for (const stream of ["stdout", "stderr"])
            child[stream].on("error", (error) => {
                fail({ stream, ...errorInfo(error) });
                save();
            });
        child.on("exit", (code, signal) => {
            row.code = code;
            row.signal = signal;
            event("exit", { code, signal });
            save();
        });
        child.on("close", (code, signal) => {
            closed = true;
            row.code = code;
            row.signal = signal;
            event("close", { code, signal });
            finish();
        });
        child.stderr.on("data", (chunk) => {
            appendFileSync(join(directory, "stderr.log"), chunk);
            fail("unexpected fixture stderr");
            save();
        });
        child.stdout.on("data", (chunk) => {
            appendFileSync(join(directory, "stdout.log"), chunk);
            buffer += chunk.toString("utf8");
            if (buffer.length > 65536) {
                fail("unexpected excessive protocol output");
                buffer = "";
                kill("protocol-output-limit");
                return;
            }
            let newline;
            while ((newline = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, newline).replace(/\r$/, "");
                buffer = buffer.slice(newline + 1);
                try {
                    if (line.startsWith("NONA_ENV_READY ")) {
                        readyCount++;
                        if (readyCount !== 1) {
                            fail("duplicate ready");
                            continue;
                        }
                        row.actual = JSON.parse(
                            line.slice("NONA_ENV_READY ".length),
                        );
                        row.readyMs = elapsed();
                        clearTimeout(readinessTimer);
                        if (row.readyMs > DEADLINES.readiness)
                            row.timeout ??= "readiness";
                        Object.assign(
                            row,
                            verifyReady(row.actual, env, item.engine),
                        );
                        if (!row.readyVerified)
                            fail(
                                "child sentinel/Node aggregate verification failed",
                            );
                        event("ready", {
                            actual: row.actual,
                            aggregateVerified: row.aggregateVerified,
                            visibility: row.visibility,
                            readyVerified: row.readyVerified,
                        });
                        probeStarted = performance.now();
                        probeTimer = setTimeout(
                            () => kill("post-readiness-probe"),
                            DEADLINES.probe,
                        );
                        child.stdin.end(JSON.stringify(env));
                    } else if (line.startsWith("NONA_ENV_PROBE ")) {
                        probeCount++;
                        row.probe = JSON.parse(
                            line.slice("NONA_ENV_PROBE ".length),
                        );
                        row.probeMs =
                            probeStarted === undefined
                                ? null
                                : performance.now() - probeStarted;
                        row.probeVerified =
                            readyCount === 1 &&
                            probeCount === 1 &&
                            row.probe.mismatches === 0 &&
                            row.probe.semantics === true;
                        if (!row.probeVerified)
                            fail(
                                "post-readiness semantic/allowlist verification failed",
                            );
                        event("probe", { probe: row.probe });
                        // Keep probe timer until exit/close: a printed probe with
                        // a stuck process must still fail within the probe bound.
                    } else if (line !== "")
                        fail("unexpected fixture protocol output");
                } catch (error) {
                    fail({ protocol: true, ...errorInfo(error) });
                }
                save();
            }
        });
    });
}

async function main(args) {
    // Refuse local execution before creating output, importing a compiler or
    // launching any child. Only pure exported helpers are locally testable.
    const identity = hostedIdentity();
    const config = readConfig(args);
    assert.notEqual(config.baselineRoot, config.candidateRoot);
    assert.ok(
        !existsSync(config.out),
        "use a fresh output directory; never overwrite evidence",
    );
    mkdirSync(config.out, { recursive: true });
    const plan = schedule(config.pairs),
        rows = [];
    const report = {
        schema: 2,
        identity,
        config,
        deadlines: DEADLINES,
        plan,
        rows,
        builds: [],
        errors: [],
        complete: false,
        historicalComparison:
            "Minimal synthetic fixture; counts/volume only. No historical environment reconstruction or #602 acceptance.",
        nativeExecuted: false,
        measurementBoundary: {
            parent: "Constructed synthetic map: exact keys/values, UTF-16 units and data descriptors; not proof of native visibility",
            node: "Sanitized child: full count/UTF-16/descriptors before READY, exact full key/value shape after READY",
            native: "Real process.env: seven fixed sentinel names before READY, selected values and alias/get/has/descriptor/set/delete/reinsert after READY; aggregate/count/units/full shape UNMEASURED",
            pureVM: "Existing process-environment-source tests independently enumerate actual initializer/Proxy semantics; not native visibility evidence",
        },
    };
    const checkpoint = () =>
        writeFileSync(
            join(config.out, "report.json"),
            JSON.stringify(report, null, 2) + "\n",
        );
    checkpoint();
    const controller = new AbortController();
    const interruption = (signal) => {
        report.interrupted = signal;
        report.errors.push(`interrupted: ${signal}`);
        checkpoint();
        controller.abort();
    };
    // Graceful cancellation kills/reaps the active child before ending; abrupt
    // runner termination can only leave the last checkpoint as partial evidence.
    process.on("exit", (code) => {
        report.harnessExitCode = code;
        checkpoint();
    });
    process.on("SIGINT", () => interruption("SIGINT"));
    process.on("SIGTERM", () => interruption("SIGTERM"));
    try {
        report.admission = admitEvent({
            name: process.env.GITHUB_EVENT_NAME,
            repository: process.env.GITHUB_REPOSITORY,
            owner: process.env.GITHUB_REPOSITORY_OWNER,
            ref: process.env.GITHUB_REF,
            sha: process.env.GITHUB_SHA,
            actor: process.env.GITHUB_ACTOR,
            event: JSON.parse(
                readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
            ),
            candidate: config.candidate,
            candidateBlob: config.candidateBlob,
            pairs: String(config.pairs),
        });
        report.harnessSha256 = sha256(readFileSync(new URL(import.meta.url)));
        report.checkouts = {
            baseline: verifyCheckout(
                config.baselineRoot,
                config.baseline,
                config.baselineBlob,
            ),
            candidate: verifyCheckout(
                config.candidateRoot,
                config.candidate,
                config.candidateBlob,
            ),
        };
        assert.equal(
            report.harnessSha256,
            sha256(
                readFileSync(
                    join(
                        config.candidateRoot,
                        "scripts/process-environment-startup.mjs",
                    ),
                ),
            ),
            "harness must come from the pinned candidate",
        );
        assert.equal(
            report.checkouts.baseline.lockSha256,
            report.checkouts.candidate.lockSha256,
            "dependencies must be identical",
        );
        assert.equal(
            report.checkouts.baseline.buildScriptSha256,
            report.checkouts.candidate.buildScriptSha256,
            "build configuration changed",
        );
        const original = readFileSync(
            join(config.baselineRoot, "src/lib/runtime/process.js"),
            "utf8",
        );
        const candidate = readFileSync(
            join(config.candidateRoot, "src/lib/runtime/process.js"),
            "utf8",
        );
        // Outside the initializer (the subject of #638), source must be exact.
        const withoutInitializer = (text) => {
            const start = text.indexOf("    var env={};"),
                end = text.indexOf("    function exitStatus(", start);
            assert.ok(start >= 0 && end > start);
            return text.slice(0, start) + text.slice(end);
        };
        assert.equal(
            withoutInitializer(original),
            withoutInitializer(candidate),
            "unrelated process source changed",
        );
        const fixture = join(config.out, "fixture.mjs"),
            text = fixtureSource();
        writeFileSync(fixture, text);
        report.fixtureSha256 = sha256(text);
        const nodeFixture = join(config.out, "node-control.mjs");
        const nodeText = fixtureSource({ full: true });
        writeFileSync(nodeFixture, nodeText);
        report.nodeFixtureSha256 = sha256(nodeText);
        const temporary = join(config.out, "safe-temp");
        mkdirSync(temporary);
        if (process.platform === "win32")
            assert.ok(
                existsSync("C:\\Windows\\System32\\cmd.exe"),
                "literal Windows OS allowlist unavailable",
            );
        const environments = {};
        for (const shape of shapes)
            for (const gc of modes)
                environments[`${shape}-${gc}`] = makeEnvironment({
                    platform: process.platform,
                    shape,
                    gc,
                    temporary,
                });
        report.fixtures = Object.fromEntries(
            Object.entries(environments).map(([key, env]) => [
                key,
                aggregateEnvironment(env),
            ]),
        );
        const driver = join(config.out, "build-image.mjs");
        const driverText = `import {readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
const [compiler,fixture,image,options]=process.argv.slice(2);
const {compile}=await import(pathToFileURL(compiler).href);
const result=compile(readFileSync(fixture,"utf8"),JSON.parse(options));
if(!result.image)throw new Error("No native image");
writeFileSync(image,result.image);
`;
        writeFileSync(driver, driverText);
        report.buildDriverSha256 = sha256(driverText);
        const images = {};
        let buildsClean = true;
        for (const engine of ["baseline", "candidate"]) {
            if (controller.signal.aborted) break;
            const root = config[`${engine}Root`];
            const compiler = join(root, "dist/src/compiler.js");
            // Build the compiler from the verified checkout here, rather than
            // trusting arbitrary/stale dist supplied to the comparison.
            const compilerBuild = await runBuild(
                [join(root, "scripts/build.mjs")],
                root,
                environments["base-off"],
                join(config.out, `${engine}.compiler`),
                controller.signal,
            );
            const compilation = {
                id: `${engine}-compiler`,
                ...compilerBuild,
            };
            report.builds.push(compilation);
            checkpoint();
            if (!buildDecision(compilation).continue) {
                buildsClean = false;
                break;
            }
            if (!buildDecision(compilation).usable || !existsSync(compiler))
                continue;
            try {
                report.checkouts[engine].compilerManifest = treeManifest(
                    root,
                    "dist/src",
                );
                report.checkouts[engine].builtSourceManifest = treeManifest(
                    root,
                    "src",
                );
                report.checkouts[engine].compilerEntrySha256 = sha256(
                    readFileSync(compiler),
                );
            } catch (error) {
                report.errors.push({
                    engine,
                    ...errorInfo(error),
                    message: "compiler/source manifest unavailable",
                });
                continue;
            }
            for (const gc of modes) {
                if (controller.signal.aborted) break;
                const image = join(
                    config.out,
                    `${engine}-${gc}${process.platform === "win32" ? ".exe" : ""}`,
                );
                const options = buildOptions(fixture, process.platform, gc);
                // Same explicit build environment as measurements, including
                // NONA_GC_STRESS=on so gcStress:true cannot be disabled by CI.
                const id = `${engine}-${gc}`;
                const build = await runBuild(
                    [driver, compiler, fixture, image, JSON.stringify(options)],
                    root,
                    environments[`base-${gc}`],
                    join(config.out, `${id}.build`),
                    controller.signal,
                );
                const record = {
                    id,
                    options,
                    ...build,
                };
                report.builds.push(record);
                checkpoint();
                if (!buildDecision(record).continue) {
                    buildsClean = false;
                    break;
                }
                if (
                    buildDecision(record).usable &&
                    existsSync(image) &&
                    statSync(image).size > 0
                ) {
                    chmodSync(image, 0o755);
                    record.imageSha256 = sha256(readFileSync(image));
                    record.bytes = statSync(image).size;
                    images[id] = image;
                }
                checkpoint();
            }
            if (!buildsClean) break;
        }
        if (!buildsClean)
            report.errors.push(
                "Unverified build tree cleanup; remaining builds and measurement plan withheld",
            );
        // POSIX may legitimately eliminate the Windows branch and produce
        // identical old/new images. GC on/off images must always differ.
        report.imageComparisons = modes.map((gc) => ({
            gc,
            identical:
                images[`baseline-${gc}`] && images[`candidate-${gc}`]
                    ? sha256(readFileSync(images[`baseline-${gc}`])) ===
                      sha256(readFileSync(images[`candidate-${gc}`]))
                    : null,
        }));
        if (
            process.platform === "win32" &&
            report.imageComparisons.some((item) => item.identical === true)
        )
            report.errors.push(
                "Windows old/new images unexpectedly identical; investigate build provenance",
            );
        for (const engine of ["baseline", "candidate"])
            if (
                images[`${engine}-off`] &&
                images[`${engine}-on`] &&
                sha256(readFileSync(images[`${engine}-off`])) ===
                    sha256(readFileSync(images[`${engine}-on`]))
            )
                report.errors.push(
                    `${engine} GC images unexpectedly identical; investigate build configuration`,
                );
        checkpoint();
        for (const item of plan) {
            if (controller.signal.aborted || !buildsClean) break;
            const image = images[`${item.engine}-${item.gc}`];
            if (item.engine !== "node" && !image) {
                rows.push({
                    ...item,
                    readyMs: null,
                    probeMs: null,
                    aggregateVerified: false,
                    probeVerified: false,
                    cleanupVerified: true,
                    code: null,
                    signal: null,
                    timeout: null,
                    errors: ["image unavailable; build failed"],
                    notStarted: true,
                });
                checkpoint();
                continue;
            }
            const pinnedImage =
                item.engine === "node"
                    ? identity.nodeSha256
                    : report.builds.find(
                          (build) => build.id === `${item.engine}-${item.gc}`,
                      ).imageSha256;
            if (
                sha256(
                    readFileSync(
                        item.engine === "node" ? process.execPath : image,
                    ),
                ) !== pinnedImage ||
                sha256(readFileSync(fixture)) !== report.fixtureSha256 ||
                sha256(readFileSync(nodeFixture)) !== report.nodeFixtureSha256
            ) {
                report.errors.push(
                    `measurement image/fixture changed before ${item.id}; remaining plan is incomplete`,
                );
                break;
            }
            if (item.engine !== "node") report.nativeExecuted = true;
            await runCondition(
                item,
                item.engine === "node" ? process.execPath : image,
                item.engine === "node" ? [nodeFixture] : [],
                environments[`${item.shape}-${item.gc}`],
                join(config.out, item.id),
                config.out,
                (row) => {
                    const index = rows.findIndex((old) => old.id === row.id);
                    if (index === -1) rows.push(row);
                    else rows[index] = row;
                    checkpoint();
                },
                controller.signal,
            );
            if (rows.at(-1).cleanupVerified !== true) {
                report.errors.push(
                    "Unverified child cleanup; stop launching further children. Remaining plan is retained as incomplete.",
                );
                break;
            }
        }
        report.decision = decide(rows, plan);
        report.complete = report.decision.complete;
    } catch (error) {
        report.errors.push({ ...errorInfo(error), message: error.message });
    } finally {
        report.decision ??= decide(rows, plan);
        report.pass = report.errors.length === 0 && report.decision.pass;
        checkpoint();
        process.exitCode = report.pass ? 0 : 1;
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    if (process.argv[2] === "--admit") {
        const identity = hostedIdentity();
        const event = JSON.parse(
            readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
        );
        const candidate = process.env.NONA_CANDIDATE;
        assert.match(candidate, /^[0-9a-f]{40}$/);
        const candidateBlob = git(process.cwd(), [
            "rev-parse",
            `${candidate}:src/lib/runtime/process.js`,
        ]);
        const admission = admitEvent({
            name: process.env.GITHUB_EVENT_NAME,
            repository: process.env.GITHUB_REPOSITORY,
            owner: process.env.GITHUB_REPOSITORY_OWNER,
            ref: process.env.GITHUB_REF,
            sha: process.env.GITHUB_SHA,
            actor: process.env.GITHUB_ACTOR,
            event,
            candidate,
            candidateBlob,
            pairs: process.env.NONA_PAIRS,
        });
        const checkout = verifyCheckout(
            process.cwd(),
            candidate,
            candidateBlob,
        );
        writeFileSync(
            resolve(process.argv[3]),
            JSON.stringify({ admission, identity, checkout }, null, 2) + "\n",
        );
        appendFileSync(
            process.env.GITHUB_OUTPUT,
            `candidate=${candidate}\nblob=${candidateBlob}\npairs=${admission.pairs}\n`,
        );
    } else {
        await main(process.argv.slice(2));
    }
}
