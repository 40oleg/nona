import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/compiler.js";
import {
    childProcessModuleSource,
    childProcessTargets,
} from "../src/frontend/child-process-module.js";

const program = `import { spawnSync } from 'node:child_process';
console.log(spawnSync('true').status);`;

test("node:child_process has platform layers for every target", () => {
    assert.deepEqual([...childProcessTargets].sort(), [
        "darwin-arm64",
        "darwin-x64",
        "freebsd-x64",
        "linux-arm64",
        "linux-x64",
        "openbsd-x64",
        "win32-arm64",
        "win32-x64",
    ]);
    for (const target of [
        "linux-arm64",
        "win32-arm64",
        "darwin-x64",
        "darwin-arm64",
        "freebsd-x64",
        "openbsd-x64",
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

/** The BSD layer with system calls that record their arguments and fail with EAGAIN (35). */
async function bsdLayer(target: string) {
    const source = childProcessModuleSource(target),
        layer = source.slice(0, source.indexOf("import { EventEmitter }"));
    const stubs = layer.replace(
        /import \{ define \} from "nona:ffi";/,
        "const calls = [], define = (kind, number) => (...args) => (calls.push([Number(number), ...args]), -35);",
    );
    const numbers = [...source.matchAll(/define\("syscall", "(\d+)"/g)].map(
        (match) => Number(match[1]),
    );
    const { sys, calls } = await import(
        "data:text/javascript," +
            encodeURIComponent(stubs + "\nexport { sys, calls };")
    );
    return { sys, calls, numbers: [...new Set(numbers)].sort((a, b) => a - b) };
}

test("the BSD layers use their kernels' system calls and translate errno and signal numbers", async () => {
    const freebsd = await bsdLayer("freebsd-x64"),
        openbsd = await bsdLayer("openbsd-x64");
    assert.deepEqual(
        freebsd.numbers,
        [
            1, 2, 3, 4, 5, 6, 7, 12, 37, 59, 73, 90, 92, 147, 209, 340, 345,
            362, 416, 477, 542, 560,
        ],
    );
    assert.deepEqual(
        openbsd.numbers,
        [
            1, 2, 3, 4, 5, 6, 11, 12, 46, 48, 49, 59, 72, 73, 90, 92, 101, 122,
            147, 252, 269, 303,
        ],
    );
    assert.equal(freebsd.sys.platform, "freebsd");
    assert.equal(openbsd.sys.platform, "openbsd");
    for (const { sys, calls } of [freebsd, openbsd]) {
        // libuv's numbers on the BSDs: UV_EAGAIN is -35, UV_ENOSYS -78.
        assert.deepEqual(
            [2, 11, 13, 32, 36, 38].map((errno) => sys.errno(errno)),
            [-2, -35, -13, -32, -63, -78],
        );
        assert.equal(sys.read(5, new Uint8Array(4)), -11);
        // SIGUSR1 (Linux 10) is BSD 30; SIGSTKFLT (16) has no BSD number.
        calls.length = 0;
        assert.equal(sys.kill({ status: null, pid: 42 }, 10), -11);
        assert.deepEqual(calls, [[sys === freebsd.sys ? 37 : 122, 42, 30]]);
        assert.equal(sys.kill({ status: null, pid: 42 }, 16), -38);
    }
    // OpenBSD's sigprocmask takes the mask by value: SIG_BLOCK SIGPIPE
    // around the write, then SIG_SETMASK with the old mask.
    openbsd.calls.length = 0;
    assert.equal(openbsd.sys.write(7, new Uint8Array(3), 0, 3), -11);
    assert.deepEqual(
        openbsd.calls.map((call: number[]) =>
            call[0] === 4 ? [4, call[1]] : call,
        ),
        [
            [48, 1, 1 << 12],
            [4, 7],
            [48, 3, 0],
        ],
    );
});

test("targets without a platform layer throw ERR_NONA_UNSUPPORTED when called", async () => {
    const source = childProcessModuleSource("netbsd-x64");
    assert.doesNotMatch(source, /nona:ffi/);
    const module = await import(
        "data:text/javascript," + encodeURIComponent(source)
    );
    for (const name of ["spawn", "spawnSync", "exec", "execFileSync"])
        assert.throws(() => module[name]("true"), {
            code: "ERR_NONA_UNSUPPORTED",
        });
});
