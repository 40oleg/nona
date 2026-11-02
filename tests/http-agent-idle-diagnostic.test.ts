import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { EventEmitter } from "node:events";

const load = () =>
    import(
        pathToFileURL(resolve("scripts/http-agent-idle-diagnostic.mjs")).href
    );

test("idle diagnostic finish observer reaches actual hasListener-gated _sent once per response", async () => {
    const d = await load();
    const { agentCases } = await import(
        pathToFileURL(resolve("tests/helpers/http-agent-cases.ts")).href
    );
    const { agentProgram } = await import(
        pathToFileURL(resolve("tests/helpers/http-agent-policy.ts")).href
    );
    const witness = agentCases.find(
        (c: { id: string }) => c.id === "idle-timeout",
    );
    const tracePlan = d.makePlan(witness, agentProgram)[3];
    const source = tracePlan.source;
    const httpSource = readFileSync("src/lib/modules/http.js", "utf8");
    const method = httpSource
        .split("    _sent(error) {")
        .at(-1)!
        .split("    _afterFinish()")[0]!;
    const hasListener = httpSource
        .split("function hasListener(emitter, type) {")[1]!
        .split("\n}")[0]!;
    const sent = Function(
        "later",
        "function hasListener(emitter, type) {" +
            hasListener +
            "\n}\nreturn ({ _sent(error) {" +
            method +
            "})._sent;",
    )((res: EventEmitter) => res.emit("finish"));
    const codes: number[] = [];
    const observe = (
        handler: (req: { url: string }, res: EventEmitter) => void,
    ) => {
        const response = Object.assign(new EventEmitter(), {
            socket: null,
            _connection: null,
            writableFinished: false,
            end() {
                sent.call(this);
            },
        });
        handler({ url: "/first" }, response);
        return response.writableFinished;
    };
    const makeHandler = (program: string) =>
        Function(
            "http",
            "record",
            "return " +
                program
                    .split("const server = ")[1]!
                    .split("server.on('connection'")[0]!,
        )({ createServer: (callback: unknown) => callback }, (code: number) =>
            codes.push(code),
        );
    // Preserve and execute the existing Node emit observer against the pinned
    // native gate: it cannot observe finish without an actual listener.
    assert.equal(observe(makeHandler(tracePlan.controls[0].source)), true);
    assert.equal(codes.length, 0);
    const handler = makeHandler(source);
    observe(handler);
    assert.deepEqual(codes, [2]);
    observe(handler);
    assert.deepEqual(
        codes,
        [2, 2],
        "one finish observation per response, no double emission",
    );
});

