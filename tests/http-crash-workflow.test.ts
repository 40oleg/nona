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

test("diagnostic launch admits draft PR630 only with same-repository full-ci authorization", () => {
    assert.match(
        workflow,
        /pull_request:\s*\n\s+types: \[opened, reopened, synchronize, ready_for_review\]/,
    );
    assert.match(workflow, /workflow_dispatch:/);
    assert.doesNotMatch(workflow, /pull_request_target/);
    const condition = workflow.match(
        /windows:\s*\n\s+if: >-\s*\n([\s\S]*?)\n\s+#/,
    );
    assert.ok(condition, "the diagnostic job needs an explicit launch guard");
    const expression = condition[1]!.replace(/\$\{\{|\}\}/g, "").trim();
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
        const source = expression.replace(
            "labels.*.name",
            "labels.map(label => label.name)",
        );
        return runInNewContext(source, {
            github: { repository, event_name: eventName, event: value },
            contains: (values: string[], item: string) => values.includes(item),
        });
    }
    assert.equal(allowed(), true, "draft630 must launch");
    assert.equal(allowed({ ...event, number: 631 }), false);
    assert.equal(allowed(event, "fork/nona"), false);
    assert.equal(allowed(event, "40oleg/nona", "push"), false);
    assert.equal(allowed(event, "40oleg/nona", "workflow_dispatch"), true);
    for (const side of ["base", "head"] as const) {
        const fork = structuredClone(event);
        fork.pull_request[side].repo.full_name = "fork/nona";
        assert.equal(allowed(fork), false);
    }
    const unlabeled = structuredClone(event);
    unlabeled.pull_request.labels = [];
    assert.equal(allowed(unlabeled), false);
});

test("diagnostic shared concurrency belongs only to the guarded Windows job", () => {
    // Unrelated PRs must not enter the group and replace an admitted pending run.
    assert.equal(
        /^concurrency\s*:/m.test(workflow),
        false,
        "workflow-level concurrency would let skipped PRs replace authorized pending campaigns",
    );
    const windowsJob = workflow.match(
        /^    windows:\r?\n((?: {8}[^\r\n]*(?:\r?\n|$)|\r?\n)*)/m,
    )?.[1];
    assert.ok(windowsJob, "the Windows job must own campaign serialization");
    assert.match(windowsJob, /^ {8}if: >-\r?\n/m);
    assert.match(
        windowsJob,
        /^ {8}concurrency:\r?\n {12}group: http-crash-diagnostic\r?\n {12}cancel-in-progress: false(?:\r?\n|$)/m,
    );
    assert.equal(
        workflow.match(/^\s*group: http-crash-diagnostic\s*$/gm)?.length,
        1,
        "only the admitted Windows job may use the shared campaign group",
    );
});

test("diagnostic checkout uses exact head and full dependency history without persisted credentials", () => {
    assert.match(workflow, /repository: 40oleg\/nona/);
    assert.match(
        workflow,
        /ref: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/,
    );
    assert.match(workflow, /fetch-depth: 0/);
    assert.match(workflow, /persist-credentials: false/);
    assert.match(workflow, /run: node scripts\/http-crash-provenance.mjs/);
    assert.match(workflow, /group: http-crash-diagnostic\s*\n/);
    assert.match(workflow, /cancel-in-progress: false/);
    assert.match(workflow, /timeout-minutes: 35/);
    assert.match(workflow, /contents: read/);
    assert.doesNotMatch(workflow, /\bwrite\b|continue-on-error/);
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
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_SHA: "1111111111111111111111111111111111111111",
        GITHUB_WORKFLOW_SHA: "2222222222222222222222222222222222222222",
        GITHUB_WORKFLOW_REF:
            "40oleg/nona/.github/workflows/http-crash-diagnostic.yml@refs/pull/630/merge",
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
    const result = record(env, event);
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
    const wrong = structuredClone(event);
    wrong.pull_request.head.sha = env.GITHUB_SHA;
    assert.ok(
        record(env, wrong).errors.includes(
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
        record({ ...manual, GITHUB_SHA: env.GITHUB_SHA }, {}).verified,
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
    assert.equal(record(env, fork).verified, false);
    assert.equal(
        provenance.launchAllowed(env, { ...event, number: 631 }),
        false,
    );
    const unlabeled = structuredClone(event);
    unlabeled.pull_request.labels = [];
    assert.equal(provenance.launchAllowed(env, unlabeled), false);
});
