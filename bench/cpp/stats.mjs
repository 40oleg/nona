// Sample statistics of the Nona vs C++ comparison. This mirrors the protocol
// of the Node.js/standard-suite report (#392, bench/lib/stats.mjs of PR #395):
// linear-interpolated quantiles, median with the interquartile range and
// min/max, non-finite samples ignored. It is a copy, not an import, so that
// bench/cpp/ runs on its own.

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

// n, median, quartiles, IQR, min and max of a sample.
export function summarize(values) {
    const s = sorted(values);
    const q1 = quantile(s, 0.25),
        q3 = quantile(s, 0.75);
    return {
        n: s.length,
        median: median(s),
        q1,
        q3,
        iqr: q3 - q1,
        min: s.length ? s[0] : NaN,
        max: s.length ? s[s.length - 1] : NaN,
    };
}

// A number with three significant digits; "—" when not finite.
export function fmt(value, digits = 3) {
    if (!Number.isFinite(value)) return "—";
    if (value === 0) return "0";
    const magnitude = Math.floor(Math.log10(Math.abs(value)));
    const decimals = Math.max(0, digits - 1 - magnitude);
    return value.toFixed(decimals);
}
