// Builds the kernels of the Nona vs C++ comparison (#401) and records how.
//
//   npm run build
//   node bench/cpp/build.mjs [--platform linux|win|linux,win]
//
// - JavaScript kernels (js/*.js): dist/cli.js for linux-x64 and, on Windows,
//   win32-x64. --print-asm listings go to build/asm/<program>-nona-<target>.asm.
// - C++ kernels (cpp/*.cpp): g++ on the Linux side (natively on Linux, `wsl -e
//   g++` from Windows) in every build of kernels.mjs. Per build: the binary,
//   g++ -S output (.s), objdump -d --no-show-raw-insn -C (.objdump.txt) and
//   nm -C (.nm.txt), both read by check-asm.mjs, and the vectorizer report
//   (.vec.txt). A Windows C++
//   build is made only when g++ is on the Windows PATH; otherwise meta.json
//   records it as unavailable.
// - build/meta.json: compiler path and version, libstdc++, binutils, flags,
//   Nona version and command, git SHA, source hashes.
//
// Default platform: linux on Linux, linux,win on Windows.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { BUILDS, PROGRAMS } from "./kernels.mjs";
import {
    buildDir,
    hasLinux,
    here,
    isWindows,
    linux,
    linuxSh,
    root,
    toLinux,
} from "./host.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => {
    const i = args.indexOf("--" + name);
    return i < 0 ? def : args[i + 1];
};
const platforms = opt("platform", isWindows ? "linux,win" : "linux").split(",");
for (const p of platforms)
    if (p !== "linux" && p !== "win") throw new Error("unknown platform " + p);
if (platforms.includes("win") && !isWindows)
    throw new Error("--platform win needs a Windows host");

const cli = resolve(root, "dist", "cli.js");
if (!existsSync(cli)) throw new Error("run `npm run build` first");
const binDir = resolve(buildDir, "bin"),
    asmDir = resolve(buildDir, "asm");
mkdirSync(binDir, { recursive: true });
mkdirSync(asmDir, { recursive: true });

const git = (...a) =>
    spawnSync("git", a, { cwd: root, encoding: "utf8" }).stdout.trim();
// Paths in meta.json are relative to bench/cpp/.
const rel = (path) => relative(here, path).split("\\").join("/");
const sha256 = (path) =>
    createHash("sha256").update(readFileSync(path)).digest("hex");
let failed = false;

// Nona.
const nonaVersion = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
).version;
const nona = {
    version: nonaVersion,
    cli: "node dist/cli.js build <program>.js -o <out> --target <target> --print-asm",
    optimization:
        "nona build has no optimization levels or flags; every build uses the same pipeline",
    binaries: {},
};
const targets = platforms.map((p) =>
    p === "linux" ? "linux-x64" : "win32-x64",
);
for (const program of PROGRAMS) {
    const source = resolve(here, "js", program + ".js");
    for (const target of targets) {
        const name = `${program}-nona-${target}`;
        const out = resolve(
            binDir,
            name + (target === "win32-x64" ? ".exe" : ""),
        );
        const t0 = performance.now();
        const r = spawnSync(
            process.execPath,
            [
                cli,
                "build",
                source,
                "-o",
                out,
                "--target",
                target,
                "--print-asm",
            ],
            { encoding: "utf8", maxBuffer: 1 << 28 },
        );
        const seconds = (performance.now() - t0) / 1000;
        const entry = {
            program,
            target,
            path: rel(out),
            buildSeconds: seconds,
        };
        if (r.status !== 0) {
            failed = true;
            entry.status = "compile-error";
            entry.error = (r.stderr || "").slice(-2000);
            console.error(`nona ${name}: build failed\n${r.stderr}`);
        } else {
            entry.status = "ok";
            writeFileSync(resolve(asmDir, name + ".asm"), r.stdout);
            entry.asm = rel(resolve(asmDir, name + ".asm"));
            console.log(`nona ${name}: ${seconds.toFixed(1)} s`);
        }
        nona.binaries[name] = entry;
    }
}

