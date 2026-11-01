// Regenerates every table of the PERFORMANCE.md report (#392): start-up,
// executable size and memory; the micro-benchmarks; the real programs; the
// Are-We-Fast-Yet suite with the JIT warm-up curve; the Benchmarks Game
// programs; and callgrind instruction counts. Raw results go to
// bench/results/<suite>.json, the Markdown tables to bench/results/<suite>.md
// and to stdout.
//
//   node bench/report.mjs [--suite startup,corpus,micro,real,awfy,game,profile]
//        [--runs 10] [--runtimes node,deno,bun,nona] [--scale 0.1]
//        [--only 05,06] [--out bench/results] [--timeout 600]
//
// Prerequisites: `npm run build`, `node bench/real/fetch.mjs` (real, startup)
// and `node bench/awfy/fetch.mjs` (awfy). Runtimes that are not installed are
// skipped; hyperfine and valgrind are used when present. Linux x64 is the
// reference platform (peak RSS needs GNU time, instruction counts valgrind).
//
// The protocol (see PERFORMANCE.md, "Method"): every case is a separate
// process per run, `--runs` runs (default 10) after one untimed warm-up run,
// the tables show the median and the interquartile range, and the per-script
// `check` value must agree between runtimes or the case is reported as a
// mismatch, not as a performance result. The Are-We-Fast-Yet benchmarks run
// their iterations inside one process, as the suite's harness does, so that
// the first iteration (cold, where a JIT still compiles) and the steady state
// are both visible.

import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { basename, extname, join, resolve } from "node:path";
import {
    aggregate,
    fmt,
    fmtRatio,
    fmtSpread,
    geomean,
    lastJson,
    mdTable,
    median,
    summarize,
} from "./lib/stats.mjs";
import { metricInfo, summaryTable } from "./lib/metrics.mjs";
import {
    availableRuntimes,
    buildNona,
    command,
    exe,
    has,
    machine,
    measure,
    root,
    versions,
} from "./lib/measure.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = args.indexOf("--" + name);
    return i < 0 ? fallback : args[i + 1];
};
const suites = opt(
    "suite",
    "startup,corpus,micro,real,awfy,game,profile",
).split(",");
const runs = Number(opt("runs", "10"));
const scale = Number(opt("scale", "0.1"));
const only = opt("only", "").split(",").filter(Boolean);
const runtimes = opt("runtimes", "node,deno,bun,nona")
    .split(",")
    .filter((rt) => availableRuntimes()[rt]);
