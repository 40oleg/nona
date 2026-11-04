// Supplementary #632 observations; the original timer source stays untouched.
import assert from "node:assert/strict";

export const scalarFormat = {
    version: 1,
    scheduled: [
        "id",
        "deadline",
        "delay",
        "timerReferenced",
        "activeCount",
        "references",
    ],
    admissions: [
        "id",
        "deadline",
        "phaseSnapshot",
        "activeCount",
        "references",
        "afterCount",
        "afterReferences",
    ],
    capacity: 3,
    prefix: "NONA_TIMEOUT_SCALAR ",
};

/** @param {string} text */
export function instrumentScalar(text) {
    // These loops/string operations run in the probe, never in the executable.
    // The inserted hot-path statements only branch and copy existing scalars.
    const scheduled = ["Id", "When", "Delay", "Ref", "Count", "Refs"];
    const admitted = [
        "Id",
        "When",
        "Phase",
        "Count",
        "Refs",
        "AfterCount",
        "AfterRefs",
    ];
    const declarations = ["n632Phase = -1", "n632Overflow = false"];
    for (const slot of [1, 2, 3]) {
        for (const field of scheduled)
            declarations.push(
                `n632S${slot}${field} = ${field === "Ref" ? "false" : "0"}`,
            );
        for (const field of admitted)
            declarations.push(
                `n632A${slot}${field} = ${field === "Id" ? "0" : "-1"}`,
            );
    }
    /** @param {string} before @param {string} after */
    function replace(before, after) {
        assert.equal(
            text.split(before).length,
            2,
            `Unique scalar anchor: ${before}`,
        );
        text = text.replace(before, after);
    }
    /** @param {string} name @param {string} code */
    function region(name, code) {
        return `\n// scalar632 ${name} begin\n${code}\n// scalar632 ${name} end\n`;
    }
    const schedule =
        [1, 2, 3]
            .map(
                (slot) =>
                    `${slot === 1 ? "if" : "else if"} (timer.id === ${slot}) {\n` +
                    scheduled
                        .map(
                            (field, i) =>
                                `n632S${slot}${field} = ${["timer.id", "timer.when", "timer.delay", "timer.referenced", "count", "referenced"][i]};`,
                        )
                        .join("\n") +
                    "\n}",
            )
            .join(" ") + " else { n632Overflow = true; }";
    const admission =
        [1, 2, 3]
            .map(
                (slot) =>
                    `${slot === 1 ? "if" : "else if"} (n632A${slot}Id === 0) {\n` +
                    admitted
                        .slice(0, 5)
                        .map(
                            (field, i) =>
                                `n632A${slot}${field} = ${["timer.id", "timer.when", "phaseTime", "count", "referenced"][i]};`,
                        )
                        .join("\n") +
                    "\n}",
            )
            .join(" ") + " else { n632Overflow = true; }";
    const after = [1, 2, 3]
        .map(
            (slot) =>
                `${slot === 1 ? "if" : "else if"} (n632A${slot}AfterCount === -1) {\n` +
                `n632A${slot}AfterCount = count;\nn632A${slot}AfterRefs = referenced;\n}`,
        )
        .join(" ");
    const scheduleRows = [1, 2, 3].map(
        (slot) =>
            "[" +
            scheduled.map((field) => `n632S${slot}${field}`).join(", ") +
            "]",
    );
    const admissionRows = [1, 2, 3].map(
        (slot) =>
            `if (n632A${slot}Id !== 0) admissions.push([` +
            admitted.map((field) => `n632A${slot}${field}`).join(", ") +
            "]);",
    );
    replace(
        "    var heap = [],",
        `    var ${declarations.join(",\n        ")};
    __nonaRegexpVm.dumpTimeoutScalar = function () {
        var admissions = [];
        ${admissionRows.join("\n        ")}
        console.log('NONA_TIMEOUT_SCALAR ' + JSON.stringify({
            version: 1, firstPhase: n632Phase, overflow: n632Overflow,
            scheduled: [${scheduleRows.join(", ")}], admissions: admissions
        }));
    };
    var heap = [],`,
    );
    replace(
        "        push(timer);\n        return id;",
        "        push(timer);" +
            region("schedule", schedule) +
            "        return id;",
    );
    replace(
        "            var phaseTime = hostNow();",
        "            var phaseTime = hostNow();" +
            region("phase", "if (n632Phase === -1) n632Phase = phaseTime;"),
    );
    replace(
        "                if (timer.when > phaseTime) break;\n                pop();",
        "                if (timer.when > phaseTime) break;" +
            region("admission", admission) +
            "                pop();",
    );
    replace(
        "                run(timer);\n                drain();",
        "                run(timer);\n                drain();" +
            region("after", after),
    );
    return (
        text +
        `
__nonaPromiseDrainJobs = (function (loop) {
    return function () {
        loop();
        __nonaRegexpVm.dumpTimeoutScalar();
    };
})(__nonaPromiseDrainJobs);
`
    );
}

