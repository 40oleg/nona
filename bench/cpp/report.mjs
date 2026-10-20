// Markdown tables of the Nona vs optimized C++ comparison (#401) from the raw
// results of run.mjs. Every number comes from the results files; nothing is
// subtracted or combined across hosts (all files must come from one host).
//
//   node bench/cpp/report.mjs results/<a>.json [results/<b>.json ...]
//       [--n 10000000] > tables.md
//
// Sections: the headline 10-million-operation add/multiply rows; arithmetic
// and calls at --n; the C++ diagnostic builds (no-inline, native+LTO); ns/op
// of every arithmetic kernel at every measured N (calibration); the string
// kernels at --n (bounded iterations); startup.
//
// Times are the median and interquartile range of the measured runs in ms;
// "Nona/C++" is the ratio of the medians (above 1: Nona is slower); ns/op is
// given only when the median timed region is at least 10 ms (run.mjs);
// throughput is million operations (arithmetic) or million code units
// (strings) per second.

import { readFileSync } from "node:fs";
import { fmt } from "./stats.mjs";

const args = process.argv.slice(2);
const at = args.indexOf("--n");
const headlineN = at < 0 ? 10_000_000 : Number(args.splice(at, 2)[1]);
const files = args;
if (!files.length)
    throw new Error("usage: node bench/cpp/report.mjs <results.json>...");

const runs = files.map((f) => JSON.parse(readFileSync(f, "utf8")));
const hosts = new Set(
    runs.map((r) => `${r.host.hostname}/${r.platform}/${r.environment}`),
);
if (hosts.size !== 1)
    throw new Error("results from different hosts: " + [...hosts].join(", "));
const groups = runs.flatMap((r) => r.groups);
const find = (kernel, n) =>
    groups.find((g) => g.kernel === kernel && g.n === n);

const ms = (r) =>
    r?.summaryMs
        ? `${fmt(r.summaryMs.median)} [${fmt(r.summaryMs.q1)}–${fmt(r.summaryMs.q3)}]`
        : (r?.status ?? "—");
const ratio = (r) => (r?.ratio ? fmt(r.ratio) : "—");
const nsop = (r) =>
    r?.nsPerOp ? fmt(r.nsPerOp) : r?.summaryMs ? "<10 ms" : "—";
const mops = (r) => (r?.opsPerSecond ? fmt(r.opsPerSecond / 1e6) : "—");
const mcus = (r) =>
    r?.codeUnitsPerSecond ? fmt(r.codeUnitsPerSecond / 1e6) : "—";
const status = (g) => (g.status.startsWith("ok") ? "ok" : g.status);
function table(header, rows) {
    const line = (cells) => "| " + cells.join(" | ") + " |";
    if (!rows.length) return "No measured groups in the results.\n";
    return [
        line(header),
        line(header.map(() => "---")),
        ...rows.map(line),
        "",
    ].join("\n");
}
const out = [];
const section = (title) => out.push(`### ${title}`, "");

// Headline.
section(`Headline: ${headlineN.toLocaleString("en")} additions and multiplications`);
out.push(
    table(
        [
            "Kernel",
            "Contract",
            "Checksum",
            "Nona ms",
            "C++ -O3 ms",
            "Nona/C++",
            "Nona ns/op",
            "C++ ns/op",
            "Status",
        ],
        [
            "f64_add_chain",
            "f64_add_direct",
            "f64_mul_chain",
            "f64_mul_direct",
            "u32_add_chain",
            "u32_add_direct",
            "u32_mul_chain",
            "u32_mul_direct",
        ]
            .map((k) => find(k, headlineN))
            .filter(Boolean)
            .map((g) => [
                "`" + g.kernel + "`",
                g.variant,
                "`" + g.checksum + "`",
                ms(g.results.nona),
                ms(g.results["cpp-o3"]),
                "**" + ratio(g.results["cpp-o3"]) + "**",
                nsop(g.results.nona),
                nsop(g.results["cpp-o3"]),
                status(g),
            ]),
    ),
);

// Arithmetic and calls at the headline N.
const arith = groups.filter(
    (g) => g.n === headlineN && ["arith", "call", "control", "array"].includes(g.kind),
);
section(`Arithmetic, calls, control and typed arrays at N = ${headlineN.toLocaleString("en")}`);
out.push(
    table(
        [
            "Kernel",
            "Variant",
            "Checksum",
            "Nona ms",
            "C++ -O3 ms",
            "Nona/C++",
            "Nona ns/op",
            "C++ ns/op",
            "Nona Mop/s",
            "C++ Mop/s",
            "Status",
        ],
        arith.map((g) => [
            "`" + g.kernel + "`",
            g.variant,
            "`" + g.checksum + "`",
            ms(g.results.nona),
            ms(g.results["cpp-o3"]),
            ratio(g.results["cpp-o3"]),
            nsop(g.results.nona),
            nsop(g.results["cpp-o3"]),
            mops(g.results.nona),
            mops(g.results["cpp-o3"]),
            status(g),
        ]),
    ),
);

