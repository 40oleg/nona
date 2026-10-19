import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/compiler.js";
import {
    childProcessModuleSource,
    childProcessTargets,
} from "../src/frontend/child-process-module.js";

const program = `import { spawnSync } from 'node:child_process';
console.log(spawnSync('true').status);`;

test("node:child_process has platform layers for Windows, Linux and macOS on x64 and arm64", () => {
    assert.deepEqual([...childProcessTargets].sort(), [
        "darwin-arm64",
        "darwin-x64",
        "linux-arm64",
        "linux-x64",
        "win32-arm64",
        "win32-x64",
    ]);
    for (const target of [
        "linux-arm64",
        "win32-arm64",
        "darwin-x64",
        "darwin-arm64",
    ] as const) {
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

test("the macOS layer calls libSystem and translates errno and signal numbers", async () => {
    const source = childProcessModuleSource("darwin-arm64");
    assert.equal(source, childProcessModuleSource("darwin-x64"));
    assert.match(source, /"\/usr\/lib\/libSystem\.B\.dylib",\s*"posix_spawn",/);
    // The only system call is fcntl (fork and pipe would lose their second result).
    assert.deepEqual(
        [...source.matchAll(/define\("syscall", "(\d+)"/g)].map((m) => m[1]),
        ["92"],
    );
    const layer = source.slice(0, source.indexOf("import { EventEmitter }"));
    // Library functions become stubs that record their calls and fail with
    // Darwin's EAGAIN (35).
    const stubs = layer.replace(
        /import \{ define, lastError \} from "nona:ffi";/,
        "const calls = [], define = (library, name) => (...args) => (calls.push([name, ...args]), -1), lastError = () => 35;",
    );
    const { sys, calls } = await import(
        "data:text/javascript," +
            encodeURIComponent(stubs + "\nexport { sys, calls };")
    );
    assert.equal(sys.platform, "darwin");
    // libuv's numbers on macOS: UV_EAGAIN is -35, UV_ENOSYS -78.
    assert.deepEqual(
        [2, 11, 13, 32, 36, 38].map((errno) => sys.errno(errno)),
        [-2, -35, -13, -32, -63, -78],
    );
    assert.equal(sys.read(5, new Uint8Array(4)), -11);
    // SIGUSR1 (Linux 10) is Darwin 30; SIGSTKFLT (16) has no Darwin number.
    calls.length = 0;
    assert.equal(sys.kill({ status: null, pid: 42 }, 10), -11);
    assert.deepEqual(calls, [["kill", 42, 30]]);
    assert.equal(sys.kill({ status: null, pid: 42 }, 16), -38);
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
