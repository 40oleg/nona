// Opt-in, sequential compatibility probes. No install or execution at import time.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer as httpServer } from "node:http";
import { createServer as tlsServer } from "node:tls";
import {
    readFileSync,
    writeFileSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    existsSync,
    cpSync,
    rmSync,
    statSync,
} from "node:fs";
import { tmpdir, release, cpus } from "node:os";
import { dirname, resolve, join, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { completenessCases } from "../tests/probes/completeness-cases.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const self = fileURLToPath(import.meta.url);
const fixtures = join(root, "tests/fixtures/completeness");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path, data) =>
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
const git = (...args) => {
    const result = spawnSync("git", args, {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
    });
    if (result.status !== 0) throw new Error(result.stderr || "git failed");
    return result.stdout.trim();
};

/** A bounded child, including descendants on timeout/output overflow. */
export function runBounded(
    command,
    args,
    {
        cwd = root,
        env = process.env,
        timeoutMs = 15000,
        maxOutput = 262144,
    } = {},
) {
    return new Promise((resolveRun) => {
        const started = Date.now();
        const child = spawn(command, args, {
            cwd,
            env,
            windowsHide: true,
            detached: process.platform !== "win32",
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "",
            stderr = "",
            error = null,
            timedOut = false,
            truncated = false;
        const stop = () => {
            if (!child.pid) return;
            if (process.platform === "win32") {
                spawnSync(
                    "taskkill.exe",
                    ["/pid", String(child.pid), "/T", "/F"],
                    { windowsHide: true, timeout: 5000, stdio: "ignore" },
                );
            } else {
                try {
                    process.kill(-child.pid, "SIGKILL");
                } catch {}
            }
            child.kill("SIGKILL");
        };
        const timer = setTimeout(() => {
            timedOut = true;
            stop();
        }, timeoutMs);
        const collect = (name, chunk) => {
            if (truncated) return;
            if (name === "stdout") stdout += chunk;
            else stderr += chunk;
            if (stdout.length + stderr.length > maxOutput && !truncated) {
                truncated = true;
                stdout = stdout.slice(0, maxOutput / 2);
                stderr = stderr.slice(0, maxOutput / 2);
                stop();
            }
        };
        child.stdout
            .setEncoding("utf8")
            .on("data", (chunk) => collect("stdout", chunk));
        child.stderr
            .setEncoding("utf8")
            .on("data", (chunk) => collect("stderr", chunk));
        child.on("error", (cause) => {
            error = { code: cause.code, message: cause.message };
        });
        child.on("close", (exit, signal) => {
            clearTimeout(timer);
            resolveRun({
                command: [command, ...args],
                cwd,
                timeoutMs,
                exit,
                signal,
                timedOut,
                truncated,
                error,
                stdout,
                stderr,
                durationMs: Date.now() - started,
            });
        });
    });
}

export function matches(result, expected) {
    return (
        result.exit === 0 &&
        !result.error &&
        !result.timedOut &&
        !result.truncated &&
        result.stdout.replaceAll("\r\n", "\n") === expected
    );
}

/** Only remove the freshly created child directory, never a user-selected path. */
export function removeProbeDirectory(directory, parent) {
    const suffix = relative(resolve(parent), resolve(directory));
    if (
        !suffix ||
        suffix.startsWith("..") ||
        isAbsolute(suffix) ||
        !suffix.startsWith("nona-completeness-")
    )
        throw new Error("Refusing unsafe probe cleanup");
    rmSync(directory, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
    });
    if (existsSync(directory)) throw new Error("Probe cleanup incomplete");
}

function hashes(directory, prefix = "") {
    return Object.fromEntries(
        readdirSync(directory, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name))
            .flatMap((entry) => {
                if (entry.name === "node_modules") return [];
                const name = prefix + entry.name,
                    path = join(directory, entry.name);
                return entry.isDirectory()
                    ? Object.entries(hashes(path, name + "/"))
                    : [[name, digest(readFileSync(path))]];
            }),
    );
}

