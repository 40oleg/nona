// The log-scan case of #387, #388 and #389: a generated log of S(200 000)
// lines (about 11 MB) that a tool would scan with strings and RegExps.
// Each step is timed separately; "check" sums the sizes of the results.
const SCALE = Number(process.env.SCALE) || 1;
const S = (n) => Math.max(1, Math.round(n * SCALE));
const N = S(200000);

const levels = ["INFO", "WARN", "ERROR", "DEBUG"];
const services = ["auth", "billing", "gateway"];
const rows = [];
let seed = 1;
for (let i = 0; i < N; i++) {
    seed = (seed * 69069 + 1) % 4294967296;
    rows.push(
        `2026-10-18T12:00:${String(i % 60).padStart(2, "0")} ${levels[i % 4]} [${services[i % 3]}] request ${seed} took ${i % 997}ms`,
    );
}
const log = rows.join("\n");
let check = log.length;

let t = performance.now();
// #389: a global match with an alternation after the first-unit scan.
const matches = log.match(/(?:ERROR|WARN) \[(?:auth|gateway)\]/g);
check += matches.length;
const tMatch = performance.now() - t;

t = performance.now();
// #387: replaceAll on a large string with many matches.
const replaced = log.replaceAll("request ", "req#");
check += replaced.length;
const tReplaceAll = performance.now() - t;

t = performance.now();
// A capturing RegExp over every line: the durations, summed.
let total = 0;
const re = /took (\d+)ms/g;
let m;
while ((m = re.exec(log)) !== null) total += Number(m[1]);
check += total;
const tExecLoop = performance.now() - t;

t = performance.now();
// split into lines, then indexOf and startsWith filters.
const lines = log.split("\n");
let errors = 0,
    gateway = 0;
for (const line of lines) {
    if (line.indexOf(" ERROR ") !== -1) errors++;
    if (line.endsWith("ms") && line.includes("[gateway]")) gateway++;
}
check += lines.length + errors + gateway;
const tSplitFilter = performance.now() - t;

t = performance.now();
// #388: the default sort of 50 000 strings with long shared prefixes.
const sorted = rows.slice(0, S(50000)).sort();
for (let i = 1; i < sorted.length; i++)
    if (sorted[i - 1] === sorted[i]) check++;
check += sorted.length;
const tSort = performance.now() - t;

t = performance.now();
// Grouping counts into a Map keyed by level and service.
const counts = new Map();
for (const line of lines) {
    const key = line.slice(20, line.indexOf("]") + 1);
    counts.set(key, (counts.get(key) || 0) + 1);
}
check += counts.size;
const tGroup = performance.now() - t;

console.log(
    JSON.stringify({
        match: tMatch,
        replaceAll: tReplaceAll,
        execLoop: tExecLoop,
        splitFilter: tSplitFilter,
        sort: tSort,
        group: tGroup,
        check,
    }),
);
