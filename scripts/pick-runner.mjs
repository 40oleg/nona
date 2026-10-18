// Chooses where a Windows CI job runs: the GitHub-hosted `windows-latest`
// runners, or the owner's self-hosted Windows runner when hosted Windows jobs
// are already waiting in the queue and the self-hosted runner is online and
// idle (docs/ci-runners.md).
//
//   node scripts/pick-runner.mjs
//
// Writes `runner=<JSON runs-on value>` to $GITHUB_OUTPUT and a line to the job
// summary. Environment:
//   GITHUB_TOKEN          token of the run (actions: read) to count queued jobs
//   RUNNER_STATUS_TOKEN   token that may read the repository's runners
//                         (Administration: read); without it the job stays hosted
//   TRUSTED               "true" for pushes, manual runs and pull requests from
//                         branches of this repository; code from forks never
//                         runs on the self-hosted runner
//   HOSTED_LABEL          hosted label (default windows-latest)
//   LOCAL_LABELS          labels of the self-hosted runner (default self-hosted,Windows,X64)
//   MIN_QUEUED            hosted jobs that must be waiting first (default 1)
// Any API failure keeps the job on the hosted runners.
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const hasLabels = (labels, wanted) =>
    wanted.every((label) =>
        labels.some((have) => have.toLowerCase() === label.toLowerCase()),
    );

/**
 * The routing decision from plain data.
 * runners: [{status, busy, labels: [name]}] of the repository (null when unknown);
 * queuedJobs: [{labels: [name]}] of other runs, waiting for a runner.
 */
export function decide({
    trusted,
    runners,
    queuedJobs,
    hostedLabel = "windows-latest",
    localLabels = ["self-hosted", "Windows", "X64"],
    minQueued = 1,
}) {
    const hosted = { runner: hostedLabel };
    if (!trusted)
        return { ...hosted, reason: "fork or untrusted event: hosted only" };
    if (!runners)
        return { ...hosted, reason: "self-hosted runner status unknown" };
    const local = runners.filter((runner) =>
        hasLabels(runner.labels, localLabels),
    );
    const idle = local.filter(
        (runner) => runner.status === "online" && !runner.busy,
    );
    if (!idle.length)
        return {
            ...hosted,
            reason: local.length
                ? "self-hosted runner offline or busy"
                : "no self-hosted runner with these labels",
        };
    const waitingLocal = queuedJobs.filter((job) =>
        hasLabels(job.labels, ["self-hosted"]),
    ).length;
    if (waitingLocal >= idle.length)
        return {
            ...hosted,
            reason: `${waitingLocal} job(s) already wait for the self-hosted runner`,
        };
    const waitingHosted = queuedJobs.filter((job) =>
        hasLabels(job.labels, [hostedLabel]),
    ).length;
    if (waitingHosted < minQueued)
        return {
            ...hosted,
            reason: `hosted runners free (${waitingHosted} ${hostedLabel} job(s) queued)`,
        };
    return {
        runner: localLabels,
        reason: `${waitingHosted} ${hostedLabel} job(s) queued, self-hosted runner idle`,
    };
}

async function api(path, token) {
    const response = await fetch(`https://api.github.com/${path}`, {
        headers: {
            authorization: `Bearer ${token}`,
            accept: "application/vnd.github+json",
            "x-github-api-version": "2022-11-28",
        },
    });
    if (!response.ok) throw Error(`${path}: HTTP ${response.status}`);
    return response.json();
}

/** Jobs of other runs of the repository that wait for a runner. */
async function queuedJobs(repository, token, currentRun) {
    const jobs = [];
    for (const status of ["queued", "in_progress"]) {
        const { workflow_runs: runs } = await api(
            `repos/${repository}/actions/runs?status=${status}&per_page=100`,
            token,
        );
        for (const run of runs) {
            if (String(run.id) === currentRun) continue;
            const { jobs: runJobs } = await api(
                `repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
                token,
            );
            for (const job of runJobs)
                if (job.status === "queued") jobs.push({ labels: job.labels });
        }
    }
    return jobs;
}

async function main() {
    const env = process.env;
    const repository = env.GITHUB_REPOSITORY;
    const options = {
        trusted: env.TRUSTED === "true",
        hostedLabel: env.HOSTED_LABEL || "windows-latest",
        localLabels: (env.LOCAL_LABELS || "self-hosted,Windows,X64")
            .split(",")
            .map((label) => label.trim())
            .filter(Boolean),
        minQueued: Number(env.MIN_QUEUED || 1),
        runners: null,
        queuedJobs: [],
    };
    let decision;
    try {
        if (options.trusted && env.RUNNER_STATUS_TOKEN) {
            const { runners } = await api(
                `repos/${repository}/actions/runners?per_page=100`,
                env.RUNNER_STATUS_TOKEN,
            );
            options.runners = runners.map((runner) => ({
                status: runner.status,
                busy: runner.busy,
                labels: runner.labels.map((label) => label.name),
            }));
            options.queuedJobs = await queuedJobs(
                repository,
                env.GITHUB_TOKEN,
                env.GITHUB_RUN_ID,
            );
        }
        decision = decide(options);
    } catch (error) {
        decision = {
            runner: options.hostedLabel,
            reason: `GitHub API failed (${error.message}): hosted`,
        };
    }
    const value = JSON.stringify(decision.runner);
    console.log(`runs-on ${value}: ${decision.reason}`);
    if (env.GITHUB_OUTPUT)
        appendFileSync(env.GITHUB_OUTPUT, `runner=${value}\n`);
    if (env.GITHUB_STEP_SUMMARY)
        appendFileSync(
            env.GITHUB_STEP_SUMMARY,
            `Windows job runs on \`${value}\`: ${decision.reason}\n`,
        );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
