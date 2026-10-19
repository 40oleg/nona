// String operations whose cost is a scan over code units: equality and
// ordering of long strings, substring search and the scans of split and
// replaceAll. The SIMD work (#253) measures its kernels with this script.
const SCALE = Number(process.env.SCALE) || 1;
const S = (n) => Math.max(1, Math.round(n * SCALE));

// A text of about S(200000) code units: words over a small alphabet, so that
// the first character of a pattern matches often and the rest rarely.
const words = [];
let seed = 7;
const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
for (let i = 0; i < S(40000); i++) {
    let word = "";
    for (let n = 2 + (next() % 6); n > 0; n--)
        word += "abcdeghilmnorstu"[next() % 16];
    words.push(word);
}
const text = words.join(" ");
const unicode = text.split("o").join("ö");
let check = 0;

let t = performance.now();
// Equal and nearly equal long strings, built separately (not the same record).
const left = [],
    right = [];
for (let i = 0; i < 64; i++) {
    left.push(text.slice(i, i + 2000) + i);
    right.push(text.slice(i, i + 2000) + (i % 2 ? i : i + 1));
}
for (let round = 0; round < S(200); round++)
    for (let i = 0; i < 64; i++) {
        if (left[i] === right[i]) check++;
        if (left[i] < right[(i + 1) % 64]) check++;
    }
const tEquals = performance.now() - t;

t = performance.now();
// Searches that scan most of the text.
for (let round = 0; round < S(20); round++) {
    check += text.indexOf("zebra");
    check += text.indexOf("tulip" + round);
    check += text.lastIndexOf("abcab");
    if (text.includes("music")) check++;
    if (unicode.includes("ötö")) check++;
    let at = 0,
        found = 0;
    while ((at = text.indexOf("ma", at)) !== -1) {
        found++;
        at += 2;
    }
    check += found;
}
const tSearch = performance.now() - t;

t = performance.now();
for (let round = 0; round < S(10); round++) {
    check += text.split(" ").length;
    check += text.split("an").length;
    check += text.replaceAll("ou", "OU").length;
    check += unicode.split("ö").length;
}
const tSplit = performance.now() - t;

t = performance.now();
// Map lookups and sorting with long keys that share a prefix.
const keys = [];
for (let i = 0; i < 2000; i++)
    keys.push(text.slice(0, 300) + "#" + ((i * 7919) % 2000));
const map = new Map(keys.map((key, i) => [key, i]));
for (let round = 0; round < S(5); round++) {
    for (const key of keys) check += map.get(key.slice(0)) ?? 0;
    check += [...keys].sort()[0].length;
}
const tKeys = performance.now() - t;

t = performance.now();
// Large text with many matches: a log with S(200000) lines.
let log = "";
for (let i = 0; i < S(200000); i++) {
    log += `line ${i} request ${i} took 1ms\n`;
}
for (let round = 0; round < S(1); round++) {
    check += log.replaceAll("request ", "req#").length;
    check += log.replace(/request /g, "req#").length;
    check += log.split("request ").join("req#").length;
}
const tReplaceAll = performance.now() - t;

console.log(
    JSON.stringify({
        equals: tEquals,
        search: tSearch,
        split: tSplit,
        keys: tKeys,
        replaceAll: tReplaceAll,
        check,
    }),
);
