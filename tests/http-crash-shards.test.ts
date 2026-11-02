import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

const load = (name: string) =>
    import(pathToFileURL(resolve(`scripts/${name}.mjs`)).href);
const plan = await load("http-crash-plan");
const acceptance = await load("http-crash-acceptance");
const provenance = await load("http-crash-provenance");
const fixture = await load("http-crash-fixture");
const aggregate = await load("http-crash-aggregate").catch((e) => {
    if (e.code === "ERR_MODULE_NOT_FOUND") return {};
    throw e;
});
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const json = (v: any) => JSON.stringify(v) + "\n";
const head = "a".repeat(40),
    tree = "b".repeat(40);
const env = {
    GITHUB_REPOSITORY: "40oleg/nona",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_SHA: head,
    GITHUB_WORKFLOW_SHA: head,
    GITHUB_WORKFLOW_REF:
        "40oleg/nona/.github/workflows/http-crash-diagnostic.yml@refs/heads/issue-602-startup-review",
    GITHUB_REF: "refs/heads/issue-602-startup-review",
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "2",
    RUNNER_ENVIRONMENT: "github-hosted",
    RUNNER_OS: "Windows",
    RUNNER_NAME: "hosted",
    ImageOS: "win25",
    ImageVersion: "20261101.1",
};
const dependency = {
    commit: "47193961f3bf9b69c0177d5522de3db1069447df",
    isAncestor: true,
    exitCode: 0,
    error: null,
};
const main = {
    commit: "ba94164b6573eef306b87a59d0b174630973e364",
    isAncestor: true,
    exitCode: 0,
    error: null,
};

