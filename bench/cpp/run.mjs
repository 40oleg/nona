// One-command runner of the Nona vs optimized C++ comparison (#401).
//
//   npm run build && node bench/cpp/build.mjs && node bench/cpp/check-asm.mjs
//   node bench/cpp/run.mjs [--n 10000000] [--sizes 1e5,1e6,1e7,3e7] [--runs 11]
//       [--only f64_add,u32_mul_chain] [--platform linux|win]
//       [--builds o3,noinline,native] [--seed 12345] [--timeout 300]
//       [--order-seed N] [--no-startup] [--out file.json]
//
// For every kernel and size, the Nona binary and the selected C++ builds run
// on the same host: one discarded warm-up run per binary, then --runs measured
// rounds; every round runs each binary once, in an order shuffled by a seeded
// PRNG (--order-seed, recorded). Each run is a new process that times its
// kernel in-process and prints {kernel, n, ns, checksum}. A timing is
// accepted only when every run of the group (warm-ups included) printed the
// same checksum; a mismatch, crash, timeout or unparsable output stays in the
// results as the sample's status and the group's status, and the group then
// has no ratio. Checksums are compared exactly (kernels.mjs `tolerance` 0).
//
// --only takes kernel-name substrings or program names (`--only strings`).
// String kernels run iterationsOf(row, N) = max(1, round(N / divisor))
// iterations, so medium and large inputs get bounded counts; their groups
// record `iterations`, `codeUnitsProcessed`, `bytesAllocated` (UTF-16 bytes
// of the strings the JavaScript contract creates), `alloc` and `contract`,
// and every run must also print the same `units` and `allocUnits`. ns/op and
// Mop/s are per iteration; Mcu/s is million code units processed per second.
//
// Startup is measured separately: the wall time of `loop_control 0` of the
// arith binaries (also under --only strings), per
// binary. Under --platform linux it is measured on the Linux side with
// date +%s%N around the exec (includes one date(1) exec, the same for every
// binary), so the wsl.exe launch from Windows is not part of it.
//
// --platform linux (default) runs the linux-x64 Nona binary and the g++
// builds natively on Linux, or through `wsl -e` on Windows (recorded as
// WSL2). --platform win runs the win32-x64 Nona binary and a Windows C++
// build when build.mjs found one; otherwise the C++ side is "unavailable".
//
// Writes the raw samples and metadata to results/<date>-<host>-<platform>.json
// and prints a summary: median, interquartile range and min–max in ms,
// Nona/C++ ratio of the medians, ns/op only when the median timed region is
// at least 10 ms, and million operations per second. Nothing is subtracted:
// loop_control is reported as a kernel of its own.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, cpus, totalmem, release } from "node:os";
import { resolve } from "node:path";
import {
    BUILDS,
    DEFAULT_BUILDS,
    HEADLINE_N,
    KERNELS,
    iterationsOf,
    UTF16,
} from "./kernels.mjs";
import { buildDir, here, isWindows, linux, linuxSh, toLinux } from "./host.mjs";
import { fmt, summarize } from "./stats.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => {
    const i = args.indexOf("--" + name);
    return i < 0 ? def : args[i + 1];
};
const sizes = opt("sizes", String(opt("n", HEADLINE_N)))
    .split(",")
    .map(Number);
for (const n of sizes)
    if (!(n >= 0 && Number.isInteger(n)))
        throw new Error("bad size " + n + " (sizes are integers)");
const runs = Number(opt("runs", "11"));
const only = opt("only", "").split(",").filter(Boolean);
const platform = opt("platform", "linux");
if (platform !== "linux" && platform !== "win")
    throw new Error("--platform is linux or win");
if (platform === "win" && !isWindows)
    throw new Error("--platform win needs a Windows host");
const builds = opt("builds", DEFAULT_BUILDS.join(",")).split(",");
for (const b of builds) if (!BUILDS[b]) throw new Error("unknown build " + b);
const seed = Number(opt("seed", "12345")) >>> 0;
const timeout = Number(opt("timeout", "300")) * 1000;
const orderSeed = Number(opt("order-seed", String(Date.now() % 2 ** 31)));
const startup = !args.includes("--no-startup");

