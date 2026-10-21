// fasta from the Computer Language Benchmarks Game, written for this
// repository after the problem description (repeat the ALU sequence, then two
// weighted random sequences with the game's linear congruential generator,
// 60 characters per line). N from the environment (default 250 000; the game
// runs N = 25 000 000). Its output is the input of k-nucleotide,
// reverse-complement and regex-redux.
"use strict";
const n = Number(process.env.N) || 250000;
const alu =
    "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA";
const iub = [
    ["a", 0.27],
    ["c", 0.12],
    ["g", 0.12],
    ["t", 0.27],
    ["B", 0.02],
    ["D", 0.02],
    ["H", 0.02],
    ["K", 0.02],
    ["M", 0.02],
    ["N", 0.02],
    ["R", 0.02],
    ["S", 0.02],
    ["V", 0.02],
    ["W", 0.02],
    ["Y", 0.02],
];
const homoSapiens = [
    ["a", 0.302954942668],
    ["c", 0.1979883004921],
    ["g", 0.1975473066391],
    ["t", 0.3015094502008],
];
const IM = 139968,
    IA = 3877,
    IC = 29573,
    WIDTH = 60;
let last = 42;
const out = [];
function flush() {
    process.stdout.write(out.join(""));
    out.length = 0;
}
function repeat(sequence, count) {
    let k = 0;
    const length = sequence.length;
    while (count > 0) {
        const line = Math.min(WIDTH, count);
        let s = "";
        for (let i = 0; i < line; i++) {
            s += sequence[k];
            if (++k === length) k = 0;
        }
        out.push(s + "\n");
        count -= line;
        if (out.length > 1000) flush();
    }
}
function random(table, count) {
    let cumulative = 0;
    const limits = table.map(([, p]) => (cumulative += p) * IM);
    const chars = table.map(([c]) => c);
    while (count > 0) {
        const line = Math.min(WIDTH, count);
        let s = "";
        for (let i = 0; i < line; i++) {
            last = (last * IA + IC) % IM;
            let j = 0;
            while (limits[j] <= last) j++;
            s += chars[j];
        }
        out.push(s + "\n");
        count -= line;
        if (out.length > 1000) flush();
    }
}
out.push(">ONE Homo sapiens alu\n");
repeat(alu, n * 2);
out.push(">TWO IUB ambiguity codes\n");
random(iub, n * 3);
out.push(">THREE Homo sapiens frequency\n");
random(homoSapiens, n * 5);
flush();