// Small synthetic raw streams, never native images or copied historical proof.
// The positive oracle is 6 completed rows only; stress client-error is tested separately.
function proof(index = 1) {
    const shard = {
        index,
        id: `shard-${String(index).padStart(2, "0")}`,
        jobIndex: index - 1,
        jobKey: `windows-${index}`,
    };
    const origin = provenance.provenanceRecord(
        {
            ...env,
            HTTP_CRASH_SHARD: String(index),
            HTTP_CRASH_JOB_INDEX: String(index - 1),
        },
        {},
        { head, tree },
        structuredClone(dependency),
        structuredClone(main),
    );
    const metadata = {
        sha: head,
        tree,
        workflowRun: "123",
        workflowAttempt: "2",
        nodeVersion: "v26.9.0",
        os: "win32",
        arch: "x64",
        runnerName: "hosted",
        runnerEnvironment: "github-hosted",
        runnerImage: "win25",
        runnerImageVersion: "20261101.1",
        referenceBlob: fixture.referenceBlob,
        symbols: "raw",
        shard,
        globalPlanned: 57,
    };
    const planned = plan.trialMatrix().slice((index - 1) * 6, index * 6);
    const files: Record<string, string> = {};
    for (const reference of [true, false])
        files[`${reference ? "reference" : "controlled"}.mjs`] =
            fixture.serverSource(reference);
    const results = planned.map((spec: any) => {
        const observationMs = spec.fixture === "reference" ? 22000 : 8500;
        const rounds = spec.state === "keepalive" ? 4 : 1;
        const termination = {
            pid: 100,
            code: null,
            signal: "SIGKILL",
            reason: "observation-complete",
            error: null,
            hex: null,
            elapsedMs: observationMs + 100,
            dropped: { stdout: 0, stderr: 0 },
        };
        const settings = {
            event: "settings",
            keepAliveTimeout: "5000",
            keepAliveTimeoutBuffer: "1000",
            timeout: "0",
        };
        const row = {
            ...spec,
            ...metadata,
            sourceHash: hash(files[`${spec.fixture}.mjs`]!),
            imageHash: "c".repeat(64),
            status: "finished",
            settings,
            timeoutWindowCovered: true,
            pid: 100,
            port: 1234,
            limits: { startupMs: 60000, hardMs: 90000, observationMs, rounds },
            workload: {
                requests: spec.concurrency * rounds,
                completed:
                    spec.state === "queued-timeout"
                        ? 0
                        : spec.concurrency * rounds,
                wrongOutput: 0,
                errors: 0,
                hangs: 0,
            },
            termination,
            verdict: "observed-no-fault",
        };
        const events: any[] = [{ ms: 0, event: "spawn", pid: 100 }];
        for (let i = 0; i < row.workload.requests; i++)
            events.push(
                spec.state === "queued-timeout"
                    ? { ms: 1, event: "paused-peer", client: i }
                    : {
                          ms: 1,
                          event: "response",
                          valid: true,
                          status: 200,
                          bytes: spec.chunkBytes * spec.chunks,
                      },
            );
        events.push({
            ms: termination.elapsedMs,
            event: "termination",
            ...termination,
        });
        files[`${row.id}/trial.json`] = json(row);
        files[`${row.id}/termination.json`] = json(termination);
        files[`${row.id}/stdout.log`] =
            `diagnostic ${JSON.stringify(settings)}\nready 1234\n`;
        files[`${row.id}/stderr.log`] = "";
        files[`${row.id}/client.jsonl`] = events.map(json).join("");
        if (spec.runtime === "nona") {
            const prefix = `${spec.fixture}-${spec.gc}/build/`;
            files[prefix + "termination.json"] = json({
                pid: 99,
                code: 0,
                signal: null,
                error: null,
                reason: null,
                elapsedMs: 1000,
                dropped: { stdout: 0, stderr: 0 },
            });
            files[prefix + "stdout.log"] = "";
            files[prefix + "stderr.log"] = "";
            files[prefix + "image.json"] = json({
                sourceHash: row.sourceHash,
                imageHash: row.imageHash,
                sha: head,
                tree,
                gc: spec.gc,
            });
        }
        return row;
    });
    const matrix = {
        metadata,
        planned,
        results,
        completed: results.length,
        interrupted: false,
        counts: { "observed-no-fault": results.length },
    };
    files["matrix.json"] = json(matrix);
    files["provenance.json"] = json(origin);
    files["runner.json"] = json({
        name: "hosted",
        environment: "github-hosted",
        image: "win25",
        imageVersion: "20261101.1",
        os: "Windows",
    });
    files["acceptance.json"] = json({
        scope: "shard",
        shard,
        shardAccepted: true,
        fullAccepted: false,
        globalPlanned: 57,
        shardPlanned: planned.length,
        completed: planned.length,
        interrupted: false,
        productFix: false,
        rows: planned.map((row: any) => ({
            id: row.id,
            rawVerdict: "observed-no-fault",
            acceptance: "observed-no-fault",
        })),
        errors: [],
    }); // deliberately untrusted: aggregation must recompute it from raw bytes
    return { files, matrix, provenance: origin, index };
}
function packaged(index: number) {
    const p = proof(index);
    const name = `http-crash-proof-123-2-shard-${String(index).padStart(2, "0")}`;
    return {
        ...p,
        manifest: aggregate.proofManifest(p.files, p.provenance),
        artifact: {
            id: index,
            name,
            expired: false,
            size_in_bytes: 100,
            workflow_run: { id: 123 },
        },
    };
}
const expected = {
    checkout: { head, tree, expectedHead: head },
    event: {
        name: "workflow_dispatch",
        action: null,
        sha: head,
        ref: env.GITHUB_REF,
        pr: null,
        draft: null,
    },
    workflow: {
        sha: head,
        ref: env.GITHUB_WORKFLOW_REF,
        runId: "123",
        runAttempt: "2",
    },
    dependency,
    main,
};
const run = (packages: any[], jobResult = "success") =>
    aggregate.aggregateAcceptance(packages, expected, jobResult);

