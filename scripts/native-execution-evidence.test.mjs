import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    writeFileSync,
    unlinkSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import * as fs from "node:fs";
import * as paths from "node:path";
import {
    serializeExecution,
    executionEvidence,
    retainExecution,
} from "../tests/helpers/execution.ts";
import {
    loadCases,
    diagnosticPlan,
    pins,
} from "./native-gc-diagnosis-cases.mjs";

const work = resolve("work/native-evidence-tests");
mkdirSync(work, { recursive: true });
const plain = (value) => JSON.parse(JSON.stringify(serializeExecution(value)));

test("controlled exit retains both raw streams and nonzero status", () => {
    const result = spawnSync(
        process.execPath,
        [
            "-e",
            "process.stdout.write('out\\u0000'); process.stderr.write('err'); process.exitCode=7",
        ],
        { timeout: 5000, windowsHide: true },
    );
    const saved = plain(result);
    assert.equal(saved.status, 7);
    assert.equal(saved.signal, null);
    assert.equal(Buffer.from(saved.stdout.data, "base64").toString(), "out\0");
    assert.equal(Buffer.from(saved.stderr.data, "base64").toString(), "err");
});

test("controlled termination retains the reported platform signal/status", () => {
    const result = spawnSync(
        process.execPath,
        ["-e", "process.kill(process.pid, 'SIGTERM')"],
        { timeout: 5000, windowsHide: true },
    );
    const saved = plain(result);
    if (process.platform !== "win32") {
        assert.equal(saved.signal, "SIGTERM");
        assert.equal(saved.status, null);
    } else assert.ok(saved.signal === "SIGTERM" || saved.status !== 0);
    assert.equal(saved.signal, result.signal);
    assert.equal(saved.status, result.status);
});

test("controlled timeout retains complete spawn error metadata and partial output", () => {
    const result = spawnSync(
        process.execPath,
        ["-e", "process.stdout.write('started'); setInterval(()=>{},1000)"],
        { timeout: 1500, windowsHide: true },
    );
    assert.equal(result.error?.code, "ETIMEDOUT");
    const saved = plain(result);
    for (const key of Object.getOwnPropertyNames(result.error))
        assert.deepEqual(saved.error[key], plain(result.error[key]), key);
    assert.equal(saved.error.name, "Error");
    assert.equal(saved.signal, result.signal);
    assert.equal(
        Buffer.from(saved.stdout.data, "base64").toString(),
        "started",
    );
});

test("evidence survives cleanup with hashes, nested causes and non-enumerable fields", () => {
    const previous = process.env.NONA_EXECUTION_EVIDENCE;
    process.env.NONA_EXECUTION_EVIDENCE = mkdtempSync(join(work, "retention-"));
    try {
        const error = Object.assign(
            new Error("spawn failed", { cause: new Error("nested") }),
            {
                code: "ENOENT",
                errno: -2,
                syscall: "spawn image",
                path: "image",
                spawnargs: ["x"],
            },
        );
        const evidence = executionEvidence("control", {
            source: "exact\r\nbytes",
            timeoutMs: 60000,
        });
        retainExecution(
            evidence,
            {
                status: null,
                signal: "SIGTERM",
                stdout: Buffer.from([0, 255]),
                stderr: "failure",
                error,
            },
            performance.now(),
        );
        const result = JSON.parse(
            readFileSync(join(evidence.directory, "result.json")),
        );
        assert.equal(result.error.cause.message, "nested");
        assert.equal(result.error.syscall, "spawn image");
        assert.equal(result.signal, "SIGTERM");
        assert.deepEqual(
            readFileSync(join(evidence.directory, "stdout.bin")),
            Buffer.from([0, 255]),
        );
        assert.equal(
            JSON.parse(readFileSync(join(evidence.directory, "input.json")))
                .input.source,
            "exact\r\nbytes",
        );
    } finally {
        if (previous === undefined) delete process.env.NONA_EXECUTION_EVIDENCE;
        else process.env.NONA_EXECUTION_EVIDENCE = previous;
    }
});

