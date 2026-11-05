// Pure reporter/inventory tests only. Native replay lives outside *.test.*.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
const reporter = await import(
    pathToFileURL(resolve("scripts/semantic-replay/report.mjs")).href
);
const inventory = await import(
    pathToFileURL(resolve("scripts/semantic-replay/inventory.mjs")).href
);
const good = {
    stdout: "function\n",
    stderr: "",
    status: 0,
    signal: null,
    error: null,
};

test("replay comparator detects a successful omission and preserves meaningful differences", () => {
    assert.deepEqual(reporter.compareOutcomes(good, good), []);
    for (const patch of [
        { stdout: "undefined\n" },
        { stdout: "function" },
        { stderr: "warning\n" },
        { status: 1 },
        { signal: "SIGTERM" },
        { error: { code: "ETIMEDOUT" } },
        { stdout: "0\nNaN\n" },
    ])
        assert.ok(
            reporter.compareOutcomes({ ...good, ...patch }, good).length > 0,
        );
    assert.ok(
        reporter.compareOutcomes({ ...good, stdout: "function\r\n" }, good)
            .length,
    );
    assert.deepEqual(
        reporter.compareOutcomes(
            { ...good, stdout: "function\r\n" },
            good,
            true,
        ),
        [],
    );
    assert.ok(
        reporter.compareOutcomes(
            { ...good, error: { code: "ENOENT" } },
            { ...good, error: { code: "ENOENT" } },
        ).length,
    );
    for (const [actual, expected] of [
        ["-0\n", "0\n"],
        ["NaN\n", "null\n"],
        ["a\nb\n", "b\na\n"],
    ])
        assert.ok(
            reporter.compareOutcomes(
                { ...good, stdout: actual },
                { ...good, stdout: expected },
            ).length,
        );
    assert.ok(
        reporter.compareOutcomes(
            { ...good, stdoutBase64: "/w==" },
            { ...good, stdoutBase64: "/g==" },
        ).length,
    );
});

test("effective options retain explicit goal, target and link choices", () => {
    assert.deepEqual(
        reporter.effectiveOptions(
            { goal: "script", entry: "main.js" },
            "default",
            "linux-x64",
        ),
        {
            fileName: "main.js",
            target: "linux-x64",
            module: false,
            reportLink: true,
            gcStress: false,
        },
    );
    assert.equal(
        reporter.effectiveOptions(
            { goal: "module", entry: "main.mjs" },
            "full",
            "win32-x64",
        ).fullRuntime,
        true,
    );
    assert.deepEqual(
        reporter.effectiveOptions(
            { goal: "script", entry: "main.js", link: ["proxy"] },
            "explicit",
            "linux-x64",
        ).link,
        ["proxy"],
    );
    assert.throws(() =>
        reporter.effectiveOptions(
            { goal: "script", entry: "main.js" },
            "explicit",
            "linux-x64",
        ),
    );
    assert.throws(() =>
        reporter.effectiveOptions(
            { goal: "script", entry: "main.js" },
            "invented",
            "linux-x64",
        ),
    );
});

test("CRLF normalization compares raw bytes without hiding invalid UTF-8 or lone CR", () => {
    for (const field of ["stdout", "stderr"] as const) {
        const outcome = (bytes: number[], raw = true) => ({
            ...good,
            [field]: Buffer.from(bytes).toString("utf8"),
            ...(raw
                ? { [field + "Base64"]: Buffer.from(bytes).toString("base64") }
                : {}),
        });
        // Both decode to the same replacement character followed by a newline.
        assert.ok(
            reporter.compareOutcomes(
                outcome([0xff, 13, 10]),
                outcome([0xfe, 10]),
                true,
            ).length,
            `${field}: unequal invalid bytes must remain unequal`,
        );
        assert.deepEqual(
            reporter.compareOutcomes(
                outcome([0xff, 13, 10]),
                outcome([0xff, 10]),
                true,
            ),
            [],
        );
        assert.ok(
            reporter.compareOutcomes(
                outcome([0xff, 13, 10]),
                outcome([0xff, 10]),
            ).length,
        );
        assert.ok(
            reporter.compareOutcomes(
                outcome([120, 13]),
                outcome([120, 10]),
                true,
            ).length,
        );
        for (const rawOnActual of [true, false]) {
            assert.deepEqual(
                reporter.compareOutcomes(
                    outcome([120, 13, 10], rawOnActual),
                    outcome([120, 10], !rawOnActual),
                    true,
                ),
                [],
            );
            assert.ok(
                reporter.compareOutcomes(
                    outcome([0xff], rawOnActual),
                    outcome([0xff], !rawOnActual),
                    true,
                ).length,
                "a decoded replacement character cannot stand in for invalid raw bytes",
            );
        }
    }
});

