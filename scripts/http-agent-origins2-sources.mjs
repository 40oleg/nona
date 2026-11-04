// Pure source/protocol adapter. No compiler, child processes or campaign on import.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const ORIGINAL_SHA256 =
    "12620f7d6cfd9c20e591f08fb1d12765920a2995582e19efb37946e8e5e609f5";
export const EXPECTED =
    "queued 2 2\nwoken 2 /hold0,/other1,/other2\ncomplete 2 /hold0,/hold1,/other1,/other2 4 peak 2\n";
const sha = (text) => createHash("sha256").update(text).digest("hex");
const normalize = (text) => text.replaceAll("\r\n", "\n");

function observed(source) {
    const edits = [];
    const replace = (before, after) => {
        assert.equal(
            source.split(before).length,
            2,
            "Observer anchor cardinality",
        );
        source = source.replace(before, after);
        edits.push({ before, after });
    };
    replace(
        "async function scenario(limit) {",
        `const observationStart = Date.now();
function observe(phase, path, url, ended) {
  console.error('ORIGINS2\\t' + JSON.stringify([phase, path, url, ended, Date.now() - observationStart]));
}
async function scenario(limit) {`,
    );
    replace(
        "  function cleanup() {\n    if (cleaning) return;",
        "  function cleanup() {\n    observe('cleanup-entry', '-', '-', false);\n    if (cleaning) return;",
    );
    replace(
        "    for (const server of servers) server.close();",
        "    for (const server of servers) server.close();\n    observe('cleanup-return', '-', '-', false);",
    );
    replace(
        "          held.push(res);",
        "          observe('held-response', req.url, res.req.url, false);\n          held.push(res);",
    );
    replace(
        "  function get(port, path) {\n    return new Promise(resolve => {",
        "  function get(port, path) {\n    if (path.startsWith('/hold')) observe('hold-create', path, '-', false);\n    return new Promise(resolve => {",
    );
    replace(
        "        let body = '';",
        "        if (path.startsWith('/hold')) observe('response', path, '-', false);\n        let body = '';",
    );
    replace(
        "        res.on('end', () => { ended = true; completed.push(body); });",
        "        res.on('end', () => { ended = true; completed.push(body); if (path.startsWith('/hold')) observe('end', path, '-', ended); });",
    );
    replace(
        "        socket.once('close', () => { liveSockets--; });",
        "        socket.once('close', () => { liveSockets--; if (path.startsWith('/hold')) observe('socket-close', path, '-', ended); });",
    );
    replace(
        "      req.on('close', () => { if (ended) resolve(); });",
        "      req.on('close', () => {\n        if (path.startsWith('/hold')) observe('request-close', path, '-', ended);\n        if (ended) {\n          if (path.startsWith('/hold')) observe('resolve-before', path, '-', ended);\n          resolve();\n          if (path.startsWith('/hold')) observe('resolve-after', path, '-', ended);\n        }\n      });",
    );
    replace(
        "  held[0].end('/hold0');",
        "  observe('held-end-before', held[0].req.url, held[0].req.url, false);\n  held[0].end('/hold0');\n  observe('held-end-after', held[0].req.url, held[0].req.url, false);",
    );
    replace(
        "  for (let i = 1; i < held.length; i++) held[i].end('/hold' + i);",
        "  observe('woken-return', '-', '-', false);\n  for (let i = 1; i < held.length; i++) {\n    observe('held-end-before', held[i].req.url, held[i].req.url, false);\n    held[i].end('/hold' + i);\n    observe('held-end-after', held[i].req.url, held[i].req.url, false);\n  }",
    );
    replace(
        "  await Promise.all(holds);",
        "  observe('all-await-before', '-', '-', false);\n  await Promise.all(holds);\n  observe('all-await-after', '-', '-', false);",
    );
    return { source, edits };
}

export function makeSources(witness, agentProgram) {
    assert.equal(witness.id, "origins/2");
    assert.equal(witness.stressSource, undefined, "Unexpected source override");
    assert.equal(witness.expected.join("\n") + "\n", EXPECTED);
    const original = agentProgram(witness, true, "on");
    assert.deepEqual(Object.keys(original.options).sort(), [
        "gcStress",
        "oracleSource",
    ]);
    assert.equal(original.options.gcStress, true);
    assert.equal(Buffer.byteLength(original.source), 3108);
    assert.equal(
        sha(original.source),
        ORIGINAL_SHA256,
        "Original source drift",
    );
    assert.equal(
        original.options.oracleSource,
        original.source.replace(
            "function cleanupWatchdog(callback) { return undefined; }",
            "function cleanupWatchdog(callback) { return setTimeout(callback, 6000); }",
        ),
    );
    const armB = observed(original.source);
    const oracleB = observed(original.options.oracleSource);
    return [
        {
            id: "A",
            source: original.source,
            oracleSource: original.options.oracleSource,
            edits: [],
        },
        { id: "B", ...armB, oracleSource: oracleB.source },
    ].map((arm) => ({
        ...arm,
        sourceSha256: sha(arm.source),
        oracleSha256: sha(arm.oracleSource),
        requestedGC: true,
        selection: "on",
        nativeBoundMs: 180000,
        oracleBoundMs: 60000,
    }));
}

