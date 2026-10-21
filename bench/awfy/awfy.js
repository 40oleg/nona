// Driver for the Are-We-Fast-Yet JavaScript benchmarks (Marr, Daloze, Mössenböck,
// DLS 2016; https://github.com/smarr/are-we-fast-yet), fetched into vendor/ by
// `node bench/awfy/fetch.mjs`. The suite's own harness.js reads the benchmark
// name from process.argv[2]; Nona has no script path in argv (argv[1] is the
// first argument), so this driver reads everything from the environment and
// prints one JSON line that bench/report.mjs understands.
//
//   BENCH=Richards ITER=10 node bench/awfy/awfy.js
//
// ITER outer iterations (default 10); each runs the benchmark's standard
// number of inner iterations (rebench.conf of the suite, "extra_args") times
// SCALE (default 1). Per-iteration times in microseconds are printed in
// "iterations" (the JIT warm-up curve), and "check" is true when every
// iteration verified its result as the suite's harness does.
"use strict";
const standard = {
    Bounce: 1500,
    CD: 250,
    DeltaBlue: 12000,
    Havlak: 1500,
    Json: 100,
    List: 1500,
    Mandelbrot: 500,
    NBody: 250000,
    Permute: 1000,
    Queens: 1000,
    Richards: 100,
    Sieve: 3000,
    Storage: 1000,
    Towers: 600,
};
const files = {
    Bounce: "bounce",
    CD: "cd",
    DeltaBlue: "deltablue",
    Havlak: "havlak",
    Json: "json",
    List: "list",
    Mandelbrot: "mandelbrot",
    NBody: "nbody",
    Permute: "permute",
    Queens: "queens",
    Richards: "richards",
    Sieve: "sieve",
    Storage: "storage",
    Towers: "towers",
};
const name = process.env.BENCH || "Queens";
if (!(name in files)) throw new Error("unknown benchmark " + name);
const scale = Number(process.env.SCALE) || 1;
const outer = Number(process.env.ITER) || 10;
const inner = Math.max(1, Math.round(standard[name] * scale));
// Every module is required up front, so the executable holds the whole suite
// and one build serves all 14 benchmarks.
const modules = {
    bounce: require("./vendor/bounce"),
    cd: require("./vendor/cd"),
    deltablue: require("./vendor/deltablue"),
    havlak: require("./vendor/havlak"),
    json: require("./vendor/json"),
    list: require("./vendor/list"),
    mandelbrot: require("./vendor/mandelbrot"),
    nbody: require("./vendor/nbody"),
    permute: require("./vendor/permute"),
    queens: require("./vendor/queens"),
    richards: require("./vendor/richards"),
    sieve: require("./vendor/sieve"),
    storage: require("./vendor/storage"),
    towers: require("./vendor/towers"),
};
const bench = modules[files[name]].newInstance();
const iterations = [];
let check = true;
for (let i = 0; i < outer; i++) {
    const t = process.hrtime();
    if (!bench.innerBenchmarkLoop(inner)) check = false;
    const d = process.hrtime(t);
    iterations.push(Math.round((d[0] * 1e9 + d[1]) / 1000));
}
console.log(JSON.stringify({ name, inner, iterations, check }));