test("compile evidence retains imports, reasons, diagnostics and exact image identity", () => {
    const image = Uint8Array.from([0, 255, 13, 10]);
    const imports = ["KERNEL32.dll!ExitProcess", "KERNEL32.dll!WriteFile"];
    const linked = [
        {
            part: "proxy",
            reason: '"Proxy" in a string (dynamic property access)',
        },
    ];
    assert.deepEqual(
        reporter.compileEvidence({ ok: true, image, imports, linked }, 12),
        {
            ok: true,
            elapsedMs: 12,
            diagnostics: [],
            imports,
            linked,
            image: { sha256: reporter.sha256(image), length: 4 },
        },
    );
    const diagnostics = [{ code: "E_BIND", message: "unbound name" }];
    assert.deepEqual(reporter.compileEvidence({ ok: false, diagnostics }, 3), {
        ok: false,
        elapsedMs: 3,
        diagnostics,
        imports: null,
        linked: null,
        image: null,
    });
});

// Each mutation is intentionally distinct. In particular += and object rest
// conservatively select Proxy without ever making the executed key "Proxy".
const finiteMutations = [
    [9, 'i="Proxy";', "function"],
    [10, 'i+="Proxy";', "undefined"],
    [11, 'i||="Proxy";', "function"],
    [12, '[i]=["Proxy"];', "function"],
    [13, '({x:i}={x:"Proxy"});', "function"],
    [14, '[...i]=["Proxy"];', "function"],
    [15, '({...i}={x:"Proxy"});', "undefined"],
    [16, '[i="Proxy"]=[];', "function"],
    [17, 'for(i of ["Proxy"]){}', "function"],
    [18, 'for([i] of [["Proxy"]]){}', "function"],
    [19, 'for(i in {"Proxy":"Proxy"}){}', "function"],
] as const;
for (const [id, mutation, after] of finiteMutations)
    test(`finite numeric fallback ${id} observes its own mutation before numeric update`, () => {
        const c = inventory
            .loadInventory("pr")
            .find((c: { id: string }) => c.id === `numeric-ast-fallback-${id}`);
        const source = c.files[c.entry];
        const oracle = reporter.recordProcess(
            process.execPath,
            [
                "--input-type=commonjs",
                "-e",
                `require("node:vm").runInThisContext(${JSON.stringify(source)})`,
            ],
            process.cwd(),
            3000,
        );
        assert.deepEqual(
            reporter.compareOutcomes(oracle, {
                stdout: `undefined\n${after}\n`,
                stderr: "",
                status: 0,
            }),
            [],
            JSON.stringify(oracle),
        );
        const position = source.indexOf(mutation);
        assert.ok(
            position >= 0,
            `retain distinct mutation: ${mutation}\n${source}`,
        );
        assert.ok(
            source.indexOf(
                "console.log(typeof globalThis[i])",
                position + mutation.length,
            ) >= 0,
            `computed read must observe the assigned key before ++: ${source}`,
        );
        assert.deepEqual(c.expected, {
            stdout: `undefined\n${after}\n`,
            stderr: "",
            status: 0,
        });
    });