const outDir = resolve(opt("out", join(root, "bench", "results")));
const timeout = Number(opt("timeout", "600")) * 1000;
const bench = join(root, "bench");
const buildDir = join(bench, "build");
mkdirSync(buildDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const log = (...m) => console.error(...m);
// First line of an error message, without terminal colours.
const brief = (text) =>
    String(text ?? "")
        .replace(/\x1b\[[\d;]*m/g, "")
        .trim()
        .split("\n")[0]
        .slice(0, 160);
const checksAgree = (agg) => {
    const all = new Set();
    for (const a of Object.values(agg)) for (const c of a.checks) all.add(c);
    return all.size <= 1;
};

// Runs `script` (built once for Nona) `runs` times per runtime after one
// warm-up run and returns the raw runs; `env` is passed to the program.
function series(script, { cwd, env = {}, module = false, nonaOut } = {}) {
    const name = basename(script, extname(script));
    const out = nonaOut ?? join(buildDir, name + exe);
    const result = { script: name, runs: [], build: null };
    for (const rt of runtimes) {
        if (rt === "nona") {
            result.build = buildNona(script, out, { module });
            if (!result.build.ok) {
                log(`  nona build failed for ${name}: ${result.build.error}`);
                result.runs.push({
                    rt,
                    rc: -1,
                    wall: NaN,
                    error: result.build.error,
                });
                continue;
            }
        }
        const [cmd, cmdArgs] = command(rt, script, out);
        for (let i = -1; i < runs; i++) {
            const m = measure(cmd, cmdArgs, { cwd, env, timeout });
            if (i < 0) continue; // warm-up
            const metrics = lastJson(m.stdout);
            result.runs.push({
                rt,
                rc: m.rc,
                wall: m.wall,
                rss: m.rss,
                metrics,
                stderr: m.rc === 0 ? undefined : m.stderr,
            });
            if (m.timedOut || m.rc !== 0) {
                log(`  ${rt} ${name}: rc=${m.rc} ${m.stderr.slice(-200)}`);
                break;
            }
        }
    }
    return result;
}

// Markdown for a list of `series` results: one row per metric with the median
// (IQR) of every runtime and the Nona/Node ratio, then wall time and RSS rows.
function tablesFor(results, label) {
    const rows = [],
        ratios = [],
        mismatches = [],
        failures = [];
    const header = ["Operation", ...runtimes.map(cap), "Nona / Node"];
    for (const r of results) {
        const agg = aggregate(r.runs);
        const info = metricInfo[r.script] ?? {};
        if (!r.build?.ok && r.build)
            failures.push(`${r.script}: ${r.build.error}`);
        for (const rt of runtimes)
            if (agg[rt]?.failed)
                failures.push(
                    `${r.script} on ${rt}: ${agg[rt].failed} run(s) failed: ${brief(
                        r.runs.find((x) => x.rt === rt && x.rc !== 0)?.stderr ??
                            r.runs.find((x) => x.rt === rt)?.error,
                    )}`,
                );
        if (!checksAgree(agg))
            mismatches.push(
                `${r.script}: ${Object.entries(agg)
                    .map(([rt, a]) => `${rt}=${a.checks.join("/")}`)
                    .join(", ")}`,
            );
        const keys = Object.keys(agg.node?.metrics ?? agg.nona?.metrics ?? {});
        for (const key of keys) {
            const [text, category] = info[key] ?? [
                `${r.script}: ${key}`,
                label,
            ];
            const node = agg.node?.metrics[key]?.median,
                nona = agg.nona?.metrics[key]?.median;
            const ratio = nona / node;
            ratios.push({ key: `${r.script}.${key}`, category, ratio });
            rows.push([
                text,
                ...runtimes.map((rt) => fmtSpread(agg[rt]?.metrics[key])),
                fmtRatio(ratio),
            ]);
        }
    }
    const wallRows = results.map((r) => {
        const agg = aggregate(r.runs);
        return [
            `\`${r.script}\``,
            ...runtimes.map((rt) => fmtSpread(agg[rt]?.wall, "iqr")),
            ...runtimes.map((rt) => fmt(agg[rt]?.rss?.median)),
            fmtRatio(agg.nona?.wall.median / agg.node?.wall.median),
        ];
    });
    const wallHeader = [
        "Script",
        ...runtimes.map((rt) => `${cap(rt)}, s`),
        ...runtimes.map((rt) => `${cap(rt)} RSS, MB`),
        "Nona / Node",
    ];
    return {
        metrics: mdTable(header, rows),
        wall: mdTable(wallHeader, wallRows),
        ratios,
        mismatches,
        failures,
    };
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// --- suites -----------------------------------------------------------------

function suiteMicro() {
    const scripts = readdirSync(bench)
        .filter((f) => /^\d\d_.*\.m?js$/.test(f) && !f.startsWith("01_"))
        .filter((f) => only.length === 0 || only.some((p) => f.startsWith(p)))
        .sort();
    const results = [];
    for (const script of scripts) {
        log(`micro ${script}`);
        results.push(
            series(join(bench, script), {
                cwd: bench,
                env: { SCALE: String(scale) },
            }),
        );
    }
    const t = tablesFor(results, "compute");
    const md = [
        `### Micro-benchmarks`,
        ``,
        `\`node bench/report.mjs --suite micro --scale ${scale} --runs ${runs} --runtimes ${runtimes.join(",")}\`: median (interquartile range) of ${runs} runs, ms, one process per run after a warm-up run. \`--scale ${scale}\` is N = ${fmt(1000000 * scale)} of the array, object, call and class rows.`,
        ``,
        t.metrics,
        ``,
        `Whole scripts, wall time including start-up (median and IQR, s) and peak RSS (median, MB):`,
        ``,
        t.wall,
        notes(t),
    ].join("\n");
    return {
        results,
        md,
        ratios: t.ratios,
        mismatches: t.mismatches,
        failures: t.failures,
    };
}

function suiteReal() {
    const dir = join(bench, "real");
    if (!existsSync(join(dir, "vendor")))
        throw new Error("run `node bench/real/fetch.mjs` first");
    const scripts = readdirSync(dir)
        .filter((f) => /\.m?js$/.test(f) && f !== "fetch.mjs")
        .filter((f) => only.length === 0 || only.some((p) => f.startsWith(p)))
        .sort();
    const results = [];
    for (const script of scripts) {
        log(`real ${script}`);
        results.push(
            series(join(dir, script), {
                cwd: dir,
                env: { SCALE: String(opt("real-scale", "1")) },
            }),
        );
    }
    const t = tablesFor(results, "real");
    const md = [
        `### Real programs`,
        ``,
        `\`node bench/report.mjs --suite real --runs ${runs} --runtimes ${runtimes.join(",")}\`: median (IQR) of ${runs} runs, ms (libraries from \`node bench/real/fetch.mjs\`).`,
        ``,
        t.metrics,
        ``,
        `Whole scripts, wall time (s) and peak RSS (MB):`,
        ``,
        t.wall,
        notes(t),
    ].join("\n");
    return {
        results,
        md,
        ratios: t.ratios,
        mismatches: t.mismatches,
        failures: t.failures,
    };
}

function notes(t) {
    const lines = [];
    if (t.mismatches.length)
        lines.push(
            ``,
            `**Check mismatches (correctness bugs, not performance results):**`,
            ...t.mismatches.map((m) => `- ${m}`),
        );
    if (t.failures.length)
        lines.push(``, `**Failures:**`, ...t.failures.map((m) => `- ${m}`));
    return lines.join("\n");
}

const awfyNames = [
    "DeltaBlue",
    "Richards",
    "Json",
    "CD",
    "Havlak",
    "Bounce",
    "List",
    "Mandelbrot",
    "NBody",
    "Permute",
    "Queens",
    "Sieve",
    "Storage",
    "Towers",
];

function suiteAwfy() {
    const dir = join(bench, "awfy");
    if (!existsSync(join(dir, "vendor")))
        throw new Error("run `node bench/awfy/fetch.mjs` first");
    const script = join(dir, "awfy.js");
    const out = join(buildDir, "awfy" + exe);
    const iterations = Number(opt("iterations", "10"));
    const results = { build: null, benchmarks: [] };
    if (runtimes.includes("nona")) {
        results.build = buildNona(script, out);
        if (!results.build.ok)
            log(`  nona build failed: ${results.build.error}`);
    }
    const names = awfyNames.filter(
        (n) => only.length === 0 || only.some((p) => n.startsWith(p)),
    );
    for (const name of names) {
        log(`awfy ${name}`);
        const entry = { name, runtimes: {} };
        for (const rt of runtimes) {
            if (rt === "nona" && !results.build?.ok) {
                entry.runtimes[rt] = { error: results.build.error };
                continue;
            }
            const [cmd, cmdArgs] = command(rt, script, out);
            const m = measure(cmd, cmdArgs, {
                cwd: dir,
                env: { BENCH: name, ITER: String(iterations), SCALE: "1" },
                timeout,
            });
            const json = lastJson(m.stdout);
            entry.runtimes[rt] = {
                rc: m.rc,
                wall: m.wall,
                rss: m.rss,
                iterations: json?.iterations ?? null,
                inner: json?.inner,
                check: json?.check ?? null,
                error: m.rc === 0 ? undefined : m.stderr,
            };
            if (m.rc !== 0) log(`  ${rt} ${name}: rc=${m.rc} ${m.stderr}`);
        }
        results.benchmarks.push(entry);
    }
    // Steady state: the median of the iterations after the first three.
    const steady = (it) =>
        it ? median(it.slice(Math.min(3, it.length - 1))) / 1000 : NaN;
    const first = (it) => (it ? it[0] / 1000 : NaN);
    const ratios = [],
        failures = [],
        mismatches = [];
    const rows = results.benchmarks.map((b) => {
        const r = b.runtimes;
        for (const rt of runtimes) {
            if (r[rt]?.error)
                failures.push(`${b.name} on ${rt}: ${brief(r[rt].error)}`);
            else if (r[rt]?.check === false)
                mismatches.push(`${b.name} on ${rt}: verifyResult failed`);
        }
        const ratio = steady(r.nona?.iterations) / steady(r.node?.iterations);
        ratios.push({ key: `awfy.${b.name}`, category: "awfy", ratio });
        return [
            `${b.name} (${r.node?.inner ?? r.nona?.inner ?? "?"})`,
            ...runtimes.map((rt) => fmt(first(r[rt]?.iterations))),
            ...runtimes.map((rt) => fmt(steady(r[rt]?.iterations))),
            fmtRatio(ratio),
            fmtRatio(first(r.nona?.iterations) / first(r.node?.iterations)),
        ];
    });
    const header = [
        "Benchmark (inner iterations)",
        ...runtimes.map((rt) => `${cap(rt)} first, ms`),
        ...runtimes.map((rt) => `${cap(rt)} steady, ms`),
        "Nona / Node steady",
        "Nona / Node first",
    ];
    const curve = results.benchmarks
        .filter((b) =>
            ["DeltaBlue", "Richards", "Havlak", "NBody", "Json"].includes(
                b.name,
            ),
        )
        .map((b) => [
            b.name,
            ...["node", "nona"].flatMap((rt) =>
                (b.runtimes[rt]?.iterations ?? [])
                    .slice(0, 6)
                    .map((us) => fmt(us / 1000)),
            ),
        ]);
    const md = [
        `### Are-We-Fast-Yet`,
        ``,
        `\`node bench/report.mjs --suite awfy --iterations ${iterations} --runtimes ${runtimes.join(",")}\`: the 14 benchmarks of [Are-We-Fast-Yet](https://github.com/smarr/are-we-fast-yet) (revision in \`bench/awfy/fetch.mjs\`) with the suite's standard inner-iteration counts, ${iterations} timed iterations in one process per runtime. "First" is iteration 1 (cold: a JIT is still compiling), "steady" the median of iterations 4–${iterations}. Every iteration verified its result.`,
        ``,
        mdTable(header, rows),
        ``,
        `Warm-up curve, iterations 1–6, ms (Node.js then Nona):`,
        ``,
        mdTable(
            [
                "Benchmark",
                ...[1, 2, 3, 4, 5, 6].map((i) => `Node ${i}`),
                ...[1, 2, 3, 4, 5, 6].map((i) => `Nona ${i}`),
            ],
            curve,
        ),
        results.build?.ok
            ? `\nThe suite compiles to one ${fmt(results.build.bytes / 2 ** 20)} MB executable in ${fmt(results.build.seconds)} s.`
            : "",
        notes({ mismatches, failures }),
    ].join("\n");
    return { results, md, ratios, mismatches, failures };
}

// The Benchmarks Game programs: whole-process wall time, as the game reports.
const gameCases = [
    ["binary-trees", { N: "16" }],
    ["fannkuch-redux", { N: "10" }],
    ["fasta", { N: "1000000" }],
    ["k-nucleotide", { INPUT: "fasta-250k.txt" }],
    ["mandelbrot", { N: "2000" }],
    ["n-body", { N: "1000000" }],
    ["spectral-norm", { N: "2000" }],
    ["reverse-complement", { INPUT: "fasta-250k.txt" }],
    ["regex-redux", { INPUT: "fasta-250k.txt" }],
];

// Whole-process measurement of `cases` ([name, script, env]): every runtime
// runs each program `runs` times after a warm-up, and the md5 of stdout is
// the correctness check. Returns the raw runs and the table rows.
function wholeProcess(
    cases,
    { cwd, prefix, label, category, sizeOf, unit = "s" },
) {
    const factor = unit === "ms" ? 1000 : 1;
    const results = [];
    for (const [name, script, env] of cases) {
        log(`${prefix} ${name}`);
        const out = join(buildDir, `${prefix}-${name}${exe}`);
        const entry = { name, env, runs: [], build: null };
        for (const rt of runtimes) {
            if (rt === "nona") {
                entry.build = buildNona(script, out);
                if (!entry.build.ok) {
                    entry.runs.push({
                        rt,
                        rc: -1,
                        wall: NaN,
                        error: entry.build.error,
                    });
                    continue;
                }
            }
            const [cmd, cmdArgs] = command(rt, script, out);
            for (let i = -1; i < runs; i++) {
                const m = measure(cmd, cmdArgs, { cwd, env, timeout });
                if (i < 0) continue;
                entry.runs.push({
                    rt,
                    rc: m.rc,
                    wall: m.wall,
                    rss: m.rss,
                    hash: createHash("md5")
                        .update(m.stdout)
                        .digest("hex")
                        .slice(0, 12),
                    stderr: m.rc === 0 ? undefined : m.stderr,
                });
                if (m.rc !== 0 || m.timedOut) {
                    log(`  ${rt} ${name}: rc=${m.rc} ${m.stderr.slice(-200)}`);
                    break;
                }
            }
        }
        results.push(entry);
    }
    const ratios = [],
        mismatches = [],
        failures = [];
    const rows = results.map((e) => {
        const per = {};
        for (const rt of runtimes) {
            const ok = e.runs.filter((r) => r.rt === rt && r.rc === 0);
            per[rt] = {
                wall: summarize(ok.map((r) => r.wall * factor)),
                rss: summarize(ok.map((r) => r.rss)),
                hashes: [...new Set(ok.map((r) => r.hash))],
            };
            const bad = e.runs.find((r) => r.rt === rt && r.rc !== 0);
            if (bad)
                failures.push(
                    `${e.name} on ${rt}: ${brief(bad.error ?? bad.stderr ?? "rc=" + bad.rc)}`,
                );
        }
        const hashes = new Set(runtimes.flatMap((rt) => per[rt].hashes));
        if (hashes.size > 1)
            mismatches.push(
                `${e.name}: ${runtimes.map((rt) => `${rt}=${per[rt].hashes.join("/")}`).join(", ")}`,
            );
        const ratio = per.nona?.wall.median / per.node?.wall.median;
        ratios.push({ key: `${category}.${e.name}`, category, ratio });
        return [
            sizeOf ? `${e.name} (${sizeOf(e)})` : `\`${e.name}\``,
            ...runtimes.map((rt) => fmtSpread(per[rt].wall)),
            ...runtimes.map((rt) => fmt(per[rt].rss.median)),
            fmtRatio(ratio),
        ];
    });
    const header = [
        label,
        ...runtimes.map((rt) => `${cap(rt)}, ${unit}`),
        ...runtimes.map((rt) => `${cap(rt)} RSS, MB`),
        "Nona / Node",
    ];
    return {
        results,
        table: mdTable(header, rows),
        ratios,
        mismatches,
        failures,
    };
}

function suiteGame() {
    const dir = join(bench, "game");
    const input = join(buildDir, "fasta-250k.txt");
    if (!existsSync(input)) {
        log("game: generating fasta-250k.txt with Node.js");
        const r = spawnSync("node", [join(dir, "fasta.js")], {
            env: { ...process.env, N: "250000" },
            maxBuffer: 1 << 28,
        });
        writeFileSync(input, r.stdout);
    }
    const cases = gameCases
        .filter(
            ([name]) =>
                only.length === 0 || only.some((p) => name.startsWith(p)),
        )
        .map(([name, env]) => [
            name,
            join(dir, name + ".js"),
            env.INPUT ? { INPUT: join(buildDir, env.INPUT) } : env,
        ]);
    const t = wholeProcess(cases, {
        cwd: dir,
        prefix: "game",
        label: "Program (size)",
        category: "game",
        sizeOf: (e) =>
            Object.entries(e.env)
                .map(([k, v]) => `${k}=${k === "INPUT" ? "fasta 250 000" : v}`)
                .join(" "),
    });
    const md = [
        `### Benchmarks Game`,
        ``,
        `\`node bench/report.mjs --suite game --runs ${runs} --runtimes ${runtimes.join(",")}\`: the nine programs in \`bench/game/\`, written after the problem descriptions of the [Computer Language Benchmarks Game](https://benchmarksgame-team.pages.debian.net/benchmarksgame/) (single-threaded; sizes reduced from the game's), whole-process wall time including start-up as the game reports it, median (IQR) of ${runs} runs, s, and peak RSS, MB. The outputs of all runtimes were compared byte for byte.`,
        ``,
        t.table,
        notes(t),
    ].join("\n");
    return { ...t, md };
}

// A sample of the program corpus (programs/001–010): small complete programs,
// where whole-process time is mostly start-up.
function suiteCorpus() {
    const dir = join(root, "programs");
    const cases = readdirSync(dir)
        .filter((f) => /^0(0\d|10)-.*\.js$/.test(f))
        .filter((f) => only.length === 0 || only.some((p) => f.startsWith(p)))
        .sort()
        .map((f) => [f.replace(/\.js$/, ""), join(dir, f), {}]);
    const t = wholeProcess(cases, {
        cwd: dir,
        prefix: "corpus",
        label: "Program",
        category: "startup",
        unit: "ms",
    });
    const md = [
        `### Program corpus sample`,
        ``,
        `\`node bench/report.mjs --suite corpus --runs ${runs} --runtimes ${runtimes.join(",")}\`: the first ten programs of the [program corpus](programs/README.md), whole-process wall time, median (IQR) of ${runs} runs, ms, and peak RSS, MB; stdout compared between runtimes.`,
        ``,
        t.table,
        notes(t),
    ].join("\n");
    return { ...t, md };
}

// Start-up, executable size, build time and peak RSS of hello world and of a
// program that loads lodash; hyperfine when installed, else the same loop here.
function suiteStartup() {
    const cases = [
        ["hello", join(bench, "01_hello.js"), bench],
        [
            "lodash-hello",
            join(bench, "startup", "lodash-hello.mjs"),
            join(bench, "startup"),
        ],
    ];
    const warmup = 5,
        count = Number(opt("startup-runs", "30"));
    const hyperfine = has("hyperfine");
    const results = [];
    for (const [name, script, cwd] of cases) {
        if (!existsSync(join(bench, "real", "vendor")) && name !== "hello") {
            log("startup: skipping lodash-hello (run bench/real/fetch.mjs)");
            continue;
        }
        log(`startup ${name}`);
        const out = join(buildDir, "startup-" + name + exe);
        const entry = { name, rows: [] };
        // Build time: median of 3 builds with a warm runtime cache.
        const builds = [];
        let build = null;
        for (let i = 0; i < 3; i++) {
            build = buildNona(script, out);
            if (!build.ok) break;
            builds.push(build.seconds);
        }
        const programs = [];
        if (build?.ok)
            programs.push([
                "Nona, compiled ELF",
                [out],
                build.bytes,
                median(builds),
            ]);
        else entry.error = build?.error;
        if (runtimes.includes("bun")) {
            const bunOut = join(buildDir, "startup-" + name + "-bun" + exe);
            const t0 = performance.now();
            const r = spawnSync(
                "bun",
                ["build", "--compile", script, "--outfile", bunOut],
                {
                    cwd,
                    encoding: "utf8",
                },
            );
            const seconds = (performance.now() - t0) / 1000;
            if (r.status === 0)
                programs.push([
                    "Bun, `bun build --compile`",
                    [bunOut],
                    statSizeOf(bunOut),
                    seconds,
                ]);
            programs.push(["Bun, `bun x.js`", ["bun", script], null, null]);
        }
        if (runtimes.includes("deno"))
            programs.push([
                "Deno, `deno run x.js`",
                ["deno", "run", "-A", script],
                null,
                null,
            ]);
        programs.push(["Node, `node x.js`", ["node", script], null, null]);
        for (const [label, cmd, bytes, buildSeconds] of programs) {
            let samples = [];
            if (hyperfine) {
                const json = join(buildDir, "hyperfine.json");
                const r = spawnSync(
                    "hyperfine",
                    [
                        "--warmup",
                        String(warmup),
                        "--runs",
                        String(count),
                        "--export-json",
                        json,
                        "-N",
                        cmd.map(shellQuote).join(" "),
                    ],
                    { cwd, encoding: "utf8" },
                );
                if (r.status === 0) {
                    const data = JSON.parse(readFileSync(json, "utf8"));
                    samples = data.results[0].times.map((s) => s * 1000);
                } else
                    log(
                        `  hyperfine failed for ${label}: ${r.stderr.slice(-200)}`,
                    );
            }
            let error;
            if (samples.length === 0) {
                for (let i = 0; i < warmup + count; i++) {
                    const m = measure(cmd[0], cmd.slice(1), { cwd });
                    if (m.rc !== 0) {
                        error = m.stderr.replace(/\x1b\[[\d;]*m/g, "");
                        break;
                    }
                    if (i >= warmup) samples.push(m.wall * 1000);
                }
            }
            const rss = [];
            if (!error)
                for (let i = 0; i < 5; i++)
                    rss.push(measure(cmd[0], cmd.slice(1), { cwd }).rss);
            entry.rows.push({
                label,
                startup: summarize(samples),
                bytes,
                buildSeconds,
                rss: median(rss),
                error,
            });
        }
        results.push(entry);
    }
    const md = [];
    for (const e of results) {
        md.push(
            `**${e.name === "hello" ? "Hello world" : "lodash 4.17.21 loaded, one call (`bench/startup/lodash-hello.mjs`)"}**, start-up: median (IQR) of ${count} runs after ${warmup} warm-ups${has("hyperfine") ? " with hyperfine" : ""}; peak RSS: median of 5 runs.`,
            ``,
            mdTable(
                [
                    "How the program runs",
                    "Start-up, ms",
                    "Executable, MB",
                    "Build, s",
                    "Peak RSS, MB",
                ],
                e.rows.map((r) => [
                    r.label,
                    r.error
                        ? `fails: ${r.error.split("\n")[0].slice(0, 80)}`
                        : fmtSpread(r.startup),
                    r.bytes ? fmt(r.bytes / 2 ** 20) : "(the runtime)",
                    r.buildSeconds ? fmt(r.buildSeconds) : "—",
                    fmt(r.rss),
                ]),
            ),
            e.error ? `\nNona build failed: ${e.error}` : "",
            ``,
        );
    }
    const ratios = results.flatMap((e) => {
        const nona = e.rows.find((r) => r.label.startsWith("Nona")),
            node = e.rows.find((r) => r.label.startsWith("Node"));
        return nona && node
            ? [
                  {
                      key: `startup.${e.name}`,
                      category: "startup",
                      ratio: nona.startup.median / node.startup.median,
                  },
              ]
            : [];
    });
    return {
        results,
        md:
            `### Start-up, executable size, build time, memory\n\n` +
            md.join("\n"),
        ratios,
        mismatches: [],
        failures: [],
    };
}

function statSizeOf(file) {
    try {
        return statSync(file).size;
    } catch {
        return null;
    }
}
const shellQuote = (s) => (/[\s"']/.test(s) ? JSON.stringify(s) : s);

// Instruction counts and profiles for cases whose wall time is short or
// noisy: deterministic, so they confirm or refute a wall-time difference on a
// shared machine, and they name the runtime routines where Nona's time goes.
// Nona runs under QEMU's execution trace (scripts/profile-runtime.mjs, exact
// per-routine counts); Node.js runs under callgrind, whose count includes its
// own start-up, subtracted as the hello-world row. (Nona executables cannot
// run under valgrind: rt.enterFrame touches the pages of a frame of 4 KiB or
// more before moving RSP, which valgrind reports as a stack-pointer error.)
// Small scales keep the QEMU trace, about 20 bytes per instruction, bounded.
const profileCases = [
    ["01_hello", "0.01", {}],
    ["07_strings", "0.01", {}],
    ["09_gc", "0.01", {}],
    ["14_calls", "0.01", {}],
    ["15_classes", "0.01", {}],
    ["awfy/awfy", "0.01", { BENCH: "NBody", ITER: "1" }],
    ["awfy/awfy", "0.01", { BENCH: "Richards", ITER: "1" }],
    ["game/n-body", "1", { N: "1000" }],
];
function suiteProfile() {
    const valgrind = has("valgrind"),
        qemu = has("qemu-x86_64");
    if (!qemu)
        return {
            results: [],
            md: "### Instruction counts and profiles\n\nqemu-x86_64 is not installed; skipped.",
            ratios: [],
            mismatches: [],
            failures: [],
        };
    const results = [];
    const callgrind = (cmd, cmdArgs, cwd, env) => {
        if (!valgrind) return NaN;
        const r = spawnSync(
            "valgrind",
            [
                "--tool=callgrind",
                "--callgrind-out-file=/dev/null",
                cmd,
                ...cmdArgs,
            ],
            {
                cwd,
                encoding: "utf8",
                env: { ...process.env, ...env },
                maxBuffer: 1 << 26,
                timeout,
            },
        );
        const m = (r.stderr || "").match(/refs:\s+([\d,]+)/);
        return m ? Number(m[1].replace(/,/g, "")) : NaN;
    };
    for (const [name, s, extra] of profileCases) {
        if (only.length && !only.some((p) => name.startsWith(p))) continue;
        const label = `${name}${extra.BENCH ? " " + extra.BENCH : ""}${extra.N ? " N=" + extra.N : ""}`;
        log(`profile ${label}`);
        const dir = join(bench, name.includes("/") ? name.split("/")[0] : "");
        const script = readdirSync(dir).find((f) =>
            f.startsWith(basename(name) + "."),
        );
        if (!script) continue;
        const json = join(
            buildDir,
            `profile-${basename(name)}-${extra.BENCH ?? ""}.json`,
        );
        const env = { SCALE: s, ...extra };
        const r = spawnSync(
            "node",
            [
                join(root, "scripts", "profile-runtime.mjs"),
                join(dir, script),
                "--scale",
                s,
                "--group",
                "--json",
                json,
                "--top",
                "8",
                "--cwd",
                dir,
            ],
            {
                encoding: "utf8",
                env: { ...process.env, ...env },
                maxBuffer: 1 << 26,
                timeout,
            },
        );
        let profile = null;
        if (r.status === 0 && existsSync(json))
            profile = JSON.parse(readFileSync(json, "utf8"));
        else log(`  profile failed: ${brief(r.stderr)}`);
        const node = callgrind("node", [script], dir, env);
        results.push({
            name: label,
            scale: s,
            nona: profile?.total ?? NaN,
            node,
            routines: profile
                ? Object.entries(profile.routines).slice(0, 5)
                : [],
            families: profile
                ? Object.entries(profile.families).slice(0, 4)
                : [],
            error: r.status === 0 ? undefined : brief(r.stderr),
        });
    }
    const hello = results.find((r) => r.name === "01_hello");
    const rows = results.map((r) => [
        `\`${r.name}\` (SCALE ${r.scale})`,
        fmt(r.node / 1e6),
        fmt(r.nona / 1e6),
        hello && r !== hello
            ? fmtRatio((r.nona - hello.nona) / (r.node - hello.node))
            : fmtRatio(r.nona / r.node),
        r.families
            .map(([f, c]) => `${f} ${Math.round((100 * c) / r.nona)}%`)
            .join(", "),
        r.routines
            .map(([f, c]) => `\`${f}\` ${Math.round((100 * c) / r.nona)}%`)
            .join(", "),
    ]);
    const md = [
        `### Instruction counts and profiles`,
        ``,
        `\`node bench/report.mjs --suite profile\`: instructions executed, millions. Nona: exact counts from QEMU's execution trace (\`scripts/profile-runtime.mjs\`), with the routine families and single routines that executed most of them; Node.js: \`valgrind --tool=callgrind\` of the whole process. The ratio subtracts each runtime's hello-world start-up (first row). Small scales keep the traces bounded, so Node.js is still mostly in its interpreter and baseline compiler here; the ratios are upper bounds for its optimized code.`,
        ``,
        mdTable(
            [
                "Case",
                "Node, M instr.",
                "Nona, M instr.",
                "Nona / Node (minus start-up)",
                "Nona: families",
                "Nona: top routines",
            ],
            rows,
        ),
        notes({
            mismatches: [],
            failures: results
                .filter((r) => r.error)
                .map((r) => `${r.name}: ${r.error}`),
        }),
    ].join("\n");
    return { results, md, ratios: [], mismatches: [], failures: [] };
}

// --- main -------------------------------------------------------------------

const info = {
    versions: versions(),
    machine: machine(),
    date: new Date().toISOString().slice(0, 10),
    runs,
    scale,
    runtimes,
};
log(JSON.stringify(info));
const allRatios = [];
const sections = [];
for (const suite of suites) {
    const run = {
        startup: suiteStartup,
        micro: suiteMicro,
        real: suiteReal,
        awfy: suiteAwfy,
        game: suiteGame,
        corpus: suiteCorpus,
        profile: suiteProfile,
    }[suite];
    if (!run) throw new Error("unknown suite " + suite);
    const t0 = performance.now();
    const result = run();
    result.seconds = +((performance.now() - t0) / 1000).toFixed(1);
    writeFileSync(
        join(outDir, suite + ".json"),
        JSON.stringify({ info, ...result }, null, 1),
    );
    writeFileSync(join(outDir, suite + ".md"), result.md + "\n");
    sections.push(result.md);
    allRatios.push(...result.ratios);
    log(`${suite}: ${result.seconds} s`);
}
if (allRatios.length) {
    const summary = summaryTable(allRatios);
    writeFileSync(join(outDir, "summary.md"), summary + "\n");
    writeFileSync(
        join(outDir, "ratios.json"),
        JSON.stringify(allRatios, null, 1),
    );
    console.log(summary + "\n");
}
console.log(sections.join("\n\n"));
