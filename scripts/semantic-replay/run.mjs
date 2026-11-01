// Dedicated hosted-only native lane; deliberately outside the test glob.
import assert from "node:assert/strict";
import {
    readFileSync,
    readdirSync,
    chmodSync,
    writeFileSync,
    mkdirSync,
    existsSync,
    unlinkSync,
} from "node:fs";
import { resolve, join, relative } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { root, loadInventory, summarizeInventory } from "./inventory.mjs";
import {
    sha256,
    saveReport,
    recordProcess,
    recordOracle,
    writeGraph,
    effectiveOptions,
    errorDetails,
    compareOutcomes,
    assessMode,
    moduleGraphHost,
} from "./report.mjs";

const BAD_SHA = "1b414d66ba98c05bac82c722578f100ebbd17f81";
const workerTimeoutMs = 120_000;
const runTimeoutMs = 15_000;
const script = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
function hosted() {
    assert.equal(
        process.env.GITHUB_ACTIONS,
        "true",
        "native replay requires GitHub Actions",
    );
    assert.equal(
        process.env.RUNNER_ENVIRONMENT,
        "github-hosted",
        "native replay requires a GitHub-hosted runner",
    );
    assert.equal(process.arch, "x64");
    assert.ok(["win32", "linux"].includes(process.platform));
    assert.equal(
        Number(process.versions.node.split(".")[0]),
        26,
        "Node 26 oracle required",
    );
}
function git(cwd, ...args) {
    const result = recordProcess("git", args, cwd, 10_000);
    assert.equal(result.error, null);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim(); // Only Git metadata, never program output.
}
function hashTree(directory) {
    const files = readdirSync(directory, {
        recursive: true,
        withFileTypes: true,
    })
        .filter((e) => e.isFile())
        .map((e) => join(e.parentPath, e.name))
        .sort();
    const entries = files.map((path) => ({
        file: relative(directory, path).replaceAll("\\", "/"),
        sha256: sha256(readFileSync(path)),
    }));
    return { sha256: sha256(JSON.stringify(entries)), files: entries };
}
function provenance(compilerRoot) {
    const compilerPath = resolve(compilerRoot, "dist/src/compiler.js");
    return {
        compilerRoot,
        compilerPath,
        compilerSha: git(compilerRoot, "rev-parse", "HEAD"),
        compilerDirty: git(compilerRoot, "status", "--porcelain"),
        compilerSha256: sha256(readFileSync(compilerPath)),
        compilerSource: hashTree(resolve(compilerRoot, "src")),
        compilerBuild: hashTree(resolve(compilerRoot, "dist/src")),
        selectorSha256: sha256(
            readFileSync(resolve(compilerRoot, "src/frontend/link-usage.ts")),
        ),
        driver: hashTree(resolve(root, "scripts/semantic-replay")),
        sourceSha: git(root, "rev-parse", "HEAD"),
        sourceDirty: git(root, "status", "--porcelain"),
        nodeVersion: process.version,
        nodePath: process.execPath,
        platform: process.platform,
        arch: process.arch,
        runner: Object.fromEntries(
            [
                "RUNNER_ENVIRONMENT",
                "RUNNER_OS",
                "RUNNER_ARCH",
                "RUNNER_NAME",
                "ImageOS",
                "ImageVersion",
                "GITHUB_SHA",
                "GITHUB_REF",
                "GITHUB_EVENT_NAME",
                "GITHUB_RUN_ID",
                "GITHUB_RUN_ATTEMPT",
                "GITHUB_WORKFLOW",
            ].map((k) => [k, process.env[k] ?? null]),
        ),
    };
}
async function runCompiledOnHost(jobPath) {
    hosted();
    const job = JSON.parse(readFileSync(jobPath, "utf8"));
    const {
        fixture,
        mode,
        compilerRoot,
        directory,
        reportPath,
        oracle,
        provenancePath,
    } = job;
    const options = effectiveOptions(
        fixture,
        mode,
        process.platform === "win32" ? "win32-x64" : "linux-x64",
    );
    options.fileName = "/replay/" + fixture.entry;
    const report = {
        schema: 1,
        caseId: fixture.id,
        nodeVersion: process.version,
        fixture,
        mode,
        options,
        oracle,
        provenancePath,
        normalizeCRLF: true,
        stage: "started",
        compile: null,
        native: null,
        error: null,
    };
    saveReport(reportPath, report);
    try {
        const compiler = await import(
            pathToFileURL(resolve(compilerRoot, "dist/src/compiler.js")).href
        );
        // Functions are deliberately not serialized. Their complete contract,
        // files and actual resolution calls are retained beside effective options.
        const { host: moduleHost, description } = moduleGraphHost(
            fixture,
            compiler.modulePath(options.fileName),
        );
        report.resolution = description;
        const started = performance.now();
        const result = compiler.compile(fixture.files[fixture.entry], {
            ...options,
            ...(options.module ? { moduleHost } : {}),
        });
        report.compile = {
            ok: result.ok,
            elapsedMs: performance.now() - started,
            diagnostics: result.ok ? [] : result.diagnostics,
            linked: result.ok ? result.linked : null,
            image: result.ok
                ? { sha256: sha256(result.image), length: result.image.length }
                : null,
        };
        report.stage = "compiled";
        saveReport(reportPath, report);
        if (result.ok) {
            const executable = resolve(
                directory,
                `image-${mode}${process.platform === "win32" ? ".exe" : ".bin"}`,
            );
            writeFileSync(executable, result.image);
            chmodSync(executable, 0o755);
            report.native = recordProcess(
                executable,
                [],
                directory,
                runTimeoutMs,
            );
            // Images are represented by exact hashes/lengths, keeping corpus
            // artifacts bounded. Exact graph sources and all outcomes remain.
            unlinkSync(executable);
        }
        report.stage = "finished";
    } catch (error) {
        report.error = errorDetails(error);
        report.stage = "failed";
    }
    saveReport(reportPath, report); // Flush even diagnostics/exceptions before parent assertions.
    return report.error || !report.compile?.ok ? 2 : 0;
}