for (const id of [21, 26, 27, 28, 29, 30])
    test(`finite numeric fallback ${id} retains computed read and binding context`, () => {
        const c = inventory
            .loadInventory("pr")
            .find((c: { id: string }) => c.id === `numeric-ast-fallback-${id}`);
        const source = c.files[c.entry];
        assert.ok(source.includes('"Proxy"'), "retain whole string candidate");
        assert.ok(source.includes("console.log(typeof globalThis[i])"), source);
        const context = new Map([
            [21, "const read=()=>i;console.log(read());"],
            [26, "for(var i=0;"],
            [27, 'eval("i=1")'],
            [28, 'const f=()=>eval("i=1");f();'],
            [29, "with(o)i++"],
            [30, "with(o){for(let i=0;"],
        ]);
        assert.ok(source.includes(context.get(id)!), source);
        const oracle = reporter.recordProcess(
            process.execPath,
            [
                "--input-type=commonjs",
                "-e",
                `require("node:vm").runInThisContext(${JSON.stringify(source)})`,
            ],
            process.cwd(),
            3000,
        );
        const expected = {
            stdout: id === 21 ? "undefined\n0\n" : "undefined\n",
            stderr: "",
            status: 0,
        };
        assert.deepEqual(
            reporter.compareOutcomes(oracle, expected),
            [],
            JSON.stringify(oracle),
        );
        assert.deepEqual(c.expected, expected);
    });

test("all original AST contracts retain explicit public default selection controls", () => {
    assert.equal(
        reporter.sha256(JSON.stringify(inventory.selectorContracts)),
        "8db82ef183cd177d628d357ddd94ccacf0711837283c81d96279456745ede584",
    );
    const cases = inventory.loadInventory("pr");
    for (const contract of inventory.selectorContracts) {
        const peer = cases.find(
            (c: { id: string }) => c.id === contract.semanticId,
        );
        assert.deepEqual(
            peer.selector,
            { part: contract.part, present: contract.present },
            contract.id,
        );
        assert.ok(peer.modes.includes("default"), contract.id);
        assert.equal(peer.defaultContract, undefined, contract.id);
    }
});

