// Decides whether a pull request needs the Test262 directory jobs of check
// (#371): they exercise the compiler and runtime, so a pull request that
// changes only tests, other scripts, docs, the site, examples or other
// workflows skips them. main, manual runs and full-ci pull requests run them.
//
//   node scripts/ci-changes.mjs
//
// Writes `test262=true|false` to $GITHUB_OUTPUT and a line to the job
// summary. Environment: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_NAME,
// PR_NUMBER, FULL_CI ("true" when the PR has the full-ci label). Any API
// failure runs the jobs.
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Changed paths that the Test262 directory jobs depend on. */
export const test262Paths = [
    /^src\//,
    /^scripts\/(test262-smoke|lib-sources|build)\.mjs$/,
    /^tests\/test262/,
    /^package(-lock)?\.json$/,
    /^tsconfig\.json$/,
    /^\.github\/workflows\/check\.yml$/,
];

/** The decision from plain data; files is null when the list is unknown. */
export function needsTest262({ event, fullCi, files }) {
    if (event !== "pull_request")
        return { run: true, reason: "not a pull request" };
    if (fullCi) return { run: true, reason: "full-ci label" };
    if (files === null) return { run: true, reason: "changed files unknown" };
    const hit = files.find((file) =>
        test262Paths.some((pattern) => pattern.test(file)),
    );
    return hit
        ? { run: true, reason: "changes " + hit }
        : {
              run: false,
              reason: "no change under src/, the Test262 runner, package files or check.yml",
          };
}

async function changedFiles() {
    const files = [];
    for (let page = 1; page <= 30; page++) {
        const response = await fetch(
            `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/pulls/${process.env.PR_NUMBER}/files?per_page=100&page=${page}`,
            {
                headers: {
                    accept: "application/vnd.github+json",
                    authorization: "Bearer " + process.env.GITHUB_TOKEN,
                },
            },
        );
        if (!response.ok) return null;
        const batch = await response.json();
        for (const file of batch) {
            files.push(file.filename);
            if (file.previous_filename) files.push(file.previous_filename);
        }
        if (batch.length < 100) return files;
    }
    return null; // more than 3000 files: the API truncates the list
}

async function main() {
    const event = process.env.GITHUB_EVENT_NAME;
    let files = null;
    if (event === "pull_request")
        files = await changedFiles().catch(() => null);
    const decision = needsTest262({
        event,
        fullCi: process.env.FULL_CI === "true",
        files,
    });
    const line = `Test262 directory jobs: ${decision.run ? "run" : "skipped"} (${decision.reason}).\n`;
    process.stdout.write(line);
    if (process.env.GITHUB_OUTPUT)
        appendFileSync(process.env.GITHUB_OUTPUT, `test262=${decision.run}\n`);
    if (process.env.GITHUB_STEP_SUMMARY)
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, line);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