// These fixtures inject child-process outcomes. They exercise the actual helper
// branches without building a compiler or executing a Nona image locally.
function loadHelper(file, mocks) {
    let source = stripTypeScriptTypes(
        readFileSync(resolve("tests/helpers", file), "utf8"),
    );
    // Only the helper's top-level import declarations are transformed; fixture
    // source capture above uses Node's real module loader, never text rewriting.
    source = source.replace(
        /import\s+([\s\S]*?)\s+from\s+"([^"]+)";/gu,
        (_match, bindings, name) =>
            `const ${bindings.trim()} = require(${JSON.stringify(name)});`,
    );
    source = source.replace(/export\s+\{[^}]+\}\s+from\s+"[^"]+";/gu, "");
    const exports = [...source.matchAll(/export function (\w+)/gu)].map(
        (match) => match[1],
    );
    source = source.replace(/export function /gu, "function ");
    return runInNewContext(
        "(function(require,process,Buffer,performance){" +
            source +
            "\nreturn {" +
            exports.join(",") +
            "};})",
        {},
    )(
        (name) => {
            assert.ok(Object.hasOwn(mocks, name), name);
            return mocks[name];
        },
        mocks.process,
        Buffer,
        performance,
    );
}

test("native redirected/pipe and host Linux/non-Linux/module paths preserve signals and errors", () => {
    const directory = mkdtempSync(join(work, "branches-"));
    const error = Object.assign(new Error("timeout"), {
        code: "ETIMEDOUT",
        errno: -110,
        syscall: "spawn image",
        path: "image",
        spawnargs: [],
    });
    const result = {
        status: null,
        signal: "SIGTERM",
        stdout: Buffer.from("partial"),
        stderr: Buffer.from("diagnostic"),
        error,
    };
    const execution = {
        executionEvidence: () => undefined,
        retainExecution: () => {},
        executionFailure: JSON.stringify,
    };
    const cleanup = {
        removeTemporaryDirectory: (path) => {
            assert.ok(resolve(path).startsWith(directory + paths.sep));
            fs.rmSync(path, { recursive: true, force: true });
        },
    };
    const common = {
        "node:fs": fs,
        "node:path": paths,
        "node:os": { tmpdir: () => directory },
        "./cleanup.js": cleanup,
        "./execution.js": execution,
        "node:child_process": {
            spawnSync(_exe, _args, options) {
                if (options.stdio)
                    fs.writeSync(options.stdio[1], result.stdout);
                return options.encoding
                    ? {
                          ...result,
                          stdout: result.stdout.toString(),
                          stderr: result.stderr.toString(),
                      }
                    : result;
            },
        },
    };
    const native = loadHelper("native.ts", { ...common, process });
    for (const redirect of [false, true]) {
        const actual = native.runNative(
            Uint8Array.from([1, 2, 3, 4]),
            60000,
            redirect,
        );
        assert.equal(actual.error, error);
        assert.equal(actual.signal, "SIGTERM");
        assert.equal(actual.stdout.toString(), "partial");
    }
    for (const platform of ["linux", "darwin", "win32"]) {
        const hostMocks = {
            ...common,
            process: { platform },
            "./native.js": native,
            "../../src/compiler.js": {
                compileToIR: () => ({}),
                compileModuleToIR: () => ({}),
            },
            "../../src/backend/x64/codegen.js": { generate: () => ({}) },
            "./program.js": { linkHost: () => new Uint8Array(4) },
            "../../src/target.js": {
                requireHostTarget: () => "linux-x64",
                getTarget: () => ({ arch: "x64" }),
            },
            "../../src/backend/linux/index.js": {
                linkLinux: () => new Uint8Array(4),
            },
        };
        const host = loadHelper("host.ts", hostMocks);
        const actual = host.runOnHost("fixture", { gcStress: true });
        assert.equal(actual.signal, "SIGTERM", platform);
        assert.equal(actual.error, error, platform);
        // A failed Node control throws with the complete run in its message.
        assert.throws(
            () => host.runModulesOnHost({ "main.mjs": "fixture" }, "main.mjs"),
            /SIGTERM/,
        );
        let count = 0;
        const oracleSignalHost = loadHelper("host.ts", {
            ...hostMocks,
            "node:child_process": {
                spawnSync() {
                    return ++count === 1
                        ? result
                        : { ...result, signal: "SIGINT", error: undefined };
                },
            },
        });
        const moduleRun = oracleSignalHost.runModulesOnHost(
            { "main.mjs": "fixture" },
            "main.mjs",
        );
        assert.equal(moduleRun.native.signal, "SIGTERM");
        assert.equal(moduleRun.native.error, error);
        assert.equal(moduleRun.oracleRun.signal, "SIGINT");
        assert.equal(moduleRun.oracleRun.status, null);
        assert.equal(moduleRun.oracleStderr, "diagnostic");
    }
    assert.deepEqual(
        readdirSync(directory),
        [],
        "temporary execution directories cleaned after retention",
    );
});

