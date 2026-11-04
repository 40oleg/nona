import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { join } from "node:path";

// Pure imports only. Never import a compiler-facing test or execute runTrial.
const api = await import(
    pathToFileURL(resolve("scripts/http-crash-current-policy.mjs")).href
).catch((e) => {
    if (e.code === "ERR_MODULE_NOT_FOUND") return {};
    throw e;
});
const entry = await import(
    pathToFileURL(resolve("scripts/http-crash-current.mjs")).href
).catch((e) => {
    if (e.code === "ERR_MODULE_NOT_FOUND") return {};
    throw e;
});
const head = "a".repeat(40);
const env = {
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "40oleg/nona",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_SHA: head,
    GITHUB_WORKFLOW_SHA: head,
    GITHUB_WORKFLOW_REF:
        "40oleg/nona/.github/workflows/native-platforms.yml@refs/heads/issue-602-startup-current",
    GITHUB_REF: "refs/heads/issue-602-startup-current",
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "2",
    RUNNER_ENVIRONMENT: "github-hosted",
    RUNNER_OS: "Windows",
    RUNNER_NAME: "hosted",
    ImageOS: "win25",
    ImageVersion: "20261101.1",
    HTTP602_MODE: "http602-current",
    HTTP602_EXPECTED_SHA: head,
};

test("current guard requires exact candidate, workflow, ref and hosted Windows Node identity", () => {
    assert.equal(typeof api.currentAllowed, "function");
    for (const ImageOS of ["win25", "win25-vs2026"])
        assert.equal(
            api.currentAllowed(
                { ...env, ImageOS },
                head,
                "win32",
                "x64",
                "v26.9.0",
            ),
            true,
            ImageOS,
        );
    for (const [key, value] of Object.entries({
        GITHUB_ACTIONS: "false",
        GITHUB_REPOSITORY: "fork/nona",
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_SHA: "b".repeat(40),
        GITHUB_WORKFLOW_SHA: "b".repeat(40),
        GITHUB_WORKFLOW_REF: env.GITHUB_WORKFLOW_REF.replace(
            "current",
            "other",
        ),
        GITHUB_REF: "refs/heads/main",
        GITHUB_RUN_ID: "",
        GITHUB_RUN_ATTEMPT: "0",
        RUNNER_ENVIRONMENT: "self-hosted",
        RUNNER_OS: "Linux",
        RUNNER_NAME: "",
        ImageOS: "win22",
        ImageVersion: "",
        HTTP602_MODE: "full",
        HTTP602_EXPECTED_SHA: "b".repeat(40),
    }))
        assert.equal(
            api.currentAllowed(
                { ...env, [key]: value },
                head,
                "win32",
                "x64",
                "v26.9.0",
            ),
            false,
            key,
        );
    for (const [platform, arch, node] of [
        ["linux", "x64", "v26.9.0"],
        ["win32", "arm64", "v26.9.0"],
        ["win32", "x64", "v26.10.0"],
    ])
        assert.equal(
            api.currentAllowed(env, head, platform, arch, node),
            false,
        );
    assert.equal(
        api.currentAllowed(env, "b".repeat(40), "win32", "x64", "v26.9.0"),
        false,
    );
    for (const ImageOS of [
        "win22",
        "ubuntu24",
        "macos15",
        "win25-vs2027",
        "win25-unknown",
        "win25-vs2026-extra",
        "",
        " win25",
        "win25\n",
        null,
        25,
        ["win25"],
    ])
        assert.equal(
            api.currentAllowed(
                { ...env, ImageOS },
                head,
                "win32",
                "x64",
                "v26.9.0",
            ),
            false,
            JSON.stringify(ImageOS),
        );
    for (const ImageOS of ["win25", "win25-vs2026"])
        assert.equal(
            api.currentAllowed(
                { ...env, ImageOS, RUNNER_ENVIRONMENT: "self-hosted" },
                head,
                "win32",
                "x64",
                "v26.9.0",
            ),
            false,
        );
});

test("current check result reports every admission mismatch without weakening the boolean API", () => {
    const input = {
        ...env,
        ImageOS: "win25-unknown",
        ImageVersion: "",
        RUNNER_ENVIRONMENT: "self-hosted",
    };
    const result = api.currentCheckResult(
        input,
        head,
        "win32",
        "x64",
        "v26.9.0",
    );
    assert.equal(result.allowed, false);
    assert.deepEqual(result.failedConditions, [
        "runnerEnvironment",
        "image",
        "imageVersion",
    ]);
    assert.equal(result.checks.runnerEnvironment, false);
    assert.equal(result.checks.image, false);
    assert.equal(result.checks.imageVersion, false);
    assert.ok(
        Object.values(result.checks).every(
            (value) => typeof value === "boolean",
        ),
    );
    assert.equal(
        api.currentAllowed(input, head, "win32", "x64", "v26.9.0"),
        result.allowed,
    );
});

