// Denominator-preserving view of existing runner reports; never runs Test262.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

export function summarizeTest262(report, paths) {
    if (
        !Array.isArray(report.results) ||
        new Set(report.results.map((row) => row.path)).size !==
            report.results.length
    )
        throw new Error("Missing or duplicate Test262 results");
    const counts = Object.fromEntries(
        ["pass", "fail", "skip"].map((outcome) => [
            outcome,
            report.results.filter((row) => row.outcome === outcome).length,
        ]),
    );
    if (
        Object.keys(counts).some((key) => counts[key] !== report.counts[key]) ||
        counts.pass + counts.fail + counts.skip !== report.results.length
    )
        throw new Error("Inconsistent Test262 counts");
    const candidates = paths.filter((path) =>
        path.startsWith(report.group + "/"),
    );
    if (report.results.some((row) => !candidates.includes(row.path)))
        throw new Error("Result outside the pinned group");
    return {
        date: report.date,
        revision: report.revision,
        target: report.target,
        group: report.group,
        totalInGroup: candidates.length,
        selected: report.results.length,
        excludedBeforeSelection: candidates.length - report.results.length,
        evaluated: counts.pass + counts.fail,
        runtimeExecuted: report.results.filter((row) => row.phase === "runtime")
            .length,
        compilerOnly: report.results.filter((row) =>
            ["parse", "compile", "compiler-crash"].includes(row.phase),
        ).length,
        passed: counts.pass,
        failed: counts.fail,
        skipped: counts.skip,
        filters: {
            path: report.pathFilter,
            excludePaths: report.excludePathFilters,
            excludeFeatures: report.excludeFeatures,
            directOnly: report.directOnly,
            runAsync: report.runAsync,
        },
        originalJobs: report.jobs,
        failuresAndSkips: report.results.filter(
            (row) => row.outcome !== "pass",
        ),
    };
}

function reportsUnder(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? reportsUnder(join(directory, entry.name))
            : entry.name.endsWith(".json")
              ? [join(directory, entry.name)]
              : [],
    );
}

if (
    process.argv[1] &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
    try {
        const [checkout, reports, output] = process.argv.slice(2);
        if (!checkout || !reports || !output || process.argv.length !== 5)
            throw new Error(
                "Usage: node scripts/completeness-test262-summary.mjs <pinned-test262-checkout> <reports-directory> <output.json>",
            );
        const pin = readFileSync(
            new URL("./test262-smoke.mjs", import.meta.url),
            "utf8",
        ).match(/const PIN = "([0-9a-f]+)"/)[1];
        const git = (...args) =>
            execFileSync("git", ["-C", checkout, ...args], {
                encoding: "utf8",
                maxBuffer: 16 * 1024 * 1024,
                windowsHide: true,
            }).trim();
        if (git("rev-parse", "HEAD") !== pin)
            throw new Error("Wrong Test262 revision");
        const paths = git("ls-tree", "-r", "--name-only", "HEAD", "test")
            .split("\n")
            .filter(
                (path) => path.endsWith(".js") && !path.includes("_FIXTURE"),
            )
            .map((path) => path.slice(5));
        const summaries = reportsUnder(reports)
            .sort()
            .map((file) => {
                const bytes = readFileSync(file),
                    report = JSON.parse(bytes);
                if (report.revision !== pin)
                    throw new Error("Wrong report revision: " + file);
                return {
                    file,
                    sha256: createHash("sha256").update(bytes).digest("hex"),
                    ...summarizeTest262(report, paths),
                };
            });
        if (!summaries.length) throw new Error("No reports found");
        writeFileSync(
            output,
            JSON.stringify(
                {
                    revision: pin,
                    totalTestFiles: paths.length,
                    denominator:
                        "All tracked test/**/*.js excluding _FIXTURE, as enumerated by the existing runner; file counts, not strict/sloppy variants. Groups may overlap: do not sum blindly.",
                    reports: summaries,
                },
                null,
                2,
            ) + "\n",
        );
        console.log(
            `${summaries.length} reports; pinned tree has ${paths.length} candidate test files`,
        );
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
