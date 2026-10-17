import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { compile } from "../src/compiler.js";
import { getTarget, type Target } from "../src/target.js";
import { Arm64Assembler } from "../src/backend/arm64/assembler.js";
import { runNative } from "./helpers/native.js";
import { hostTarget } from "./helpers/program.js";
import { removeTemporaryDirectory } from "./helpers/cleanup.js";

// Shared library calls through nona:ffi on Linux (dynamically linked ELF) and
// macOS (dyld): the images, the diagnostics and, on a POSIX host, real calls.

const posixHost = getTarget(hostTarget)!.os;
const canRun =
    posixHost === "linux" || posixHost === "darwin"
        ? false
        : `library FFI runs on Linux and macOS hosts (this is ${hostTarget})`;

const libc = `{ linux: "libc.so.6", darwin: "/usr/lib/libSystem.B.dylib" }`,
    libm = `{ linux: "libm.so.6", darwin: "/usr/lib/libSystem.B.dylib" }`;
const program = `import { define, lastError } from "nona:ffi";
const strlen = define(${libc}, "strlen", "u64(str)");
const getpid = define(${libc}, "getpid", "i32()");
const abs = define(${libc}, "abs", "i32(i32)");
const toupper = define(${libc}, "toupper", "i32(i32)");
const cos = define(${libm}, "cos", "f64(f64)");
const ldexp = define(${libm}, "ldexp", "f64(f64,i32)");
const fmax = define(${libm}, "fmax", "f64(f64,f64)");
const memset = define(${libc}, "memset", "ptr(buf,i32,u64)");
const strtol = define(${libc}, "strtol", "i64(str,ptr,i32)");
const open = define(${libc}, "open", "i32(str,i32,u32)");
const close = define(${libc}, "close", "i32(i32)");
const strncmp = define(${libc}, "strncmp", "i32(str,str,u64)");
console.log(strlen("hello"), strlen(""), strlen("h\\u00e9llo"), typeof strlen, strlen.name, strlen.length);
console.log(getpid() > 0, abs(-5), abs(2147483647), toupper(97), cos(0), ldexp(1.5, 4), fmax(1.5, -2));
const bytes = new Uint8Array(6); memset(bytes.subarray(1, 5), 65, 4); console.log(bytes.join(","));
const view = new DataView(new ArrayBuffer(4), 1, 2); memset(view, 7, 2); console.log(new Uint8Array(view.buffer).join(","));
console.log(open("/nonexistent/nona/ffi", 0, 0), lastError());
console.log(strtol("  -42xyz", null, 10), strtol("ff", null, 16), strtol("99999999999999999999", null, 10), lastError());
console.log(close(-1), lastError());
const fd = open("/dev/null", 0, 0); console.log(fd >= 0, close(fd));
console.log(strncmp("abc", "abd", 2), strncmp("abc", "abd", 3) < 0, strncmp("b", "a", 1) > 0);
for (const bad of [() => strlen(5), () => abs("x"), () => memset({}, 0, 0), () => cos(true)]) {
  try { bad(); console.log("no error"); } catch (e) { console.log(e instanceof TypeError); }
}
let total = 0;
for (let i = 0; i < 200; i++) total += strlen("s" + i) + abs(-i);
console.log(total);
`;
const expected = [
    "5 0 6 function strlen 1",
    "true 5 2147483647 65 1 24 1.5",
    "0,65,65,65,65,0",
    "0,7,7,0",
    "-1 2",
    "-42 255 9223372036854776000 34",
    "-1 9",
    "true 0",
    "0 true true",
    "true",
    "true",
    "true",
    "true",
    String(
        Array.from({ length: 200 }, (_, i) => ("s" + i).length + i).reduce(
            (x, y) => x + y,
            0,
        ),
    ),
    "",
].join("\n");

function build(source: string, target: Target, gcStress = false) {
    const result = compile(source, {
        fileName: "ffi-posix.mjs",
        target,
        module: true,
        gcStress,
    });
    assert.ok(result.ok, JSON.stringify(result));
    return result.image;
}
const view = (image: Uint8Array) =>
    new DataView(image.buffer, image.byteOffset, image.byteLength);
const cString = (image: Uint8Array, at: number) =>
    new TextDecoder().decode(image.subarray(at, image.indexOf(0, at)));