// Execute only verification code with memory-only filesystem and Git boundaries.
function verificationFixture(overrides = {}, checkout = head, failIo = "") {
    const text = readFileSync("scripts/http-crash-current.mjs", "utf8");
    const source = text.slice(
        text.indexOf("export function verifyCurrent("),
        text.indexOf("async function main("),
    );
    const files = new Map<string, any>();
    const calls: string[] = [];
    const consoleErrors: string[] = [];
    const input = new Proxy(
        {
            ...env,
            ...overrides,
            GH_TOKEN: "credential-sentinel",
            NODE_OPTIONS: "injection-sentinel",
        },
        {
            ownKeys() {
                throw new Error("Environment enumeration forbidden");
            },
        },
    );
    const context = {
        assert,
        currentCheckResult: (...args: any[]) => api.currentCheckResult(...args),
        currentAllowed: api.currentAllowed,
        process: {
            env: input,
            platform: "win32",
            arch: "x64",
            version: "v26.9.0",
            execPath: "memory-node.exe",
            argv: ["memory-node.exe", "memory-current.mjs", "--verify"],
            exitCode: 0,
        },
        join,
        resolve,
        pathToFileURL,
        console: {
            error: (message: any) => consoleErrors.push(String(message)),
        },
        mkdirSync(file: string) {
            calls.push("mkdir");
            assert.equal(file, resolve("work", "http602-current"));
            if (failIo === "mkdir") throw new Error("Admission mkdir failed");
        },
        save(file: string, value: any) {
            calls.push("receipt");
            if (failIo === "write") throw new Error("Admission write failed");
            files.set(file, JSON.parse(JSON.stringify(value)));
        },
        execFileSync(command: string, args: string[]) {
            calls.push("git");
            assert.ok(
                files.has(resolve("work", "http602-current", "admission.json")),
                "receipt must precede Git",
            );
            assert.equal(command, "git");
            assert.equal(args[0], "rev-parse");
            assert.ok(["HEAD", "HEAD^{tree}"].includes(args[1]!));
            return args[1] === "HEAD" ? checkout : "c".repeat(40);
        },
        readFileSync(file: string) {
            calls.push("read");
            assert.ok(
                [
                    ".github/workflows/native-platforms.yml",
                    "memory-node.exe",
                ].includes(file),
            );
            return Buffer.from("inert identity bytes");
        },
        hash: (bytes: any) => createHash("sha256").update(bytes).digest("hex"),
        sourceCommit: api.sourceCommit,
        driverSha256: api.driverSha256,
        serverSha256: api.serverSha256,
        controlledReferenceSha256: api.controlledReferenceSha256,
    };
    const verify = runInNewContext(
        source.replace("export function", "function") + "\nverifyCurrent",
        context,
    );
    const runCli = () =>
        runInNewContext(
            "(async () => {\n" +
                text
                    .slice(text.indexOf("export function verifyCurrent("))
                    .replace("export function", "function")
                    .replace(
                        "import.meta.url",
                        JSON.stringify(
                            pathToFileURL(resolve("memory-current.mjs")).href,
                        ),
                    ) +
                "\n})()",
            context,
        );
    return {
        verify: () => verify(input),
        runCli,
        process: context.process,
        consoleErrors,
        files,
        calls,
    };
}

test("early rejection retains a small whitelisted receipt before any Git or input reads", () => {
    for (const ImageOS of ["win25-unknown", "win25-vs2026"]) {
        const x = verificationFixture({
            ImageOS,
            RUNNER_ENVIRONMENT: "self-hosted",
            ImageVersion: "",
        });
        assert.throws(x.verify, /provenance/);
        assert.deepEqual(x.calls, ["mkdir", "receipt"]);
        const receipt = x.files.get(
            resolve("work", "http602-current", "admission.json"),
        );
        assert.equal(receipt.phase, "environment");
        assert.equal(receipt.allowed, false);
        assert.deepEqual(
            receipt.failedConditions,
            ImageOS === "win25-vs2026"
                ? ["runnerEnvironment", "imageVersion"]
                : ["runnerEnvironment", "image", "imageVersion"],
        );
        assert.equal(receipt.identity.image, ImageOS);
        assert.deepEqual(
            Object.keys(receipt.identity).sort(),
            [
                "repository",
                "event",
                "mode",
                "ref",
                "head",
                "sha",
                "expectedSha",
                "workflowSha",
                "workflowRef",
                "run",
                "attempt",
                "runner",
                "environment",
                "runnerOs",
                "image",
                "imageVersion",
                "platform",
                "arch",
                "node",
            ].sort(),
        );
        const serialized = JSON.stringify(receipt);
        assert.ok(serialized.length < 4096);
        assert.doesNotMatch(
            serialized,
            /credential-sentinel|injection-sentinel|GH_TOKEN|NODE_OPTIONS/,
        );
    }
});

test("checkout mismatch updates the receipt and remains fail closed before origin input reads", () => {
    const x = verificationFixture({ ImageOS: "win25-vs2026" }, "b".repeat(40));
    assert.throws(x.verify, /provenance/);
    assert.deepEqual(x.calls, ["mkdir", "receipt", "git", "git", "receipt"]);
    const receipt = x.files.get(
        resolve("work", "http602-current", "admission.json"),
    );
    assert.equal(receipt.phase, "checkout");
    assert.deepEqual(receipt.failedConditions, [
        "checkoutSha",
        "expectedSha",
        "workflowSha",
    ]);
    assert.equal(receipt.identity.head, "b".repeat(40));
});

