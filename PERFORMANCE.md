# Performance: Nona vs Node.js, Deno and Bun

Measured on 2026-10-01 against Nona `v0.7.0` (commit `b31c4d6`); sections that
carry their own date were measured later. Nona and Node.js were measured again
on 2026-10-08 for v0.10.0, see [the v0.10.0 update](#update-current-release-against-node).
The v0.7.0 tables below are kept for the record and are marked *superseded*
where the update replaces them. The scripts live in [`bench/`](bench/);
`node bench/run.mjs` reproduces every table (protocol in [`bench/README.md`](bench/README.md)).

## Update: current release against Node

Measured on 2026-10-08 at `main` 6c4b396 (v0.10.0 plus the Lean proofs PR) on
Windows x64 with Node.js 22.23.2: `node bench/run.mjs --scale 0.1 --runs 3
--runtimes node,nona --only 05,06,07,08,09,10,11,13,14,15`, median of 3 runs.
`--scale 0.1` is a tenth of the nominal size in each script, which is the
N = 100 000 of sections 5–7 and 14–15. Deno and Bun are not installed on the
measuring machine, so only Node is compared. The machine was a desktop in
normal use with other Node processes running: treat differences of about ×1.5
or less as noise. `12_fs.mjs` is not re-measured because it writes to `/tmp`,
which does not exist on Windows.

| Operation | Node, ms | Nona, ms | Nona / Node | v0.7.0 |
| --- | --- | --- | --- | --- |
| `push` × N | 5.75 | 4.84 | ×0.8 | ×37 |
| `Array.from({length: N})` | 7.83 | 31.6 | ×4.0 | ×36 |
| `new Array(N)` + fill | 2.13 | 2.63 | ×1.2 | ×143 |
| Sum with a `for` loop | 2.46 | 1.02 | ×0.4 | ×18 |
| `map` → `filter` → `reduce` | 4.52 | 10.7 | ×2.4 | ×27 |
| `sort` N numbers with a comparator | 47.7 | 179 | ×3.8 | ×523 |
| Create N objects `{id, x, y, name}` | 18.5 | 39.5 | ×2.1 | ×33 |
| Read 3 properties × N | 8.85 | 4.72 | ×0.5 | ×9 |
| `Map.set` × N | 16.2 | 17.5 | ×1.1 | ×6 700 |
| `Map.get` × N | 5.92 | 14.0 | ×2.4 | ×18 000 |
| `Set.add` + `Set.has` × N | 14.8 | 41.6 | ×2.8 | ×15 000 |
| `s += "abc" + i` × 20 000 | 4.50 | 1 070 | ×237 | ×156 (2 000 iterations) |
| `split("1")` + `join("-")` | 2.06 | 4.25 | ×2.1 | ×470 (N = 10 000) |
| `indexOf` in a loop | 0.21 | 0.31 | ×1.5 | ×3 |
| `/abc(\d{3})-/g.exec` in a loop | 0.26 | 59.4 | ×227 | ×13 000 |
| `fib(32)` recursive | 29.2 | 82.8 | ×2.8 | ×25 |
| 200×200 matrix multiply | 35.4 | 284 | ×8.0 | ×857 |
| BigInt factorial 3000! | 0.17 | 1.12 | ×6.4 | > 10 min |
| 500k short-lived `{a, b: [..], c: {..}}` | 23.5 | 315 | ×13 | ×93 |
| Promise chain, `.then` × 100 000 | 32.1 | 1 256 | ×39 | ×53 000 (10 000) |
| 1 000 sequential `setTimeout(fn, 0)` | 15 242 | 15 654 | ×1.0 | ×1.0 |
| `JSON.stringify`, 30 000 objects, 2.9 MB | 23.8 | 33.5 | ×1.4 | ×900 (3 000 objects) |
| `JSON.parse`, 2.9 MB | 37.6 | 51.3 | ×1.4 | ×45 (280 KB) |
| `Float64Array`: fill, sum, map, 1M | 14.5 | 48.2 | ×3.3 | ×17 |
| Call `add(a, b)` × 10N | 3.66 | 44.0 | ×12 | ×71 |
| Create and call N closures | 13.96 | 70.5 | ×5.1 | ×41 |
| `call` + `apply` × 4N | 8.49 | 69.5 | ×8.2 | ×72 |
| Method through an inheritance chain × 5N | 6.32 | 66.0 | ×10 | ×67 |
| Polymorphic call, 3 classes × 5N | 7.33 | 75.8 | ×10 | ×96 |
| `new Square(i)` × N | 14.97 | 69.9 | ×4.7 | ×52 |

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
- `JSON.stringify` still builds a UTF-16 string first (#155). Since #45 it reads plain data (shaped objects, dense arrays) directly: 30 000 objects take 30 ms instead of 72 ms on the machine of the 2026-10-05 HTTP measurement (Node.js: 17 ms).
- The Promise chain (×39) keeps one record per `.then` and a linked job queue since #44: on a Linux x64 VM the 100 000-reaction chain went from 1 450 ms to 460 ms (Node.js 31 ms) and 100 000 sequential `await`s from 1 070 ms to 230 ms. Promises are still ordinary objects whose state lives in a WeakMap; a dedicated native promise kind is the remaining step.

Sections 1–4 (startup, size, build time, memory), the executable size, the
real-world code and the HTTP server tables are not covered by this update and
keep the date and version they state.

## Summary (v0.7.0, superseded)

*Measured against v0.7.0. The operations in the table below are re-measured in [the v0.10.0 update](#update-current-release-against-node): in that re-measurement the Map/Set, sort, Promise and JSON rows are no longer quadratic and string concatenation still is; `readFileSync` was not re-measured.*

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

| Operation | Nona at 10k | Nona at 100k | Growth | Node at 100k |
| --- | --- | --- | --- | --- |
| `Map.set` × N | 0.83 s | 92.7 s | ×111 (quadratic) | 14 ms |
| `Set.add` + `Set.has` × N | 1.7 s | 182 s | ×107 (quadratic) | 12 ms |
| `sort()` of N numbers | 1.3 s | 20.4 s | ×16 (quadratic) | 39 ms |
| Promise chain of N `.then` | 363 s | > 10 min | ×145 for 1k → 10k | 7 ms |
| `JSON.stringify`, N objects | 1.4 s, 1.7 GB RSS | > 10 min | — | 1.6 ms |
| `s += "abc" + i` × N | 0.88 s (10k) | — | ×20 for 2k → 10k | 0.3 ms |
| `readFileSync(..., "utf8")` | 0.37 s (1 MB) | 25 s (10 MB) | ×68 for ×10 | 25 ms |

The author documents the root cause for the first group: property, element
and `Map` storage is a linear scan (issue #36). Strings are immutable UTF-16
buffers copied on every concatenation, and `Array.prototype.join`,
`JSON.stringify` and the promise job queue are built on those two primitives.

## Environment and method

| Participant | Version | Command |
| --- | --- | --- |
| Nona | 0.7.0 | `node dist/cli.js build x.js -o x --target linux-x64`, then `./x` |
| Node.js | 22.22.0 | `node x.js` |
| Deno | 2.9.6 | `deno run -A x.js` |
| Bun | 1.4.2 | `bun x.js` |

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

| How the program runs | Startup, hello world (ms, median of 30) | Executable (MB) | Build hello world into an exe (s) | Peak RSS, hello world (MB) |
| --- | --- | --- | --- | --- |
| Nona, compiled ELF | **1.8** | **7.3** | 2.7 | **11.5** |
| Bun, `bun build --compile` | 3.2 | 81.3 | **0.25** | 14.5 |
| Bun, `bun x.js` | 4.5 | 79.5 (the runtime itself) | — | 13.1 |
| Deno, `deno compile` | 12.1 | 104.3 | 0.70 | 33.0 |
| Deno, `deno run x.js` | 15.0 | 95.6 (the runtime itself) | — | 28.3 |
| Node, SEA via postject | 24.9 | 123.5 | 7.7 | 58.3 |
| Node, `node x.js` | 27.6 | 123.4 (the runtime itself) | — | 45.5 |

Nona's build time barely depends on the program (2.7 s for hello world,
3.0 s for the matrix/BigInt test): most of it is compiling the runtime and
the JavaScript preludes that go into every executable.

Peak RSS under load, full-size scripts (MB):

| Script | Node | Deno | Bun | Nona |
| --- | --- | --- | --- | --- |
| 09 — 5M short-lived objects | 53 | 44 | 29 | **11** |
| 13 — `Float64Array` 10M | 204 | 198 | 181 | 157 |
| 15 — classes, 1M `new Square` | 129 | 124 | 77 | 777 |
| 14 — calls, 1M closures | 188 | 214 | 120 | 1 993 |
| 11 — JSON, 3k objects (N = 10k scale) | 74 | 63 | 48 | 1 732 |

The mark-and-sweep collector keeps garbage-only workloads tiny, but any
workload that keeps a million live closures or objects, or builds strings,
inflates far beyond the JIT runtimes.

### Executable size since #62

Since [#62](https://github.com/40oleg/nona/issues/62) the RegExp engine, its
Unicode property tables and the Unicode normalization tables are linked only
when the program can reach them. Measured on 2026-10-02 at the merge commit of
#62, in bytes:

| Program | linux-x64 | win32-x64 |
| --- | --- | --- |
| `console.log("hi")` | 3 067 904 | 3 092 992 |
| `console.log(/a+/.test("caab"))` (engine, no property tables) | 4 096 000 | 4 123 136 |
| A program that names `match`, `RegExp` or uses `\p{…}` | 6 299 648 | 6 327 296 |
| `console.log("hi")` with `--full-runtime` (the v0.7.0 layout) | 6 955 008 | 6 980 608 |

Startup time and peak RSS do not change: the omitted parts were never
touched by a program that does not use them.

## 5–7. Arrays, objects and Map/Set, strings and RegExp (v0.7.0, superseded)

*v0.7.0 numbers, superseded by [the v0.10.0 update](#update-current-release-against-node) (all rows except where it says otherwise).*

N = 100 000, median, ms:

| Operation | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- |
| `push` × N | 5.2 | 6.0 | 3.4 | 192 | ×37 |
| `Array.from({length: N})` | 5.1 | 4.9 | 3.1 | 183 | ×36 |
| `new Array(N)` + fill | 1.9 | 1.3 | 1.5 | 276 | ×143 |
| Sum with a `for` loop | 1.5 | 1.9 | 0.6 | 27 | ×18 |
| `map` → `filter` → `reduce` | 4.4 | 4.2 | 4.0 | 119 | ×27 |
| `sort` N numbers with a comparator | 39 | 40 | 31 | 20 400 | ×523 |
| Create N objects `{id, x, y, name}` | 14.1 | 11.9 | 9.7 | 468 | ×33 |
| Read 3 properties × N | 6.8 | 7.4 | 1.2 | 62 | ×9 |
| `Map.set` × N | 13.8 | 14.4 | 18.4 | 92 700 | ×6 700 |
| `Map.get` × N | 5.1 | 5.3 | 5.1 | 90 700 | ×18 000 |
| `Set.add` + `Set.has` × N | 12.2 | 9.7 | 15.2 | 182 500 | ×15 000 |

At the nominal N = 1M, Node/Deno/Bun run the whole array script in
0.4–0.9 s and the object script in 0.5–0.6 s. Nona sorted 1M numbers in
278 s in a first run; the full object script did not finish in 10 minutes.

Strings are measured at N = 10 000 because at 100 000 the Nona binary was
killed by the kernel after 30 s at 6 GB RSS: `Array.prototype.join` over 20k
parts builds intermediate strings and its memory grows quadratically (4k parts
→ 450 MB). `s += …` is quadratic in time (2k iterations → 43 ms, 10k →
881 ms); the RegExp engine is linear but spends about 0.5 ms per character.

| Operation (N = 10 000) | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- |
| `s += "abc" + i` × 2 000 | 0.29 | 0.49 | 0.89 | 45 | ×156 |
| `split("1")` + `join("-")` | 0.12 | 0.14 | 0.29 | 56 | ×470 |
| `indexOf` in a loop | 0.02 | 0.02 | 0.02 | 0.06 | ×3 |
| `/abc(\d{3})-/g.exec` in a loop | 0.06 | 0.07 | 0.10 | 794 | ×13 000 |

At such small N the Node/Deno/Bun figures are mostly JIT warm-up, so the
ratios in this table are, if anything, understated.

## 8–10. Numeric work, GC pressure, async (v0.7.0, superseded)

*v0.7.0 numbers, superseded by [the v0.10.0 update](#update-current-release-against-node) (all rows except where it says otherwise).*

| Operation | Size | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- | --- |
| `fib(32)` recursive | — | 23 | 24.5 | 18.3 | 568 | ×25 |
| 200×200 matrix multiply, nested arrays | — | 30 | 35.6 | 36.6 | 25 700 | ×857 |
| BigInt factorial 30! | 30 | 0.17 | 0.11 | 0.22 | 0.25 | ×1.5 |
| BigInt factorial 300! | 300 | 0.20 | 0.28 | 0.37 | 2 340 | ×11 700 |
| BigInt factorial 3000! | 3000 | 3.8 | 3.1 | 3.8 | > 10 min | — |
| 500k short-lived `{a, b: [..], c: {..}}` | 500k | 19.7 | 15.6 | 27.2 | 1 840 | ×93 |
| 5M short-lived objects | 5M | 94.6 | 98.1 | 156 | 20 100 | ×213 |
| Promise chain, `.then` × 10 000 | 10k | 6.8 | 4.1 | 2.9 | 363 000 | ×53 000 |
| `setTimeout(fn, 0)` × 100, sequential | 100 | 117 | 221 | 114 | 123 | ×1.0 |

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

*v0.7.0 numbers, superseded by [the v0.10.0 update](#update-current-release-against-node) (all rows except where it says otherwise).*

| Operation | Size | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- | --- |
| `JSON.stringify` | 3 000 objects, 280 KB | 1.6 | 1.1 | 1.1 | 1 400 | ×900 |
| `JSON.parse` | 280 KB | 3.8 | 2.1 | 3.7 | 173 | ×45 |
| `appendFileSync` × 10 | 10 MB | 5.9 | 12.0 | 3.3 | 4 530 | ×770 |
| `readFileSync(path, "utf8")` | 10 MB | 25.2 | 26.8 | 6.0 | 25 200 | ×1 000 |
| `Float64Array`: fill, sum, map | 1M | 21.1 | 17.1 | 16.2 | 360 | ×17 |
| `Float64Array`: fill, sum, map | 10M | 159 | 132 | 115 | 3 240 | ×20 |

Typed arrays are the only data test where Nona stays within one order of
magnitude and scales linearly. JSON and files hit the same quadratic string
building: `JSON.stringify` of 3 000 objects takes 1.4 s and 1.7 GB; the full
300k-object / 30 MB scenario and the 100 MB file did not finish in 10
minutes, where Node, Deno and Bun take 0.1–0.7 s.

## 14–15. Function calls, closures, classes (v0.7.0, superseded)

*v0.7.0 numbers, superseded by [the v0.10.0 update](#update-current-release-against-node) (all rows except where it says otherwise).*

| Operation | N = 100k | | | | | N = 1M | |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | Node | Deno | Bun | Nona | Nona / Node | Node | Nona |
| Call `add(a, b)` × 10N | 5.3 | 7.6 | 6.1 | 375 | ×71 | 10.9 | 3 590 |
| Create and call N closures | 21.3 | 18.1 | 20.6 | 872 | ×41 | 256 | 12 000 |
| `call` + `apply` × 4N | 9.1 | 10.8 | 5.2 | 656 | ×72 | 32.6 | 12 000 |
| Method through an inheritance chain × 5N | 5.3 | 3.7 | 5.8 | 354 | ×67 | 7.6 | 3 710 |
| Polymorphic call, 3 classes × 5N | 5.5 | 8.6 | 15.5 | 532 | ×96 | 21.5 | 5 830 |
| `new Square(i)` × N | 14.9 | 9.0 | 13.7 | 774 | ×52 | 112 | 10 560 |

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

| Benchmark | Node | Nona | Nona / Node |
| --- | --- | --- | --- |
| acorn 8.18.0 parses its own 233 KB source, first parse (ms) | 117 | 1 604 | ×14 |
| … then 10 more parses (ms) | 247 | 12 855 | ×52 |
| Whole program, wall time (s) | 0.43 | 14.6 | ×34 |
| marked 12.0.2 renders a 200-section document, first render (ms) | 24 | 1 587 | ×66 |
| … then 5 more renders (ms) | 53 | 7 716 | ×146 |

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

| Benchmark | main | #114 | Change |
| --- | --- | --- | --- |
| acorn, first parse (ms) | 1 111 | 970 | −13% |
| acorn, 10 more parses (ms) | 8 718 | 8 227 | −6% |
| acorn, peak RSS (MB) | 229 | 99 | −57% |
| marked, first render (ms) | 1 345 | 1 291 | −4% |
| marked, 5 more renders (ms) | 6 940 | 6 747 | −3% |
| marked, peak RSS (MB) | 53 | 43 | −19% |
| self-hosted compiler, stage 1 → stage 2 peak RSS | > 5.8 GB (killed) | 3.6 GB | |

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
22 on the same server program, [`bench/http/server.mjs`](bench/http/server.mjs).
`bench/http/run.sh` builds it, runs it on one CPU and drives it from another
with [`bench/http/load.c`](bench/http/load.c): 50 connections with one
request in flight each, 4 s per case. Measured on 2026-10-05 (Linux x64,
shared machine: two consecutive runs, throughput varies by about 10%).

| Case | Node.js req/s | Nona req/s | p99 Node.js / Nona | RSS Node.js / Nona |
| --- | --- | --- | --- | --- |
| hello (keep-alive, 13-byte body) | 71–72k | 61–70k | 1.4–1.6 / 1.7–2.2 ms | 80 / 16 MB |
| json (`JSON.stringify` of a small object) | 66–68k | 55–61k | 1.6 / 2.0–2.2 ms | 79 / 16 MB |
| close (new connection per request) | 25–27k | 22–26k | 4.3–4.6 / 4.1–4.6 ms | 70 / 18 MB |
| big64k (64 KiB response) | 20–21k | **33–38k** | 4.5–5.2 / **2.7–3.0 ms** | 91 / 16 MB |
| upload16k (16 KiB request body) | 49–54k | 41k | 1.8–2.1 / 2.5–2.9 ms | 78 / 16 MB |

Nona serves large responses about 1.8 times faster than Node.js, is level
on small keep-alive and per-connection requests, 10–20% behind when a
request carries a body, and uses a fifth of the memory throughout. Counted
by callgrind, a hello request costs about the same number of instructions in
both (68k for Nona, 72k for Node.js); Nona's remaining gap is time per
instruction (values live in stack slots, and allocation and collection touch
more memory). How the server and the runtime got here is described in the
pull request of #115 and the commits it lists.

## Where the time goes (v0.7.0 analysis)

*This is the v0.7.0 analysis. Causes 1 and 3 were fixed and 4 largely (see [the update](#update-current-release-against-node)); string copying, call overhead and allocation remain.*

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
