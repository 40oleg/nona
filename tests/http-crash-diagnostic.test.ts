import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const diagnostic = await import(
    pathToFileURL(resolve("scripts/http-crash.mjs")).href
);
const fixture = await import(
    pathToFileURL(resolve("scripts/http-crash-fixture.mjs")).href
);
function directory() {
    mkdirSync("work", { recursive: true });
    return mkdtempSync(resolve("work", "http-crash-test-"));
}
const spec = {
    fixture: "controlled",
    listeners: "original",
    concurrency: 1,
    state: "keepalive",
    chunkBytes: 16,
    chunks: 4,
    runtime: "node",
    gc: "n/a",
    id: "unit",
};
const fakeSettings = `console.log('diagnostic '+JSON.stringify({event:'settings',
keepAliveTimeout:'5000',keepAliveTimeoutBuffer:'1000',timeout:'0'}));`;

test("diagnostic matrix retains reference topology and pairs every workload with Node 26", () => {
    const matrix = diagnostic.trialMatrix();
    assert.equal(matrix.length, 57);
    assert.equal(new Set(matrix.map((row: { id: string }) => row.id)).size, 57);
    assert.equal(matrix[0].fixture, "reference");
    assert.equal(matrix[0].concurrency, 32);
    for (const row of matrix) {
        assert.ok(row.concurrency <= 32);
        assert.ok(row.chunkBytes * row.chunks <= 1048576);
        assert.ok(
            matrix.some(
                (control: typeof row) =>
                    control.runtime === "node" &&
                    control.fixture === row.fixture &&
                    control.listeners === row.listeners &&
                    control.concurrency === row.concurrency &&
                    control.state === row.state &&
                    control.chunkBytes === row.chunkBytes &&
                    control.chunks === row.chunks,
            ),
        );
    }
    const reference = readFileSync(fixture.referenceFile);
    assert.equal(
        createHash("sha1")
            .update(`blob ${reference.length}\0`)
            .update(reference)
            .digest("hex"),
        fixture.referenceBlob,
    );
    assert.ok(fixture.serverSource(true).startsWith(reference.toString()));
    for (const route of [
        "/text",
        "/json",
        "/big",
        "/echo",
        "/slow",
        "/throw",
        "/__stats",
    ])
        assert.ok(fixture.serverSource().includes(`"${route}"`));
});

test("diagnostic preserves native fault, hang, wrong output and startup results separately", () => {
    const result = {
        code: 3221225477,
        signal: null,
        reason: null,
        error: null,
    };
    const work = { hangs: 0, wrongOutput: 0, errors: 0 };
    assert.equal(
        diagnostic.classifyTermination(result, work, true),
        "native-fault",
    );
    assert.equal(
        diagnostic.classifyTermination(
            { ...result, code: -1073741819 },
            work,
            true,
        ),
        "native-fault",
    );
    const observed = { ...result, code: 1, reason: "observation-complete" };
    assert.equal(
        diagnostic.classifyTermination(observed, { ...work, hangs: 1 }, true),
        "hang",
    );
    assert.equal(
        diagnostic.classifyTermination(
            observed,
            { ...work, wrongOutput: 1 },
            true,
        ),
        "wrong-output",
    );
    assert.equal(
        diagnostic.classifyTermination(observed, { ...work, errors: 1 }, true),
        "client-error",
    );
    assert.equal(
        diagnostic.classifyTermination(observed, work, true),
        "observed-no-fault",
    );
    assert.equal(
        diagnostic.classifyTermination({ ...result, code: 1 }, work, false),
        "startup-failure",
    );
});