test("failed-startup null settings report each trial and do not hide later source/build corruption", () => {
    const p = proof();
    // Actual shard01 shape: no output/settings/requests, SIGKILL deadline at 60s.
    for (const index of [2, 5]) {
        const row = p.matrix.results[index]!;
        const pid = index === 2 ? 6196 : 7412;
        Object.assign(row, {
            pid,
            settings: null,
            verdict: "startup-timeout",
            elapsedMs: 60016,
            workload: {
                requests: 0,
                completed: 0,
                wrongOutput: 0,
                errors: 0,
                hangs: 0,
            },
            termination: {
                pid,
                code: null,
                signal: "SIGKILL",
                hex: null,
                reason: "deadline",
                error: null,
                elapsedMs: 60015,
                dropped: { stdout: 0, stderr: 0 },
            },
        });
        delete (row as any).timeoutWindowCovered;
        p.files[`${row.id}/trial.json`] = json(row);
        p.files[`${row.id}/termination.json`] = json(row.termination);
        p.files[`${row.id}/stdout.log`] = "";
        p.files[`${row.id}/client.jsonl`] =
            json({ ms: 1, event: "spawn", pid }) +
            json({ ms: 60016, event: "termination", ...row.termination });
    }
    p.files["controlled.mjs"] += "// corruption after trial-3\n";
    p.matrix.results[2]!.limits.hardMs = 90001;
    p.files["trial-3/trial.json"] = json(p.matrix.results[2]);
    Object.assign(p.matrix.counts, {
        "observed-no-fault": 4,
        "startup-timeout": 2,
    });
    p.files["controlled-off/build/termination.json"] = json({ code: 1 });
    const before = json(p.matrix);
    const result = acceptance.diagnosticShardAcceptance(
        p.matrix,
        p.files,
        p.provenance,
        1,
    );
    assert.equal(result.shardAccepted, false);
    assert.equal(result.fullAccepted, false);
    assert.equal(
        acceptance.diagnosticAcceptance(p.matrix, p.files, p.provenance)
            .accepted,
        false,
    );
    for (const id of ["trial-3", "trial-6"])
        assert.ok(
            result.errors.some(
                (e: string) =>
                    e.includes(id) &&
                    e.includes("Missing/malformed settings") &&
                    e.includes("startup-timeout"),
            ),
            result.errors.join("; "),
        );
    assert.ok(
        result.errors.some(
            (e: string) =>
                e.includes("trial-4") && e.includes("Fixture source"),
        ),
    );
    assert.ok(
        result.errors.some(
            (e: string) =>
                e.includes("trial-5") && e.includes("compiler/image"),
        ),
    );
    assert.ok(
        result.errors.some(
            (e: string) =>
                e.includes("trial-3") &&
                e.includes("Changed or incomplete observation/deadline"),
        ),
    );
    assert.equal(
        result.errors.some((e: string) =>
            /Cannot read properties|TypeError/.test(e),
        ),
        false,
    );
    assert.equal(json(p.matrix), before);
});

test("fixed shard selector covers 57 unchanged trials in complete trios and rejects arbitrary selectors", () => {
    assert.equal(typeof plan.shardPlan, "function");
    const shards = Array.from({ length: 10 }, (_, i) => plan.shardPlan(i + 1));
    assert.deepEqual(
        shards.map((s) => s.trials.length),
        [6, 6, 6, 6, 6, 6, 6, 6, 6, 3],
    );
    assert.deepEqual(
        shards.flatMap((s) => s.trials),
        plan.trialMatrix(),
    );
    assert.deepEqual(
        shards[9].trials.map((r: any) => r.id),
        ["trial-55", "trial-56", "trial-57"],
    );
    for (const s of shards)
        for (let i = 0; i < s.trials.length; i += 3)
            assert.deepEqual(
                s.trials.slice(i, i + 3).map((r: any) => [r.runtime, r.gc]),
                [
                    ["node", "n/a"],
                    ["nona", "off"],
                    ["nona", "stress"],
                ],
            );
    for (const value of [0, 11, 1.5, NaN, "1x", "01", "", undefined])
        assert.throws(() => plan.shardPlan(value));
    assert.deepEqual(plan.diagnosticArgs(["out", "--shard", "10"]), {
        directory: "out",
        shard: 10,
    });
    for (const args of [
        [],
        ["out"],
        ["out", "--shard"],
        ["out", "--shard", "1", "extra"],
        ["out", "--subset", "1"],
    ])
        assert.throws(() => plan.diagnosticArgs(args));
});

test("six valid raw rows earn only shard acceptance; no cached flag upgrades them to full57", () => {
    assert.equal(typeof acceptance.diagnosticShardAcceptance, "function");
    const p = proof();
    const result = acceptance.diagnosticShardAcceptance(
        p.matrix,
        p.files,
        p.provenance,
        1,
    );
    assert.equal(result.shardAccepted, true);
    assert.equal(result.fullAccepted, false);
    assert.equal(result.globalPlanned, 57);
    assert.equal(
        acceptance.diagnosticAcceptance(p.matrix, p.files, p.provenance)
            .accepted,
        false,
    );
});