/** The loader view of an ELF image: program headers and the dynamic section. */
function readElf(image: Uint8Array) {
    const v = view(image),
        base = 0x400000,
        count = v.getUint16(56, true);
    const headers = Array.from({ length: count }, (_, i) => {
        const at = 64 + 56 * i;
        return {
            type: v.getUint32(at, true),
            flags: v.getUint32(at + 4, true),
            offset: Number(v.getBigUint64(at + 8, true)),
            address: Number(v.getBigUint64(at + 16, true)),
            size: Number(v.getBigUint64(at + 32, true)),
        };
    });
    const interp = headers.find((h) => h.type === 3),
        dynamic = headers.find((h) => h.type === 2);
    const entries = new Map<number, number[]>();
    if (dynamic)
        for (let at = dynamic.offset; ; at += 16) {
            const tag = Number(v.getBigUint64(at, true)),
                value = Number(v.getBigUint64(at + 8, true));
            if (tag === 0) break;
            entries.set(tag, [...(entries.get(tag) ?? []), value]);
        }
    const strtab = (entries.get(5)?.[0] ?? 0) - base,
        needed = (entries.get(1) ?? []).map((offset) =>
            cString(image, strtab + offset),
        );
    const symtab = (entries.get(6)?.[0] ?? 0) - base,
        rela = (entries.get(7)?.[0] ?? 0) - base,
        relocations = Array.from(
            { length: (entries.get(8)?.[0] ?? 0) / 24 },
            (_, i) => {
                const info = v.getBigUint64(rela + 24 * i + 8, true),
                    symbol = Number(info >> 32n);
                return {
                    offset: Number(v.getBigUint64(rela + 24 * i, true)),
                    type: Number(info & 0xffffffffn),
                    name: cString(
                        image,
                        strtab + v.getUint32(symtab + 24 * symbol, true),
                    ),
                    binding: image[symtab + 24 * symbol + 4],
                };
            },
        );
    return {
        type: v.getUint16(16, true),
        machine: v.getUint16(18, true),
        headers,
        interpreter: interp && cString(image, interp.offset),
        dynamic,
        entries,
        needed,
        relocations,
    };
}

test("library declarations make a Linux executable dynamically linked; without them it stays static", () => {
    for (const [target, machine, interpreter, globDat] of [
        ["linux-x64", 62, "/lib64/ld-linux-x86-64.so.2", 6],
        ["linux-arm64", 183, "/lib/ld-linux-aarch64.so.1", 1025],
    ] as const) {
        const elf = readElf(build(program, target));
        assert.equal(elf.type, 2, target);
        assert.equal(elf.machine, machine);
        assert.equal(elf.interpreter, interpreter);
        // PT_INTERP precedes the loadable segments; PT_DYNAMIC and
        // PT_GNU_STACK (non-executable) follow them.
        assert.deepEqual(
            elf.headers.map((h) => h.type),
            [3, 1, 1, 1, 1, 2, 0x6474e551],
        );
        assert.ok(elf.dynamic && elf.dynamic.flags === 6);
        const data = elf.headers.filter((h) => h.type === 1).at(-1)!;
        assert.ok(
            elf.dynamic.address >= data.address &&
                elf.dynamic.address + elf.dynamic.size <=
                    data.address + data.size,
            "the dynamic section is in the writable segment",
        );
        assert.deepEqual(elf.needed, ["libc.so.6", "libm.so.6"]);
        assert.equal(elf.entries.get(30)?.[0], 8, "DT_FLAGS DF_BIND_NOW");
        assert.equal(elf.entries.get(0x6ffffffb)?.[0], 1, "DF_1_NOW");
        assert.ok(elf.entries.has(24), "DT_BIND_NOW");
        for (const tag of [4, 5, 6, 10, 11, 9]) assert.ok(elf.entries.has(tag));
        assert.deepEqual(
            elf.relocations.map((r) => r.name),
            [
                "__errno_location",
                "strlen",
                "getpid",
                "abs",
                "toupper",
                "cos",
                "ldexp",
                "fmax",
                "memset",
                "strtol",
                "open",
                "close",
                "strncmp",
            ],
        );
        for (const r of elf.relocations) {
            assert.equal(r.type, globDat);
            assert.equal(r.binding, 0x12, "STB_GLOBAL STT_FUNC");
            assert.ok(
                r.offset >= data.address && r.offset < data.address + data.size,
                "GOT cells are in the writable segment",
            );
        }
        const stat = readElf(
            build(
                `import { define } from "nona:ffi";\nconst getpid = define("syscall", "${target === "linux-x64" ? 39 : 172}", "i64()");\nconsole.log(getpid() > 0);\n`,
                target,
            ),
        );
        assert.equal(stat.interpreter, undefined);
        assert.equal(stat.dynamic, undefined);
        assert.deepEqual(
            stat.headers.map((h) => h.type),
            [1, 1, 1, 1],
        );
    }
});

