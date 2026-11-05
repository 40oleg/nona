// Hosted-only controls for the exact queued-context lifetime witness (#616).
// No retries or deadline overrides: a diagnostic failure is evidence to retain.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
    closeSync,
    mkdirSync,
    openSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { release, version } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { selectedExactlyOnce } from "./http-agent-retained-evidence.mjs";

const gcMode = process.argv[2];
assert.ok(gcMode === "off" || gcMode === "on", "Expected GC mode off or on");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
assert.ok(process.platform === "win32" || process.platform === "linux");
assert.equal(process.version, "v26.9.0");

// The test runner, native process and Node oracle inherit only OS essentials.
// In particular, no GitHub/action credentials or NODE_OPTIONS reach them.
const testEnv = {};
const allowed = new Set([
    "PATH",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "HOME",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "LANG",
    "LC_ALL",
    "TZ",
]);
for (const [key, value] of Object.entries(process.env))
    if (allowed.has(key.toUpperCase())) testEnv[key] = value;
testEnv.NONA_GC_STRESS = gcMode;

const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    env: testEnv,
    windowsHide: true,
}).trim();
assert.equal(
    sourceHead,
    process.env.CONTROL_SOURCE_HEAD,
    "Run the exact PR source head",
);
const testName =
    "node:http Agent: retains callback contexts and the deferred cancellation error until capacity is released";
const args = [
    "--test",
    "--test-concurrency=1",
    "--test-reporter=tap",
    "--test-name-pattern=^" + testName + "$",
    "dist/tests/http-agent.test.js",
];
const directory = "work/http-agent-retained";
mkdirSync(directory, { recursive: true });
const evidencePath = join(directory, gcMode + ".json");
const tapPath = join(directory, gcMode + ".tap");
const stderrPath = join(directory, gcMode + ".stderr.log");
const evidence = {
    sourceHead,
    runtime: process.version,
    executable: process.execPath,
    platform: process.platform,
    arch: process.arch,
    osRelease: release(),
    osVersion: version(),
    runnerOS: process.env.RUNNER_OS,
    runnerImage: process.env.ImageOS,
    runnerImageVersion: process.env.ImageVersion,
    gcMode,
    testName,
    args,
    startedAt: new Date().toISOString(),
};
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence));
const stdout = openSync(tapPath, "w"),
    stderr = openSync(stderrPath, "w");
const started = performance.now();
let result;
try {
    result = spawnSync(process.execPath, args, {
        env: testEnv,
        stdio: ["ignore", stdout, stderr],
        windowsHide: true,
    });
} finally {
    closeSync(stdout);
    closeSync(stderr);
}
Object.assign(evidence, {
    elapsedMs: Math.round(performance.now() - started),
    finishedAt: new Date().toISOString(),
    status: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
});
const tap = readFileSync(tapPath, "utf8");
// Require the exact witness to pass, rather than merely register as a test.
evidence.selectedExactlyOnce = selectedExactlyOnce(tap, testName);
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
process.stdout.write(tap);
process.stderr.write(readFileSync(stderrPath));
console.log(JSON.stringify(evidence));
process.exitCode =
    result.error || !evidence.selectedExactlyOnce ? 1 : (result.status ?? 1);
