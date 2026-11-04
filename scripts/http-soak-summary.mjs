// Always-run workflow reporting must not replace the primary build/startup error.
import { appendFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { machineIdentity, writeFailureReceipt } from "./http-soak-evidence.mjs";

export function appendSummary(reportDir, summaryPath, status) {
    let markdown;
    try {
        markdown = readFileSync(join(reportDir, "http-soak.md"), "utf8");
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        let failure = new Error(
            `No HTTP soak report was produced; workflow status: ${status}. See the original build/startup step logs.`,
        );
        let existing = {};
        try {
            existing = JSON.parse(
                readFileSync(join(reportDir, "http-soak.json"), "utf8"),
            );
        } catch (jsonError) {
            if (jsonError.code !== "ENOENT") throw jsonError;
        }
        if (existing.failure)
            failure = Object.assign(
                new Error(existing.failure.message),
                existing.failure,
            );
        writeFailureReceipt(
            reportDir,
            {
                phase: "workflow before report",
                workflowStatus: status,
                commit: process.env.GITHUB_SHA ?? null,
                machine: machineIdentity(),
                samples: [],
                ...existing,
                reportingFailure:
                    "Markdown report missing; retained JSON evidence",
            },
            failure,
        );
        markdown = readFileSync(join(reportDir, "http-soak.md"), "utf8");
    }
    appendFileSync(summaryPath, markdown + "\n");
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    try {
        appendSummary(
            process.argv[2] ?? "soak-report",
            process.env.GITHUB_STEP_SUMMARY,
            process.env.SOAK_JOB_STATUS ?? "unknown",
        );
    } catch (error) {
        console.error(
            "Could not append soak summary (primary step status is preserved):",
            error,
        );
    }
}