test("verification preserves each actual image and stable origin across repeated admission", () => {
    for (const ImageOS of ["win25", "win25-vs2026"]) {
        const x = verificationFixture({ ImageOS });
        const first = x.verify();
        assert.deepEqual(x.verify(), first);
        assert.equal(first.image, ImageOS);
        assert.equal(first.imageVersion, "20261101.1");
        assert.equal(first.head, head);
        assert.equal(first.tree, "c".repeat(40));
        assert.equal(
            first.serverSha256,
            "3bae7410ac2d9afcb9a9e1431919a2aa5b5ca352db578769810a24f0ac718f60",
        );
        assert.equal(
            first.controlledReferenceSha256,
            "093f68880e37773b402b1e2390eaf5fc2dfe58b02d348c2d93cd51f0e69f283b",
        );
        assert.equal(first.timestamp, undefined);
        assert.equal(first.at, undefined);
        const receipt = x.files.get(
            resolve("work", "http602-current", "admission.json"),
        );
        assert.equal(receipt.allowed, true);
        assert.deepEqual(receipt.failedConditions, []);
        assert.ok(
            Object.values(receipt.checks).every((value) => value === true),
        );
    }
});

test("admission receipt IO failure cannot proceed to Git or origin input reads", () => {
    for (const failIo of ["mkdir", "write"]) {
        const x = verificationFixture({}, head, failIo);
        assert.throws(x.verify, /Admission .* failed/);
        assert.equal(x.calls.includes("git"), false);
        assert.equal(x.calls.includes("read"), false);
    }
});

test("admission receipt bounds malformed identity values without enumerating the environment", () => {
    const x = verificationFixture({
        ImageOS: "win25\n",
        RUNNER_NAME: "x".repeat(40000),
        ImageVersion: { credential: "credential-sentinel" },
    });
    assert.throws(x.verify, /provenance/);
    const receipt = x.files.get(
        resolve("work", "http602-current", "admission.json"),
    );
    assert.equal(receipt.identity.image, null);
    assert.equal(receipt.identity.runner, null);
    assert.equal(receipt.identity.imageVersion, null);
    assert.deepEqual(receipt.failedConditions, ["image", "imageVersion"]);
    assert.ok(JSON.stringify(receipt).length < 4096);
    assert.doesNotMatch(JSON.stringify(receipt), /credential-sentinel/);
});

test("early admission and receipt IO failures retain the CLI console error and failing exit", async () => {
    for (const failIo of ["", "mkdir", "write"]) {
        const x = verificationFixture(
            { ImageOS: "win25-unknown" },
            head,
            failIo,
        );
        await x.runCli();
        assert.equal(x.process.exitCode, 1);
        assert.equal(x.consoleErrors.length, 1);
        assert.match(
            x.consoleErrors[0]!,
            failIo ? /Admission .* failed/ : /provenance required: image/,
        );
        assert.equal(x.calls.includes("git"), false);
        assert.equal(x.calls.includes("read"), false);
    }
});

function projected(state = "destroy-queued", runtime = "nona", gc = "stress") {
    const spec = {
        id: `current-${state}-${runtime === "node" ? "node" : `native-${gc}`}`,
        fixture: "controlled",
        route: "/big",
        listeners: "original",
        concurrency: 1,
        chunkBytes: 65536,
        chunks: 16,
        state,
        runtime,
        gc,
    };
    const termination = {
        pid: 99,
        code: null,
        signal: "SIGKILL",
        hex: null,
        error: null,
        reason: "observation-complete",
        elapsedMs: 8600,
        dropped: { stdout: 0, stderr: 0 },
    };
    const settings = {
        event: "settings",
        keepAliveTimeout: "5000",
        keepAliveTimeoutBuffer: "1000",
        timeout: "0",
        requestTimeout: "300000",
        headersTimeout: "60000",
    };
    const report = {
        ...spec,
        status: "finished",
        pid: 99,
        port: 1234,
        settings,
        timeoutWindowCovered: true,
        limits: {
            startupMs: 60000,
            observationMs: 8500,
            rounds: 1,
            hardMs: 90000,
        },
        workload: {
            requests: 1,
            completed: 0,
            wrongOutput: 0,
            errors: state === "destroy-queued" ? 1 : 0,
            hangs: 0,
        },
        termination,
        verdict:
            state === "destroy-queued" ? "client-error" : "observed-no-fault",
    };
    const kinds = [
        "connection",
        "request",
        "queued",
        state === "destroy-queued" ? "destroy" : "end",
        "socket-close",
    ];
    const states = kinds.map((event, i) => ({
        event,
        socket: 1,
        sequence: i + 1,
        ms:
            state === "queued-timeout" && event === "socket-close"
                ? 1030
                : i * 10,
        destroyed: event === "socket-close",
        ended: event === "end",
        socketQueued: i >= 2 ? 123 : 0,
        responseQueued: 0,
        ...(event === "end"
            ? { timeout: 1000, timeoutSource: "socket.timeout" }
            : {}),
    }));
    if (state === "destroy-queued" && runtime === "node")
        states.push({
            event: "request-error",
            socket: 1,
            sequence: 6,
            ms: 41,
            destroyed: true,
            ended: false,
            socketQueued: 0,
            responseQueued: 0,
            error: { code: "ECONNRESET", message: "aborted" },
        } as any);
    const client: any[] = [
        { event: "spawn", pid: 99, ms: 0 },
        { event: "request", client: 0, round: 0, ms: 1 },
        { event: "client-socket", client: 0, socket: 1, ms: 2 },
    ];
    if (state === "queued-timeout")
        client.splice(
            1,
            2,
            { event: "client-socket", client: 0, socket: 1, ms: 1 },
            { event: "paused-peer", client: 0, ms: 2 },
        );
    else
        client.push({
            event: "request-error",
            client: 0,
            round: 0,
            name: "Error",
            code: "ECONNRESET",
            message: "socket hang up",
            ms: 3,
        });
    client.push(
        {
            event: "client-close",
            client: 0,
            socket: 1,
            hadError: false,
            ms: state === "queued-timeout" ? 1100 : 1001,
        },
        { event: "termination", ...termination, ms: 8601 },
    );
    return {
        spec,
        report,
        raw: {
            trial: JSON.stringify(report) + "\n",
            termination: JSON.stringify(termination) + "\n",
            stdout:
                [
                    `ready 1234`,
                    ...states.map((e) => "diagnostic " + JSON.stringify(e)),
                    "diagnostic " + JSON.stringify(settings),
                ].join("\n") + "\n",
            stderr: "",
            client: client.map((e) => JSON.stringify(e)).join("\n") + "\n",
        },
    };
}

