# Nona vs optimized C++

Matched JavaScript and C++ kernels that measure how close Nona's native code is to optimized C++ ([#401](https://github.com/40oleg/nona/issues/401)). This directory is independent of the Node.js/Deno/Bun micro-benchmarks in `bench/` and of the standard-suite report of [#392](https://github.com/40oleg/nona/issues/392); `stats.mjs` mirrors #392's statistics (median, interquartile range, min/max) without importing them.

## Running

The current report is [docs/perf-cpp.md](../../docs/perf-cpp.md) (2026-10-20, WSL2 on an Intel Core i7-13620H); its raw results are in [`results/`](results/).

```
npm run build
node bench/cpp/build.mjs
node bench/cpp/check-asm.mjs
node bench/cpp/run.mjs                      # N = 10 000 000, 11 runs
node bench/cpp/run.mjs --sizes 100000,1000000,10000000,30000000
node bench/cpp/run.mjs --only strings       # the string kernels only
node bench/cpp/report.mjs bench/cpp/results/<file>.json [...] > tables.md
node bench/cpp/profile.mjs u32_add_chain 10000000 --json profile.json
```

The published report was made with `--only arith --sizes 100000,1000000,10000000,30000000 --builds o3,noinline,native` and `--only strings --sizes 100000,1000000,10000000`, both with 11 runs, one after the other.

`run.mjs` options: `--n` (one size, default 10 000 000), `--sizes` (a list, overrides `--n`), `--runs` (measured runs per binary, default 11, at least 10 for published numbers), `--only` (comma-separated substrings of kernel names, or program names: `arith`, `strings`), `--platform linux|win`, `--builds` (C++ builds, default `o3,noinline`; add `native`), `--seed` (input seed, default 12345), `--order-seed`, `--timeout` (seconds per process), `--no-startup`, `--out`.

Requirements: Node.js and the built compiler (`dist/cli.js`); `g++` and binutils (`objdump`, `nm`) on Linux, or in WSL2 when the scripts run on Windows (`wsl -e g++`). The C++ kernels use only the C++17 standard library.

## Files

- `js/arith.js`, `cpp/arith.cpp`: the arithmetic and call kernels. The header comment of each file is the contract: what one iteration, operation and call is, the inputs, the numeric semantics and the checksum.
- `js/strings.js`, `cpp/strings.cpp`: the string kernels; the headers give each kernel's contract in UTF-16 code units, its inputs and its checksum.
- `kernels.mjs`: the kernel table (JavaScript name, C++ name and symbol, unit, expected instruction class) and the C++ builds with their flags.
- `build.mjs`: builds the kernels and writes `build/meta.json` (Nona version and git SHA, compiler path and version, libstdc++, binutils, flags, source hashes) and the listings in `build/asm/`: Nona's `--print-asm`, `g++ -S`, `objdump -d --no-show-raw-insn -C`, `nm -C` and GCC's vectorizer report (`-fopt-info-vec-optimized`).
- `check-asm.mjs`: fails when a C++ kernel's loop or its arithmetic is gone (folded away or replaced by a closed form), or when a string kernel's iteration loop no longer calls its string routine (`find`, `compare`, `operator new`, `to_chars`, ...) or contains the inlined routine's inner loop (a hoisted call fails); reports the dispatch of every call kernel (inlined, direct call, indirect call = not devirtualized), packed SIMD use and identical code folding. Writes `build/asm/check.json`.
- `run.mjs`: the runner; `stats.mjs`: sample statistics; `host.mjs`: running Linux tools natively or through WSL.
- `report.mjs`: the Markdown tables of the report from one host's results files (headline, arithmetic and calls, diagnostic C++ builds, ns/op at every N, strings, startup).
- `profile.mjs`: `perf record -e cpu-clock` of one Nona kernel on Linux (or in WSL2), with the samples attributed to runtime routines and compiled functions through the `NONA_ELF_MAP` symbol table.
- `PR-SUMMARY.md`: the pull request description and the #402 update of the published report, ready to paste.
- `results/`: raw samples and metadata of published runs, one JSON file per run of `run.mjs`, and the `perf` profiles of the report.

`build/` is generated and not committed.

## Kernels

Every kernel takes `<kernel> <n> <seed>`, builds its inputs from the seed before the timed region, times only the kernel (JavaScript `performance.now()`, C++ `std::chrono::steady_clock`) and prints one JSON line `{"kernel", "n", "ns", "checksum"}`. A kernel does exactly `n` operations.