function runCase(fixture, compilerRoot, out, provenancePath) {
    const started = performance.now();
    const directory = resolve(out, fixture.id);
    mkdirSync(directory, { recursive: true });
    writeGraph(directory, fixture);
    const record = {
        schema: 1,
        fixture,
        nodeVersion: process.version,
        provenancePath,
        normalization: "comparison normalizes CRLF only; raw bytes retained",
        oracle: null,
        modes: [],
        failures: [],
        elapsedMs: null,
    };
    const path = resolve(directory, "case.json");
    saveReport(path, record);
    record.oracle = recordOracle(directory, fixture, runTimeoutMs);
    record.failures.push(
        ...compareOutcomes(
            record.oracle,
            {
                stdout: fixture.expected?.stdout ?? record.oracle.stdout,
                stderr: fixture.expected?.stderr ?? "",
                status: fixture.expected?.status ?? 0,
            },
            true,
        ).map((s) => "oracle: " + s),
    );
    saveReport(path, record);
    for (const mode of fixture.modes) {
        const reportPath = resolve(directory, `${mode}.json`);
        const jobPath = resolve(directory, `${mode}-job.json`);
        saveReport(reportPath, {
            schema: 1,
            caseId: fixture.id,
            fixture,
            mode,
            oracle: record.oracle,
            provenancePath,
            stage: "pending worker",
            compile: null,
            native: null,
            error: null,
            normalizeCRLF: true,
        });
        saveReport(jobPath, {
            fixture,
            mode,
            compilerRoot,
            directory,
            reportPath,
            oracle: record.oracle,
            provenancePath,
        });
        const worker = recordProcess(
            process.execPath,
            [script, "--worker", jobPath],
            root,
            workerTimeoutMs,
        );
        const detail = existsSync(reportPath)
            ? JSON.parse(readFileSync(reportPath, "utf8"))
            : null;
        const failures = compareOutcomes(
            worker,
            { stdout: worker.stdout, stderr: "", status: 0 },
            true,
        ).map((s) => "worker: " + s);
        const assessment = assessMode(detail ?? {});
        if (mode === "default" && fixture.defaultContract)
            assessment.contract = {
                id: fixture.id,
                expected: fixture.defaultContract,
                comparison:
                    "exact isolated default contract; Node difference retained",
            };
        failures.push(...assessment.operational);
        const expected =
            mode === "default" && fixture.defaultContract
                ? fixture.defaultContract
                : record.oracle;
        failures.push(...compareOutcomes(detail?.native, expected, true));
        if (detail?.compile?.ok) {
            const linked = detail.compile.linked;
            if (!Array.isArray(linked))
                failures.push("missing reportLink reasons");
            if (
                mode === "default" &&
                fixture.defaultPartAbsent &&
                linked?.some((p) => p.part === fixture.defaultPartAbsent)
            )
                failures.push(
                    "documented absent part unexpectedly linked; review contract",
                );
            if (
                mode === "default" &&
                fixture.selector &&
                Boolean(
                    linked?.some((p) => p.part === fixture.selector.part),
                ) !== fixture.selector.present
            )
                failures.push("selector contract differs");
        }
        record.modes.push({ mode, reportPath, worker, assessment, failures });
        record.failures.push(...failures.map((s) => `${mode}: ${s}`));
        saveReport(path, record);
    }
    record.elapsedMs = performance.now() - started;
    saveReport(path, record);
    return record;
}

