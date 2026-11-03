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

const policyUrl = new URL("./http-soak-smoke-policy.mjs", import.meta.url);
const policy = existsSync(policyUrl) ? await import(policyUrl) : {};

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
    const files = new Map();
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
    const tiny =
        'import { mkdirSync, readFileSync, writeFileSync } from "node:fs";\nlet stopping = false;\nprocess.exit(pass ? 0 : 1);\n';
    const context = {
        ...policy,
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
            if (String(p).endsWith("http-soak.mjs")) return tiny;
            if (
                String(p).endsWith("soak-server.mjs") ||
                String(p).endsWith("cli.js") ||
                /soak-server(?:\.exe)?$/.test(String(p))
            )
                return "tiny owned fixture";
            throw new Error("unavailable fixture: " + p);
        },
        spawnSync: (cmd) =>
            cmd === "git"
                ? {
                      status: 0,
                      stdout: "ab5ea083d793e0a665fde8b0a4b33bc1fa67208e\n",
                  }
                : { status: 0 },
        spawn() {
            pending = Promise.resolve().then(() => {
                files.set(path("harness-exit.json"), JSON.stringify(f.jsExit));
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
                child.stdout.emit(
                    "data",
                    f.stdout.replaceAll("OUT", resolve("work/http-601/soak")),
                );
                child.stderr.emit("data", f.stderr);
                child.exitCode = f.exit.code;
                child.signalCode = f.exit.signal;
                if (f.spawnError)
                    child.emit("error", new Error("late child error"));
                const exitEvent = f.exitEvent ?? f.exit;
                child.emit("exit", exitEvent.code, exitEvent.signal);
                child.emit("close", f.exit.code, f.exit.signal);
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
    };
}

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
