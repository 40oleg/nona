import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The routing of Windows CI jobs between GitHub-hosted runners and the
// owner's self-hosted runner (scripts/pick-runner.mjs, docs/ci-runners.md).
interface Decision {
    runner: string | string[];
    reason: string;
}
interface Runner {
    status: string;
    busy: boolean;
    labels: string[];
}
type Decide = (input: {
    trusted: boolean;
    runners: Runner[] | null;
    queuedJobs: { labels: string[] }[];
    minQueued?: number;
}) => Decision;
const decide = async () =>
    (
        (await import(
            pathToFileURL(resolve("scripts/pick-runner.mjs")).href
        )) as { decide: Decide }
    ).decide;

const local = ["self-hosted", "Windows", "X64"];
const idle: Runner = { status: "online", busy: false, labels: local };
const hostedJob = { labels: ["windows-latest"] };

test("a queued hosted Windows job sends the next one to an idle self-hosted runner", async () => {
    const pick = await decide();
    assert.deepEqual(
        pick({ trusted: true, runners: [idle], queuedJobs: [hostedJob] })
            .runner,
        local,
    );
});

test("the job stays hosted while hosted runners are free", async () => {
    const pick = await decide();
    assert.equal(
        pick({ trusted: true, runners: [idle], queuedJobs: [] }).runner,
        "windows-latest",
    );
    assert.equal(
        pick({
            trusted: true,
            runners: [idle],
            queuedJobs: [hostedJob],
            minQueued: 2,
        }).runner,
        "windows-latest",
    );
});

test("forks, unknown status, an offline, busy or backlogged runner keep the job hosted", async () => {
    const pick = await decide();
    const hosted = (input: Parameters<Decide>[0]) =>
        assert.equal(pick(input).runner, "windows-latest", pick(input).reason);
    hosted({ trusted: false, runners: [idle], queuedJobs: [hostedJob] });
    hosted({ trusted: true, runners: null, queuedJobs: [hostedJob] });
    hosted({
        trusted: true,
        runners: [{ ...idle, status: "offline" }],
        queuedJobs: [hostedJob],
    });
    hosted({
        trusted: true,
        runners: [{ ...idle, busy: true }],
        queuedJobs: [hostedJob],
    });
    hosted({
        trusted: true,
        runners: [{ ...idle, labels: ["self-hosted", "Linux", "X64"] }],
        queuedJobs: [hostedJob],
    });
    hosted({
        trusted: true,
        runners: [idle],
        queuedJobs: [hostedJob, { labels: local }],
    });
});