async function services(ids) {
    const servers = [],
        sockets = new Set(),
        env = {};
    const stop = async () => {
        for (const socket of sockets) socket.destroy();
        await Promise.all(
            servers.map((server) => new Promise((done) => server.close(done))),
        );
    };
    const listen = async (server) => {
        servers.push(server);
        server.on("connection", (socket) => {
            sockets.add(socket);
            socket.on("close", () => sockets.delete(socket));
        });
        await new Promise((done, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", done);
        });
        return server.address().port;
    };
    try {
        if (ids.includes("http-client"))
            env.NONA_PROBE_HTTP =
                "http://127.0.0.1:" +
                (await listen(
                    httpServer((request, response) => {
                        response.writeHead(
                            request.url === "/data" ? 200 : 404,
                            { "content-type": "application/json" },
                        );
                        response.end('{"value":42}');
                    }),
                ));
        if (ids.includes("tls-verification")) {
            const tlsFixtures = join(root, "tests/fixtures/tls");
            const server = tlsServer(
                {
                    key: readFileSync(join(tlsFixtures, "ec-key.pem")),
                    cert: readFileSync(join(tlsFixtures, "ec-cert.pem")),
                    minVersion: "TLSv1.3",
                    maxVersion: "TLSv1.3",
                    ciphers: "TLS_AES_128_GCM_SHA256",
                },
                (socket) => {
                    socket.on("error", () => {});
                    socket.end();
                },
            );
            server.on("tlsClientError", () => {});
            env.NONA_PROBE_TLS = String(await listen(server));
            env.NONA_PROBE_CA = join(tlsFixtures, "ca.pem");
        }
        return { env, stop };
    } catch (error) {
        await stop();
        throw error;
    }
}

async function compileChild([entry, target, artifact, stress]) {
    const { compile } = await import("../dist/src/compiler.js");
    const result = compile(readFileSync(entry, "utf8"), {
        fileName: entry,
        module: true,
        target,
        gcStress: stress === "true",
    });
    if (result.ok) writeFileSync(artifact, result.image, { mode: 0o755 });
    console.log(
        JSON.stringify({
            ok: result.ok,
            diagnostics: result.diagnostics ?? [],
        }),
    );
    process.exitCode = result.ok ? 0 : 1;
}

function argumentsFor(args) {
    const options = {
        output: "work/completeness-results.json",
        cases: null,
        install: false,
        npmCli: process.env.npm_execpath,
        auditedCommit: null,
    };
    const keys = {
        "--output": "output",
        "--cases": "cases",
        "--npm-cli": "npmCli",
        "--audited-commit": "auditedCommit",
    };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--install") options.install = true;
        else if (
            keys[args[i]] &&
            args[i + 1] &&
            !args[i + 1].startsWith("--")
        ) {
            const key = keys[args[i]];
            options[key] = args[++i];
        } else throw new Error("Unknown or incomplete argument: " + args[i]);
    }
    if (options.install && !options.npmCli)
        throw new Error(
            "--install requires --npm-cli <npm/bin/npm-cli.js> (or npm_execpath)",
        );
    return options;
}

