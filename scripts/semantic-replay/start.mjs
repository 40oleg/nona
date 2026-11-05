// Runs before dependency installation/build, retaining startup blockers too.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { saveReport, recordProcess } from "./report.mjs";
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
saveReport(resolve(process.argv[2], "startup.json"), {
    schema: 1,
    stage: "before install/build",
    nativeAcceptance: "pending",
    node: process.version,
    source: recordProcess("git", ["rev-parse", "HEAD"], process.cwd(), 10000),
    runner: Object.fromEntries(
        [
            "RUNNER_ENVIRONMENT",
            "RUNNER_OS",
            "RUNNER_ARCH",
            "RUNNER_NAME",
            "GITHUB_SHA",
            "GITHUB_RUN_ID",
            "GITHUB_RUN_ATTEMPT",
            "ImageOS",
            "ImageVersion",
        ].map((k) => [k, process.env[k] ?? null]),
    ),
});
