import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const api = await import(pathToFileURL(resolve("scripts/http-crash.mjs")).href);
const retained = JSON.parse(
    readFileSync(
        "tests/fixtures/http-crash/retained/destroy-evidence.json",
        "utf8",
    ),
);
const files = Object.fromEntries(
    retained.files.map((f: { path: string; bytes: string }) => [
        f.path,
        Buffer.from(f.bytes, "base64").toString("utf8"),
    ]),
);
const matrix = JSON.parse(files["matrix.json"]);
const provenance = JSON.parse(files["provenance.json"]);
const evaluate = (input = files, campaign = matrix, origin = provenance) =>
    api.diagnosticAcceptance?.(campaign, input, origin) ?? {
        accepted: false,
        rows: [],
    };

function retainedPair() {
    const campaign = structuredClone(matrix);
    const ids = ["trial-13", "trial-14"];
    campaign.planned = campaign.planned.filter((p: any) => ids.includes(p.id));
    campaign.results = campaign.results.filter((p: any) => ids.includes(p.id));
    campaign.completed = 2;
    campaign.interrupted = false;
    return campaign;
}

test("aggregate acceptance rejects an empty self-consistent campaign", () => {
    const campaign = {
        ...matrix,
        planned: [],
        results: [],
        completed: 0,
        interrupted: false,
    };
    assert.equal(evaluate(files, campaign).accepted, false);
});

test("actual retained 13/14 pair keeps intended-destroy rows but cannot accept 2/57", () => {
    const result = evaluate(files, retainedPair());
    assert.deepEqual(
        result.rows.map((r: any) => [r.rawVerdict, r.acceptance]),
        [
            ["client-error", "intended-destroy"],
            ["client-error", "intended-destroy"],
        ],
    );
    assert.equal(result.productFix, false);
    assert.equal(result.accepted, false);
});

test("canonical plan and ordered results cannot be replaced by altered, duplicate or unknown entries", () => {
    const cases: Array<(m: any) => void> = [
        (m) => {
            m.planned[0].chunkBytes = 1;
        },
        (m) => {
            m.planned[0].runtime = "other";
        },
        (m) => {
            m.planned[0].gc = "off";
        },
        (m) => {
            m.planned[0].id = "unknown";
        },
        (m) => {
            m.planned[0].extra = true;
        },
        (m) => {
            m.planned.push(m.planned[0]);
        },
        (m) => {
            m.planned[1] = m.planned[0];
        },
        (m) => {
            m.planned.reverse();
        },
        (m) => {
            m.planned.pop();
        },
        (m) => {
            delete m.planned;
        },
        (m) => {
            m.results.reverse();
        },
        (m) => {
            m.results.push(m.results[0]);
        },
        (m) => {
            m.results[1] = m.results[0];
        },
        (m) => {
            m.results.pop();
        },
        (m) => {
            delete m.results;
        },
        (m) => {
            delete m.completed;
        },
        (m) => {
            delete m.interrupted;
        },
        (m) => {
            m.interrupted = true;
        },
        (m) => {
            delete m.metadata;
        },
        (m) => {
            m.metadata.sha = "b".repeat(40);
        },
    ];
    for (const mutate of cases) {
        const campaign = structuredClone(matrix);
        mutate(campaign);
        assert.equal(evaluate(files, campaign).accepted, false);
    }
});

test("exact retained destroy pairs earn separate acceptance without rewriting raw client-error verdicts", () => {
    assert.deepEqual(
        api.trialMatrix(),
        matrix.planned,
        "original 57-trial plan stays exact",
    );
    const before = JSON.stringify(matrix);
    const result = evaluate();
    for (const id of [13, 14, 25, 26, 37, 38]) {
        const row = result.rows.find(
            (r: { id: string }) => r.id === `trial-${id}`,
        );
        assert.equal(
            row?.acceptance,
            "intended-destroy",
            `trial-${id} needs exact paired raw evidence`,
        );
        assert.equal(row.rawVerdict, "client-error");
    }
    assert.equal(
        result.accepted,
        false,
        "45/57 with timeouts and interruption still fails",
    );
    assert.equal(
        result.rows.filter(
            (r: { acceptance: string }) => r.acceptance === "intended-destroy",
        ).length,
        6,
    );
    assert.equal(matrix.completed, 45);
    assert.equal(matrix.planned.length, 57);
    assert.equal(matrix.counts["startup-timeout"], 14);
    assert.equal(matrix.counts.interrupted, 1);
    assert.equal(
        result.rows.filter(
            (r: { rawVerdict: string; acceptance: string }) =>
                r.rawVerdict === "startup-timeout" &&
                r.acceptance === "failing",
        ).length,
        14,
    );
    assert.equal(
        result.rows.find((r: { id: string }) => r.id === "trial-45").acceptance,
        "failing",
    );
    assert.equal(JSON.stringify(matrix), before, "raw matrix must stay intact");
});

