import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

// Source-only: never import the compiler or the native diagnostic test module.
const workflow = readFileSync(
    ".github/workflows/http-crash-diagnostic.yml",
    "utf8",
);

test("legacy diagnostic launches only by explicit same-repository manual dispatch", () => {
    assert.doesNotMatch(workflow, /^\s*pull_request:/m);
    assert.match(workflow, /workflow_dispatch:/);
    assert.doesNotMatch(workflow, /pull_request_target/);
    const expressions = ["windows", "aggregate"].map((job) => {
        const condition = workflow.match(
            new RegExp(
                `    ${job}:\\s*\\n\\s+if: >-\\s*\\n([\\s\\S]*?)\\n        (?:#|needs:)`,
            ),
        );
        assert.ok(condition, `${job} needs an explicit launch guard`);
        return condition[1]!.replace(/\$\{\{|\}\}/g, "").trim();
    });
    const event = {
        number: 630,
        pull_request: {
            draft: true,
            base: { repo: { full_name: "40oleg/nona" } },
            head: { repo: { full_name: "40oleg/nona" } },
            labels: [{ name: "full-ci" }],
        },
    };
    function allowed(
        value = event,
        repository = "40oleg/nona",
        eventName = "pull_request",
    ) {
        // GitHub's label projection is the only non-JavaScript syntax here.
        const results = expressions.map((expression) =>
            runInNewContext(
                expression.replace(
                    "labels.*.name",
                    "labels.map(label => label.name)",
                ),
                {
                    github: { repository, event_name: eventName, event: value },
                    contains: (values: string[], item: string) =>
                        values.includes(item),
                    always: () => true,
                },
            ),
        );
        assert.equal(
            results[0],
            results[1],
            "aggregate must preserve the same authorization even after failed jobs",
        );
        return results[0];
    }
    assert.equal(
        allowed(),
        false,
        "PR630 with full-ci must not launch legacy57",
    );
    assert.equal(allowed({ ...event, number: 631 }), false);
    assert.equal(allowed(event, "fork/nona"), false);
    assert.equal(allowed(event, "40oleg/nona", "push"), false);
    assert.equal(allowed(event, "40oleg/nona", "workflow_dispatch"), true);
    assert.equal(allowed(event, "fork/nona", "workflow_dispatch"), false);
    for (const side of ["base", "head"] as const) {
        const fork = structuredClone(event);
        fork.pull_request[side].repo.full_name = "fork/nona";
        assert.equal(allowed(fork), false);
    }
    const unlabeled = structuredClone(event);
    unlabeled.pull_request.labels = [];
    assert.equal(allowed(unlabeled), false);
});

test("diagnostic serial matrix retains every shard without shared pending-slot cancellation", () => {
    assert.doesNotMatch(workflow, /^\s*concurrency\s*:/m);
    const windowsJob = workflow.match(
        /^    windows:\r?\n((?: {8}[^\r\n]*(?:\r?\n|$)|\r?\n)*)/m,
    )?.[1];
    assert.ok(windowsJob);
    assert.match(windowsJob, /^ {8}if: >-\r?\n/m);
    assert.match(
        windowsJob,
        /strategy:\s+fail-fast: false\s+max-parallel: 1\s+matrix:\s+shard: \[1, 2, 3, 4, 5, 6, 7, 8, 9, 10\]/,
    );
    assert.equal(
        workflow.match(
            /run: node scripts\/http-crash.mjs work\/http-crash --shard \$\{\{ matrix.shard \}\}/g,
        )?.length,
        1,
        "only the explicit fixed shard path runs in CI",
    );
    assert.match(
        workflow,
        /HTTP_CRASH_JOB_INDEX: \$\{\{ strategy.job-index \}\}/,
    );
    assert.match(workflow, /aggregate:\s+if: >-\s+always\(\) &&/);
    assert.match(workflow, /needs: windows/);
    assert.match(
        workflow,
        /HTTP_CRASH_MATRIX_RESULT: \$\{\{ needs.windows.result \}\}/,
    );
    assert.match(
        workflow,
        /http-crash-proof-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}-shard-/,
    );
    assert.match(workflow, /if-no-files-found: error/);
    assert.match(workflow, /merge-multiple: false/);
    assert.match(workflow, /actions: read/);
});