function machoCommands(image: Uint8Array) {
    const v = view(image);
    let at = 32;
    return Array.from({ length: v.getUint32(16, true) }, () => {
        const command = {
            type: v.getUint32(at, true),
            size: v.getUint32(at + 4, true),
            offset: at,
        };
        at += command.size;
        return command;
    });
}

test("library declarations load their dylibs and bind their symbols in Mach-O images", () => {
    const source =
        program +
        `const version = define("/usr/lib/libsqlite3.dylib", "sqlite3_libversion_number", "i32()");\nconsole.log(version() > 0);\n`;
    for (const target of ["darwin-x64", "darwin-arm64"] as const) {
        const image = build(source, target),
            v = view(image),
            commands = machoCommands(image);
        const libraries = commands
            .filter((c) => c.type === 0xc)
            .map((c) =>
                cString(image, c.offset + v.getUint32(c.offset + 8, true)),
            );
        assert.deepEqual(libraries, [
            "/usr/lib/libSystem.B.dylib",
            "/usr/lib/libsqlite3.dylib",
        ]);
        assert.ok(
            commands.some((c) => c.type === 0xe),
            "LC_LOAD_DYLINKER",
        );
        assert.ok(
            commands.some((c) => c.type === 0x80000028),
            "LC_MAIN",
        );
        assert.ok(!commands.some((c) => c.type === 5), "no LC_UNIXTHREAD");
        const info = commands.find((c) => c.type === 0x80000022)!,
            bindOffset = v.getUint32(info.offset + 16, true),
            binds = image.subarray(
                bindOffset,
                bindOffset + v.getUint32(info.offset + 20, true),
            ),
            // latin1: one character per byte, so indices are byte offsets.
            text = new TextDecoder("latin1").decode(binds);
        for (const name of ["___error", "_strlen", "_cos", "_open"]) {
            const at = text.indexOf(name + "\0");
            assert.ok(at > 0, name);
            assert.equal(binds[at - 2], 0x11, name + " binds to libSystem");
        }
        const sqlite = text.indexOf("_sqlite3_libversion_number\0");
        assert.equal(binds[sqlite - 2], 0x12, "ordinal 2");
        // The symbol table lists every import.
        const symtab = commands.find((c) => c.type === 2)!,
            strings = new TextDecoder().decode(
                image.subarray(
                    v.getUint32(symtab.offset + 16, true),
                    v.getUint32(symtab.offset + 16, true) +
                        v.getUint32(symtab.offset + 20, true),
                ),
            );
        assert.ok(strings.includes("\0_strtol\0"));
    }
    // An Intel program without imports keeps the kernel's static startup.
    const commands = machoCommands(
        build('console.log("static");\n', "darwin-x64"),
    );
    assert.ok(
        commands.some((c) => c.type === 5),
        "LC_UNIXTHREAD",
    );
    assert.ok(!commands.some((c) => c.type === 0xc));
});