function negativeControl(compilerRoot, out, provenancePath) {
    assert.equal(
        git(compilerRoot, "rev-parse", "HEAD"),
        BAD_SHA,
        "historical compiler must be the audited commit",
    );
    assert.equal(
        git(compilerRoot, "status", "--porcelain", "--untracked-files=no"),
        "",
        "historical tracked sources must be unchanged",
    );
    const fixture = loadInventory("pr").find((c) => c.id === "length-key");
    fixture.modes = ["default", "full"];
    const replay = runCase(fixture, compilerRoot, out, provenancePath);
    const defaultRecord = JSON.parse(
        readFileSync(resolve(out, "length-key/default.json"), "utf8"),
    );
    const fullRecord = JSON.parse(
        readFileSync(resolve(out, "length-key/full.json"), "utf8"),
    );
    const comparator = recordProcess(
        process.execPath,
        [
            resolve(root, "scripts/semantic-replay/compare.mjs"),
            resolve(out, "length-key/default.json"),
        ],
        root,
        10_000,
    );
    const expected = (stdout) => ({ stdout, stderr: "", status: 0 });
    const failures = [
        ...compareOutcomes(defaultRecord.native, expected("undefined\n"), true),
        ...compareOutcomes(fullRecord.native, expected("function\n"), true),
        ...compareOutcomes(replay.oracle, expected("function\n"), true),
        ...assessMode(defaultRecord).operational,
        ...assessMode(fullRecord).operational,
        ...compareOutcomes(
            comparator,
            { stdout: comparator.stdout, stderr: "", status: 1 },
            true,
        ),
    ];
    for (const mode of replay.modes)
        failures.push(
            ...compareOutcomes(
                mode.worker,
                { stdout: mode.worker.stdout, stderr: "", status: 0 },
                true,
            ),
        );
    for (const record of [defaultRecord, fullRecord])
        if (!Array.isArray(record.compile?.linked))
            failures.push("historical link reasons unavailable");
    if (defaultRecord.compile?.linked?.some((p) => p.part === "proxy"))
        failures.push("historical default did not omit proxy");
    if (!fullRecord.compile?.linked?.some((p) => p.part === "proxy"))
        failures.push("historical full did not include proxy");
    const assessment = assessMode(defaultRecord);
    if (
        assessment.exitCode !== 1 ||
        !assessment.differences.some((s) => s.startsWith("stdout:"))
    )
        failures.push("comparator did not detect a semantic stdout mismatch");
    const proof = {
        schema: 1,
        compilerSha: BAD_SHA,
        provenancePath,
        fixture,
        comparator,
        assessment,
        failures,
        passed: failures.length === 0,
    };
    saveReport(resolve(out, "negative-proof.json"), proof);
    saveReport(resolve(out, "summary.json"), {
        schema: 1,
        lane: "negative",
        complete: true,
        passed: proof.passed,
        compilerSha: BAD_SHA,
        provenancePath,
        failures,
        proofPath: resolve(out, "negative-proof.json"),
        replayMs: replay.elapsedMs,
        comparatorMs: comparator.elapsedMs,
    });
    return proof.passed ? 0 : 1;
}