test("pinned fixture matrix captures every original program and replays original oracles", async () => {
    const groups = Object.keys(pins).filter(
        (group) =>
            !process.env.NONA_DIAGNOSTIC_SOURCE ||
            process.env.NONA_DIAGNOSTIC_SOURCE === pins[group],
    );
    assert.ok(groups.length > 0);
    for (const group of groups) {
        const root = mkdtempSync(join(work, group + "-"));
        const files =
            group === "assert"
                ? [
                      "tests/assert-deep-equal.test.ts",
                      "tests/assert-strict.test.ts",
                  ]
                : group === "regexp"
                  ? ["tests/regexp-v-flag.test.ts"]
                  : [
                        "tests/http-agent.test.ts",
                        "tests/helpers/http-agent-cases.ts",
                        "tests/helpers/http-agent-policy.ts",
                    ];
        for (const file of files) {
            const result = spawnSync(
                "git",
                ["show", pins[group] + ":" + file],
                { windowsHide: true },
            );
            assert.equal(result.status, 0);
            mkdirSync(paths.dirname(join(root, file)), { recursive: true });
            writeFileSync(join(root, file), result.stdout);
        }
        const cases = await loadCases(root, group);
        const plan = diagnosticPlan(group);
        assert.equal(cases.length, plan.originalGroups);
        assert.equal(
            cases
                .flatMap((item) => item.calls)
                .filter((call) => call.kind !== "oracle").length,
            plan.originalNative,
        );
        for (const entry of cases) {
            for (const call of entry.calls) {
                if (call.kind === "modules") {
                    const options = call.args[2];
                    const source =
                        options.oracleSource ?? call.args[0][call.args[1]];
                    // Node controls are lightweight, serial and bounded. No
                    // native/build workload is reachable in this test.
                    const fixture = join(root, "oracle.mjs");
                    writeFileSync(fixture, source);
                    const node = spawnSync(process.execPath, [fixture], {
                        encoding: "utf8",
                        timeout: 15000,
                        windowsHide: true,
                    });
                    assert.equal(node.status, 0, node.stderr);
                    call.result = {
                        native: {
                            status: 0,
                            stdout: node.stdout,
                            stderr: node.stderr,
                        },
                        oracle: node.stdout,
                        oracleStatus: 0,
                        oracleStderr: node.stderr,
                    };
                } else if (call.kind === "oracle") {
                    // The original Script oracle has a console String adapter.
                    const source =
                        "console.log=(...args)=>process.stdout.write(args.map(String).join(' ')+'\\n');\n" +
                        call.args[0];
                    const node = spawnSync(process.execPath, ["-e", source], {
                        encoding: "utf8",
                        timeout: 15000,
                        windowsHide: true,
                    });
                    assert.equal(node.status, 0, node.stderr);
                    call.result = { stdout: node.stdout };
                    const previous = entry.calls[entry.calls.indexOf(call) - 1];
                    previous.result = {
                        status: 0,
                        stdout: node.stdout,
                        stderr: "",
                    };
                }
            }
            entry.replay();
            entry.calls[0].result = {
                native: { status: null, error: { code: "ETIMEDOUT" } },
                status: null,
                error: { code: "ETIMEDOUT" },
            };
            assert.throws(
                () => entry.replay(),
                undefined,
                "Original failure must remain a failure",
            );
        }
    }
});

