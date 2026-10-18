import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// When a pull request runs the Test262 directory jobs (scripts/ci-changes.mjs, #371).
type Decide = (input: {
    event: string;
    fullCi: boolean;
    files: string[] | null;
}) => { run: boolean; reason: string };
const decide = async () =>
    (
        (await import(
            pathToFileURL(resolve("scripts/ci-changes.mjs")).href
        )) as { needsTest262: Decide }
    ).needsTest262;

test("Test262 directory jobs run for compiler and runtime changes only", async () => {
    const needsTest262 = await decide();
    const pr = (files: string[] | null, fullCi = false) =>
        needsTest262({ event: "pull_request", fullCi, files }).run;
    assert.equal(pr(["src/runtime/promise.ts"]), true);
    assert.equal(pr(["src/lib/runtime/regexp-vm.js", "docs/x.md"]), true);
    assert.equal(pr(["src/frontend/parser.ts"]), true);
    assert.equal(pr(["scripts/test262-smoke.mjs"]), true);
    assert.equal(pr(["package-lock.json"]), true);
    assert.equal(pr([".github/workflows/check.yml"]), true);
    assert.equal(pr(["tests/test262-smoke.json"]), true);
    assert.equal(
        pr([
            "tests/regexp.test.ts",
            "scripts/run-shard.mjs",
            "site/src/index.md",
            "docs/ci-runners.md",
            "examples/a.js",
            ".github/workflows/pages.yml",
            "CHANGELOG.md",
        ]),
        false,
    );
    assert.equal(pr(["docs/a.md"], true), true);
    assert.equal(pr(null), true);
    for (const event of ["push", "workflow_dispatch", "workflow_call"])
        assert.equal(
            needsTest262({ event, fullCi: false, files: [] }).run,
            true,
        );
});
