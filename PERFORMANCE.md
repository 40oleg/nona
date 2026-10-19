# Performance: Nona vs Node.js, Deno and Bun

The current numbers are [the v0.13.0 section](#current-release-v0130-against-nodejs-deno-and-bun),
dated 2026-10-16. It reuses [the 2026-10-14 comparison](#the-2026-10-14-comparison-v0120-superseded)
of `main` after v0.12.0 against Node.js, Deno and Bun, because Deno and Bun are
not installed on the release machine. Older sections keep the
date and version they were measured at: v0.7.0 on 2026-10-01 and
[the v0.10.0 update](#update-current-release-against-node) against Node.js on
2026-10-08; they are marked _superseded_ where a later measurement replaces them.
The scripts live in [`bench/`](bench/); `node bench/run.mjs` reproduces every
table (protocol in [`bench/README.md`](bench/README.md)).

## HTTP `/json` with the UTF-8 JSON serializer (#155)

Measured 2026-10-19 on a shared Windows 11 machine, with the Linux x64 servers running in WSL2 (16 logical CPUs, 7.8 GB). Both servers are `bench/http/server.mjs` built with `--target linux-x64 --module`: "before" from `3fbc0ad2` (the base of the #155 branch), "after" from the #155 branch (`res.end(JSON.stringify(x))` through the byte serializer). The load generator is `bench/http/load.c` (50 keep-alive connections, 4 s per case; server on CPU 0, load on CPU 1), three alternating rounds; `run.sh` itself was not used because there is no Node.js in WSL, so the Node.js column is not measured here.

| Case    | Before, req/s (3 rounds) | After, req/s (3 rounds)  |
| ------- | ------------------------ | ------------------------ |
| `hello` | 39 488 / 40 141 / 37 960 | 37 855 / 40 386 / 39 158 |
| `/json` | 38 096 / 34 858 / 37 548 | 35 900 / 37 740 / 34 820 |

The medians are 37 548 req/s before and 35 900 req/s after for `/json`: no difference beyond the round-to-round noise of about 10 % on this shared machine. The saving (one UTF-16 buffer, one finished string, one `byteLength` scan and one UTF-8 copy per response) is small next to the per-request cost of the HTTP stack at the payload size of this case, so this measurement does not show a throughput gain; a quiet reference VM and the Node.js comparison are still to be run. Absolute numbers are lower than the sections below (different machine and WSL2 networking), so only the before/after pair is comparable.

## Current release (v0.13.0) against Node.js, Deno and Bun

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
- **Promise chains (×12), allocation-heavy code (×3.6) and the RegExp engine (×98 on the scan-heavy micro-benchmark, ×13–×31 in acorn and marked):** the largest remaining gaps. The RegExp engine is a bytecode VM written in JavaScript; a native matcher and a native promise kind (#44) are the next steps.

## The 2026-10-14 comparison (v0.12.0, superseded)

_Superseded by [the v0.13.0 section](#current-release-v0130-against-nodejs-deno-and-bun), which reuses these figures (see there why)._

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
- The Promise chain (×39) keeps one record per `.then` and a linked job queue since #44: on a Linux x64 VM the 100 000-reaction chain went from 1 450 ms to 460 ms (Node.js 31 ms) and 100 000 sequential `await`s from 1 070 ms to 230 ms. A second pass (literal records, an inline `then`, `await` of a primitive without a hidden promise, `typeof` tests compiled to tag checks) brought the chain from 739 ms to 575 ms and the `await`s from 450 ms to 142 ms on a busier VM (20 000 reactions: 376 M to 210 M instructions). Promises are still ordinary objects whose state lives in a WeakMap; about a third of the remaining instructions are allocation and collection of the promise, its state record, the reaction and the WeakMap entry. A dedicated native promise kind is the remaining step.

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
22 on the same server program, [`bench/http/server.mjs`](bench/http/server.mjs).
`bench/http/run.sh` builds it, runs it on one CPU and drives it from another
with [`bench/http/load.c`](bench/http/load.c): 50 connections with one
request in flight each, 4 s per case. Measured on 2026-10-05 (Linux x64,
shared machine: two consecutive runs, throughput varies by about 10%).

| Case                                      | Node.js req/s | Nona req/s | p99 Node.js / Nona       | RSS Node.js / Nona |
| ----------------------------------------- | ------------- | ---------- | ------------------------ | ------------------ |
| hello (keep-alive, 13-byte body)          | 71–72k        | 61–70k     | 1.4–1.6 / 1.7–2.2 ms     | 80 / 16 MB         |
| json (`JSON.stringify` of a small object) | 66–68k        | 55–61k     | 1.6 / 2.0–2.2 ms         | 79 / 16 MB         |
| close (new connection per request)        | 25–27k        | 22–26k     | 4.3–4.6 / 4.1–4.6 ms     | 70 / 18 MB         |
| big64k (64 KiB response)                  | 20–21k        | **33–38k** | 4.5–5.2 / **2.7–3.0 ms** | 91 / 16 MB         |
| upload16k (16 KiB request body)           | 49–54k        | 41k        | 1.8–2.1 / 2.5–2.9 ms     | 78 / 16 MB         |

Nona serves large responses about 1.8 times faster than Node.js, is level
on small keep-alive and per-connection requests, 10–20% behind when a
request carries a body, and uses a fifth of the memory throughout. Counted
by callgrind, a hello request costs about the same number of instructions in
both (68k for Nona, 72k for Node.js); Nona's remaining gap is time per
instruction (values live in stack slots, and allocation and collection touch
more memory). How the server and the runtime got here is described in the
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