test("projection accepts only complete positive pending-close evidence including strict stress resets", () => {
    assert.equal(typeof api.projectionAcceptance, "function");
    for (const state of ["destroy-queued", "queued-timeout"])
        for (const [runtime, gc] of [
            ["node", "n/a"],
            ["nona", "off"],
            ["nona", "stress"],
        ]) {
            const { spec, report, raw } = projected(state, runtime, gc);
            const result = api.projectionAcceptance(spec, report, raw);
            assert.equal(result.accepted, true, JSON.stringify(result));
            assert.equal(result.unsentCloseObserved, true);
        }
});

test("projection refuses zero queues, absent/mismatched/late closes, faults, wrong body and unexplained stress errors", () => {
    assert.equal(typeof api.projectionAcceptance, "function");
    const mutations = [
        (x: any) => {
            x.raw.stdout = x.raw.stdout.replaceAll(
                '"socketQueued":123',
                '"socketQueued":0',
            );
        },
        (x: any) => {
            x.raw.stdout = x.raw.stdout
                .split("\n")
                .filter((l: string) => !l.includes('"event":"socket-close"'))
                .join("\n");
        },
        (x: any) => {
            x.raw.stdout = x.raw.stdout.replace(
                '"event":"socket-close","socket":1',
                '"event":"socket-close","socket":2',
            );
        },
        (x: any) => {
            x.raw.client = x.raw.client.replace('"ms":1001', '"ms":8501');
        },
        (x: any) => {
            x.report.termination.code = 0xc0000005;
            x.report.verdict = "native-fault";
        },
        (x: any) => {
            x.report.workload.wrongOutput = 1;
        },
        (x: any) => {
            x.report.workload.errors = 2;
        },
        (x: any) => {
            x.raw.client = x.raw.client.replace("ECONNRESET", "ETIMEDOUT");
        },
        (x: any) => {
            x.raw.stderr = "unexpected error\n";
        },
        (x: any) => {
            x.report.termination.reason = "deadline";
        },
        (x: any) => {
            x.report.timeoutWindowCovered = false;
        },
        (x: any) => {
            x.raw.stdout = x.raw.stdout.slice(0, -1);
        },
        (x: any) => {
            x.raw.client = x.raw.client
                .split("\n")
                .filter((l: string) => !l.includes('"event":"client-close"'))
                .join("\n");
        },
        (x: any) => {
            x.report.termination.dropped.stdout = 1;
        },
    ];
    for (const mutate of mutations) {
        const x = projected();
        mutate(x);
        // Keep duplicate raw receipts consistent so each semantic mutation reaches its gate.
        x.raw.trial = JSON.stringify(x.report) + "\n";
        x.raw.termination = JSON.stringify(x.report.termination) + "\n";
        const result = api.projectionAcceptance(x.spec, x.report, x.raw);
        assert.equal(result.accepted, false, mutate.toString());
        assert.equal(result.unsentCloseObserved, false);
    }
    const drained = projected("queued-timeout");
    drained.raw.stdout = drained.raw.stdout.replace(
        /("event":"socket-close"[^\n]*"socketQueued":)123/,
        "$10",
    );
    assert.equal(
        api.projectionAcceptance(drained.spec, drained.report, drained.raw)
            .unsentCloseObserved,
        false,
        "queue at write is insufficient after it drained",
    );
    const premature = projected("queued-timeout");
    premature.raw.stdout = premature.raw.stdout.replace('"ms":1030', '"ms":40');
    assert.equal(
        api.projectionAcceptance(
            premature.spec,
            premature.report,
            premature.raw,
        ).accepted,
        false,
        "closure before the actual queued timeout window is incomplete evidence",
    );
});

