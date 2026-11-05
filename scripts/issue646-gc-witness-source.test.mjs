import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    readFileSync,
    readdirSync,
    existsSync,
    rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as witness from "./issue646-gc-witness.mjs";
import { loadCases } from "./native-gc-diagnosis-cases.mjs";

test("only this commit's support changes admit automatic execution", () => {
    assert.equal(
        witness.changedSupport([{ filename: "src/runtime/memory.ts" }]),
        false,
    );
    assert.equal(witness.changedSupport([{ filename: "README.md" }]), false);
    assert.equal(
        witness.changedSupport([
            { filename: "scripts/issue646-gc-witness.mjs", status: "modified" },
        ]),
        true,
    );
    assert.equal(
        witness.changedSupport([
            {
                filename: "elsewhere",
                previous_filename: "scripts/issue646-gc-witness.mjs",
                status: "renamed",
            },
        ]),
        false,
    );
    assert.throws(() => witness.changedSupport(null));
});

test("historical source, candidate head and changed overlay cannot be conflated", () => {
    const input = {
        historicalSource: "b78f81820ff19105ab85fb10773fab4353b3d8f5",
        candidateHead: "a".repeat(40),
        baselineMemory: "old",
        mainMemory: "old",
        publishedMemory: "old",
        baselineGC: "gc",
        mainGC: "gc",
        candidateGC: "gc",
        candidateMemory: "fused",
    };
    const identity = witness.overlayIdentity(input);
    assert.equal(identity.historicalSource, input.historicalSource);
    assert.equal(identity.candidateHead, input.candidateHead);
    assert.equal(identity.modifiedHistoricalTree, true);
    assert.notEqual(identity.beforeSha256, identity.overlaySha256);
    assert.throws(() =>
        witness.overlayIdentity({ ...input, candidateMemory: "old" }),
    );
    assert.throws(() =>
        witness.overlayIdentity({ ...input, mainMemory: "different" }),
    );
    assert.throws(() =>
        witness.overlayIdentity({ ...input, candidateGC: "different" }),
    );
    assert.throws(() =>
        witness.overlayIdentity({
            ...input,
            historicalSource: input.candidateHead,
        }),
    );
});