test("pre-install integrated provenance rejects missing main, bad strategy and unverifiable dependency facts", () => {
    const validEnv = {
        ...env,
        HTTP_CRASH_SHARD: "1",
        HTTP_CRASH_JOB_INDEX: "0",
    };
    const record = (e = validEnv, d = dependency, m: any = main) =>
        provenance.provenanceRecord(e, {}, { head, tree }, d, m);
    assert.equal(record().verified, true);
    assert.equal(record(validEnv, dependency, null).verified, false);
    assert.equal(
        record({ ...validEnv, HTTP_CRASH_JOB_INDEX: "1" }).verified,
        false,
    );
    assert.equal(
        record(validEnv, { ...dependency, commit: "f".repeat(40) }).verified,
        false,
    );
    assert.equal(
        record(validEnv, { ...dependency, exitCode: 128 }).verified,
        false,
    );
    for (const key of [
        "RUNNER_NAME",
        "ImageOS",
        "ImageVersion",
        "GITHUB_RUN_ID",
        "GITHUB_RUN_ATTEMPT",
    ])
        assert.equal(record({ ...validEnv, [key]: "" }).verified, false, key);
});

test("aggregate revalidates ten isolated raw proofs and preserves ten actual runner records", () => {
    assert.equal(typeof aggregate.aggregateAcceptance, "function");
    const result = run(Array.from({ length: 10 }, (_, i) => packaged(i + 1)));
    assert.equal(result.accepted, true);
    assert.equal(result.fullAccepted, true);
    assert.equal(result.completedUnique, 57);
    assert.equal(
        result.provenance.length,
        10,
        "same runner name is permitted; no invented single runner",
    );
    assert.equal(result.productFix, false);
    assert.equal(result.runnerRecords.length, 10);
});

test("aggregate rejects missing, duplicate, stale, foreign, failed and relabelled packages", () => {
    assert.equal(typeof aggregate.aggregateAcceptance, "function");
    const packages = Array.from({ length: 10 }, (_, i) => packaged(i + 1));
    for (const result of [
        run(packages.slice(0, 9)),
        run([...packages, packages[0]]),
        run(packages, "failure"),
        run(packages, "cancelled"),
        run(packages, "skipped"),
    ])
        assert.equal(result.accepted, false);
    const mutations = [
        (p: any) => {
            p.artifact.name = "http-crash-proof-123-1-shard-01";
        },
        (p: any) => {
            p.artifact.id = 2;
        },
        (p: any) => {
            p.artifact.workflow_run.id = 124;
        },
        (p: any) => {
            p.artifact.expired = true;
        },
        (p: any) => {
            p.index = 2;
        },
        (p: any) => {
            p.files["extra.json"] = "{}\n";
        },
        (p: any) => {
            p.manifest.files["matrix.json"].sha256 = "0".repeat(64);
        },
    ];
    for (const mutate of mutations) {
        const first = packaged(1);
        mutate(first);
        assert.equal(
            run([first, ...packages.slice(1)]).accepted,
            false,
            mutate.toString(),
        );
    }
});

