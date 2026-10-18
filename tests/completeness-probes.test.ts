import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const runner = () =>
    import(pathToFileURL(resolve("scripts/completeness-probes.mjs")).href);

test("probe process records failures, timeouts and bounded output without hiding them as agreement", async () => {
    const { runBounded, matches } = await runner();
    const failed = await runBounded(process.execPath, [
        "-e",
        "console.log('partial');console.error('diagnostic');process.exitCode=7",
    ]);
    assert.equal(failed.exit, 7);
    assert.match(failed.stderr, /diagnostic/);
    assert.equal(matches(failed, "partial\n"), false);
    const missing = await runBounded(
        join(tmpdir(), "nona-no-such-probe-executable"),
        [],
    );
    assert.equal(missing.error.code, "ENOENT");
    const timeout = await runBounded(
        process.execPath,
        ["-e", "setInterval(()=>{},1000)"],
        { timeoutMs: 300 },
    );
    assert.equal(timeout.timedOut, true);
    assert.equal(matches(timeout, ""), false);
    const flood = await runBounded(
        process.execPath,
        ["-e", "process.stdout.write('x'.repeat(20000))"],
        { maxOutput: 1024 },
    );
    assert.equal(flood.truncated, true);
    assert.ok(flood.stdout.length <= 1024);
    assert.equal(matches(flood, flood.stdout), false);
});

test("timeout terminates a spawned descendant before temporary files are removed", async () => {
    const { runBounded, removeProbeDirectory } = await runner();
    const directory = mkdtempSync(join(tmpdir(), "nona-completeness-"));
    try {
        const pidFile = join(directory, "pid");
        const source = `const child=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(child.pid));setInterval(()=>{},1000)`;
        const result = await runBounded(process.execPath, ["-e", source], {
            timeoutMs: 1500,
        });
        assert.equal(result.timedOut, true);
        const pid = Number(readFileSync(pidFile, "utf8"));
        // Unix may briefly retain a killed child as a zombie; it cannot execute.
        let alive = false;
        try {
            process.kill(pid, 0);
            alive =
                process.platform === "linux"
                    ? !/\) Z /.test(readFileSync(`/proc/${pid}/stat`, "utf8"))
                    : true;
        } catch {}
        assert.equal(alive, false, `descendant ${pid} survived timeout`);
    } finally {
        removeProbeDirectory(directory, tmpdir());
    }
    assert.equal(existsSync(directory), false);
});

test("cleanup rejects unsafe paths and removes only its own directory after an error", async () => {
    const { removeProbeDirectory } = await runner();
    assert.throws(() => removeProbeDirectory(tmpdir(), tmpdir()), /unsafe/);
    assert.throws(
        () => removeProbeDirectory(resolve(tmpdir(), ".."), tmpdir()),
        /unsafe/,
    );
    const directory = mkdtempSync(join(tmpdir(), "nona-completeness-"));
    try {
        writeFileSync(join(directory, "partial"), "artifact");
        throw new Error("simulated failure");
    } catch {
        removeProbeDirectory(directory, tmpdir());
    }
    assert.equal(existsSync(directory), false);
});

test("probe CLI refuses invalid arguments before package install or compilation", async () => {
    const { main } = await runner();
    await assert.rejects(main(["--output"]), /incomplete argument/);
    await assert.rejects(main(["--parallel", "8"]), /Unknown/);
});

test("package fixture lock and primary source records pin every direct dependency", () => {
    const directory = "tests/fixtures/completeness/";
    const metadata = JSON.parse(
        readFileSync(directory + "package.json", "utf8"),
    );
    const lock = JSON.parse(
        readFileSync(directory + "package-lock.json", "utf8"),
    );
    const sources = JSON.parse(
        readFileSync(directory + "sources.json", "utf8"),
    );
    assert.deepEqual(lock.packages[""].dependencies, metadata.dependencies);
    for (const [name, version] of Object.entries(metadata.dependencies)) {
        assert.match(version as string, /^\d+\.\d+\.\d+$/);
        const source = sources.packages.find(
            (entry: { name: string }) => entry.name === name,
        );
        assert.equal(source.version, version);
        assert.equal(
            source.registry,
            `https://registry.npmjs.org/${name}/${version}`,
        );
        assert.equal(
            lock.packages[`node_modules/${name}`].integrity,
            source.integrity,
        );
    }
});

test("Test262 summary keeps pre-selection exclusions, skips and compile-only passes separate", async () => {
    const { summarizeTest262 } = await import(
        pathToFileURL(resolve("scripts/completeness-test262-summary.mjs")).href
    );
    const report = {
        group: "built-ins/Example",
        counts: { pass: 2, fail: 1, skip: 1 },
        results: [
            {
                path: "built-ins/Example/a.js",
                outcome: "pass",
                phase: "runtime",
            },
            { path: "built-ins/Example/b.js", outcome: "pass", phase: "parse" },
            {
                path: "built-ins/Example/c.js",
                outcome: "fail",
                phase: "compile",
            },
            { path: "built-ins/Example/d.js", outcome: "skip" },
        ],
    };
    const paths = ["a", "b", "c", "d", "excluded"].map(
        (name) => `built-ins/Example/${name}.js`,
    );
    const summary = summarizeTest262(report, paths);
    assert.deepEqual(
        [
            summary.totalInGroup,
            summary.selected,
            summary.excludedBeforeSelection,
            summary.evaluated,
            summary.runtimeExecuted,
            summary.compilerOnly,
            summary.passed,
            summary.failed,
            summary.skipped,
        ],
        [5, 4, 1, 3, 1, 2, 2, 1, 1],
    );
    assert.throws(
        () => summarizeTest262({ ...report, counts: { pass: 5 } }, paths),
        /Inconsistent/,
    );
});
