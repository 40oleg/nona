import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";

const P99 = "p99 latency stable";
const LEGACY_CRITERIA = [
    "no crash",
    "no failed requests",
    "RSS growth after warm-up",
    "handles back to the baseline",
    P99,
];

export function configuredPass(config, criteria) {
    if (config.smoke === true) {
        for (const c of criteria) {
            if (c.name === P99) {
                c.gating = false;
                c.observation =
                    "non-gating smoke observation; original verdict retained";
            }
        }
    }
    return criteria.every(
        (c) => c.pass === true || (config.smoke === true && c.name === P99),
    );
}

// Insert receipts around the pinned driver's original final exit. Do not change
// its report, criteria, console output, exit code or server cleanup.
export function instrumentLegacyCompletion(source) {
    const terminal = "process.exit(pass ? 0 : 1);";
    assert.equal(source.split(terminal).length, 2, "legacy final exit changed");
    assert.ok(
        source.trimEnd().endsWith(terminal),
        "legacy driver has trailing code",
    );
    return (
        `process.on("uncaughtExceptionMonitor", error => {
    __diagAppendFileSync(process.env.NONA_SOAK_DIAGNOSTICS + "/driver-errors.jsonl", JSON.stringify({name: error.name, message: error.message, stack: error.stack}) + "\\n");
});\n` +
        source.replace(
            terminal,
            `writeFileSync(join(outDir, "driver-completion.json"), JSON.stringify({
    code: pass ? 0 : 1, loadSeconds, p99Head, p99Tail,
    json: readFileSync(join(outDir, "http-soak.json"), "utf8"),
    markdown: readFileSync(join(outDir, "http-soak.md"), "utf8")
}));
${terminal}`,
        )
    );
}

