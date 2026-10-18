// regex-redux from the Computer Language Benchmarks Game, written for this
// repository after the problem description (count nine DNA patterns with
// alternations, then substitute IUB codes and print the lengths). The input
// file is named by INPUT (the output of fasta.js); the game feeds fasta
// N = 5 000 000.
"use strict";
const { readFileSync } = require("node:fs");
const input = readFileSync(process.env.INPUT || "fasta.txt", "utf8");
const sequence = input.replace(/>.*\n|\n/g, "");
const variants = [
    "agggtaaa|tttaccct",
    "[cgt]gggtaaa|tttaccc[acg]",
    "a[act]ggtaaa|tttacc[agt]t",
    "ag[act]gtaaa|tttac[agt]ct",
    "agg[act]taaa|ttta[agt]cct",
    "aggg[acg]aaa|ttt[cgt]ccct",
    "agggt[cgt]aa|tt[acg]accct",
    "agggta[cgt]a|t[acg]taccct",
    "agggtaa[cgt]|[acg]ttaccct",
];
const lines = [];
for (const variant of variants) {
    const matches = sequence.match(new RegExp(variant, "g"));
    lines.push(`${variant} ${matches ? matches.length : 0}`);
}
const substitutions = [
    [/tHa[Nt]/g, "<4>"],
    [/aND|caN|Ha[DS]|WaS/g, "<3>"],
    [/a[NSt]|BY/g, "<2>"],
    [/<[^>]*>/g, "|"],
    [/\|[^|][^|]*\|/g, "-"],
];
let replaced = sequence;
for (const [pattern, replacement] of substitutions)
    replaced = replaced.replace(pattern, replacement);
lines.push("", input.length, sequence.length, replaced.length);
console.log(lines.join("\n"));