test("current workflow selects only its bounded hosted job and cannot cancel other modes", () => {
    const text = readFileSync(".github/workflows/native-platforms.yml", "utf8");
    assert.match(
        text,
        /options: \[full, startup-602, env-602, http602-current\]/,
    );
    const jobs = [
        ...text.matchAll(
            /^    ([\w-]+):\r?\n([\s\S]*?)(?=^    [\w-]+:|$(?![\s\S]))/gm,
        ),
    ].filter((m) => /^        if:/m.test(m[2]!));
    function selected(change: any = {}) {
        const github = {
            repository: "40oleg/nona",
            event_name: "workflow_dispatch",
            ref: env.GITHUB_REF,
            sha: head,
            workflow_sha: head,
            workflow_ref: env.GITHUB_WORKFLOW_REF,
            event: { pull_request: { labels: [] } },
            ...change,
        };
        return jobs
            .filter((m) =>
                runInNewContext(
                    m[2]!
                        .match(/^        if: (.+)$/m)![1]!
                        .replace("labels.*.name", "labels.map(l => l.name)"),
                    {
                        inputs: {
                            diagnostic_mode: "http602-current",
                            diagnostic_sha: head,
                        },
                        github,
                        startsWith: (s: string, p: string) => s.startsWith(p),
                        format: (s: string, a: string) => s.replace("{0}", a),
                        contains: (a: any[], b: any) => a.includes(b),
                    },
                ),
            )
            .map((m) => m[1]);
    }
    assert.deepEqual(selected(), ["http602-current"]);
    for (const bad of [
        { repository: "fork/nona" },
        { event_name: "push" },
        { ref: "refs/heads/main" },
        { sha: "b".repeat(40) },
        { workflow_sha: "b".repeat(40) },
        { workflow_ref: env.GITHUB_WORKFLOW_REF.replace("current", "foreign") },
    ])
        assert.deepEqual(selected(bad), []);
    const group = text.match(/^    group: (.+)$/m)![1]!;
    const groupFor = (mode: string, run = 123, attempt = 1) =>
        runInNewContext(group.replace(/^\$\{\{|\}\}$/g, ""), {
            inputs: { diagnostic_mode: mode },
            github: {
                run_id: run,
                run_attempt: attempt,
                event_name: "workflow_dispatch",
                ref: env.GITHUB_REF,
            },
            format: (s: string, ...v: any[]) =>
                s.replace(/\{(\d+)\}/g, (_, n) => v[Number(n)]),
        });
    for (const mode of ["full", "startup-602", "env-602"])
        assert.notEqual(groupFor("http602-current"), groupFor(mode));
    assert.notEqual(
        groupFor("http602-current"),
        groupFor("http602-current", 124),
    );
    assert.notEqual(
        groupFor("http602-current"),
        groupFor("http602-current", 123, 2),
    );
    const body = jobs.find((m) => m[1] === "http602-current")![2]!;
    assert.match(body, /runs-on: windows-2025/);
    assert.match(body, /timeout-minutes: 35/);
    assert.match(body, /node-version: "26.9.0"/);
    assert.match(body, /if: always\(\)/);
    assert.match(body, /path: work\/http602-current\//);
    assert.ok(body.indexOf("--verify") < body.indexOf("npm ci"));
    assert.ok(body.includes("ab5ea083d793e0a665fde8b0a4b33bc1fa67208e"));
});

// Only original pressure byte pins/children are doubled; the controlled reference
// uses its actual frozen bytes. These controls do not certify driver execution.
function orchestrationFixture(failure = "") {
    const files = new Map<string, any>();
    const root = resolve("work/current-pressure602-v6/virtual");
    const out = join(root, "work/http602-current");
    const source = join(out, "soak-source/scripts/http-soak.mjs");
    const fixture = join(out, "soak-source/bench/http/soak-server.mjs");
    const controlledReference = join(
        root,
        "tests/fixtures/http-crash/soak-server.mjs",
    );
    const digest = (bytes: any) =>
        createHash("sha256").update(bytes).digest("hex");
    const hash = (bytes: any) =>
        String(bytes) === "inert pinned driver"
            ? api.driverSha256
            : String(bytes) === "inert pinned server"
              ? api.serverSha256
              : digest(bytes);
    const calls: any[] = [];
    files.set(source, Buffer.from("inert pinned driver"));
    files.set(fixture, Buffer.from("inert pinned server"));
    files.set(
        controlledReference,
        readFileSync("tests/fixtures/http-crash/soak-server.mjs"),
    );
    files.set(join(root, "dist/src/compiler.js"), "inert compiler");
    const origin = {
        head,
        tree: "b".repeat(40),
        workflowSha: head,
        workflowRef: env.GITHUB_WORKFLOW_REF,
        run: "123",
        attempt: "2",
        runner: "hosted",
        environment: "github-hosted",
        node: "v26.9.0",
        nodeExecutable: "/mock/node.exe",
        nodeExecutableSha256: "c".repeat(64),
    };
    const io = {
        read(file: string, encoding?: string) {
            assert.ok(files.has(file), `missing virtual ${file}`);
            const value = files.get(file);
            return encoding ? String(value) : Buffer.from(value);
        },
        write(file: string, bytes: any) {
            files.set(file, bytes);
        },
        mkdir() {},
        hash,
        serverSource: () => "inert controlled source",
        async capture(command: string, args: string[], options: any) {
            calls.push({ command, args, options });
            const t = {
                pid: 98,
                closed: true,
                code: 0,
                signal: null,
                reason: null,
                error: null,
                dropped: { stdout: 0, stderr: 0 },
            };
            if (args[0]?.endsWith("http-soak-check.mjs")) {
                const runtime = options.env.NONA_SOAK_RUNTIME;
                const dir = join(out, "pressure", runtime);
                const receipt: any = {
                    pass: true,
                    correctnessSmoke: { pass: true },
                    restoration: { pass: true },
                    identity: {
                        commit: head,
                        run: "123",
                        attempt: "2",
                        runner: "hosted",
                        environment: "github-hosted",
                        node: "v26.9.0",
                    },
                    profile: "http602-current",
                    runtime,
                    originalHarnessSha256: api.driverSha256,
                    serverSourceSha256: api.serverSha256,
                    executedHarnessSha256: digest("executed driver"),
                    nodeExecutable: origin.nodeExecutable,
                    nodeExecutableSha256: origin.nodeExecutableSha256,
                    settings: {
                        minutes: 5,
                        warmupMinutes: 1,
                        sampleSeconds: 10,
                        mix: "big=1",
                        connections: 32,
                    },
                    build:
                        runtime === "node"
                            ? { skipped: true }
                            : {
                                  status: 0,
                                  signal: null,
                                  args: ["builder", "source", "image", "off"],
                              },
                    binarySha256: "d".repeat(64),
                    compilerCommit: head,
                    compilerEntrySha256: hash("inert compiler"),
                };
                if (runtime === "native-off" && failure === "native") {
                    receipt.pass = false;
                    receipt.failure = { message: "actual correctness failure" };
                }
                files.set(
                    join(dir, "verification.json"),
                    JSON.stringify(receipt),
                );
                if (
                    runtime === "native-off" &&
                    [
                        "restore",
                        "foreign",
                        "missing",
                        "unclosed",
                        "held-pipes",
                    ].includes(failure)
                ) {
                    files.set(
                        source,
                        failure === "foreign"
                            ? "foreign driver"
                            : "executed driver",
                    );
                    files.set(
                        join(dir, "http-soak.original.mjs"),
                        "inert pinned driver",
                    );
                    files.set(
                        join(dir, "http-soak.patch.json"),
                        JSON.stringify({
                            originalSha256: api.driverSha256,
                            executedSha256: digest("executed driver"),
                        }),
                    );
                    receipt.pass = false;
                    receipt.restoration = undefined;
                    files.set(
                        join(dir, "verification.json"),
                        JSON.stringify(receipt),
                    );
                }
                if (runtime === "native-off" && failure === "missing")
                    throw new Error("capture IO failed before receipt");
                if (
                    runtime === "native-off" &&
                    ["unclosed", "held-pipes"].includes(failure)
                )
                    return {
                        ...t,
                        closed: failure === "unclosed" ? undefined : false,
                        reason: "deadline",
                        treeCleanup: { pass: true },
                    };
            } else {
                files.set(args[2]!, "native image");
                if (failure === "build-missing") return undefined;
            }
            files.set(join(options.directory, "stderr.log"), "");
            return t;
        },
        async runTrial(spec: any, options: any) {
            calls.push({ spec, options });
            const p = projected(spec.state, spec.runtime, spec.gc);
            const report = { ...p.report, ...options.metadata };
            if (failure === "projection-missing")
                report.termination = null as any;
            if (failure === "settings" && spec.runtime === "nona") {
                report.settings = {
                    ...report.settings,
                    keepAliveTimeout: "1000",
                };
                p.raw.stdout = p.raw.stdout.replace(
                    '"keepAliveTimeout":"5000"',
                    '"keepAliveTimeout":"1000"',
                );
            }
            if (
                (failure === "stress" && spec.gc === "stress") ||
                (failure === "node-projection" && spec.runtime === "node")
            ) {
                report.termination = {
                    ...report.termination,
                    code: 0xc0000005,
                };
                report.verdict = "native-fault";
            }
            files.set(
                join(options.directory, "trial.json"),
                JSON.stringify(report) + "\n",
            );
            files.set(
                join(options.directory, "termination.json"),
                JSON.stringify(report.termination) + "\n",
            );
            files.set(join(options.directory, "stdout.log"), p.raw.stdout);
            files.set(join(options.directory, "stderr.log"), p.raw.stderr);
            files.set(join(options.directory, "client.jsonl"), p.raw.client);
            return report;
        },
    };
    return {
        files,
        root,
        out,
        source,
        fixture,
        controlledReference,
        origin,
        io,
        calls,
    };
}

test("current preflight accepts distinct pinned pressure and controlled reference inputs", async () => {
    const x = orchestrationFixture();
    assert.notDeepEqual(
        x.files.get(x.fixture),
        x.files.get(x.controlledReference),
    );
    const summary = await entry.runCurrent(
        { root: x.root, origin: x.origin, env },
        x.io,
    );
    assert.equal(summary.diagnosticComplete, true, JSON.stringify(summary));
    assert.equal(
        summary.serverSha256,
        "3bae7410ac2d9afcb9a9e1431919a2aa5b5ca352db578769810a24f0ac718f60",
    );
    assert.equal(
        summary.controlledReferenceSha256,
        "093f68880e37773b402b1e2390eaf5fc2dfe58b02d348c2d93cd51f0e69f283b",
    );
    assert.equal(summary.pressure.length, 2);
    assert.equal(summary.projection.length, 6);
});

for (const domain of ["pressure", "controlled"])
    for (const mutation of ["append", "wrong-domain"])
        test(`current preflight refuses ${domain} ${mutation} bytes before any child`, async () => {
            const x = orchestrationFixture();
            const target =
                domain === "pressure" ? x.fixture : x.controlledReference;
            const other =
                domain === "pressure" ? x.controlledReference : x.fixture;
            x.files.set(
                target,
                mutation === "append"
                    ? Buffer.concat([x.files.get(target), Buffer.from("\n")])
                    : x.files.get(other),
            );
            const summary = await entry.runCurrent(
                { root: x.root, origin: x.origin, env },
                x.io,
            );
            assert.equal(summary.diagnosticComplete, false);
            assert.match(
                summary.failure?.message ?? "",
                domain === "pressure"
                    ? /Frozen original server changed/
                    : /Controlled source reference changed/,
            );
            assert.equal(x.calls.length, 0);
            assert.deepEqual(summary.pressure, []);
            assert.deepEqual(summary.projection, []);
            assert.ok(x.files.has(join(x.out, "summary.json")));
        });

test("current orchestrator keeps both five-minute arms and six projected raw results independent on failure", async () => {
    assert.equal(typeof entry.runCurrent, "function");
    for (const failure of [
        "",
        "native",
        "stress",
        "restore",
        "foreign",
        "node-projection",
        "settings",
    ]) {
        const x = orchestrationFixture(failure);
        const summary = await entry.runCurrent(
            {
                root: x.root,
                origin: x.origin,
                env: { ...env, GH_TOKEN: "secret", NODE_OPTIONS: "injected" },
            },
            x.io,
        );
        assert.equal(
            summary.diagnosticComplete,
            failure === "",
            JSON.stringify(summary),
        );
        assert.equal(summary.productAcceptance, false);
        assert.equal(summary.pressure.length, 2);
        assert.equal(summary.projection.length, 6);
        for (const p of summary.projection)
            assert.match(
                p.spec.id,
                /^[a-z0-9-]+$/,
                "each projected raw result must stay under one fixed artifact directory",
            );
        const wrappers = x.calls.filter((c) =>
            c.args?.[0]?.endsWith("http-soak-check.mjs"),
        );
        assert.deepEqual(
            wrappers.map((c) => c.options.env.NONA_SOAK_RUNTIME),
            ["native-off", "node"],
        );
        for (const call of wrappers) {
            assert.equal(call.options.timeoutMs, 540000);
            assert.equal(call.options.env.NONA_SOAK_PROFILE, "http602-current");
            assert.equal(call.options.env.GH_TOKEN, undefined);
            assert.equal(call.options.env.NODE_OPTIONS, undefined);
        }
        assert.equal(x.calls.filter((c) => c.spec).length, 6);
        assert.deepEqual(
            x.calls
                .filter((c) => c.args?.[0]?.endsWith("http-crash-build.mjs"))
                .map((c) => c.args[3]),
            ["off", "stress"],
        );
        assert.equal(
            String(x.files.get(x.source)),
            failure === "foreign" ? "foreign driver" : "inert pinned driver",
        );
        if (failure === "native")
            assert.equal(summary.pressure[1].accepted, true);
        if (failure === "stress")
            assert.ok(
                summary.projection
                    .filter((p: any) => p.spec.gc === "stress")
                    .every((p: any) => !p.acceptance.accepted),
            );
        if (failure === "node-projection")
            assert.ok(
                summary.projection.every(
                    (p: any) => !p.acceptance.unsentCloseObserved,
                ),
                "a failed matching Node control must prevent a final unsent-close label",
            );
        if (failure === "settings")
            assert.ok(
                summary.projection
                    .filter((p: any) => p.spec.runtime === "nona")
                    .every((p: any) => !p.acceptance.accepted),
                "native settings must match the same-host control",
            );
        assert.ok(x.files.has(join(x.out, "summary.json")));
    }
});

test("unknown wrapper or compiler quiescence prevents restoration and every next workload", async () => {
    for (const failure of [
        "missing",
        "unclosed",
        "held-pipes",
        "build-missing",
        "projection-missing",
    ]) {
        const x = orchestrationFixture(failure);
        const summary = await entry.runCurrent(
            { root: x.root, origin: x.origin, env },
            x.io,
        );
        assert.equal(summary.diagnosticComplete, false);
        assert.match(summary.failure?.message ?? "", /quiescence|cleanup/i);
        assert.equal(
            x.calls.length,
            failure === "projection-missing"
                ? 5
                : failure === "build-missing"
                  ? 3
                  : 1,
        );
        assert.equal(
            summary.projection.length,
            failure === "projection-missing" ? 1 : 0,
        );
        if (!["build-missing", "projection-missing"].includes(failure)) {
            assert.equal(String(x.files.get(x.source)), "executed driver");
            assert.equal(summary.pressure[0].restoration.pass, false);
        }
    }
});

test("current orchestrator rejects wrong frozen pins before any child and retains failed summary", async () => {
    assert.equal(typeof entry.runCurrent, "function");
    const x = orchestrationFixture();
    x.files.set(x.source, "wrong source");
    const summary = await entry.runCurrent(
        { root: x.root, origin: x.origin, env },
        x.io,
    );
    assert.equal(summary.diagnosticComplete, false);
    assert.equal(x.calls.length, 0);
    assert.ok(x.files.has(join(x.out, "summary.json")));
});

for (const mode of [
    "deadline",
    "missing-close",
    "prelog",
    "append",
    "append-missing-close",
    "save",
    "save-missing-close",
    "abort",
    "exited-held-pipes",
    "stream-error",
])
    test(`bounded child owns cleanup and settles capture: ${mode}`, async () => {
        const text = readFileSync("scripts/http-crash-current.mjs", "utf8");
        const source = text.slice(
            text.indexOf("export function boundedChild("),
            text.indexOf("const nativeIo ="),
        );
        const closes = ![
            "missing-close",
            "append-missing-close",
            "save-missing-close",
            "exited-held-pipes",
        ].includes(mode);
        const files = new Map<string, any>(),
            timers = new Map<number, () => void>();
        const killed: any[] = [];
        let nextTimer = 0;
        let spawned = 0;
        const ioError = Object.assign(new Error(`IO ${mode}`), { code: "EIO" });
        const child: any = new EventEmitter();
        child.pid = 77;
        child.exitCode = null;
        child.signalCode = null;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdout.destroy = () => {};
        child.stderr.destroy = () => {};
        child.unref = () => {};
        child.kill = () => {
            if (closes) {
                child.signalCode = "SIGKILL";
            }
        };
        const fakeProcess = new EventEmitter();
        const capture = runInNewContext(
            source.replace("export function", "function") + "\nboundedChild",
            {
                spawn: () => {
                    spawned++;
                    return child;
                },
                spawnSync: (command: any, args: any, options: any) => {
                    killed.push({ command, args, options });
                    return {
                        status: 0,
                        signal: null,
                        stdout: "killed",
                        stderr: "",
                    };
                },
                mkdirSync() {},
                writeFileSync: (p: string, b: any) => {
                    if (mode === "prelog" && p.endsWith("stderr.log"))
                        throw ioError;
                    files.set(p, b);
                },
                appendFileSync: (p: string, b: any) => {
                    if (mode.startsWith("append")) throw ioError;
                    files.set(p, String(files.get(p) ?? "") + String(b));
                },
                save: (p: string, v: any) => {
                    if (mode.startsWith("save")) throw ioError;
                    files.set(p, v);
                },
                join,
                process: fakeProcess,
                Date,
                Promise,
                Buffer,
                assert,
                errorInfo: (e: any) => ({ message: e.message, code: e.code }),
                setTimeout: (f: () => void, ms: number) => {
                    timers.set(++nextTimer, f);
                    return nextTimer;
                },
                clearTimeout: (id: number) => timers.delete(id),
            },
        );
        const controller = new AbortController();
        const options = {
            directory: "memory",
            env: { SAFE: "yes" },
            timeoutMs: 540000,
            tree: true,
            signal: controller.signal,
        };
        if (mode === "prelog") {
            assert.throws(
                () => capture("node.exe", ["wrapper.mjs"], options),
                /IO prelog/,
            );
            assert.equal(
                spawned,
                0,
                "prelog failure must not leave a live child",
            );
            return;
        }
        const promise = capture("node.exe", ["wrapper.mjs"], options);
        assert.doesNotThrow(() =>
            child.stdout.emit("data", Buffer.from("partial stdout\n")),
        );
        assert.doesNotThrow(() =>
            child.stderr.emit("data", Buffer.from("raw stderr\n")),
        );
        if (mode === "stream-error") child.stderr.emit("error", ioError);
        else if (mode === "abort") controller.abort();
        else if (!mode.startsWith("append")) {
            if (mode === "exited-held-pipes") child.exitCode = 0;
            timers.get(1)!();
        }
        assert.deepEqual(
            killed.map((x) => [x.command, [...x.args]]),
            mode === "exited-held-pipes"
                ? []
                : [["taskkill", ["/PID", "77", "/T", "/F"]]],
        );
        if (closes)
            assert.doesNotThrow(() => child.emit("close", null, "SIGKILL"));
        if (!closes) {
            assert.ok(
                timers.size > 1,
                "missing-close cleanup needs a bounded fallback",
            );
            timers.get(2)!();
        }
        const receipt = await promise;
        assert.equal(receipt.closed, closes);
        assert.equal(
            receipt.reason,
            mode === "abort"
                ? "aborted"
                : mode.startsWith("append") || mode === "stream-error"
                  ? "io-error"
                  : "deadline",
        );
        assert.equal(receipt.cleanupError !== undefined, !closes);
        if (
            mode.startsWith("append") ||
            mode.startsWith("save") ||
            mode === "stream-error"
        ) {
            assert.equal(receipt.error.code, "EIO");
            assert.equal(receipt.error.message, `IO ${mode}`);
        }
        assert.equal(
            files.get(join("memory", "stdout.log")),
            mode.startsWith("append") ? "" : "partial stdout\n",
        );
        assert.equal(
            files.get(join("memory", "stderr.log")),
            mode.startsWith("append") ? "" : "raw stderr\n",
        );
        assert.equal(
            files.has(join("memory", "termination.json")),
            !mode.startsWith("save"),
        );
        assert.equal(fakeProcess.listenerCount("exit"), 0);
    });
