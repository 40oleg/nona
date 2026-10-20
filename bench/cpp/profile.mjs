// Where a Nona kernel of the C++ comparison spends its time (#401).
//
//   node bench/cpp/profile.mjs <kernel> <n> [--program arith|strings]
//       [--seed 12345] [--freq 2000] [--top 15] [--json out.json]
//
// Builds js/<program>.js for linux-x64 with NONA_ELF_MAP (the executable's
// symbol table as JSON), runs the kernel under `perf record -e cpu-clock` on
// Linux (through `wsl -e` on Windows) and attributes every sample to the
// routine that contains its address: a runtime routine (rt.*) or a compiled
// function (js.fn.<k>, js.main); local labels ($...) and blocks are folded
// into their routine. The samples cover the whole process, including input
// generation before the timed region, so choose n large enough for the kernel
// to dominate (the run prints the kernel's own timed ns for comparison).
//
// cpu-clock is a software timer event: WSL2 exposes no hardware counters, so
// this gives sampled time, not instruction counts. scripts/profile-runtime.mjs
// counts instructions exactly but needs qemu-user.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { KERNELS } from "./kernels.mjs";
import { buildDir, here, linux, root, toLinux } from "./host.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => {
    const i = args.indexOf("--" + name);
    if (i < 0) return def;
    const value = args[i + 1];
    args.splice(i, 2);
    return value;
};
const programOption = opt("program", "");
const seed = opt("seed", "12345");
const freq = opt("freq", "2000");
const top = Number(opt("top", "15"));
const json = opt("json", "");
const [kernel, n] = args;
if (!kernel || !n)
    throw new Error(
        "usage: node bench/cpp/profile.mjs <kernel> <n> [--program p]",
    );
const row = KERNELS.find((k) => k.js === kernel || k.id === kernel);
const program = programOption || row?.program;
if (!program) throw new Error("unknown kernel " + kernel + "; pass --program");
const jsKernel = row?.js ?? kernel;

const dir = resolve(buildDir, "profile");
mkdirSync(dir, { recursive: true });
const exe = resolve(dir, program + "-nona-linux-x64");
const mapFile = resolve(dir, program + ".map.json");
const build = spawnSync(
    process.execPath,
    [
        resolve(root, "dist", "cli.js"),
        "build",
        resolve(here, "js", program + ".js"),
        "-o",
        exe,
        "--target",
        "linux-x64",
    ],
    {
        encoding: "utf8",
        env: { ...process.env, NONA_ELF_MAP: mapFile },
    },
);
if (build.status !== 0) throw new Error("build failed:\n" + build.stderr);

const perf = linux([
    "sh",
    "-c",
    // perf.data goes to a Linux temporary file: perf cannot write it on a
    // Windows drive mounted in WSL2 (an empty file, exit status 255).
    'd=$(mktemp) && perf record -q -e cpu-clock -F "$1" -o "$d" -- "$2" "$3" "$4" "$5" && perf script -i "$d" -F ip; r=$?; rm -f "$d"; exit $r',
    "sh",
    freq,
    toLinux(exe),
    jsKernel,
    String(n),
    seed,
]);
if (perf.status !== 0) throw new Error("perf failed:\n" + perf.stderr);
const lines = perf.stdout.trim().split("\n");
const output = lines.find((l) => l.startsWith("{"));
const ips = lines.filter((l) => /^\s*[0-9a-f]+\s*$/i.test(l));

// Routine of every symbol: strip local labels and block suffixes.
const routineOf = (name) =>
    name
        .split("$")[0]
        .replace(/\.block\.\d+$/, "")
        .replace(/\.(end|frame)$/, "");
const symbols = Object.entries(JSON.parse(readFileSync(mapFile, "utf8")))
    .map(([name, address]) => ({ name: routineOf(name), address }))
    .sort((a, b) => a.address - b.address);
function lookup(ip) {
    let lo = 0,
        hi = symbols.length - 1,
        found = null;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (symbols[mid].address <= ip) {
            found = symbols[mid];
            lo = mid + 1;
        } else hi = mid - 1;
    }
    return found?.name ?? "(unknown)";
}
const counts = new Map();
for (const line of ips) {
    const name = lookup(parseInt(line.trim(), 16));
    counts.set(name, (counts.get(name) ?? 0) + 1);
}
const total = ips.length;
const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log(
    `${kernel} n=${n}: ${total} samples at ${freq} Hz (cpu-clock), kernel output ${output ?? "(none)"}`,
);
for (const [name, count] of ranked.slice(0, top))
    console.log(
        `  ${((100 * count) / total).toFixed(1).padStart(5)}%  ${name}`,
    );
if (json)
    writeFileSync(
        json,
        JSON.stringify(
            {
                kernel,
                program,
                n: Number(n),
                seed: Number(seed),
                frequencyHz: Number(freq),
                event: "cpu-clock",
                samples: total,
                output: output ? JSON.parse(output) : null,
                routines: Object.fromEntries(ranked),
            },
            null,
            1,
        ) + "\n",
    );