| Kernel                           | One operation                                              | Variant                                                                       |
| -------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `f64_add_chain`, `f64_mul_chain` | one double addition / multiplication                       | inline expression, one dependent accumulator (latency)                        |
| `f64_add_x4`, `f64_mul_x4`       | same                                                       | inline, four independent accumulators (throughput); `n` multiple of 4         |
| `u32_add_*`, `u32_mul_*`         | `(a + b) >>> 0`, `Math.imul(a, b) >>> 0` / `uint32_t`      | as for f64                                                                    |
| `*_direct`                       | one call of `add(a, b)` / `multiply(a, b)`                 | direct call of a known function                                               |
| `*_indirect`                     | one call                                                   | function taken from a seed-ordered array (C++: function pointer)              |
| `*_stdfn` (C++ only)             | one call                                                   | the same pointer in a `std::function`; runs against the JS `*_indirect`       |
| `*_closure`                      | one call of `(s, i) => s op t[i & 1023]`                   | closure over the seeded table (C++: lambda capturing by value, std::function) |
| `loop_control`                   | one iteration of the shared loop, index and load, with XOR | structural control; reported, never subtracted                                |
| `f64_array_4k`, `_1m`, `_64m`    | one element update `a[j] = a[j] * k + c` (16 B traffic)    | Float64Array / `std::vector<double>` of 4 KiB, 1 MiB, 64 MiB (#240)           |

Inputs are a 1024-entry seeded table (L1-resident); operation `i` reads `t[i & 1023]`. Multiplication chains stay bounded: double factors are `1 ± k·2^-30` (k in 1..1024) with each factor's mirror in the table, u32 factors are odd. The C++ kernels keep the JavaScript order of operations, so every checksum is compared bit-exactly; no kernel needs a floating-point tolerance.

## String kernels

`strings <kernel> <iterations> <seed>` prints `{"kernel", "n", "ns", "checksum", "units", "allocUnits"}`, where `n` is the iteration count. The unit is one UTF-16 code unit; the C++ side uses `std::u16string`, whose `operator<` and `find` compare `char16_t` values, the code-unit order of JavaScript. `units` is the code units the contract processes and `allocUnits` the code units of the strings the JavaScript kernel creates; JavaScript and C++ must print the same values and the same checksum.

Inputs, all built from the seed before the timed region: words of 2–7 code points separated by spaces over `ascii` (16 letters), `bmp` (Cyrillic and CJK, one unit each) or `astral` (letters and the emoji U+1F600–U+1F607, two units each), with `short` = 16, `medium` = 1024 and `large` = 1 048 576 code units (twice as many bytes in UTF-16). Compared strings are built separately.

Iterations are bounded: a kernel runs max(1, round(N / divisor)) iterations, with the divisor in `kernels.mjs`. At N = 10 000 000 the short scan, equality, comparison, slice, search, concatenation and number kernels run 10 000 000 iterations and the short builder, split/join and replace kernels 1 000 000; medium and large inputs run between 10 and 1 000 000 iterations (large split/join and the log replace: 10). The runner reports `iterations`, `codeUnitsProcessed` and `bytesAllocated` (2 bytes per created code unit: payload only) and never labels them as N operations.

| Kernel (`str_<op>_<encoding>_<size>`) | One iteration                                                                                          | alloc |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----- |
| `scan`                                | `s.length` + `charCodeAt` over the whole string, summed                                                | no    |
| `equal`, `compare`                    | `a === c` / `a < c` with an equal copy or a copy differing at the end or in the middle                 | no    |
| `slice`                               | `s.slice(b, b + L/4)`, seeded `b` (C++ `substr`, owning)                                               | yes   |
| `indexof_n4`, `_n64`                  | `s.indexOf(needle)`, 16 needles from the second half (C++ `find`)                                      | no    |
| `concat`                              | `s = s + piece`, reset at L units (C++: a new string of the summed length)                             | yes   |
| `builder`                             | `parts.push(piece)`, `join("")` every L/P pushes                                                       | yes   |
| `splitjoin`                           | `s.split(" ").join("-")` (C++: owning parts, one reserved join)                                        | yes   |
| `replace`, `replaceall`               | `replace` / `replaceAll` of a string pattern with `"[#]"`; `replaceall_log_large` is the #387 log case | yes   |
| `format_int_short`                    | `String(x)`, integer-valued double < 2^53 (C++ `to_chars` fixed, widened)                              | yes   |
| `parse_int_short`                     | `Number(s)` of a decimal integer (C++ narrowing + `from_chars`)                                        | no    |

Rows that are not the JavaScript contract are C++-only variants run against the JavaScript kernel and labelled with their `contract`: `*_bytes` (ASCII `std::string` scan and search, `to_chars`/`from_chars` on char buffers: "bytes (not equivalent)"), `slice_*_view` (non-owning `std::u16string_view`), `concat_*_append` (mutable `s += piece`). For `builder` the main C++ row is an append into one reserved `std::u16string`, an architectural lower bound of push + join; `builder_*_join` (a vector of views and one join) has JavaScript's contract. The RegExp hotspot of #389 and the sort of #388 have no standard-library-equivalent C++ kernel and are left to `bench/16_string_scan.js`; the comparison kernels use long shared prefixes as #388's keys do.

## C++ builds

All builds: `g++ -std=c++17 -O3 -DNDEBUG -fno-fast-math -ffp-contract=off`, default dynamic linking.

- `o3` (headline): `-march=x86-64 -mtune=generic`, the x86-64 baseline ISA (SSE2, no AVX).
- `noinline` (diagnostic, call kernels only; not built for `strings`): `o3` plus `-fno-inline -DBENCH_NOINLINE` (`add`/`multiply` get `__attribute__((noinline))`). It isolates call overhead; it is not a baseline.
- `native` (diagnostic, `--builds o3,noinline,native`): `-march=native -flto`; host ISA, not portable.

Every C++ kernel is a separate `noinline` function, one call per timed region, so its loop can be found in the disassembly. Results are kept alive with one empty `asm volatile` per result and per input pointer; there is no `volatile` on the arithmetic. Nona has no optimization flags; `meta.json` records the command.

## Protocol

1. Build the commit (`npm ci && npm run build`), then `node bench/cpp/build.mjs` and `node bench/cpp/check-asm.mjs`. Do not time kernels that `check-asm.mjs` rejects.
2. Close other programs; note the power plan/governor. Do not run other heavy work in parallel.
3. `node bench/cpp/run.mjs --sizes 100000,1000000,10000000,30000000` (11 runs). For every kernel and size, the runner does one discarded warm-up run per binary (file cache, page cache, CPU frequency), then 11 rounds that run every binary once in a seeded random order. Each run is a separate process.
4. A group's timing is accepted only when every run printed the same checksum. Mismatches, crashes, timeouts and unparsable output stay in the results file and the summary.
5. Report the median, IQR and min–max, the Nona/C++ ratio of the medians, ns/op only where the median timed region is at least 10 ms, and operations per second. Startup (`loop_control 0`, wall time on the Linux side) is a separate table.
6. Keep the results of each host separate; do not combine ratios across hosts. Mark WSL2 runs as such (the runner records it), and mark missing compilers or platforms as unavailable.

## Reading the results

- `run.mjs` prints one line per kernel and size: the median [Q1–Q3] in ms of each binary, the Nona/C++ ratio of the medians (above 1: Nona is slower), ns/op and throughput. `report.mjs` turns one host's results files into the Markdown tables of the report.
- The results file has, per group (`kernel`, `n`): the `status` (`ok`, or the reason the group was rejected: checksum mismatch, crash, timeout, unparsable output, unavailable binary), the expected `checksum`, per binary (`nona`, `cpp-o3`, `cpp-noinline`, `cpp-native`; call kernels only for `noinline`) the summary in ms, `nsPerOp`, `opsPerSecond` or `codeUnitsPerSecond`, and `samples`: every run (warm-ups included) with its binary, round, position in the round, wall time, kernel time in ns, checksum and status. The top level records the host, the build metadata, the `check-asm` result and the startup samples.
- ns/op is `null` when the median timed region is below 10 ms; the timer resolution and the constant cost of a run are then a visible part of the time. The calibration table of the report shows the raw quotient at every N; a constant ns/op from 1e5 to 3e7 means the cost is per operation.
- `*_bytes`, `*_view`, `*_append`, `*_stdfn` and the main `builder` C++ row are labelled lower bounds or alternative contracts, not equivalent work; the `noinline` and `native` builds are diagnostics, not baselines.
- `profile.mjs` prints the share of `cpu-clock` samples per runtime routine (`rt.*`) and compiled function (`js.fn.<k>`; `--print-asm` listings name the same functions). Samples cover the whole process, so use an n where the kernel dominates.

## Known limitations

- The C++ side is GCC/libstdc++ on Linux (natively or in WSL2). A Windows C++ build is made only when `g++` is on the Windows PATH; otherwise `--platform win` reports the C++ side as unavailable.
- On a hybrid CPU (performance and efficiency cores) the scheduler may move a run between core types; the spread shows it. The runner does not pin CPUs.
- Startup under WSL2 includes one `date(1)` exec per measurement, equally for every binary.
