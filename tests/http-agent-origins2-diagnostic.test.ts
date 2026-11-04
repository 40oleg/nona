import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
    existsSync,
    readFileSync,
    mkdirSync,
    mkdtempSync,
    writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const root = resolve(".");
const load = async (name: string) => {
    const path = resolve("scripts/http-agent-origins2-" + name + ".mjs");
    assert.ok(existsSync(path), "Missing bounded diagnostic " + name);
    return import(pathToFileURL(path).href);
};
const originals = async () => {
    const { agentCases } = await import(
        pathToFileURL(resolve("tests/helpers/http-agent-cases.ts")).href
    );
    const { agentProgram } = await import(
        pathToFileURL(resolve("tests/helpers/http-agent-policy.ts")).href
    );
    return {
        witness: agentCases.find((c: { id: string }) => c.id === "origins/2"),
        agentProgram,
    };
};
const expected =
    "queued 2 2\nwoken 2 /hold0,/other1,/other2\ncomplete 2 /hold0,/hold1,/other1,/other2 4 peak 2\n";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

test("Arm A retains the exact original bytes, oracle and GC request; overrides fail closed", async () => {
    const d = await load("sources");
    const { witness, agentProgram } = await originals();
    const pair = d.makeSources(witness, agentProgram);
    assert.equal(Buffer.byteLength(pair[0].source), 3108);
    assert.equal(
        hash(pair[0].source),
        "12620f7d6cfd9c20e591f08fb1d12765920a2995582e19efb37946e8e5e609f5",
    );
    assert.equal(pair[0].source, agentProgram(witness, true, "on").source);
    assert.equal(
        pair[0].oracleSource,
        agentProgram(witness, true, "on").options.oracleSource,
    );
    assert.match(pair[0].oracleSource, /setTimeout\(callback, 6000\)/);
    assert.deepEqual(
        pair.map((a: any) => [
            a.id,
            a.requestedGC,
            a.selection,
            a.nativeBoundMs,
            a.oracleBoundMs,
        ]),
        [
            ["A", true, "on", 180000, 60000],
            ["B", true, "on", 180000, 60000],
        ],
    );
    for (const changed of [
        { ...witness, source: witness.source + " " },
        { ...witness, stressSource: witness.source },
    ])
        assert.throws(() => d.makeSources(changed, agentProgram));
    assert.throws(() =>
        d.makeSources(witness, (w: any, gc: boolean, selection: string) => ({
            ...agentProgram(w, gc, selection),
            options: { gcStress: false },
        })),
    );
});