test("portable declarations select the target's library; other targets get clear diagnostics", () => {
    const portable = `import { define } from "nona:ffi";\nconst f = define({ win32: "ucrtbase.dll", linux: "libm.so.6", darwin: "/usr/lib/libSystem.B.dylib" }, "cos", "f64(f64)");\nconsole.log(f(0));\n`;
    const options = (target: Target) => ({
        fileName: "main.mjs",
        target,
        module: true,
    });
    const win = compile(portable, options("win32-x64"));
    assert.ok(win.ok && win.imports.includes("ucrtbase.dll!cos"));
    assert.deepEqual(readElf(build(portable, "linux-x64")).needed, [
        "libc.so.6",
        "libm.so.6",
    ]);
    assert.ok(compile(portable, options("darwin-arm64")).ok);
    const diagnostics = (source: string, target: Target) => {
        const result = compile(
            'import { define } from "nona:ffi";\n' + source,
            options(target),
        );
        assert.equal(result.ok, false, source);
        return result.ok
            ? []
            : result.diagnostics.map((d) => d.code + ": " + d.message);
    };
    const cases: [string, Target, RegExp][] = [
        [
            'define({ linux: "libc.so.6" }, "getpid", "i32()");',
            "darwin-x64",
            /^E_FFI_TARGET: .*no library for darwin \(keys: linux\)/,
        ],
        [
            'define({ linux: "libc.so.6", darwin: "/usr/lib/libSystem.B.dylib" }, "getpid", "i32()");',
            "win32-arm64",
            /^E_FFI_TARGET: .*no library for win32/,
        ],
        [
            'define("libc.so.6", "getpid", "i32()");',
            "freebsd-x64",
            /^E_FFI_TARGET: .*freebsd targets support define\('syscall', \.\.\.\) only/,
        ],
        [
            'define("libc.so.6", "getpid", "i32()");',
            "openbsd-x64",
            /^E_FFI_TARGET: .*openbsd targets/,
        ],
        [
            'define("kernel32.dll", "GetCurrentProcessId", "u32()");',
            "linux-arm64",
            /^E_FFI_TARGET: .*names a Windows DLL; linux targets link shared libraries/,
        ],
        [
            'define("libc.so.6", "getpid", "i32()");',
            "win32-x64",
            /^E_FFI_TARGET: .*names a shared library; Windows targets import DLLs/,
        ],
        [
            'define("libc.so.6", "getpid", "i32()");',
            "darwin-x64",
            /^E_FFI_TARGET: .*names a Linux shared object; macOS targets link dylibs/,
        ],
        [
            'define("/usr/lib/libSystem.B.dylib", "getpid", "i32()");',
            "linux-x64",
            /^E_FFI_TARGET: .*names a macOS dylib/,
        ],
        [
            'define("syscall", "39", "i64()");',
            "win32-x64",
            /^E_FFI_TARGET: System call declaration/,
        ],
        [
            'define({ freebsd: "libc.so.7" }, "getpid", "i32()");',
            "linux-x64",
            /^E_FFI_STATIC: .*keys must be win32, linux or darwin/,
        ],
        [
            'define({}, "getpid", "i32()");',
            "linux-x64",
            /^E_FFI_STATIC: .*names no operating system/,
        ],
        [
            'define({ linux: name }, "getpid", "i32()");',
            "linux-x64",
            /^E_FFI_STATIC: .*string literals/,
        ],
        [
            'define({ ...x }, "getpid", "i32()");',
            "linux-x64",
            /^E_FFI_STATIC: .*keys must be/,
        ],
        [
            'define("libc.so.6", "get-pid", "i32()");',
            "linux-x64",
            /^E_FFI_STATIC: Invalid symbol name 'get-pid'/,
        ],
        [
            'define("lib c.so", "getpid", "i32()");',
            "linux-x64",
            /^E_FFI_STATIC: Invalid library name/,
        ],
        [
            'define("a/b.dll", "F", "i32()");',
            "win32-x64",
            /^E_FFI_STATIC: Invalid DLL name/,
        ],
    ];
    for (const [source, target, message] of cases) {
        const found = diagnostics(source, target);
        assert.ok(
            found.some((d) => message.test(d)),
            source + " on " + target + ": " + found.join("; "),
        );
    }
    // A library path is accepted on POSIX targets; declarations differing only in
    // the library are distinct.
    const paths = `import { define } from "nona:ffi";\nconst a = define("/lib/x86_64-linux-gnu/libm.so.6", "cos", "f64(f64)");\nconst b = define("libm.so.6", "cos", "f64(f64)");\nconsole.log(a(0), b(0), a === b);\n`;
    const elf = readElf(build(paths, "linux-x64"));
    assert.deepEqual(elf.needed, [
        "libc.so.6",
        "/lib/x86_64-linux-gnu/libm.so.6",
        "libm.so.6",
    ]);
    assert.deepEqual(
        elf.relocations.map((r) => r.name),
        ["__errno_location", "cos", "cos"],
    );
});