// Called by the actual wrapper after close, before its unchanged final cleanup.
// Invalid or contradictory evidence throws; it can never become a smoke pass.
export function legacyCorrectnessSmoke({
    json,
    markdown,
    stdout,
    stderr,
    exit,
    jsExit,
    completion,
    driverErrors,
    events,
    serverEvents,
}) {
    const r = JSON.parse(json);
    const { config: c, summary: s, criteria, samples } = r;
    assert.equal(r.test, "http-soak");
    assert.equal(c.smoke, true);
    for (const [key, expected] of Object.entries({
        minutes: 5,
        warmupMinutes: 1,
        windowMinutes: 1,
        sampleSeconds: 10,
        connections: 1,
        pauseMs: 0,
        requestTimeoutMs: 30000,
        settleSeconds: 8,
    }))
        assert.equal(c[key], expected, `unexpected legacy ${key}`);
    assert.deepEqual(c.limits, {
        rssGrowth: 0.1,
        p99Growth: 0.2,
        p99SlackMs: 0.5,
        socketSlack: 2,
        fdSlack: 4,
        resourceSlack: 2,
    });
    assert.deepEqual(r.mix, { big: 1 });
    assert.equal(r.crash, null);
    assert.equal(r.failure, undefined);
    assert.ok(Array.isArray(r.serverLog));
    assert.ok(Array.isArray(criteria));
    assert.deepEqual(
        criteria.map((c) => c.name),
        LEGACY_CRITERIA,
    );
    for (const criterion of criteria) {
        assert.equal(typeof criterion.pass, "boolean");
        assert.equal(typeof criterion.value, "string");
        assert.equal(typeof criterion.limit, "string");
        assert.ok(criterion.value.length && criterion.limit.length);
    }
    const originalPass = criteria.every((c) => c.pass);
    assert.equal(s.pass, originalPass);
    const code = originalPass ? 0 : 1;
    assert.equal(exit.code, code);
    assert.equal(exit.signal, null);
    assert.equal(
        events.map((e) => e.event).join(","),
        "harness.spawn,harness.exit,harness.close",
    );
    for (const event of events.slice(1)) {
        assert.equal(event.code, code);
        assert.equal(event.signal, null);
    }
    assert.equal(serverEvents.map((e) => e.event).join(","), "spawn,exit");
    assert.ok(
        Number.isSafeInteger(serverEvents[0].pid) && serverEvents[0].pid > 0,
    );
    const serverExit = serverEvents[1];
    assert.ok(
        ((serverExit.code === 0 || serverExit.code === 1) &&
            serverExit.signal === null) ||
            (serverExit.code === null && serverExit.signal === "SIGTERM"),
        "unexpected native server termination",
    );
    assert.equal(jsExit.code, code);
    assert.equal(completion.code, code);
    assert.equal(completion.json, json);
    assert.equal(completion.markdown, markdown);
    assert.equal(stderr, "", "driver stderr is not clean");
    assert.equal(driverErrors, "", "driver raised an uncaught exception");
    assert.ok(
        Number.isFinite(completion.loadSeconds) &&
            completion.loadSeconds >= 300,
    );
    assert.equal(s.loadSeconds, Math.round(completion.loadSeconds));
    assert.equal(s.failed, 0);
    assert.ok(Number.isSafeInteger(s.ok) && s.ok >= 100);
    assert.deepEqual(s.deliberate, { missing: 0, throw: 0, slowAborted: 0 });
    assert.equal(s.requests, s.ok);
    assert.deepEqual(s.failures, {});
    assert.deepEqual(s.failuresNearCrash, {});
    assert.deepEqual(s.failureExamples, []);
    assert.ok(
        Number.isFinite(s.rssHead) &&
            s.rssHead > 0 &&
            Number.isFinite(s.rssTail),
    );
    assert.equal(
        criteria[2].pass,
        (s.rssTail - s.rssHead) / s.rssHead < c.limits.rssGrowth,
    );
    const handles = ["openSockets", "fds", "activeResources"];
    const slacks = [2, 4, 2];
    assert.ok(s.baseline && s.after, "missing post-load data");
    const available = handles.filter(
        (key) => s.baseline[key] !== null && s.after[key] !== null,
    );
    assert.ok(available.length > 0);
    for (const key of available) {
        assert.ok(
            Number.isSafeInteger(s.baseline[key]) && s.baseline[key] >= 0,
        );
        assert.ok(Number.isSafeInteger(s.after[key]) && s.after[key] >= 0);
        assert.ok(
            s.after[key] <= s.baseline[key] + slacks[handles.indexOf(key)],
        );
    }
    for (const key of ["p99Head", "p99Tail"]) {
        assert.ok(Number.isFinite(completion[key]) && completion[key] > 0);
        assert.equal(s[key], Math.round(completion[key] * 1000) / 1000);
    }
    assert.equal(
        criteria[4].pass,
        completion.p99Tail / completion.p99Head - 1 <= c.limits.p99Growth ||
            completion.p99Tail - completion.p99Head <= c.limits.p99SlackMs,
    );
    assert.ok(Array.isArray(samples) && samples.length >= 32);
    assert.equal(samples[0].phase, "baseline");
    assert.equal(samples.at(-1).phase, "after");
    assert.ok(samples.at(-1).t >= completion.loadSeconds);
    const load = samples.slice(1, -1);
    assert.ok(load.length >= 30);
    for (const [i, sample] of load.entries()) {
        assert.equal(sample.phase, "load");
        assert.ok(
            Number.isFinite(sample.t) && sample.t > (i ? load[i - 1].t : 0),
        );
        assert.ok(sample.t - (i ? load[i - 1].t : 0) <= 11);
        assert.ok(Number.isFinite(sample.rss) && sample.rss > 0);
        assert.ok(Number.isFinite(sample.p99) && sample.p99 > 0);
    }
    for (const sample of samples) {
        assert.ok(
            Number.isSafeInteger(sample.requests) && sample.requests >= 0,
        );
        assert.equal(sample.failed, 0);
        assert.equal(sample.serverErrors, 0);
        assert.equal(sample.uncaught, 0);
        assert.equal(sample.deliberate, 0);
    }
    assert.equal(
        samples.reduce((n, sample) => n + sample.requests, 0),
        s.requests,
    );
    const head = load.filter((sample) => sample.t > 60 && sample.t <= 121);
    const tail = load.filter(
        (sample) => sample.t >= completion.loadSeconds - 61,
    );
    const medianRss = (window) => {
        assert.ok(window.length >= 6, "missing comparison coverage");
        const values = window.map((sample) => sample.rss).sort((a, b) => a - b);
        const middle = values.length >> 1;
        return values.length % 2
            ? values[middle]
            : (values[middle - 1] + values[middle]) / 2;
    };
    assert.equal(s.rssHead, medianRss(head));
    assert.equal(s.rssTail, medianRss(tail));
    assert.ok(
        load.at(-1).t >= 300 &&
            load.at(-1).t <= Math.round(completion.loadSeconds),
    );
    for (const [key, value] of Object.entries(s.baseline))
        assert.ok(isDeepStrictEqual(samples[0][key], value));
    for (const [key, value] of Object.entries(s.after))
        assert.ok(isDeepStrictEqual(samples.at(-1)[key], value));
    const verdict = originalPass ? "PASS" : "FAIL";
    assert.ok(markdown.startsWith(`# HTTP soak test: ${verdict}\n`));
    assert.ok(markdown.includes("| Phase |"));
    for (const criterion of criteria) {
        assert.ok(
            markdown.includes(
                `| ${criterion.name} | ${criterion.value} | ${criterion.limit} | ${criterion.pass ? "pass" : "**FAIL**"} |`,
            ),
        );
    }
    const finalLines = criteria
        .map(
            (c) =>
                `${c.pass ? "pass" : "FAIL"}  ${c.name}: ${c.value} (limit ${c.limit})`,
        )
        .join("\n");
    assert.match(stdout, /\n(?:PASS|FAIL); reports in [^\r\n]+\r?\n$/);
    assert.ok(
        stdout
            .replaceAll("\r\n", "\n")
            .includes(finalLines + `\n\n${verdict}; reports in `),
    );
    assert.ok(
        criteria.slice(0, -1).every((c) => c.pass),
        "non-p99 criterion failed",
    );
    return {
        pass: true,
        originalPass,
        acceptancePass: false,
        p99: {
            ...criteria[4],
            gating: false,
            observation:
                "non-gating smoke observation; original verdict retained",
        },
    };
}