test("completeness rejects a missing raw stream even when the final report claims success", () => {
    const root = mkdtempSync(join(work, "verification-"));
    const output = join(root, "work/native-gc-diagnosis");
    const provenance = join(root, "work/native-gc-provenance");
    mkdirSync(output, { recursive: true });
    mkdirSync(provenance, { recursive: true });
    const json = (file, value) => writeFileSync(file, JSON.stringify(value));
    const plan = diagnosticPlan("http");
    json(join(output, "plan.json"), plan);
    json(join(provenance, "context.json"), { source: plan.pin });
    json(join(provenance, "original-job.json"), { head_sha: plan.pin });
    json(join(provenance, "build.json"), { status: 0 });
    for (const file of [
        "pinned-tree.tar",
        "original-job.log",
        "original-run.json",
    ])
        writeFileSync(join(provenance, file), "synthetic control");
    const phases = [
        "original",
        "concurrent-2",
        "concurrent-2",
        "isolated-tail",
        "marked-native-only",
        "startup-control",
    ];
    const manifest = phases.map((phase, index) => ({
        id: String(index),
        phase,
    }));
    json(join(output, "manifest.json"), manifest);
    json(join(output, "final.json"), {
        completed: true,
        executions: plan.totalNative,
        assertions: [{ passed: true }],
    });
    for (const item of manifest) {
        const directory = join(output, item.id);
        mkdirSync(directory);
        json(join(directory, "request.json"), { source: plan.pin });
        json(join(directory, "launcher.json"), { status: 0 });
        json(join(directory, "worker-result.json"), { result: {} });
        writeFileSync(
            join(directory, "samples.jsonl"),
            JSON.stringify({ status: 0, stdout: "synthetic control" }) + "\n",
        );
        for (const name of ["modules-control", "module-oracle-control"]) {
            const evidence = join(directory, "executions", name);
            mkdirSync(evidence, { recursive: true });
            json(join(evidence, "input.json"), {});
            json(join(evidence, "result.json"), {
                status: 0,
                signal: null,
                elapsedMs: 0,
            });
            for (const file of [
                "stdout.bin",
                "stderr.bin",
                ...(name === "modules-control" ? ["image.bin"] : []),
            ]) {
                writeFileSync(join(evidence, file), "synthetic control");
                json(join(evidence, file + ".sha256.json"), {
                    sha256: createHash("sha256")
                        .update("synthetic control")
                        .digest("hex"),
                });
            }
            if (name === "modules-control")
                json(join(evidence, "timings.json"), {
                    compileMs: 0,
                    generateMs: 0,
                    linkMs: 0,
                });
        }
    }
    const command = [
        resolve("scripts/native-gc-diagnosis.mjs"),
        "--verify",
        "http",
    ];
    const complete = spawnSync(process.execPath, command, {
        cwd: root,
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
    });
    assert.equal(complete.status, 0, complete.stderr);
    unlinkSync(join(output, "0/executions/modules-control/stderr.bin"));
    const incomplete = spawnSync(process.execPath, command, {
        cwd: root,
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
    });
    assert.notEqual(incomplete.status, 0);
    assert.match(incomplete.stderr, /stderr\.bin/u);
});
