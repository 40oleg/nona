import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    closeSync,
    copyFileSync,
    mkdirSync,
    openSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { pins } from "./native-gc-diagnosis-cases.mjs";

assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
const [mode, group] = process.argv.slice(2);
assert.ok(Object.hasOwn(pins, group));
const output = resolve("work/native-gc-provenance");
mkdirSync(output, { recursive: true });
const json = (name, value) =>
    writeFileSync(join(output, name), JSON.stringify(value, null, 2) + "\n");
const jobs = {
    assert: [41870436370, 126715703580],
    regexp: [41873101270, 126728303402],
    http: [41886396573, 126798789063],
};
if (mode === "prepare") {
    const pin = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
    assert.equal(pin.status, 0);
    assert.equal(pin.stdout.trim(), pins[group]);
    // Retain the complete pinned tracked tree, including the original helpers,
    // runner workflow, suite selection and fixture dependencies, before overlay.
    const fd = openSync(join(output, "pinned-tree.tar"), "w");
    try {
        assert.equal(
            spawnSync("git", ["archive", "--format=tar", "HEAD"], {
                stdio: ["ignore", fd, "inherit"],
            }).status,
            0,
        );
    } finally {
        closeSync(fd);
    }
    for (const path of [
        "tests/helpers/execution.ts",
        "tests/helpers/native.ts",
        "tests/helpers/host.ts",
        "tests/helpers/oracle.ts",
        "scripts/native-gc-diagnosis.mjs",
        "scripts/native-gc-diagnosis-cases.mjs",
        "scripts/native-gc-sample.mjs",
        "scripts/native-execution-evidence.test.mjs",
    ])
        copyFileSync(resolve("../diagnostic", path), resolve(path));
    json("context.json", {
        source: pins[group],
        diagnosticCommit: process.env.DIAGNOSTIC_COMMIT,
        node: process.version,
        runner: process.env.RUNNER_NAME,
        imageOS: process.env.ImageOS,
        imageVersion: process.env.ImageVersion,
        job: jobs[group],
        run: process.env.GITHUB_RUN_ID,
        started: new Date().toISOString(),
    });
    const [run, job] = jobs[group];
    for (const [name, endpoint] of [
        ["original-job.json", `jobs/${job}`],
        ["original-job.log", `jobs/${job}/logs`],
        ["original-run.json", `runs/${run}`],
    ]) {
        const result = spawnSync(
            "gh",
            ["api", `repos/40oleg/nona/actions/${endpoint}`],
            { maxBuffer: 64 * 1024 * 1024 },
        );
        writeFileSync(join(output, name), result.stdout ?? "");
        writeFileSync(join(output, name + ".stderr"), result.stderr ?? "");
        assert.equal(
            result.status,
            0,
            "Original evidence unavailable: " + endpoint,
        );
        assert.ok(result.stdout.length > 0);
    }
    const jobInfo = JSON.parse(
        readFileSync(join(output, "original-job.json"), "utf8"),
    );
    assert.equal(jobInfo.head_sha, pins[group]);
} else if (mode === "build") {
    const started = performance.now();
    const result = spawnSync(
        process.platform === "win32" ? "npm.cmd" : "npm",
        ["run", "build"],
        {
            shell: process.platform === "win32",
            maxBuffer: 16 * 1024 * 1024,
            timeout: 600000,
            windowsHide: true,
        },
    );
    writeFileSync(join(output, "build.stdout"), result.stdout ?? "");
    writeFileSync(join(output, "build.stderr"), result.stderr ?? "");
    json("build.json", {
        elapsedMs: performance.now() - started,
        status: result.status,
        signal: result.signal,
        error: result.error && {
            ...result.error,
            message: result.error.message,
            stack: result.error.stack,
        },
    });
    assert.equal(result.status, 0, String(result.stderr));
} else throw new Error("Unknown setup mode");
