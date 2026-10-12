// Runs the named test suites of tests/suites.json with `node --test`.
//
//   node scripts/run-suite.mjs <suite...>          run the suites' compiled tests
//   node scripts/run-suite.mjs --list <suite...>   print their dist/tests files
//   node scripts/run-suite.mjs --list-suites       print the suite names
//
// Every tests/<name>.test.ts belongs to exactly one suite; tests/suites.test.ts
// checks that, so a new test file has to be assigned before CI passes.
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** The suite manifest: suite name -> {description, files}. */
export function loadSuites(root = projectRoot) {
    return JSON.parse(readFileSync(join(root, "tests", "suites.json"), "utf8"))
        .suites;
}

/** Test names (file names without .test.ts) present in tests/. */
export function testNames(root = projectRoot) {
    return readdirSync(join(root, "tests"))
        .filter((name) => name.endsWith(".test.ts"))
        .map((name) => name.slice(0, -".test.ts".length))
        .sort();
}

/** A manifest entry as a matcher: `*` matches any characters, everything else is literal. */
export function entryPattern(entry) {
    return new RegExp(
        "^" +
            entry
                .split("*")
                .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                .join(".*") +
            "$",
    );
}

/** Test names of one suite, in manifest order; throws for an unknown suite or an entry that matches nothing. */
export function suiteTests(suites, suite, names) {
    const entry = Object.hasOwn(suites, suite) ? suites[suite] : undefined;
    if (!entry)
        throw new Error(
            "Unknown test suite: " +
                suite +
                " (known: " +
                Object.keys(suites).join(", ") +
                ")",
        );
    const result = [];
    for (const file of entry.files) {
        const pattern = entryPattern(file),
            matches = names.filter((name) => pattern.test(name));
        if (!matches.length)
            throw new Error(
                "Suite " +
                    suite +
                    ": " +
                    file +
                    " matches no tests/*.test.ts file",
            );
        for (const name of matches)
            if (!result.includes(name)) result.push(name);
    }
    return result;
}

/** Problems with the manifest: files in no suite or in several, entries that match nothing. */
export function manifestProblems(suites, names) {
    const problems = [],
        owners = new Map(names.map((name) => [name, []]));
    for (const [suite, { files }] of Object.entries(suites)) {
        const tests = new Set();
        for (const file of files) {
            const pattern = entryPattern(file),
                matches = names.filter((name) => pattern.test(name));
            if (!matches.length)
                problems.push(
                    "Suite " +
                        suite +
                        ": " +
                        file +
                        " matches no tests/*.test.ts file",
                );
            for (const name of matches) tests.add(name);
        }
        for (const name of tests) owners.get(name).push(suite);
    }
    for (const [name, suite] of owners) {
        if (!suite.length)
            problems.push(
                "tests/" +
                    name +
                    ".test.ts belongs to no suite in tests/suites.json",
            );
        else if (suite.length > 1)
            problems.push(
                "tests/" +
                    name +
                    ".test.ts belongs to several suites: " +
                    suite.join(", "),
            );
    }
    return problems;
}

function main(args) {
    const suites = loadSuites(),
        names = testNames();
    if (args[0] === "--list-suites") {
        for (const name of Object.keys(suites)) console.log(name);
        return 0;
    }
    const list = args[0] === "--list",
        requested = list ? args.slice(1) : args;
    if (!requested.length) {
        console.error(
            "Usage: node scripts/run-suite.mjs [--list] <suite...> | --list-suites",
        );
        return 2;
    }
    const tests = [];
    for (const suite of requested)
        for (const name of suiteTests(suites, suite, names))
            if (!tests.includes(name)) tests.push(name);
    const files = tests.map((name) => "dist/tests/" + name + ".test.js");
    if (list) {
        for (const file of files) console.log(file);
        return 0;
    }
    const result = spawnSync(process.execPath, ["--test", ...files], {
        cwd: projectRoot,
        stdio: "inherit",
    });
    if (result.error) throw result.error;
    return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    process.exitCode = main(process.argv.slice(2));