test("tiny Node fixture validates chunk framing/body and retains events and actual settings", async () => {
    const dir = directory();
    try {
        const source = join(dir, "server.mjs");
        writeFileSync(source, fixture.serverSource());
        const result = await diagnostic.runTrial(spec, {
            directory: join(dir, "trial"),
            command: process.execPath,
            args: [source],
            startupMs: 3000,
            observationMs: 250,
            hardMs: 4000,
            metadata: {
                sha: "test",
                nodeVersion: process.version,
                imageHash: diagnostic.hashFile(process.execPath),
            },
        });
        assert.equal(result.verdict, "observed-no-fault");
        assert.equal(result.workload.completed, 4);
        assert.equal(result.workload.wrongOutput, 0);
        assert.equal(result.settings.keepAliveTimeout, "5000");
        assert.equal(result.termination.reason, "observation-complete");
        assert.match(
            readFileSync(join(dir, "trial", "stdout.log"), "utf8"),
            /"event":"queued"/,
        );
        assert.match(
            readFileSync(join(dir, "trial", "client.jsonl"), "utf8"),
            /"reused":true/,
        );
        assert.equal(
            JSON.parse(readFileSync(join(dir, "trial", "trial.json"), "utf8"))
                .status,
            "finished",
        );
        assert.throws(() => process.kill(result.pid, 0), { code: "ESRCH" });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("wrong response content is retained as wrong-output", async () => {
    const dir = directory();
    try {
        const source = join(dir, "wrong.mjs");
        writeFileSync(
            source,
            `import http from 'node:http';
${fakeSettings}
const port=Number(process.argv.at(-1));
http.createServer((req,res)=>{res.write('wrong');res.end();}).listen(port,'127.0.0.1',()=>console.log('ready '+port));`,
        );
        const result = await diagnostic.runTrial(spec, {
            directory: join(dir, "trial"),
            command: process.execPath,
            args: [source],
            startupMs: 3000,
            observationMs: 250,
            hardMs: 4000,
        });
        assert.equal(result.verdict, "wrong-output");
        assert.equal(result.workload.wrongOutput, 4);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("listener-free and destroy variants retain their distinct behavior", async () => {
    const dir = directory();
    try {
        const source = join(dir, "server.mjs");
        writeFileSync(source, fixture.serverSource());
        const quiet = await diagnostic.runTrial(
            { ...spec, listeners: "none" },
            {
                directory: join(dir, "quiet"),
                command: process.execPath,
                args: [source],
                startupMs: 3000,
                observationMs: 250,
                hardMs: 4000,
            },
        );
        assert.equal(quiet.verdict, "observed-no-fault");
        assert.equal(quiet.workload.completed, 4);
        const destroyed = await diagnostic.runTrial(
            { ...spec, state: "destroy-queued" },
            {
                directory: join(dir, "destroyed"),
                command: process.execPath,
                args: [source],
                startupMs: 3000,
                observationMs: 250,
                hardMs: 4000,
            },
        );
        assert.equal(destroyed.verdict, "client-error");
        assert.equal(destroyed.workload.completed, 0);
        assert.match(
            readFileSync(join(dir, "destroyed", "stdout.log"), "utf8"),
            /"event":"destroy"/,
        );
        assert.throws(() => process.kill(destroyed.pid, 0), { code: "ESRCH" });
        const paused = await diagnostic.runTrial(
            { ...spec, state: "queued-timeout" },
            {
                directory: join(dir, "paused"),
                command: process.execPath,
                args: [source],
                startupMs: 3000,
                observationMs: 120,
                hardMs: 4000,
            },
        );
        assert.equal(paused.verdict, "observed-no-fault");
        assert.equal(paused.workload.requests, 1);
        assert.match(
            readFileSync(join(dir, "paused", "stdout.log"), "utf8"),
            /"timeout":1000/,
        );
        assert.throws(() => process.kill(paused.pid, 0), { code: "ESRCH" });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("startup deadline kills its child and retains partial stderr and manifest", async () => {
    const dir = directory();
    try {
        const source = join(dir, "never-ready.mjs");
        writeFileSync(
            source,
            "console.error('partial evidence'); setInterval(()=>{},1000);",
        );
        const result = await diagnostic.runTrial(spec, {
            directory: join(dir, "trial"),
            command: process.execPath,
            args: [source],
            startupMs: 250,
            observationMs: 100,
            hardMs: 2000,
        });
        assert.equal(result.verdict, "startup-timeout");
        assert.equal(result.termination.reason, "deadline");
        assert.match(
            readFileSync(join(dir, "trial", "stderr.log"), "utf8"),
            /partial evidence/,
        );
        assert.throws(() => process.kill(result.pid, 0), { code: "ESRCH" });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("pending response is a hang and parent cancellation cleans up", async () => {
    const dir = directory();
    try {
        const source = join(dir, "hang.mjs");
        writeFileSync(
            source,
            `import http from 'node:http';
${fakeSettings}
const port=Number(process.argv.at(-1));
http.createServer(()=>{}).listen(port,'127.0.0.1',()=>console.log('ready '+port));`,
        );
        const result = await diagnostic.runTrial(spec, {
            directory: join(dir, "trial"),
            command: process.execPath,
            args: [source],
            startupMs: 3000,
            observationMs: 120,
            hardMs: 4000,
        });
        assert.equal(result.verdict, "hang");
        assert.ok(result.workload.hangs > 0);
        assert.throws(() => process.kill(result.pid, 0), { code: "ESRCH" });
        const controller = new AbortController();
        const child = diagnostic.supervise(
            process.execPath,
            ["-e", "setInterval(()=>{},1000)"],
            {
                directory: join(dir, "abort"),
                timeoutMs: 2000,
                signal: controller.signal,
            },
        );
        controller.abort();
        const termination = await child.done;
        assert.equal(termination.reason, "aborted");
        assert.throws(() => process.kill(termination.pid, 0), {
            code: "ESRCH",
        });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("spawn failure retains error type/code instead of passing a trial", async () => {
    const dir = directory();
    try {
        const child = diagnostic.supervise(join(dir, "missing-command"), [], {
            directory: dir,
            timeoutMs: 1000,
        });
        const result = await child.done;
        assert.equal(result.error.code, "ENOENT");
        assert.equal(result.error.name, "Error");
        assert.equal(
            diagnostic.classifyTermination(result, {}, false),
            "infrastructure-error",
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("hard child deadline and hosted-only entry point are enforced", async () => {
    const dir = directory();
    try {
        const child = diagnostic.supervise(
            process.execPath,
            ["-e", "setInterval(()=>{},1000)"],
            {
                directory: join(dir, "deadline"),
                timeoutMs: 120,
            },
        );
        const termination = await child.done;
        assert.equal(termination.reason, "deadline");
        assert.throws(() => process.kill(termination.pid, 0), {
            code: "ESRCH",
        });
        const guard = await diagnostic.supervise(
            process.execPath,
            ["scripts/http-crash.mjs"],
            {
                directory: join(dir, "guard"),
                timeoutMs: 3000,
                env: {
                    ...process.env,
                    GITHUB_ACTIONS: "false",
                    RUNNER_ENVIRONMENT: "self-hosted",
                },
            },
        ).done;
        assert.equal(guard.code, 1);
        assert.match(
            readFileSync(join(dir, "guard", "stderr.log"), "utf8"),
            /require GitHub-hosted Windows/,
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