async function main() {
    if (args[0] === "--inventory") {
        console.log(
            JSON.stringify(
                summarizeInventory(loadInventory(args[1] ?? "pr")),
                null,
                2,
            ),
        );
        return 0;
    }
    hosted();
    if (args[0] === "--worker") return await runCompiledOnHost(args[1]);
    const lane = args[0] ?? "pr";
    assert.ok(["pr", "candidate", "negative"].includes(lane));
    const started = performance.now();
    const compilerRoot = resolve(args[1] ?? root);
    const out = resolve(
        args[2] ?? join(root, "work/semantic-replay", lane, process.platform),
    );
    mkdirSync(out, { recursive: true });
    const provenancePath = resolve(out, "provenance.json");
    saveReport(resolve(out, "summary.json"), {
        schema: 1,
        lane,
        stage: "provenance",
        complete: false,
    });
    saveReport(provenancePath, provenance(compilerRoot));
    if (lane === "negative")
        return negativeControl(compilerRoot, out, provenancePath);
    const shard = args[3] === undefined ? null : Number(args[3]);
    if (shard !== null)
        assert.ok(
            lane === "candidate" &&
                Number.isInteger(shard) &&
                shard >= 0 &&
                shard < 10,
        );
    const cases = loadInventory(lane).filter(
        (c) =>
            shard === null || (c.corpusId && (c.corpusId - 1) % 10 === shard),
    );
    const summary = {
        schema: 1,
        lane,
        shard,
        platform: process.platform,
        sourceSha: git(root, "rev-parse", "HEAD"),
        provenancePath,
        complete: false,
        inventory: summarizeInventory(cases),
        workerTimeoutMs,
        runTimeoutMs,
        gcStress: false,
        concurrency: 1,
        elapsedMs: 0,
        compileMs: 0,
        nativeMs: 0,
        oracleMs: 0,
        costByMode: {},
        cases: [],
        failures: [],
        measuredPrBudgetMs: null,
        budgetStatus:
            "pending successful Windows and Linux reports and owner review; safety caps are provisional",
    };
    const flush = () => {
        summary.elapsedMs = performance.now() - started;
        saveReport(resolve(out, "summary.json"), summary);
    };
    flush();
    for (const fixture of cases) {
        const record = runCase(fixture, compilerRoot, out, provenancePath);
        summary.cases.push({
            id: fixture.id,
            elapsedMs: record.elapsedMs,
            failed: record.failures.length > 0,
        });
        summary.failures.push(
            ...record.failures.map((s) => `${fixture.id}: ${s}`),
        );
        summary.oracleMs += record.oracle.elapsedMs;
        for (const mode of record.modes) {
            const r = existsSync(mode.reportPath)
                ? JSON.parse(readFileSync(mode.reportPath, "utf8"))
                : null;
            summary.compileMs += r?.compile?.elapsedMs ?? 0;
            summary.nativeMs += r?.native?.elapsedMs ?? 0;
            const costs = (summary.costByMode[mode.mode] ??= {
                runs: 0,
                compileMs: 0,
                nativeMs: 0,
                workerMs: 0,
            });
            costs.runs++;
            costs.compileMs += r?.compile?.elapsedMs ?? 0;
            costs.nativeMs += r?.native?.elapsedMs ?? 0;
            costs.workerMs += mode.worker.elapsedMs;
        }
        flush();
    }
    summary.complete = true;
    summary.fullToDefaultCompileRatio =
        summary.costByMode.full.compileMs /
        summary.costByMode.default.compileMs;
    flush();
    console.log(
        JSON.stringify({
            out,
            cases: cases.length,
            failures: summary.failures.length,
            elapsedMs: summary.elapsedMs,
        }),
    );
    return summary.failures.length ? 1 : 0;
}
try {
    process.exitCode = await main();
} catch (error) {
    console.error(error);
    process.exitCode = 2;
}
