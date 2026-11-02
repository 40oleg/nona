// Read-only Git provenance; no branch names, credentials or shell evaluation.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const dependencyPin = "47193961f3bf9b69c0177d5522de3db1069447df";
const repository = "40oleg/nona";
const shaPattern = /^[0-9a-f]{40}$/;

// Accepted focused controls are references, not proof of historical crash repair
// or final #622/full-CI acceptance. Linux's separate proof has no invented hash.
export const accepted601Controls = {
    coordinatorClaim:
        "https://github.com/40oleg/nona/issues/602#issuecomment-6562051439",
    acceptanceRecord:
        "https://github.com/40oleg/nona/pull/622#issuecomment-6562034633",
    run: "https://github.com/40oleg/nona/actions/runs/41314077453",
    windowsJob:
        "https://github.com/40oleg/nona/actions/runs/41314077453/job/124870325981",
    linuxJob:
        "https://github.com/40oleg/nona/actions/runs/41314077453/job/124870326121",
    windowsArtifactId: "13094764449",
    windowsArtifactSha256:
        "a495324ee09750ac5389372fcbf75579df8ff5888d7f08aafaf59fb38a9bb87c",
};

export function launchAllowed(env, event) {
    if (env.GITHUB_REPOSITORY !== repository) return false;
    if (env.GITHUB_EVENT_NAME === "workflow_dispatch") return true;
    const pr = event.pull_request;
    return (
        env.GITHUB_EVENT_NAME === "pull_request" &&
        event.number === 630 &&
        pr?.base?.repo?.full_name === repository &&
        pr?.head?.repo?.full_name === repository &&
        pr?.labels?.some((label) => label.name === "full-ci") === true
    );
}

function git(env, ...args) {
    return execFileSync("git", args, { encoding: "utf8", env }).trim();
}

export function dependencyStatus(head, env) {
    if (!shaPattern.test(head)) throw new Error("Expected exact head SHA");
    const result = spawnSync(
        "git",
        ["merge-base", "--is-ancestor", dependencyPin, head],
        { encoding: "utf8", env },
    );
    return {
        commit: dependencyPin,
        isAncestor: result.status === 0,
        exitCode: result.status,
        error: result.error?.message ?? (result.stderr.trim() || null),
    };
}

export function collectProvenance(env, event, childEnv) {
    const head = git(childEnv, "rev-parse", "HEAD");
    return provenanceRecord(
        env,
        event,
        { head, tree: git(childEnv, "rev-parse", "HEAD^{tree}") },
        dependencyStatus(head, childEnv),
    );
}

export function provenanceRecord(env, event, checkout, dependency) {
    const { head, tree } = checkout;
    const expectedHead =
        env.GITHUB_EVENT_NAME === "pull_request"
            ? event.pull_request?.head?.sha
            : env.GITHUB_SHA;
    const errors = [];
    if (!launchAllowed(env, event))
        errors.push("Unauthorized diagnostic event");
    if (
        env.RUNNER_ENVIRONMENT !== "github-hosted" ||
        env.RUNNER_OS !== "Windows"
    )
        errors.push("GitHub-hosted Windows required");
    if (!shaPattern.test(expectedHead ?? "") || head !== expectedHead)
        errors.push("Checkout differs from exact event head");
    if (!shaPattern.test(env.GITHUB_SHA ?? ""))
        errors.push("Missing exact event SHA");
    if (!shaPattern.test(env.GITHUB_WORKFLOW_SHA ?? ""))
        errors.push("Missing exact workflow SHA");
    if (!dependency.isAncestor)
        errors.push("Pinned #601 dependency is not a verified ancestor");
    return {
        repository: env.GITHUB_REPOSITORY,
        event: {
            name: env.GITHUB_EVENT_NAME,
            action: event.action ?? null,
            sha: env.GITHUB_SHA,
            ref: env.GITHUB_REF,
            pr: event.number ?? null,
            draft: event.pull_request?.draft ?? null,
        },
        workflow: {
            sha: env.GITHUB_WORKFLOW_SHA,
            ref: env.GITHUB_WORKFLOW_REF,
            runId: env.GITHUB_RUN_ID,
            runAttempt: env.GITHUB_RUN_ATTEMPT,
        },
        runner: {
            name: env.RUNNER_NAME,
            environment: env.RUNNER_ENVIRONMENT,
            os: env.RUNNER_OS,
        },
        checkout: { expectedHead, head, tree },
        dependency,
        accepted601Controls,
        errors,
        verified: errors.length === 0,
    };
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    const event = JSON.parse(
        readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
    );
    const provenance = collectProvenance(process.env, event);
    mkdirSync("work/http-crash", { recursive: true });
    // Retain rejected provenance too; the workflow uploads this path always.
    writeFileSync(
        "work/http-crash/provenance.json",
        JSON.stringify(provenance, null, 2) + "\n",
    );
    if (!provenance.verified) throw new Error(provenance.errors.join("; "));
    console.log(
        `Verified head ${provenance.checkout.head}, tree ${provenance.checkout.tree}, #601 ancestor ${dependencyPin}`,
    );
}