// Diagnostic C++ builds.
const diagnostic = arith.filter(
    (g) => g.results["cpp-noinline"] || g.results["cpp-native"],
);
if (diagnostic.length) {
    section(`Diagnostic C++ builds at N = ${headlineN.toLocaleString("en")} (not baselines)`);
    out.push(
        table(
            [
                "Kernel",
                "C++ -O3 ms",
                "-fno-inline ms",
                "Nona / no-inline",
                "-march=native -flto ms",
                "Nona / native",
            ],
            diagnostic.map((g) => [
                "`" + g.kernel + "`",
                ms(g.results["cpp-o3"]),
                ms(g.results["cpp-noinline"]),
                ratio(g.results["cpp-noinline"]),
                ms(g.results["cpp-native"]),
                ratio(g.results["cpp-native"]),
            ]),
        ),
    );
}

// Calibration: ns/op over N.
const sizes = [
    ...new Set(groups.filter((g) => g.kind !== "string").map((g) => g.n)),
].sort((a, b) => a - b);
if (sizes.length > 1) {
    section("Calibration: ns per operation at every N (Nona / C++ -O3)");
    const perOp = (r, n) =>
        r?.summaryMs ? fmt((r.summaryMs.median * 1e6) / n) : "—";
    out.push(
        "ns/op here is the median timed region divided by N, also below 10 ms, so the smallest N shows the timer and constant overhead.",
        "",
        table(
            ["Kernel", ...sizes.map((n) => "N = " + n.toExponential(0))],
            [...new Set(arith.map((g) => g.kernel))].map((k) => [
                "`" + k + "`",
                ...sizes.map((n) => {
                    const g = find(k, n);
                    if (!g) return "—";
                    return `${perOp(g.results.nona, n)} / ${perOp(g.results["cpp-o3"], n)}`;
                }),
            ]),
        ),
    );
}

// Strings.
const strings = groups.filter((g) => g.n === headlineN && g.kind === "string");
if (strings.length) {
    section(`Strings at N = ${headlineN.toLocaleString("en")} (bounded iterations)`);
    out.push(
        table(
            [
                "Kernel",
                "Iterations",
                "Input units",
                "Contract",
                "Alloc",
                "Code units processed",
                "Bytes allocated",
                "Checksum",
                "Nona ms",
                "C++ ms",
                "Nona/C++",
                "Nona ns/it",
                "C++ ns/it",
                "Nona Mcu/s",
                "C++ Mcu/s",
                "Status",
            ],
            strings.map((g) => [
                "`" + g.kernel + "`",
                g.iterations?.toLocaleString("en") ?? "—",
                g.inputUnits?.toLocaleString("en") ?? "—",
                g.contract === "UTF-16 code units (std::u16string)"
                    ? "UTF-16"
                    : g.contract,
                g.alloc ? "yes" : "no",
                g.codeUnitsProcessed?.toLocaleString("en") ?? "—",
                g.bytesAllocated?.toLocaleString("en") ?? "—",
                "`" + g.checksum + "`",
                ms(g.results.nona),
                ms(g.results["cpp-o3"]),
                ratio(g.results["cpp-o3"]),
                nsop(g.results.nona),
                nsop(g.results["cpp-o3"]),
                mcus(g.results.nona),
                mcus(g.results["cpp-o3"]),
                status(g),
            ]),
        ),
    );
}

// Startup.
// The first file whose startup runs all succeeded.
const startup = runs.find(
    (r) =>
        Object.keys(r.startup ?? {}).length &&
        Object.values(r.startup).every((s) => s.status === "ok"),
)?.startup;
if (startup) {
    section("Startup (loop_control 0, wall time on the Linux side)");
    out.push(
        table(
            ["Binary", "Median ms", "IQR ms", "Min–max ms", "Status"],
            Object.entries(startup).map(([label, s]) => [
                label,
                fmt(s.summaryMs.median),
                `${fmt(s.summaryMs.q1)}–${fmt(s.summaryMs.q3)}`,
                `${fmt(s.summaryMs.min)}–${fmt(s.summaryMs.max)}`,
                s.status,
            ]),
        ),
    );
}

const failed = groups.filter((g) => !g.status.startsWith("ok"));
out.push(
    `Groups: ${groups.length}, not accepted: ${failed.length}` +
        (failed.length
            ? " (" + failed.map((g) => `${g.kernel}@${g.n} ${g.status}`).join(", ") + ")"
            : "") +
        ".",
    "",
);
console.log(out.join("\n"));