// C++ on the Linux side.
const cpp = {};
if (platforms.includes("linux")) {
    const record = {
        platform: "linux",
        environment: isWindows ? "WSL2 (wsl -e)" : "native Linux",
        builds: {},
    };
    if (!hasLinux("g++")) {
        record.status = "unavailable";
        record.reason = isWindows
            ? "g++ not found in WSL (wsl -e g++)"
            : "g++ not found";
        console.error("C++ linux: " + record.reason);
    } else {
        record.status = "ok";
        record.compiler = linuxSh("command -v g++");
        record.compilerVersion = linuxSh("g++ --version | head -n 1");
        record.libstdcxx = {
            library: linuxSh(
                'readlink -f "$(g++ -print-file-name=libstdc++.so.6)"',
            ),
            macros: linuxSh(
                "echo '#include <cstddef>' | g++ -std=c++17 -dM -E -x c++ - | grep -E '^#define (__GLIBCXX__|_GLIBCXX_RELEASE) ' | tr '\\n' ' '",
            ),
        };
        record.binutils = linuxSh("objdump --version | head -n 1");
        record.linker = linuxSh("ld --version | head -n 1");
        record.linkage =
            "default g++ linking: dynamic libstdc++, libm, libc (no -static)";
        for (const program of PROGRAMS) {
            const source = toLinux(resolve(here, "cpp", program + ".cpp"));
            for (const [build, { flags, label }] of Object.entries(BUILDS)) {
                const name = `${program}-cpp-${build}`;
                const out = resolve(binDir, name);
                const asm = (ext) => resolve(asmDir, name + ext);
                const entry = { program, build, label, flags, path: rel(out) };
                const t0 = performance.now();
                const r = linux([
                    "g++",
                    ...flags,
                    `-fopt-info-vec-optimized=${toLinux(asm(".vec.txt"))}`,
                    "-o",
                    toLinux(out),
                    source,
                ]);
                entry.buildSeconds = (performance.now() - t0) / 1000;
                if (r.status !== 0) {
                    failed = true;
                    entry.status = "compile-error";
                    entry.error = (r.stderr || "").slice(-2000);
                    console.error(`g++ ${name}: failed\n${r.stderr}`);
                    record.builds[build] ??= {};
                    record.builds[build][program] = entry;
                    continue;
                }
                entry.status = "ok";
                // g++ -S of an -flto build would print LTO bytecode, so the
                // listing is made without it; the objdump of the binary is the
                // code that runs.
                const sFlags = flags.filter((f) => f !== "-flto");
                linux([
                    "g++",
                    ...sFlags,
                    "-S",
                    "-o",
                    toLinux(asm(".s")),
                    source,
                ]);
                const dump = linux([
                    "sh",
                    "-c",
                    'objdump -d --no-show-raw-insn -C "$0" > "$1"',
                    toLinux(out),
                    toLinux(asm(".objdump.txt")),
                ]);
                // Symbol table: identical code folding can leave several
                // kernels at one address under one objdump label.
                const symbols = linux([
                    "sh",
                    "-c",
                    'nm -C --defined-only "$0" > "$1"',
                    toLinux(out),
                    toLinux(asm(".nm.txt")),
                ]);
                if (dump.status !== 0 || symbols.status !== 0) {
                    failed = true;
                    console.error(`objdump ${name}: failed\n${dump.stderr}`);
                }
                entry.asm = {
                    s: rel(asm(".s")),
                    objdump: rel(asm(".objdump.txt")),
                    symbols: rel(asm(".nm.txt")),
                    vectorizer: rel(asm(".vec.txt")),
                };
                console.log(
                    `g++ ${name}: ${entry.buildSeconds.toFixed(1)} s (${flags.join(" ")})`,
                );
                record.builds[build] ??= {};
                record.builds[build][program] = entry;
            }
        }
    }
    cpp.linux = record;
}

// C++ on Windows: only with a g++ on the Windows PATH.
if (platforms.includes("win")) {
    const version = spawnSync("g++", ["--version"], { encoding: "utf8" });
    if (version.status !== 0) {
        cpp.win = {
            platform: "win",
            status: "unavailable",
            reason: "no g++ on the Windows PATH (MinGW-w64 or MSYS2 UCRT64 g++ would provide one)",
        };
        console.log("C++ win: unavailable (no g++ on PATH)");
    } else {
        const record = {
            platform: "win",
            environment: "native Windows",
            status: "ok",
            compilerVersion: version.stdout.split("\n")[0].trim(),
            builds: {},
        };
        for (const program of PROGRAMS)
            for (const [build, { flags, label }] of Object.entries(BUILDS)) {
                const name = `${program}-cpp-${build}`;
                const out = resolve(binDir, name + ".exe");
                const r = spawnSync(
                    "g++",
                    [
                        ...flags,
                        "-o",
                        out,
                        resolve(here, "cpp", program + ".cpp"),
                    ],
                    { encoding: "utf8" },
                );
                const entry = { program, build, label, flags, path: rel(out) };
                entry.status = r.status === 0 ? "ok" : "compile-error";
                if (r.status !== 0) {
                    failed = true;
                    entry.error = (r.stderr || "").slice(-2000);
                    console.error(`g++ ${name}.exe: failed\n${r.stderr}`);
                }
                record.builds[build] ??= {};
                record.builds[build][program] = entry;
            }
        cpp.win = record;
    }
}

const meta = {
    date: new Date().toISOString(),
    git: {
        sha: git("rev-parse", "HEAD"),
        describe: git("describe", "--tags", "--always"),
        dirty: git("status", "--porcelain") !== "",
    },
    node: process.version,
    host: process.platform,
    nona,
    cpp,
    sources: Object.fromEntries(
        PROGRAMS.flatMap((program) => [
            [`js/${program}.js`, sha256(resolve(here, "js", program + ".js"))],
            [
                `cpp/${program}.cpp`,
                sha256(resolve(here, "cpp", program + ".cpp")),
            ],
        ]),
    ),
};
writeFileSync(resolve(buildDir, "meta.json"), JSON.stringify(meta, null, 2));
console.log("wrote " + resolve(buildDir, "meta.json"));
if (failed) process.exit(1);