test("real builtin module graphs retain raw Node oracle and dependency resolution", () => {
    for (const id of ["graph-proxy", "graph-regexp"]) {
        const fixture = inventory
            .loadInventory("pr")
            .find((c: { id: string }) => c.id === id);
        assert.equal(fixture.goal, "module");
        assert.equal(Object.keys(fixture.files).length, 2);
        assert.match(
            fixture.files[fixture.entry],
            /import .* from "\.\/scope\.mjs"/,
        );
        const directory = mkdtempSync(resolve("work/nona-replay-unit-graph-"));
        try {
            reporter.writeGraph(directory, fixture);
            const oracle = reporter.recordOracle(directory, fixture, 3000);
            assert.deepEqual(
                reporter.compareOutcomes(oracle, fixture.expected),
                [],
                JSON.stringify(oracle),
            );
            assert.equal(
                oracle.stdoutBase64,
                Buffer.from(fixture.expected.stdout).toString("base64"),
            );
            const { host, description } = reporter.moduleGraphHost(
                fixture,
                "/replay/" + fixture.entry,
            );
            const dependency = host.resolve(
                "./scope.mjs",
                "/replay/" + fixture.entry,
            );
            assert.equal(host.read(dependency), fixture.files["scope.mjs"]);
            assert.deepEqual(description.reads, ["/replay/scope.mjs"]);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    }
});

test("recorder retains raw child failures and script global scope", () => {
    const run = reporter.recordProcess(
        process.execPath,
        [
            "--input-type=commonjs",
            "-e",
            'process.stdout.write("x \\n"); process.stderr.write("diagnostic\\n"); process.exitCode=3;',
        ],
        process.cwd(),
        3000,
    );
    assert.equal(run.stdout, "x \n");
    assert.equal(run.stderr, "diagnostic\n");
    assert.equal(run.status, 3);
    assert.equal(run.signal, null);
    assert.equal(run.error, null);
    assert.ok(run.elapsedMs >= 0);
    const missing = reporter.recordProcess(
        join(process.cwd(), "__missing_replay_program__"),
        [],
        process.cwd(),
        1000,
    );
    assert.equal(missing.error.code, "ENOENT");
    assert.equal(missing.status, null);
    const timeout = reporter.recordProcess(
        process.execPath,
        ["-e", 'process.stderr.write("before\\n");setInterval(()=>{},1000);'],
        process.cwd(),
        250,
    );
    assert.equal(timeout.error.code, "ETIMEDOUT");
    assert.equal(timeout.stderr, "before\n");
    mkdirSync("work", { recursive: true });
    const directory = mkdtempSync(resolve("work/nona-replay-unit-"));
    try {
        const fixture = {
            goal: "script",
            entry: "main.js",
            files: {
                "main.js":
                    "var publicReplayScope=7; console.log(globalThis.publicReplayScope);",
            },
        };
        reporter.writeGraph(directory, fixture);
        const oracle = reporter.recordOracle(directory, fixture, 3000);
        assert.equal(oracle.stdout, "7\n");
        assert.equal(oracle.status, 0);
        assert.equal(oracle.stderr, "");
        const graph = {
            goal: "module",
            entry: "entry.mjs",
            files: {
                "entry.mjs":
                    'import {value} from "./nested/value.mjs"; console.log(value);',
                "nested/value.mjs": "export const value=9;",
            },
        };
        reporter.writeGraph(directory, graph);
        const moduleOracle = reporter.recordOracle(directory, graph, 3000);
        assert.equal(moduleOracle.stdout, "9\n");
        assert.equal(moduleOracle.status, 0);
        assert.equal(moduleOracle.stderr, "");
        assert.throws(() =>
            reporter.writeGraph(directory, {
                ...fixture,
                files: { "../escape.js": "" },
            }),
        );
        reporter.saveReport(join(directory, "partial.json"), {
            stage: "compiled",
            diagnostics: [{ code: "E_BIND" }],
        });
        assert.deepEqual(
            JSON.parse(readFileSync(join(directory, "partial.json"), "utf8")),
            { stage: "compiled", diagnostics: [{ code: "E_BIND" }] },
        );
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("inventory pins exact originals, every T01/T02 family and manifest sample", () => {
    const cases = inventory.loadInventory("pr");
    assert.ok(cases.length > 100);
    assert.equal(
        new Set(cases.map((c: { id: string }) => c.id)).size,
        cases.length,
    );
    for (const id of [
        "default-proxy",
        "default-regexp",
        "length-key",
        "counter-key",
    ]) {
        const c = cases.find((c: { id: string }) => c.id === id);
        assert.ok(c);
        assert.deepEqual(c.modes, ["default", "full", "explicit"]);
        assert.equal(
            c.files[c.entry],
            inventory.retained.results.find((r: { id: string }) => r.id === id)
                .source,
        );
        assert.equal(c.expected.status, 0);
        assert.equal(c.expected.stderr, "");
    }
    assert.deepEqual(
        cases
            .filter((c: { corpusId?: number }) => c.corpusId)
            .map((c: { corpusId: number }) => c.corpusId),
        [11, 175, 176, 340, 341, 505, 506, 670, 671, 835, 836, 1000],
    );
    assert.equal(
        inventory
            .loadInventory("candidate")
            .filter((c: { corpusId?: number }) => c.corpusId).length,
        1000,
    );
    assert.equal(
        cases.filter((c: { family: string }) => c.family === "parameter")
            .length,
        80,
    );
    assert.equal(
        cases.find(
            (c: { id: string }) => c.id === "numeric-retained-length-data",
        )?.files["main.js"],
        'const holder = {length: "Proxy"};\nconsole.log(typeof globalThis[holder.length]);\n',
    );
    assert.equal(
        cases.find(
            (c: { id: string }) =>
                c.id === "numeric-retained-body-reassignment",
        )?.files["main.js"],
        'for (let key = 0; key < 1; key++) {\n    key = "Proxy";\n    console.log(typeof globalThis[key]);\n    break;\n}\n',
    );
    assert.ok(inventory.selectorContracts.length >= 44);
    for (const c of inventory.selectorContracts)
        assert.ok(
            c.semanticId &&
                cases.some((item: { id: string }) => item.id === c.semanticId),
            c.id,
        );
    const limit = cases.find(
        (c: { id: string }) => c.id === "documented-computed-name",
    );
    assert.equal(
        limit.files[limit.entry],
        'const key = "Pro" + "xy"; console.log(typeof globalThis[key]);',
    );
    assert.deepEqual(limit.defaultContract, {
        stdout: "undefined\n",
        stderr: "",
        status: 0,
    });
    assert.equal(inventory.validateDefaultContract(limit), true);
    assert.throws(() =>
        inventory.validateDefaultContract({ ...limit, id: "length-key" }),
    );
    assert.throws(() =>
        inventory.validateDefaultContract({
            ...limit,
            files: { [limit.entry]: "console.log(1);" },
        }),
    );
    const summary = inventory.summarizeInventory(cases);
    inventory.verifyCoverage();
    assert.equal(summary.cases, 163);
    assert.equal(summary.uniqueInputs, 162);
    assert.equal(summary.uniqueInputModeGoals, 373);
    assert.deepEqual(summary.goals, { script: 121, module: 42 });
    assert.deepEqual(summary.modes, { default: 163, full: 163, explicit: 50 });
    assert.equal(summary.cases, cases.length);
    assert.deepEqual(summary.aliases, [
        ["default-regexp", "parameter-script-regexp-2"],
    ]);
    assert.equal(summary.nativeRuns, 376);
    assert.equal(
        summary.nativeRuns,
        cases.reduce(
            (n: number, c: { modes: string[] }) => n + c.modes.length,
            0,
        ),
    );
    assert.match(
        readFileSync(".github/workflows/semantic-replay.yml", "utf8"),
        /windows-latest/,
    );
});

test("native driver refuses local/self-hosted startup before reading compiler or job", () => {
    const run = spawnSync(
        process.execPath,
        ["scripts/semantic-replay/run.mjs", "--worker", "__missing_job__"],
        {
            encoding: "utf8",
            timeout: 3000,
            windowsHide: true,
            env: {
                ...process.env,
                GITHUB_ACTIONS: "false",
                RUNNER_ENVIRONMENT: "self-hosted",
            },
        },
    );
    assert.equal(run.status, 2);
    assert.match(run.stderr, /native replay requires GitHub Actions/);
    assert.doesNotMatch(run.stderr, /ENOENT/);
});

test("historical comparator distinguishes semantic omission from operational failure", () => {
    const record = {
        compile: { ok: true },
        oracle: good,
        native: { ...good, stdout: "undefined\n" },
        normalizeCRLF: true,
    };
    assert.equal(reporter.assessMode(record).exitCode, 1);
    for (const patch of [
        { error: { code: "ETIMEDOUT" } },
        { signal: "SIGTERM", status: null },
    ])
        assert.equal(
            reporter.assessMode({
                ...record,
                native: { ...record.native, ...patch },
            }).exitCode,
            2,
        );
    assert.equal(
        reporter.assessMode({ ...record, compile: { ok: false } }).exitCode,
        2,
    );
});

test("serialized module graphs resolve under canonical Windows and Linux compiler roots", () => {
    const fixture = {
        entry: "main.mjs",
        files: {
            "main.mjs": 'import "./scope.mjs";',
            "scope.mjs": "export const x=1;",
        },
        resolution: { kind: "relative-files" },
    };
    for (const root of ["/replay/", "/C:/replay/"]) {
        const { host, description } = reporter.moduleGraphHost(
            fixture,
            root + fixture.entry,
        );
        assert.equal(
            host.resolve("./scope.mjs", root + fixture.entry),
            root + "scope.mjs",
        );
        assert.equal(host.read(root + "scope.mjs"), "export const x=1;");
        assert.equal(
            host.resolve("../escape.mjs", root + fixture.entry),
            undefined,
        );
        assert.equal(host.resolve("node:fs", root + fixture.entry), undefined);
        assert.equal(description.root, root);
        assert.equal(description.requests.length, 3);
    }
});

test("a measured budget requires complete clean reports from both hosted platforms", () => {
    assert.throws(() => reporter.measuredBudget([]));
    const make = (platform: string) => ({
        platform,
        complete: true,
        failures: [],
        lane: "pr",
        inventory: { cases: 163, nativeRuns: 376 },
        elapsedMs: 60000,
        sourceSha: "same",
    });
    assert.throws(() => reporter.measuredBudget([make("linux")]));
    assert.throws(() =>
        reporter.measuredBudget([
            make("linux"),
            { ...make("win32"), complete: false },
        ]),
    );
    assert.throws(() =>
        reporter.measuredBudget([
            make("linux"),
            { ...make("win32"), failures: ["mismatch"] },
        ]),
    );
    const budget = reporter.measuredBudget([make("linux"), make("win32")]);
    assert.equal(budget.measuredMaximumMs, 60000);
    assert.equal(budget.budgetMs, 120000);
});
