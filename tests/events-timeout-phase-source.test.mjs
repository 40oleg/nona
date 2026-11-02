import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { constants, setPriority } from "node:os";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import {
    timeoutImports,
    timeoutFuture,
    timeoutAllDue,
    timeoutExpected,
    timeoutAllDueExpected,
} from "./helpers/abort-timeout-fixture.ts";

setPriority(0, constants.priority.PRIORITY_BELOW_NORMAL);
const read = (path) =>
    readFileSync(new URL("../" + path, import.meta.url), "utf8").replace(
        /\r\n?/g,
        "\n",
    );
const timers = read("src/lib/runtime/timers.js");
const events = read("src/lib/runtime/events.js");
const original = readFileSync(
    new URL("./fixtures/abort-timeout/original.mjs", import.meta.url),
);
const originalBody = original.toString().slice(original.indexOf(10) + 1);

// Use the real timer/events sources, replacing only the host clock/wait and
// process exit registration. No native emission or real waiting in these cases.
function run(
    body,
    { source = timers, entry = 0, pause = 1100, waitResult = "timed-out" } = {},
) {
    let clock = 0;
    const lines = [],
        scheduled = [],
        exits = [];
    const observed = source.replace(
        "        push(timer);\n        return id;",
        "        observe(timer);\n        push(timer);\n        return id;",
    );
    assert.notEqual(observed, source, "unique schedule anchor");
    const context = {
        __nonaHostNow: () => clock,
        __nonaHostWait: (delay) => {
            clock += delay;
        },
        observe: (timer) =>
            scheduled.push([timer.delay, timer.when, timer.referenced]),
        advance: () => {
            clock += entry;
        },
        Date: { now: () => clock },
        Atomics: {
            wait: (_view, _index, _value, delay) => {
                assert.equal(delay, 1100);
                clock += pause;
                return waitResult;
            },
        },
        process: {
            on: (name, fn) => {
                assert.equal(name, "exit");
                exits.push(fn);
            },
        },
        console: { log: (...values) => lines.push(values.join(" ")) },
    };
    runInNewContext(
        "var __nonaRegexpVm={enqueueJob:function(fn){fn()}};var __nonaPromiseDrainJobs=function(){};" +
            observed +
            events +
            body +
            ";advance();__nonaPromiseDrainJobs();",
        context,
    );
    for (const exit of exits) exit();
    return {
        stdout: lines.join("\n") + "\n",
        scheduled,
        clock,
        exits,
        context,
    };
}

test("future timer is scheduled in the last referenced callback even after delayed setup", () => {
    for (const entry of [0, 1100]) {
        const result = run(timeoutFuture, { entry });
        assert.equal(result.stdout, "timeout TimeoutError\nlive true false\n");
        const last = entry || 20;
        assert.deepEqual(result.scheduled, [
            [1, 1, false],
            [20, 20, true],
            [1000, last + 1000, false],
        ]);
        assert.equal(
            result.clock,
            last,
            "must exit without waiting for late unref",
        );
    }
});

test("future signal has an outer strong binding captured by a live exit listener", () => {
    const result = run(timeoutFuture);
    assert.equal(result.exits.length, 1);
    // The callback must read the outer binding; dropping it cannot silently pass.
    runInNewContext("later = undefined", result.context);
    assert.throws(() => result.exits[0](), /retained timeout signal/);
});

test("all-due setup is guarded and requires exactly three lines", () => {
    const result = run(timeoutAllDue);
    assert.equal(
        result.stdout,
        "timeout TimeoutError\nlive true false\nunexpected\n",
    );
    assert.deepEqual(result.scheduled, [
        [1, 1, false],
        [1000, 1000, false],
        [20, 20, true],
    ]);
    assert.equal(result.clock, 1100);
    for (const options of [
        { pause: 0 },
        { pause: 1099 },
        { waitResult: "not-equal" },
        { waitResult: "ok" },
    ])
        assert.throws(() => run(timeoutAllDue, options), /all-due setup pause/);
});

test("referencing only the late timer in memory keeps staged future alive and prints the third line", () => {
    const referenced = timers.replace(
        "referenced: !unreferenced,",
        "referenced: !unreferenced || d === 1000,",
    );
    assert.notEqual(referenced, timers);
    const result = run(timeoutFuture, { source: referenced });
    assert.equal(
        result.stdout,
        "timeout TimeoutError\nlive true false\nunexpected\n",
    );
    assert.equal(result.clock, 1020);
    assert.deepEqual(result.scheduled, [
        [1, 1, false],
        [20, 20, true],
        [1000, 1020, true],
    ]);
});

