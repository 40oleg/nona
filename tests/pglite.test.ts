import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    chmodSync,
    copyFileSync,
    cpSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { compile } from "../src/compiler.js";
import { requireHostTarget } from "../src/target.js";

const fixture = resolve("tests/fixtures/pglite");
const enabled = process.env.NONA_PGLITE_INTEGRATION === "1";
// PostgreSQL initialization interprets billions of WASM instructions. Keep that
// long validation hosted; local opt-in still compiles the package and exercises
// every resource failure in a standalone native executable.
const hosted = process.env.RUNNER_ENVIRONMENT === "github-hosted";

test(
    "PGlite standalone offline boot and resource failures",
    { skip: !enabled },
    async (t) => {
        mkdirSync(join(fixture, ".work"), { recursive: true });
        const directory = mkdtempSync(join(fixture, ".work/native-"));
        try {
            const inputs = join(directory, "compile-inputs");
            mkdirSync(inputs);
            for (const name of ["boot.mjs", "offline.mjs"])
                copyFileSync(join(fixture, name), join(inputs, name));
            cpSync(
                join(fixture, "node_modules/@electric-sql/pglite"),
                join(inputs, "node_modules/@electric-sql/pglite"),
                {
                    recursive: true,
                    filter: (path) => !/\.(wasm|data|map|gz|ts)$/.test(path),
                },
            );
            const entry = join(inputs, "boot.mjs");
            const result = compile(readFileSync(entry, "utf8"), {
                fileName: entry,
                module: true,
                target: requireHostTarget(),
            });
            assert.ok(
                result.ok,
                JSON.stringify(result.ok ? [] : result.diagnostics),
            );
            // Remove every source path compiled into the image before execution.
            rmSync(inputs, { recursive: true });
            const executable = join(
                directory,
                process.platform === "win32" ? "boot.exe" : "boot",
            );
            writeFileSync(executable, result.image);
            chmodSync(executable, 0o755);
            const assets = join(directory, "assets");
            mkdirSync(assets);
            function restore() {
                for (const name of ["pglite.wasm", "pglite.data"])
                    copyFileSync(
                        join(fixture, "assets", name),
                        join(assets, name),
                    );
            }
            function run(timeout: number) {
                const child = spawnSync(executable, [assets], {
                    cwd: directory,
                    encoding: "utf8",
                    timeout,
                    maxBuffer: 64 * 1024,
                    windowsHide: true,
                    env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" },
                });
                assert.equal(child.error, undefined, String(child.error));
                assert.equal(child.signal, null);
                return child;
            }
            await t.test(
                "SELECT 1 and awaited close from another working directory",
                { skip: !hosted },
                () => {
                    restore();
                    const child = run(30 * 60_000);
                    assert.equal(child.status, 0, child.stderr + child.stdout);
                    assert.equal(child.stderr, "");
                    assert.equal(
                        child.stdout.trim(),
                        "select=1 closed=true fetch=undefined",
                    );
                },
            );
            for (const [name, change] of [
                ["pglite.wasm", "missing"],
                ["pglite.wasm", "truncated"],
                ["pglite.wasm", "corrupt"],
                ["pglite.data", "missing"],
                ["pglite.data", "corrupt"],
            ]) {
                await t.test(
                    `${change} ${name} rejects promptly with the path and cause`,
                    () => {
                        restore();
                        const path = join(assets, name!);
                        if (change === "missing") rmSync(path);
                        else {
                            const bytes = readFileSync(path);
                            bytes[0] = bytes[0]! ^ 0xff;
                            writeFileSync(
                                path,
                                change === "truncated"
                                    ? bytes.subarray(0, 9)
                                    : bytes,
                            );
                        }
                        const started = Date.now();
                        const child = run(15_000);
                        assert.equal(
                            child.status,
                            1,
                            child.stdout + child.stderr,
                        );
                        assert.ok(child.stderr.includes(path), child.stderr);
                        assert.match(
                            child.stderr,
                            change === "missing"
                                ? /ENOENT/
                                : /integrity mismatch/,
                        );
                        assert.ok(
                            Date.now() - started < 15_000,
                            "resource failure must precede database initialization",
                        );
                    },
                );
            }
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    },
);
