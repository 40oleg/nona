// Retained #632 probe. Source controls are safe locally; native execution is
// restricted to GitHub-hosted runners. This does not replace events.test.ts.
//
// Local: node scripts/diagnose-abort-timeout.mjs
// Hosted, after npm ci and npm run build (run serially; retain all artifacts):
//   node scripts/diagnose-abort-timeout.mjs --native
//   node scripts/diagnose-abort-timeout.mjs --native --case=original --trace
//   node scripts/diagnose-abort-timeout.mjs --native --case=original --scalar
//   node scripts/diagnose-abort-timeout.mjs --native --no-stress
// Run each on main 23c5c90d, head 9fd6dc4e, merge dbeb6c23 and the candidate.
// Add --case=original for the historical four-revision MANUAL comparison.
// PR CI judges the explicit future/all-due contracts instead; historical failures
// remain failures and are never reclassified using either new contract.
// Copy both diagnostic scripts into old hosted checkouts; do not transplant selector code.
// Upload work/abort-timeout even on failure. Two passing attempts do not resolve
// #632; retain original failed evidence and PR624's release hold.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { availableParallelism, release, setPriority, constants } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import {
    instrumentScalar,
    parseScalar,
    scalarFormat,
} from "./abort-timeout-scalar.mjs";
import {
    timeoutImports,
    timeoutFuture,
    timeoutAllDue,
    timeoutExpected,
    timeoutAllDueExpected,
} from "../tests/helpers/abort-timeout-fixture.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
assert(
    args.every(
        (arg) =>
            ["--native", "--trace", "--scalar", "--no-stress"].includes(arg) ||
            /^--attempts=[1-8]$/u.test(arg) ||
            /^--case=(?:original|future-unref|all-due|future-referenced)$/u.test(
                arg,
            ),
    ),
);
const native = args.includes("--native");
const traced = args.includes("--trace");
const scalar = args.includes("--scalar");
const caseArgs = args.filter((arg) => arg.startsWith("--case="));
assert.ok(caseArgs.length <= 1);
const contract = caseArgs[0]?.slice("--case=".length) ?? "future-unref";
const negative = contract === "future-referenced";
assert.ok(
    !(scalar || traced) || contract === "original",
    "Historical observers describe only the pinned original fixture",
);
assert.ok(!(traced && scalar), "Separate scalar and verbose native images");
const attemptArgs = args.filter((arg) => arg.startsWith("--attempts="));
assert.ok(attemptArgs.length <= 1);
assert.ok(
    native || attemptArgs.length === 0,
    "Attempt campaigns are hosted-only",
);
const attempts = attemptArgs.length ? Number(attemptArgs[0].split("=")[1]) : 2;
const stress = !args.includes("--no-stress");
if (native) {
    assert.equal(process.env.GITHUB_ACTIONS, "true");
    assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
    assert.equal(process.versions.node, "26.9.0");
    if (stress) assert.notEqual(process.env.NONA_GC_STRESS, "off");
}
setPriority(0, constants.priority.PRIORITY_BELOW_NORMAL);
const mode = native
    ? `${stress ? "stress" : "normal"}-${traced ? "trace" : scalar ? "scalar" : "plain"}`
    : "source";
const outputRoot = join(root, "work", "abort-timeout");
mkdirSync(outputRoot, { recursive: true });
const output = mkdtempSync(join(outputRoot, contract + "-" + mode + "-"));
const read = (path) =>
    readFileSync(join(root, path), "utf8").replace(/\r\n?/g, "\n");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const save = (name, value) => writeFileSync(join(output, name), value);
const json = (name, value) => save(name, JSON.stringify(value, null, 2) + "\n");
save(
    "events.fixture.test.ts",
    readFileSync(join(root, "tests/events.test.ts")),
);
save("probe.mjs", readFileSync(fileURLToPath(import.meta.url)));
save(
    "abort-timeout-scalar.mjs",
    readFileSync(new URL("./abort-timeout-scalar.mjs", import.meta.url)),
);
const original = readFileSync(
    join(root, "tests/fixtures/abort-timeout/original.mjs"),
);
assert.equal(
    hash(original),
    "912309ce70d7e31624f54c19f233fb3a8f91fcce0db9a3578d34c9e30256e27f",
    "Original fixture bytes changed",
);
save("original.mjs", original);
save(
    "abort-timeout-fixture.ts",
    readFileSync(join(root, "tests/helpers/abort-timeout-fixture.ts")),
);
const body =
    contract === "original"
        ? original.toString().slice(original.indexOf(10) + 1)
        : contract === "all-due"
          ? timeoutAllDue
          : timeoutFuture;