test("idle diagnostic supplementary timing pair preserves staged native wrapper and differs only by guarded hold", async () => {
    const d = await load();
    assert.equal(typeof d.makeTimingPair, "function");
    const { agentCases } = await import(
        pathToFileURL(resolve("tests/helpers/http-agent-cases.ts")).href
    );
    const { agentProgram } = await import(
        pathToFileURL(resolve("tests/helpers/http-agent-policy.ts")).href
    );
    const witness = agentCases.find(
        (c: { id: string }) => c.id === "idle-timeout",
    );
    const pair = d.makeTimingPair(witness, agentProgram);
    assert.deepEqual(
        pair.map((entry: { id: string }) => entry.id),
        ["node-native-stress-baseline", "node-native-stress-prearm-hold"],
    );
    for (const entry of pair) {
        assert.equal(entry.boundMs, 60000);
        assert.equal(entry.cleanupWatchdogMs, null);
        assert.match(
            entry.source,
            /^function cleanupWatchdog\(callback\) \{ return undefined; \}/,
        );
        assert.doesNotMatch(entry.source, /setTimeout\(callback, 6000\)/);
        assert.match(
            entry.source,
            /await first.done;\nawait new Promise\(resolve => setImmediate\(resolve\)\);\nconsole.log\('idle'\);/,
        );
    }
    assert.equal(pair[0].holdMs, 0);
    assert.equal(pair[1].holdMs, 7000);
    const delayed = pair[1].source;
    const hold = delayed.slice(
        delayed.indexOf("const holdStarted"),
        delayed.indexOf("armDestroyed = firstSocket.destroyed;"),
    );
    assert.equal(delayed.replace(hold, ""), pair[0].source);
    assert.match(hold, /Atomics.wait\(holdCell, 0, 0, 7000\)/);
    assert.match(hold, /holdResult !== 'timed-out'/);
    assert.match(hold, /holdElapsed < 7000/);
    assert.doesNotMatch(hold, /while|for\s*\(|setTimeout/);
});

test("idle diagnostic supplementary parser retains both actual outcomes and rejects missing duplicate incomplete or extra evidence", async () => {
    const d = await load();
    assert.equal(typeof d.compareTimingPair, "function");
    const dir = mkdtempSync(join(tmpdir(), "idle616-pair-parser-"));
    const expected =
        "body /first false\nidle\ntimed out 1 true\nbody /second false\nreplacement true 2\n";
    const output = (count: number, delayed: boolean) =>
        expected.replace("timed out 1", "timed out " + count) +
        "diagnostic scalar false true\n" +
        (delayed
            ? "diagnostic timing timed-out 7000.5\n"
            : "diagnostic timing not-run 0\n");
    try {
        const baseline = outputReceipt(
            dir,
            "node-native-stress-baseline",
            output(1, false),
        );
        const delayed = outputReceipt(
            dir,
            "node-native-stress-prearm-hold",
            output(0, true),
        );
        const before = structuredClone([baseline, delayed]);
        const observed = d.compareTimingPair([baseline, delayed], expected);
        assert.equal(observed.ok, true);
        assert.equal(observed.hypothesisConfirmed, true);
        assert.deepEqual(
            observed.observations.map((o: { timedOut: number }) => o.timedOut),
            [1, 0],
        );
        assert.deepEqual([baseline, delayed], before);
        const unconfirmed = outputReceipt(dir, delayed.id, output(1, true));
        const actual = d.compareTimingPair([baseline, unconfirmed], expected);
        assert.equal(
            actual.ok,
            true,
            "a prediction is not an acceptance criterion",
        );
        assert.equal(actual.hypothesisConfirmed, false);
        assert.equal(actual.observations[1].timedOut, 1);
        for (const runs of [
            [],
            [baseline],
            [baseline, baseline],
            [delayed, baseline],
            [baseline, delayed, delayed],
        ])
            assert.equal(d.compareTimingPair(runs, expected).ok, false);
        for (const text of [
            output(0, true).replace("timed-out", "not-equal"),
            output(0, true).replace("7000.5", "5999"),
            output(0, true).replace("7000.5", "NaN"),
            output(0, true).replace("replacement true 2", "replacement true 3"),
            output(0, true) + "extra\n",
            output(0, true).replace("diagnostic scalar false true\n", ""),
            output(0, true).slice(0, -1),
        ]) {
            const malformed = outputReceipt(dir, delayed.id, text);
            assert.equal(
                d.compareTimingPair([baseline, malformed], expected).ok,
                false,
            );
        }
        const incomplete = {
            ...delayed,
            pipes: { ...delayed.pipes, stdoutClosed: false },
        };
        assert.equal(
            d.compareTimingPair([baseline, incomplete], expected).ok,
            false,
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

// Exercise the real comparator without native compilation or network access.
// Each mock has complete process provenance and actual, hash-checked raw files.
function outputReceipt(directory: string, id: string, stdout: string) {
    const artifact = (stream: string, text: string) => {
        const path = join(directory, id + "." + stream + ".bin");
        const bytes = Buffer.from(text);
        writeFileSync(path, bytes);
        return {
            path,
            bytes: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
        };
    };
    return {
        id,
        status: 0,
        signal: null,
        error: null,
        deadlineExceeded: false,
        forcedPipeCleanup: false,
        exitSeen: true,
        closeSeen: true,
        durationMs: 1,
        startedAt: "2026-11-01T00:00:00Z",
        command: "mock-process",
        args: [],
        cwd: directory,
        events: [{ event: "exit" }, { event: "close" }],
        stdout: artifact("stdout", stdout),
        stderr: artifact("stderr", ""),
        pipes: {
            stdoutEnded: true,
            stderrEnded: true,
            stdoutClosed: true,
            stderrClosed: true,
        },
    };
}

for (const id of ["original-stress", "normal-off"]) {
    test(`idle diagnostic ${id} compares full stdout without discarding diagnostic markers`, async (t) => {
        const d = await load();
        const directory = mkdtempSync(join(tmpdir(), "idle616-exact-"));
        try {
            for (const [name, stdout, ok] of [
                ["exact LF", "expected\n", true],
                ["exact CRLF", "expected\r\n", true],
                [
                    "review reproduction",
                    "expected\ndiagnostic UNEXPECTED EXTRA OUTPUT\n",
                    false,
                ],
                [
                    "scalar suffix is forbidden",
                    "expected\ndiagnostic scalar false true\n",
                    false,
                ],
                ["missing output", "", false],
                ["missing final newline", "expected", false],
                ["prefix", "extra\nexpected\n", false],
                ["suffix", "expected\nextra\n", false],
                ["extra newline", "expected\n\n", false],
                ["bare CR", "expected\r", false],
                ["embedded marker", "expected diagnostic hidden\n", false],
            ] as const) {
                await t.test(name, () => {
                    const run = outputReceipt(directory, "native", stdout);
                    const before = structuredClone(run);
                    const result = d.compare({ id, runs: [run] }, "expected\n");
                    assert.deepEqual(run, before);
                    assert.deepEqual(
                        readFileSync(run.stdout.path),
                        Buffer.from(stdout),
                    );
                    assert.equal(result.ok, ok, JSON.stringify(result));
                    assert.equal(
                        result.observations[0].matchesOriginalExpected,
                        ok,
                    );
                });
            }
            await t.test("Node mismatch survives a later native match", () => {
                const node = outputReceipt(
                    directory,
                    "node-control",
                    "expected\ndiagnostic UNEXPECTED EXTRA OUTPUT\n",
                );
                const native = outputReceipt(directory, "native", "expected\n");
                const result = d.compare(
                    { id, runs: [node, native] },
                    "expected\n",
                );
                assert.equal(result.ok, false);
                assert.deepEqual(
                    result.observations.map(
                        (o: any) => o.matchesOriginalExpected,
                    ),
                    [false, true],
                );
                assert.deepEqual(
                    readFileSync(node.stdout.path),
                    Buffer.from(
                        "expected\ndiagnostic UNEXPECTED EXTRA OUTPUT\n",
                    ),
                );
            });
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
}

test("idle diagnostic observer suffixes accept only complete scalar and trace output", async (t) => {
    const d = await load();
    const directory = mkdtempSync(join(tmpdir(), "idle616-suffix-"));
    const scalar = "diagnostic scalar false true\n";
    // Independent, finite, monotonic records covering every required event.
    const trace =
        "diagnostic trace 9 false\n" +
        "trace 1 1 6000 -1\ntrace 2 2 0 0\ntrace 4 3 1 0\n" +
        "trace 5 4 0 1\ntrace 6 5 0 -1\ntrace 7 6 0 1\n" +
        "trace 9 7 1 0\ntrace 10 8 0 0\ntrace 13 9 200 -1\n";
    try {
        for (const [id, suffix, other] of [
            ["scalar-stress", scalar, trace],
            ["trace-stress", trace, scalar],
        ] as const) {
            for (const [name, stdout, ok] of [
                ["valid LF", "expected\n" + suffix, true],
                [
                    "valid CRLF",
                    ("expected\n" + suffix).replaceAll("\n", "\r\n"),
                    true,
                ],
                ["missing suffix", "expected\n", false],
                ["wrong variant", "expected\n" + other, false],
                [
                    "malformed header",
                    "expected\n" + suffix.replace("false", "FALSE"),
                    false,
                ],
                [
                    "extra header field",
                    "expected\n" + suffix.replace("\n", " extra\n"),
                    false,
                ],
                [
                    "missing final newline",
                    "expected\n" + suffix.slice(0, -1),
                    false,
                ],
                ["extra newline", "expected\n" + suffix + "\n", false],
                [
                    "unknown diagnostic before suffix",
                    "expected\ndiagnostic hidden\n" + suffix,
                    false,
                ],
                [
                    "unknown diagnostic after suffix",
                    "expected\n" + suffix + "diagnostic hidden\n",
                    false,
                ],
                ["duplicate suffix", "expected\n" + suffix + suffix, false],
                [
                    "unexpected output before suffix",
                    "expected\nextra\n" + suffix,
                    false,
                ],
                [
                    "unexpected output after suffix",
                    "expected\n" + suffix + "extra\n",
                    false,
                ],
                [
                    "embedded split marker",
                    "expected\ndiagnostic hidden arbitrary behavior\n" + suffix,
                    false,
                ],
                [
                    "marker without line boundary",
                    "expected\ndiagnostic hidden" + suffix,
                    false,
                ],
                ["missing base", suffix, false],
                ["changed base", "different\n" + suffix, false],
            ] as const) {
                await t.test(id + ": " + name, () => {
                    const run = outputReceipt(directory, "native", stdout);
                    const before = structuredClone(run);
                    const result = d.compare({ id, runs: [run] }, "expected\n");
                    assert.deepEqual(run, before);
                    assert.deepEqual(
                        readFileSync(run.stdout.path),
                        Buffer.from(stdout),
                    );
                    assert.equal(result.ok, ok, JSON.stringify(result));
                    if (ok) {
                        assert.equal(
                            result.observations[0].matchesOriginalExpected,
                            true,
                        );
                        if (id === "scalar-stress")
                            assert.deepEqual(result.observations[0].scalar, {
                                destroyedBeforeArm: false,
                                freeBeforeArm: true,
                            });
                        else
                            assert.equal(
                                result.observations[0].trace.length,
                                9,
                            );
                    }
                });
            }
            await t.test(
                id + ": Node difference is retained after a native match",
                () => {
                    const native = outputReceipt(
                        directory,
                        "native",
                        "expected\n" + suffix,
                    );
                    const node = outputReceipt(
                        directory,
                        "node-control",
                        "different\n" + suffix,
                    );
                    const result = d.compare(
                        { id, runs: [native, node] },
                        "expected\n",
                    );
                    assert.equal(result.ok, false);
                    assert.deepEqual(
                        result.observations.map(
                            (o: any) => o.matchesOriginalExpected,
                        ),
                        [true, false],
                    );
                    assert.deepEqual(
                        readFileSync(node.stdout.path),
                        Buffer.from("different\n" + suffix),
                    );
                },
            );
        }
        for (const [name, suffix] of [
            ["count mismatch", trace.replace("trace 9 false", "trace 8 false")],
            ["overflow", trace.replace("trace 9 false", "trace 9 true")],
            ["duplicate header", "diagnostic trace 9 false\n" + trace],
            ["unknown event", trace.replace("trace 4 3", "trace 11 3")],
            [
                "required finish missing",
                trace
                    .replace("trace 2 2 0 0\n", "")
                    .replace("trace 9 false", "trace 8 false"),
            ],
            ["nonfinite", trace.replace("trace 4 3", "trace 4 NaN")],
            ["backwards time", trace.replace("trace 4 3", "trace 4 1")],
            ["extra field", trace.replace("trace 4 3 1 0", "trace 4 3 1 0 0")],
            [
                "empty numeric field",
                trace.replace("trace 4 3 1 0", "trace 4 3  0"),
            ],
            [
                "hex numeric field",
                trace.replace("trace 4 3 1 0", "trace 4 3 0x1 0"),
            ],
        ]) {
            await t.test("trace-stress: " + name, () => {
                const run = outputReceipt(
                    directory,
                    "native",
                    "expected\n" + suffix,
                );
                assert.equal(
                    d.compare({ id: "trace-stress", runs: [run] }, "expected\n")
                        .ok,
                    false,
                );
            });
        }
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("idle diagnostic workflow is optional, serial and hosted; default jobs retain their conditions", () => {
    const text = readFileSync(".github/workflows/native-platforms.yml", "utf8");
    // Normal CI uses a shallow checkout. These are the 7b job bodies with only
    // their job-level if removed, normalized to LF; no old Git object needed.
    const baselineHashes: Record<string, string> = {
        "browser-compiler":
            "1b6d52d7e78aaf3b5765c6883bbf1f9bcec8fce452e87c15bc6d6def4d9c540e",
        "windows-regression":
            "198bda92932127c1bc8be64ad11f0dac14479a079908a9685ec1ee33a3395dac",
        "linux-regression":
            "509a68439fbd83efc7a2cbd9926af1e461068cc0e6e62fafd976e51848440b9f",
        loaders:
            "ef83c8c4ba9342a0247f77bb38911ae475e803b7b77bfa99fba79a49778fdad5",
        "linux-distributions":
            "6ad45fb1fdedb6b1c81d0ae3cac4e5b9b1c344677c3155a44b8f7273dc0d082b",
        "bsd-loaders":
            "e316ee6da1eb2a8ac160f605404a4eaa94e060c229bc5fa2f4f31227d64c6504",
    };
    const jobText = (source: string, name: string) =>
        source
            .replaceAll("\r\n", "\n")
            .split(`    ${name}:`)[1]!
            .split(/\n    [a-z][a-z-]+:/)[0]!
            .trimEnd();
    const condition = (source: string) =>
        /^        if: (.+)$/m.exec(source)?.[1] ?? "true";
    const evaluate = (
        expression: string,
        event: string,
        fullCi: boolean,
        mode: string | undefined,
    ) =>
        Function(
            "event",
            "fullCi",
            "mode",
            "return " +
                expression
                    .replaceAll("github.event_name", "event")
                    .replaceAll("inputs.mode", "mode")
                    .replaceAll(
                        "contains(github.event.pull_request.labels.*.name, 'full-ci')",
                        "fullCi",
                    ),
        )(event, fullCi, mode);
    assert.match(text, /default: full/);
    assert.match(text, /options: \[full, idle-agent-diagnostic\]/);
    assert.match(text, /max-parallel: 1/);
    assert.match(text, /runner: ubuntu-24\.04, target: linux-x64/);
    assert.match(text, /runner: windows-latest, target: win32-x64/);
    assert.match(
        text,
        /DIAGNOSTIC_COMMIT: \$\{\{ inputs\.diagnostic_commit \}\}/,
    );
    for (const name of [
        "browser-compiler",
        "windows-regression",
        "linux-regression",
        "loaders",
        "linux-distributions",
        "bsd-loaders",
    ]) {
        const job = jobText(text, name);
        const originalCondition =
            name === "browser-compiler"
                ? "true"
                : name === "windows-regression"
                  ? "github.event_name == 'workflow_dispatch'"
                  : "github.event_name != 'pull_request' || contains(github.event.pull_request.labels.*.name, 'full-ci')";
        assert.equal(
            createHash("sha256")
                .update(job.replace(/^        if:.*\n/m, "").trim())
                .digest("hex"),
            baselineHashes[name],
            `${name}: normal job contents changed`,
        );
        for (const event of ["push", "pull_request", "workflow_dispatch"])
            for (const fullCi of [false, true]) {
                for (const mode of [undefined, "full"])
                    assert.equal(
                        evaluate(condition(job), event, fullCi, mode),
                        evaluate(originalCondition, event, fullCi, mode),
                    );
                assert.equal(
                    evaluate(
                        condition(job),
                        event,
                        fullCi,
                        "idle-agent-diagnostic",
                    ),
                    event === "workflow_dispatch"
                        ? false
                        : evaluate(originalCondition, event, fullCi, undefined),
                );
            }
        assert.match(job, /inputs.mode != 'idle-agent-diagnostic'/);
        if (!["browser-compiler", "windows-regression"].includes(name))
            assert.match(
                job,
                /github.event_name != 'pull_request' \|\| contains\(github.event.pull_request.labels.\*.name, 'full-ci'\)/,
            );
        if (name === "windows-regression")
            assert.match(job, /github.event_name == 'workflow_dispatch'/);
    }
    const special = text.split("    idle-agent-diagnostic:")[1]!;
    assert.match(
        special,
        /github.event_name == 'workflow_dispatch' && inputs.mode == 'idle-agent-diagnostic'/,
    );
    assert.match(special, /if: always\(\)/);
    assert.match(special, /include-hidden-files: true/);
    assert.doesNotMatch(special, /self-hosted|continue-on-error/);
});

test("idle diagnostic exact Node controls exercise original, scalar and chronology programs", async () => {
    const d = await load();
    const { agentCases } = await import(
        pathToFileURL(resolve("tests/helpers/http-agent-cases.ts")).href
    );
    const { agentProgram } = await import(
        pathToFileURL(resolve("tests/helpers/http-agent-policy.ts")).href
    );
    const witness = agentCases.find(
        (c: { id: string }) => c.id === "idle-timeout",
    );
    const plan = d.makePlan(witness, agentProgram);
    const dir = mkdtempSync(join(tmpdir(), "idle616-node-"));
    try {
        for (const item of plan) {
            const runs = [];
            for (const control of item.controls) {
                const path = join(dir, control.id + ".mjs");
                writeFileSync(path, control.source);
                // Only tiny Node controls, no native compilation or stress run.
                runs.push(
                    await d.supervise(
                        process.execPath,
                        [path],
                        dir,
                        control.id,
                        10000,
                    ),
                );
            }
            const result = d.compare(
                { id: item.id, runs },
                witness.expected.join("\n") + "\n",
            );
            assert.equal(result.ok, true, JSON.stringify(result));
            if (item.id === "scalar-stress")
                assert.deepEqual(result.observations[0].scalar, {
                    destroyedBeforeArm: false,
                    freeBeforeArm: true,
                });
            if (item.id === "trace-stress") {
                const original = readFileSync(runs[0].stdout.path, "utf8");
                for (const malformed of [
                    original.replace(
                        /diagnostic trace \d+ false/,
                        "diagnostic trace 0 false",
                    ),
                    original.replace(/trace \d+ /, () => "trace 999 "),
                    original.replace(/trace \d+ [^ ]+ /, () => "trace 1 NaN "),
                    original.replace(/trace 1 [^\n]+\n/g, ""),
                ]) {
                    writeFileSync(runs[0].stdout.path, malformed);
                    const run: {
                        stdout: ReturnType<typeof outputReceipt>["stdout"];
                    } = structuredClone(runs[0]);
                    // Refresh the byte receipt to test the trace parser itself.
                    run.stdout.bytes = Buffer.byteLength(malformed);
                    run.stdout.sha256 = createHash("sha256")
                        .update(malformed)
                        .digest("hex");
                    assert.equal(
                        d.compare(
                            { id: item.id, runs: [run] },
                            witness.expected.join("\n") + "\n",
                        ).ok,
                        false,
                    );
                }
                writeFileSync(runs[0].stdout.path, original);
            }
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("idle diagnostic exact plan, source immutability and scalar observer limits", async () => {
    const d = await load();
    const { agentCases } = await import(
        pathToFileURL(resolve("tests/helpers/http-agent-cases.ts")).href
    );
    const { agentProgram } = await import(
        pathToFileURL(resolve("tests/helpers/http-agent-policy.ts")).href
    );
    const witness = agentCases.find(
        (c: { id: string }) => c.id === "idle-timeout",
    );
    const plan = d.makePlan(witness, agentProgram);
    assert.deepEqual(
        plan.map((c: any) => [
            c.id,
            c.requestedGC,
            c.selection,
            c.controls.length,
        ]),
        [
            ["original-stress", true, "on", 2],
            ["normal-off", false, "off", 1],
            ["scalar-stress", true, "on", 1],
            ["trace-stress", true, "on", 1],
        ],
    );
    assert.equal(plan[0].source, agentProgram(witness, true, "on").source);
    assert.equal(plan[1].source, agentProgram(witness, false, "off").source);
    assert.equal(
        plan[0].controls[0].source,
        agentProgram(witness, true, "on").options.oracleSource,
    );
    assert.match(plan[0].controls[1].source, /class IdleAgent/);
    assert.match(plan[0].controls[1].source, /setTimeout\(callback, 6000\)/);
    for (const c of plan) {
        assert.equal(c.nativeBoundMs, c.requestedGC ? 180000 : 60000);
        for (const control of c.controls) assert.equal(control.boundMs, 60000);
    }
    const capture = plan[2].source
        .split("console.log('idle');")[1]
        .split("firstSocket.setTimeout(200);")[0];
    assert.match(capture, /armDestroyed = firstSocket.destroyed/);
    assert.match(capture, /armFree =/);
    assert.doesNotMatch(
        capture,
        /now\(|new |\bconst\b|push\(|console\.|getName\(/,
    );
    assert.match(
        plan[2].source,
        /cleanup\(\);\nconsole.log\('diagnostic scalar'/,
    );
    assert.match(plan[3].source, /Float64Array\(512\)/);
    assert.equal(
        (plan[3].source.match(/\.on\(['"]timeout|\.once\(['"]timeout/g) ?? [])
            .length,
        1,
        "Only the original client timeout observer remains",
    );
    assert.match(plan[3].source, /peer\.emit = function/);
    assert.match(plan[3].source, /return peerEmit.apply\(this, arguments\)/);
    assert.equal(d.SOURCE_PIN, "7b4b56cc7eb644870dd2cc270d82a0815618b8ae");
    const sourceHash = (s: string) =>
        createHash("sha256").update(s).digest("hex");
    assert.equal(
        sourceHash(plan[0].source),
        "3a56740f611c7b8c983180cd1f47f5fd86a2748a9eeb53f591cbb8ad721ca764",
    );
    assert.equal(
        sourceHash(plan[1].source),
        "2a7ed3b3c82fce0911892574dd73f314def670a890e8ea9ee83a8b5584343abf",
    );
});

test("idle diagnostic rejects empty, partial, malformed, skipped and wrong-selection reports", async () => {
    const d = await load();
    for (const bad of [
        null,
        {},
        { cases: [] },
        { complete: true, cases: [] },
        { complete: true, cases: [{ id: "original-stress", skipped: true }] },
    ])
        assert.throws(() => d.validateReport(bad));
    const hash = "a".repeat(64);
    const artifact = { path: "mock", bytes: 1, sha256: hash };
    const receipt = {
        status: 0,
        signal: null,
        error: null,
        deadlineExceeded: false,
        forcedPipeCleanup: false,
        exitSeen: true,
        closeSeen: true,
        durationMs: 1,
        startedAt: "2026-11-01T00:00:00Z",
        command: "node",
        args: [],
        cwd: "mock",
        events: [{ event: "exit" }, { event: "close" }],
        stdout: artifact,
        stderr: { ...artifact, bytes: 0 },
        pipes: {
            stdoutEnded: true,
            stderrEnded: true,
            stdoutClosed: true,
            stderrClosed: true,
        },
    };
    const supplementaryReceipt = (id: string, holdMs: number) => ({
        ...receipt,
        id,
        kind: "supplementary-native-stress-source-wrapper",
        engine: "node",
        actualGC: false,
        boundMs: 60000,
        holdMs,
        cleanupWatchdogMs: null,
        nativeSourceSha256:
            "3a56740f611c7b8c983180cd1f47f5fd86a2748a9eeb53f591cbb8ad721ca764",
        executableSha256: hash,
        source: artifact,
    });
    const fixture = {
        schema: 2,
        complete: true,
        budget: {
            nativeCases: 4,
            nodeControls: 7,
            originalNodeControls: 5,
            supplementaryNodeControls: 2,
        },
        supplementary: {
            kind: "supplementary-native-stress-source-wrapper",
            replacementOracle: false,
            complete: true,
            expected:
                "body /first false\nidle\ntimed out 1 true\nbody /second false\nreplacement true 2\n",
            nativeSource: {
                ...artifact,
                sha256: "3a56740f611c7b8c983180cd1f47f5fd86a2748a9eeb53f591cbb8ad721ca764",
            },
            runs: [
                supplementaryReceipt("node-native-stress-baseline", 0),
                supplementaryReceipt("node-native-stress-prearm-hold", 7000),
            ],
            comparison: {
                ok: true,
                error: null,
                observations: [
                    {
                        id: "node-native-stress-baseline",
                        base: "body /first false\nidle\ntimed out 1 true\nbody /second false\nreplacement true 2\n",
                        timedOut: 1,
                        scalar: {
                            destroyedBeforeArm: false,
                            freeBeforeArm: true,
                        },
                        hold: { result: "not-run", elapsedMs: 0 },
                        matchesOriginalExpected: true,
                        matchesPrediction: false,
                    },
                    {
                        id: "node-native-stress-prearm-hold",
                        base: "body /first false\nidle\ntimed out 1 true\nbody /second false\nreplacement true 2\n",
                        timedOut: 1,
                        scalar: {
                            destroyedBeforeArm: false,
                            freeBeforeArm: true,
                        },
                        hold: { result: "timed-out", elapsedMs: 7000 },
                        matchesOriginalExpected: true,
                        matchesPrediction: false,
                    },
                ],
                hypothesisConfirmed: false,
            },
        },
        identity: {
            sourcePin: d.SOURCE_PIN,
            head: "a".repeat(40),
            tree: "b".repeat(40),
            target: "linux-x64",
        },
        cases: [
            [
                "original-stress",
                true,
                "on",
                ["native", "oracle-unstaged", "node-staged"],
                "3a56740f611c7b8c983180cd1f47f5fd86a2748a9eeb53f591cbb8ad721ca764",
            ],
            [
                "normal-off",
                false,
                "off",
                ["native", "node-normal"],
                "2a7ed3b3c82fce0911892574dd73f314def670a890e8ea9ee83a8b5584343abf",
            ],
            ["scalar-stress", true, "on", ["native", "node-scalar"], hash],
            ["trace-stress", true, "on", ["native", "node-trace"], hash],
        ].map(([id, requestedGC, selection, names, sourceHash]: any) => {
            const source = { ...artifact, sha256: sourceHash };
            return {
                id,
                source,
                builder: { ...receipt, boundMs: 180000 },
                build: {
                    requestedGC,
                    moduleLoadSelection: selection,
                    actualGC: requestedGC,
                    target: "linux-x64",
                    head: "a".repeat(40),
                    tree: "b".repeat(40),
                    sourceSha256: sourceHash,
                    compilerSha256: hash,
                    imageRetained: true,
                    options: { gcStress: requestedGC },
                    pipeline:
                        "compileModuleToIR(source, entry) -> generate(ir, {gcStress}) -> linkHost(program)",
                    image: artifact,
                },
                runs: names.map((name: string, i: number) => ({
                    ...receipt,
                    id: name,
                    source,
                    stdout: { ...artifact, bytes: 1 },
                    executableSha256: hash,
                    engine: i ? "node" : "native",
                    actualGC: i ? false : requestedGC,
                    boundMs: i === 0 && requestedGC ? 180000 : 60000,
                })),
                comparison: { ok: true },
            };
        }),
    };
    assert.equal(d.compare({ runs: [] }, "expected\n").ok, false);
    assert.doesNotThrow(() => d.validateReport(fixture));
    const { supplementary: _pair, ...missingPair } = fixture;
    assert.throws(() => d.validateReport(missingPair));
    for (const change of [
        (pair: typeof fixture.supplementary) => pair.runs.pop(),
        (pair: typeof fixture.supplementary) =>
            pair.runs.push(structuredClone(pair.runs[0]!)),
        (pair: typeof fixture.supplementary) => {
            pair.runs[1]!.id = pair.runs[0]!.id;
        },
        (pair: typeof fixture.supplementary) => {
            pair.complete = false;
        },
        (pair: typeof fixture.supplementary) => {
            pair.runs[1]!.pipes = {
                ...pair.runs[1]!.pipes,
                stdoutClosed: false,
            };
        },
        (pair: typeof fixture.supplementary) => {
            pair.runs[1]!.boundMs = 61000;
        },
        (pair: typeof fixture.supplementary) =>
            pair.comparison.observations.pop(),
        (pair: typeof fixture.supplementary) => {
            pair.comparison.observations[1]!.id =
                pair.comparison.observations[0]!.id;
        },
        (pair: typeof fixture.supplementary) => {
            pair.comparison.hypothesisConfirmed = true;
        },
        (pair: typeof fixture.supplementary) => {
            pair.comparison.observations[1]!.hold.elapsedMs = 6999;
        },
    ]) {
        const report = structuredClone(fixture);
        change(report.supplementary);
        assert.throws(() => d.validateReport(report));
    }
    for (const budget of [
        { ...fixture.budget, nodeControls: 5 },
        { ...fixture.budget, originalNodeControls: 4 },
        { ...fixture.budget, supplementaryNodeControls: 1 },
    ])
        assert.throws(() => d.validateReport({ ...fixture, budget }));
    for (const change of [
        (r: any) => r.cases.pop(),
        (r: any) => r.cases[0].runs.pop(),
        (r: any) => (r.cases[0].build.actualGC = false),
        (r: any) => (r.cases[1].build.actualGC = true),
        (r: any) => (r.cases[0].runs[0].stdout.sha256 = "broken"),
        (r: any) => delete r.cases[0].runs[0].signal,
        (r: any) => (r.cases[0].runs[0].pipes.stdoutClosed = false),
        (r: any) => (r.cases[0].runs[0].deadlineExceeded = true),
        (r: any) => (r.cases[0].runs[0].skipped = true),
        (r: any) => (r.cases[0].runs[0].todo = true),
        (r: any) => (r.cases[0].runs[0].signal = "SIGTERM"),
        (r: any) => (r.cases[0].build.image.bytes = 0),
        (r: any) => (r.cases[0].runs[0].status = null),
        (r: any) => (r.cases[0].runs[0].stdout.bytes = 0),
        (r: any) => delete r.cases[0].runs[0].startedAt,
        (r: any) => (r.cases[0].runs[0].error = { message: "spawn failed" }),
    ]) {
        const report = structuredClone(fixture);
        change(report);
        assert.throws(() => d.validateReport(report));
    }
});

test("idle diagnostic tiny children preserve raw bytes, errors and deadline cleanup", async () => {
    const d = await load();
    const dir = mkdtempSync(join(tmpdir(), "idle616-mock-"));
    try {
        const ok = await d.supervise(
            process.execPath,
            [
                "-e",
                "process.stdout.write(Buffer.from([0,255,13,10]));process.stderr.write(Buffer.from([254,0]));process.exitCode=7",
            ],
            dir,
            "raw",
            3000,
        );
        assert.equal(ok.status, 7);
        assert.equal(ok.signal, null);
        assert.deepEqual([...readFileSync(ok.stdout.path)], [0, 255, 13, 10]);
        assert.deepEqual([...readFileSync(ok.stderr.path)], [254, 0]);
        assert.equal(ok.pipes.stdoutClosed, true);
        assert.equal(ok.pipes.stderrClosed, true);
        const error = await d.supervise(
            join(dir, "missing-command"),
            [],
            dir,
            "spawn-error",
            3000,
        );
        assert.equal(error.error.code, "ENOENT");
        assert.match(error.error.message, /ENOENT/);
        assert.ok(error.error.stack);
        const timeout = await d.supervise(
            process.execPath,
            ["-e", "process.stdout.write('started');setInterval(()=>{},1000)"],
            dir,
            "deadline",
            400,
        );
        assert.equal(timeout.deadlineExceeded, true);
        assert.equal(timeout.pipes.stdoutClosed, true);
        assert.equal(timeout.pipes.stderrClosed, true);
        assert.ok(timeout.exitSeen);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("idle diagnostic hosted guard rejects local, wrong pin and release identities before any compiler import", async () => {
    const d = await load();
    assert.throws(() =>
        d.hostedGuard({}, "linux", "x64", "v26.9.0", "a".repeat(40)),
    );
    const env = {
        GITHUB_ACTIONS: "true",
        RUNNER_ENVIRONMENT: "github-hosted",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_REPOSITORY: "40oleg/nona",
        GITHUB_REF: "refs/heads/temporary-idle-diagnostic",
        GITHUB_SHA: "a".repeat(40),
        DIAGNOSTIC_COMMIT: "a".repeat(40),
        DIAGNOSTIC_TARGET: "linux-x64",
    };
    assert.doesNotThrow(() =>
        d.hostedGuard(env, "linux", "x64", "v26.9.0", env.GITHUB_SHA),
    );
    for (const changes of [
        { RUNNER_ENVIRONMENT: "self-hosted" },
        { GITHUB_REF: "refs/tags/v0.35.0" },
        { GITHUB_REF: "refs/heads/main" },
        { DIAGNOSTIC_COMMIT: "b".repeat(40) },
        { DIAGNOSTIC_TARGET: "win32-x64" },
    ])
        assert.throws(() =>
            d.hostedGuard(
                { ...env, ...changes },
                "linux",
                "x64",
                "v26.9.0",
                env.GITHUB_SHA,
            ),
        );
    const code = readFileSync("scripts/http-agent-idle-diagnostic.mjs", "utf8");
    assert.doesNotMatch(code, /^import .*dist\/.*compiler/m);
    assert.match(code, /compileModuleToIR\(source, entry\)/);
    assert.match(code, /generate\(ir, \{ gcStress: item.requestedGC \}\)/);
    assert.doesNotMatch(code, /\bcompile\(source/);
});