export async function main(args) {
    const options = argumentsFor(args);
    if (Number(process.versions.node.split(".")[0]) < 26)
        throw new Error("Use Node >=26, matching the repository requirement");
    if (
        !["win32", "linux"].includes(process.platform) ||
        process.arch !== "x64"
    )
        throw new Error(
            "This workload set is native win32-x64/linux-x64 only; no emulation or cross-execution is implied",
        );
    const target = `${process.platform}-${process.arch}`;
    const all = await completenessCases(target);
    const ids =
        options.cases === null
            ? all.map((item) => item.id)
            : options.cases.split(",");
    if (
        new Set(ids).size !== ids.length ||
        ids.some((id) => !all.some((item) => item.id === id))
    )
        throw new Error("Unknown or duplicate probe ID");
    const selected = all.filter((item) => ids.includes(item.id));
    const output = resolve(options.output);
    mkdirSync(dirname(output), { recursive: true });
    const auditedCommit = git("rev-parse", options.auditedCommit ?? "HEAD");
    if (
        git(
            "diff",
            auditedCommit,
            "--",
            "src",
            "package.json",
            "package-lock.json",
            "scripts/build.mjs",
            "scripts/lib-sources.mjs",
        )
    )
        throw new Error(
            "Compiler inputs differ from --audited-commit; rebuild and select the actual revision",
        );
    const fixtureFiles = hashes(fixtures);
    const report = {
        schemaVersion: 1,
        startedAt: new Date().toISOString(),
        auditedCommit,
        checkoutCommit: git("rev-parse", "HEAD"),
        latestLocalTag: git("describe", "--tags", "--abbrev=0"),
        fixtureRevision: digest(JSON.stringify(fixtureFiles)),
        fixtureFiles,
        runnerFiles: {
            "scripts/completeness-probes.mjs": digest(readFileSync(self)),
            "tests/probes/completeness-cases.mjs": digest(
                readFileSync(
                    new URL(
                        "../tests/probes/completeness-cases.mjs",
                        import.meta.url,
                    ),
                ),
            ),
        },
        invocation: [process.execPath, self, ...args],
        environment: {
            node: process.version,
            versions: process.versions,
            platform: process.platform,
            arch: process.arch,
            osRelease: release(),
            cpu: cpus()[0]?.model,
            target,
            execution: "native",
            maxParallelism: 1,
            compilerHeapLimitMiB: 768,
            compilerBuild:
                "Caller must run node scripts/build.mjs with this checkout before invoking; no implicit build",
            typescript: JSON.parse(
                readFileSync(
                    join(root, "node_modules/typescript/package.json"),
                ),
            ).version,
        },
        dependencySetup: {},
        cases: [],
        cleanup: "pending",
    };
    const save = () => json(output, report);
    save();
    const directory = mkdtempSync(join(tmpdir(), "nona-completeness-"));
    let activeServices;
    try {
        if (selected.some((item) => item.package)) {
            if (options.install) {
                const result = await runBounded(
                    process.execPath,
                    [
                        resolve(options.npmCli),
                        "ci",
                        "--ignore-scripts",
                        "--no-audit",
                        "--no-fund",
                    ],
                    { cwd: fixtures, timeoutMs: 60000 },
                );
                report.dependencySetup = {
                    mode: "npm-ci",
                    ...result,
                    outcome:
                        result.exit === 0 && !result.error && !result.timedOut
                            ? "passed"
                            : "failed",
                };
            } else
                report.dependencySetup = {
                    mode: "existing-install",
                    outcome: "unverified",
                    note: "No installation performed; lockfile and top-level versions checked, transitive contents not authenticated. Use --install for a fresh npm ci.",
                };
            const metadata = JSON.parse(
                readFileSync(join(fixtures, "package.json")),
            );
            const installed = Object.fromEntries(
                Object.entries(metadata.dependencies).map(([name, version]) => {
                    const path = join(
                        fixtures,
                        "node_modules",
                        name,
                        "package.json",
                    );
                    return [
                        name,
                        {
                            expected: version,
                            actual: existsSync(path)
                                ? JSON.parse(readFileSync(path)).version
                                : null,
                        },
                    ];
                }),
            );
            report.dependencySetup.packages = installed;
            if (
                Object.values(installed).some(
                    (entry) => entry.expected !== entry.actual,
                )
            )
                report.dependencySetup.outcome = "failed";
            if (report.dependencySetup.outcome !== "failed")
                cpSync(
                    join(fixtures, "node_modules"),
                    join(directory, "node_modules"),
                    { recursive: true },
                );
        } else
            report.dependencySetup = {
                mode: "not-required",
                outcome: "not-applicable",
            };
        activeServices = await services(ids);
        for (const probe of selected) {
            const record = {
                id: probe.id,
                gcStress: probe.gcStress ?? false,
                expectedOracle: probe.expected,
                expectedNative: probe.expectedNative ?? probe.expected,
                dependencySetup: probe.package
                    ? report.dependencySetup.outcome
                    : "not-required",
            };
            report.cases.push(record);
            if (probe.package && report.dependencySetup.outcome === "failed") {
                record.compilation =
                    record.artifact =
                    record.execution =
                    record.oracle =
                        {
                            outcome: "not-run",
                            reason: "dependency setup failed",
                        };
                record.assessment = "setup-failed";
                save();
                continue;
            }
            const caseDirectory = join(directory, probe.id);
            mkdirSync(caseDirectory);
            const oracleDirectory = join(caseDirectory, "oracle");
            const nativeDirectory = join(caseDirectory, "native");
            mkdirSync(oracleDirectory);
            mkdirSync(nativeDirectory);
            const entry = join(caseDirectory, "main.mjs"),
                artifact = join(
                    caseDirectory,
                    process.platform === "win32" ? "program.exe" : "program",
                );
            const source =
                probe.source ??
                readFileSync(join(fixtures, probe.file), "utf8");
            writeFileSync(entry, source);
            record.sourceSha256 = digest(source);
            const env = {
                ...process.env,
                ...activeServices.env,
                NONA_PROBE_NODE: process.execPath,
            };
            record.serviceEnvironment = {
                ...activeServices.env,
                NONA_PROBE_NODE: process.execPath,
            };
            record.oracle = await runBounded(process.execPath, [entry], {
                cwd: oracleDirectory,
                env,
                timeoutMs: 15000,
            });
            record.oracle.outcome = matches(record.oracle, probe.expected)
                ? "passed"
                : "failed";
            record.compilation = await runBounded(
                process.execPath,
                [
                    "--max-old-space-size=768",
                    self,
                    "--compile",
                    entry,
                    target,
                    artifact,
                    String(record.gcStress),
                ],
                { timeoutMs: 45000 },
            );
            try {
                record.compilation.diagnostics = JSON.parse(
                    record.compilation.stdout,
                ).diagnostics;
            } catch {}
            const built =
                record.compilation.exit === 0 &&
                !record.compilation.error &&
                !record.compilation.timedOut &&
                existsSync(artifact);
            record.compilation.outcome = built ? "passed" : "failed";
            record.artifact = built
                ? {
                      outcome: "created",
                      bytes: statSync(artifact).size,
                      sha256: digest(readFileSync(artifact)),
                      retained: false,
                  }
                : { outcome: "not-created" };
            if (built) {
                record.execution = await runBounded(artifact, [], {
                    cwd: nativeDirectory,
                    env,
                    timeoutMs: probe.id === "tls-verification" ? 30000 : 15000,
                });
                record.execution.outcome = matches(
                    record.execution,
                    record.expectedNative,
                )
                    ? "passed"
                    : "failed";
            } else
                record.execution = {
                    outcome: "not-run",
                    reason: "compilation failed",
                };
            record.assessment =
                record.oracle.outcome !== "passed"
                    ? "oracle-failed"
                    : !built
                      ? "compile-failed"
                      : record.execution.outcome !== "passed"
                        ? "runtime-failed"
                        : probe.expectedNative &&
                            probe.expectedNative !== probe.expected
                          ? "expected-api-gap"
                          : "agreement";
            console.log(`${record.id}: ${record.assessment}`);
            save();
        }
    } catch (error) {
        report.infrastructureError = String(error.stack ?? error);
    } finally {
        try {
            await activeServices?.stop();
        } catch (error) {
            report.serviceCleanupError = String(error);
        }
        try {
            removeProbeDirectory(directory, tmpdir());
            report.cleanup = "passed";
        } catch (error) {
            report.cleanup = "failed";
            report.cleanupError = String(error);
        }
        report.finishedAt = new Date().toISOString();
        report.summary = Object.fromEntries(
            [...new Set(report.cases.map((item) => item.assessment))].map(
                (key) => [
                    key,
                    report.cases.filter((item) => item.assessment === key)
                        .length,
                ],
            ),
        );
        save();
    }
    console.log(`Report: ${output}`);
    // Compatibility findings are data; a broken oracle/setup/harness is an error.
    return report.infrastructureError ||
        report.serviceCleanupError ||
        report.cleanup !== "passed" ||
        report.cases.some((item) =>
            ["oracle-failed", "setup-failed"].includes(item.assessment),
        )
        ? 1
        : 0;
}

if (
    process.argv[1] &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
    try {
        if (process.argv[2] === "--compile")
            await compileChild(process.argv.slice(3));
        else process.exitCode = await main(process.argv.slice(2));
    } catch (error) {
        console.error(error.stack ?? error);
        process.exitCode = 1;
    }
}
