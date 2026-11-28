import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    chmodSync,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { isIP } from "node:net";
import { compile } from "../src/compiler.js";
import { requireHostTarget } from "../src/target.js";

const fixture = resolve("tests/fixtures/postgres");
const required = process.env.NONA_POSTGRES_TESTS === "1";
const installed = existsSync(join(fixture, "node_modules/pg/package.json"));
const evidence = resolve("work/postgres-evidence", requireHostTarget());
const hash = (file: string) =>
    createHash("sha256").update(readFileSync(file)).digest("hex");

test("PostgreSQL fixture has exact isolated dependency pins and a transitive lock", () => {
    const manifest = JSON.parse(
        readFileSync(join(fixture, "package.json"), "utf8"),
    );
    const lock = JSON.parse(
        readFileSync(join(fixture, "package-lock.json"), "utf8"),
    );
    assert.deepEqual(manifest.dependencies, {
        pg: "8.16.3",
        "pg-copy-streams": "7.0.0",
    });
    assert.deepEqual(lock.packages[""].dependencies, manifest.dependencies);
    assert.ok(Object.keys(lock.packages).length > 10);
    for (const [name, entry] of Object.entries(lock.packages)) {
        if (!name) continue;
        const pinned = entry as {
            version: string;
            integrity: string;
            resolved: string;
        };
        assert.ok(pinned.version && pinned.integrity && pinned.resolved, name);
    }
});

test("required PostgreSQL integration has dependencies and an ELF execution host", () => {
    if (!required) return;
    assert.ok(
        installed,
        "Run npm ci --ignore-scripts --prefix tests/fixtures/postgres",
    );
    if (process.env.NONA_POSTGRES_REQUIRE_ELF === "1") {
        assert.equal(requireHostTarget(), "linux-x64");
        const host = (process.env.NONA_PG_HOST || "").toLowerCase();
        const name = host.endsWith(".") ? host.slice(0, -1) : host;
        assert.ok(
            name &&
                !isIP(name) &&
                name !== "localhost" &&
                !name.endsWith(".localhost"),
            "ELF integration requires a non-special NONA_PG_HOST resolved by the platform",
        );
    }
});

const stages = [
    {
        name: "load",
        file: "load.cjs",
        args: [],
        expected: "PASS load dns pg.Client pg-copy-streams.from\n",
        service: false,
    },
    {
        name: "dns-call",
        file: "dns-call.cjs",
        args: [],
        expected: "PASS pinned pg DNS callback\n",
        service: false,
    },
    {
        name: "negative",
        file: "negative.cjs",
        args: [],
        expected: "PASS negative ENOTFOUND\n",
        service: false,
    },
    {
        name: "hostname",
        file: "connect.cjs",
        args: [process.env.NONA_PG_HOST || "localhost"],
        expected: "PASS connect\n",
        service: true,
    },
    {
        name: "ipv4",
        file: "connect.cjs",
        args: ["127.0.0.1"],
        expected: "PASS connect\n",
        service: true,
    },
    {
        name: "transaction",
        file: "transaction.cjs",
        args: [],
        expected:
            "PASS select Cyrillic\nPASS transaction insert visible\nPASS rollback row absent\n",
        service: true,
    },
    {
        name: "copy",
        file: "copy.cjs",
        args: [],
        expected:
            "PASS copy multi-chunk drain finish\nPASS copy bytea exact 4 rows\nPASS connection after copy\n",
        service: true,
    },
];

