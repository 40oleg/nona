import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";

const hosted =
    process.env.GITHUB_ACTIONS === "true" &&
    process.env.RUNNER_ENVIRONMENT === "github-hosted";
const results = resolve("soak-control-report");
// Never launch even a short HTTP workload on the owner's PC or a self-hosted runner.
test(
    "real Node driver control and failure injection",
    { skip: !hosted, timeout: 180000 },
    async (t) => {
        for (const mode of [
            "control",
            "corrupt-json",
            "crash",
            "early-exit",
            "startup-exit",
            "missing-server",
            "build-failure",
            "insufficient",
            "interrupt",
            "no-ready",
        ]) {
            await t.test(mode, { timeout: 45000 }, async () => {
                const dir = join(results, mode);
                mkdirSync(dir, { recursive: true });
                let driver = "scripts/http-soak.mjs";
                if (mode === "build-failure") {
                    // No compiler in this staged checkout: exercise build error reporting
                    // without compiling or running any native program.
                    const stage = join(dir, "stage");
                    mkdirSync(join(stage, "scripts"), { recursive: true });
                    for (const file of [
                        "http-soak.mjs",
                        "http-soak-support.mjs",
                        "http-soak-evidence.mjs",
                    ])
                        copyFileSync(
                            join("scripts", file),
                            join(stage, "scripts", file),
                        );
                    mkdirSync(join(stage, "bench", "http"), {
                        recursive: true,
                    });
                    copyFileSync(
                        "bench/http/soak-server.mjs",
                        join(stage, "bench", "http", "soak-server.mjs"),
                    );
                    driver = join(stage, "scripts", "http-soak.mjs");
                }
                const child = spawn(
                    process.execPath,
                    [
                        "--import",
                        "./scripts/fixtures/http-soak-seed.mjs",
                        ...(mode === "interrupt"
                            ? [
                                  "--import",
                                  "./scripts/fixtures/http-soak-interrupt.mjs",
                              ]
                            : []),
                        driver,
                        "--out",
                        dir,
                    ],
                    {
                        env: {
                            ...process.env,
                            NONA_SOAK_SERVER:
                                mode === "build-failure"
                                    ? ""
                                    : mode === "missing-server"
                                      ? resolve("missing-server-image")
                                      : resolve(
                                            mode === "control"
                                                ? "bench/http/soak-server.mjs"
                                                : "scripts/fixtures/http-soak-server.mjs",
                                        ),
                            SOAK_FIXTURE: mode,
                            NONA_SOAK_MINUTES: "0.15",
                            NONA_SOAK_WARMUP_MINUTES: "0.02",
                            NONA_SOAK_SAMPLE_SECONDS:
                                mode === "insufficient" ? "20" : "0.2",
                            NONA_SOAK_CONNECTIONS: "2",
                            NONA_SOAK_PAUSE_MS: "2",
                            NONA_SOAK_MIX:
                                mode === "corrupt-json"
                                    ? "json=1"
                                    : "text=35,json=28,big=5,echo=12,close=10,slow=4,missing=3,throw=3",
                        },
                        stdio: ["ignore", "pipe", "pipe"],
                    },
                );
                let stdout = "",
                    stderr = "";
                child.stdout.on("data", (chunk) => {
                    stdout += chunk;
                });
                child.stderr.on("data", (chunk) => (stderr += chunk));
                const watchdog = setTimeout(() => child.kill("SIGKILL"), 40000);
                let exit;
                try {
                    exit = await new Promise((done, reject) => {
                        child.once("error", reject);
                        child.once("exit", (code, signal) =>
                            done({ code, signal }),
                        );
                    });
                } finally {
                    clearTimeout(watchdog);
                    writeFileSync(
                        join(dir, "driver.log"),
                        stdout + "\nSTDERR:\n" + stderr,
                    );
                }
                const report = JSON.parse(
                    readFileSync(join(dir, "http-soak.json"), "utf8"),
                );
                const md = readFileSync(join(dir, "http-soak.md"), "utf8");
                assert.equal(report.summary.acceptancePass, false);
                assert.match(md, /Native three-hour acceptance: NOT SATISFIED/);
                if (mode === "control") {
                    assert.equal(report.crash, null);
                    assert.equal(report.summary.failed, 0);
                    assert.ok(
                        report.samples.some((s) => s.phase === "baseline"),
                    );
                    assert.ok(
                        report.samples.filter((s) => s.phase === "load")
                            .length >= 20,
                    );
                    assert.ok(report.samples.some((s) => s.phase === "after"));
                    assert.ok(
                        report.samples.some(
                            (s) => s.rps > 0 && s.p99 > 0 && s.rss > 0,
                        ),
                    );
                    for (const route of [
                        "text",
                        "json",
                        "big",
                        "echo",
                        "close",
                        "slow",
                        "missing",
                        "throw",
                    ])
                        assert.ok(report.routeCounts[route] > 0, route);
                    assert.equal(report.server.kind, "node");
                    assert.equal(report.target, null);
                    assert.equal(report.failure, undefined);
                    assert.equal(
                        report.summary.pass,
                        report.criteria.every((c) => c.pass),
                    );
                    for (const criterion of report.criteria)
                        if (!criterion.pass)
                            assert.ok(
                                [
                                    "RSS growth after warm-up",
                                    "p99 latency stable",
                                ].includes(criterion.name),
                                criterion.name,
                            );
                    assert.match(md, /\| Phase \|/);
                    assert.match(md, /\| load \|/);
                    assert.equal(exit.code, report.summary.pass ? 0 : 1);
                } else {
                    assert.equal(report.summary.pass, false);
                    assert.notEqual(exit.code, 0);
                    if (mode === "corrupt-json")
                        assert.ok(
                            report.summary.failures[
                                "json: wrong JSON content"
                            ] > 0,
                        );
                    if (mode === "crash" || mode === "early-exit") {
                        assert.equal(report.failure, undefined);
                        assert.equal(
                            report.crash.code,
                            mode === "crash" ? 17 : 0,
                        );
                        assert.equal(report.summary.after, null);
                        assert.equal(
                            report.criteria.find(
                                (c) => c.name === "p99 latency stable",
                            ).pass,
                            false,
                        );
                    }
                    if (mode === "startup-exit") {
                        assert.equal(report.failure.code, 23);
                        assert.match(
                            report.serverLog.join("\n"),
                            /original startup stderr/,
                        );
                    }
                    if (mode === "missing-server")
                        assert.equal(report.failure.code, "ENOENT");
                    if (mode === "build-failure") {
                        assert.equal(report.phase, "build");
                        assert.match(
                            report.serverLog.join("\n"),
                            /MODULE_NOT_FOUND/,
                        );
                    }
                    if (mode === "insufficient")
                        assert.equal(
                            report.criteria.find(
                                (c) => c.name === "comparison sample coverage",
                            ).pass,
                            false,
                        );
                    if (mode === "no-ready")
                        assert.match(report.failure.message, /ready line/);
                    if (mode === "interrupt") {
                        assert.equal(report.failure.signal, "SIGINT");
                        assert.equal(exit.code, 130);
                        assert.ok(
                            report.samples.some((s) => s.phase === "load"),
                        );
                    }
                }
                if (report.server.pid) {
                    await new Promise((r) => setTimeout(r, 100));
                    assert.throws(
                        () => process.kill(report.server.pid, 0),
                        { code: "ESRCH" },
                        "server child must be reaped",
                    );
                }
            });
        }
    },
);
