import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { constants, setPriority } from "node:os";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import {
    instrumentScalar,
    parseScalar,
} from "../scripts/abort-timeout-scalar.mjs";

setPriority(0, constants.priority.PRIORITY_BELOW_NORMAL);
const read = (path) =>
    readFileSync(new URL("../" + path, import.meta.url), "utf8").replace(
        /\r\n?/g,
        "\n",
    );
const timers = read("src/lib/runtime/timers.js");
const events = read("src/lib/runtime/events.js");
const body = read("tests/events.test.ts").match(
    /"timeout cancellation fires while an ordinary timer remains active",\s*`([^`]+)`/u,
)[1];
const expected = "timeout TimeoutError\nlive true false\n";

function run(text, atEntry, inCallback) {
    let clock = 0;
    const lines = [],
        reads = [],
        waits = [];
    runInNewContext(
        "var __nonaRegexpVm={enqueueJob:function(fn){fn()}};var __nonaPromiseDrainJobs=function(){};" +
            text +
            events +
            body +
            ";advance();__nonaPromiseDrainJobs();",
        {
            __nonaHostNow: () => {
                reads.push(clock);
                return clock;
            },
            __nonaHostWait: (delay) => {
                waits.push(delay);
                clock += delay;
            },
            advance: () => {
                clock += atEntry;
            },
            console: {
                log: (...values) => {
                    const line = values.join(" ");
                    lines.push(line);
                    if (line.startsWith("live ")) clock += inCallback;
                },
            },
        },
    );
    return { stdout: lines.join("\n") + "\n", reads, waits, clock };
}

for (const [name, entry, callback, phases] of [
    ["normal", 0, 0, [1, 20]],
    ["all-due", 1100, 0, [1100, 1100, 1100]],
    ["clock advanced inside callback", 0, 1100, [1, 20]],
]) {
    test("scalar preserves original timing/output: " + name, (t) => {
        const plain = run(timers, entry, callback);
        const scalar = run(instrumentScalar(timers), entry, callback);
        t.diagnostic(JSON.stringify({ plain, scalar }));
        assert.equal(plain.stdout, expected + (entry ? "unexpected\n" : ""));
        const { output, evidence, findings } = parseScalar(scalar.stdout);
        assert.equal(output, plain.stdout);
        assert.deepEqual(scalar.reads, plain.reads, "no new clock reads");
        assert.deepEqual(scalar.waits, plain.waits, "same waits");
        assert.equal(scalar.clock, plain.clock);
        assert.ok(evidence, "the scalar observation must be present");
        assert.equal(evidence.firstPhase, phases[0]);
        assert.deepEqual(evidence.scheduled, [
            [1, 1, 1, false, 1, 0],
            [2, 1000, 1000, false, 2, 0],
            [3, 20, 20, true, 3, 1],
        ]);
        assert.deepEqual(evidence.admissions, [
            [1, 1, phases[0], 3, 1, 2, 1],
            [3, 20, phases[1], 2, 1, 1, 0],
            ...(entry ? [[2, 1000, phases[2], 1, 0, 0, 0]] : []),
        ]);
        assert.equal(evidence.overflow, false);
        assert.deepEqual(findings, []);
    });
}

test("source controls detect future admission and incompatible phase termination", () => {
    const noDeadlineCheck = timers.replace(
        "if (timer.when > phaseTime) break;",
        "",
    );
    assert.notEqual(run(noDeadlineCheck, 0, 0).stdout, expected);
    const resample = timers.replace(
        "timer.when > phaseTime",
        "timer.when > hostNow()",
    );
    assert.notEqual(run(resample, 0, 1100).stdout, expected);
    for (const [text, callback] of [
        [
            instrumentScalar(timers).replace(
                "if (timer.when > phaseTime) break;",
                "",
            ),
            0,
        ],
        [
            instrumentScalar(timers).replace(
                "timer.when > phaseTime",
                "timer.when > hostNow()",
            ),
            1100,
        ],
    ]) {
        const observed = parseScalar(run(text, 0, callback).stdout);
        assert.ok(observed.findings.includes("future-deadline"));
        assert.notEqual(observed.output, expected);
    }
    const stopOnUnref = timers.replace(
        "                drain();\n            }\n            if (immediateHead",
        "                drain();\n                if (referenced === 0) break;\n            }\n            if (immediateHead",
    );
    assert.notEqual(stopOnUnref, timers, "unique regression anchor");
    assert.notEqual(
        run(stopOnUnref, 1100, 0).stdout,
        expected + "unexpected\n",
    );
});

test("inserted critical regions only branch and copy existing scalar values", () => {
    const text = instrumentScalar(timers);
    const regions = [
        ...text.matchAll(
            /\/\/ scalar632 (\w+) begin\n([\s\S]*?)\/\/ scalar632 \1 end/g,
        ),
    ];
    assert.deepEqual(
        regions.map((match) => match[1]),
        ["schedule", "phase", "admission", "after"],
    );
    for (const [, , region] of regions) {
        assert.doesNotMatch(
            region,
            /\b(?:new|function|hostNow|networkAlive|record|console|JSON|callback|signal)\b|\[|\+|\*|\//,
        );
        // No call, object retention, indexed write or computed numeric accumulator.
        assert.doesNotMatch(region.replace(/\b(?:if|else)\b/g, ""), /\w\s*\(/);
        const assignments = [
            ...region.matchAll(/(?<![=!])\b(n632\w+) = ([^;]+);/g),
        ];
        assert.ok(assignments.length);
        for (const [, , value] of assignments)
            assert.match(
                value,
                /^(?:timer\.(?:id|when|delay|referenced)|count|referenced|phaseTime|true)$/,
            );
    }
    assert.match(text, /loop\(\);\s*__nonaRegexpVm.dumpTimeoutScalar\(\);/);
    assert.throws(
        () =>
            instrumentScalar(
                timers.replace("if (timer.when > phaseTime) break;", ""),
            ),
        /Unique scalar anchor/,
    );
});

function dump(evidence) {
    return expected + "NONA_TIMEOUT_SCALAR " + JSON.stringify(evidence) + "\n";
}
const valid = {
    version: 1,
    firstPhase: 1,
    overflow: false,
    scheduled: [
        [1, 1, 1, false, 1, 0],
        [2, 1000, 1000, false, 2, 0],
        [3, 20, 20, true, 3, 1],
    ],
    admissions: [
        [1, 1, 1, 3, 1, 2, 1],
        [3, 20, 20, 2, 1, 1, 0],
    ],
};
test("pure schema rejects missing, malformed, duplicate, or unbounded evidence", () => {
    for (const stdout of [
        expected,
        expected + "NONA_TIMEOUT_SCALAR {\n",
        dump(valid) + dump(valid),
        dump({ ...valid, version: 2 }),
        dump({ ...valid, firstPhase: null }),
        dump({ ...valid, scheduled: [[1, 1, 1, {}, 1, 0]] }),
        dump({
            ...valid,
            admissions: [...valid.admissions, ...valid.admissions],
        }),
        dump({
            ...valid,
            admissions: [
                [1, 1, 1, 3, 1, 2, 1],
                [1, 1, 1, 2, 1, 1, 0],
            ],
        }),
    ])
        assert.throws(() => parseScalar(stdout));
    const parsed = parseScalar(dump(valid));
    assert.equal(parsed.output, expected);
    assert.deepEqual(parsed.evidence, valid);
    assert.deepEqual(parsed.findings, []);
    assert.equal(
        parseScalar("unexpected\n" + dump(valid)).output,
        "unexpected\n" + expected,
    );
});

test("schema retains future-deadline/state-corruption evidence as findings", () => {
    for (const [evidence, finding] of [
        [{ ...valid, admissions: [[1, 1, 0, 3, 1, 2, 1]] }, "future-deadline"],
        [{ ...valid, admissions: [[1, 2, 2, 3, 1, 2, 1]] }, "changed-deadline"],
        [{ ...valid, overflow: true }, "overflow"],
        [{ ...valid, admissions: [[1, 1, 1, 3, 1, 3, 1]] }, "changed-counts"],
        [
            { ...valid, admissions: [[1, 1, 1, 4, 1, 3, 1]] },
            "changed-admission-counts",
        ],
        [
            {
                ...valid,
                scheduled: [[1, 1, 1, true, 1, 1], ...valid.scheduled.slice(1)],
            },
            "changed-schedule",
        ],
    ]) {
        const result = parseScalar(dump(evidence));
        assert.deepEqual(result.evidence, evidence);
        assert.ok(result.findings.includes(finding));
    }
});