for (const stage of stages) {
    test(
        stage.name === "negative"
            ? "PostgreSQL negative: native reserved-name error within its deadline"
            : `PostgreSQL ${stage.name}: independent Node oracle and actual native package graph`,
        {
            skip:
                !required &&
                (!installed || stage.service || stage.name === "negative"),
        },
        async (t) => {
            assert.ok(
                installed,
                "PostgreSQL fixture dependencies are required",
            );
            mkdirSync(evidence, { recursive: true });
            const entry = join(fixture, stage.file);
            const timeout = stage.name === "negative" ? 10_000 : 20_000;
            const record: Record<string, unknown> = {
                stage: stage.name,
                sourceRevision: spawnSync("git", ["rev-parse", "HEAD"], {
                    encoding: "utf8",
                    windowsHide: true,
                }).stdout.trim(),
                target: requireHostTarget(),
                node: process.version,
                lockSha256: hash(join(fixture, "package-lock.json")),
                sourceSha256: hash(entry),
                configSha256: hash(join(fixture, "config.cjs")),
                packages: Object.fromEntries(
                    ["pg", "pg-copy-streams"].map((name) => [
                        name,
                        JSON.parse(
                            readFileSync(
                                join(
                                    fixture,
                                    "node_modules",
                                    name,
                                    "package.json",
                                ),
                                "utf8",
                            ),
                        ).version,
                    ]),
                ),
                timeoutMs: timeout,
                nodeResult:
                    stage.name === "negative"
                        ? "not applicable: Nona's deterministic reserved-name policy"
                        : "not run",
                nativeResult: "not run",
                server: process.env.NONA_PG_SERVER_VERSION || "not recorded",
            };
            const save = () =>
                writeFileSync(
                    join(evidence, stage.name + ".json"),
                    JSON.stringify(record, null, 2) + "\n",
                );
            const run = (command: string, args: string[], kind: string) => {
                const started = Date.now();
                const result = spawnSync(command, args, {
                    cwd: fixture,
                    encoding: "utf8",
                    timeout,
                    killSignal: "SIGKILL",
                    maxBuffer: 262144,
                    windowsHide: true,
                    env: {
                        ...process.env,
                        NODE_PG_FORCE_NATIVE: undefined,
                        PGSSLMODE: "disable",
                    },
                });
                record[kind] = {
                    command: [command, ...args],
                    durationMs: Date.now() - started,
                    status: result.status,
                    signal: result.signal,
                    error: result.error?.message,
                    timedOut:
                        (result.error as NodeJS.ErrnoException | undefined)
                            ?.code === "ETIMEDOUT",
                    truncated:
                        (result.error as NodeJS.ErrnoException | undefined)
                            ?.code === "ENOBUFS",
                    stdout: result.stdout,
                    stderr: result.stderr,
                    outcome:
                        !result.error &&
                        result.status === 0 &&
                        result.stdout.replaceAll("\r\n", "\n") ===
                            stage.expected
                            ? "passed"
                            : "failed",
                };
                save();
                assert.equal(
                    result.error,
                    undefined,
                    `${kind} deadline/spawn failure: ${result.error?.message}`,
                );
                assert.equal(
                    result.status,
                    0,
                    `${kind}: ${result.stderr}\n${result.stdout}`,
                );
                assert.equal(
                    result.stdout.replaceAll("\r\n", "\n"),
                    stage.expected,
                    `${kind}: output mismatch`,
                );
            };
            save();
            // A failed native stage must not prevent its independent Node control.
            // Reserved .invalid errors have a fixed RFC 6761 answer. The
            // native deadline must not depend on Node's OS resolver retries.
            if (stage.name !== "negative")
                await t.test("Node", () =>
                    run(process.execPath, [entry, ...stage.args], "nodeResult"),
                );
            await t.test("native", () => {
                const result = compile(readFileSync(entry, "utf8"), {
                    fileName: entry,
                    module: false,
                    target: requireHostTarget(),
                });
                record.compilation = result.ok ? "passed" : result.diagnostics;
                save();
                if (!result.ok) assert.fail(JSON.stringify(result.diagnostics));
                const executable = join(
                    evidence,
                    stage.name +
                        (process.platform === "win32" ? ".exe" : ".elf"),
                );
                writeFileSync(executable, result.image);
                chmodSync(executable, 0o755);
                record.imageSha256 = hash(executable);
                run(executable, stage.args, "nativeResult");
            });
        },
    );
}
