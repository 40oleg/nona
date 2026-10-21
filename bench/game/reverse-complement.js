// reverse-complement from the Computer Language Benchmarks Game, written for
// this repository after the problem description (reverse each fasta sequence
// and complement it with the IUB code table, 60 characters per line). The
// input file is named by INPUT (the output of fasta.js); the game feeds
// fasta N = 25 000 000.
"use strict";
const { readFileSync } = require("node:fs");
const text = readFileSync(process.env.INPUT || "fasta.txt", "utf8");
const from = "ACGTUMRWSYKVHDBNacgtumrwsykvhdbn",
    to = "TGCAAKYWSRMBDHVNTGCAAKYWSRMBDHVN";
const table = new Array(128).fill(0);
for (let i = 0; i < from.length; i++)
    table[from.charCodeAt(i)] = to.charCodeAt(i);
const out = [];
for (const block of text.split(">")) {
    if (!block) continue;
    const newline = block.indexOf("\n");
    const header = block.slice(0, newline);
    const sequence = block.slice(newline + 1).replace(/\n/g, "");
    const bytes = new Uint8Array(sequence.length);
    for (let i = 0, j = sequence.length - 1; j >= 0; i++, j--)
        bytes[i] = table[sequence.charCodeAt(j)];
    const reversed = Buffer.from(bytes.buffer).toString("latin1");
    out.push(">" + header + "\n");
    for (let i = 0; i < reversed.length; i += 60)
        out.push(reversed.slice(i, i + 60) + "\n");
}
process.stdout.write(out.join(""));
