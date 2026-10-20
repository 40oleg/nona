# Nona vs optimized C++

Matched JavaScript and C++ kernels that measure how close Nona's native code is to optimized C++ ([#401](https://github.com/40oleg/nona/issues/401)). This directory is independent of the Node.js/Deno/Bun micro-benchmarks in `bench/` and of the standard-suite report of [#392](https://github.com/40oleg/nona/issues/392); `stats.mjs` mirrors #392's statistics (median, interquartile range, min/max) without importing them.

## Running

```
npm run build
node bench/cpp/build.mjs
node bench/cpp/check-asm.mjs
node bench/cpp/run.mjs                      # N = 10 000 000, 11 runs
node bench/cpp/run.mjs --sizes 100000,1000000,10000000,30000000
```

`run.mjs` options: `--n` (one size, default 10 000 000), `--sizes` (a list, overrides `--n`), `--runs` (measured runs per binary, default 11, at least 10 for published numbers), `--only` (comma-separated substrings of kernel names), `--platform linux|win`, `--builds` (C++ builds, default `o3,noinline`; add `native`), `--seed` (input seed, default 12345), `--order-seed`, `--timeout` (seconds per process), `--no-startup`, `--out`.

Requirements: Node.js and the built compiler (`dist/cli.js`); `g++` and binutils (`objdump`, `nm`) on Linux, or in WSL2 when the scripts run on Windows (`wsl -e g++`). The C++ kernels use only the C++17 standard library.

## Files

- `js/arith.js`, `cpp/arith.cpp`: the arithmetic and call kernels. The header comment of each file is the contract: what one iteration, operation and call is, the inputs, the numeric semantics and the checksum.
- `kernels.mjs`: the kernel table (JavaScript name, C++ name and symbol, unit, expected instruction class) and the C++ builds with their flags.
- `build.mjs`: builds the kernels and writes `build/meta.json` (Nona version and git SHA, compiler path and version, libstdc++, binutils, flags, source hashes) and the listings in `build/asm/`: Nona's `--print-asm`, `g++ -S`, `objdump -d --no-show-raw-insn -C`, `nm -C` and GCC's vectorizer report (`-fopt-info-vec-optimized`).
- `check-asm.mjs`: fails when a C++ kernel's loop or its arithmetic is gone (folded away or replaced by a closed form); reports the dispatch of every call kernel (inlined, direct call, indirect call = not devirtualized), packed SIMD use and identical code folding. Writes `build/asm/check.json`.
- `run.mjs`: the runner; `stats.mjs`: sample statistics; `host.mjs`: running Linux tools natively or through WSL.
- `results/`: raw samples and metadata of published runs.

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

## C++ builds

All builds: `g++ -std=c++17 -O3 -DNDEBUG -fno-fast-math -ffp-contract=off`, default dynamic linking.

- `o3` (headline): `-march=x86-64 -mtune=generic`, the x86-64 baseline ISA (SSE2, no AVX).
- `noinline` (diagnostic, call kernels only): `o3` plus `-fno-inline -DBENCH_NOINLINE` (`add`/`multiply` get `__attribute__((noinline))`). It isolates call overhead; it is not a baseline.
- `native` (diagnostic, `--builds o3,noinline,native`): `-march=native -flto`; host ISA, not portable.

Every C++ kernel is a separate `noinline` function, one call per timed region, so its loop can be found in the disassembly. Results are kept alive with one empty `asm volatile` per result and per input pointer; there is no `volatile` on the arithmetic. Nona has no optimization flags; `meta.json` records the command.

## Protocol

1. Build the commit (`npm ci && npm run build`), then `node bench/cpp/build.mjs` and `node bench/cpp/check-asm.mjs`. Do not time kernels that `check-asm.mjs` rejects.
2. Close other programs; note the power plan/governor. Do not run other heavy work in parallel.
3. `node bench/cpp/run.mjs --sizes 100000,1000000,10000000,30000000` (11 runs). For every kernel and size, the runner does one discarded warm-up run per binary (file cache, page cache, CPU frequency), then 11 rounds that run every binary once in a seeded random order. Each run is a separate process.
4. A group's timing is accepted only when every run printed the same checksum. Mismatches, crashes, timeouts and unparsable output stay in the results file and the summary.
5. Report the median, IQR and min–max, the Nona/C++ ratio of the medians, ns/op only where the median timed region is at least 10 ms, and operations per second. Startup (`loop_control 0`, wall time on the Linux side) is a separate table.
6. Keep the results of each host separate; do not combine ratios across hosts. Mark WSL2 runs as such (the runner records it), and mark missing compilers or platforms as unavailable.

## Known limitations

- The C++ side is GCC/libstdc++ on Linux (natively or in WSL2). A Windows C++ build is made only when `g++` is on the Windows PATH; otherwise `--platform win` reports the C++ side as unavailable.
- On a hybrid CPU (performance and efficiency cores) the scheduler may move a run between core types; the spread shows it. The runner does not pin CPUs.
- Startup under WSL2 includes one `date(1)` exec per measurement, equally for every binary.
