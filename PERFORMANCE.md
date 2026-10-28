# Performance: Nona vs Node.js, Deno and Bun

The current numbers are [the v0.18.0 section](#current-release-v0180-against-nodejs-deno-and-bun),
measured on 2026-10-18/19 against Node.js, Deno and Bun with the standard
suites (Are-We-Fast-Yet, Benchmarks Game programs), real programs and the
repository's own micro-benchmarks (#392). Older sections keep the date and
version they were measured at (v0.13.0 reusing the 2026-10-14 comparison,
v0.10.0 on 2026-10-08, v0.7.0 on 2026-10-01) and are marked _superseded_. The
scripts live in [`bench/`](bench/); `node bench/report.mjs` reproduces every
table of the current section and `node bench/run.mjs` the older ones (protocol
in [`bench/README.md`](bench/README.md)). The sections after the v0.18.0 one record
targeted measurements of later changes (the comparison with optimized C++ of
#401, #48, #155, #44 and the HTTP server of #403, whose 2026-10-22 section has every case, connection count and generator); the work merged after v0.18.0 is not in its tables.

## Current release (v0.18.0) against Node.js, Deno and Bun

Measured on 2026-10-18/19 at `main` 453418c1 (v0.18.0 plus the merged #356, #357
and #361 work) on a Linux x86-64 cloud VM (Intel Xeon 2.80 GHz, 2 vCPU, 7.8 GB
RAM, kernel 6.18, no cpufreq governor exposed) with Node.js 22.22.0, Deno 2.9.6,
Bun 1.4.2, hyperfine 1.19.0, valgrind 3.22.0 and QEMU 8.2.2. The VM was shared
with other jobs: differences of about ×1.5 or less are within its noise and are
marked ≈ in the tables; every table shows the median and the interquartile
range (IQR) of its runs so that the spread is visible. Every case printed the
same result on all four runtimes (the `check` values and, for whole programs,
the md5 of stdout); no mismatch was found. `node bench/report.mjs` regenerates
every table ([method](#method) below, options in [`bench/README.md`](bench/README.md)).
Only Linux x64 could be measured here: Windows x64, arm64 and macOS numbers
are still to be taken on the owner's machines.

### Summary

The geometric mean of the Nona/Node ratio of the median times, per category
(a ratio below 1 is a Nona win; cases within ×1.5 either way count as noise):

| Category                                                              | Cases | Geomean Nona / Node | Nona faster (>×1.5) | Within noise | Node faster (>×1.5) |
| --------------------------------------------------------------------- | ----- | ------------------- | ------------------- | ------------ | ------------------- |
| Start-up and memory (hello world, lodash loaded, ten corpus programs) | 12    | **×0.1**            | 12                  | 0            | 0                   |
| Compute (calls, numbers, typed arrays)                                | 16    | ×2.1                | 2                   | 4            | 10                  |
| Allocation, objects and collections                                   | 10    | ×2.4                | 0                   | 1            | 9                   |
| Strings, RegExp and JSON                                              | 20    | ×4.5                | 0                   | 6            | 14                  |
| I/O and the event loop                                                | 5     | ×2.8                | 0                   | 2            | 3                   |
| Real programs (acorn, marked, lodash, Prettier)                       | 9     | ×11                 | 0                   | 0            | 9                   |
| Are-We-Fast-Yet, steady state (14 benchmarks)                         | 14    | ×13                 | 0                   | 0            | 14                  |
| Benchmarks Game, whole process (9 programs)                           | 9     | ×11                 | 0                   | 0            | 9                   |

Over the 83 timed cases that are not start-up, the geometric mean is ×5.1.
Peak memory is 1–15 MB for Nona's small programs against 45–60 MB for Node.js,
but allocation-heavy programs (`json-big`, `reverse-complement`,
`regex-redux`) use 1.5–3× more memory under Nona than under Node.js. HTTP
throughput is at Node's level (below).

In one sentence: Nona wins by an order of magnitude wherever a program is
short — start-up, memory, size — and loses by ×2–×4 on simple loops and
collections, by ×10–×30 on the object-oriented workloads of Are-We-Fast-Yet
and on real libraries, and by ×60–×350 wherever the RegExp engine is on the
hot path. The [analysis](#where-nona-stands) names the causes.

### Start-up, executable size, build time, memory

Hello world: start-up is the median (IQR) of 30 runs after 5 warm-ups with
hyperfine (`-N`, no shell); peak RSS from GNU time, median of 5 runs; build
time with the on-disk runtime cache warm (a cold build also compiles the
runtime and preludes once, about 3 s).

| How the program runs       | Start-up, ms     | Executable, MB | Build, s | Peak RSS, MB |
| -------------------------- | ---------------- | -------------- | -------- | ------------ |
| Nona, compiled ELF         | 1.31 (1.19–1.36) | 1.07           | 0.530    | 1.05         |
| Bun, `bun build --compile` | 4.74 (4.61–5.01) | 77.5           | 0.199    | 14.5         |
| Bun, `bun x.js`            | 5.31 (4.83–6.19) | (the runtime)  | —        | 13.8         |
| Deno, `deno run x.js`      | 17.5 (17.0–18.9) | (the runtime)  | —        | 28.5         |
| Node, `node x.js`          | 38.0 (36.0–45.1) | (the runtime)  | —        | 44.6         |

A mid-size program: lodash 4.17.21 (17 000 lines) loaded and one function
called ([`bench/startup/lodash-hello.mjs`](bench/startup/lodash-hello.mjs)).
Nona links everything lodash can reach, so the executable grows to 16 MB and
the build takes 11 s; Deno fails because it does not give a default export to a
CommonJS `.js` file without a `"type"` in its package.json.

| How the program runs       | Start-up, ms     | Executable, MB | Build, s | Peak RSS, MB |
| -------------------------- | ---------------- | -------------- | -------- | ------------ |
| Nona, compiled ELF         | 15.3 (14.7–16.3) | 15.9           | 11.1     | 18.9         |
| Bun, `bun build --compile` | 19.9 (17.2–25.2) | 77.7           | 0.207    | 32.5         |
| Bun, `bun x.js`            | 23.6 (21.9–26.0) | (the runtime)  | —        | 35.7         |
| Deno, `deno run x.js`      | fails (see note) | (the runtime)  | —        | —            |
| Node, `node x.js`          | 79.9 (76.6–86.1) | (the runtime)  | —        | 56.9         |

`deno compile` and Node SEA were not measured (the v0.7.0 table below has
both: 104 MB and 124 MB).

Ten programs of the [program corpus](programs/README.md) (complete small
applications), whole-process wall time, median (IQR) of 10 runs, ms; stdout
compared between runtimes:

| Program                   | Node, ms         | Deno, ms         | Bun, ms          | Nona, ms         | Node RSS, MB | Deno RSS, MB | Bun RSS, MB | Nona RSS, MB | Nona / Node |
| ------------------------- | ---------------- | ---------------- | ---------------- | ---------------- | ------------ | ------------ | ----------- | ------------ | ----------- |
| `001-insertion-sort`      | 45.8 (44.4–51.5) | 22.6 (22.0–26.4) | 9.30 (9.10–9.52) | 4.25 (4.13–4.70) | 44.6         | 29.0         | 16.1        | 1.11         | ×0.1        |
| `002-binary-search`       | 51.5 (46.6–59.5) | 24.6 (22.2–26.5) | 12.4 (12.0–12.7) | 4.90 (4.35–5.33) | 44.6         | 29.1         | 16.0        | 1.11         | ×0.1        |
| `003-prime-sieve`         | 55.5 (49.1–61.0) | 27.9 (23.3–31.0) | 10.6 (9.82–11.8) | 4.30 (3.85–4.67) | 44.6         | 29.8         | 16.1        | 1.11         | ×0.1        |
| `004-closure-accounts`    | 45.3 (44.5–47.1) | 24.8 (23.0–26.1) | 9.05 (8.80–9.27) | 3.75 (3.60–3.88) | 44.6         | 29.3         | 17.4        | 1.19         | ×0.1        |
| `005-expression-parser`   | 43.7 (41.7–46.7) | 24.8 (21.9–27.4) | 9.60 (9.20–12.1) | 5.30 (4.88–5.50) | 44.6         | 30.0         | 17.6        | 1.18         | ×0.1        |
| `006-tree-traversal`      | 48.3 (45.2–52.2) | 25.7 (23.8–29.9) | 12.3 (11.3–13.4) | 5.05 (5.00–5.40) | 44.6         | 29.6         | 19.6        | 1.30         | ×0.1        |
| `007-shortest-path`       | 47.4 (46.4–48.3) | 23.4 (22.7–25.0) | 10.7 (10.1–11.4) | 5.50 (5.13–5.78) | 44.6         | 29.7         | 17.1        | 1.30         | ×0.1        |
| `008-matrix-multiply`     | 50.5 (46.4–57.8) | 23.4 (23.2–26.3) | 10.1 (9.90–10.4) | 4.90 (4.25–5.40) | 44.6         | 29.6         | 17.5        | 1.59         | ×0.1        |
| `009-run-length-encoding` | 48.2 (46.5–50.7) | 27.7 (24.8–30.8) | 9.95 (9.68–10.7) | 4.80 (4.53–5.65) | 44.6         | 30.3         | 18.5        | 1.30         | ×0.1        |
| `010-exception-cleanup`   | 58.8 (56.6–61.1) | 30.8 (30.1–31.1) | 11.1 (11.0–12.0) | 5.30 (4.67–6.05) | 44.6         | 29.4         | 17.6        | 1.23         | ×0.1        |

### Micro-benchmarks

`node bench/report.mjs --suite micro --scale 0.1 --runs 10`: median (IQR) of
10 runs, ms, one process per run after one untimed warm-up run. `--scale 0.1`
is the N = 100 000 of the array, object, call and class rows.

| Operation                                            | Node                | Deno                | Bun                    | Nona                | Nona / Node |
| ---------------------------------------------------- | ------------------- | ------------------- | ---------------------- | ------------------- | ----------- |
| `push` × N                                           | 4.63 (4.47–5.44)    | 4.43 (3.85–4.95)    | 3.12 (3.00–3.81)       | 4.56 (4.47–4.65)    | ≈×1.0       |
| `Array.from({length: N})`                            | 6.13 (5.67–8.55)    | 5.98 (5.76–7.68)    | 3.09 (2.94–3.36)       | 31.4 (31.0–31.6)    | ×5.1        |
| `new Array(N)` + fill                                | 1.85 (1.62–2.41)    | 1.20 (1.04–1.27)    | 1.54 (1.30–1.90)       | 2.79 (2.75–2.84)    | ×1.5        |
| Sum with a `for` loop                                | 2.15 (1.64–2.38)    | 1.44 (1.30–1.75)    | 0.680 (0.671–0.698)    | 0.861 (0.844–0.884) | ×0.4        |
| `map` → `filter` → `reduce`                          | 4.45 (4.29–5.42)    | 4.35 (3.86–4.81)    | 3.86 (3.54–4.09)       | 10.6 (10.5–11.0)    | ×2.4        |
| `sort` N numbers with a comparator                   | 58.3 (58.2–59.3)    | 47.0 (44.2–57.9)    | 34.2 (33.6–35.7)       | 104 (101–120)       | ×1.8        |
| Create N objects `{id, x, y, name}`                  | 13.8 (13.1–14.6)    | 11.9 (10.4–14.1)    | 9.51 (8.83–12.2)       | 23.3 (21.7–26.8)    | ×1.7        |
| Read 3 properties × N                                | 7.35 (6.37–8.09)    | 7.72 (6.95–8.88)    | 1.31 (1.16–1.77)       | 3.03 (2.79–3.72)    | ×0.4        |
| `Map.set` × N                                        | 14.3 (14.1–14.9)    | 14.5 (12.3–16.7)    | 17.7 (15.3–19.5)       | 35.3 (32.2–43.0)    | ×2.5        |
| `Map.get` × N                                        | 5.27 (5.03–5.56)    | 6.65 (4.73–7.14)    | 4.52 (3.88–8.79)       | 17.2 (14.7–19.2)    | ×3.3        |
| `Set.add` + `Set.has` × N                            | 12.5 (12.2–13.1)    | 11.1 (10.5–13.1)    | 13.7 (13.3–16.6)       | 35.8 (33.3–38.0)    | ×2.9        |
| `s += "abc" + i` × 20 000                            | 6.69 (5.56–8.05)    | 3.93 (3.76–5.48)    | 5.02 (4.44–5.55)       | 4.83 (4.71–5.49)    | ≈×0.7       |
| `split("1")` + `join("-")`                           | 2.17 (1.80–2.29)    | 2.84 (2.56–3.76)    | 3.89 (3.44–5.35)       | 6.54 (6.23–6.98)    | ×3.0        |
| `indexOf` in a loop                                  | 0.193 (0.189–0.215) | 0.248 (0.205–0.321) | 0.106 (0.0951–0.138)   | 0.226 (0.222–0.282) | ≈×1.2       |
| `/abc(\d{3})-/g.exec` in a loop                      | 0.285 (0.268–0.331) | 0.324 (0.274–0.435) | 0.277 (0.243–0.326)    | 33.2 (31.9–40.0)    | ×117        |
| `fib(32)` recursive                                  | 45.0 (27.8–56.7)    | 26.6 (25.8–27.9)    | 19.3 (18.4–24.1)       | 89.6 (88.2–106)     | ×2.0        |
| 200×200 matrix multiply                              | 46.1 (35.8–53.3)    | 38.1 (31.9–42.2)    | 39.1 (35.1–44.9)       | 176 (166–210)       | ×3.8        |
| BigInt factorial 3000!                               | 0.242 (0.200–0.252) | 0.322 (0.203–0.402) | 0.502 (0.369–0.584)    | 0.888 (0.887–0.955) | ×3.7        |
| 5M short-lived objects                               | 16.1 (15.5–17.9)    | 14.0 (13.4–14.9)    | 21.0 (19.4–22.5)       | 68.3 (67.3–79.1)    | ×4.2        |
| Promise chain, `.then` × 100 000                     | 32.2 (30.2–41.1)    | 40.6 (38.5–41.6)    | 18.2 (16.5–19.7)       | 322 (309–348)       | ×10.0       |
| 10 000 sequential `setTimeout(fn, 0)`                | 1 125 (1 120–1 128) | 2 155 (2 149–2 158) | 1 130 (1 128–1 137)    | 1 145 (1 142–1 147) | ≈×1.0       |
| `JSON.stringify`, 30 000 objects                     | 21.4 (18.6–32.9)    | 11.0 (10.3–16.6)    | 10.8 (10.4–12.6)       | 31.7 (31.1–32.2)    | ≈×1.5       |
| `JSON.parse`, 2.9 MB                                 | 39.4 (34.3–58.9)    | 32.0 (31.0–47.6)    | 23.9 (22.6–26.3)       | 32.9 (32.6–35.3)    | ≈×0.8       |
| `writeFileSync` × 10 of 1 MB chunks (SCALE × 100 MB) | 5.93 (5.77–6.08)    | 10.5 (10.3–10.7)    | 3.80 (3.47–4.14)       | 45.4 (44.4–47.6)    | ×7.6        |
| `readFileSync` of the same file                      | 23.9 (23.3–24.4)    | 23.9 (23.3–24.5)    | 6.73 (6.37–7.88)       | 48.5 (48.1–49.9)    | ×2.0        |
| `Float64Array`: fill, sum, map, 1M                   | 19.5 (17.5–23.1)    | 19.0 (14.9–22.5)    | 19.4 (18.5–20.0)       | 46.9 (45.6–49.2)    | ×2.4        |
| Call `add(a, b)` × 10N                               | 5.81 (4.92–7.06)    | 8.01 (5.93–10.2)    | 7.04 (6.74–7.77)       | 47.3 (46.5–51.0)    | ×8.1        |
| Create and call N closures                           | 24.6 (23.8–26.4)    | 19.9 (18.0–24.7)    | 23.4 (21.9–27.0)       | 78.9 (77.7–90.9)    | ×3.2        |
| `call` + `apply` × 4N                                | 11.8 (10.8–12.1)    | 12.3 (10.5–13.8)    | 6.71 (6.18–8.56)       | 75.9 (74.1–80.1)    | ×6.4        |
| Method through an inheritance chain                  | 5.51 (5.07–6.06)    | 4.85 (4.02–5.97)    | 5.41 (4.81–5.96)       | 34.6 (34.2–35.5)    | ×6.3        |
| Polymorphic call, 3 classes                          | 6.40 (5.69–7.34)    | 9.46 (7.27–11.7)    | 15.8 (15.2–18.5)       | 47.3 (46.5–48.1)    | ×7.4        |
| `new Square(i)` × N                                  | 16.1 (15.2–21.4)    | 9.56 (7.94–9.85)    | 15.5 (14.3–17.0)       | 35.6 (35.1–36.5)    | ×2.2        |
| Long-string equality                                 | 0.392 (0.361–0.542) | 0.549 (0.406–0.950) | 0.500 (0.472–0.520)    | 0.939 (0.909–0.969) | ×2.4        |
| Substring search                                     | 0.107 (0.102–0.137) | 0.125 (0.107–0.154) | 0.0775 (0.0765–0.0818) | 0.340 (0.312–0.350) | ×3.2        |
| `split`/`replaceAll`                                 | 0.307 (0.300–0.332) | 0.374 (0.332–0.479) | 0.257 (0.246–0.273)    | 0.599 (0.540–0.673) | ×2.0        |
| Long `Map` keys                                      | 4.53 (4.35–4.97)    | 4.66 (3.91–6.20)    | 4.95 (4.75–5.07)       | 14.7 (14.4–15.1)    | ×3.2        |
| Typed array `fill`                                   | 0.770 (0.713–0.999) | 0.673 (0.647–0.772) | 0.838 (0.783–0.977)    | 0.766 (0.747–0.783) | ≈×1.0       |
| Typed array `copyWithin`/`set`                       | 2.13 (2.01–2.95)    | 2.20 (2.15–2.41)    | 3.10 (2.95–3.93)       | 2.82 (2.80–2.84)    | ≈×1.3       |
| Typed array searches                                 | 5.24 (5.18–10.5)    | 3.70 (3.65–3.84)    | 2.76 (2.64–4.63)       | 4.23 (4.20–4.30)    | ≈×0.8       |
| Typed array loops                                    | 5.82 (5.05–6.96)    | 2.95 (2.79–3.08)    | 3.29 (3.01–4.05)       | 5.96 (5.88–6.01)    | ≈×1.0       |

Whole scripts, wall time including start-up (median and IQR, s) and peak RSS
(median, MB). The short scripts favour Nona, whose executables start in about
1 ms against 18–40 ms for Deno and Node.

| Script            | Node, s                | Deno, s                | Bun, s                 | Nona, s                | Node RSS, MB | Deno RSS, MB | Bun RSS, MB | Nona RSS, MB | Nona / Node |
| ----------------- | ---------------------- | ---------------------- | ---------------------- | ---------------------- | ------------ | ------------ | ----------- | ------------ | ----------- |
| `05_array`        | 0.126 (0.123–0.145)    | 0.108 (0.103–0.123)    | 0.0611 (0.0585–0.0683) | 0.171 (0.163–0.182)    | 62.8         | 52.2         | 40.2        | 33.7         | ≈×1.4       |
| `06_objects`      | 0.105 (0.103–0.106)    | 0.0963 (0.0885–0.110)  | 0.0653 (0.0572–0.0746) | 0.130 (0.127–0.144)    | 74.2         | 66.2         | 52.3        | 49.2         | ≈×1.2       |
| `07_strings`      | 0.0592 (0.0564–0.0717) | 0.0470 (0.0460–0.0639) | 0.0217 (0.0193–0.0285) | 0.0580 (0.0545–0.0641) | 53.4         | 43.3         | 36.2        | 12.8         | ≈×1.0       |
| `08_numeric`      | 0.150 (0.130–0.170)    | 0.105 (0.0996–0.112)   | 0.0695 (0.0651–0.0808) | 0.289 (0.269–0.333)    | 53.2         | 43.9         | 35.2        | 10.2         | ×1.9        |
| `09_gc`           | 0.0654 (0.0609–0.0725) | 0.0515 (0.0498–0.0538) | 0.0314 (0.0306–0.0333) | 0.0776 (0.0763–0.0895) | 51.8         | 44.0         | 32.6        | 12.4         | ≈×1.2       |
| `10_async`        | 1.22 (1.21–1.24)       | 2.24 (2.24–2.25)       | 1.16 (1.16–1.17)       | 1.50 (1.49–1.52)       | 68.8         | 73.3         | 37.0        | 121          | ≈×1.2       |
| `11_json`         | 0.159 (0.129–0.169)    | 0.119 (0.104–0.132)    | 0.0599 (0.0570–0.0617) | 0.104 (0.102–0.109)    | 71.5         | 62.2         | 51.5        | 57.8         | ×0.7        |
| `12_fs`           | 0.0813 (0.0791–0.0828) | 0.0852 (0.0834–0.0938) | 0.0282 (0.0267–0.0297) | 0.108 (0.106–0.110)    | 69.6         | 71.2         | 33.9        | 53.0         | ≈×1.3       |
| `13_typed`        | 0.0757 (0.0687–0.0822) | 0.0612 (0.0566–0.0643) | 0.0320 (0.0316–0.0326) | 0.0566 (0.0557–0.0595) | 66.9         | 59.7         | 47.2        | 20.4         | ≈×0.7       |
| `14_calls`        | 0.0977 (0.0909–0.111)  | 0.0856 (0.0779–0.0994) | 0.0498 (0.0473–0.0553) | 0.238 (0.227–0.252)    | 71.5         | 62.8         | 41.7        | 112          | ×2.4        |
| `15_classes`      | 0.0811 (0.0784–0.0909) | 0.0673 (0.0621–0.0734) | 0.0491 (0.0457–0.0512) | 0.130 (0.129–0.131)    | 58.8         | 47.6         | 40.8        | 26.1         | ×1.6        |
| `16_string_scan`  | 0.0557 (0.0549–0.0580) | 0.0585 (0.0537–0.0629) | 0.0207 (0.0203–0.0219) | 0.0299 (0.0295–0.0338) | 52.6         | 42.7         | 35.1        | 12.3         | ×0.5        |
| `17_typed_arrays` | 0.0750 (0.0691–0.0940) | 0.0530 (0.0523–0.0559) | 0.0269 (0.0257–0.0295) | 0.0268 (0.0266–0.0271) | 53.8         | 46.1         | 31.5        | 7.83         | ×0.4        |

### Real programs

`node bench/report.mjs --suite real --runs 5`: median (IQR) of 5 runs, ms
(libraries fetched by `node bench/real/fetch.mjs`, versions pinned there).
`log-scan` is the string/RegExp case of #387–#389 (a generated 11 MB log of
200 000 lines); `json-big` writes and reads a generated 20 MB JSON file. Deno
cannot import lodash's CommonJS file (see above).

| Operation                                             | Node             | Deno             | Bun              | Nona                   | Nona / Node |
| ----------------------------------------------------- | ---------------- | ---------------- | ---------------- | ---------------------- | ----------- |
| acorn 8.18.0: first parse of its own 230 KB           | 168 (162–172)    | 85.1 (83.2–87.7) | 111 (107–127)    | 796 (793–815)          | ×4.7        |
| acorn: 10 more parses                                 | 338 (321–344)    | 272 (262–279)    | 339 (331–362)    | 6 152 (6 026–6 302)    | ×18         |
| marked 12.0.2: first render                           | 32.7 (31.1–35.4) | 34.4 (33.5–38.7) | 28.8 (27.1–29.9) | 874 (811–895)          | ×27         |
| marked: 5 more renders                                | 96.8 (90.6–98.0) | 47.6 (45.1–47.7) | 59.9 (53.5–62.1) | 4 306 (4 128–4 308)    | ×45         |
| lodash 4.17.21: groupBy/sortBy/uniqBy, 50 000 records | 105 (101–106)    | —                | 108 (103–114)    | 771 (712–799)          | ×7.4        |
| lodash: chunk/sumBy/countBy/pick                      | 99.7 (99.6–110)  | —                | 70.3 (69.9–73.0) | 3 868 (3 850–4 048)    | ×39         |
| lodash: camelCase/kebabCase/capitalize × 150 000      | 135 (128–164)    | —                | 130 (125–134)    | 47 851 (47 418–48 734) | ×355        |
| lodash: cloneDeep/isEqual/merge, 10 000 records       | 156 (149–167)    | —                | 112 (108–126)    | 686 (681–709)          | ×4.4        |
| Prettier 3.6.2: first format of 2 000 lines           | 508 (470–514)    | 349 (326–364)    | 602 (535–602)    | 1 770 (1 690–1 859)    | ×3.5        |
| Prettier: 3 more formats                              | 851 (837–869)    | 573 (497–584)    | 782 (774–782)    | 5 067 (4 936–5 289)    | ×6.0        |
| log-scan: `match` with an alternation, 11 MB (#389)   | 6.72 (6.71–6.76) | 9.14 (8.90–9.52) | 5.29 (5.13–5.63) | 654 (653–656)          | ×97         |
| log-scan: `replaceAll`, 200 000 matches (#387)        | 176 (173–192)    | 13.1 (9.43–13.7) | 15.1 (15.0–20.9) | 612 (612–612)          | ×3.5        |
| log-scan: capturing `exec` loop over 200 000 lines    | 30.9 (29.8–31.0) | 30.3 (28.9–57.8) | 22.9 (22.7–25.4) | 1 969 (1 903–2 033)    | ×64         |
| log-scan: `split` + `indexOf`/`includes` filters      | 25.9 (25.3–26.3) | 44.5 (40.4–45.9) | 28.6 (28.3–28.7) | 71.8 (71.7–88.9)       | ×2.8        |
| log-scan: default `sort` of 50 000 strings (#388)     | 41.3 (41.0–41.4) | 35.9 (35.6–36.8) | 28.4 (28.0–28.4) | 329 (326–334)          | ×8.0        |
| log-scan: `slice` keys into a `Map`                   | 53.0 (52.3–53.5) | 26.3 (26.0–26.5) | 34.8 (34.6–35.9) | 60.8 (60.4–61.0)       | ≈×1.1       |
| JSON: `stringify` 100 000 records (20 MB)             | 177 (170–211)    | 200 (170–207)    | 104 (101–106)    | 349 (328–353)          | ×2.0        |
| JSON: read the 20 MB file                             | 131 (131–135)    | 99.5 (97.1–102)  | 30.9 (30.8–32.7) | 145 (138–150)          | ≈×1.1       |
| JSON: `parse` 20 MB                                   | 384 (254–386)    | 252 (239–258)    | 237 (220–239)    | 353 (352–366)          | ≈×0.9       |
| JSON: `stringify(…, null, 2)`                         | 228 (218–250)    | 229 (224–232)    | 124 (116–130)    | 378 (359–403)          | ×1.7        |

Whole scripts, wall time (s) and peak RSS (MB):

| Script     | Node, s             | Deno, s             | Bun, s               | Nona, s          | Node RSS, MB | Deno RSS, MB | Bun RSS, MB | Nona RSS, MB | Nona / Node |
| ---------- | ------------------- | ------------------- | -------------------- | ---------------- | ------------ | ------------ | ----------- | ------------ | ----------- |
| `acorn`    | 0.565 (0.562–0.589) | 0.426 (0.413–0.436) | 0.488 (0.464–0.522)  | 7.00 (6.90–7.15) | 109          | 119          | 78.6        | 92.5         | ×12         |
| `marked`   | 0.183 (0.181–0.184) | 0.128 (0.127–0.136) | 0.104 (0.0979–0.106) | 5.15 (5.00–5.22) | 66.3         | 57.4         | 48.4        | 38.1         | ×28         |
| `lodash`   | 0.681 (0.631–0.730) | —                   | 0.523 (0.507–0.562)  | 53.3 (52.9–54.4) | 121          | —            | 131         | 222          | ×78         |
| `prettier` | 1.45 (1.41–1.47)    | 0.985 (0.892–1.02)  | 1.42 (1.37–1.43)     | 6.84 (6.78–7.07) | 157          | 194          | 139         | 170          | ×4.7        |
| `log-scan` | 0.642 (0.632–0.671) | 0.513 (0.484–0.519) | 0.284 (0.277–0.296)  | 4.24 (4.16–4.25) | 205          | 207          | 138         | 288          | ×6.6        |
| `json-big` | 1.25 (1.25–1.26)    | 1.11 (1.11–1.11)    | 0.707 (0.702–0.714)  | 2.70 (2.69–2.73) | 384          | 406          | 348         | 770          | ×2.2        |

### Are-We-Fast-Yet

`node bench/report.mjs --suite awfy --iterations 10`: the 14 JavaScript
benchmarks of [Are-We-Fast-Yet](https://github.com/smarr/are-we-fast-yet)
(Marr, Daloze, Mössenböck, DLS 2016; revision `74306fe`, fetched by
`node bench/awfy/fetch.mjs`), unchanged, with the suite's standard
inner-iteration counts, 10 timed iterations in one process per runtime, as
the suite's own harness does. "First" is iteration 1 (cold: a JIT is still
compiling), "steady" the median of iterations 4–10. Every iteration verified
its result. The suite compiles to one 15.4 MB executable in 9.4 s.

| Benchmark (inner iterations) | Node first, ms | Deno first, ms | Bun first, ms | Nona first, ms | Node steady, ms | Deno steady, ms | Bun steady, ms | Nona steady, ms | Nona / Node steady | Nona / Node first |
| ---------------------------- | -------------- | -------------- | ------------- | -------------- | --------------- | --------------- | -------------- | --------------- | ------------------ | ----------------- |
| DeltaBlue (12000)            | 222            | 128            | 200           | 719            | 46.3            | 48.6            | 79.1           | 772             | ×17                | ×3.2              |
| Richards (100)               | 173            | 173            | 142           | 2 662          | 142             | 131             | 121            | 2 543           | ×18                | ×15               |
| Json (100)                   | 129            | 80.7           | 162           | 871            | 59.1            | 56.7            | 72.4           | 865             | ×15                | ×6.8              |
| CD (250)                     | 229            | 153            | 239           | 1 319          | 128             | 102             | 146            | 1 351           | ×11                | ×5.8              |
| Havlak (1500)                | 295            | 288            | 393           | 5 347          | 196             | 164             | 339            | 5 573           | ×28                | ×18               |
| Bounce (1500)                | 46.9           | 44.3           | 52.9          | 1 086          | 29.6            | 36.1            | 35.7           | 966             | ×33                | ×23               |
| List (1500)                  | 51.5           | 47.4           | 48.5          | 511            | 48.8            | 46.1            | 43.8           | 472             | ×9.7               | ×9.9              |
| Mandelbrot (500)             | 67.7           | 67.6           | 57.0          | 154            | 60.2            | 58.0            | 56.8           | 151             | ×2.5               | ×2.3              |
| NBody (250000)               | 38.4           | 52.3           | 44.7          | 1 501          | 25.7            | 25.8            | 34.5           | 854             | ×33                | ×39               |
| Permute (1000)               | 49.2           | 64.5           | 53.2          | 678            | 48.6            | 49.0            | 50.5           | 708             | ×15                | ×14               |
| Queens (1000)                | 55.6           | 66.1           | 46.5          | 479            | 39.7            | 38.9            | 45.7           | 481             | ×12                | ×8.6              |
| Sieve (3000)                 | 95.3           | 93.3           | 105           | 694            | 90.5            | 63.9            | 94.2           | 617             | ×6.8               | ×7.3              |
| Storage (1000)               | 162            | 105            | 342           | 1 838          | 139             | 103             | 350            | 1 705           | ×12                | ×11               |
| Towers (600)                 | 55.7           | 52.7           | 59.4          | 673            | 52.6            | 50.2            | 37.6           | 627             | ×12                | ×12               |

Warm-up curve, iterations 1–6, ms (Node.js then Nona). Node's first iteration
is 1.3–5× slower than its steady state (DeltaBlue: 222 → 43 ms); Nona has no
JIT and runs iteration 1 at the speed of iteration 10, except where the first
iteration grows the heap (NBody: 1 501 → 800 ms, see the analysis).

| Benchmark | Node 1 | Node 2 | Node 3 | Node 4 | Node 5 | Node 6 | Nona 1 | Nona 2 | Nona 3 | Nona 4 | Nona 5 | Nona 6 |
| --------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| DeltaBlue | 222    | 109    | 64.0   | 42.7   | 38.0   | 53.1   | 719    | 656    | 736    | 786    | 837    | 715    |
| Richards  | 173    | 155    | 146    | 139    | 142    | 134    | 2 662  | 2 573  | 2 765  | 2 546  | 2 658  | 2 448  |
| Json      | 129    | 60.1   | 57.8   | 61.6   | 60.1   | 59.2   | 871    | 860    | 799    | 925    | 866    | 781    |
| Havlak    | 295    | 253    | 201    | 202    | 242    | 196    | 5 347  | 6 037  | 5 771  | 6 015  | 5 779  | 5 543  |
| NBody     | 38.4   | 25.2   | 25.4   | 25.7   | 27.1   | 26.3   | 1 501  | 798    | 815    | 861    | 1 020  | 836    |

### Benchmarks Game

`node bench/report.mjs --suite game --runs 5`: nine programs in
[`bench/game/`](bench/game/) written for this repository after the problem
descriptions of the [Computer Language Benchmarks Game](https://benchmarksgame-team.pages.debian.net/benchmarksgame/)
(single-threaded, sizes reduced from the game's so that a run takes seconds;
the game's own programs are hosted on salsa.debian.org, which the reference VM
cannot reach, and its fastest JavaScript entries use worker threads). As in
the game, the time is the whole process including start-up, median (IQR) of
5 runs, s, with peak RSS in MB. The outputs of all four runtimes were compared
byte for byte (k-nucleotide, reverse-complement and regex-redux read the output
of fasta for N = 250 000, 2.5 MB).

| Program (size)                           | Node, s             | Deno, s             | Bun, s                 | Nona, s          | Node RSS, MB | Deno RSS, MB | Bun RSS, MB | Nona RSS, MB | Nona / Node |
| ---------------------------------------- | ------------------- | ------------------- | ---------------------- | ---------------- | ------------ | ------------ | ----------- | ------------ | ----------- |
| binary-trees (N=16)                      | 0.314 (0.307–0.325) | 0.412 (0.405–0.453) | 0.285 (0.281–0.324)    | 2.41 (2.33–2.44) | 96.1         | 152          | 66.8        | 97.0         | ×7.7        |
| fannkuch-redux (N=10)                    | 0.431 (0.419–0.434) | 0.434 (0.429–0.463) | 0.289 (0.282–0.292)    | 2.24 (2.13–2.27) | 48.8         | 44.0         | 30.9        | 13.6         | ×5.2        |
| fasta (N=1000000)                        | 0.507 (0.486–0.510) | 0.457 (0.444–0.467) | 0.594 (0.562–0.610)    | 1.49 (1.45–1.55) | 82.7         | 76.9         | 49.3        | 35.1         | ×2.9        |
| k-nucleotide (INPUT=fasta 250 000)       | 1.21 (1.18–1.31)    | 1.81 (1.76–1.81)    | 1.16 (1.12–1.26)       | 15.4 (15.3–16.1) | 111          | 117          | 102         | 129          | ×13         |
| mandelbrot (N=2000)                      | 0.459 (0.459–0.463) | 0.460 (0.450–0.464) | 0.442 (0.441–0.447)    | 1.18 (1.08–1.29) | 50.9         | 47.9         | 33.9        | 14.3         | ×2.6        |
| n-body (N=1000000)                       | 0.174 (0.170–0.214) | 0.156 (0.156–0.166) | 0.164 (0.162–0.178)    | 6.51 (6.50–6.73) | 50.8         | 46.6         | 32.7        | 20.1         | ×37         |
| spectral-norm (N=2000)                   | 0.426 (0.426–0.524) | 1.48 (1.45–1.55)    | 0.514 (0.494–0.520)    | 6.01 (5.68–6.16) | 51.2         | 47.3         | 29.7        | 13.4         | ×14         |
| reverse-complement (INPUT=fasta 250 000) | 0.108 (0.107–0.110) | 0.107 (0.105–0.107) | 0.0742 (0.0712–0.0822) | 1.57 (1.51–1.59) | 69.1         | 66.8         | 55.8        | 229          | ×15         |
| regex-redux (INPUT=fasta 250 000)        | 0.241 (0.234–0.242) | 0.205 (0.192–0.215) | 0.0737 (0.0695–0.0775) | 24.7 (24.5–25.0) | 102          | 88.4         | 47.0        | 337          | ×102        |

### HTTP server

Superseded for the HTTP cases by [the 2026-10-22 measurement](#2026-10-22-403-commit-93e6d9e3) (#403).

[`bench/http/run.sh`](bench/http/run.sh) (`SECS=4`), the same `node:http`
server compiled by Nona and run by Node.js, 50 keep-alive or one-shot
connections, two runs on this VM (server on CPU 0, load generator on CPU 1,
both shared with other jobs, so the absolute numbers are about half of the
v0.9.0 measurement on an idle machine):

| Case                       | Node.js req/s | Nona req/s     | p99 latency, Node / Nona | RSS, Node / Nona |
| -------------------------- | ------------- | -------------- | ------------------------ | ---------------- |
| hello (keep-alive)         | 40.6–41.4k    | 38.7–39.4k     | 3.2 / 2.9–3.2 ms         | 73 / 17 MB       |
| JSON response              | 39.6–41.3k    | 35.7–40.0k     | 2.7–3.2 / 2.4–3.4 ms     | 75 / 16 MB       |
| new connection per request | 12.1–12.6k    | 12.9–13.3k     | 11.6–12.1 / 6.8–7.7 ms   | 70 / 23 MB       |
| 64 KiB response            | 13.0–14.8k    | **23.2–26.7k** | 9.0–10.3 / 3.6–4.7 ms    | 78 / 17 MB       |
| 16 KiB request body        | 38.3–38.4k    | 19.6–21.9k     | 2.7–2.8 / 4.5–4.8 ms     | 79 / 19 MB       |

### Instruction counts and profiles

`node bench/report.mjs --suite profile`: instructions executed, millions.
Nona's counts come from QEMU's execution trace ([`scripts/profile-runtime.mjs`](scripts/profile-runtime.mjs),
exact, with the routine families and single routines that executed most of
them); Node's from `valgrind --tool=callgrind` of the whole process, minus
its hello-world start-up (149 M instructions; Nona's is 1.15 M). The scales
are small to keep the traces bounded (about 20 bytes per instruction), which
means Node.js is still in its interpreter and baseline compiler here, so these
ratios are upper bounds for its optimized code and say nothing about the
wall-time ratios above; they are listed for what they show about Nona.

| Case                                  | Node, M instr. | Nona, M instr. | Nona / Node (minus start-up) | Nona: routine families                                                          | Nona: top routines                                                                                          |
| ------------------------------------- | -------------- | -------------- | ---------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `01_hello`                            | 149            | 1.15           | —                            | property access 41%, allocation 5%                                              | `rt.findOwnProperty` 15%, `rt.hasProperty` 7%, `rt.lookupProperty` 7%                                       |
| `07_strings` (SCALE 0.01)             | 161            | 45.8           | ×3.7                         | RegExp engine (JS) 21%, property access 17%, calls 15%                          | `rt.elementGet` 8%, `js.regexpVm.fn.41` 7%, `rt.invoke` 5%, `js.regexpVm.fn.38` 5%, `rt.elementSet` 4%      |
| `09_gc` (SCALE 0.01)                  | 198            | 74.8           | ≈×1.5                        | compiled program 18%, allocation 13%, calls 11%                                 | `js.main` 15%, `rt.icGet` 6%, `rt.newShapedObject` 6%, `rt.invoke` 6%, `rt.allocRaw` 5%                     |
| `14_calls` (SCALE 0.01)               | 258            | 128            | ≈×1.2                        | calls 23%, property access 19%, compiled program 18%                            | `rt.invoke` 12%, `js.main` 9%, `rt.getPropertyCached` 9%, `rt.Math.round.fn.code` 6%, `rt.invokeSite1` 6%   |
| `15_classes` (SCALE 0.01)             | 263            | 123            | ≈×1.1                        | calls 26%, compiled program 21%, property access 18%                            | `rt.invoke` 14%, `rt.getPropertyCached` 11%, `rt.icGet` 10%, `js.main` 9%                                   |
| Are-We-Fast-Yet NBody (SCALE 0.01)    | 285            | 165            | ≈×1.2                        | other runtime 49%, property access 22%, compiled program 14%, string compare 9% | `rt.shapeLookup` 18%, `js.fn.1800` 12%, `rt.getPropertyCached` 11%, `rt.compareStrings` 9%, `rt.icGet` 8%   |
| Are-We-Fast-Yet Richards (SCALE 0.01) | 422            | 408            | ≈×1.5                        | other runtime 44%, property access 22%, calls 14%, compiled program 15%         | `rt.shapeLookup` 23%, `rt.getPropertyCached` 16%, `rt.icGet` 12%, `rt.invoke` 4%, `rt.setPropertyCached` 4% |
| Benchmarks Game n-body (N = 1000)     | 188            | 77.7           | ×2.0                         | other runtime 47%, property access 24%, compiled program 12%, string compare 8% | `rt.shapeLookup` 16%, `js.fn.2` 11%, `rt.getPropertyCached` 9%, `rt.compareStrings` 8%, `rt.icGet` 6%       |

Nona executables cannot run under valgrind: `rt.enterFrame` touches the pages
of a frame of 4 KiB or more (the `process.env` initializer has one) before
moving RSP, which valgrind treats as an access below the stack pointer and
kills the program. QEMU does not mind.

### Where Nona stands

**Wins.**

- **Start-up, memory and size: an order of magnitude ahead of all three.**
  Hello world starts in 1.3 ms with 1.05 MB of peak memory and a 1.07 MB
  executable, against 5.3 ms / 14 MB (Bun), 17.5 ms / 28 MB (Deno) and
  38 ms / 45 MB (Node.js); the ten corpus programs run start to finish in
  4–6 ms against 44–59 ms. A program that loads lodash still starts in
  15 ms against 80 ms for Node.js.
- **Scans over memory**: a `for` loop over an array (×0.4), reading
  properties through inline caches (×0.4), typed-array kernels (×0.8–×1.3),
  string building with ropes (×0.7) and `JSON.parse` (×0.9) are at Node's
  level or better, as in the v0.12.0 measurement.
- **HTTP**: throughput at Node's level on keep-alive hello/JSON and new
  connections, ×1.7 ahead on 64 KiB responses, with a quarter of the memory;
  behind by ×1.8 on 16 KiB request bodies.

**Losses, by cause**, from the profiles above and the per-metric tables:

1. **The RegExp engine** (a bytecode VM written in JavaScript, `js.regexpVm.*`)
   is the largest gap and it reaches real programs: ×117 on the `exec` loop
   micro-benchmark, ×64–×97 on the `match`/`exec` steps of log-scan (#389),
   ×102 on regex-redux, ×27–×45 on marked, ×355 on lodash's `camelCase`/
   `kebabCase` (which run Unicode-class RegExps over every word). The
   vectorized first-unit scan (#258) does not help once a candidate position
   is found: in `07_strings` the VM's own bytecode loop is 21% of all
   instructions and the generic element reads, property reads and calls it
   makes (`rt.elementGet`, `rt.invoke`) are most of the rest.
2. **Property lookups that miss the inline cache** dominate the
   object-oriented suites: `rt.shapeLookup` + `rt.getPropertyCached` +
   `rt.icGet` are 40–50% of Richards and NBody, and `rt.compareStrings`
   (8–9%) shows that the slow path compares property names as strings. In
   NBody every `body.vx` read of the inner loop goes through
   `rt.shapeLookup`; this is the ×33 (Are-We-Fast-Yet) and ×37 (Benchmarks
   Game) of n-body, where V8 keeps the fields in registers. Richards (×18),
   DeltaBlue (×17), Havlak (×28), CD (×11) and acorn (×18 on repeated parses)
   have the same profile.
3. **Calls**: `rt.invoke`/`rt.invokeSite1`/`rt.enterFrame` cost 100–200
   instructions per call and nothing is inlined: ×8 on `add(a, b)`, ×6 on
   `call`/`apply`, ×6–×7 on monomorphic and polymorphic method calls, ×2 on
   `fib(32)`. The micro-benchmarks also call `S()` (a closure around
   `Math.round`) in every loop condition, which V8 hoists and Nona pays for
   (6% of `14_calls`); the ratio on a plain call is nearer ×5.
4. **Allocation and GC**: ×4.2 on 5M short-lived objects, ×7.7 on
   binary-trees, ×2–×3 on `Map`/`Set` and object creation; `09_gc` spends
   13% in `rt.allocRaw`/`rt.newShapedObject` and much of the rest in the
   collector. Nona's RSS is also 1.5–3× Node's on the allocation-heavy
   programs (770 MB on json-big, 337 MB on regex-redux), so the heap grows
   instead of being collected; NBody's slow first iteration (1 501 ms against
   800 ms) is the heap growing to its working size.
5. **Promises** (×10 on a `.then` chain, #44) and **file writes** (×7.6 on
   1 MB `writeFileSync` chunks, ×2 on the read back) are the remaining
   library-level gaps; `setTimeout` and `JSON.parse` are at parity.
6. **String sorting and building**: the default `sort` of 50 000 strings is
   ×8 (#388), `replaceAll` on 11 MB ×3.5 (#387), `split`+`join` ×3,
   long-string equality and substring search ×2.4–×3.2 despite the SIMD
   kernels: the per-call overhead around the kernel, not the scan, is what
   remains.

The numbers are honest about where an AOT compiler without a JIT stands
against V8 on long-running computation; the follow-up issues proposed with this
report address causes 1–4 in that order.

### Method

How JavaScript engines and AOT compilers are compared publicly, and what this
report takes from each:

- **JetStream 2** ([WebKit](https://webkit.org/?p=8685), [in-depth](https://browserbench.org/JetStream2.0/in-depth.html))
  scores each benchmark by a geometric mean of its first iteration ("startup"),
  worst case and average, and the suite by the geometric mean of the
  benchmarks: this report uses geometric means per category and reports first
  and steady-state iterations separately. **Octane** (retired by the V8 team
  in 2017) and **Speedometer** measure browser workloads and are not applicable
  to a command-line compiler.
- **Are-We-Fast-Yet** ([Marr, Daloze, Mössenböck, DLS 2016](https://stefan-marr.de/papers/dls-marr-et-al-cross-language-compiler-benchmarking-are-we-fast-yet/),
  [repository](https://github.com/smarr/are-we-fast-yet)) is designed for
  comparing language implementations: the same objects-closures-arrays
  programs in every language, run as in-process iterations with a fixed
  "inner iterations" count per benchmark and a verified result. The suite's
  JavaScript directory runs unchanged on Nona (one `require`-based driver,
  `bench/awfy/awfy.js`, because Nona's `process.argv` has no script path).
- **The Computer Language Benchmarks Game** ([site](https://benchmarksgame-team.pages.debian.net/benchmarksgame/))
  measures whole processes (elapsed and CPU seconds, peak memory) on fixed
  problem sizes with byte-exact expected output: this report takes the
  whole-process timing, the output comparison and the problem set.
- **"Virtual Machine Warmup Blows Hot and Cold"** ([Barrett, Bolz-Tereick,
  Killick, Mount, Tratt, OOPSLA 2017](https://arxiv.org/abs/1602.00602))
  shows that JIT warm-up is often not the clean curve one expects and that
  per-iteration data must be looked at, not summarized away: the
  warm-up table above prints the first six iterations of both runtimes.
- **Bun/Deno/Node comparisons** (for example [Deno's AWS Lambda cold-start
  benchmarks](https://deno.com/blog/aws-lambda-coldstart-benchmarks),
  [Platformatic on Bun and latency](https://blog.platformatic.dev/bun-is-fast-until-latency-matters-for-nextjs-workloads))
  measure start-up and HTTP throughput with latency percentiles and memory,
  and are criticized when they report a single run: this report uses
  [hyperfine](https://github.com/sharkdp/hyperfine) (30 runs after 5
  warm-ups, median and IQR) for start-up and prints p99 and RSS for HTTP.
- **AOT JavaScript write-ups**: Static Hermes ([React Native EU 2023
  announcement](https://speakerdeck.com/tmikov2023/static-hermes-react-native-eu-2023-announcement))
  compares against the Hermes interpreter and QuickJS on micro-benchmarks and
  reports start-up; [Porffor](https://github.com/CanadaHonk/porffor/wiki)
  reports Test262 conformance alongside speed; Serrano's [Of JavaScript AOT
  Compilation Performance](https://icfp21.sigplan.org/details/icfp-2021-papers/9/Of-JavaScript-AOT-Compilation-Performance)
  (Hopc, ICFP 2021) compares an AOT compiler with V8 and JavaScriptCore on
  JetStream-style benchmarks and finds AOT competitive on some and far behind
  on others, with property-access and call overheads as the usual causes.
  This report follows that pattern: standard suites, per-benchmark tables and
  an analysis of causes from profiles rather than a single score.

Protocol chosen here: one process per run and ≥10 runs (5 for the real
programs and the Benchmarks Game, where a Nona run takes up to a minute) after
one untimed warm-up run; medians with the IQR; the Are-We-Fast-Yet iterations
in-process as the suite prescribes; peak RSS from GNU time; executable sizes
on disk; build times with a warm cache; ratios within ×1.5 marked as noise
because the VM is shared (no CPU pinning was possible for the single-process
benchmarks; the HTTP benchmark pins server and load generator to separate
CPUs); instruction counts from QEMU and callgrind where wall time is short;
every case's output compared between runtimes before it is counted.

## Nona vs optimized C++ (2026-10-20, #401)

A separate comparison with optimized C++ on matched arithmetic, call and
UTF-16 string kernels: [docs/perf-cpp.md](docs/perf-cpp.md), with sources
and the runner in [`bench/cpp/`](bench/cpp/README.md) and raw samples in
[`bench/cpp/results/`](bench/cpp/results/). Measured on `main` after v0.20.0
(commit `36737352`) in WSL2 Ubuntu 22.04 on an Intel Core i7-13620H, g++ 11.4
`-O3`, 11 alternating runs; it does not replace the Node.js sections below.

| 10,000,000 operations, N = 1e7 | Nona ms | C++ `-O3` ms | Nona/C++ |
| ------------------------------ | ------- | ------------ | -------- |
| double `s + x`, inline         | 119     | 5.45         | x21.9    |
| double, `add(s, x)` calls      | 183     | 5.62         | x32.5    |
| double `p * x`, inline         | 122     | 10.9         | x11.2    |
| double, `multiply(p, x)` calls | 176     | 11.1         | x15.8    |
| `(s + x) >>> 0`, inline        | 442     | 2.93         | x151     |
| `Math.imul(p, x) >>> 0`        | 367     | 8.06         | x45.5    |

Strings on medium and large inputs are at or ahead of `std::u16string`
(`indexOf` x0.73–x1.23, `===`/`<` x0.22–x0.36); per-code-unit and
short-string work is 7–690 times slower. The report ranks the measured
causes (int32 coercion fast paths, frame-resident values, out-of-line
typed-array access, call overhead, `charCodeAt` as a method call, number
parsing) for [#402](https://github.com/40oleg/nona/issues/402).

## Literal sites written in one pass (#48)

Measured 2026-10-20 on a shared Windows 11 machine with Node.js 22.23.2: "before" is `main` 50280f42, "after" the #48 branch on top of it (object literals with known keys and array literals of up to eight elements evaluated first and written in one pass). `node bench/run.mjs --only 09 --runs 3 --runtimes node,nona`, medians of `alloc5M` (`bench/09_gc.js`):

| Scale | Node.js | Nona before | Nona after | After / Node.js |
| ----- | ------- | ----------- | ---------- | --------------- |
| 0.1   | 14.0 ms | 53.2 ms     | 44.0 ms    | x3.1            |
| 1     | 84.8 ms | 488.4 ms    | 407.2 ms   | x4.8            |

The literal itself is now cheap; the remaining gap at full scale is the collection of 2 GB/s of garbage (lazy sweep of every dead cell), which generational collection would address. Popping the free list inline at the literal site instead of calling `rt.allocRaw` was tried and gave no measurable difference (400–438 ms), so it was not kept.

## HTTP `/json` with the UTF-8 JSON serializer (#155)

Measured 2026-10-19 on a shared Windows 11 machine, with the Linux x64 servers running in WSL2 (16 logical CPUs, 7.8 GB). Both servers are `bench/http/server.mjs` built with `--target linux-x64 --module`: "before" from `3fbc0ad2` (the base of the #155 branch), "after" from the #155 branch (`res.end(JSON.stringify(x))` through the byte serializer). The load generator is `bench/http/load.c` (50 keep-alive connections, 4 s per case; server on CPU 0, load on CPU 1), three alternating rounds; `run.sh` itself was not used because there is no Node.js in WSL, so the Node.js column is not measured here.

| Case    | Before, req/s (3 rounds) | After, req/s (3 rounds)  |
| ------- | ------------------------ | ------------------------ |
| `hello` | 39 488 / 40 141 / 37 960 | 37 855 / 40 386 / 39 158 |
| `/json` | 38 096 / 34 858 / 37 548 | 35 900 / 37 740 / 34 820 |

The medians are 37 548 req/s before and 35 900 req/s after for `/json`: no difference beyond the round-to-round noise of about 10 % on this shared machine. The saving (one UTF-16 buffer, one finished string, one `byteLength` scan and one UTF-8 copy per response) is small next to the per-request cost of the HTTP stack at the payload size of this case, so this measurement does not show a throughput gain; a quiet reference VM and the Node.js comparison are still to be run. Absolute numbers are lower than the sections below (different machine and WSL2 networking), so only the before/after pair is comparable.

## Promise reactions on a native promise kind (#44)

Measured 2026-10-20 on the shared Windows 11 x64 machine with Node.js 22.23.2, three runs each. A promise is a native object kind, a `.then` allocates one object that is both the derived promise and its reaction, and for a plain `%Promise%` receiver `then`, settling and the job runner are native (see [architecture.md](docs/architecture.md#javascript-preludes-and-linking)).

| Case                                               | `main` (c6ccad0e) | #44, ms      | Node.js, ms  |
| -------------------------------------------------- | ----------------- | ------------ | ------------ |
| `bench/10_async.js --scale 0.1`, `promise1M`       | 175 / 146 / 146   | 39 / 39 / 40 | 14 / 14 / 14 |
| chain of 100 000 `.then` after the `await`s below  | 111 / 109 / 110   | 41 / 41 / 45 | 15 / 16 / 14 |
| 100 000 sequential `await i` in one async function | 41 / 39 / 37      | 33 / 36 / 31 | 7 / 7 / 6    |

The chain is now ×2.8 of Node.js, about 0.4 µs per reaction (closure creation and `then` included), inside the issue's target of 1 µs and ×5. `await` gains less: each step still resumes a generator coroutine through the prelude's async driver, which is now the larger part of its cost.

## Current release (v0.13.0) against Node.js, Deno and Bun (superseded)

_Superseded by [the v0.18.0 section](#current-release-v0180-against-nodejs-deno-and-bun)._

**These are not new measurements.** The v0.13.0 release commit (2026-10-16) was
prepared on a shared Windows 11 machine with Node.js 22.23.2 only: Deno and Bun
are not installed there, and the ELF benchmarks need Linux. Rather than mix
platforms, the figures below are the 2026-10-14 measurement, reused unchanged.
The work merged since v0.12.0 was not benchmarked, so the figures say nothing
about it; re-run `node bench/run.mjs` on the reference VM to refresh them.

Original measurement: 2026-10-14 at `main` b58f0bc (v0.12.0 plus the merged
#253–#281 work) on a Linux x86-64 cloud VM (Intel Xeon 2.10 GHz, 2 vCPU, 7 GB RAM) with
Node.js 22.22.0, Deno 2.9.6 and Bun 1.4.3. The VM was shared with other jobs,
so differences of about ×1.5 or less are noise. Every script printed the same
checksum on all four runtimes.

### Startup, executable size, build time, memory

Hello world, median of 30 runs after 5 warm-ups; peak RSS from `/usr/bin/time`.

| How the program runs       | Start-up, ms | Executable, MB | Build, s | Peak RSS, MB |
| -------------------------- | ------------ | -------------- | -------- | ------------ |
| Nona, compiled ELF         | **2.7**      | **1.1**        | 0.68     | **1.0**      |
| Bun, `bun build --compile` | 7.4          | 90.8           | **0.25** | 11.6         |
| Bun, `bun x.js`            | 5.7          | (the runtime)  | —        | 13.1         |
| Deno, `deno run x.js`      | 41.0         | (the runtime)  | —        | 26.4         |
| Node, `node x.js`          | 46.7         | (the runtime)  | —        | 43.6         |

`deno compile` could not download its runtime in this sandbox and Node SEA was
not rebuilt; the v0.7.0 table below has both (104 MB and 124 MB). Nona's build
time is with the on-disk runtime cache (`NONA_CACHE`) warm; a cold build
compiles the runtime and preludes once (about 3 s).

### Micro-benchmarks

`node bench/run.mjs --scale 0.1 --runs 3 --runtimes node,deno,bun,nona --only
05,06,07,08,09,10,11,13,14,15,16,17`, median of 3 runs, ms. `--scale 0.1` is the
N = 100 000 of the array, object, call and class rows.

| Operation                             | Node  | Deno  | Bun   | Nona  | Nona / Node |
| ------------------------------------- | ----- | ----- | ----- | ----- | ----------- |
| `push` × N                            | 5.86  | 4.62  | 4.04  | 4.12  | ×0.7        |
| `Array.from({length: N})`             | 7.33  | 9.23  | 6.72  | 31.0  | ×4.2        |
| `new Array(N)` + fill                 | 2.50  | 1.22  | 2.21  | 2.91  | ×1.2        |
| Sum with a `for` loop                 | 2.45  | 2.54  | 1.80  | 0.91  | ×0.4        |
| `map` → `filter` → `reduce`           | 7.21  | 5.61  | 17.1  | 9.86  | ×1.4        |
| `sort` N numbers with a comparator    | 56.2  | 50.2  | 34.7  | 105   | ×1.9        |
| Create N objects `{id, x, y, name}`   | 21.1  | 11.8  | 11.5  | 22.9  | ×1.1        |
| Read 3 properties × N                 | 8.21  | 8.87  | 1.17  | 2.68  | ×0.3        |
| `Map.set` × N                         | 14.2  | 13.4  | 16.9  | 34.6  | ×2.4        |
| `Map.get` × N                         | 5.75  | 6.70  | 3.58  | 8.05  | ×1.4        |
| `Set.add` + `Set.has` × N             | 12.9  | 12.1  | 16.2  | 35.4  | ×2.7        |
| `s += "abc" + i` × 20 000             | 7.77  | 4.07  | 5.93  | 5.48  | ×0.7        |
| `split("1")` + `join("-")`            | 2.71  | 4.83  | 3.19  | 8.58  | ×3.2        |
| `indexOf` in a loop                   | 0.28  | 0.35  | 0.07  | 0.25  | ×0.9        |
| `/abc(\d{3})-/g.exec` in a loop       | 0.35  | 0.28  | 0.25  | 34.6  | ×98         |
| `fib(32)` recursive                   | 30.3  | 29.7  | 26.2  | 87.2  | ×2.9        |
| 200×200 matrix multiply               | 41.5  | 41.5  | 54.6  | 197   | ×4.7        |
| BigInt factorial 3000!                | 0.14  | 0.53  | 0.59  | 1.15  | ×8.4        |
| 5M short-lived objects (`09_gc`)      | 20.4  | 17.6  | 25.6  | 72.6  | ×3.6        |
| Promise chain, `.then` × 100 000      | 31.4  | 44.8  | 20.5  | 365   | ×12         |
| 10 000 sequential `setTimeout(fn, 0)` | 1 210 | 2 280 | 1 180 | 1 240 | ×1.0        |
| `JSON.stringify`, 30 000 objects      | 23.2  | 10.0  | 11.4  | 34.5  | ×1.5        |
| `JSON.parse`, 2.9 MB                  | 36.4  | 28.2  | 22.3  | 38.8  | ×1.1        |
| `Float64Array`: fill, sum, map, 1M    | 19.3  | 42.0  | 32.8  | 54.3  | ×2.8        |
| Call `add(a, b)` × 10N                | 7.56  | 12.5  | 12.2  | 55.7  | ×7.4        |
| Create and call N closures            | 29.6  | 33.7  | 39.3  | 97.5  | ×3.3        |
| `call` + `apply` × 4N                 | 9.56  | 25.7  | 7.42  | 99.4  | ×10         |
| Method through an inheritance chain   | 8.84  | 3.93  | 13.5  | 47.4  | ×5.4        |
| Polymorphic call, 3 classes           | 8.85  | 8.52  | 23.5  | 53.9  | ×6.1        |
| `new Square(i)` × N                   | 19.2  | 11.5  | 24.6  | 37.1  | ×1.9        |
| Long-string equality (`16`)           | 1.14  | 1.40  | 0.52  | 0.92  | ×0.8        |
| Substring search (`16`)               | 0.12  | 0.15  | 0.11  | 0.29  | ×2.5        |
| `split`/`replaceAll` (`16`)           | 0.33  | 0.46  | 0.27  | 0.53  | ×1.6        |
| Long `Map` keys (`16`)                | 6.18  | 6.50  | 5.96  | 16.6  | ×2.7        |
| Typed array `fill` (`17`)             | 1.19  | 4.00  | 1.18  | 0.92  | ×0.8        |
| Typed array `copyWithin`/`set` (`17`) | 2.20  | 1.55  | 2.58  | 3.79  | ×1.7        |
| Typed array searches (`17`)           | 8.73  | 4.64  | 2.70  | 5.40  | ×0.6        |
| Typed array loops (`17`)              | 8.65  | 3.65  | 3.59  | 7.50  | ×0.9        |

Whole scripts, wall time including start-up (ms): the short ones favour Nona,
whose executables start in 3 ms against 40–50 ms for Node and Deno.

| Script            | Node | Deno | Bun | Nona |
| ----------------- | ---- | ---- | --- | ---- |
| `05_array`        | 158  | 136  | 84  | 165  |
| `06_objects`      | 104  | 91   | 59  | 114  |
| `07_strings`      | 76   | 70   | 20  | 61   |
| `08_numeric`      | 128  | 127  | 90  | 289  |
| `11_json`         | 142  | 99   | 56  | 122  |
| `14_calls`        | 96   | 119  | 76  | 297  |
| `15_classes`      | 89   | 68   | 73  | 149  |
| `16_string_scan`  | 65   | 64   | 30  | 31   |
| `17_typed_arrays` | 95   | 68   | 23  | 30   |

### Real-world code

`node bench/run.mjs --real --runs 3 --runtimes node,deno,bun,nona`, median of 3
runs, ms (libraries from `node bench/real/fetch.mjs`).

| Program                                     | Node | Deno | Bun | Nona  | Nona / Node |
| ------------------------------------------- | ---- | ---- | --- | ----- | ----------- |
| acorn 8.18.0: first parse of its own 230 KB | 231  | 145  | 204 | 807   | ×3.5        |
| acorn: 10 more parses                       | 497  | 404  | 578 | 6 330 | ×13         |
| marked 12.0.2: first render                 | 43   | 63   | 66  | 982   | ×23         |
| marked: 5 more renders                      | 141  | 68   | 116 | 4 330 | ×31         |

### Where Nona stands

- **Start-up, size and memory:** an order of magnitude ahead of all three: 2.7 ms and 1.1 MB for hello world against 6–47 ms and 91 MB (`bun --compile`).
- **Loops over numbers, arrays and typed arrays, property reads, string building and searching:** at Node's level or faster (×0.3–×1.4): shapes and inline caches (#114), dense elements, ropes (#46), SIMD scans (#253) and typed-array kernels.
- **Calls, closures, `apply` and polymorphic methods:** ×3–×10 slower, the cost of a call without a JIT that inlines (#47, #235, #239).
- **Promise chains (×12), allocation-heavy code (×3.6) and the RegExp engine (×98 on the scan-heavy micro-benchmark, ×13–×31 in acorn and marked):** the largest remaining gaps. The RegExp engine is a bytecode VM written in JavaScript; a native matcher and a native promise kind (#44) are the next steps (the promise kind has landed since: [the #44 note](#promise-reactions-on-a-native-promise-kind-44)).

## The 2026-10-14 comparison (v0.12.0, superseded)

_Superseded by [the v0.13.0 section](#current-release-v0130-against-nodejs-deno-and-bun-superseded), which reuses these figures (see there why)._

Measured on 2026-10-14 at `main` b58f0bc (v0.12.0 plus the merged #253–#281
work) on a Linux x86-64 cloud VM (Intel Xeon 2.10 GHz, 2 vCPU, 7 GB RAM) with
Node.js 22.22.0, Deno 2.9.6 and Bun 1.4.3. The VM was shared with other jobs,
so differences of about ×1.5 or less are noise. Every script printed the same
checksum on all four runtimes.

### Startup, executable size, build time, memory

Hello world, median of 30 runs after 5 warm-ups; peak RSS from `/usr/bin/time`.

| How the program runs       | Start-up, ms | Executable, MB | Build, s | Peak RSS, MB |
| -------------------------- | ------------ | -------------- | -------- | ------------ |
| Nona, compiled ELF         | **2.7**      | **1.1**        | 0.68     | **1.0**      |
| Bun, `bun build --compile` | 7.4          | 90.8           | **0.25** | 11.6         |
| Bun, `bun x.js`            | 5.7          | (the runtime)  | —        | 13.1         |
| Deno, `deno run x.js`      | 41.0         | (the runtime)  | —        | 26.4         |
| Node, `node x.js`          | 46.7         | (the runtime)  | —        | 43.6         |

`deno compile` could not download its runtime in this sandbox and Node SEA was
not rebuilt; the v0.7.0 table below has both (104 MB and 124 MB). Nona's build
time is with the on-disk runtime cache (`NONA_CACHE`) warm; a cold build
compiles the runtime and preludes once (about 3 s).

### Micro-benchmarks

`node bench/run.mjs --scale 0.1 --runs 3 --runtimes node,deno,bun,nona --only
05,06,07,08,09,10,11,13,14,15,16,17`, median of 3 runs, ms. `--scale 0.1` is the
N = 100 000 of the array, object, call and class rows.

| Operation                             | Node  | Deno  | Bun   | Nona  | Nona / Node |
| ------------------------------------- | ----- | ----- | ----- | ----- | ----------- |
| `push` × N                            | 5.86  | 4.62  | 4.04  | 4.12  | ×0.7        |
| `Array.from({length: N})`             | 7.33  | 9.23  | 6.72  | 31.0  | ×4.2        |
| `new Array(N)` + fill                 | 2.50  | 1.22  | 2.21  | 2.91  | ×1.2        |
| Sum with a `for` loop                 | 2.45  | 2.54  | 1.80  | 0.91  | ×0.4        |
| `map` → `filter` → `reduce`           | 7.21  | 5.61  | 17.1  | 9.86  | ×1.4        |
| `sort` N numbers with a comparator    | 56.2  | 50.2  | 34.7  | 105   | ×1.9        |
| Create N objects `{id, x, y, name}`   | 21.1  | 11.8  | 11.5  | 22.9  | ×1.1        |
| Read 3 properties × N                 | 8.21  | 8.87  | 1.17  | 2.68  | ×0.3        |
| `Map.set` × N                         | 14.2  | 13.4  | 16.9  | 34.6  | ×2.4        |
| `Map.get` × N                         | 5.75  | 6.70  | 3.58  | 8.05  | ×1.4        |
| `Set.add` + `Set.has` × N             | 12.9  | 12.1  | 16.2  | 35.4  | ×2.7        |
| `s += "abc" + i` × 20 000             | 7.77  | 4.07  | 5.93  | 5.48  | ×0.7        |
| `split("1")` + `join("-")`            | 2.71  | 4.83  | 3.19  | 8.58  | ×3.2        |
| `indexOf` in a loop                   | 0.28  | 0.35  | 0.07  | 0.25  | ×0.9        |
| `/abc(\d{3})-/g.exec` in a loop       | 0.35  | 0.28  | 0.25  | 34.6  | ×98         |
| `fib(32)` recursive                   | 30.3  | 29.7  | 26.2  | 87.2  | ×2.9        |
| 200×200 matrix multiply               | 41.5  | 41.5  | 54.6  | 197   | ×4.7        |
| BigInt factorial 3000!                | 0.14  | 0.53  | 0.59  | 1.15  | ×8.4        |
| 5M short-lived objects (`09_gc`)      | 20.4  | 17.6  | 25.6  | 72.6  | ×3.6        |
| Promise chain, `.then` × 100 000      | 31.4  | 44.8  | 20.5  | 365   | ×12         |
| 10 000 sequential `setTimeout(fn, 0)` | 1 210 | 2 280 | 1 180 | 1 240 | ×1.0        |
| `JSON.stringify`, 30 000 objects      | 23.2  | 10.0  | 11.4  | 34.5  | ×1.5        |
| `JSON.parse`, 2.9 MB                  | 36.4  | 28.2  | 22.3  | 38.8  | ×1.1        |
| `Float64Array`: fill, sum, map, 1M    | 19.3  | 42.0  | 32.8  | 54.3  | ×2.8        |
| Call `add(a, b)` × 10N                | 7.56  | 12.5  | 12.2  | 55.7  | ×7.4        |
| Create and call N closures            | 29.6  | 33.7  | 39.3  | 97.5  | ×3.3        |
| `call` + `apply` × 4N                 | 9.56  | 25.7  | 7.42  | 99.4  | ×10         |
| Method through an inheritance chain   | 8.84  | 3.93  | 13.5  | 47.4  | ×5.4        |
| Polymorphic call, 3 classes           | 8.85  | 8.52  | 23.5  | 53.9  | ×6.1        |
| `new Square(i)` × N                   | 19.2  | 11.5  | 24.6  | 37.1  | ×1.9        |
| Long-string equality (`16`)           | 1.14  | 1.40  | 0.52  | 0.92  | ×0.8        |
| Substring search (`16`)               | 0.12  | 0.15  | 0.11  | 0.29  | ×2.5        |
| `split`/`replaceAll` (`16`)           | 0.33  | 0.46  | 0.27  | 0.53  | ×1.6        |
| Long `Map` keys (`16`)                | 6.18  | 6.50  | 5.96  | 16.6  | ×2.7        |
| Typed array `fill` (`17`)             | 1.19  | 4.00  | 1.18  | 0.92  | ×0.8        |
| Typed array `copyWithin`/`set` (`17`) | 2.20  | 1.55  | 2.58  | 3.79  | ×1.7        |
| Typed array searches (`17`)           | 8.73  | 4.64  | 2.70  | 5.40  | ×0.6        |
| Typed array loops (`17`)              | 8.65  | 3.65  | 3.59  | 7.50  | ×0.9        |

Whole scripts, wall time including start-up (ms): the short ones favour Nona,
whose executables start in 3 ms against 40–50 ms for Node and Deno.

| Script            | Node | Deno | Bun | Nona |
| ----------------- | ---- | ---- | --- | ---- |
| `05_array`        | 158  | 136  | 84  | 165  |
| `06_objects`      | 104  | 91   | 59  | 114  |
| `07_strings`      | 76   | 70   | 20  | 61   |
| `08_numeric`      | 128  | 127  | 90  | 289  |
| `11_json`         | 142  | 99   | 56  | 122  |
| `14_calls`        | 96   | 119  | 76  | 297  |
| `15_classes`      | 89   | 68   | 73  | 149  |
| `16_string_scan`  | 65   | 64   | 30  | 31   |
| `17_typed_arrays` | 95   | 68   | 23  | 30   |

### Real-world code

`node bench/run.mjs --real --runs 3 --runtimes node,deno,bun,nona`, median of 3
runs, ms (libraries from `node bench/real/fetch.mjs`).

| Program                                     | Node | Deno | Bun | Nona  | Nona / Node |
| ------------------------------------------- | ---- | ---- | --- | ----- | ----------- |
| acorn 8.18.0: first parse of its own 230 KB | 231  | 145  | 204 | 807   | ×3.5        |
| acorn: 10 more parses                       | 497  | 404  | 578 | 6 330 | ×13         |
| marked 12.0.2: first render                 | 43   | 63   | 66  | 982   | ×23         |
| marked: 5 more renders                      | 141  | 68   | 116 | 4 330 | ×31         |

### Where Nona stands

- **Start-up, size and memory:** an order of magnitude ahead of all three: 2.7 ms and 1.1 MB for hello world against 6–47 ms and 91 MB (`bun --compile`).
- **Loops over numbers, arrays and typed arrays, property reads, string building and searching:** at Node's level or faster (×0.3–×1.4): shapes and inline caches (#114), dense elements, ropes (#46), SIMD scans (#253) and typed-array kernels.
- **Calls, closures, `apply` and polymorphic methods:** ×3–×10 slower, the cost of a call without a JIT that inlines (#47, #235, #239).
- **Promise chains (×12), allocation-heavy code (×3.6) and the RegExp engine (×98 on the scan-heavy micro-benchmark, ×13–×31 in acorn and marked):** the largest remaining gaps. The RegExp engine is a bytecode VM written in JavaScript; a native matcher and a native promise kind (#44) are the next steps.

## Update: current release against Node

_v0.10.0 against Node.js, superseded by [the 2026-10-14 comparison](#the-2026-10-14-comparison-v0120-superseded)._

Measured on 2026-10-08 at `main` 6c4b396 (v0.10.0 plus the Lean proofs PR) on
Windows x64 with Node.js 22.23.2: `node bench/run.mjs --scale 0.1 --runs 3
--runtimes node,nona --only 05,06,07,08,09,10,11,13,14,15`, median of 3 runs.
`--scale 0.1` is a tenth of the nominal size in each script, which is the
N = 100 000 of sections 5–7 and 14–15. Deno and Bun are not installed on the
measuring machine, so only Node is compared. The machine was a desktop in
normal use with other Node processes running: treat differences of about ×1.5
or less as noise. `12_fs.mjs` is not re-measured because it writes to `/tmp`,
which does not exist on Windows.

| Operation                                | Node, ms | Nona, ms | Nona / Node | v0.7.0                  |
| ---------------------------------------- | -------- | -------- | ----------- | ----------------------- |
| `push` × N                               | 5.75     | 4.84     | ×0.8        | ×37                     |
| `Array.from({length: N})`                | 7.83     | 31.6     | ×4.0        | ×36                     |
| `new Array(N)` + fill                    | 2.13     | 2.63     | ×1.2        | ×143                    |
| Sum with a `for` loop                    | 2.46     | 1.02     | ×0.4        | ×18                     |
| `map` → `filter` → `reduce`              | 4.52     | 10.7     | ×2.4        | ×27                     |
| `sort` N numbers with a comparator       | 47.7     | 179      | ×3.8        | ×523                    |
| Create N objects `{id, x, y, name}`      | 18.5     | 39.5     | ×2.1        | ×33                     |
| Read 3 properties × N                    | 8.85     | 4.72     | ×0.5        | ×9                      |
| `Map.set` × N                            | 16.2     | 17.5     | ×1.1        | ×6 700                  |
| `Map.get` × N                            | 5.92     | 14.0     | ×2.4        | ×18 000                 |
| `Set.add` + `Set.has` × N                | 14.8     | 41.6     | ×2.8        | ×15 000                 |
| `s += "abc" + i` × 20 000                | 4.50     | 1 070    | ×237        | ×156 (2 000 iterations) |
| `split("1")` + `join("-")`               | 2.06     | 4.25     | ×2.1        | ×470 (N = 10 000)       |
| `indexOf` in a loop                      | 0.21     | 0.31     | ×1.5        | ×3                      |
| `/abc(\d{3})-/g.exec` in a loop          | 0.26     | 59.4     | ×227        | ×13 000                 |
| `fib(32)` recursive                      | 29.2     | 82.8     | ×2.8        | ×25                     |
| 200×200 matrix multiply                  | 35.4     | 284      | ×8.0        | ×857                    |
| BigInt factorial 3000!                   | 0.17     | 1.12     | ×6.4        | > 10 min                |
| 500k short-lived `{a, b: [..], c: {..}}` | 23.5     | 315      | ×13         | ×93                     |
| Promise chain, `.then` × 100 000         | 32.1     | 1 256    | ×39         | ×53 000 (10 000)        |
| 1 000 sequential `setTimeout(fn, 0)`     | 15 242   | 15 654   | ×1.0        | ×1.0                    |
| `JSON.stringify`, 30 000 objects, 2.9 MB | 23.8     | 33.5     | ×1.4        | ×900 (3 000 objects)    |
| `JSON.parse`, 2.9 MB                     | 37.6     | 51.3     | ×1.4        | ×45 (280 KB)            |
| `Float64Array`: fill, sum, map, 1M       | 14.5     | 48.2     | ×3.3        | ×17                     |
| Call `add(a, b)` × 10N                   | 3.66     | 44.0     | ×12         | ×71                     |
| Create and call N closures               | 13.96    | 70.5     | ×5.1        | ×41                     |
| `call` + `apply` × 4N                    | 8.49     | 69.5     | ×8.2        | ×72                     |
| Method through an inheritance chain × 5N | 6.32     | 66.0     | ×10         | ×67                     |
| Polymorphic call, 3 classes × 5N         | 7.33     | 75.8     | ×10         | ×96                     |
| `new Square(i)` × N                      | 14.97    | 69.9     | ×4.7        | ×52                     |

The checksums printed by every script were identical on both runtimes.

What changed since v0.7.0: the quadratic cases are gone. `Map`/`Set` use a hash
index and arrays have dense elements (#41), number arithmetic and branches are
inline (#41, #94),
the RegExp engine is a bytecode VM with a literal-prefix search (#14, #107),
and JSON is parsed and written iteratively (#41, #88). What remains is mostly
the cost of the generic path and of copying strings:

- `s += …` was quadratic (×237 at 20 000 iterations) until ropes (#46, #83): 20 000 appends now take 5 ms (Node.js 4.3 ms) and 200 000 take 80 ms (Node.js 33 ms) on the machine of the 2026-10-05 HTTP measurement.
- RegExp is ×227 on this scan-heavy case.
- Calls, closures and classes are ×4–12, and short-lived objects ×13: call-site caches (#47), inline slots for short-lived objects (#48) and shapes (#114).
- `JSON.stringify` still builds a UTF-16 string first: a byte-output mode would save about 0.3 µs of a 38 µs `res.end(JSON.stringify(...))` request, so #155 sped up `Buffer.from(string)` (1.93 µs to 0.89 µs for 95 characters) and `Buffer.byteLength(string)` (2.5 µs to 0.28 µs) instead. Since #45 it reads plain data (shaped objects, dense arrays) directly: 30 000 objects take 30 ms instead of 72 ms on the machine of the 2026-10-05 HTTP measurement (Node.js: 17 ms).
- The Promise chain (×39) keeps one record per `.then` and a linked job queue since #44: on a Linux x64 VM the 100 000-reaction chain went from 1 450 ms to 460 ms (Node.js 31 ms) and 100 000 sequential `await`s from 1 070 ms to 230 ms. A second pass (literal records, an inline `then`, `await` of a primitive without a hidden promise, `typeof` tests compiled to tag checks) brought the chain from 739 ms to 575 ms and the `await`s from 450 ms to 142 ms on a busier VM (20 000 reactions: 376 M to 210 M instructions). Promises are still ordinary objects whose state lives in a WeakMap; about a third of the remaining instructions are allocation and collection of the promise, its state record, the reaction and the WeakMap entry. A dedicated native promise kind was the remaining step; it has landed since, see [the #44 note](#promise-reactions-on-a-native-promise-kind-44).

Sections 1–4 (startup, size, build time, memory), the executable size, the
real-world code and the HTTP server tables are not covered by this update and
keep the date and version they state.

## Summary (v0.7.0, superseded)

_Measured against v0.7.0. The operations in the table below are re-measured in [the v0.10.0 update](#update-current-release-against-node): in that re-measurement the Map/Set, sort, Promise and JSON rows are no longer quadratic and string concatenation still is; `readFileSync` was not re-measured._

Nona wins on everything that happens before and around the program: a
compiled hello world starts in **1.8 ms** (Bun 4.5, Deno 15, Node 28), the
executable is **7 MB** (3 MB since #62, see [below](#executable-size-since-62); 81–124 MB for `bun --compile`, `deno compile` and
Node SEA) and it peaks at **11 MB** of RSS where Node needs 45 MB.

Inside the program the picture reverses. Plain computation — function calls,
closures, classes, typed arrays, allocation — runs **20–100× slower** than
V8/JavaScriptCore, which is the expected gap between an AOT compiler without
inline caches or type feedback and a JIT. Several core operations are not just
slower but **super-linear in the size of the data**, and that is what makes
real programs fail rather than merely lag:

| Operation                   | Nona at 10k       | Nona at 100k | Growth            | Node at 100k |
| --------------------------- | ----------------- | ------------ | ----------------- | ------------ |
| `Map.set` × N               | 0.83 s            | 92.7 s       | ×111 (quadratic)  | 14 ms        |
| `Set.add` + `Set.has` × N   | 1.7 s             | 182 s        | ×107 (quadratic)  | 12 ms        |
| `sort()` of N numbers       | 1.3 s             | 20.4 s       | ×16 (quadratic)   | 39 ms        |
| Promise chain of N `.then`  | 363 s             | > 10 min     | ×145 for 1k → 10k | 7 ms         |
| `JSON.stringify`, N objects | 1.4 s, 1.7 GB RSS | > 10 min     | —                 | 1.6 ms       |
| `s += "abc" + i` × N        | 0.88 s (10k)      | —            | ×20 for 2k → 10k  | 0.3 ms       |
| `readFileSync(..., "utf8")` | 0.37 s (1 MB)     | 25 s (10 MB) | ×68 for ×10       | 25 ms        |

The author documents the root cause for the first group: property, element
and `Map` storage is a linear scan (issue #36). Strings are immutable UTF-16
buffers copied on every concatenation, and `Array.prototype.join`,
`JSON.stringify` and the promise job queue are built on those two primitives.

## Environment and method

| Participant | Version | Command                                                           |
| ----------- | ------- | ----------------------------------------------------------------- |
| Nona        | 0.7.0   | `node dist/cli.js build x.js -o x --target linux-x64`, then `./x` |
| Node.js     | 22.22.0 | `node x.js`                                                       |
| Deno        | 2.9.6   | `deno run -A x.js`                                                |
| Bun         | 1.4.2   | `bun x.js`                                                        |

Linux x86-64, Intel Xeon 2.10 GHz, 2 vCPUs, 7 GB RAM (cloud sandbox). The same
source file is run by all four. Each script times its phases with
`performance.now()` and prints them as JSON; wall time and peak RSS come from
the harness. Numbers are medians of 5 runs (runtimes) or 3–5 runs (Nona);
Nona's variance between runs is under 5 %. Every script reads `SCALE` from the
environment, so "N = 100k" means `SCALE=0.1` of the nominal 1M. Startup is
measured with `hyperfine` (30 runs, 5 warm-up). Nona only compiles ES2020 with
a synchronous `fs` subset and no npm, so the scripts stay inside that subset
(`import fs from "node:fs"` instead of `require`).

Where Nona did not finish a size within 10 minutes the cell says so; the
runtime columns at that size are still real measurements.

## 1–4. Startup, executable size, build time, memory

| How the program runs       | Startup, hello world (ms, median of 30) | Executable (MB)            | Build hello world into an exe (s) | Peak RSS, hello world (MB) |
| -------------------------- | --------------------------------------- | -------------------------- | --------------------------------- | -------------------------- |
| Nona, compiled ELF         | **1.8**                                 | **7.3**                    | 2.7                               | **11.5**                   |
| Bun, `bun build --compile` | 3.2                                     | 81.3                       | **0.25**                          | 14.5                       |
| Bun, `bun x.js`            | 4.5                                     | 79.5 (the runtime itself)  | —                                 | 13.1                       |
| Deno, `deno compile`       | 12.1                                    | 104.3                      | 0.70                              | 33.0                       |
| Deno, `deno run x.js`      | 15.0                                    | 95.6 (the runtime itself)  | —                                 | 28.3                       |
| Node, SEA via postject     | 24.9                                    | 123.5                      | 7.7                               | 58.3                       |
| Node, `node x.js`          | 27.6                                    | 123.4 (the runtime itself) | —                                 | 45.5                       |

Nona's build time barely depends on the program (2.7 s for hello world,
3.0 s for the matrix/BigInt test): most of it is compiling the runtime and
the JavaScript preludes that go into every executable.

Peak RSS under load, full-size scripts (MB):

| Script                                | Node | Deno | Bun | Nona   |
| ------------------------------------- | ---- | ---- | --- | ------ |
| 09 — 5M short-lived objects           | 53   | 44   | 29  | **11** |
| 13 — `Float64Array` 10M               | 204  | 198  | 181 | 157    |
| 15 — classes, 1M `new Square`         | 129  | 124  | 77  | 777    |
| 14 — calls, 1M closures               | 188  | 214  | 120 | 1 993  |
| 11 — JSON, 3k objects (N = 10k scale) | 74   | 63   | 48  | 1 732  |

The mark-and-sweep collector keeps garbage-only workloads tiny, but any
workload that keeps a million live closures or objects, or builds strings,
inflates far beyond the JIT runtimes.

### Executable size since #62

Since [#62](https://github.com/40oleg/nona/issues/62) the RegExp engine, its
Unicode property tables and the Unicode normalization tables are linked only
when the program can reach them. Measured on 2026-10-02 at the merge commit of
#62, in bytes:

| Program                                                       | linux-x64 | win32-x64 |
| ------------------------------------------------------------- | --------- | --------- |
| `console.log("hi")`                                           | 3 067 904 | 3 092 992 |
| `console.log(/a+/.test("caab"))` (engine, no property tables) | 4 096 000 | 4 123 136 |
| A program that names `match`, `RegExp` or uses `\p{…}`        | 6 299 648 | 6 327 296 |
| `console.log("hi")` with `--full-runtime` (the v0.7.0 layout) | 6 955 008 | 6 980 608 |

Startup time and peak RSS do not change: the omitted parts were never
touched by a program that does not use them.

## 5–7. Arrays, objects and Map/Set, strings and RegExp (v0.7.0, superseded)

_v0.7.0 numbers, superseded by [the v0.10.0 update](#update-current-release-against-node) (all rows except where it says otherwise)._

N = 100 000, median, ms:

| Operation                           | Node | Deno | Bun  | Nona    | Nona / Node |
| ----------------------------------- | ---- | ---- | ---- | ------- | ----------- |
| `push` × N                          | 5.2  | 6.0  | 3.4  | 192     | ×37         |
| `Array.from({length: N})`           | 5.1  | 4.9  | 3.1  | 183     | ×36         |
| `new Array(N)` + fill               | 1.9  | 1.3  | 1.5  | 276     | ×143        |
| Sum with a `for` loop               | 1.5  | 1.9  | 0.6  | 27      | ×18         |
| `map` → `filter` → `reduce`         | 4.4  | 4.2  | 4.0  | 119     | ×27         |
| `sort` N numbers with a comparator  | 39   | 40   | 31   | 20 400  | ×523        |
| Create N objects `{id, x, y, name}` | 14.1 | 11.9 | 9.7  | 468     | ×33         |
| Read 3 properties × N               | 6.8  | 7.4  | 1.2  | 62      | ×9          |
| `Map.set` × N                       | 13.8 | 14.4 | 18.4 | 92 700  | ×6 700      |
| `Map.get` × N                       | 5.1  | 5.3  | 5.1  | 90 700  | ×18 000     |
| `Set.add` + `Set.has` × N           | 12.2 | 9.7  | 15.2 | 182 500 | ×15 000     |

At the nominal N = 1M, Node/Deno/Bun run the whole array script in
0.4–0.9 s and the object script in 0.5–0.6 s. Nona sorted 1M numbers in
278 s in a first run; the full object script did not finish in 10 minutes.

Strings are measured at N = 10 000 because at 100 000 the Nona binary was
killed by the kernel after 30 s at 6 GB RSS: `Array.prototype.join` over 20k
parts builds intermediate strings and its memory grows quadratically (4k parts
→ 450 MB). `s += …` is quadratic in time (2k iterations → 43 ms, 10k →
881 ms); the RegExp engine is linear but spends about 0.5 ms per character.

| Operation (N = 10 000)          | Node | Deno | Bun  | Nona | Nona / Node |
| ------------------------------- | ---- | ---- | ---- | ---- | ----------- |
| `s += "abc" + i` × 2 000        | 0.29 | 0.49 | 0.89 | 45   | ×156        |
| `split("1")` + `join("-")`      | 0.12 | 0.14 | 0.29 | 56   | ×470        |
| `indexOf` in a loop             | 0.02 | 0.02 | 0.02 | 0.06 | ×3          |
| `/abc(\d{3})-/g.exec` in a loop | 0.06 | 0.07 | 0.10 | 794  | ×13 000     |

At such small N the Node/Deno/Bun figures are mostly JIT warm-up, so the
ratios in this table are, if anything, understated.

## 8–10. Numeric work, GC pressure, async (v0.7.0, superseded)

_v0.7.0 numbers, superseded by [the v0.10.0 update](#update-current-release-against-node) (all rows except where it says otherwise)._

| Operation                                | Size | Node | Deno | Bun  | Nona     | Nona / Node |
| ---------------------------------------- | ---- | ---- | ---- | ---- | -------- | ----------- |
| `fib(32)` recursive                      | —    | 23   | 24.5 | 18.3 | 568      | ×25         |
| 200×200 matrix multiply, nested arrays   | —    | 30   | 35.6 | 36.6 | 25 700   | ×857        |
| BigInt factorial 30!                     | 30   | 0.17 | 0.11 | 0.22 | 0.25     | ×1.5        |
| BigInt factorial 300!                    | 300  | 0.20 | 0.28 | 0.37 | 2 340    | ×11 700     |
| BigInt factorial 3000!                   | 3000 | 3.8  | 3.1  | 3.8  | > 10 min | —           |
| 500k short-lived `{a, b: [..], c: {..}}` | 500k | 19.7 | 15.6 | 27.2 | 1 840    | ×93         |
| 5M short-lived objects                   | 5M   | 94.6 | 98.1 | 156  | 20 100   | ×213        |
| Promise chain, `.then` × 10 000          | 10k  | 6.8  | 4.1  | 2.9  | 363 000  | ×53 000     |
| `setTimeout(fn, 0)` × 100, sequential    | 100  | 117  | 221  | 114  | 123      | ×1.0        |

Recursive `fib(32)` is Nona's best computational result (×25), roughly where
a non-JIT interpreter lands. The matrix multiply reads `A[i][k]` 8 million
times through the linear element store. BigInt multiplication degrades with
the operand size: 30! matches Node, 300! is 2.3 s, 3000! did not finish.

The promise chain is the second cliff after collections: 1 000 `.then` take
2.6 s, 4 000 take 40 s, 10 000 take 363 s — worse than quadratic, consistent
with the job queue being rescanned from the start on every job. Timers are
fine: `setTimeout(fn, 0)` costs about 1.2 ms everywhere because every runtime
clamps the delay to 1 ms.

## 11–13. JSON, file I/O, typed arrays (v0.7.0, superseded)

_v0.7.0 numbers, superseded by [the v0.10.0 update](#update-current-release-against-node) (all rows except where it says otherwise)._

| Operation                      | Size                  | Node | Deno | Bun  | Nona   | Nona / Node |
| ------------------------------ | --------------------- | ---- | ---- | ---- | ------ | ----------- |
| `JSON.stringify`               | 3 000 objects, 280 KB | 1.6  | 1.1  | 1.1  | 1 400  | ×900        |
| `JSON.parse`                   | 280 KB                | 3.8  | 2.1  | 3.7  | 173    | ×45         |
| `appendFileSync` × 10          | 10 MB                 | 5.9  | 12.0 | 3.3  | 4 530  | ×770        |
| `readFileSync(path, "utf8")`   | 10 MB                 | 25.2 | 26.8 | 6.0  | 25 200 | ×1 000      |
| `Float64Array`: fill, sum, map | 1M                    | 21.1 | 17.1 | 16.2 | 360    | ×17         |
| `Float64Array`: fill, sum, map | 10M                   | 159  | 132  | 115  | 3 240  | ×20         |

Typed arrays are the only data test where Nona stays within one order of
magnitude and scales linearly. JSON and files hit the same quadratic string
building: `JSON.stringify` of 3 000 objects takes 1.4 s and 1.7 GB; the full
300k-object / 30 MB scenario and the 100 MB file did not finish in 10
minutes, where Node, Deno and Bun take 0.1–0.7 s.

## 14–15. Function calls, closures, classes (v0.7.0, superseded)

_v0.7.0 numbers, superseded by [the v0.10.0 update](#update-current-release-against-node) (all rows except where it says otherwise)._

| Operation                                | N = 100k |      |      |      |             | N = 1M |        |
| ---------------------------------------- | -------- | ---- | ---- | ---- | ----------- | ------ | ------ |
|                                          | Node     | Deno | Bun  | Nona | Nona / Node | Node   | Nona   |
| Call `add(a, b)` × 10N                   | 5.3      | 7.6  | 6.1  | 375  | ×71         | 10.9   | 3 590  |
| Create and call N closures               | 21.3     | 18.1 | 20.6 | 872  | ×41         | 256    | 12 000 |
| `call` + `apply` × 4N                    | 9.1      | 10.8 | 5.2  | 656  | ×72         | 32.6   | 12 000 |
| Method through an inheritance chain × 5N | 5.3      | 3.7  | 5.8  | 354  | ×67         | 7.6    | 3 710  |
| Polymorphic call, 3 classes × 5N         | 5.5      | 8.6  | 15.5 | 532  | ×96         | 21.5   | 5 830  |
| `new Square(i)` × N                      | 14.9     | 9.0  | 13.7 | 774  | ×52         | 112    | 10 560 |

These scale linearly, so the gap here is the pure cost of a call without a
JIT: V8 and JavaScriptCore inline `add(s, i)` and cache the method lookup at
the call site, while Nona takes the generic path with a prototype-chain
lookup every time. `apply` with a fresh array per call is the exception that
grows faster than linear (×72 at 100k, ×369 at 1M), as does `new` with a
million live instances (777 MB RSS).

## Real-world code

The scripts above are micro-benchmarks written for Nona. [`bench/real/`](bench/real/)
runs unmodified libraries instead: `node bench/real/fetch.mjs` downloads
pinned versions from npm into a git-ignored `vendor` directory, and
`node bench/run.mjs --real` builds and runs them (measured 2026-10-03, Node.js
22.22.2, same machine, best of 3).

| Benchmark                                                       | Node | Nona   | Nona / Node |
| --------------------------------------------------------------- | ---- | ------ | ----------- |
| acorn 8.18.0 parses its own 233 KB source, first parse (ms)     | 117  | 1 604  | ×14         |
| … then 10 more parses (ms)                                      | 247  | 12 855 | ×52         |
| Whole program, wall time (s)                                    | 0.43 | 14.6   | ×34         |
| marked 12.0.2 renders a 200-section document, first render (ms) | 24   | 1 587  | ×66         |
| … then 5 more renders (ms)                                      | 53   | 7 716  | ×146        |

Both produce the same tree (32 757 nodes, `locations: true`). The first
parse is the closest to a real one-shot use: V8 has not optimized acorn yet,
so the gap is ×14; with the JIT warm it grows to ×52, about the ratio of the
call and closure benchmarks above.

marked compiles since class fields (#106). Its lexer matches anchored regular
expressions against the rest of the document, which was quadratic before #107
(162 s for the five renders). Before #114 the remaining gap, as for acorn,
was led by property lookup in linked property nodes; see the next section for
what shapes changed and what leads the profile now.

### Shapes and inline caches (#114)

Plain objects now keep their named properties in slots described by shared
hidden classes, and every `object.name` site has an inline cache keyed by
shape ([docs/object-model.md](docs/object-model.md)). Measured on 2026-10-07
on the same benchmarks, `main` (`ea6934b`) against the branch, interleaved,
best of 3 (2-core shared machine, so differences under ~5% are noise):

| Benchmark                                        | main              | #114   | Change |
| ------------------------------------------------ | ----------------- | ------ | ------ |
| acorn, first parse (ms)                          | 1 111             | 970    | −13%   |
| acorn, 10 more parses (ms)                       | 8 718             | 8 227  | −6%    |
| acorn, peak RSS (MB)                             | 229               | 99     | −57%   |
| marked, first render (ms)                        | 1 345             | 1 291  | −4%    |
| marked, 5 more renders (ms)                      | 6 940             | 6 747  | −3%    |
| marked, peak RSS (MB)                            | 53                | 43     | −19%   |
| self-hosted compiler, stage 1 → stage 2 peak RSS | > 5.8 GB (killed) | 3.6 GB |        |

A plain object with five properties is now one 192-byte block (40-byte heap
header, 72-byte object header, five 16-byte slots) instead of a header plus
five 72-byte property nodes; a million such objects take 209 MB of RSS
instead of 514 MB (Node.js: 93 MB). Executables grow by 2–4% (the cache
records and the shape runtime).

The issue asked for acorn and marked to run twice as fast; they do not.
Property lookup in plain objects is no longer what leads the profile; what
remains is outside the object model of plain objects:

- receivers that are still dictionary objects: function objects (62% of the
  dictionary-receiver cache lookups in acorn) and typed arrays (`.length`,
  28%);
- element access `a[i]`, which still goes through `rt.getProperty` and
  `rt.setProperty` and dominates the RegExp VM that marked spends its time in;
- variable cells (`readCell`), calls and the collector, which account for
  most of the rest, as in the call and closure benchmarks.

## HTTP server

Nona's own HTTP/1.1 implementation behind `node:http` (#115) against Node.js
22 on the same server program, [`bench/http/server.mjs`](bench/http/server.mjs):
`hello` (`res.end("Hello, World!")`, keep-alive), `json` (`JSON.stringify` of
a small object), `headers` (ten request headers read, five response headers
set), `close` (`Connection: close`, a new connection per request),
`upload16k` (a 16 KiB request body read with `data` events) and `big64k`
(a 64 KiB response). [`bench/http/run.sh`](bench/http/run.sh) builds the
server, runs it pinned to one CPU and drives it from another with
[`bench/http/load.c`](bench/http/load.c) (no dependencies), `wrk` or
`autocannon`, at 1, 32 and 256 connections, five runs of 3 s per cell after a
warm-up run, and prints the tables below (median of the runs, min–max, the
median p99 latency, and the servers' RSS). The per-request instruction counts
come from [`bench/http/profile.sh`](bench/http/profile.sh), which counts the
compiled server under QEMU answering 500 requests more (exact, independent
of the machine's noise).

### 2026-10-22 (#403, commit 93e6d9e3)

**Result: no cell reaches ×2.0 of Node.js 22 on this machine.** The best
ratios are ×1.67 (`big64k`, `load.c`, 256 connections) and ×1.64 (`json`);
a keep-alive `hello` is ×1.33–1.58 and the 16 KiB upload ×0.9–1.2. The
issue stays open; the table below says where each case stands and why.

Machine: Windows 11 host, 13th Gen Intel Core i7-13620H (16 logical CPUs),
the servers and the load generators running in WSL2 (Ubuntu, kernel
6.18.54.1-microsoft-standard-WSL2; no CPU governor is exposed), shared with a
person working on it (the spread of a cell's five runs is 5–25%). Node.js
v22.23.2 (the Linux x64 release binary, in the same WSL2 instance; there is no
newer Node.js on this machine), Nona 0.23.0 at commit 93e6d9e3, the server
built with `--target linux-x64 --module`. `bench/http/run.sh` with the server
on CPU 4 and the client on CPU 5, five runs of 3 s per cell after a 2 s
warm-up, `wrk` built from `wg/wrk` master (one thread), `load.c` compiled with
`gcc -O2`. `oha`, `bombardier` and `autocannon` are not installed here
(`GEN=autocannon` is supported; it runs in Node.js and saturates a CPU at a
few tens of thousands of requests per second, so it would measure itself).
Windows x64 (the native PE server) was not measured: the machine has no C
compiler or `wrk` for Windows, and the Node.js client of `client.mjs` is
slower than the servers (see "Windows" in [`bench/README.md`](bench/README.md)).

#### Instructions per request (QEMU, `bench/http/profile.sh`)

Exact and independent of machine noise. The "2026-10-19" column is the
counter of the superseded section below; since then `scripts/profile-runtime.mjs`
counts every instruction of a QEMU that prints one line per block (earlier
counts made with such a QEMU were too low), so the two columns are not on the
same scale: the `main`-to-now change of this branch is in the changelog.

| Case      | Before #403 | 2026-10-19 | Now (93e6d9e3) |
| --------- | ----------- | ---------- | -------------- |
| hello     | 88.5k       | 32.3k      | 30.3k          |
| json      | 93.7k       | 37.1k      | 42.0k          |
| headers   | 185.1k      | 74.9k      | 51.9k          |
| close     | 208.8k      | 70.1k      | 73.2k          |
| upload16k | 174.1k      | 83.8k      | 67.6k          |
| big64k    | 154.2k      | 99.2k      | 97.2k          |

(`json` and `close` rose against the 2026-10-19 column because of the
corrected counting, not a regression: on the same counter `main` before this
branch had 48.0k and 79.8k.) The remaining cost is flat: property reads that hit
(`rt.icGet`, 144–257 per request at about 30 instructions), calls
(`rt.invoke` and frame setup, 20–60 per request), the JavaScript of
`ServerResponse.end` and `ServerConnection.request`, and for `upload16k` the
collections that 16 KiB of body per request bring (about 12k instructions per
request); no single routine is above 15%.

#### Throughput and latency, `wrk` (1, 32 and 256 connections)

| Case      | Connections | Node.js req/s (median, min–max) | Nona req/s (median, min–max) | Nona / Node | p99 Node / Nona, ms | RSS Node / Nona, MB |
| --------- | ----------- | ------------------------------- | ---------------------------- | ----------- | ------------------- | ------------------- |
| hello     | 1           | 5.5k (5.2k–5.6k)                | 6.4k (6.0k–6.6k)             | ×1.16       | 0.557 / 0.47        | 70 / 18             |
| json      | 1           | 5.8k (5.2k–6.5k)                | 6.2k (5.7k–6.4k)             | ×1.07       | 0.505 / 0.493       | 70 / 18             |
| headers   | 1           | 4.8k (3.2k–5.9k)                | 6.3k (6.0k–8.0k)             | ×1.32       | 0.94 / 0.607        | 69 / 24             |
| close     | 1           | 2.2k (2.1k–2.2k)                | 2.6k (2.4k–2.6k)             | ×1.16       | 0.479 / 0.501       | 68 / 18             |
| upload16k | 1           | 5.1k (4.6k–5.5k)                | 6.3k (5.9k–6.5k)             | ×1.24       | 0.446 / 0.498       | 70 / 18             |
| big64k    | 1           | 3.4k (3.0k–3.9k)                | 4.0k (3.9k–4.1k)             | ×1.17       | 0.632 / 0.484       | 73 / 18             |
| hello     | 32          | 46.5k (45.1k–51.0k)             | 63.6k (61.8k–65.7k)          | ×1.37       | 1.48 / 1.19         | 94 / 18             |
| json      | 32          | 45.6k (44.6k–47.0k)             | 57.9k (55.7k–59.9k)          | ×1.27       | 1.53 / 1.40         | 94 / 18             |
| headers   | 32          | 38.5k (37.2k–39.7k)             | 54.4k (51.6k–55.9k)          | ×1.41       | 1.89 / 1.40         | 79 / 24             |
| close     | 32          | 10.8k (10.6k–11.4k)             | 13.7k (13.2k–14.6k)          | ×1.27       | 3.81 / 3.06         | 74 / 18             |
| upload16k | 32          | 28.1k (26.0k–28.9k)             | 25.0k (24.4k–28.8k)          | ×0.89       | 2.51 / 3.21         | 97 / 18             |
| big64k    | 32          | 14.6k (14.2k–15.3k)             | 22.5k (21.8k–22.9k)          | ×1.54       | 4.47 / 2.56         | 102 / 18            |
| hello     | 256         | 42.7k (42.0k–43.6k)             | 67.6k (62.3k–68.5k)          | ×1.58       | 11.99 / 7.81        | 120 / 19            |
| json      | 256         | 39.8k (37.3k–41.6k)             | 60.3k (58.1k–61.5k)          | ×1.52       | 12.79 / 8.42        | 117 / 19            |
| headers   | 256         | 36.8k (36.7k–38.3k)             | 51.7k (48.9k–54.6k)          | ×1.41       | 13.56 / 9.99        | 103 / 25            |
| close     | 256         | 9.7k (9.4k–10.0k)               | 14.6k (14.3k–15.0k)          | ×1.51       | 31.59 / 21.22       | 81 / 19             |
| upload16k | 256         | 27.2k (26.3k–27.6k)             | 30.0k (28.5k–31.2k)          | ×1.10       | 18.54 / 16.60       | 140 / 20            |
| big64k    | 256         | 13.3k (12.9k–13.4k)             | 21.7k (20.9k–22.4k)          | ×1.63       | 36.89 / 22.50       | 122 / 19            |

#### Throughput and latency, `load.c` (1, 32 and 256 connections)

| Case      | Connections | Node.js req/s (median, min–max) | Nona req/s (median, min–max) | Nona / Node | p99 Node / Nona, ms | RSS Node / Nona, MB |
| --------- | ----------- | ------------------------------- | ---------------------------- | ----------- | ------------------- | ------------------- |
| hello     | 1           | 7.3k (6.4k–7.8k)                | 8.2k (7.9k–9.7k)             | ×1.13       | 0.368 / 0.362       | 71 / 18             |
| json      | 1           | 6.8k (6.0k–7.5k)                | 7.5k (7.0k–8.4k)             | ×1.11       | 0.373 / 0.399       | 71 / 18             |
| headers   | 1           | 6.3k (6.1k–6.8k)                | 7.4k (6.8k–8.6k)             | ×1.18       | 0.428 / 0.488       | 68 / 24             |
| close     | 1           | 2.4k (2.4k–2.5k)                | 2.7k (2.6k–2.7k)             | ×1.10       | 0.534 / 0.469       | 68 / 18             |
| upload16k | 1           | 5.1k (4.9k–6.4k)                | 6.2k (5.5k–6.7k)             | ×1.22       | 0.506 / 0.577       | 72 / 18             |
| big64k    | 1           | 3.4k (3.3k–3.7k)                | 4.2k (3.1k–4.5k)             | ×1.22       | 0.561 / 0.593       | 73 / 18             |
| hello     | 32          | 50.8k (47.4k–51.6k)             | 67.5k (65.4k–70.4k)          | ×1.33       | 1.355 / 1.069       | 100 / 18            |
| json      | 32          | 49.0k (48.4k–49.9k)             | 64.2k (61.0k–65.6k)          | ×1.31       | 1.385 / 1.246       | 99 / 18             |
| headers   | 32          | 40.1k (39.6k–42.4k)             | 59.0k (56.6k–60.9k)          | ×1.47       | 1.729 / 1.290       | 80 / 24             |
| close     | 32          | 11.5k (10.9k–11.9k)             | 15.1k (14.8k–15.2k)          | ×1.31       | 3.605 / 2.790       | 80 / 18             |
| upload16k | 32          | 26.4k (25.7k–28.2k)             | 28.8k (28.2k–29.4k)          | ×1.09       | 2.545 / 2.565       | 95 / 18             |
| big64k    | 32          | 15.3k (15.1k–15.4k)             | 24.4k (24.0k–25.5k)          | ×1.60       | 4.267 / 2.410       | 100 / 18            |
| hello     | 256         | 45.2k (43.4k–46.4k)             | 70.6k (66.9k–76.3k)          | ×1.56       | 11.467 / 7.700      | 119 / 19            |
| json      | 256         | 37.5k (31.4k–41.6k)             | 61.5k (59.9k–62.4k)          | ×1.64       | 13.533 / 8.883      | 119 / 19            |
| headers   | 256         | 37.8k (34.9k–39.0k)             | 56.1k (53.1k–57.4k)          | ×1.48       | 13.456 / 9.539      | 103 / 26            |
| close     | 256         | 10.2k (9.8k–10.8k)              | 14.9k (14.4k–15.2k)          | ×1.46       | 31.705 / 21.180     | 74 / 19             |
| upload16k | 256         | 22.6k (21.4k–22.8k)             | 25.9k (25.8k–26.8k)          | ×1.15       | 22.437 / 19.825     | 139 / 20            |
| big64k    | 256         | 13.4k (13.1k–13.8k)             | 22.4k (22.0k–22.8k)          | ×1.67       | 36.279 / 22.960     | 116 / 19            |

#### Reading the tables

- **Cells at ×2.0 or more: none** (36 cells, 18 per generator). Highest per
  case at 32 or 256 connections: `hello` ×1.58 (wrk) / ×1.56 (load.c),
  `json` ×1.64 / ×1.52, `headers` ×1.41–1.48, `close` ×1.51 / ×1.46,
  `big64k` ×1.67 / ×1.63, `upload16k` ×1.10–1.15 (×0.89 at 32 connections with
  `wrk`, within its spread).
- **One connection** is ×1.07–1.32: every request is a round trip between two
  CPUs through the (virtualized) loopback, which costs both runtimes the same
  and dominates a request that takes 15–25 µs of user time.
- **Why the 2026-10-19 ratios (×2.1–3.3 with `wrk`) are not reproduced.** They
  were measured on a 2-vCPU cloud VM where Node.js served 12–14k req/s; on this
  machine Node.js serves 3–4 times as much (hello 43–51k) while Nona's gain in
  instructions is the same, so the fixed cost the two runtimes share — the
  kernel's `read`, `sendto` and `epoll_wait` (about 9 µs of system time per
  `hello` request on the cloud VM, more under WSL2's virtualized network
  stack) and the load generator on the other CPU — is a larger fraction of
  Nona's request, and a runtime that has cut its user-space time to a third
  cannot go beyond the kernel's share. Not measured separately on this
  machine (no `perf` here); the argument rests on the earlier system-time
  figure and on the ratios rising with the connection count, where one
  `epoll_wait` serves more requests.
- **Closest to the target:** `big64k` (the kernel copies 64 KiB per
  response for both) and `hello`/`json` at 256 connections. `close` is
  limited by connection setup in the kernel (about 14–15k connections per
  second for Nona, 10–11k for Node.js on this machine).
- **p99 latency** at these loads is 0.6–0.9 of Node's in most cells at 32 and
  256 connections (hello 256: 7.7 vs 12.0 ms with `wrk`), not the ½ of the
  target; with one connection and for `upload16k` it is within noise of
  Node's. The loads are saturating, not a fixed rate, so this is the queueing
  time at the saturation point; a fixed-rate measurement (wrk2) was not run.
- **RSS** after the runs: Nona 18–26 MB, Node.js 68–140 MB, so memory stays
  well below Node's (about a quarter or less).
- What would be needed for ×2.0 on `hello`/`json`/`headers`/`close`: roughly
  another halving of the user-space instructions (the profile has no single
  routine above 15%, so it means cheaper property reads and calls in general,
  or batching several requests per `epoll_wait`), and a fix for the upload
  path's per-request garbage.

### Superseded: 2026-10-19 (#403, first part)

Measured on 2026-10-19 at #403 (commit e382471a and the two commits after
it) on the Linux x86-64 cloud VM of the other tables (Intel Xeon 2.80 GHz,
2 vCPUs, 7 GB, kernel 6.18, no CPU governor exposed, shared with other
jobs: the spread of five runs is often 20% and single cells are sometimes
disturbed), Node.js 22.22.0.

#### Instructions per request (QEMU, `bench/http/profile.sh`)

| Case      | Before #403 | After #403 | Ratio |
| --------- | ----------- | ---------- | ----- |
| hello     | 88.5k       | 32.3k      | ×2.7  |
| json      | 93.7k       | 37.1k      | ×2.5  |
| headers   | 185.1k      | 74.9k      | ×2.5  |
| close     | 208.8k      | 70.1k      | ×3.0  |
| upload16k | 174.1k      | 83.8k      | ×2.1  |
| big64k    | 154.2k      | 99.2k      | ×1.6  |

QEMU counts every iteration of `rep movsb` as an instruction, so the
upload16k and big64k figures include about 16k and 65k for the body copy
that takes a few hundred cycles on the processor; without it they are about
68k and 34k. The kernel's share is the same for both runtimes: a hello
request costs the server process about 9 µs of system time (one `read`,
one `sendto`, a share of `epoll_wait`) and, after #403, about 10 µs of user
time (Node.js 22: 25 µs).

#### Throughput and latency, `wrk` (`GEN=wrk`, 32 and 256 connections)

| Case      | Connections | Node.js req/s (median, min–max) | Nona req/s (median, min–max) | Nona / Node | p99 Node / Nona, ms | RSS Node / Nona, MB |
| --------- | ----------- | ------------------------------- | ---------------------------- | ----------- | ------------------- | ------------------- |
| hello     | 32          | 14.0k (13.0k–14.2k)             | 30.9k (28.1k–37.3k)          | **×2.20**   | 5.35 / 3.88         | 73 / 17             |
| json      | 32          | 13.0k (9.7k–14.5k)              | 29.5k (28.3k–32.0k)          | **×2.27**   | 6.44 / 3.59         | 73 / 17             |
| headers   | 32          | 12.4k (11.3k–13.3k)             | 17.2k (16.5k–19.4k)          | ×1.39       | 7.37 / 5.26         | 79 / 19             |
| close     | 32          | 6.6k (6.2k–6.7k)                | 13.9k (13.3k–14.0k)          | **×2.11**   | 10.10 / 6.05        | 72 / 17             |
| upload16k | 32          | 12.1k (11.8k–13.0k)             | 14.7k (13.7k–16.0k)          | ×1.22       | 6.69 / 5.60         | 77 / 17             |
| big64k    | 32          | 6.3k (5.7k–7.0k)                | 19.1k (16.1k–20.5k)          | **×3.02**   | 10.42 / 7.67        | 94 / 17             |
| hello     | 256         | 13.7k (11.7k–14.3k)             | 29.5k (23.8k–31.4k)          | **×2.16**   | 34.24 / 16.39       | 103 / 18            |
| json      | 256         | 12.9k (11.2k–13.5k)             | 28.0k (25.2k–29.0k)          | **×2.17**   | 29.74 / 18.45       | 103 / 18            |
| headers   | 256         | 12.4k (11.5k–13.3k)             | 17.6k (15.9k–18.9k)          | ×1.41       | 36.39 / 23.19       | 100 / 20            |
| close     | 256         | 7.2k (5.4k–7.7k)                | 15.6k (14.8k–17.3k)          | **×2.17**   | 60.11 / 36.34       | 78 / 17             |
| upload16k | 256         | 12.0k (10.7k–12.6k)             | 15.9k (15.0k–16.9k)          | ×1.33       | 43.12 / 25.11       | 137 / 18            |
| big64k    | 256         | 6.3k (5.7k–6.8k)                | 21.0k (18.2k–24.6k)          | **×3.32**   | 57.39 / 24.16       | 104 / 18            |

#### Throughput and latency, `load.c` (`GEN=load`, 1, 32 and 256 connections)

`load.c` keeps one request in flight per connection and costs the client
CPU less than `wrk`, so both servers reach higher rates with it; with one
connection every request is a round trip between the two CPUs, which costs
both runtimes about the same.

| Case      | Connections | Node.js req/s (median, min–max) | Nona req/s (median, min–max) | Nona / Node | p99 Node / Nona, ms | RSS Node / Nona, MB |
| --------- | ----------- | ------------------------------- | ---------------------------- | ----------- | ------------------- | ------------------- |
| hello     | 1           | 24.8k (24.5k–26.1k)             | 25.8k (22.6k–28.8k)          | ×1.04       | 0.151 / 0.124       | 75 / 17             |
| json      | 1           | 23.4k (20.8k–24.7k)             | 22.6k (20.6k–26.3k)          | ×0.97       | 0.141 / 0.134       | 74 / 17             |
| headers   | 1           | 17.3k (16.2k–19.0k)             | 17.4k (14.1k–20.2k)          | ×1.01       | 0.211 / 0.154       | 68 / 19             |
| close     | 1           | 7.2k (6.8k–7.9k)                | 8.1k (7.7k–9.0k)             | ×1.12       | 0.404 / 0.299       | 72 / 17             |
| upload16k | 1           | 12.8k (11.0k–15.0k)             | 15.9k (12.7k–17.0k)          | ×1.25       | 0.262 / 0.209       | 76 / 16             |
| big64k    | 1           | 6.3k (6.0k–6.5k)                | 10.2k (5.5k–11.0k)           | ×1.61       | 0.625 / 0.220       | 73 / 17             |
| hello     | 32          | 23.0k (22.3k–26.6k)             | 49.0k (44.6k–51.5k)          | **×2.13**   | 3.078 / 2.281       | 84 / 17             |
| json      | 32          | 22.4k (19.3k–24.5k)             | 39.5k (35.5k–42.0k)          | ×1.77       | 3.751 / 2.930       | 83 / 17             |
| headers   | 32          | 20.8k (17.2k–22.0k)             | 24.8k (22.8k–29.4k)          | ×1.19       | 3.508 / 3.795       | 77 / 19             |
| close     | 32          | 8.1k (6.2k–8.5k)                | 14.4k (13.6k–16.8k)          | ×1.78       | 9.466 / 5.812       | 71 / 17             |
| upload16k | 32          | 19.2k (17.8k–20.6k)             | 20.5k (16.7k–21.0k)          | ×1.07       | 4.332 / 4.303       | 93 / 17             |
| big64k    | 32          | 8.2k (7.0k–9.9k)                | 22.9k (19.8k–23.3k)          | **×2.78**   | 8.112 / 3.969       | 95 / 17             |
| hello     | 256         | 23.5k (19.1k–24.3k)             | 37.7k (35.3k–45.2k)          | ×1.61       | 23.653 / 13.760     | 106 / 18            |
| json      | 256         | 23.0k (20.3k–24.0k)             | 41.3k (36.3k–42.3k)          | ×1.80       | 22.768 / 13.223     | 110 / 18            |
| headers   | 256         | 20.9k (18.7k–21.9k)             | 28.1k (26.0k–29.3k)          | ×1.34       | 20.708 / 19.157     | 100 / 20            |
| close     | 256         | 10.1k (9.5k–11.2k)              | 15.8k (14.1k–16.8k)          | ×1.57       | 43.281 / 23.992     | 73 / 17             |
| upload16k | 256         | 17.8k (16.4k–19.2k)             | 18.5k (17.1k–19.5k)          | ×1.04       | 28.777 / 27.371     | 130 / 17            |
| big64k    | 256         | 8.1k (7.2k–8.9k)                | 20.6k (18.9k–21.7k)          | **×2.55**   | 46.071 / 24.553     | 105 / 18            |

(The 32-connection rows were re-measured after a first run was disturbed by
other jobs on the VM.)

A hello request on Node.js 22 cost about the same number of instructions
as on Nona before #403 (72k and 68k by callgrind at v0.9.0, 88k by QEMU on
the program above); after #403 Nona executes about a third of what it did.
Where a request's instructions go after #403
(hello, two connections under QEMU): `ServerConnection.request` (parsing
the head's results, the two message objects and the `request` event) 5.3k,
`ServerResponse.end` (composing and writing the head and body) 5.2k, the
event loop's poll, dispatch and microtask checkpoint 4k, the request's
completion 1.4k, `setHeader` 1.1k, the socket's read and write 1.7k; the
rest is spread over the stream and emitter methods. Property reads
(`rt.icGet`, 160 per request) and calls (`rt.invoke` and the frame setup,
60 per request) are a third of the total: the remaining distance to Node.js
on a single request is the cost of those operations, not of the HTTP code.
What #403 changed and what remains is in its pull request.

### Superseded: 2026-10-05 (v0.9.0)

| Case                                      | Node.js req/s | Nona req/s | p99 Node.js / Nona       | RSS Node.js / Nona |
| ----------------------------------------- | ------------- | ---------- | ------------------------ | ------------------ |
| hello (keep-alive, 13-byte body)          | 71–72k        | 61–70k     | 1.4–1.6 / 1.7–2.2 ms     | 80 / 16 MB         |
| json (`JSON.stringify` of a small object) | 66–68k        | 55–61k     | 1.6 / 2.0–2.2 ms         | 79 / 16 MB         |
| close (new connection per request)        | 25–27k        | 22–26k     | 4.3–4.6 / 4.1–4.6 ms     | 70 / 18 MB         |
| big64k (64 KiB response)                  | 20–21k        | **33–38k** | 4.5–5.2 / **2.7–3.0 ms** | 91 / 16 MB         |
| upload16k (16 KiB request body)           | 49–54k        | 41k        | 1.8–2.1 / 2.5–2.9 ms     | 78 / 16 MB         |

(50 connections, 4 s per case, an idle machine about twice as fast as the
VM above.) How the server and the runtime got there is described in the
pull request of #115 and the commits it lists.

## Where the time goes (v0.7.0 analysis)

_This is the v0.7.0 analysis. Causes 1 and 3 were fixed and 4 largely (see [the update](#update-current-release-against-node)); string copying, call overhead and allocation remain._

Grouping the ratios against Node by their cause:

1. **Linear property/element/Map storage** (issue #36): `Map`/`Set` ×7 000–18 000,
   `sort` ×523, matrix multiply ×857, `new Array(N)` ×143. Fixing the data
   structures turns these into the ~×30 of the surrounding code.
2. **Copying strings**: concatenation ×156, `join` ×470 with quadratic
   memory, `JSON.stringify` ×900, `readFileSync` utf8 ×1 000, `appendFileSync`
   ×770. A rope or builder representation, and bulk UTF-8/UTF-16 transcoding,
   address all of these at once.
3. **Promise job queue** ×53 000 and **BigInt multiplication** ×11 700 at 300
   digits: both are algorithmic, independent of code generation.
4. **RegExp VM** ×13 000: a bytecode interpreter written in JavaScript and
   itself compiled by Nona, so it pays the ×30 call overhead per instruction.
5. **No JIT**: calls ×70, closures ×41, classes ×50–100, allocation ×93–213,
   `fib` ×25, typed arrays ×17–20, array traversal ×18–37. Shape-based
   property access with inline caches (#114, [above](#shapes-and-inline-caches-114))
   covers plain objects; unboxed number arithmetic is the other usual answer
   in an AOT setting.
