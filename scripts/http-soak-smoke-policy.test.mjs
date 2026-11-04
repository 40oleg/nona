import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { evaluateRun, newHistogram, record } from "./http-soak-support.mjs";
import { readConfig, acceptancePass } from "./http-soak-evidence.mjs";
import {
    patchDriver,
    unpatchDriver,
    sha256,
} from "./http-latency615-support.mjs";

const policyUrl = new URL("./http-soak-smoke-policy.mjs", import.meta.url);
const policy = existsSync(policyUrl) ? await import(policyUrl) : {};

test("actual hosted control provisions the exact bounded pin before the smoke and wrapper suites", async () => {
    const yaml = readFileSync(
        new URL("../.github/workflows/http-soak-control.yml", import.meta.url),
        "utf8",
    );
    const provision =
        /            - name: Provision pinned inert soak source\n[\s\S]*?              run: \|\n([\s\S]*?)(?=            - )/.exec(
            yaml.replaceAll("\r\n", "\n"),
        );
    assert.ok(provision, "hosted smoke tests need the pinned fixture first");
    const script = provision[1].replace(/^                  /gm, "");
    const body = /^node --input-type=module <<'NODE'\n([\s\S]*)\nNODE\n$/.exec(
        script,
    )?.[1];
    assert.ok(body, "execute the actual provisioning JavaScript");
    const cheap = yaml.indexOf("- name: Cheap decision and report regressions");
    assert.ok(provision.index < cheap);
    const command = yaml.slice(cheap).split(/\r?\n/)[1].trim();
    assert.equal(
        command,
        "run: node --test --test-concurrency=1 scripts/http-soak.test.mjs scripts/http-soak-completion.test.mjs scripts/http-soak-smoke-policy.test.mjs scripts/http-soak-check.test.mjs",
    );
    const original = readFileSync(process.env.LATENCY615_TEST_INPUT);
    for (const mode of [
        "valid",
        "unavailable",
        "short",
        "oversized",
        "wrong-pin",
        "network-error",
    ]) {
        const writes = new Map(),
            requests = [];
        let timeout;
        const bytes =
            mode === "short"
                ? original.subarray(1)
                : mode === "oversized"
                  ? Buffer.concat([original, Buffer.from("x")])
                  : mode === "wrong-pin"
                    ? Buffer.from(original).fill(0)
                    : original;
        const execute = () =>
            runInNewContext(
                `(async () => {${body.replace(/^import[\s\S]*?;\n/gm, "")}})()`,
                {
                    assert,
                    createHash,
                    resolve,
                    Buffer,
                    process: { env: { GITHUB_ENV: "ENV" } },
                    AbortSignal: {
                        timeout(ms) {
                            timeout = ms;
                            return "deadline";
                        },
                    },
                    fetch: async (url, options) => {
                        requests.push({ url, options });
                        if (mode === "network-error")
                            throw Error("unavailable network");
                        return {
                            ok: mode !== "unavailable",
                            status: mode === "unavailable" ? 503 : 200,
                            body: (async function* () {
                                yield bytes.subarray(0, 100);
                                yield bytes.subarray(100);
                            })(),
                        };
                    },
                    mkdirSync() {},
                    writeFileSync: (p, value) => writes.set(p, value),
                    appendFileSync: (p, value) =>
                        writes.set(p, (writes.get(p) ?? "") + value),
                },
            );
        if (mode === "valid") {
            await execute();
            const fixture = resolve("soak-control-report/http-soak.ab5.mjs");
            assert.deepEqual(writes.get(fixture), original);
            assert.equal(
                writes.get("ENV"),
                `LATENCY615_TEST_INPUT=${fixture}\n`,
            );
        } else {
            await assert.rejects(execute);
            assert.equal(
                writes.size,
                0,
                "failed pin must not publish a fixture or environment",
            );
        }
        assert.equal(timeout, 20000);
        assert.equal(requests.length, 1, "no retry or alternate source");
        assert.equal(
            requests[0].url,
            "https://raw.githubusercontent.com/40oleg/nona/ab5ea083d793e0a665fde8b0a4b33bc1fa67208e/scripts/http-soak.mjs",
        );
        assert.deepEqual(JSON.parse(JSON.stringify(requests[0].options)), {
            redirect: "error",
            signal: "deadline",
        });
    }
});