const perHold = [
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
];
const globalPhases = [
    "woken-return",
    "all-await-before",
    "all-await-after",
    "cleanup-entry",
    "cleanup-return",
];
export function parseDiagnostics(stderr, complete = false) {
    stderr = normalize(stderr);
    if (stderr === "") {
        assert.equal(complete, false, "Missing diagnostics");
        return [];
    }
    assert.ok(stderr.endsWith("\n"), "Truncated diagnostic row");
    const seen = new Set();
    const rows = stderr
        .slice(0, -1)
        .split("\n")
        .map((line) => {
            assert.ok(line.startsWith("ORIGINS2\t"), "Unknown stderr channel");
            const row = JSON.parse(line.slice(9));
            assert.ok(
                Array.isArray(row) && row.length === 5,
                "Malformed diagnostic tuple",
            );
            const [phase, path, url, ended, ms] = row;
            assert.ok(
                typeof ended === "boolean" && Number.isFinite(ms) && ms >= 0,
            );
            if (perHold.includes(phase)) {
                assert.ok(
                    path === "/hold0" || path === "/hold1",
                    "Unknown hold identity",
                );
                assert.equal(
                    url,
                    phase === "held-response" || phase.startsWith("held-end")
                        ? path
                        : "-",
                    "Held response URL mismatch",
                );
            } else {
                assert.ok(globalPhases.includes(phase), "Unknown phase");
                assert.equal(path, "-");
                assert.equal(url, "-");
            }
            const key = phase + ":" + path;
            assert.ok(!seen.has(key), "Duplicate diagnostic phase");
            seen.add(key);
            return row;
        });
    if (complete) {
        assert.equal(rows.length, 25, "Incomplete diagnostic phases");
        for (const [phase, , , ended] of rows)
            if (
                [
                    "end",
                    "request-close",
                    "resolve-before",
                    "resolve-after",
                ].includes(phase)
            )
                assert.equal(ended, true, "Unsettled local ended predicate");
    }
    return rows;
}

function successful(run) {
    assert.equal(run.status, 0);
    for (const key of ["signal", "error"]) assert.equal(run[key], null);
    for (const key of ["deadlineExceeded", "forcedPipeCleanup"])
        assert.equal(run[key], false);
    for (const key of ["exitSeen", "closeSeen"]) assert.equal(run[key], true);
    for (const key of [
        "stdoutEnded",
        "stderrEnded",
        "stdoutClosed",
        "stderrClosed",
    ])
        assert.equal(run.pipes[key], true);
}

export function compareArm(
    id,
    native,
    stdout,
    stderr,
    oracle,
    oracleStdout,
    oracleStderr,
) {
    const result = {
        semanticMatch: false,
        diagnosticCollection: false,
        productAcceptance: false,
        errors: [],
        nativeRows: [],
        oracleRows: [],
    };
    // Each raw stream remains independent; never replace native output with Node.
    for (const [key, value] of [
        ["nativeRows", stderr],
        ["oracleRows", oracleStderr],
    ]) {
        try {
            if (id === "B") result[key] = parseDiagnostics(value, false);
            else assert.equal(value, "");
        } catch (error) {
            result.errors.push(error.message);
        }
    }
    try {
        assert.ok(id === "A" || id === "B");
        successful(native);
        successful(oracle);
        assert.equal(normalize(stdout), EXPECTED);
        assert.equal(normalize(oracleStdout), EXPECTED);
        assert.equal(normalize(stdout), normalize(oracleStdout));
        if (id === "B") {
            parseDiagnostics(stderr, true);
            parseDiagnostics(oracleStderr, true);
        } else {
            assert.equal(stderr, "");
            assert.equal(oracleStderr, "");
        }
        assert.equal(result.errors.length, 0);
        result.semanticMatch = true;
        result.diagnosticCollection = true;
    } catch (error) {
        result.errors.push(error.message);
    }
    return result;
}