test("all-due contract rejects an early break after the last referenced callback", () => {
    const broken = timers.replace(
        "                drain();\n            }\n            if (immediateHead",
        "                drain();\n                if (referenced === 0) break;\n            }\n            if (immediateHead",
    );
    assert.notEqual(broken, timers);
    assert.equal(
        run(timeoutFuture, { source: broken }).stdout,
        timeoutExpected,
    );
    assert.notEqual(
        run(timeoutAllDue, { source: broken }).stdout,
        timeoutAllDueExpected,
    );
});

test("original fixture bytes and historical all-due result stay pinned independently of the current body", () => {
    assert.equal(
        createHash("sha256").update(original).digest("hex"),
        "912309ce70d7e31624f54c19f233fb3a8f91fcce0db9a3578d34c9e30256e27f",
    );
    assert.notEqual(timeoutFuture, originalBody);
    assert.equal(
        run(originalBody, { entry: 1100 }).stdout,
        timeoutAllDueExpected,
    );
    assert.equal(timeoutExpected, "timeout TimeoutError\nlive true false\n");
    assert.equal(
        timeoutAllDueExpected,
        "timeout TimeoutError\nlive true false\nunexpected\n",
    );
});

test("tiny actual Node future and all-due controls have exact output and clean exit", () => {
    for (const [body, expected] of [
        [timeoutFuture, timeoutExpected],
        [timeoutAllDue, timeoutAllDueExpected],
    ]) {
        const child = spawnSync(
            process.execPath,
            ["--input-type=module", "-e", timeoutImports + body],
            { encoding: "utf8", timeout: 10000, windowsHide: true },
        );
        assert.equal(child.error, undefined);
        assert.equal(child.signal, null);
        assert.equal(child.status, 0, child.stderr);
        assert.equal(child.stderr, "");
        assert.equal(child.stdout, expected);
    }
});

test("negative Node diagnostic retains exact source, output, original SHA and contract metadata", () => {
    const child = spawnSync(
        process.execPath,
        ["scripts/diagnose-abort-timeout.mjs", "--case=future-referenced"],
        { encoding: "utf8", timeout: 10000, windowsHide: true },
    );
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.signal, null);
    assert.equal(child.stderr, "");
    const directory = child.stdout
        .match(/Retained diagnostics: (.+)/u)?.[1]
        .trim();
    assert.ok(directory);
    const metadata = JSON.parse(
        readFileSync(join(directory, "metadata.json"), "utf8"),
    );
    assert.equal(metadata.native, false);
    assert.equal(metadata.contract, "future-referenced");
    assert.equal(metadata.setupPauseMs, 0);
    assert.equal(
        metadata.expected,
        "timeout TimeoutError\nlive true false\nunexpected\n",
    );
    assert.equal(
        metadata.hashes.originalFixtureBytes,
        "912309ce70d7e31624f54c19f233fb3a8f91fcce0db9a3578d34c9e30256e27f",
    );
    assert.deepEqual(readFileSync(join(directory, "original.mjs")), original);
    assert.equal(
        readFileSync(join(directory, "main.mjs"), "utf8"),
        timeoutImports + timeoutFuture,
    );
    assert.equal(
        readFileSync(join(directory, "node-future-referenced.stdout"), "utf8"),
        metadata.expected,
    );
    assert.equal(
        metadata.hashes.fixture,
        createHash("sha256")
            .update(timeoutImports + timeoutFuture)
            .digest("hex"),
    );
    assert.notEqual(
        metadata.hashes.effectiveTimers,
        metadata.hashes["src/lib/runtime/timers.js"],
    );
});

test("native diagnostic refuses a non-hosted process before any compilation", () => {
    const child = spawnSync(
        process.execPath,
        ["scripts/diagnose-abort-timeout.mjs", "--native", "--case=all-due"],
        {
            encoding: "utf8",
            timeout: 10000,
            windowsHide: true,
            env: {
                ...process.env,
                GITHUB_ACTIONS: "false",
                RUNNER_ENVIRONMENT: "local",
            },
        },
    );
    assert.equal(child.error, undefined);
    assert.equal(child.status, 1);
    assert.equal(child.stdout, "");
    assert.match(child.stderr, /AssertionError/);
});