/** @param {string} stdout */
export function parseScalar(stdout) {
    // Pure post-process validation: malformed evidence cannot hide program output.
    const lines = stdout.split("\n");
    const dumps = lines.filter((line) => line.startsWith(scalarFormat.prefix));
    assert.equal(dumps.length, 1, "Exactly one scalar dump after loop return");
    const evidence = JSON.parse(dumps[0].slice(scalarFormat.prefix.length));
    assert.deepEqual(Object.keys(evidence).sort(), [
        "admissions",
        "firstPhase",
        "overflow",
        "scheduled",
        "version",
    ]);
    assert.equal(evidence.version, 1);
    assert.equal(typeof evidence.overflow, "boolean");
    /** @param {unknown} value */
    const number = (value) =>
        assert.ok(
            typeof value === "number" && Number.isFinite(value) && value >= 0,
            "Finite nonnegative scalar",
        );
    /** @param {unknown} value */
    const count = (value) => {
        number(value);
        assert.ok(Number.isSafeInteger(value), "Integer count/id");
    };
    number(evidence.firstPhase);
    assert.ok(Array.isArray(evidence.scheduled));
    assert.equal(evidence.scheduled.length, 3);
    assert.ok(Array.isArray(evidence.admissions));
    assert.ok(evidence.admissions.length <= 3);
    const seen = new Set();
    for (const [index, row] of evidence.scheduled.entries()) {
        assert.ok(Array.isArray(row));
        assert.equal(row.length, 6);
        assert.equal(row[0], index + 1);
        number(row[1]);
        number(row[2]);
        assert.equal(typeof row[3], "boolean");
        count(row[4]);
        count(row[5]);
    }
    const findings = evidence.overflow ? ["overflow"] : [];
    let previousCount = 3,
        previousRefs = 1;
    for (const row of evidence.admissions) {
        assert.ok(Array.isArray(row));
        assert.equal(row.length, 7);
        const [
            id,
            deadline,
            phase,
            beforeCount,
            beforeRefs,
            afterCount,
            afterRefs,
        ] = row;
        count(id);
        assert.ok(
            id >= 1 && id <= 3 && !seen.has(id),
            "Unique admitted fixture id",
        );
        seen.add(id);
        number(deadline);
        number(phase);
        for (const value of [beforeCount, beforeRefs, afterCount, afterRefs])
            count(value);
        const scheduled = evidence.scheduled[id - 1];
        if (beforeCount !== previousCount || beforeRefs !== previousRefs)
            findings.push("changed-admission-counts");
        if (deadline > phase) findings.push("future-deadline");
        if (deadline !== scheduled[1]) findings.push("changed-deadline");
        if (
            afterCount !== beforeCount - 1 ||
            afterRefs !== beforeRefs - Number(scheduled[3])
        )
            findings.push("changed-counts");
        previousCount = afterCount;
        previousRefs = afterRefs;
    }
    if (
        evidence.admissions.length &&
        evidence.admissions[0][2] !== evidence.firstPhase
    )
        findings.push("changed-first-phase");
    for (const [index, row] of evidence.scheduled.entries()) {
        if (
            row[2] !== [1, 1000, 20][index] ||
            row[3] !== (index === 2) ||
            row[4] !== index + 1 ||
            row[5] !== Number(index === 2)
        )
            findings.push("changed-schedule");
    }
    return {
        output: lines
            .filter((line) => !line.startsWith(scalarFormat.prefix))
            .join("\n"),
        evidence,
        findings,
    };
}