test("consistent raw/report/manifest corruption cannot bypass canonical, provenance, clocks, builds or stress hold", () => {
    assert.equal(typeof aggregate.aggregateAcceptance, "function");
    const others = Array.from({ length: 9 }, (_, i) => packaged(i + 2));
    const changes: Array<(p: any) => void> = [
        (p) => {
            p.matrix.results[0].id = "trial-58";
        },
        (p) => {
            p.matrix.results[1] = p.matrix.results[0];
        },
        (p) => {
            p.matrix.results.reverse();
        },
        (p) => {
            p.matrix.planned[0].chunks = 1;
        },
        (p) => {
            p.matrix.interrupted = true;
        },
        (p) => {
            p.matrix.counts["observed-no-fault"] = 5;
        },
        (p) => {
            p.provenance.checkout.tree = "c".repeat(40);
        },
        (p) => {
            p.provenance.checkout.head = "d".repeat(40);
        },
        (p) => {
            p.provenance.main.isAncestor = false;
        },
        (p) => {
            p.provenance.dependency.commit = "e".repeat(40);
        },
        (p) => {
            p.provenance.workflow.runAttempt = "1";
        },
        (p) => {
            p.provenance.workflow.sha = "e".repeat(40);
        },
        (p) => {
            p.provenance.event.name = "push";
        },
        (p) => {
            p.provenance.shard.jobIndex = 1;
        },
        (p) => {
            p.provenance.shard.jobKey = "windows-other";
        },
        (p) => {
            p.provenance.repository = "fork/nona";
        },
        (p) => {
            p.provenance.verified = false;
        },
        (p) => {
            p.provenance.errors = ["failed"];
        },
        (p) => {
            p.provenance.runner.name = "other-host";
        },
        (p) => {
            p.provenance.runner.os = "Linux";
        },
        (p) => {
            p.matrix.metadata.nodeVersion = "v26.8.0";
        },
        (p) => {
            p.matrix.metadata.runnerImage = "foreign";
        },
        (p) => {
            p.matrix.metadata.referenceBlob = "e".repeat(40);
        },
        (p) => {
            p.matrix.metadata.workflowRun = "124";
        },
        (p) => {
            p.matrix.metadata.workflowAttempt = "1";
        },
        (p) => {
            p.matrix.results[0].termination.elapsedMs = 21999;
        },
        (p) => {
            p.matrix.results[0].limits.observationMs = 1;
        },
        (p) => {
            p.matrix.results[0].limits.startupMs = 60001;
        },
        (p) => {
            p.matrix.results[0].termination.reason = "deadline";
        },
        (p) => {
            p.matrix.results[0].termination.code = 0;
        },
        (p) => {
            p.matrix.results[0].termination.dropped.stdout = 1;
        },
        (p) => {
            p.matrix.results[0].termination.error = { message: "spawn" };
        },
        (p) => {
            p.matrix.results[0].workload.completed--;
        },
        (p) => {
            p.matrix.results[0].verdict = "startup-timeout";
        },
        (p) => {
            p.matrix.results[0].workload.wrongOutput++;
        },
        (p) => {
            p.files["trial-1/client.jsonl"] = p.files[
                "trial-1/client.jsonl"
            ].replace('"status":200', '"status":500');
        },
        (p) => {
            p.files["trial-1/client.jsonl"] = p.files[
                "trial-1/client.jsonl"
            ].replace('"bytes":1048576', '"bytes":1');
        },
        (p) => {
            p.files["trial-1/client.jsonl"] = p.files[
                "trial-1/client.jsonl"
            ].replace('"ms":1', '"ms":-1');
        },
        (p) => {
            p.files["trial-1/client.jsonl"] = p.files[
                "trial-1/client.jsonl"
            ].slice(0, -2);
        },
        (p) => {
            p.files["trial-1/stdout.log"] = "ready 1234\n";
        },
        (p) => {
            p.files["trial-1/stdout.log"] += "unexpected\n";
        },
        (p) => {
            p.files["trial-1/stderr.log"] = "error\n";
        },
        (p) => {
            delete p.files["trial-1/client.jsonl"];
        },
        (p) => {
            p.files["reference-stress/build/termination.json"] = json({
                code: 0,
            });
        },
        (p) => {
            p.files["reference-stress/build/image.json"] = json({
                imageHash: "bad",
            });
        },
        (p) => {
            p.files["reference-stress/build/stdout.log"] =
                "unexpected compiler output\n";
        },
        (p) => {
            p.files["reference.mjs"] += "// mutant";
        },
        (p) => {
            delete p.files["acceptance.json"];
        },
        (p) => {
            p.files["acceptance.json"] = "{broken\n";
        },
        (p) => {
            p.files["acceptance.json"] = json({
                scope: "full57",
                accepted: true,
            });
        },
        (p) => {
            p.files["trial-58/stderr.log"] = "";
        },
        (p) => {
            p.matrix.results[2].verdict = "client-error";
        },
    ];
    for (const mutate of changes) {
        const p = packaged(1);
        assert.equal(
            acceptance.diagnosticShardAcceptance(
                p.matrix,
                p.files,
                p.provenance,
                1,
            ).shardAccepted,
            true,
        );
        mutate(p);
        // Keep redundant reports consistent: failures must come from actual validation.
        for (const row of p.matrix.results) {
            p.files[`${row.id}/trial.json`] = json(row);
            p.files[`${row.id}/termination.json`] = json(row.termination);
            try {
                const clientText = p.files[`${row.id}/client.jsonl`];
                if (typeof clientText !== "string")
                    throw Error("Missing raw stream");
                const stream = clientText
                    .trimEnd()
                    .split("\n")
                    .map((text) => JSON.parse(text));
                const last = stream.at(-1);
                if (last.event === "termination" && clientText.endsWith("\n")) {
                    stream[stream.length - 1] = {
                        ms: last.ms,
                        event: "termination",
                        ...row.termination,
                    };
                    p.files[`${row.id}/client.jsonl`] = stream
                        .map(json)
                        .join("");
                }
            } catch {
                /* preserve intentionally truncated streams */
            }
        }
        p.files["matrix.json"] = json(p.matrix);
        p.files["provenance.json"] = json(p.provenance);
        p.manifest = aggregate.proofManifest(p.files, p.provenance);
        assert.equal(run([p, ...others]).accepted, false, mutate.toString());
    }
});