test("consistent corrupt trial/report copies cannot hide unexpected termination, missing provenance, wrong output or incomplete counts", () => {
    const alter = (row: any) => {
        const campaign = structuredClone(matrix),
            raw = structuredClone(files);
        const existing = campaign.results.find(
            (r: { id: string }) => r.id === "trial-14",
        );
        Object.assign(existing, row);
        raw["trial-14/trial.json"] = JSON.stringify(existing) + "\n";
        raw["trial-14/termination.json"] =
            JSON.stringify(existing.termination) + "\n";
        const events = raw["trial-14/client.jsonl"]
            .trimEnd()
            .split("\n")
            .map(JSON.parse);
        events[events.length - 1] = {
            ms: events.at(-1).ms,
            event: "termination",
            ...existing.termination,
        };
        raw["trial-14/client.jsonl"] =
            events.map((e: object) => JSON.stringify(e)).join("\n") + "\n";
        return evaluate(raw, campaign);
    };
    const original = matrix.results.find(
        (r: { id: string }) => r.id === "trial-14",
    );
    const cases = [
        { workload: { ...original.workload, wrongOutput: 1 } },
        { workload: { ...original.workload, hangs: 1 } },
        { workload: { ...original.workload, requests: 2 } },
        { workload: { ...original.workload, completed: 1 } },
        { termination: { ...original.termination, reason: "deadline" } },
        {
            termination: {
                ...original.termination,
                reason: null,
                signal: null,
                code: 0,
            },
        },
        {
            termination: { ...original.termination, signal: "SIGSEGV" },
            verdict: "native-fault",
        },
        {
            termination: {
                ...original.termination,
                dropped: { stdout: 1, stderr: 0 },
            },
        },
        {
            termination: {
                ...original.termination,
                error: { message: "spawn failed" },
            },
        },
        { sha: "b".repeat(40) },
        { workflowRun: "other" },
        { sourceHash: "b".repeat(64) },
    ];
    for (const row of cases) {
        const result = alter(row);
        assert.notEqual(
            result.rows.find((r: { id: string }) => r.id === "trial-14")
                .acceptance,
            "intended-destroy",
            JSON.stringify(row),
        );
        assert.equal(result.accepted, false);
    }
    for (const name of [
        "trial-13/trial.json",
        "trial-14/stdout.log",
        "trial-14/termination.json",
        "controlled-off/build/termination.json",
    ]) {
        const copy = structuredClone(files);
        delete copy[name];
        assert.ok(
            evaluate(copy)
                .rows.filter((r: { id: string }) =>
                    ["trial-13", "trial-14"].includes(r.id),
                )
                .every(
                    (r: { acceptance: string }) =>
                        r.acceptance !== "intended-destroy",
                ),
            name,
        );
    }
});

test("strict destroy acceptance rejects corruption of either member, never state-only exceptions", () => {
    const mutations: Array<(copy: Record<string, string>) => void> = [
        (f) => {
            delete f["trial-13/client.jsonl"];
        },
        (f) => {
            f["trial-14/stderr.log"] = "warning\n";
        },
        (f) => {
            f["trial-13/client.jsonl"] = f["trial-13/client.jsonl"]!.replace(
                "ECONNRESET",
                "EPIPE",
            );
        },
        (f) => {
            f["trial-14/client.jsonl"] = f["trial-14/client.jsonl"]!.replace(
                "socket hang up",
                "unexpected reset",
            );
        },
        (f) => {
            f["trial-14/client.jsonl"] += '{"event":"response-error"}\n';
        },
        (f) => {
            f["trial-13/client.jsonl"] = f["trial-13/client.jsonl"]!.replace(
                '"event":"client-close","socket":1',
                '"event":"client-close","socket":99',
            );
        },
        (f) => {
            f["trial-14/stdout.log"] = f["trial-14/stdout.log"]!.split("\n")
                .filter((line) => !line.includes('"event":"socket-close"'))
                .join("\n");
        },
        (f) => {
            f["trial-13/client.jsonl"] = f["trial-13/client.jsonl"]!.slice(
                0,
                -2,
            );
        },
        (f) => {
            f["trial-13/stdout.log"] = f["trial-13/stdout.log"]!.replace(
                '"responseQueued":1048743',
                '"responseQueued":0',
            );
        },
        (f) => {
            f["trial-14/stdout.log"] = f["trial-14/stdout.log"]!.replace(
                '"event":"destroy"',
                '"event":"end"',
            );
        },
        (f) => {
            f["trial-13/stdout.log"] = f["trial-13/stdout.log"]!.replace(
                '"sequence":4',
                '"sequence":2048',
            );
        },
        (f) => {
            f["trial-14/stdout.log"] += "diagnostic {bad\n";
        },
        (f) => {
            delete f["controlled.mjs"];
        },
        (f) => {
            f["controlled.mjs"] += "// changed\n";
        },
        (f) => {
            f["trial-14/termination.json"] = f[
                "trial-14/termination.json"
            ]!.replace("SIGKILL", "SIGSEGV");
        },
    ];
    for (const mutate of mutations) {
        const copy = structuredClone(files);
        mutate(copy);
        const result = evaluate(copy);
        for (const id of [13, 14])
            assert.notEqual(
                result.rows.find((r: { id: string }) => r.id === `trial-${id}`)
                    ?.acceptance,
                "intended-destroy",
                mutate.toString(),
            );
    }
    for (const [key, value] of Object.entries({
        status: "starting",
        sourceHash: "0".repeat(64),
        concurrency: 32,
        gc: "stress",
        verdict: "native-fault",
        driverError: "failed",
        timeoutWindowCovered: false,
    })) {
        const copy = structuredClone(matrix);
        Object.assign(
            copy.results.find((r: { id: string }) => r.id === "trial-14"),
            { [key]: value },
        );
        assert.notEqual(
            evaluate(files, copy).rows.find(
                (r: { id: string }) => r.id === "trial-14",
            )?.acceptance,
            "intended-destroy",
            key,
        );
    }
    assert.equal(
        evaluate(files, matrix, { ...provenance, verified: false }).accepted,
        false,
    );
    assert.ok(
        evaluate(files, matrix, { ...provenance, verified: false }).rows.every(
            (r: { acceptance: string }) => r.acceptance !== "intended-destroy",
        ),
    );
});
