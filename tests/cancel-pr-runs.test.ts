import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Which runs a closed pull request cancels (scripts/cancel-pr-runs.mjs, #373).
interface Run {
    id: number;
    status: string;
    event: string;
    head_branch: string;
    head_sha: string;
    pull_requests?: { number: number }[];
}
type Select = (
    runs: Run[],
    pr: { number: number; headRef: string; headSha: string; selfId: number },
) => Run[];
const select = async () =>
    (
        (await import(
            pathToFileURL(resolve("scripts/cancel-pr-runs.mjs")).href
        )) as { runsToCancel: Select }
    ).runsToCancel;

const pr = { number: 7, headRef: "issue-7-x", headSha: "abc", selfId: 99 };
const run = (id: number, extra: Partial<Run> = {}): Run => ({
    id,
    status: "queued",
    event: "pull_request",
    head_branch: "issue-7-x",
    head_sha: "abc",
    ...extra,
});

test("a closed pull request cancels only its own unfinished runs", async () => {
    const runsToCancel = await select();
    const runs = [
        run(1),
        run(2, { status: "in_progress" }),
        run(3, { status: "completed" }),
        run(4, { head_sha: "old", pull_requests: [{ number: 7 }] }),
        run(5, { head_sha: "old" }),
        run(6, { event: "push" }),
        run(7, { head_branch: "main" }),
        run(8, { head_branch: "issue-8-y", head_sha: "abc" }),
        run(99),
    ];
    assert.deepEqual(
        runsToCancel(runs, pr).map((r) => r.id),
        [1, 2, 4],
    );
});