test("queued-peer shard cannot accept fabricated completed responses", () => {
    const p = proof(2);
    const before = acceptance.diagnosticShardAcceptance(
        p.matrix,
        p.files,
        p.provenance,
        2,
    );
    assert.equal(before.shardAccepted, true, JSON.stringify(before));
    p.matrix.results[0].workload.completed = 1;
    p.files["trial-7/trial.json"] = json(p.matrix.results[0]);
    assert.equal(
        acceptance.diagnosticShardAcceptance(p.matrix, p.files, p.provenance, 2)
            .shardAccepted,
        false,
    );
});

test("last shard cannot accept two of three trials after dropping trial57", () => {
    const p = proof(10);
    assert.equal(
        acceptance.diagnosticShardAcceptance(
            p.matrix,
            p.files,
            p.provenance,
            10,
        ).shardAccepted,
        true,
    );
    p.matrix.results.pop();
    p.matrix.completed = 2;
    p.matrix.counts["observed-no-fault"] = 2;
    assert.equal(
        acceptance.diagnosticShardAcceptance(
            p.matrix,
            p.files,
            p.provenance,
            10,
        ).shardAccepted,
        false,
    );
});

test("always packaging preserves partial malformed raw bytes while excluding images and dumps", () => {
    const source = resolve("virtual-shard"),
        output = resolve("virtual-proof");
    const raw = new Map<string, Buffer>([
        [join(source, "provenance.json"), Buffer.from("{broken")],
        [join(source, "trial-1", "client.jsonl"), Buffer.from('{"partial":')],
        [join(source, "trial-1", "stdout.log"), Buffer.from([255, 10])],
        [
            join(source, "controlled-stress", "build", "stderr.log"),
            Buffer.from("compiler failed\n"),
        ],
        [
            join(source, "controlled-stress", "nona-http.exe"),
            Buffer.from("large image"),
        ],
        [join(source, "dumps", "fault.dmp"), Buffer.from("large dump")],
    ]);
    const written = new Map<string, Buffer>();
    const text = readFileSync("scripts/http-crash-aggregate.mjs", "utf8")
        .replace(/^import[\s\S]*?;\r?\n/gm, "")
        .replace(/^export /gm, "")
        .split(/\nif \(\r?\n    process.argv\[1\]/)[0];
    const pack = runInNewContext(text + "\npack;", {
        Buffer,
        createHash,
        join,
        resolve,
        mkdirSync() {},
        lstatSync: () => ({ isSymbolicLink: () => false }),
        readFileSync: (path: string) => raw.get(path),
        writeFileSync: (path: string, bytes: any) =>
            written.set(path, Buffer.from(bytes)),
        readdirSync: (path: string) => {
            const prefix = path + sep;
            const names = [
                ...new Set(
                    [...raw.keys()]
                        .filter((p) => p.startsWith(prefix))
                        .map((p) => p.slice(prefix.length).split(sep)[0]!),
                ),
            ];
            return names.map((name) => ({
                name,
                isDirectory: () => !raw.has(join(path, name)),
            }));
        },
    });
    pack(source, output);
    assert.deepEqual(
        written.get(join(output, "trial-1", "stdout.log")),
        Buffer.from([255, 10]),
    );
    assert.equal(
        written.get(join(output, "provenance.json"))?.toString(),
        "{broken",
    );
    assert.equal(
        written.get(join(output, "trial-1", "client.jsonl"))?.toString(),
        '{"partial":',
    );
    assert.equal(
        written
            .get(join(output, "controlled-stress", "build", "stderr.log"))
            ?.toString(),
        "compiler failed\n",
    );
    assert.equal(
        written.size,
        5,
        "four raw files and a manifest; no images/dumps",
    );
    const manifest = JSON.parse(
        written.get(join(output, "manifest.json"))!.toString(),
    );
    assert.equal(manifest.files["trial-1/stdout.log"].bytes, 2);
    assert.equal(
        manifest.files["trial-1/stdout.log"].sha256,
        createHash("sha256")
            .update(Buffer.from([255, 10]))
            .digest("hex"),
    );
});
