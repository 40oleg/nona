// k-nucleotide from the Computer Language Benchmarks Game, written for this
// repository after the problem description (count k-mers of sequence THREE of
// a fasta file with a hash table). The input file is named by INPUT (the
// output of fasta.js); the game feeds fasta N = 25 000 000.
"use strict";
const { readFileSync } = require("node:fs");
const text = readFileSync(process.env.INPUT || "fasta.txt", "utf8");
const start = text.indexOf(">THREE");
let end = text.indexOf(">", start + 1);
if (end < 0) end = text.length;
const sequence = text
    .slice(text.indexOf("\n", start) + 1, end)
    .replace(/\n/g, "")
    .toUpperCase();
function frequencies(k) {
    const counts = new Map();
    for (let i = 0; i + k <= sequence.length; i++) {
        const key = sequence.substr(i, k);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
}
function sortedFrequencies(k) {
    const counts = frequencies(k);
    const total = sequence.length - k + 1;
    return [...counts]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([key, count]) => `${key} ${((count * 100) / total).toFixed(3)}`)
        .join("\n");
}
const lines = [sortedFrequencies(1), "", sortedFrequencies(2), ""];
for (const fragment of [
    "GGT",
    "GGTA",
    "GGTATT",
    "GGTATTTTAATT",
    "GGTATTTTAATTTATAGT",
])
    lines.push(
        `${frequencies(fragment.length).get(fragment) || 0}\t${fragment}`,
    );
console.log(lines.join("\n"));
