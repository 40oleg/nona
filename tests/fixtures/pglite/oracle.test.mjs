import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import {
    assetsDir,
    fixtureDir,
    localOptions,
    verifyPackage,
} from "./local-assets.mjs";

const work = join(fixtureDir, ".work");
mkdirSync(work, { recursive: true });

function run(mode, directory) {
    const child = spawnSync(
        process.execPath,
        [
            "--max-old-space-size=256",
            "--wasm-num-compilation-tasks=1",
            "--permission",
            `--allow-fs-read=${resolve(fixtureDir, "../../..")}`,
            `--allow-fs-write=${work}`,
            "--import",
            new URL("./offline-node.mjs", import.meta.url).href,
            join(fixtureDir, "case.mjs"),
            mode,
            ...(directory ? [directory] : []),
        ],
        {
            cwd: fixtureDir,
            env: { ...process.env, NODE_OPTIONS: "" },
            encoding: "utf8",
            timeout: 30_000,
            maxBuffer: 64 * 1024,
            windowsHide: true,
        },
    );
    assert.ifError(child.error);
    assert.equal(child.signal, null, child.stderr);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stderr, "");
    return JSON.parse(child.stdout);
}

test("pinned package and prepared local assets pass integrity checks", async () => {
    verifyPackage();
    const options = await localOptions();
    assert.ok(options.wasmModule instanceof WebAssembly.Module);
    assert.equal(options.fsBundle.size, 4939155);
});

test("offline SELECT 1 and clean close", () => {
    assert.deepEqual(run("select"), {
        mode: "select",
        select: 1,
        closed: true,
    });
});

test("profile survives process exit; text, every byte and binary COPY round trip", () => {
    const directory = mkdtempSync(join(work, "profile-"));
    try {
        assert.deepEqual(run("write", directory), {
            mode: "write",
            select: 1,
            closed: true,
            bytes: 259,
        });
        // A fresh process, module instance and wasm memory; no in-process cache.
        assert.deepEqual(run("reopen", directory), {
            mode: "reopen",
            select: 1,
            closed: true,
            bytes: 259,
        });
    } finally {
        rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
    }
});

test("missing and corrupt assets fail before WASM compilation and name the resource", async () => {
    const directory = mkdtempSync(join(work, "invalid-"));
    try {
        for (const name of ["pglite.wasm", "pglite.data"]) {
            for (const asset of ["pglite.wasm", "pglite.data"]) {
                copyFileSync(join(assetsDir, asset), join(directory, asset));
            }
            const path = join(directory, name);
            rmSync(path);
            await assert.rejects(localOptions(directory), (error) => {
                assert.ok(error.message.includes(path));
                assert.match(error.message, /cannot read \(ENOENT\)/);
                assert.match(error.message, /prepare:assets/);
                return true;
            });
            const corrupt = readFileSync(join(assetsDir, name));
            corrupt[0] ^= 0xff;
            writeFileSync(path, corrupt);
            await assert.rejects(localOptions(directory), (error) => {
                assert.ok(error.message.includes(path));
                assert.match(error.message, /integrity mismatch/);
                return true;
            });
        }
    } finally {
        rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
    }
});
