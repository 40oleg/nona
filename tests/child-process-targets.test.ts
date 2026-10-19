import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/compiler.js";
import {
    childProcessModuleSource,
    childProcessTargets,
} from "../src/frontend/child-process-module.js";

const program = `import { spawnSync } from 'node:child_process';
console.log(spawnSync('true').status);`;

test("node:child_process has platform layers for Windows and Linux on x64 and arm64", () => {
    assert.deepEqual([...childProcessTargets].sort(), [
        "linux-arm64",
        "linux-x64",
        "win32-arm64",
        "win32-x64",
    ]);
    for (const target of ["linux-arm64", "win32-arm64"] as const) {
        const result = compile(program, {
            fileName: "main.mjs",
            target,
            module: true,
        });
        assert.equal(
            result.ok,
            true,
            result.ok ? "" : JSON.stringify(result.diagnostics),
        );
    }
});

test("the linux-arm64 layer uses only asm-generic system calls", () => {
    const source = childProcessModuleSource("linux-arm64"),
        numbers = [...source.matchAll(/define\("syscall", "(\d+)"/g)].map(
            (match) => Number(match[1]),
        );
    assert.deepEqual(
        [...new Set(numbers)].sort((a, b) => a - b),
        [
            24, 25, 49, 56, 57, 59, 63, 64, 73, 94, 129, 134, 135, 137, 157,
            215, 220, 221, 222, 260, 434,
        ],
    );
    assert.equal(source, childProcessModuleSource("linux-arm64"));
    assert.notEqual(source, childProcessModuleSource("linux-x64"));
});

test("targets without a platform layer throw ERR_NONA_UNSUPPORTED when called", async () => {
    const result = compile(program, {
        fileName: "main.mjs",
        target: "freebsd-x64",
        module: true,
    });
    assert.equal(result.ok, true);
    const source = childProcessModuleSource("freebsd-x64");
    assert.doesNotMatch(source, /nona:ffi/);
    const module = await import(
        "data:text/javascript," + encodeURIComponent(source)
    );
    for (const name of ["spawn", "spawnSync", "exec", "execFileSync"])
        assert.throws(() => module[name]("true"), {
            code: "ERR_NONA_UNSUPPORTED",
        });
});