test("Apple ARM64 packs stack arguments by size; Linux and Windows give each one eight bytes", () => {
    const kinds = [
        ...Array<"gp">(8).fill("gp"),
        "i8",
        "i16",
        "i32",
        "f32",
        "gp",
    ] as const;
    const stores = (os: "linux" | "darwin") => {
        const a = new Arm64Assembler("t", os);
        a.callImport("ffi.libtest!f", kinds);
        const bytes = a.finish().bytes,
            words = Array.from({ length: bytes.length / 4 }, (_, i) =>
                new DataView(bytes.buffer, bytes.byteOffset).getUint32(
                    4 * i,
                    true,
                ),
            );
        // STR{B,H,W,X} x17, [x11, #offset] below the saved registers: the
        // stores into the outgoing argument area.
        return words
            .filter((w) => (w & 0x3fc003ff) === (0x39000000 | (11 << 5) | 17))
            .map((w) => ({
                size: 1 << (w >>> 30),
                offset: ((w >>> 10) & 0xfff) << (w >>> 30),
            }))
            .filter((store) => store.offset < 8 * kinds.length);
    };
    // The f32 takes d0; the three narrow integers and the last pointer go to the stack.
    assert.deepEqual(stores("darwin"), [
        { size: 1, offset: 0 },
        { size: 2, offset: 2 },
        { size: 4, offset: 4 },
        { size: 8, offset: 8 },
    ]);
    assert.deepEqual(stores("linux"), [
        { size: 8, offset: 0 },
        { size: 8, offset: 8 },
        { size: 8, offset: 16 },
        { size: 8, offset: 24 },
    ]);
    // Float arguments beyond the eight registers (d0-d7) also go to the stack.
    const a = new Arm64Assembler("t", "linux");
    a.callImport("ffi.libtest!g", [...Array<"f64">(9).fill("f64"), "gp"]);
    const words = a.finish().bytes;
    assert.ok(words.length > 0);
    assert.throws(
        () => new Arm64Assembler("t", "linux").callImport("ffi.libtest!h"),
        /argument kinds/,
    );
});

test("libc and libm calls on the host", { skip: canRun }, () => {
    for (const gcStress of [false, true]) {
        const run = runNative(build(program, hostTarget, gcStress), 180_000);
        assert.equal(run.status, 0, run.stderr.toString());
        assert.equal(run.stdout.toString(), expected, `gcStress ${gcStress}`);
    }
});

test(
    "a missing symbol is reported by the loader before the program starts",
    { skip: canRun },
    () => {
        const run = runNative(
            build(
                `import { define } from "nona:ffi";\nconst f = define(${libc}, "nona_no_such_symbol_364", "i32()");\nconsole.log("started");\n`,
                hostTarget,
            ),
        );
        assert.notEqual(run.status, 0);
        assert.equal(run.stdout.toString(), "");
        assert.match(run.stderr.toString(), /nona_no_such_symbol_364/);
    },
);

// A C library built here with the system compiler checks the calling
// convention where libc has no suitable function: many integer and float
// arguments (registers and stack), narrow stack-passed integers (packed by
// size on Apple ARM64), float parameters and results, 32 parameters.
const helper = `#include <stdint.h>
#include <string.h>
#include <errno.h>
long long sum10(int a, int b, int c, int d, int e, int f, int g, int h, int i, int j) {
  return (long long)a + b + c + d + e + f + g + h + i + j; }
double mix(int a, double b, int c, double d, int e, double f, int g, double h, int i, double j,
           int k, double l, int m, double n, int o, double p, int q, double r) {
  return a + b + c + d + e + f + g + h + i + j + k + l + m + n + o + p + q + r; }
long long narrow(long long a, long long b, long long c, long long d, long long e, long long f, long long g, long long h,
                 int8_t i8, uint8_t u8, int16_t i16, uint16_t u16, int32_t i32, uint32_t u32, long long tail) {
  return a + b + c + d + e + f + g + h + i8 * 1000000LL + u8 * 10000LL + i16 * 100LL + u16 + (long long)i32 * 3 + u32 + tail; }
float halff(float x) { return x / 2.0f; }
double addf(float a, double b, float c) { return a + b + c; }
double floats(double a, double b, double c, double d, double e, double f, double g, double h, float i, double j) {
  return a + b + c + d + e + f + g + h + i + j; }
void fill(unsigned char *p, int n, unsigned char v) { memset(p, v, (size_t)n); }
uint64_t big(void) { return 0xffffffffffffffffULL; }
int8_t neg8(int8_t x) { return (int8_t)-x; }
uint8_t low8(int x) { return (uint8_t)x; }
int fails(int code) { errno = code; return -1; }
int count32(int a1,int a2,int a3,int a4,int a5,int a6,int a7,int a8,int a9,int a10,int a11,int a12,int a13,int a14,int a15,int a16,
            int a17,int a18,int a19,int a20,int a21,int a22,int a23,int a24,int a25,int a26,int a27,int a28,int a29,int a30,int a31,int a32) {
  return a1+a2+a3+a4+a5+a6+a7+a8+a9+a10+a11+a12+a13+a14+a15+a16+a17+a18+a19+a20+a21+a22+a23+a24+a25+a26+a27+a28+a29+a30+a31+a32; }
`;

