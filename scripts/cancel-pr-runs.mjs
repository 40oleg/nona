// Cancels the unfinished workflow runs of a pull request that was closed or
// merged (#373), so they stop holding runners. Called by
// .github/workflows/cancel-closed.yml.
//
//   node scripts/cancel-pr-runs.mjs
//
// Environment:
//   GITHUB_TOKEN        token of the run (actions: write)
//   GITHUB_REPOSITORY   owner/name
//   GITHUB_RUN_ID       this run, never cancelled
//   PR_NUMBER           the pull request
//   HEAD_REF, HEAD_SHA  its head branch and commit
// Only runs started by `pull_request` events of that pull request are
// cancelled: never runs of main or of other branches.
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const unfinished = new Set([
    "queued",
    "in_progress",
    "waiting",
    "requested",
    "pending",
]);

/** The runs to cancel, from plain data: [{id, status, event, head_branch, head_sha, pull_requests: [{number}]}]. */
export function runsToCancel(runs, { number, headRef, headSha, selfId }) {
    return runs.filter(
        (run) =>
            String(run.id) !== String(selfId) &&
            unfinished.has(run.status) &&
            run.event === "pull_request" &&
            run.head_branch === headRef &&
            run.head_branch !== "main" &&
            (run.head_sha === headSha ||
                (run.pull_requests ?? []).some(
                    (pr) => String(pr.number) === String(number),
                )),
    );
}

async function api(path, init = {}) {
    const response = await fetch("https://api.github.com" + path, {
        ...init,
        headers: {
            accept: "application/vnd.github+json",
            authorization: "Bearer " + process.env.GITHUB_TOKEN,
            "x-github-api-version": "2022-11-28",
        },
    });
    if (!response.ok && response.status !== 409)
        throw new Error(path + ": HTTP " + response.status);
    return response.status === 202 || response.status === 409
        ? null
        : response.json();
}

async function main() {
    const repo = process.env.GITHUB_REPOSITORY,
        headRef = process.env.HEAD_REF;
    const runs = [];
    for (let page = 1; page <= 10; page++) {
        const data = await api(
            `/repos/${repo}/actions/runs?event=pull_request&branch=${encodeURIComponent(headRef)}&per_page=100&page=${page}`,
        );
        runs.push(...data.workflow_runs);
        if (data.workflow_runs.length < 100) break;
    }
    const targets = runsToCancel(runs, {
        number: process.env.PR_NUMBER,
        headRef,
        headSha: process.env.HEAD_SHA,
        selfId: process.env.GITHUB_RUN_ID,
    });
    const lines = [];
    for (const run of targets) {
        // 409: the run finished in the meantime.
        await api(`/repos/${repo}/actions/runs/${run.id}/cancel`, {
            method: "POST",
        });
        lines.push(`- ${run.name} (${run.status}): ${run.html_url}`);
    }
    const summary =
        `Cancelled ${targets.length} unfinished run(s) of #${process.env.PR_NUMBER}.\n` +
        lines.join("\n") +
        "\n";
    process.stdout.write(summary);
    if (process.env.GITHUB_STEP_SUMMARY)
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
    main().catch((error) => {
        // A failure here must not mark the pull request red: it only frees runners.
        console.log("::warning::" + error.message);
    });