const source =
    contract === "original" ? original.toString() : timeoutImports + body;
const expected =
    contract === "all-due" || negative
        ? timeoutAllDueExpected
        : timeoutExpected;
save("main.mjs", source);
const timers = read("src/lib/runtime/timers.js");
const events = read("src/lib/runtime/events.js");
save("timers.original.js", timers);
save("events.original.js", events);

// Fixed-width scalar records avoid allocating an object or printing during a
// callback. Traces still perturb GC: always retain uninstrumented attempts too.
function instrument(text) {
    function replace(before, after) {
        assert.equal(
            text.split(before).length,
            2,
            `Unique trace anchor: ${before}`,
        );
        text = text.replace(before, after);
    }
    replace(
        "    var heap = [],",
        `    var trace = new Array(512), traceIndex = 0;
    function record(kind, timer, phase, pending) {
        if (traceIndex + 12 > trace.length) return;
        trace[traceIndex++] = kind;
        trace[traceIndex++] = hostNow();
        trace[traceIndex++] = timer ? timer.id : 0;
        trace[traceIndex++] = timer ? timer.when : 0;
        trace[traceIndex++] = timer ? timer.referenced : false;
        trace[traceIndex++] = referenced;
        trace[traceIndex++] = count;
        trace[traceIndex++] = heap.length ? heap[0].id : 0;
        trace[traceIndex++] = heap.length ? heap[0].when : 0;
        trace[traceIndex++] = phase;
        trace[traceIndex++] = pending;
        trace[traceIndex++] = networkAlive();
    }
    __nonaRegexpVm.dumpTimeoutTrace = function () {
        trace.length = traceIndex;
        console.log('NONA_TIMEOUT_TRACE ' + JSON.stringify(trace));
    };
    var heap = [],`,
    );
    replace(
        "        push(timer);\n        return id;",
        "        push(timer);\n        record(1, timer, 0, false);\n        return id;",
    );
    replace(
        "    function run(timer) {",
        "    function run(timer) {\n        record(2, timer, 0, false);",
    );
    replace(
        "    function quit() {\n        fullDrain();",
        "    function quit() {\n        record(5, null, 0, false);\n        fullDrain();\n        record(6, null, 0, false);",
    );
    replace(
        "            var phaseTime = hostNow();",
        "            var phaseTime = hostNow();\n            record(3, timer, phaseTime, pendingIO);",
    );
    replace(
        "                run(timer);\n                drain();",
        "                run(timer);\n                drain();\n                record(4, timer, phaseTime, pendingIO);",
    );
    return (
        text +
        `
__nonaPromiseDrainJobs = (function (loop) {
    return function () {
        loop();
        __nonaRegexpVm.dumpTimeoutTrace();
    };
})(__nonaPromiseDrainJobs);
`
    );
}
const instrumented = instrument(timers);
const scalarTimers = instrumentScalar(timers);
// Diagnostic generated-source mutation only: tracked production sources and the
// staged fixture remain unchanged. Only the 1000 ms timeout becomes referenced.
const referencedTimers = timers.replace(
    "referenced: !unreferenced,",
    "referenced: !unreferenced || d === 1000,",
);
assert.notEqual(referencedTimers, timers, "Unique referenced mutation anchor");
const effectiveTimers = traced
    ? instrumented
    : scalar
      ? scalarTimers
      : negative
        ? referencedTimers
        : timers;