test("B is reversible observer-only edits, observes both holds before creation, and preserves close's local predicate", async () => {
    const d = await load("sources");
    const { witness, agentProgram } = await originals();
    const pair = d.makeSources(witness, agentProgram);
    let restored = pair[1].source;
    for (const edit of [...pair[1].edits].reverse()) {
        assert.equal(restored.split(edit.after).length, 2);
        restored = restored.replace(edit.after, edit.before);
    }
    assert.equal(restored, pair[0].source);
    assert.doesNotMatch(
        pair[1].source,
        /\.on\(['"]finish|\.once\(['"]finish|\.emit\s*=|setInterval/,
    );
    assert.match(pair[1].source, /res\.req\.url/);
    // Execute the actual adapted get() with fake events, never HTTP or sockets.
    const source = pair[1].source;
    const get = source.slice(
        source.indexOf("  function get(port, path)"),
        source.indexOf("  const holds = []"),
    );
    const rows: any[] = [],
        requests: any[] = [];
    let response: any;
    const req = new EventEmitter();
    const context = vm.createContext({
        http: {
            get: (_opts: any, cb: any) => {
                response = cb;
                return req;
            },
        },
        agent: {},
        requests,
        assigned: [],
        completed: [],
        liveSockets: 0,
        peakSockets: 0,
        cleaning: false,
        console,
        observe: (...row: any[]) => rows.push(row),
    });
    vm.runInContext(get + ";globalThis.get = get;", context);
    for (const path of ["/hold0", "/hold1"]) {
        rows.length = 0;
        req.removeAllListeners();
        let resolved = false;
        const promise = context.get(123, path).then(() => {
            resolved = true;
        });
        assert.deepEqual(rows[0].slice(0, 2), ["hold-create", path]);
        req.emit("close");
        await Promise.resolve();
        assert.equal(resolved, false);
        assert.ok(rows.some((r) => r[0] === "request-close" && r[3] === false));
        const res = new EventEmitter();
        response(res);
        res.emit("data", path);
        res.emit("end");
        req.emit("close");
        await promise;
        assert.equal(resolved, true);
        assert.deepEqual(
            rows
                .filter((r) => r[0].startsWith("resolve-"))
                .map((r) => r.slice(0, 2)),
            [
                ["resolve-before", path],
                ["resolve-after", path],
            ],
        );
    }
});

test("held-end observations follow actual request URLs under reverse arrival without changing response bodies", async () => {
    const d = await load("sources");
    const { witness, agentProgram } = await originals();
    const source = d.makeSources(witness, agentProgram)[1].source;
    const observerStart = source.indexOf("const observationStart =");
    const observerEnd = source.indexOf("async function scenario(limit)");
    const firstStart = source.indexOf("  observe('held-end-before'");
    const firstEnd = source.indexOf("  await Promise.all(waiting);");
    const loopStart = source.indexOf("  observe('woken-return'");
    const loopEnd = source.indexOf("  observe('all-await-before'");
    assert.ok(observerStart >= 0 && observerEnd > observerStart);
    assert.ok(firstStart >= 0 && firstEnd > firstStart);
    assert.ok(loopStart >= 0 && loopEnd > loopStart);
    const lines: string[] = [];
    const bodies: { url: string; body: string }[] = [];
    const held = ["/hold1", "/hold0"].map((url) => ({
        req: { url },
        end: (body: string) => bodies.push({ url, body }),
    }));
    // Execute the emitted observer and both held-end blocks; no HTTP is run.
    vm.runInNewContext(
        source.slice(observerStart, observerEnd) +
            source.slice(firstStart, firstEnd) +
            source.slice(loopStart, loopEnd),
        { held, console: { error: (line: string) => lines.push(line) } },
    );
    assert.deepEqual(bodies, [
        { url: "/hold1", body: "/hold0" },
        { url: "/hold0", body: "/hold1" },
    ]);
    const rows = lines.map((line) => JSON.parse(line.slice(9)));
    assert.deepEqual(
        rows
            .filter((row) => row[0].startsWith("held-end"))
            .map((row) => row.slice(0, 4)),
        [
            ["held-end-before", "/hold1", "/hold1", false],
            ["held-end-after", "/hold1", "/hold1", false],
            ["held-end-before", "/hold0", "/hold0", false],
            ["held-end-after", "/hold0", "/hold0", false],
        ],
    );
    assert.equal(rows.length, 5);
    assert.deepEqual(d.parseDiagnostics(lines.join("\n") + "\n", false), rows);
});

const phaseRows = () => {
    const rows: any[] = [];
    for (const path of ["/hold0", "/hold1"])
        for (const phase of [
            "hold-create",
            "held-response",
            "response",
            "held-end-before",
            "held-end-after",
            "end",
            "request-close",
            "resolve-before",
            "resolve-after",
            "socket-close",
        ])
            rows.push([
                phase,
                path,
                phase === "held-response" || phase.startsWith("held-end")
                    ? path
                    : "-",
                [
                    "end",
                    "request-close",
                    "resolve-before",
                    "resolve-after",
                ].includes(phase),
                rows.length,
            ]);
    for (const phase of [
        "woken-return",
        "all-await-before",
        "all-await-after",
        "cleanup-entry",
        "cleanup-return",
    ])
        rows.push([phase, "-", "-", false, rows.length]);
    return rows;
};
const channel = (rows: any[]) =>
    rows.map((r) => "ORIGINS2\t" + JSON.stringify(r) + "\n").join("");

test("strict diagnostic channel rejects unknown, malformed, duplicate, missing and wrong-identity rows", async () => {
    const d = await load("sources");
    const rows = phaseRows();
    assert.equal(d.parseDiagnostics(channel(rows), true).length, 25);
    assert.deepEqual(
        d.parseDiagnostics(channel(rows.slice(0, 2)), false),
        rows.slice(0, 2),
    );
    for (const text of [
        "warning\n",
        "ORIGINS2\t{}\n",
        channel([...rows, rows[0]]),
        channel(rows.slice(1)),
        channel([["unknown", "-", "-", false, 0]]),
        channel([["held-response", "/hold1", "/hold0", false, 0]]),
        channel([["end", "/other1", "-", true, 0]]),
        channel([["end", "/hold0", "-", true, -1]]),
        channel([["end", "/hold0", "-", true, 1, "extra"]]),
    ])
        assert.throws(() => d.parseDiagnostics(text, true));
});

test("diagnostic rows cannot hide base stdout, stderr, status or ended-predicate mismatch", async () => {
    const d = await load("sources");
    const run = {
        status: 0,
        signal: null,
        error: null,
        deadlineExceeded: false,
        exitSeen: true,
        closeSeen: true,
        forcedPipeCleanup: false,
        pipes: {
            stdoutEnded: true,
            stderrEnded: true,
            stdoutClosed: true,
            stderrClosed: true,
        },
    };
    const compare = (
        native = run,
        out = expected,
        err = channel(phaseRows()),
        oracle: Omit<typeof run, "error"> & {
            error: { code: string } | null;
        } = run,
        oracleOut = expected,
        oracleErr = channel(phaseRows()),
    ) => d.compareArm("B", native, out, err, oracle, oracleOut, oracleErr);
    assert.equal(compare().semanticMatch, true);
    assert.equal(compare().productAcceptance, false);
    for (const result of [
        compare(run, expected + "extra\n"),
        compare(run, expected, channel(phaseRows()) + "error\n"),
        compare({ ...run, status: 1 }),
        compare({ ...run, deadlineExceeded: true }),
        compare(
            run,
            expected,
            channel(
                phaseRows().map((r) =>
                    r[0] === "request-close"
                        ? [...r.slice(0, 3), false, r[4]]
                        : r,
                ),
            ),
        ),
        compare(run, expected, channel(phaseRows()), run, "bad\n"),
        compare(run, expected, channel(phaseRows()), {
            ...run,
            error: { code: "ETIMEDOUT" },
        }),
    ])
        assert.equal(result.semanticMatch, false);
    assert.equal(
        d.compareArm("A", run, expected, "", run, expected, "").semanticMatch,
        true,
    );
    assert.equal(
        d.compareArm(
            "A",
            run,
            expected,
            channel(phaseRows()),
            run,
            expected,
            "",
        ).semanticMatch,
        false,
    );
});

const goodEnv = {
    GITHUB_ACTIONS: "true",
    RUNNER_ENVIRONMENT: "github-hosted",
    RUNNER_OS: "Windows",
    RUNNER_ARCH: "X64",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: "40oleg/nona",
    GITHUB_REF: "refs/heads/codex/diagnostic-616-origins2-20261104",
    GITHUB_SHA: "a".repeat(40),
    DIAGNOSTIC_COMMIT: "a".repeat(40),
    DIAGNOSTIC_MODE: "origins2",
    NONA_GC_STRESS: "on",
};
test("hosted guard refuses local, self-hosted, wrong ref, commit, Node, target and compiler overrides", async () => {
    const d = await load("diagnostic");
    assert.doesNotThrow(() =>
        d.hostedGuard(goodEnv, "win32", "x64", "v26.9.0", goodEnv.GITHUB_SHA),
    );
    for (const [key, value] of Object.entries({
        GITHUB_ACTIONS: "false",
        RUNNER_ENVIRONMENT: "self-hosted",
        RUNNER_OS: "Linux",
        RUNNER_ARCH: "ARM64",
        GITHUB_EVENT_NAME: "push",
        GITHUB_REPOSITORY: "fork/nona",
        GITHUB_REF: "refs/heads/main",
        GITHUB_SHA: "b".repeat(40),
        DIAGNOSTIC_COMMIT: "",
        DIAGNOSTIC_MODE: "normal",
        NONA_GC_STRESS: "off",
        NODE_OPTIONS: "--import=oops",
        NONA_NO_INLINE: "1",
        NONA_TARGET: "linux-x64",
    }))
        assert.throws(
            () =>
                d.hostedGuard(
                    { ...goodEnv, [key]: value },
                    "win32",
                    "x64",
                    "v26.9.0",
                    goodEnv.GITHUB_SHA,
                ),
            key,
        );
    for (const args of [
        ["linux", "x64", "v26.9.0"],
        ["win32", "arm64", "v26.9.0"],
        ["win32", "x64", "v26.8.0"],
    ])
        assert.throws(() =>
            d.hostedGuard(goodEnv, ...args, goodEnv.GITHUB_SHA),
        );
    const entries = Array.from({ length: 101 }, (_, i) => ({
        path: "src/" + i + ".ts",
        gitBlob: "a".repeat(40),
        actualBlob: "a".repeat(40),
        sha256: "c".repeat(64),
    }));
    assert.equal(d.verifyPinnedEntries(entries), true);
    assert.throws(
        () =>
            d.verifyPinnedEntries(
                entries.map((e, i) =>
                    i === 100 ? { ...e, actualBlob: "b".repeat(40) } : e,
                ),
            ),
        /Pinned source changed/,
    );
    assert.throws(
        () => d.verifyPinnedEntries(entries.slice(1)),
        /Incomplete source/,
    );
});

test("recovered supervisor retains raw bytes, chunk arrivals, exit/close and pipe errors", async () => {
    await load("supervisor");
    const path = resolve("scripts/http-agent-origins2-supervisor.mjs");
    const source = readFileSync(path, "utf8")
        .replace(/^import[\s\S]*?;\r?\n/gm, "")
        .replaceAll("export ", "");
    const fs = await import("node:fs");
    const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: () => true,
    });
    const dir = resolve("work/origins2-reviewfix616/fake-child");
    mkdirSync(dir, { recursive: true });
    const timers: any[] = [];
    const context = vm.createContext({
        assert,
        createHash,
        ...fs,
        join,
        Buffer,
        process,
        Date,
        setTimeout: (fn: any) => {
            timers.push(fn);
            return fn;
        },
        clearTimeout: () => {},
        spawn: (command: string, args: string[], options: any) => {
            assert.equal(command, "fake");
            assert.equal(options.cwd, dir);
            assert.equal(options.shell, false);
            assert.equal(options.windowsHide, true);
            assert.deepEqual(Array.from(options.stdio), [
                "ignore",
                "pipe",
                "pipe",
            ]);
            return child;
        },
    });
    vm.runInContext(source + ";globalThis.supervise = supervise;", context);
    const promise = context.supervise(
        "fake",
        ["arg"],
        dir,
        "success",
        180000,
        {},
    );
    child.stdout.emit("data", Buffer.from([0, 255, 10]));
    child.stdout.emit("data", Buffer.from([13]));
    child.stderr.emit("data", Buffer.from("raw"));
    child.stderr.emit(
        "error",
        Object.assign(new Error("pipe"), { code: "EPIPE" }),
    );
    for (const pipe of [child.stdout, child.stderr]) {
        pipe.emit("end");
        pipe.emit("close");
    }
    child.emit("exit", 7, null);
    child.emit("close", 7, null);
    const receipt = await promise;
    assert.deepEqual([...readFileSync(receipt.stdout.path)], [0, 255, 10, 13]);
    assert.equal(readFileSync(receipt.stderr.path, "utf8"), "raw");
    assert.equal(receipt.status, 7);
    assert.equal(receipt.exitSeen, true);
    assert.equal(receipt.closeSeen, true);
    assert.equal(receipt.error.code, "EPIPE");
    assert.ok(receipt.events.some((e: any) => e.event === "stderr-error"));
    assert.deepEqual(
        Array.from(receipt.chunks, (c: any) => [c.stream, c.bytes, c.offset]),
        [
            ["stdout", 3, 0],
            ["stdout", 1, 3],
            ["stderr", 3, 0],
        ],
    );
    assert.ok(receipt.chunks.every((c: any) => c.ms >= 0));
    assert.ok(receipt.chunks[1].ms >= receipt.chunks[0].ms);
    assert.ok(Date.parse(receipt.finishedAt) >= Date.parse(receipt.startedAt));
    child.removeAllListeners();
    child.stdout.removeAllListeners();
    child.stderr.removeAllListeners();
    let killed = "";
    child.kill = (signal?: any) => {
        killed = signal;
        return true;
    };
    (child.stdout as any).destroy = () => {};
    (child.stderr as any).destroy = () => {};
    const timeout = context.supervise("fake", [], dir, "timeout", 180000, {});
    timers.at(-1)();
    assert.equal(killed, "SIGKILL");
    timers.at(-1)();
    const timed = await timeout;
    assert.equal(timed.deadlineExceeded, true);
    assert.equal(timed.forcedPipeCleanup, true);
    assert.equal(timed.closeSeen, false);
    child.removeAllListeners();
    child.stdout.removeAllListeners();
    child.stderr.removeAllListeners();
    const failed = context.supervise("fake", [], dir, "spawn-error", 60000, {});
    child.emit(
        "error",
        Object.assign(new Error("spawn failed"), { code: "ENOENT" }),
    );
    child.emit("close", -4058, null);
    const errored = await failed;
    assert.equal(errored.error.code, "ENOENT");
    assert.equal(errored.exitSeen, false);
    assert.equal(errored.closeSeen, true);
    assert.equal(errored.events[0].error.code, "ENOENT");
    context.spawn = () => {
        throw Object.assign(new Error("throw"), { code: "EINVAL" });
    };
    const thrown = await context.supervise(
        "fake",
        [],
        dir,
        "spawn-throw",
        60000,
        {},
    );
    assert.equal(thrown.error.code, "EINVAL");
    assert.equal(thrown.events[0].event, "spawn-throw");
    assert.equal(thrown.stdout.bytes, 0);
    for (const bound of [0, -1, 180001, 1.5])
        assert.throws(() =>
            context.supervise("fake", [], dir, "invalid", bound, {}),
        );
});

