// Statistics and formatting shared by bench/report.mjs and its tests: medians
// and quartiles of samples, geometric means of ratios, the number formats of
// the PERFORMANCE.md tables and Markdown table rendering.

// Sorted copy of the finite numbers of `values`.
function sorted(values) {
    return values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
}

// Linear-interpolated quantile (q in 0..1) of the finite values; NaN when empty.
export function quantile(values, q) {
    const s = sorted(values);
    if (s.length === 0) return NaN;
    const position = (s.length - 1) * q;
    const low = Math.floor(position),
        high = Math.ceil(position);
    return s[low] + (s[high] - s[low]) * (position - low);
}

export const median = (values) => quantile(values, 0.5);

// n, median, min, max and the quartiles of a sample.
export function summarize(values) {
    const s = sorted(values);
    return {
        n: s.length,
        median: median(s),
        min: s.length ? s[0] : NaN,
        max: s.length ? s[s.length - 1] : NaN,
        q1: quantile(s, 0.25),
        q3: quantile(s, 0.75),
    };
}

// Geometric mean of positive finite ratios; NaN when there is none.
export function geomean(ratios) {
    const r = ratios.filter((x) => Number.isFinite(x) && x > 0);
    if (r.length === 0) return NaN;
    return Math.exp(r.reduce((sum, x) => sum + Math.log(x), 0) / r.length);
}

// A number with three significant digits, as the tables print milliseconds:
// 0.28, 5.86, 56.2, 365, 1 210 (thin space as thousands separator).
export function fmt(value, digits = 3) {
    if (!Number.isFinite(value)) return "—";
    if (value === 0) return "0";
    const magnitude = Math.floor(Math.log10(Math.abs(value)));
    const decimals = Math.max(0, digits - 1 - magnitude);
    const text = value.toFixed(decimals);
    const [whole, fraction] = text.split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return fraction ? `${grouped}.${fraction}` : grouped;
}

// A Nona/Node ratio: ×0.7, ×1.4, ×12, ×98. Ratios of 1.5 or less either way
// are within the noise of a shared machine; `noise` marks them with ≈.
export function fmtRatio(ratio, { noise = 1.5 } = {}) {
    if (!Number.isFinite(ratio)) return "—";
    const text = ratio < 10 ? ratio.toFixed(1) : String(Math.round(ratio));
    const within = ratio <= noise && ratio >= 1 / noise;
    return (within ? "≈×" : "×") + text;
}

// "median (q1–q3)" or "median (min–max)" for a summary.
export function fmtSpread(summary, kind = "iqr") {
    if (!summary || !Number.isFinite(summary.median)) return "—";
    const [low, high] =
        kind === "iqr" ? [summary.q1, summary.q3] : [summary.min, summary.max];
    return `${fmt(summary.median)} (${fmt(low)}–${fmt(high)})`;
}

// Markdown table; Prettier re-aligns the columns when the report is formatted.
export function mdTable(headers, rows) {
    const line = (cells) => `| ${cells.map(String).join(" | ")} |`;
    return [
        line(headers),
        line(headers.map(() => "---")),
        ...rows.map(line),
    ].join("\n");
}

// The last line of `stdout` that parses as a JSON object, or null.
export function lastJson(stdout) {
    const lines = String(stdout || "")
        .trim()
        .split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line.startsWith("{")) continue;
        try {
            return JSON.parse(line);
        } catch {}
    }
    return null;
}

// The medians of every numeric metric of the runs' JSON lines, per runtime,
// plus the set of distinct `check` values (one entry when every run agreed).
export function aggregate(runs) {
    const byRuntime = new Map();
    for (const run of runs) {
        let entry = byRuntime.get(run.rt);
        if (!entry) {
            entry = { walls: [], rss: [], metrics: {}, checks: new Set() };
            byRuntime.set(run.rt, entry);
        }
        if (run.rc !== 0 || !run.metrics) {
            entry.failed = (entry.failed || 0) + 1;
            continue;
        }
        entry.walls.push(run.wall);
        if (Number.isFinite(run.rss)) entry.rss.push(run.rss);
        for (const [key, value] of Object.entries(run.metrics)) {
            if (key === "check") {
                entry.checks.add(JSON.stringify(value));
                continue;
            }
            if (typeof value !== "number" || key === "bytes") continue;
            (entry.metrics[key] ??= []).push(value);
        }
    }
    const result = {};
    for (const [rt, entry] of byRuntime) {
        result[rt] = {
            failed: entry.failed || 0,
            wall: summarize(entry.walls),
            rss: summarize(entry.rss),
            metrics: Object.fromEntries(
                Object.entries(entry.metrics).map(([k, v]) => [
                    k,
                    summarize(v),
                ]),
            ),
            checks: [...entry.checks],
        };
    }
    return result;
}