save("timers.effective.js", effectiveTimers);
save("timers.traced.js", instrumented);
save("timers.scalar.js", scalarTimers);
json("scalar-format.json", scalarFormat);
json("trace-format.json", {
    width: 12,
    fields: [
        "event",
        "now",
        "id",
        "deadline",
        "timerReferenced",
        "references",
        "activeCount",
        "heapId",
        "heapDeadline",
        "phaseSnapshot",
        "pendingIOAtPhaseEntry",
        "networkAlive",
    ],
    events: {
        1: "schedule",
        2: "callback-entry-before-removal",
        3: "phase-entry",
        4: "callback-and-microtasks-complete",
        5: "quit-before-full-drain",
        6: "quit-after-full-drain",
    },
});
const revision = spawnSync("git", ["rev-parse", "HEAD", "HEAD^{tree}"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
});
assert.equal(revision.status, 0, revision.stderr);
const metadata = {
    revision: revision.stdout.trim().split(/\r?\n/),
    command: [process.execPath, ...process.argv.slice(1)],
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    osRelease: release(),
    availableParallelism: availableParallelism(),
    environment: Object.fromEntries(
        [
            "GITHUB_RUN_ID",
            "GITHUB_RUN_ATTEMPT",
            "GITHUB_SHA",
            "RUNNER_NAME",
            "RUNNER_ENVIRONMENT",
            "RUNNER_OS",
            "RUNNER_ARCH",
            "ImageOS",
            "ImageVersion",
            "NONA_GC_STRESS",
            "NONA_TEST_CONCURRENCY",
        ].map((key) => [key, process.env[key] ?? null]),
    ),
    native,
    mode,
    traced,
    scalar,
    attempts,
    requestedGcStress: stress,
    contract,
    expected,
    originalContract:
        "historical-two-line-assertion; phase of failed plain attempt UNOBSERVED",
    negativeControl: negative
        ? "only delay1000 referenced in diagnostic generated timers; Node held by one supplemental ref"
        : null,
    setupPauseMs: contract === "all-due" ? 1100 : 0,
    linking:
        "compileModuleToIR -> generate (default fullRuntimeLink) -> linkHost",
    hashes: {},
    sourceHashNormalization: "LF, matching generated runtime template literals",
};
for (const path of [
    "tests/events.test.ts",
    "tests/helpers/host.ts",
    "tests/helpers/program.ts",
    "src/backend/x64/codegen.ts",
    "src/frontend/link-usage.ts",
    "src/lib/runtime/timers.js",
    "src/lib/runtime/events.js",
    "src/runtime/host.ts",
    "src/backend/linux/shims.ts",
    "src/backend/darwin/arm64.ts",
    "scripts/run-suite.mjs",
    ".github/workflows/native-platforms.yml",
])
    metadata.hashes[path] = hash(read(path));
metadata.hashes.fixture = hash(source);
metadata.hashes.originalFixtureBytes = hash(original);
metadata.hashes.phaseFixture = hash(
    readFileSync(join(root, "tests/helpers/abort-timeout-fixture.ts")),
);
metadata.hashes.probe = hash(readFileSync(fileURLToPath(import.meta.url)));
metadata.hashes.scalarTooling = hash(
    readFileSync(new URL("./abort-timeout-scalar.mjs", import.meta.url)),
);
metadata.hashes.effectiveTimers = hash(effectiveTimers);
json("metadata.json", metadata);

function execute(name, executable, argv, timeout, required = true) {
    const result = spawnSync(executable, argv, {
        cwd: output,
        encoding: "utf8",
        timeout,
        windowsHide: true,
    });
    save(name + ".stdout", result.stdout ?? "");
    save(name + ".stderr", result.stderr ?? "");
    json(name + ".result.json", {
        command: [executable, ...argv],
        status: result.status,
        signal: result.signal,
        error: result.error?.message ?? null,
    });
    if (required) {
        assert.equal(result.error, undefined);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stderr, "");
    }
    return result;
}
// Actual Node negative control keeps the retained late signal reachable and
// permits its actual AbortSignal callback to fire; no synthetic output line.
const nodeNegative = negative
    ? `const createTimeout=AbortSignal.timeout;AbortSignal.timeout=function(delay){const signal=createTimeout(delay);if(delay===1000)setTimeout(()=>{if(!signal.aborted)throw new Error('late signal lost')},delay);return signal;};\n`
    : "";