test("hosted orchestration preserves failed A and continues B and both strict Node oracles without retries", async () => {
    await load("diagnostic");
    const d = await load("sources");
    const { witness, agentProgram } = await originals();
    const pair = d.makeSources(witness, agentProgram);
    const source = readFileSync(
        "scripts/http-agent-origins2-diagnostic.mjs",
        "utf8",
    )
        .split(/\nif \(\s*process\.argv\[1\]/)[0]!
        .replace(/^import[\s\S]*?;\r?\n/gm, "")
        .replaceAll("export ", "")
        .replaceAll(
            "import.meta.url",
            JSON.stringify(
                pathToFileURL(
                    resolve("scripts/http-agent-origins2-diagnostic.mjs"),
                ).href,
            ),
        )
        .replace(
            'const output = join(root, "work/origins2-hosted616");',
            "const output = campaignDirectory;",
        );
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    for (const failure of ["timeout", "builder", "capture", "oracle"]) {
        const campaignDirectory = mkdtempSync(
            resolve("work/origins2-reviewfix616/campaign-"),
        );
        const calls: string[] = [];
        const fakeNode = join(campaignDirectory, "fake-node");
        writeFileSync(fakeNode, "Fake Node image; never executable");
        const taskProcess = {
            argv: [],
            env: goodEnv,
            execPath: fakeNode,
            exitCode: 0,
        };
        const supervise = async (
            command: string,
            args: string[],
            cwd: string,
            id: string,
            bound: number,
            env: any,
        ) => {
            assert.equal(env.NONA_GC_STRESS, "on");
            const arm =
                id === "builder"
                    ? args[2]!
                    : cwd.includes(join("B", id))
                      ? "B"
                      : "A";
            calls.push(id + "-" + arm);
            assert.equal(bound, id === "oracle" ? 60000 : 180000);
            const run: any = {
                status: 0,
                signal: null,
                error: null,
                exitSeen: true,
                closeSeen: true,
                forcedPipeCleanup: false,
                deadlineExceeded: false,
                pipes: {
                    stdoutEnded: true,
                    stderrEnded: true,
                    stdoutClosed: true,
                    stderrClosed: true,
                },
            };
            if (id === "builder") {
                if (arm === "A" && failure === "builder") run.status = 1;
                else {
                    writeFileSync(join(cwd, "build.json"), "{}");
                    writeFileSync(join(cwd, "native/image.exe"), "fake-image");
                }
            }
            if (id === "native" && arm === "A") {
                if (failure === "capture") throw new Error("capture failed");
                run.deadlineExceeded = true;
                run.status = null;
                run.signal = "SIGKILL";
            }
            if (id === "oracle" && arm === "A" && failure === "oracle")
                throw new Error("oracle capture failed");
            const stdout =
                id === "builder"
                    ? ""
                    : id === "native" && arm === "A"
                      ? expected.split("complete")[0]!
                      : expected;
            const stderr =
                arm === "B" && id !== "builder" ? channel(phaseRows()) : "";
            const outPath = join(cwd, id + ".stdout.bin"),
                errPath = join(cwd, id + ".stderr.bin");
            writeFileSync(outPath, stdout);
            writeFileSync(errPath, stderr);
            run.stdout = { path: outPath };
            run.stderr = { path: errPath };
            return run;
        };
        const context = vm.createContext({
            assert,
            createHash,
            ...fs,
            ...path,
            fileURLToPath: url.fileURLToPath,
            pathToFileURL: url.pathToFileURL,
            Buffer,
            process: taskProcess,
            Date,
            campaignDirectory,
            pair,
            supervise,
            makeSources: d.makeSources,
            compareArm: d.compareArm,
        });
        vm.runInContext(
            source +
                ";verifyOriginals = () => ({ sourcePin: SOURCE_PIN }); loadSources = async () => pair; globalThis.campaign = campaign;",
            context,
            {
                importModuleDynamically: async () => {
                    throw new Error("Compiler import forbidden in pure test");
                },
            },
        );
        await context.campaign({ selection: {} });
        const report = JSON.parse(
            readFileSync(join(campaignDirectory, "report.json"), "utf8"),
        );
        assert.equal(report.arms.length, 2, failure);
        assert.equal(report.arms[0].comparison.semanticMatch, false);
        assert.equal(report.arms[1].comparison.semanticMatch, true);
        assert.equal(report.productAcceptance, false);
        assert.equal(taskProcess.exitCode, 1);
        assert.deepEqual(
            calls,
            failure === "builder"
                ? ["builder-A", "oracle-A", "builder-B", "native-B", "oracle-B"]
                : [
                      "builder-A",
                      "native-A",
                      "oracle-A",
                      "builder-B",
                      "native-B",
                      "oracle-B",
                  ],
        );
        assert.ok(existsSync(join(campaignDirectory, "B/native/image.exe")));
        assert.ok(existsSync(join(campaignDirectory, "A/native/main.mjs")));
        if (failure !== "oracle")
            assert.ok(
                existsSync(
                    join(campaignDirectory, "A/oracle/oracle.stdout.bin"),
                ),
            );
        await assert.rejects(
            () => context.campaign({ selection: {} }),
            /Evidence already exists/,
        );
    }
});

test("build entry uses the full helper pipeline with GC on and refuses source/selection/pin drift before compiler load", async () => {
    const d = await load("sources");
    const { witness, agentProgram } = await originals();
    const pair = d.makeSources(witness, agentProgram);
    const fs = await import("node:fs"),
        path = await import("node:path"),
        url = await import("node:url");
    const directory = mkdtempSync(
        resolve("work/origins2-reviewfix616/build-vm-"),
    );
    const entry = join(directory, "A/native/main.mjs");
    mkdirSync(join(directory, "A/native"), { recursive: true });
    writeFileSync(entry, pair[0].source);
    const source = readFileSync(
        "scripts/http-agent-origins2-diagnostic.mjs",
        "utf8",
    )
        .split(/\nif \(\s*process\.argv\[1\]/)[0]!
        .replace(/^import[\s\S]*?;\r?\n/gm, "")
        .replaceAll("export ", "")
        .replaceAll(
            "import.meta.url",
            JSON.stringify(
                pathToFileURL(
                    resolve("scripts/http-agent-origins2-diagnostic.mjs"),
                ).href,
            ),
        )
        .replace(
            'const output = join(root, "work/origins2-hosted616");',
            "const output = campaignDirectory;",
        )
        .replace('await import("../dist/src/compiler.js")', "compilerStub")
        .replace(
            'await import("../dist/src/backend/x64/codegen.js")',
            "codegenStub",
        )
        .replace(
            'await import("../dist/tests/helpers/program.js")',
            "linkerStub",
        );
    const calls: string[] = [],
        ir = { runtimePrelude: true },
        program = {};
    const taskProcess = { env: { NONA_GC_STRESS: "on" }, argv: [] };
    const context = vm.createContext({
        assert,
        createHash,
        ...fs,
        ...path,
        fileURLToPath: url.fileURLToPath,
        pathToFileURL: url.pathToFileURL,
        Buffer,
        process: taskProcess,
        campaignDirectory: directory,
        pair,
        compilerStub: {
            compileModuleToIR: (text: string, file: string) => {
                assert.equal(text, pair[0].source);
                assert.equal(file, entry);
                assert.equal(taskProcess.env.NONA_GC_STRESS, "on");
                calls.push("compileModuleToIR");
                return ir;
            },
        },
        codegenStub: {
            generate: (value: any, options: any) => {
                assert.equal(value, ir);
                assert.equal(options.gcStress, true);
                assert.deepEqual(Object.keys(options), ["gcStress"]);
                calls.push("generate");
                return program;
            },
        },
        linkerStub: {
            linkHost: (value: any) => {
                assert.equal(value, program);
                calls.push("linkHost");
                return Buffer.from("fake-image");
            },
        },
    });
    vm.runInContext(
        source +
            ";verifyOriginals = () => ({ sourcePin: SOURCE_PIN }); loadSources = async () => pair; inventory = () => []; globalThis.buildArm = buildArm;",
        context,
        {
            importModuleDynamically: async () => {
                throw new Error("Real compiler import forbidden");
            },
        },
    );
    await context.buildArm("A", {});
    assert.deepEqual(calls, ["compileModuleToIR", "generate", "linkHost"]);
    const build = JSON.parse(
        readFileSync(join(directory, "A/build.json"), "utf8"),
    );
    assert.equal(build.moduleLoadSelection, "on");
    assert.equal(build.effectiveGC, true);
    assert.deepEqual(build.options, { gcStress: true });
    assert.equal(
        build.source.sha256,
        "12620f7d6cfd9c20e591f08fb1d12765920a2995582e19efb37946e8e5e609f5",
    );
    assert.equal(build.imageRetained, true);
    calls.length = 0;
    writeFileSync(entry, pair[0].source + " ");
    await assert.rejects(
        () => context.buildArm("A", {}),
        /Build source override/,
    );
    writeFileSync(entry, pair[0].source);
    taskProcess.env.NONA_GC_STRESS = "off";
    await assert.rejects(() => context.buildArm("A", {}));
    taskProcess.env.NONA_GC_STRESS = "on";
    vm.runInContext(
        'verifyOriginals = () => { throw new Error("Pinned source changed"); };',
        context,
    );
    await assert.rejects(
        () => context.buildArm("A", {}),
        /Pinned source changed/,
    );
    assert.deepEqual(calls, []);
});

test("workflow opt-in excludes every normal job, keeps their bodies, and has one Windows-only guarded entry", async () => {
    const text = readFileSync(
        ".github/workflows/native-platforms.yml",
        "utf8",
    ).replaceAll("\r\n", "\n");
    assert.match(text, /origins2-diagnostic:/);
    const normalIds = [
        "browser-compiler",
        "windows-regression",
        "linux-regression",
        "loaders",
        "linux-distributions",
        "bsd-loaders",
    ];
    for (const id of normalIds) {
        const block = text
            .split("    " + id + ":\n")[1]
            ?.split(/^    [\w-]+:\n/m)[0];
        assert.ok(block, id);
        assert.match(block, /if:.*inputs\.diagnostic_mode != 'origins2'/);
        const condition = block
            .match(/^        if: (.+)$/m)![1]!
            .replace("github.event.pull_request.labels.*.name", "labels");
        for (const event of ["push", "pull_request", "workflow_dispatch"])
            for (const full of [false, true])
                for (const mode of [undefined, "normal", "origins2"]) {
                    const active = vm.runInNewContext(condition, {
                        github: { event_name: event },
                        inputs: { diagnostic_mode: mode },
                        labels: full ? ["full-ci"] : [],
                        contains: (labels: string[], label: string) =>
                            labels.includes(label),
                    });
                    const old =
                        id === "browser-compiler" ||
                        (id === "windows-regression"
                            ? event === "workflow_dispatch"
                            : event !== "pull_request" || full);
                    assert.equal(
                        active,
                        mode !== "origins2" && old,
                        `${id}/${event}/${mode}/${full}`,
                    );
                }
    }
    const diagnostic = text.split("    origins2-diagnostic:\n")[1]!;
    assert.match(diagnostic, /runs-on: windows-latest/);
    assert.match(diagnostic, /persist-credentials: false/);
    assert.match(
        diagnostic,
        /github\.ref == 'refs\/heads\/codex\/diagnostic-616-origins2-20261104'/,
    );
    assert.match(diagnostic, /github\.sha == inputs\.diagnostic_commit/);
    assert.match(diagnostic, /if: always\(\)/);
    assert.equal(
        (
            diagnostic.match(
                /node scripts\/http-agent-origins2-diagnostic\.mjs/g,
            ) ?? []
        ).length,
        1,
    );
    assert.doesNotMatch(
        diagnostic,
        /matrix:|npm run check|npm test|self-hosted/,
    );
});
