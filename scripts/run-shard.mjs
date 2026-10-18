// Runs one shard of the compiled test files (#370): CI splits the Windows
// tests of `check` into N jobs that run in parallel.
//
//   node scripts/run-shard.mjs --shard 2/4 [--exclude a,b*] [--timings-out f.json]
//   node scripts/run-shard.mjs --shard 2/4 --list
//
// The files are dist/tests/*.test.js minus the excluded names (`*` matches any
// characters). They are split by their duration in tests/timings.json
// (seconds per test name; a name without an entry counts as the mean), the
// longest first onto the least loaded shard, so the shards finish at about the
// same time. The split depends only on the file list and the timings, so
// every job of a run computes the same one and each file runs exactly once.
// With --timings-out the run also writes the duration of each file
// (scripts/timing-reporter.mjs); scripts/test-timings.mjs merges those
// reports into tests/timings.json.
//
// With NONA_GC_STRESS_SCOPE=marked (CI on pull requests, #372) the files
// that tests/gc-stress.json lists run as usual and every other file runs with
// NONA_GC_STRESS=off, which turns the tests' gcStress builds into normal ones.
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { entryPattern, testConcurrencyArgs } from "./run-suite.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** Splits names into `count` shards by duration; returns an array of name arrays. */
export function assignShards(names, timings, count) {
    if (!Number.isInteger(count) || count < 1)
        throw new Error("Shard count must be a positive integer");
    const known = names
        .map((name) => timings[name])
        .filter((seconds) => typeof seconds === "number");
    const fallback = known.length
        ? known.reduce((a, b) => a + b, 0) / known.length
        : 1;
    const weighted = names
        .map((name) => ({
            name,
            seconds:
                typeof timings[name] === "number" ? timings[name] : fallback,
        }))
        .sort((a, b) => b.seconds - a.seconds || (a.name < b.name ? -1 : 1));
    const shards = Array.from({ length: count }, () => ({
        load: 0,
        names: [],
    }));
    for (const item of weighted) {
        let target = shards[0];
        for (const shard of shards)
            if (shard.load < target.load) target = shard;
        target.names.push(item.name);
        target.load += item.seconds;
    }
    return shards.map((shard) => shard.names.sort());
}

/** Parses "i/n" (1-based). */
export function parseShard(text) {
    const match = /^(\d+)\/(\d+)$/.exec(text ?? "");
    const index = match ? Number(match[1]) : 0,
        count = match ? Number(match[2]) : 0;
    if (!match || index < 1 || count < 1 || index > count)
        throw new Error("--shard expects i/n with 1 <= i <= n, got " + text);
    return { index, count };
}

/** Test names (without .test.js) of dist/tests, minus the excluded patterns. */
export function shardableNames(root, exclude) {
    const patterns = exclude.map(entryPattern);
    return readdirSync(join(root, "dist", "tests"))
        .filter((file) => file.endsWith(".test.js"))
        .map((file) => file.slice(0, -".test.js".length))
        .filter((name) => !patterns.some((pattern) => pattern.test(name)))
        .sort();
}

/** Splits names into those that keep GC stress and the rest (tests/gc-stress.json). */
export function splitGcStress(names, root = projectRoot) {
    const file = join(root, "tests", "gc-stress.json");
    const patterns = existsSync(file)
        ? JSON.parse(readFileSync(file, "utf8")).always.map(entryPattern)
        : [];
    const stressed = names.filter((name) =>
        patterns.some((pattern) => pattern.test(name)),
    );
    return {
        stressed,
        other: names.filter((name) => !stressed.includes(name)),
    };
}

export function loadTimings(root = projectRoot) {
    const file = join(root, "tests", "timings.json");
    return existsSync(file)
        ? JSON.parse(readFileSync(file, "utf8")).seconds
        : {};
}

function main(argv) {
    const option = (name) => {
        const at = argv.indexOf(name);
        return at < 0 ? undefined : argv[at + 1];
    };
    const { index, count } = parseShard(option("--shard"));
    const exclude = (option("--exclude") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    const names = assignShards(
        shardableNames(projectRoot, exclude),
        loadTimings(),
        count,
    )[index - 1];
    if (argv.includes("--list")) {
        for (const name of names) console.log(name);
        return 0;
    }
    console.log(`Shard ${index}/${count}: ${names.length} test files`);
    const timingsOut = option("--timings-out");
    if (timingsOut)
        mkdirSync(dirname(join(projectRoot, timingsOut)), { recursive: true });
    const run = (files, env, suffix) => {
        if (!files.length) return 0;
        const reporters = timingsOut
            ? [
                  "--test-reporter=spec",
                  "--test-reporter-destination=stdout",
                  // A file URL: on Windows an absolute path is not a valid specifier.
                  "--test-reporter=" +
                      pathToFileURL(
                          join(projectRoot, "scripts", "timing-reporter.mjs"),
                      ).href,
                  "--test-reporter-destination=" +
                      timingsOut.replace(/\.json$/, "") +
                      suffix +
                      ".json",
              ]
            : [];
        const result = spawnSync(
            process.execPath,
            [
                "--test",
                ...testConcurrencyArgs(),
                ...reporters,
                ...files.map((name) =>
                    join("dist", "tests", name + ".test.js"),
                ),
            ],
            {
                cwd: projectRoot,
                stdio: "inherit",
                env: { ...process.env, ...env },
            },
        );
        return result.status ?? 1;
    };
    if (process.env.NONA_GC_STRESS_SCOPE !== "marked")
        return run(names, {}, "");
    const { stressed, other } = splitGcStress(names);
    console.log(
        `GC stress only for ${stressed.length} of them (tests/gc-stress.json)`,
    );
    const first = run(other, { NONA_GC_STRESS: "off" }, "");
    const second = run(stressed, {}, "-stress");
    return first || second;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
    process.exitCode = main(process.argv.slice(2));