save("oracle.mjs", nodeNegative + source);
const oracle = execute(
    "node-" + contract,
    process.execPath,
    [join(output, "oracle.mjs")],
    10000,
).stdout;
assert.equal(oracle, expected);
if (!native && contract === "original") {
    // Supplementary control: no timing assertions in the original are changed.
    save(
        "all-due.mjs",
        source +
            "\nAtomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1100);\n",
    );
    const allDueOracle = execute(
        "node-all-due",
        process.execPath,
        [join(output, "all-due.mjs")],
        10000,
    ).stdout;
    assert.equal(
        allDueOracle,
        "timeout TimeoutError\nlive true false\nunexpected\n",
    );
    for (const [name, atEntry, inCallback] of [
        ["normal", 0, 0],
        ["all-due", 1100, 0],
        ["deadline-passed-in-callback", 0, 1100],
    ]) {
        let clock = 0;
        const lines = [];
        runInNewContext(
            "var __nonaRegexpVm={enqueueJob:function(fn){fn()}};var __nonaPromiseDrainJobs=function(){};" +
                instrumented +
                events +
                body +
                ";advance();__nonaPromiseDrainJobs();",
            {
                __nonaHostNow: () => clock,
                __nonaHostWait: (delay) => {
                    clock += delay;
                },
                advance: () => {
                    clock += atEntry;
                },
                console: {
                    log: (...values) => {
                        const line = values.join(" ");
                        lines.push(line);
                        if (line.startsWith("live ")) clock += inCallback;
                    },
                },
            },
        );
        save("source-" + name + ".stdout", lines.join("\n") + "\n");
        const actual =
            lines
                .filter((line) => !line.startsWith("NONA_TIMEOUT_TRACE "))
                .join("\n") + "\n";
        assert.equal(
            actual,
            atEntry
                ? "timeout TimeoutError\nlive true false\nunexpected\n"
                : "timeout TimeoutError\nlive true false\n",
        );
    }
} else if (native) {
    // Change only the generated prelude, before importing any compiler modules.
    // Restore it even after a failed compile/run; never edit the tracked runtime.
    const generatedPath = join(root, "dist/src/lib/sources.generated.js");
    const generated = readFileSync(generatedPath, "utf8");
    metadata.hashes.generated = hash(generated);
    save("sources.generated.js", generated);
    const pattern = /^export const runtimeTimers = ("(?:[^"\\]|\\.)*");$/mu;
    assert.equal(JSON.parse(generated.match(pattern)?.[1] ?? "null"), timers);
    try {
        if (traced || scalar || negative)
            writeFileSync(
                generatedPath,
                generated.replace(
                    pattern,
                    () =>
                        "export const runtimeTimers = " +
                        JSON.stringify(effectiveTimers) +
                        ";",
                ),
            );
        const effectiveGenerated = readFileSync(generatedPath, "utf8");
        save("sources.effective.generated.js", effectiveGenerated);
        metadata.hashes.effectiveGenerated = hash(effectiveGenerated);
        json("metadata.json", metadata);
        const { compileModuleToIR } = await import(
            pathToFileURL(join(root, "dist/src/compiler.js"))
        );
        const { generate } = await import(
            pathToFileURL(join(root, "dist/src/backend/x64/codegen.js"))
        );
        const { linkHost } = await import(
            pathToFileURL(join(root, "dist/tests/helpers/program.js"))
        );
        const program = generate(
            compileModuleToIR(source, join(output, "main.mjs")),
            { gcStress: stress },
        );
        const image = linkHost(program);
        const executable = resolve(
            output,
            process.platform === "win32" ? "image.exe" : "image",
        );
        writeFileSync(executable, image);
        chmodSync(executable, 0o755);
        metadata.hashes.image = hash(image);
        json("metadata.json", metadata);
        const matches = [];
        const outcomes = [];
        const report = () =>
            json("comparison.json", {
                requestedAttempts: attempts,
                completedAttempts: outcomes.length,
                matchesOracle: matches,
                outcomes,
                contract,
                expected,
                hold: "PR624 remains held; PR633 stays draft Part of #632 until hosted causal and failing-versus-fixed proof is reviewed",
            });
        report();
        // Bounded independent process attempts; keep every mismatch, no retries.
        for (let attempt = 1; attempt <= attempts; attempt++) {
            const result = execute(
                "native-" + attempt,
                executable,
                [],
                180000,
                false,
            );
            const stdout = result.stdout ?? "";
            let actual = stdout;
            let scalarError = null;
            let findings = [];
            if (scalar) {
                try {
                    const parsed = parseScalar(stdout);
                    actual = parsed.output;
                    findings = parsed.findings;
                    json("native-" + attempt + ".scalar.json", parsed);
                } catch (error) {
                    scalarError = error.message;
                }
            } else if (traced) {
                actual = stdout
                    .split("\n")
                    .filter((line) => !line.startsWith("NONA_TIMEOUT_TRACE "))
                    .join("\n");
            }
            const matchesOracle =
                result.status === 0 &&
                !result.signal &&
                !result.error &&
                result.stderr === "" &&
                actual === oracle &&
                scalarError === null &&
                findings.length === 0;
            matches.push(matchesOracle);
            outcomes.push({
                attempt,
                status: result.status,
                signal: result.signal,
                error: result.error?.message ?? null,
                scalarError,
                findings,
                matchesOracle,
            });
            report();
        }
        if (matches.some((match) => !match)) process.exitCode = 1;
    } catch (error) {
        json("probe-error.json", {
            name: error.name,
            message: error.message,
            stack: error.stack,
        });
        throw error;
    } finally {
        if (traced || scalar || negative)
            writeFileSync(generatedPath, generated);
    }
}
console.log("Retained diagnostics:", output);
