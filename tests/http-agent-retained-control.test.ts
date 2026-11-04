import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const { selectedExactlyOnce } = await import(
    pathToFileURL(resolve("scripts/http-agent-retained-evidence.mjs")).href
);
const testName =
    "node:http Agent: retains callback contexts and the deferred cancellation error until capacity is released";

// Only Node runs these tiny fixtures; no compiler or native witness is invoked.
function transcript(body: string) {
    const source = `import test from 'node:test';
import assert from 'node:assert/strict';
const name = ${JSON.stringify(testName)};
${body}
`;
    const env = { ...process.env };
    // A child test runner must not inherit the parent's worker marker.
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(
        process.execPath,
        [
            "--input-type=module",
            "--test-concurrency=1",
            "--test-reporter=tap",
            "-e",
            source,
        ],
        {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
            env,
        },
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.stderr, "");
    return result;
}

test("retained control evidence accepts one actual passing named witness", () => {
    const result = transcript("test(name, () => assert.equal(1 + 1, 2));");
    assert.equal(result.status, 0);
    assert.equal(selectedExactlyOnce(result.stdout, testName), true);
    assert.equal(
        selectedExactlyOnce(result.stdout.replace(/\r?\n/g, "\r\n"), testName),
        true,
    );
    assert.equal(selectedExactlyOnce(result.stdout, "another witness"), false);
    for (const field of [
        "tests",
        "pass",
        "fail",
        "cancelled",
        "skipped",
        "todo",
    ]) {
        assert.equal(
            selectedExactlyOnce(
                result.stdout.replace(
                    new RegExp(`^# ${field} \\d+\\r?$`, "m"),
                    "",
                ),
                testName,
            ),
            false,
            `Missing ${field} evidence must be rejected`,
        );
    }
});

for (const [kind, body, status] of [
    ["TODO", "test.todo(name);", 0],
    ["skipped", "test.skip(name, () => {});", 0],
    [
        "cancelled",
        "const controller = new AbortController(); controller.abort(); test(name, { signal: controller.signal }, () => {});",
        1,
    ],
    ["failing", "test(name, () => assert.fail('fixture failure'));", 1],
    ["wrong-name", "test('another witness', () => assert.equal(1 + 1, 2));", 0],
] as const) {
    test(`retained control evidence rejects a ${kind} transcript`, () => {
        const result = transcript(body);
        assert.equal(result.status, status);
        assert.equal(selectedExactlyOnce(result.stdout, testName), false);
    });
}

test("retained control evidence rejects zero-test and empty transcripts", () => {
    const tap = `TAP version 13
1..0
# tests 0
# suites 0
# pass 0
# fail 0
# cancelled 0
# skipped 0
# todo 0
`;
    assert.equal(selectedExactlyOnce(tap, testName), false);
    assert.equal(selectedExactlyOnce("", testName), false);
});