test("extracts the actual pinned origins/2 request, distinct oracle and original assertions", async () => {
    const root = mkdtempSync(join(tmpdir(), "gc-witness-metadata-"));
    try {
        for (const file of [
            "tests/http-agent.test.ts",
            "tests/helpers/http-agent-cases.ts",
            "tests/helpers/http-agent-policy.ts",
        ]) {
            const bytes = spawnSync("git", [
                "show",
                `b78f81820ff19105ab85fb10773fab4353b3d8f5:${file}`,
            ]);
            assert.equal(bytes.status, 0);
            mkdirSync(dirname(join(root, file)), { recursive: true });
            writeFileSync(join(root, file), bytes.stdout);
        }
        const [entry] = await loadCases(root, "http");
        const request = witness.originalRequest([entry]);
        assert.equal(request.kind, "modules");
        assert.equal(request.args[1], "main.mjs");
        assert.equal(request.args[2].gcStress, true);
        assert.equal(request.args[2].timeoutMs, undefined);
        assert.ok(
            request.args[0]["main.mjs"].startsWith(
                "function cleanupWatchdog(callback) { return undefined; }",
            ),
        );
        assert.ok(
            request.args[2].oracleSource.startsWith(
                "function cleanupWatchdog(callback) { return setTimeout(callback, 6000); }",
            ),
        );
        const stdout =
            "queued 2 2\nwoken 2 /hold0,/other1,/other2\ncomplete 2 /hold0,/hold1,/other1,/other2 4 peak 2\n";
        const result = {
            native: { status: 0, stdout, stderr: "" },
            oracleStatus: 0,
            oracle: stdout,
            oracleStderr: "",
        };
        entry.calls[0].result = result;
        assert.doesNotThrow(() => entry.replay());
        result.native.stderr = "unexpected";
        assert.throws(() => entry.replay());
        assert.throws(() => witness.originalRequest([]));
        assert.throws(() => witness.originalRequest([entry, entry]));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

const ok = () => ({ status: 0, signal: null, error: null });
const emptySha =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
function reports() {
    return {
        prerequisites: true,
        gc: {
            launcher: ok(),
            testsPassed: true,
            executions: [ok(), ok(), ok()],
        },
        http: {
            launcher: ok(),
            assertionsPassed: true,
            attempts: [
                {
                    kind: "native",
                    ...ok(),
                    timeout: 180000,
                    imageSha256: "a".repeat(64),
                    stdoutSha256: "b".repeat(64),
                    stderrSha256: emptySha,
                },
                {
                    kind: "node",
                    ...ok(),
                    timeout: 60000,
                    stdoutSha256: "b".repeat(64),
                    stderrSha256: emptySha,
                },
            ],
        },
    };
}
test("gates retain real attempt counts and independently reject missing or failed evidence", () => {
    assert.deepEqual(witness.gates(reports()), {
        gc: true,
        http: true,
        nativeAttempts: 1,
        nodeAttempts: 1,
    });
    for (const change of [
        (x) => {
            x.http = null;
        },
        (x) => {
            x.http.assertionsPassed = false;
        },
        (x) => {
            x.http.attempts.pop();
        },
        (x) => {
            x.http.attempts.push(x.http.attempts[0]);
        },
        (x) => {
            x.http.launcher.status = null;
        },
        (x) => {
            x.http.attempts[0].imageSha256 = null;
        },
        (x) => {
            x.http.attempts[0].timeout = 180001;
        },
        (x) => {
            x.http.attempts[1].stdoutSha256 = "c".repeat(64);
        },
        (x) => {
            x.http.attempts[1].stderrSha256 = "c".repeat(64);
        },
        (x) => {
            delete x.http.attempts[0].stdoutSha256;
            delete x.http.attempts[1].stdoutSha256;
        },
    ]) {
        const x = reports();
        change(x);
        assert.equal(witness.gates(x).http, false);
        assert.equal(witness.gates(x).gc, true);
    }
    const compileFailure = reports();
    compileFailure.http.attempts = [];
    assert.deepEqual(witness.gates(compileFailure), {
        gc: true,
        http: false,
        nativeAttempts: 0,
        nodeAttempts: 0,
    });
    for (const outcome of [
        { status: null },
        { signal: "SIGTERM" },
        { error: { code: "ETIMEDOUT" } },
        { status: 42 },
    ]) {
        const x = reports();
        Object.assign(x.http.attempts[0], outcome);
        assert.equal(witness.gates(x).http, false);
        const y = reports();
        Object.assign(y.gc.executions[0], outcome);
        assert.equal(witness.gates(y).gc, false);
    }
    for (const change of [
        (x) => {
            x.gc = null;
        },
        (x) => {
            x.gc.testsPassed = false;
        },
        (x) => {
            x.gc.executions.pop();
        },
        (x) => {
            x.gc.launcher.status = null;
        },
    ]) {
        const x = reports();
        change(x);
        assert.equal(witness.gates(x).gc, false);
    }
    assert.deepEqual(witness.gates({}), {
        gc: false,
        http: false,
        nativeAttempts: 0,
        nodeAttempts: 0,
    });
    const x = reports();
    x.prerequisites = false;
    assert.equal(witness.gates(x).gc, false);
    assert.equal(witness.gates(x).http, false);
});

test("GC inventory accepts Node's escaped TAP names and rejects incomplete or failing tests", () => {
    const names = [
        "block lookup accepts only requested payload bytes across cell and mapping sizes (#646)",
        "interior lookup and weak mark queries track collection epochs and cell reuse (#646)",
        "large interior lookup survives page-map growth, tombstones and shorter cached reuse (#646)",
    ];
    // A tiny Node metadata control, never the native GC test file.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT; // Request real TAP, not the parent's internal IPC reporter.
    const control = spawnSync(
        process.execPath,
        [
            "--test-reporter=tap",
            "-e",
            `const { test } = require('node:test'); for (const name of ${JSON.stringify(names)}) test(name, () => {});`,
        ],
        { env, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(control.status, 0);
    assert.equal(
        witness.gcTestsPassed(control.stdout),
        true,
        control.stdout + control.stderr,
    );
    for (const tap of [
        "",
        control.stdout.replace("# pass 3", "# pass 2"),
        control.stdout.replace("# fail 0", "# fail 1"),
        control.stdout.replace("# cancelled 0", "# cancelled 1"),
        control.stdout.replace("# skipped 0", "# skipped 1"),
        control.stdout.replaceAll(names[0].split(" (#")[0], "other test"),
    ]) {
        assert.equal(witness.gcTestsPassed(tap), false);
    }
});

test("stream evidence requires the complete helper string or serialized buffer", () => {
    assert.equal(
        witness.streamMatches("hello\n", Buffer.from("hello\n")),
        true,
    );
    assert.equal(
        witness.streamMatches(
            { encoding: "base64", data: "AP8=" },
            Buffer.from([0, 255]),
        ),
        true,
    );
    for (const value of [
        null,
        undefined,
        {},
        { data: "" },
        { encoding: "other", data: "" },
        { encoding: "base64", data: "!" },
        { encoding: "base64" },
        { encoding: "base64", data: null },
        { encoding: "base64", data: "", extra: true },
        Object.create({ encoding: "base64", data: "" }),
        { type: "Buffer", data: [] },
        "truncated",
    ]) {
        assert.equal(witness.streamMatches(value, Buffer.alloc(0)), false);
    }
    assert.equal(witness.streamMatches("", Buffer.alloc(0)), true);
    assert.equal(
        witness.streamMatches(
            { encoding: "base64", data: "" },
            Buffer.alloc(0),
        ),
        true,
    );
    for (const data of ["AP8", "AP8=\n", "AP8==", "AP9="]) {
        assert.equal(
            witness.streamMatches(
                { encoding: "base64", data },
                Buffer.from([0, 255]),
            ),
            false,
        );
    }
    const invalid = Buffer.from([65, 195, 169, 255, 195, 40, 0]);
    assert.equal(witness.streamMatches("Aé�\uFFFD(\0", invalid), true);
    assert.equal(witness.streamMatches("changed", invalid), false);
});

test("observer retains exact raw bytes once and returns Node's requested result shape", async () => {
    const root = mkdtempSync(join(tmpdir(), "gc-witness-streams-"));
    const attempts = join(root, "http/attempts");
    const helper = join(root, "dist/tests/helpers/control.mjs");
    mkdirSync(dirname(helper), { recursive: true });
    writeFileSync(helper, "export { spawnSync } from 'node:child_process';\n");
    const hooks = witness.observeExecutions(attempts, root);
    const previousExitCode = process.exitCode;
    try {
        const observed = (await import(pathToFileURL(helper).href)).spawnSync;
        const raw = Buffer.from([65, 195, 169, 255, 195, 40, 0]);
        const digest = (bytes) =>
            createHash("sha256").update(bytes).digest("hex");
        const parse = (file) => JSON.parse(readFileSync(file, "utf8"));
        const integrity = () => {
            witness.verify(root);
            return parse(join(root, "outcome.json")).httpIntegrity;
        };
        for (const [index, settings] of [
            {
                encoding: "utf8",
                stderr: false,
                status: 0,
                stdio: ["ignore", "pipe", "pipe", "pipe"],
            },
            { encoding: "utf8", stderr: true, status: 23 },
            { encoding: "buffer", stderr: false, status: 0 },
            { stderr: true, status: 0 },
            { encoding: "utf8", missingCwd: true },
        ].entries()) {
            const marker = join(root, `invocations-${index}`);
            const code = `require('node:fs').appendFileSync(process.env.WITNESS_CONTROL_MARKER, 'call\\n'); process.stdout.write(Buffer.from([65,195,169,255,195,40,0])); ${settings.stderr ? "process.stderr.write(Buffer.from([65,195,169,255,195,40,0]));" : ""} process.exitCode = ${settings.status ?? 0};`;
            const args = ["-e", code];
            const options = {
                cwd: settings.missingCwd ? join(root, "missing") : root,
                env: { ...process.env, WITNESS_CONTROL_MARKER: marker },
                timeout: index === 0 ? 180000 : 60000,
                maxBuffer: 1024 * 1024,
                windowsHide: true,
                ...(settings.stdio ? { stdio: settings.stdio } : {}),
                ...(Object.hasOwn(settings, "encoding")
                    ? { encoding: settings.encoding }
                    : {}),
            };
            const originalOptions = structuredClone(options);
            const originalArgs = [...args];
            // Independent Node-only shape control, outside the observer; never a Nona execution.
            const expected = spawnSync(process.execPath, args, options);
            if (existsSync(marker)) rmSync(marker);
            const result = observed(process.execPath, args, options);
            assert.deepEqual(options, originalOptions);
            assert.deepEqual(args, originalArgs);
            assert.deepEqual(Object.keys(result), Object.keys(expected));
            for (const field of [
                "status",
                "signal",
                "stdout",
                "stderr",
                "output",
            ]) {
                assert.deepEqual(result[field], expected[field], field);
            }
            assert.equal(result.error?.code, expected.error?.code);
            assert.equal(
                existsSync(marker) ? readFileSync(marker, "utf8") : "",
                settings.missingCwd ? "" : "call\n",
            );
            const directory = join(attempts, readdirSync(attempts).at(-1));
            if (!settings.missingCwd)
                assert.deepEqual(
                    readFileSync(join(directory, "stdout.bin")),
                    raw,
                );
            const attempt = parse(join(directory, "attempt.json"));
            assert.deepEqual(attempt.options, originalOptions);
            assert.deepEqual(attempt.args, originalArgs);
            assert.equal(attempt.streamEncoding, settings.encoding ?? "buffer");
            assert.equal(attempt.captureEncoding, "buffer");
            assert.equal(attempt.timeout, options.timeout);
            const retained = parse(join(directory, "result.json"));
            const captured = parse(join(directory, "raw-result.json"));
            if (settings.missingCwd) {
                assert.equal(retained.stdout, null);
                assert.equal(retained.stderr, null);
                assert.equal(retained.output, null);
                assert.equal(captured.stdout, null);
                assert.equal(captured.error.code, "ENOENT");
                assert.equal(existsSync(join(directory, "stdout.bin")), false);
                assert.equal(integrity(), false);
            } else {
                for (const stream of ["stdout", "stderr"]) {
                    const want =
                        stream === "stdout" || settings.stderr
                            ? raw
                            : Buffer.alloc(0);
                    assert.deepEqual(
                        readFileSync(join(directory, `${stream}.bin`)),
                        want,
                    );
                    assert.equal(
                        parse(join(directory, `${stream}.bin.sha256.json`))
                            .sha256,
                        digest(want),
                    );
                    assert.equal(
                        witness.streamMatches(captured[stream], want),
                        true,
                    );
                }
                assert.equal(integrity(), true);
                // Invalid byte substitutions decode identically: only the retained raw hash catches this.
                const original = readFileSync(join(directory, "stdout.bin"));
                const tampered = Buffer.from(original);
                tampered[3] = 254;
                writeFileSync(join(directory, "stdout.bin"), tampered);
                assert.equal(integrity(), false);
                writeFileSync(join(directory, "stdout.bin"), original);
                for (const change of [
                    (x) => {
                        x.stderr = null;
                    },
                    (x) => {
                        delete x.stdout;
                    },
                    (x) => {
                        x.stderr = { encoding: "base64", data: "!" };
                    },
                    (x) => {
                        x.stdout =
                            typeof retained.stdout === "string"
                                ? {
                                      encoding: "base64",
                                      data: raw.toString("base64"),
                                  }
                                : raw.toString("utf8");
                    },
                    (x) => {
                        x.output[1] = "tampered";
                    },
                    (x) => {
                        x.output = null;
                    },
                ]) {
                    const changed = structuredClone(retained);
                    change(changed);
                    writeFileSync(
                        join(directory, "result.json"),
                        JSON.stringify(changed),
                    );
                    assert.equal(integrity(), false);
                }
                writeFileSync(
                    join(directory, "result.json"),
                    JSON.stringify(retained),
                );
                const badRaw = structuredClone(captured);
                badRaw.stdout = "Aé��(\0";
                writeFileSync(
                    join(directory, "raw-result.json"),
                    JSON.stringify(badRaw),
                );
                assert.equal(integrity(), false);
                writeFileSync(
                    join(directory, "raw-result.json"),
                    JSON.stringify(captured),
                );
                assert.equal(integrity(), true);
                rmSync(join(directory, "raw-result.json"));
                assert.equal(integrity(), false);
                writeFileSync(
                    join(directory, "raw-result.json"),
                    JSON.stringify(captured),
                );
                const hashFile = join(directory, "stdout.bin.sha256.json");
                const savedHash = readFileSync(hashFile);
                rmSync(hashFile);
                assert.equal(integrity(), false);
                writeFileSync(hashFile, savedHash);
                assert.equal(integrity(), true);
            }
        }
    } finally {
        process.exitCode = previousExitCode;
        hooks.deregister();
        rmSync(root, { recursive: true, force: true });
    }
});

test("actual CLI refuses local execution before creating evidence or importing compiler code", () => {
    const result = spawnSync(
        process.execPath,
        ["scripts/issue646-gc-witness.mjs", "run", "unused-local-witness"],
        {
            env: { ...process.env, GITHUB_ACTIONS: "false" },
            encoding: "utf8",
            timeout: 10000,
        },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Hosted-only witness/u);
    assert.doesNotMatch(result.stderr, /unsettled|Cannot find module/u);
});