test("actual hosted build-failure staging copies the complete driver import graph before spawn", async () => {
    const source = readFileSync(
        new URL("./http-soak-hosted.test.mjs", import.meta.url),
        "utf8",
    );
    const staged = new Map();
    const visited = new Set();
    const stopped = new Error("staged graph checked; never spawn a driver");
    let hostedTest;
    let reachedSpawn = false;
    function checkGraph(file) {
        const path = resolve(file);
        if (visited.has(path)) return;
        assert.ok(staged.has(path), `missing staged module: ${path}`);
        visited.add(path);
        // Follow imports in the actual copied bytes, including transitive imports.
        const imports = staged
            .get(path)
            .matchAll(
                /\b(?:import|export)\s+(?:[^"'`;]*?\s+from\s*)?["']([^"']+)["']/g,
            );
        for (const [, specifier] of imports) {
            if (specifier.startsWith("node:")) continue;
            assert.ok(specifier.startsWith("."), specifier);
            checkGraph(resolve(dirname(path), specifier));
        }
    }
    // Run the real registration and only its build-failure callback. All copies
    // stay in memory; the spawn sentinel stops before driver/report execution.
    runInNewContext(source.replace(/^import\s+[\s\S]*?;\r?\n/gm, ""), {
        assert,
        join,
        resolve,
        process: {
            env: {
                GITHUB_ACTIONS: "true",
                RUNNER_ENVIRONMENT: "github-hosted",
            },
            execPath: "never-executed-node",
        },
        test: (name, options, callback) => {
            assert.equal(options.skip, false);
            hostedTest = callback;
        },
        mkdirSync() {},
        copyFileSync: (from, to) =>
            staged.set(
                resolve(to),
                readFileSync(
                    new URL(
                        `../${from.replaceAll("\\", "/")}`,
                        import.meta.url,
                    ),
                    "utf8",
                ),
            ),
        spawn: (command, args, options) => {
            reachedSpawn = true;
            assert.equal(options.env.SOAK_FIXTURE, "build-failure");
            assert.equal(options.env.NONA_SOAK_SERVER, "");
            const driver = args[2];
            assert.equal(
                resolve(driver),
                resolve(
                    "soak-control-report/build-failure/stage/scripts/http-soak.mjs",
                ),
            );
            checkGraph(driver);
            assert.ok(
                visited.has(
                    resolve(dirname(driver), "http-soak-smoke-policy.mjs"),
                ),
                "support must reach the actual staged policy dependency",
            );
            assert.ok(
                staged.has(
                    resolve(dirname(driver), "../bench/http/soak-server.mjs"),
                ),
            );
            throw stopped;
        },
    });
    assert.equal(typeof hostedTest, "function");
    await assert.rejects(
        hostedTest({
            test: async (mode, options, callback) => {
                if (mode === "build-failure") await callback();
            },
        }),
        (error) => {
            assert.equal(error, stopped);
            return true;
        },
    );
    assert.equal(reachedSpawn, true);
});

function evidence(smoke = true, tail = 2) {
    const config = readConfig({}, smoke);
    const step = config.sampleSeconds;
    const end = config.minutes * 60;
    const baseline = {
        rss: 1000000,
        openSockets: 1,
        fds: 10,
        activeResources: 2,
    };
    const samples = [
        { ...baseline, phase: "baseline", t: 0 },
        ...Array.from({ length: end / step }, (_, i) => ({
            ...baseline,
            phase: "load",
            t: (i + 1) * step,
        })),
        { ...baseline, phase: "after", t: end + 8 },
    ];
    return {
        config,
        samples,
        histograms: samples.map((s) => {
            const h = newHistogram();
            record(h, s.t > end - config.windowMinutes * 60 ? tail : 1);
            return h;
        }),
        crash: null,
        counters: {
            ok: 300,
            failed: 0,
            deliberate: { missing: 0, throw: 0, slowAborted: 0 },
            failures: {},
            nearCrash: {},
        },
        baseline,
        after: baseline,
        loadSeconds: end,
    };
}

test("actual evaluator defers only explicit smoke p99 and keeps original verdict and measurements", () => {
    const result = evaluateRun(evidence());
    assert.equal(result.summary.pass, true);
    assert.equal(result.summary.originalPass, false);
    const p99 = result.criteria.find((c) => c.name === "p99 latency stable");
    assert.equal(p99.pass, false);
    assert.equal(p99.gating, false);
    assert.match(p99.observation, /non-gating smoke/);
    assert.ok(result.summary.p99Tail > result.summary.p99Head);
    const healthy = evaluateRun(evidence(true, 1));
    assert.equal(healthy.summary.pass, true);
    assert.equal(healthy.summary.originalPass, true);
    assert.equal(
        healthy.criteria.find((c) => c.name === "p99 latency stable").pass,
        true,
    );
});

test("every other evaluator gate stays red during smoke", () => {
    for (const mutate of [
        (e) => (e.crash = { code: 17, signal: null }),
        (e) => (e.loadSeconds = 299),
        (e) => (e.counters.failed = 1),
        (e) => (e.histograms[8] = newHistogram()),
        (e) => {
            for (const s of e.samples) if (s.t >= 240) s.rss = 1100000;
        },
        (e) => (e.after = { ...e.after, fds: 15 }),
        (e) => (e.after = { ...e.after, openSockets: 4 }),
        (e) => (e.after = { ...e.after, activeResources: 5 }),
        (e) => (e.after = null),
    ]) {
        const e = evidence();
        mutate(e);
        assert.equal(evaluateRun(e).summary.pass, false);
    }
});

test("strict native 180-minute p99 ratio still fails below 0.5ms delta; smoke never accepts", () => {
    const e = evidence(false, 1.4);
    const result = evaluateRun(e);
    assert.ok(result.summary.p99Tail - result.summary.p99Head < 0.5);
    assert.equal(
        result.criteria.find((c) => c.name === "p99 latency stable").pass,
        false,
    );
    assert.equal(result.summary.pass, false);
    const native = {
        config: e.config,
        checkoutDirty: false,
        server: {
            kind: "native",
            measuredSourceCommit: "b".repeat(40),
            imageSha256: "a".repeat(64),
            sourceCommitBasis: "built from checkout",
        },
        mix: Object.fromEntries(
            [
                "text",
                "json",
                "big",
                "echo",
                "close",
                "slow",
                "missing",
                "throw",
            ].map((r) => [r, 1]),
        ),
        routeCounts: Object.fromEntries(
            [
                "text",
                "json",
                "big",
                "echo",
                "close",
                "slow",
                "missing",
                "throw",
            ].map((r) => [r, 1]),
        ),
        summary: result.summary,
    };
    assert.equal(acceptancePass(native), false);
    native.summary = evaluateRun(evidence(false, 1)).summary;
    assert.equal(acceptancePass(native), true);
    for (const mutate of [
        (n) => (n.config.smoke = true),
        (n) => (n.config.minutes = 5),
        (n) => (n.server.kind = "node"),
        (n) => (n.routeCounts.big = 0),
        (n) => (n.summary.pass = false),
    ]) {
        const n = structuredClone(native);
        mutate(n);
        assert.equal(acceptancePass(n), false);
    }
    for (const smoke of [false, undefined, "true", 1]) {
        const e = evidence();
        e.config.smoke = smoke;
        assert.equal(evaluateRun(e).summary.pass, false);
    }
});

// Tiny synthetic report, not recovered performance evidence or pinned source.
function legacyFixture(p99Pass = false) {
    const e = evidence(true, p99Pass ? 1 : 2);
    for (const s of e.samples) {
        s.requests = s.phase === "load" ? 10 : 0;
        s.failed = 0;
        s.serverErrors = 0;
        s.uncaught = 0;
        s.deliberate = 0;
        s.p99 = s.t > 240 ? (p99Pass ? 1 : 2) : 1;
    }
    const { criteria, summary } = evaluateRun(e);
    const originalCriteria = criteria
        .filter((c) => c.name !== "comparison sample coverage")
        .map(({ name, pass, value, limit }) => ({ name, pass, value, limit }));
    summary.pass = originalCriteria.every((c) => c.pass);
    const report = {
        test: "http-soak",
        config: {
            ...e.config,
            connections: 1,
            limits: { ...e.config.limits, p99SlackMs: 0.5 },
        },
        mix: { big: 1 },
        crash: null,
        criteria: originalCriteria,
        summary,
        samples: e.samples,
        serverLog: [],
    };
    const json = JSON.stringify(report);
    const code = summary.pass ? 0 : 1;
    const markdown =
        `# HTTP soak test: ${summary.pass ? "PASS" : "FAIL"}\n\n` +
        originalCriteria
            .map(
                (c) =>
                    `| ${c.name} | ${c.value} | ${c.limit} | ${c.pass ? "pass" : "**FAIL**"} |`,
            )
            .join("\n") +
        "\n| Phase | Min |\n| after | 5.1 |\n";
    const stdout =
        "\n" +
        originalCriteria
            .map(
                (c) =>
                    `${c.pass ? "pass" : "FAIL"}  ${c.name}: ${c.value} (limit ${c.limit})`,
            )
            .join("\n") +
        `\n\n${summary.pass ? "PASS" : "FAIL"}; reports in OUT\n`;
    return {
        report,
        json,
        markdown,
        stdout,
        stderr: "",
        exit: { code, signal: null },
        jsExit: { code },
        completion: {
            code,
            json,
            markdown,
            loadSeconds: 300,
            p99Head: summary.p99Head,
            p99Tail: summary.p99Tail,
        },
        driverErrors: "",
    };
}

async function wrapper(f = legacyFixture()) {
    const source = readFileSync(
        new URL("./http-soak-check.mjs", import.meta.url),
        "utf8",
    );
    // Match filesystem separator aliases for the wrapper's slash-normalized env.
    const files = new (class extends Map {
        get(p) {
            return super.get(String(p).replaceAll("\\", "/"));
        }
        set(p, value) {
            return super.set(String(p).replaceAll("\\", "/"), value);
        }
        has(p) {
            return super.has(String(p).replaceAll("\\", "/"));
        }
    })();
    const path = (name) => join(resolve("work/http-601/soak"), name);
    for (const [name, contents] of Object.entries({
        "http-soak.json": f.json,
        "http-soak.md": f.markdown,
        "driver-completion.json": JSON.stringify(f.completion),
        "driver-errors.jsonl": f.driverErrors,
        "server-events.jsonl":
            '{"event":"spawn","pid":123}\n{"event":"exit","code":0,"signal":null}\n',
    }))
        files.set(path(name), contents);
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    Object.assign(child, { pid: 456, exitCode: null, signalCode: null });
    const kills = [];
    const proc = {
        platform: process.platform,
        env: {},
        execPath: "node",
        stdout: { write() {} },
        stderr: { write() {} },
        exitCode: 0,
        kill: (...args) => kills.push(args),
    };
    let pending;
    let builds = 0;
    let spawns = 0;
    const original = readFileSync(process.env.LATENCY615_TEST_INPUT);
    const context = {
        ...policy,
        patchDriver,
        assert,
        createHash,
        dirname,
        join,
        resolve,
        fileURLToPath,
        process: proc,
        console: { error() {} },
        setTimeout,
        clearTimeout,
        hostedIdentity: () => ({ commit: "base" }),
        mkdirSync() {},
        writeFileSync: (p, s) => files.set(p, String(s)),
        appendFileSync: (p, s) =>
            files.set(p, (files.get(p) ?? "") + String(s)),
        readFileSync: (p) => {
            if (files.has(String(p))) return files.get(String(p));
            if (String(p).endsWith("http-soak.mjs"))
                return f.sourceBytes ?? original;
            if (
                String(p).endsWith("soak-server.mjs") ||
                String(p).endsWith("cli.js") ||
                /soak-server(?:\.exe)?$/.test(String(p))
            )
                return "tiny owned fixture";
            throw new Error("unavailable fixture: " + p);
        },
        spawnSync: (cmd) => {
            if (cmd !== "git") builds++;
            return cmd === "git"
                ? {
                      status: 0,
                      stdout: "ab5ea083d793e0a665fde8b0a4b33bc1fa67208e\n",
                  }
                : { status: 0 };
        },
        spawn(command, args, options) {
            spawns++;
            pending = Promise.resolve()
                .then(async () => {
                    if (f.runDriver)
                        await f.runDriver(
                            files.get(path("http-soak.executed.mjs")),
                            files,
                            path,
                            options.env,
                        );
                    if (!f.runDriver) {
                        files.set(
                            path("harness-exit.json"),
                            JSON.stringify(f.jsExit),
                        );
                        files.set(
                            path("driver-completion.json"),
                            JSON.stringify(f.completion),
                        );
                        files.set(path("driver-errors.jsonl"), f.driverErrors);
                        files.set(
                            path("server-events.jsonl"),
                            f.serverEvents ??
                                '{"event":"spawn","pid":123}\n{"event":"exit","code":0,"signal":null}\n',
                        );
                    }
                    child.stdout.emit(
                        "data",
                        f.stdout.replaceAll(
                            "OUT",
                            resolve("work/http-601/soak"),
                        ),
                    );
                    child.stderr.emit("data", f.stderr);
                    child.exitCode = f.exit.code;
                    child.signalCode = f.exit.signal;
                    if (f.spawnError)
                        child.emit("error", new Error("late child error"));
                    const exitEvent = f.exitEvent ?? f.exit;
                    child.emit("exit", exitEvent.code, exitEvent.signal);
                    child.emit("close", f.exit.code, f.exit.signal);
                })
                .catch((error) => {
                    child.emit("error", error);
                    child.exitCode = 1;
                    child.emit("exit", 1, null);
                    child.emit("close", 1, null);
                });
            return child;
        },
    };
    const body = source.slice(source.indexOf("const root ="));
    await runInNewContext(
        `(async () => {${body.replaceAll("import.meta.url", JSON.stringify(new URL("./http-soak-check.mjs", import.meta.url).href))}})()`,
        context,
    );
    await pending;
    return {
        code: proc.exitCode,
        verification: JSON.parse(files.get(path("verification.json"))),
        kills,
        originalJson: files.get(path("http-soak.json")),
        originalMarkdown: files.get(path("http-soak.md")),
        executed: files.get(path("http-soak.executed.mjs")),
        patch: files.has(path("http-soak.patch.json"))
            ? JSON.parse(files.get(path("http-soak.patch.json")))
            : undefined,
        builds,
        spawns,
    };
}

for (const mode of ["complete", "before-exit", "during-exit"])
    test(`joint wrapper preserves byte-pinned observer and original sampling with ${mode} completion`, async () => {
        const f = legacyFixture();
        const original = readFileSync(process.env.LATENCY615_TEST_INPUT);
        f.runDriver = async (source, files, path, env) => {
            let now = 1000;
            const proc = new EventEmitter();
            const native = new EventEmitter();
            native.pid = 123;
            native.stdout = new EventEmitter();
            native.stderr = new EventEmitter();
            const append = (p, value) =>
                files.set(
                    p,
                    p.endsWith("server.stdout.log")
                        ? Buffer.concat([
                              Buffer.from(files.get(p) ?? ""),
                              Buffer.from(value),
                          ])
                        : (files.get(p) ?? "") + value,
                );
            const write = (p, value) => {
                files.set(p, String(value));
                if (mode === "before-exit" && p === path("http-soak.md"))
                    throw new Error("report-written-then-late-exception");
            };
            let stdout = "";
            Object.assign(proc, {
                env,
                pid: 456,
                cpuUsage: () => ({ user: 12, system: 3 }),
                stdout: { write: (value) => (stdout += value) },
                exit(code) {
                    if (mode === "during-exit")
                        throw new Error("after completion receipt");
                    f.exit = { code, signal: null };
                    this.emit("exit", code);
                },
            });
            const section = (start, end) =>
                source.slice(source.indexOf(start), source.indexOf(end));
            const hook = (id) =>
                section(
                    `/* latency615:${id}:begin */`,
                    `/* latency615:${id}:end */`,
                );
            const ctx = {
                Buffer,
                structuredClone,
                process: proc,
                performance: { now: () => now, timeOrigin: 1700000000000 },
                outDir: dirname(path("http-soak.json")),
                join,
                child: native,
                serverPath: "inert-server",
                smoke: true,
                os: {
                    release: () => "inert",
                    cpus: () => [],
                    totalmem: () => 1024,
                },
                gitCommit: () => "inert",
                target: "inert",
                serverLog: [],
                mix: [["big", 1]],
                readFileSync: (p) => files.get(p),
                writeFileSync: write,
                __l615Append: append,
                __l615Write: write,
                __diagAppendFileSync: append,
                console: { log: (value) => (stdout += value + "\n") },
                fetchStats: async () => ({
                    memory: { rss: 1000000 },
                    openSockets: 1,
                    activeResources: 2,
                    errors: 0,
                    uncaught: 0,
                }),
                procRss: () => 1000000,
                procFds: () => 10,
            };
            // Only pure original functions and inserted observer hooks execute.
            // No import, request, worker, timer, compiler or native process runs.
            const setup =
                source.slice(0, source.indexOf("import {")) +
                hook("runtime") +
                section("function envNumber", "const PATHS") +
                section("const BUCKET_BASE", "function sleep") +
                section("const counters = {", "let jsonLength") +
                "let loadStart = 0, crash = null; function elapsedSeconds() { return loadStart ? (performance.now()-loadStart)/1000 : 0; }\n" +
                section("const samples = [];", "// --- Run") +
                "const __l615SpawnBefore = 999;\n" +
                hook("server") +
                section("const __diagOut", "let stopping = false;");
            // Keep lexical declarations in one persistent VM for the original sampler.
            const { createContext, runInContext } = await import("node:vm");
            const sandbox = createContext(ctx);
            runInContext(setup + "\nvar baseline, after;", sandbox);
            native.stdout.emit("data", Buffer.from([0, 255, 10]));
            native.stderr.emit("data", Buffer.from("raw stderr\n"));
            await runInContext(
                'sample("baseline").then(s => baseline = s)',
                sandbox,
            );
            now = 2000;
            runInContext(
                "loadStart = 2000; lastSampleAt = loadStart;\n" + hook("start"),
                sandbox,
            );
            for (let i = 1; i <= 30; i++) {
                now = 2000 + i * 10000;
                const bin = i > 24 ? 842 : 818;
                runInContext(
                    `interval.requests = 10; interval.hist.n = 10; interval.hist.counts[${bin}] = 10; counters.ok += 10;`,
                    sandbox,
                );
                await runInContext('sample("load")', sandbox);
            }
            runInContext(
                "var loadSeconds = 300;\n" +
                    hook("stop") +
                    hook("drained") +
                    hook("settle"),
                sandbox,
            );
            now = 310000;
            await runInContext('sample("after").then(s => after = s)', sandbox);
            runInContext(hook("kill"), sandbox);
            native.emit("exit", 0, null);
            for (const stream of [native.stdout, native.stderr]) {
                stream.emit("end");
                stream.emit("close");
            }
            native.emit("close", 0, null);
            try {
                runInContext(
                    source.slice(source.indexOf("// --- Criteria")),
                    sandbox,
                );
            } catch (error) {
                proc.emit("uncaughtExceptionMonitor", error);
                proc.emit("exit", 1);
            }
            f.json = files.get(path("http-soak.json"));
            f.markdown = files.get(path("http-soak.md"));
            f.completion = JSON.parse(
                files.get(path("driver-completion.json")) || "null",
            );
            f.jsExit = JSON.parse(files.get(path("harness-exit.json")));
            f.stdout = stdout;
            f.driverErrors = files.get(path("driver-errors.jsonl"));
            const telemetry = JSON.parse(files.get(path("telemetry.json")));
            const rows = files
                .get(path("intervals.jsonl"))
                .trim()
                .split("\n")
                .map(JSON.parse);
            assert.equal(rows.length, 32);
            assert.equal(rows[1].histogram.counts[818], 10);
            assert.equal(rows[30].histogram.counts[842], 10);
            assert.deepEqual(rows[1].cpu, { mono: 12000, user: 12, system: 3 });
            assert.deepEqual(telemetry.headIndices, [7, 8, 9, 10, 11, 12]);
            assert.deepEqual(
                telemetry.tailIndices,
                [24, 25, 26, 27, 28, 29, 30],
            );
            assert.equal(telemetry.pass, false);
            if (mode === "before-exit") assert.equal(f.completion, null);
            else {
                assert.equal(f.completion.code, 1);
                assert.equal(f.completion.json, f.json);
                assert.equal(f.completion.markdown, f.markdown);
            }
            assert.equal(
                Buffer.from(files.get(path("server.stdout.log"))).toString(
                    "hex",
                ),
                "00ff0a",
            );
            assert.equal(files.get(path("server.stderr.log")), "raw stderr\n");
            const kinds = files
                .get(path("events.jsonl"))
                .trim()
                .split("\n")
                .map((line) => JSON.parse(line).kind);
            for (const kind of [
                "server.exit",
                "server.close",
                "server.stdout.end",
                "server.stdout.close",
                "server.stderr.end",
                "server.stderr.close",
                "harness.jsExit",
            ])
                assert.ok(kinds.includes(kind), kind);
        };
        const result = await wrapper(f);
        assert.equal(
            result.code,
            mode === "complete" ? 0 : 1,
            JSON.stringify(result.verification.failure),
        );
        if (mode === "complete")
            assert.equal(
                result.verification.correctnessSmoke.originalPass,
                false,
            );
        else
            assert.match(
                f.driverErrors,
                /late-exception|after completion receipt/,
            );
        assert.equal(JSON.parse(result.originalJson).summary.pass, false);
        const observed = patchDriver(original);
        const composed = policy.instrumentLegacyCompletion(
            observed.source.toString(),
        );
        // Remove wrapper logging, then recover every observer byte and the raw pin.
        const start = result.executed.indexOf("\nconst __diagOut");
        const end = result.executed.indexOf("let stopping = false;", start);
        const withoutLogging = (
            result.executed.slice(0, start) + result.executed.slice(end)
        ).replace(
            "import { appendFileSync as __diagAppendFileSync, mkdirSync,",
            "import { mkdirSync,",
        );
        assert.equal(withoutLogging, composed);
        assert.deepEqual(
            unpatchDriver(observed.source, result.patch.recipe),
            original,
        );
        assert.equal(result.patch.losslessSha256, sha256(observed.source));
        assert.equal(result.patch.executedSha256, sha256(result.executed));
    });

test("actual joint wrapper rejects changed raw byte pins before build or driver spawn", async () => {
    const original = readFileSync(process.env.LATENCY615_TEST_INPUT, "utf8");
    for (const sourceBytes of [
        Buffer.from(original + "\n"),
        Buffer.from(original.replace('big: "/big"', 'big: "/bad"')),
        Buffer.from(original.replace("p99Growth: 0.2", "p99Growth: 0.9")),
    ]) {
        const f = legacyFixture();
        f.sourceBytes = sourceBytes;
        const result = await wrapper(f);
        assert.equal(result.code, 1);
        assert.match(
            result.verification.failure.message,
            /original bytes|original source pin/,
        );
        assert.equal(result.builds, 0);
        assert.equal(result.spawns, 0);
        assert.equal(result.executed, undefined);
    }
});

test("real legacy wrapper accepts completed p99-only smoke without rewriting original pass/exit", async () => {
    const f = legacyFixture();
    const before = JSON.stringify(f);
    const r = await wrapper(f);
    assert.equal(
        r.code,
        0,
        JSON.stringify(r.verification.failure) ?? "wrapper should pass",
    );
    assert.equal(r.verification.pass, true);
    assert.equal(r.verification.correctnessSmoke.pass, true);
    assert.equal(r.verification.correctnessSmoke.originalPass, false);
    assert.equal(r.verification.exit.code, 1);
    assert.equal(r.originalJson, f.json);
    assert.equal(r.originalMarkdown, f.markdown);
    assert.equal(JSON.stringify(f), before);
    assert.equal((await wrapper(legacyFixture(true))).code, 0);
});

test("legacy rounded terminal timestamp remains legitimate completed evidence", async () => {
    const f = legacyFixture();
    f.completion.loadSeconds = 300.7;
    f.report.summary.loadSeconds = 301;
    f.report.samples.at(-2).t = 301;
    f.json = JSON.stringify(f.report);
    f.completion.json = f.json;
    assert.equal((await wrapper(f)).code, 0);
});

for (const [name, mutate] of [
    ...[
        "no crash",
        "no failed requests",
        "RSS growth after warm-up",
        "handles back to the baseline",
    ].map((name) => [
        name,
        (f) => (f.report.criteria.find((c) => c.name === name).pass = false),
    ]),
    ["missing criterion", (f) => f.report.criteria.pop()],
    [
        "duplicate criterion",
        (f) => f.report.criteria.push(f.report.criteria[0]),
    ],
    ["unknown criterion", (f) => (f.report.criteria[0].name = "unknown")],
    ["nonboolean verdict", (f) => (f.report.criteria[0].pass = "true")],
    ["missing value", (f) => delete f.report.criteria[0].value],
    ["non-smoke", (f) => (f.report.config.smoke = false)],
    ["wrong duration", (f) => (f.report.config.minutes = 4)],
    ["wrong mix", (f) => (f.report.mix = { text: 1 })],
    ["wrong concurrency", (f) => (f.report.config.connections = 2)],
    ["changed p99 ratio", (f) => (f.report.config.limits.p99Growth = 0.9)],
    ["RSS contradiction", (f) => (f.report.summary.rssTail = 1100000)],
    ["resource contradiction", (f) => (f.report.summary.after.fds = 15)],
    ["failed requests contradiction", (f) => (f.report.summary.failed = 1)],
    ["crash contradiction", (f) => (f.report.crash = { code: 17 })],
    ["missing post data", (f) => (f.report.summary.after = null)],
    ["incomplete duration", (f) => (f.report.summary.loadSeconds = 299)],
    ["missing samples", (f) => (f.report.samples = [])],
    ["missing post sample", (f) => f.report.samples.pop()],
    [
        "raw request error contradiction",
        (f) => (f.report.samples[10].failed = 1),
    ],
    ["raw server error", (f) => (f.report.samples[10].serverErrors = 1)],
    ["raw uncaught exception", (f) => (f.report.samples[10].uncaught = 1)],
    [
        "raw RSS contradiction",
        (f) => {
            for (const s of f.report.samples) if (s.t >= 240) s.rss = 1100000;
        },
    ],
    [
        "raw missing comparison latency",
        (f) => (f.report.samples[10].p99 = null),
    ],
    [
        "raw accounting contradiction",
        (f) => (f.report.samples[10].requests = 11),
    ],
    [
        "exit event differs from close",
        (f) => (f.exitEvent = { code: 17, signal: null }),
    ],
    ["late child error", (f) => (f.spawnError = true)],
    [
        "native server error",
        (f) =>
            (f.serverEvents =
                '{"event":"spawn","pid":123}\n{"event":"error","message":"late"}\n{"event":"exit","code":0,"signal":null}\n'),
    ],
    [
        "native abnormal exit",
        (f) =>
            (f.serverEvents =
                '{"event":"spawn","pid":123}\n{"event":"exit","code":17,"signal":null}\n'),
    ],
    [
        "duplicate server exit",
        (f) =>
            (f.serverEvents =
                '{"event":"spawn","pid":123}\n{"event":"exit","code":0,"signal":null}\n{"event":"exit","code":0,"signal":null}\n'),
    ],
    ["malformed report", (f) => (f.json = "{")],
    ["missing report", (f) => (f.json = "")],
    ["contradictory original pass", (f) => (f.report.summary.pass = true)],
    ["contradictory exit zero", (f) => (f.exit.code = 0)],
    ["unexpected code", (f) => (f.exit.code = 2)],
    ["signal", (f) => (f.exit = { code: null, signal: "SIGTERM" })],
    ["missing JS exit", (f) => (f.jsExit = null)],
    ["contradictory JS exit", (f) => (f.jsExit.code = 0)],
    ["missing completion", (f) => (f.completion = null)],
    ["wrong completion report", (f) => (f.completion.json = "{}")],
    ["missing Markdown", (f) => (f.markdown = "")],
    ["truncated final stdout", (f) => (f.stdout = "FAIL")],
    ["late stderr exception", (f) => (f.stderr = "Error: late exception\n")],
    [
        "late exception receipt",
        (f) => (f.driverErrors = '{"name":"Error","message":"late"}\n'),
    ],
]) {
    test(`real legacy wrapper fails closed: ${name}`, async () => {
        const f = legacyFixture();
        mutate(f);
        // Consistent receipts isolate report validation from transport validation.
        if (!name.includes("report") && name !== "malformed report") {
            f.json = JSON.stringify(f.report);
            if (f.completion && name !== "wrong completion report")
                f.completion.json = f.json;
        }
        assert.equal((await wrapper(f)).code, 1);
    });
}

function currentDecision(e, covered = true) {
    const source = readFileSync(
        new URL("./http-soak.mjs", import.meta.url),
        "utf8",
    );
    const section = source.slice(
        source.indexOf("    const { criteria, summary } = evaluateRun({"),
        source.indexOf("\n}\n\nmain()"),
    );
    const files = new Map();
    const receipt = {
        checkoutDirty: false,
        server: {
            kind: "native",
            target: "linux-x64",
            measuredSourceCommit: "b".repeat(40),
            imageSha256: "a".repeat(64),
            sourceCommitBasis: "built from checkout",
        },
        machine: { cpu: "synthetic", cpus: 1, memory: 1024 },
        commit: "b".repeat(40),
    };
    const routes = [
        "text",
        "json",
        "big",
        "echo",
        "close",
        "slow",
        "missing",
        "throw",
    ];
    const code = runInNewContext(`(() => {${section}})()`, {
        ...e,
        evaluateRun,
        acceptancePass,
        receipt,
        failureExamples: [],
        counters: e.counters,
        mix: routes.map((r) => [r, 1]),
        routeCounts: Object.fromEntries(
            routes.map((r) => [r, covered ? 1 : 0]),
        ),
        process: { version: "synthetic" },
        serverLog: [],
        NEAR_CRASH_MS: 2000,
        outDir: "OUT",
        join,
        console: { log() {} },
        writeFileSync: (p, text) => files.set(p, text),
    });
    return {
        code,
        report: JSON.parse(files.get(join("OUT", "http-soak.json"))),
        markdown: files.get(join("OUT", "http-soak.md")),
    };
}

test("actual current final decision returns smoke correctness status and reports original failed p99", () => {
    const result = currentDecision(evidence());
    assert.equal(result.code, 0);
    assert.equal(result.report.summary.pass, true);
    assert.equal(result.report.summary.originalPass, false);
    assert.equal(result.report.summary.acceptancePass, false);
    assert.equal(
        result.report.criteria.find((c) => c.name === "p99 latency stable")
            .pass,
        false,
    );
    assert.match(result.markdown, /non-gating smoke observation/);
    assert.match(result.markdown, /\*\*FAIL\*\*/);
    assert.equal(currentDecision(evidence(), false).code, 1);
    assert.equal(currentDecision(evidence(false, 1.4)).code, 1);
    assert.equal(
        currentDecision(evidence(false, 1)).report.summary.acceptancePass,
        true,
    );
    for (const mutate of [
        (e) => (e.crash = { code: 17, signal: null }),
        (e) => (e.loadSeconds = 100),
        (e) => (e.counters.failed = 1),
        (e) => {
            for (const s of e.samples) if (s.t > 9000) s.rss = 1100000;
        },
        (e) => (e.after = { ...e.after, activeResources: 5 }),
        (e) => (e.histograms[15] = newHistogram()),
    ]) {
        const e = evidence(false, 1);
        mutate(e);
        const r = currentDecision(e);
        assert.equal(r.code, 1);
        assert.equal(r.report.summary.acceptancePass, false);
    }
});

test("real wrapper final native orphan cleanup remains effective on rejected smoke", async () => {
    const f = legacyFixture();
    f.serverEvents = '{"event":"spawn","pid":123}\n';
    const result = await wrapper(f);
    assert.equal(result.code, 1);
    assert.equal(result.verification.pass, false);
    assert.deepEqual(result.kills, [[123, "SIGKILL"]]);
    assert.equal(result.verification.orphanCleanup.pid, 123);
});

test("actual terminal instrumentation records normal completion and uncaught late exceptions", async () => {
    const f = legacyFixture();
    // A tiny owned terminal fixture exercises inserted code, not pinned source.
    const terminal = `
writeFileSync(join(outDir, "http-soak.json"), json);
writeFileSync(join(outDir, "http-soak.md"), markdown);
if (beforeExitError) throw new Error("report-written-then-late-exception");
process.exit(pass ? 0 : 1);
`;
    assert.equal(typeof policy.instrumentLegacyCompletion, "function");
    for (const mode of ["complete", "before-exit", "during-exit"]) {
        const files = new Map();
        const proc = new EventEmitter();
        proc.env = { NONA_SOAK_DIAGNOSTICS: "OUT" };
        proc.exit = () => {
            if (mode === "during-exit")
                throw new Error("after completion receipt");
        };
        const text = policy.instrumentLegacyCompletion(terminal);
        try {
            runInNewContext(text, {
                process: proc,
                join,
                outDir: "OUT",
                pass: false,
                json: f.json,
                markdown: f.markdown,
                loadSeconds: 300,
                p99Head: f.completion.p99Head,
                p99Tail: f.completion.p99Tail,
                beforeExitError: mode === "before-exit",
                readFileSync: (p) => files.get(p),
                writeFileSync: (p, s) => files.set(p, s),
                __diagAppendFileSync: (p, s) =>
                    files.set(p, (files.get(p) ?? "") + s),
            });
        } catch (error) {
            proc.emit("uncaughtExceptionMonitor", error);
        }
        assert.equal(files.get(join("OUT", "http-soak.json")), f.json);
        assert.equal(files.get(join("OUT", "http-soak.md")), f.markdown);
        if (mode === "complete") {
            assert.ok(files.has(join("OUT", "driver-completion.json")));
            assert.equal(files.has("OUT/driver-errors.jsonl"), false);
        } else {
            assert.match(files.get("OUT/driver-errors.jsonl"), /Error/);
            const bad = legacyFixture();
            bad.completion =
                mode === "before-exit"
                    ? null
                    : JSON.parse(
                          files.get(join("OUT", "driver-completion.json")),
                      );
            bad.driverErrors = files.get("OUT/driver-errors.jsonl");
            assert.equal((await wrapper(bad)).code, 1);
        }
    }
    for (const changed of [
        "",
        terminal + "throw new Error();",
        terminal + terminal,
    ])
        assert.throws(() => policy.instrumentLegacyCompletion(changed));
});
