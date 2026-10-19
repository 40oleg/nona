// Array.prototype.sort and toSorted: the default order on strings (log lines
// sharing long prefixes), on numbers (converted to strings), and with a
// comparator (#388).
const SCALE = Number(process.env.SCALE) || 1;
const N = Math.max(2, Math.round(50000 * SCALE));

const rows = [];
let seed = 1;
for (let i = 0; i < N; i++)
    rows.push(
        `2026-10-18T12:00:00 INFO [svc${(seed = (seed * 69069 + 1) % 4294967296) % 5}] request ${seed}`,
    );
const numbers = rows.map((row, i) => (i * 7919) % 100003);
let check = 0;

let t = performance.now();
const sorted = rows.slice().sort();
for (let i = 1; i < N; i++) if (sorted[i - 1] === sorted[i]) check++;
check += sorted[0].length;
const tSort = performance.now() - t;

t = performance.now();
const byCompare = rows.slice().sort((a, b) => (a < b ? -1 : 1));
check += byCompare[N - 1].length + (byCompare[5] === sorted[5] ? 1 : 0);
const tCompare = performance.now() - t;

t = performance.now();
const copy = rows.toSorted();
check += copy[N >> 1].length + (copy[7] === sorted[7] ? 1 : 0);
const tToSorted = performance.now() - t;

t = performance.now();
check += numbers.slice().sort()[3];
const tNumbers = performance.now() - t;

t = performance.now();
check += numbers.slice().sort((a, b) => a - b)[3];
const tNumericCompare = performance.now() - t;

console.log(
    JSON.stringify({
        sort: tSort,
        compare: tCompare,
        toSorted: tToSorted,
        numbers: tNumbers,
        numericCompare: tNumericCompare,
        check,
    }),
);