test(
    "calls into a C library built with the system compiler",
    { skip: canRun },
    (t) => {
        const directory = mkdtempSync(join(tmpdir(), "nona-ffi-c-"));
        try {
            const library = join(
                directory,
                posixHost === "darwin" ? "libnonatest.dylib" : "libnonatest.so",
            );
            writeFileSync(join(directory, "helper.c"), helper);
            const cc = spawnSync(
                "cc",
                [
                    "-shared",
                    "-fPIC",
                    "-O1",
                    "-o",
                    library,
                    join(directory, "helper.c"),
                ],
                { encoding: "utf8" },
            );
            if (cc.error || cc.status !== 0) {
                t.skip(
                    "no working C compiler: " +
                        (cc.error?.message ?? cc.stderr),
                );
                return;
            }
            const lib = JSON.stringify(library),
                i32s = Array(32).fill("i32").join(",");
            const source = `import { define, lastError } from "nona:ffi";
const sum10 = define(${lib}, "sum10", "i64(i32,i32,i32,i32,i32,i32,i32,i32,i32,i32)");
const mix = define(${lib}, "mix", "f64(i32,f64,i32,f64,i32,f64,i32,f64,i32,f64,i32,f64,i32,f64,i32,f64,i32,f64)");
const narrow = define(${lib}, "narrow", "i64(i64,i64,i64,i64,i64,i64,i64,i64,i8,u8,i16,u16,i32,u32,i64)");
const halff = define(${lib}, "halff", "f32(f32)");
const addf = define(${lib}, "addf", "f64(f32,f64,f32)");
const floats = define(${lib}, "floats", "f64(f64,f64,f64,f64,f64,f64,f64,f64,f32,f64)");
const fill = define(${lib}, "fill", "void(buf,i32,u8)");
const big = define(${lib}, "big", "u64()");
const neg8 = define(${lib}, "neg8", "i8(i8)");
const low8 = define(${lib}, "low8", "u8(i32)");
const fails = define(${lib}, "fails", "i32(i32)");
const count32 = define(${lib}, "count32", "i32(${i32s})");
console.log(sum10(1,2,3,4,5,6,7,8,9,10), sum10(-1,-2,-3,-4,-5,-6,-7,-8,-9,-10));
console.log(mix(1,0.5,2,0.25,3,0.125,4,0.0625,5,0.03125,6,0.015625,7,0.0078125,8,0.00390625,9,0.001953125));
console.log(narrow(1,2,3,4,5,6,7,8, -1, 255, -2, 65535, -3, 4294967295, 100));
console.log(narrow(0,0,0,0,0,0,0,0, 127, -1, 32767, -1, 2147483647, -1, 0));
console.log(halff(3), addf(0.5, 0.25, 0.125), floats(1,2,3,4,5,6,7,8,0.5,0.25));
const b = new Uint8Array(5); fill(b.subarray(1), 3, 0xee); console.log(b.join(","));
console.log(big(), neg8(5), neg8(-128), low8(0x1ff), low8(-1));
console.log(fails(13), lastError(), fails(0), lastError());
console.log(count32(${Array.from({ length: 32 }, (_, i) => i + 1).join(",")}));
`;
            const run = runNative(build(source, hostTarget, true), 180_000);
            assert.equal(run.status, 0, run.stderr.toString());
            assert.equal(
                run.stdout.toString(),
                [
                    "55 -55",
                    "45.998046875",
                    "4296582757",
                    "10870310471",
                    "1.5 0.875 36.75",
                    "0,238,238,238,0",
                    "18446744073709552000 -5 -128 255 255",
                    "-1 13 -1 0",
                    "528",
                    "",
                ].join("\n"),
            );
        } finally {
            removeTemporaryDirectory(directory);
        }
    },
);