test("diagnostic checkout uses exact head and full dependency history without persisted credentials", () => {
    assert.match(workflow, /repository: 40oleg\/nona/);
    assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
    assert.deepEqual(
        [...workflow.matchAll(/^\s+ref: (.+)$/gm)].map((match) => match[1]),
        ["${{ github.sha }}", "${{ github.sha }}"],
        "both jobs must inspect the selected manual event commit",
    );
    assert.doesNotMatch(workflow, /github.event.pull_request.head.sha/);
    assert.match(workflow, /fetch-depth: 0/);
    assert.match(workflow, /persist-credentials: false/);
    assert.match(workflow, /run: node scripts\/http-crash-provenance.mjs/);
    assert.doesNotMatch(workflow, /concurrency:|continue-on-error/);
    assert.match(workflow, /timeout-minutes: 35/);
    assert.match(workflow, /contents: read/);
    assert.doesNotMatch(
        workflow,
        /contents: write|actions: write|continue-on-error/,
    );
    assert.match(workflow, /RUNNER_ENVIRONMENT -ne 'github-hosted'/);
    assert.match(workflow, /RUNNER_OS -ne 'Windows'/);
    assert.match(workflow, /runs-on: windows-2025/);
    assert.ok(
        workflow.indexOf("run: node scripts/http-crash-provenance.mjs") <
            workflow.indexOf("run: npm ci"),
        "source verification must precede installation, build and trials",
    );
    assert.equal(
        workflow.match(/run: node scripts\/http-crash\.mjs/g)?.length,
        1,
        "one campaign per run",
    );
    for (const command of ["collect", "cleanup"]) {
        assert.match(
            workflow,
            new RegExp(
                `if: always\\(\\)\\s+run: pwsh -File scripts/http-crash-windows.ps1 ${command}`,
            ),
        );
    }
    assert.match(
        workflow,
        /uses: actions\/upload-artifact@v4\s+if: always\(\)/,
    );
    assert.match(workflow, /path: work\/http-crash\//);
    assert.match(workflow, /http-crash-windows.ps1 collect -Startup602/);
});

test("provenance retains distinct workflow/event/source identities and rejects missing ancestry or mismatched heads", async () => {
    const provenance = await import(
        pathToFileURL(resolve("scripts/http-crash-provenance.mjs")).href
    );
    // Exercise the validation boundary with Git facts, independent of shallow
    // checkout depth in ordinary CI. The launch job reads these facts from Git.
    const head = "3333333333333333333333333333333333333333";
    const tree = "4444444444444444444444444444444444444444";
    const dependency = {
        commit: "47193961f3bf9b69c0177d5522de3db1069447df",
        isAncestor: true,
        exitCode: 0,
        error: null,
    };
    const record = (env: object, event: object) =>
        provenance.provenanceRecord(env, event, { head, tree }, dependency);
    const env = {
        GITHUB_REPOSITORY: "40oleg/nona",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_SHA: head,
        GITHUB_WORKFLOW_SHA: "2222222222222222222222222222222222222222",
        GITHUB_WORKFLOW_REF:
            "40oleg/nona/.github/workflows/http-crash-diagnostic.yml@refs/heads/issue-602-rebased",
        RUNNER_ENVIRONMENT: "github-hosted",
        RUNNER_OS: "Windows",
    };
    const event = {
        number: 630,
        action: "synchronize",
        pull_request: {
            draft: true,
            head: { sha: head, repo: { full_name: "40oleg/nona" } },
            base: { repo: { full_name: "40oleg/nona" } },
            labels: [{ name: "full-ci" }],
        },
    };
    const result = record(env, {});
    assert.equal(result.verified, true);
    assert.deepEqual(result.checkout, { expectedHead: head, head, tree });
    assert.equal(result.event.sha, env.GITHUB_SHA);
    assert.equal(result.workflow.sha, env.GITHUB_WORKFLOW_SHA);
    assert.equal(
        result.dependency.commit,
        "47193961f3bf9b69c0177d5522de3db1069447df",
    );
    assert.equal(result.dependency.isAncestor, true);
    assert.equal(result.accepted601Controls.windowsArtifactId, "13094764449");
    assert.match(result.accepted601Controls.linuxJob, /124870326121$/);
    assert.ok(
        record({ ...env, GITHUB_SHA: "1".repeat(40) }, {}).errors.includes(
            "Checkout differs from exact event head",
        ),
    );
    const manual = {
        ...env,
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_SHA: head,
    };
    assert.equal(record(manual, {}).verified, true);
    assert.equal(
        record({ ...manual, GITHUB_SHA: "1".repeat(40) }, {}).verified,
        false,
    );
    assert.equal(
        record({ ...env, RUNNER_ENVIRONMENT: "self-hosted" }, event).verified,
        false,
    );
    assert.equal(record({ ...env, RUNNER_OS: "Linux" }, event).verified, false);
    for (const field of ["GITHUB_SHA", "GITHUB_WORKFLOW_SHA"] as const) {
        assert.equal(record({ ...env, [field]: "" }, event).verified, false);
    }
    for (const exitCode of [1, 128]) {
        const absent = provenance.provenanceRecord(
            env,
            event,
            { head, tree },
            { ...dependency, isAncestor: false, exitCode },
        );
        assert.equal(absent.verified, false);
        assert.ok(
            absent.errors.includes(
                "Pinned #601 dependency is not a verified ancestor",
            ),
        );
    }
    assert.throws(
        () => provenance.dependencyStatus("untrusted-branch; echo unsafe"),
        /exact head SHA/,
    );
    const fork = structuredClone(event);
    fork.pull_request.head.repo.full_name = "fork/nona";
    const prEnv = { ...env, GITHUB_EVENT_NAME: "pull_request" };
    const rejectedPr = record(prEnv, event);
    assert.equal(rejectedPr.verified, false);
    assert.equal(rejectedPr.event.pr, 630);
    assert.equal(rejectedPr.event.draft, true);
    assert.equal(rejectedPr.event.action, "synchronize");
    assert.equal(provenance.launchAllowed(prEnv, event), false);
    assert.equal(
        record({ ...env, GITHUB_REPOSITORY: "fork/nona" }, {}).verified,
        false,
    );
    assert.equal(record(prEnv, fork).verified, false);
    assert.equal(
        provenance.launchAllowed(prEnv, { ...event, number: 631 }),
        false,
    );
    const unlabeled = structuredClone(event);
    unlabeled.pull_request.labels = [];
    assert.equal(provenance.launchAllowed(prEnv, unlabeled), false);
});
