import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Suites = Record<string, { description: string; files: string[] }>;
interface SuiteRunner {
    loadSuites(): Suites;
    testNames(): string[];
    suiteTests(suites: Suites, suite: string, names: string[]): string[];
    manifestProblems(suites: Suites, names: string[]): string[];
}
const runner = async () =>
    (await import(
        pathToFileURL(resolve("scripts/run-suite.mjs")).href
    )) as SuiteRunner;

test("every tests/*.test.ts belongs to exactly one suite of tests/suites.json", async () => {
    const { loadSuites, testNames, manifestProblems } = await runner();
    const suites = loadSuites();
    for (const [name, suite] of Object.entries(suites))
        assert.ok(suite.description && suite.files.length, name);
    assert.deepEqual(manifestProblems(suites, testNames()), []);
});

test("the suite check reports unassigned, doubly assigned and dangling entries", async () => {
    const { suiteTests, manifestProblems } = await runner();
    const names = ["a", "b-one", "b-two", "c"];
    const suites: Suites = {
        first: { description: "x", files: ["a", "b-*"] },
        second: { description: "y", files: ["b-two", "missing"] },
    };
    assert.deepEqual(suiteTests(suites, "first", names), [
        "a",
        "b-one",
        "b-two",
    ]);
    assert.throws(
        () => suiteTests(suites, "third", names),
        /Unknown test suite: third/,
    );
    assert.deepEqual(manifestProblems(suites, names), [
        "Suite second: missing matches no tests/*.test.ts file",
        "tests/b-two.test.ts belongs to several suites: first, second",
        "tests/c.test.ts belongs to no suite in tests/suites.json",
    ]);
});