const metaPath = resolve(buildDir, "meta.json");
if (!existsSync(metaPath))
    throw new Error("run `node bench/cpp/build.mjs` first");
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
const asmCheckPath = resolve(buildDir, "asm", "check.json");
const asmCheck = existsSync(asmCheckPath)
    ? JSON.parse(readFileSync(asmCheckPath, "utf8"))
    : null;
if (!asmCheck)
    console.warn(
        "warning: build/asm/check.json missing; run check-asm.mjs first",
    );

// Seeded order of the binaries in every round (mulberry32).
let orderState = orderSeed >>> 0;
function random() {
    orderState = (orderState + 0x6d2b79f5) >>> 0;
    let t = orderState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// The binaries of one program on this platform.
const target = platform === "linux" ? "linux-x64" : "win32-x64";
function binaries(program) {
    const list = [];
    const nona = meta.nona.binaries[`${program}-nona-${target}`];
    list.push({
        label: "nona",
        side: "nona",
        status: nona?.status === "ok" ? "ok" : (nona?.status ?? "unavailable"),
        path: nona && resolve(here, nona.path),
    });
    const cpp = meta.cpp[platform];
    for (const build of builds) {
        const entry = cpp?.builds?.[build]?.[program];
        list.push({
            label: "cpp-" + build,
            side: "cpp",
            build,
            status:
                cpp?.status !== "ok"
                    ? "unavailable"
                    : entry?.status === "ok"
                      ? "ok"
                      : (entry?.status ?? "unavailable"),
            path: entry && resolve(here, entry.path),
            reason: cpp?.reason,
        });
    }
    return list;
}

function execute(path, argv) {
    const options = { encoding: "utf8", timeout, maxBuffer: 1 << 24 };
    const t0 = performance.now();
    const r =
        platform === "linux" && isWindows
            ? spawnSync("wsl", ["-e", toLinux(path), ...argv], options)
            : spawnSync(path, argv, options);
    return { r, wallMs: performance.now() - t0 };
}

// One measured process: {status, ns, checksum, wallMs, stderr}.
function runKernel(binary, kernel, n) {
    const { r, wallMs } = execute(binary.path, [
        kernel,
        String(n),
        String(seed),
    ]);
    const sample = { wallMs: +wallMs.toFixed(3) };
    if (r.error?.code === "ETIMEDOUT") return { ...sample, status: "timeout" };
    if (r.status !== 0) {
        return {
            ...sample,
            status: "crash",
            exitCode: r.status,
            signal: r.signal,
            stderr: (r.stderr || String(r.error || "")).trim().slice(-500),
        };
    }
    const line = (r.stdout || "").trim().split("\n").pop();
    let out;
    try {
        out = JSON.parse(line);
    } catch {}
    if (
        !out ||
        out.kernel !== kernel ||
        out.n !== n ||
        !Number.isFinite(out.ns) ||
        typeof out.checksum !== "string"
    )
        return { ...sample, status: "bad-output", stdout: line?.slice(0, 500) };
    const result = {
        ...sample,
        status: "ok",
        ns: out.ns,
        checksum: out.checksum,
    };
    // String kernels: the contract's code units processed and created.
    if (Number.isFinite(out.units)) result.units = out.units;
    if (Number.isFinite(out.allocUnits)) result.allocUnits = out.allocUnits;
    return result;
}

// Wall time of a process doing no kernel work (loop_control, n = 0).
const STARTUP_SH =
    's=$(date +%s%N); "$0" "$@" >/dev/null 2>&1; rc=$?; e=$(date +%s%N); echo "$rc $((e - s))"';
function runStartup(binary) {
    const argv = ["loop_control", "0", String(seed)];
    if (platform === "linux") {
        const r = linux(
            ["sh", "-c", STARTUP_SH, toLinux(binary.path), ...argv],
            {
                timeout,
            },
        );
        const [rc, ns] = (r.stdout || "").trim().split(" ").map(Number);
        if (r.status !== 0 || rc !== 0 || !Number.isFinite(ns))
            return { status: "crash", exitCode: rc };
        return { status: "ok", ms: ns / 1e6 };
    }
    const { r, wallMs } = execute(binary.path, argv);
    return r.status === 0
        ? { status: "ok", ms: wallMs }
        : { status: "crash", exitCode: r.status };
}

function sameChecksum(row, a, b) {
    if (a === b) return true;
    if (!row.tolerance || !a.startsWith("f64:") || !b.startsWith("f64:"))
        return false;
    const value = (c) => {
        const view = new DataView(new ArrayBuffer(8));
        view.setBigUint64(0, BigInt("0x" + c.slice(4)));
        return view.getFloat64(0);
    };
    const x = value(a),
        y = value(b);
    return (
        Math.abs(x - y) <= row.tolerance * Math.max(Math.abs(x), Math.abs(y))
    );
}

function hostInfo() {
    const info = {
        hostname: hostname(),
        runnerOs: process.platform,
        runnerOsRelease: release(),
        node: process.version,
        logicalCpus: cpus().length,
        cpuModel: cpus()[0]?.model.trim(),
        ramBytes: totalmem(),
    };
    if (platform === "linux") {
        const version = linuxSh("cat /proc/version");
        info.linux = {
            environment: /microsoft/i.test(version)
                ? /WSL2/i.test(version)
                    ? "WSL2"
                    : "WSL"
                : isWindows
                  ? "unknown"
                  : "native Linux",
            kernel: linuxSh("uname -srvm"),
            os: linuxSh('. /etc/os-release && echo "$PRETTY_NAME"'),
            cpuModel: linuxSh(
                "grep -m1 'model name' /proc/cpuinfo | cut -d: -f2-",
            ),
            cpus: Number(linuxSh("nproc")),
            memTotal: linuxSh("grep MemTotal /proc/meminfo | tr -s ' '"),
            governor:
                linuxSh(
                    "cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null",
                ) || "unavailable",
            loadavg: linuxSh("cat /proc/loadavg"),
        };
    }
    if (isWindows) {
        const ps = (command) => {
            const r = spawnSync(
                "powershell",
                [
                    "-NoProfile",
                    "-Command",
                    // UTF-8 output also for native commands (powercfg).
                    "[Console]::OutputEncoding = [Text.Encoding]::UTF8; " +
                        command,
                ],
                { encoding: "utf8" },
            );
            return r.status === 0 ? r.stdout.trim() : "unavailable";
        };
        info.windows = {
            cpu: ps("(Get-CimInstance Win32_Processor).Name"),
            cpuLoadPercent: ps(
                "(Get-CimInstance Win32_Processor).LoadPercentage",
            ),
            ramBytes: ps(
                "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory",
            ),
            os: ps("(Get-CimInstance Win32_OperatingSystem).Caption"),
            powerPlan: ps("powercfg /getactivescheme"),
        };
        if (platform === "linux") {
            const r = spawnSync("wsl", ["--version"], { encoding: "utf16le" });
            info.windows.wslVersion =
                r.status === 0 ? r.stdout.trim() : "unavailable";
        }
    }
    return info;
}

const rows = KERNELS.filter(
    (k) =>
        only.length === 0 ||
        only.some((p) => k.id.includes(p) || k.program === p),
);
if (rows.length === 0) throw new Error("--only matches no kernel");
const host = hostInfo();
const startedAt = new Date();
const environment =
    platform === "linux" ? host.linux.environment : "native Windows";
console.log(
    `platform ${platform} (${environment}), sizes ${sizes.join(", ")}, ` +
        `${runs} runs, builds ${builds.join(", ")}, order seed ${orderSeed}`,
);

// Startup.
const startupResults = {};
if (startup) {
    // The arith binaries, whatever --only selects: loop_control is an arith
    // kernel (the string program has no zero-work kernel).
    const list = binaries("arith").filter(
        (b) =>
            b.status === "ok" &&
            (b.side === "nona" || builds.includes(b.build)),
    );
    const samples = Object.fromEntries(list.map((b) => [b.label, []]));
    for (const b of shuffle(list)) runStartup(b); // warm-up
    for (let round = 0; round < runs; round++)
        for (const b of shuffle(list))
            samples[b.label].push({ round, ...runStartup(b) });
    for (const b of list) {
        const ok = samples[b.label].filter((s) => s.status === "ok");
        startupResults[b.label] = {
            status: ok.length === runs ? "ok" : "failed-runs",
            summaryMs: summarize(ok.map((s) => s.ms)),
            samples: samples[b.label],
        };
    }
    console.log("\nstartup (loop_control, n = 0), ms: median [IQR] (min–max)");
    for (const [label, s] of Object.entries(startupResults))
        console.log(
            `  ${label.padEnd(14)} ${fmt(s.summaryMs.median)} [${fmt(s.summaryMs.q1)}–${fmt(s.summaryMs.q3)}] (${fmt(s.summaryMs.min)}–${fmt(s.summaryMs.max)}) ${s.status}`,
        );
}

// Kernels.
const groups = [];
const idWidth = Math.max(18, ...rows.map((k) => k.id.length + 1));
const header =
    "kernel".padEnd(idWidth) +
    "n".padStart(10) +
    "  " +
    "binary".padEnd(14) +
    "median ms".padStart(10) +
    "  " +
    "IQR".padEnd(15) +
    "min–max".padEnd(15) +
    "ns/op".padStart(8) +
    "Mop/s".padStart(9) +
    "Mcu/s".padStart(9) +
    "nona/C++".padStart(10) +
    "  status";
console.log("\n" + header);
// String kernels run a bounded number of iterations derived from N
// (kernels.mjs iterationsOf); a (kernel, iterations) pair runs once.
const measuredPairs = new Set();
for (const n of sizes)
    for (const row of rows) {
        const iterations = iterationsOf(row, n);
        if (measuredPairs.has(row.id + "@" + iterations)) continue;
        measuredPairs.add(row.id + "@" + iterations);
        const list = binaries(row.program).filter(
            (b) =>
                b.side === "nona" ||
                !BUILDS[b.build].rows ||
                BUILDS[b.build].rows(row),
        );
        const runnable = list.filter((b) => b.status === "ok");
        const kernelOf = (b) => (b.side === "nona" ? row.js : row.cpp);
        const samples = [];
        for (const [i, b] of shuffle(runnable).entries())
            samples.push({
                binary: b.label,
                warmup: true,
                round: -1,
                position: i,
                ...runKernel(b, kernelOf(b), iterations),
            });
        for (let round = 0; round < runs; round++)
            for (const [i, b] of shuffle(runnable).entries())
                samples.push({
                    binary: b.label,
                    warmup: false,
                    round,
                    position: i,
                    ...runKernel(b, kernelOf(b), iterations),
                });
        // Checksums: every successful run must print the reference checksum
        // (the first one of C++ -O3, else the first one at all).
        // String kernels must also agree on the code units processed and
        // created.
        const ok = samples.filter((s) => s.status === "ok");
        const first = ok.find((s) => s.binary === "cpp-o3") ?? ok[0];
        const reference = first?.checksum;
        for (const s of ok)
            if (
                !sameChecksum(row, s.checksum, reference) ||
                s.units !== first.units ||
                s.allocUnits !== first.allocUnits
            )
                s.status = "mismatch";
        const statuses = [...new Set(samples.map((s) => s.status))];
        const unavailable = list.filter((b) => b.status !== "ok");
        const status =
            samples.length === 0
                ? "unavailable"
                : statuses.length === 1 && statuses[0] === "ok"
                  ? unavailable.length
                      ? "ok (some binaries unavailable)"
                      : "ok"
                  : statuses.filter((s) => s !== "ok").join("+");
        const accepted = statuses.every((s) => s === "ok");
        const results = {};
        for (const b of list) {
            if (b.status !== "ok") {
                results[b.label] = {
                    status: b.status,
                    reason: b.reason,
                };
                continue;
            }
            const measured = samples.filter(
                (s) => s.binary === b.label && !s.warmup && s.status === "ok",
            );
            const summary = accepted
                ? summarize(measured.map((s) => s.ns / 1e6))
                : null;
            results[b.label] = {
                status: accepted ? "ok" : "not accepted (" + status + ")",
                summaryMs: summary,
                nsPerOp:
                    summary && summary.median >= 10 && iterations > 0
                        ? (summary.median * 1e6) / iterations
                        : null,
                opsPerSecond:
                    summary && summary.median > 0
                        ? iterations / (summary.median / 1e3)
                        : null,
                codeUnitsPerSecond:
                    summary && summary.median > 0 && first?.units !== undefined
                        ? first.units / (summary.median / 1e3)
                        : null,
            };
        }
        const nonaMedian = results.nona?.summaryMs?.median;
        for (const b of list)
            if (b.side === "cpp" && results[b.label].summaryMs)
                results[b.label].ratio =
                    nonaMedian / results[b.label].summaryMs.median;
        groups.push({
            kernel: row.id,
            js: row.js,
            cpp: row.cpp,
            cppSymbol: row.cppSymbol,
            kind: row.kind,
            variant: row.variant,
            unit: row.unit,
            payloadBytes: row.payloadBytes,
            n,
            // n operations, except for string kernels: bounded iterations.
            iterations,
            alloc: row.alloc,
            contract: row.contract,
            encoding: row.encoding,
            inputUnits: row.inputUnits,
            codeUnitsProcessed: first?.units ?? null,
            // 2 bytes per code unit of the strings the JavaScript contract
            // creates (payload only: no headers, small-string buffers or
            // allocator overhead; Nona may store ASCII in one byte per unit).
            bytesAllocated:
                first?.allocUnits !== undefined ? first.allocUnits * 2 : null,
            seed,
            checksum: reference ?? null,
            status,
            results,
            samples,
        });
        for (const b of list) {
            const r = results[b.label];
            const s = r.summaryMs;
            console.log(
                (b === list[0] ? row.id : "").padEnd(idWidth) +
                    (b === list[0] ? String(iterations) : "").padStart(10) +
                    "  " +
                    b.label.padEnd(14) +
                    fmt(s?.median).padStart(10) +
                    "  " +
                    (s ? `${fmt(s.q1)}–${fmt(s.q3)}` : "").padEnd(15) +
                    (s ? `${fmt(s.min)}–${fmt(s.max)}` : "").padEnd(15) +
                    (r.nsPerOp ? fmt(r.nsPerOp) : s ? "<10ms" : "").padStart(
                        8,
                    ) +
                    (r.opsPerSecond ? fmt(r.opsPerSecond / 1e6) : "").padStart(
                        9,
                    ) +
                    (r.codeUnitsPerSecond
                        ? fmt(r.codeUnitsPerSecond / 1e6)
                        : ""
                    ).padStart(9) +
                    (r.ratio ? "×" + fmt(r.ratio) : "").padStart(10) +
                    "  " +
                    (b === list[0]
                        ? status
                        : r.status === "ok"
                          ? row.kind === "string" && row.contract !== UTF16
                              ? `[${row.contract}]`
                              : ""
                          : r.status),
            );
        }
    }

const failedGroups = groups.filter((g) => !g.status.startsWith("ok"));
const date = startedAt.toISOString().slice(0, 10);
const resultsDir = resolve(here, "results");
mkdirSync(resultsDir, { recursive: true });
let out = opt("out", "");
if (!out) {
    const base = `${date}-${hostname().toLowerCase()}-${platform}${platform === "linux" && isWindows ? "-wsl2" : ""}`;
    out = resolve(resultsDir, base + ".json");
    for (let i = 2; existsSync(out); i++)
        out = resolve(resultsDir, `${base}-${i}.json`);
}
writeFileSync(
    out,
    JSON.stringify(
        {
            schema: 1,
            issue: "https://github.com/40oleg/nona/issues/401",
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            platform,
            environment,
            options: {
                sizes,
                runs,
                warmupRuns: 1,
                builds,
                seed,
                orderSeed,
                timeoutSeconds: timeout / 1000,
                only,
                checksumPolicy:
                    "exact string equality (f64 bit patterns); kernels.mjs tolerance 0 for every kernel",
                nsPerOpThresholdMs: 10,
                loadavgAfter:
                    platform === "linux"
                        ? linuxSh("cat /proc/loadavg")
                        : undefined,
            },
            host,
            build: meta,
            asmCheck,
            kernels: rows,
            startup: startupResults,
            groups,
        },
        null,
        1,
    ),
);
console.log(`\nwrote ${out}`);
if (failedGroups.length) {
    console.error(
        `${failedGroups.length} group(s) not accepted: ` +
            failedGroups
                .map((g) => `${g.kernel}@${g.n} ${g.status}`)
                .join(", "),
    );
    process.exit(1);
}
