# Ready-to-paste texts for #401

Two texts: the pull request description and the update for #402. Every
number comes from [docs/perf-cpp.md](../../docs/perf-cpp.md) and the raw
results in [results/](results/). Nothing here has been posted.

## Pull request description

Closes #401

Adds a reproducible comparison of Nona with optimized C++ on matched
kernels (`bench/cpp/`), the measurements, `perf` profiles and the report
`docs/perf-cpp.md`.

### Design

- `bench/cpp/js/{arith,strings}.js` and `bench/cpp/cpp/{arith,strings}.cpp`:
  matched kernels with the same inputs (seeded xorshift32, generated before
  the timed region) and the same order of operations, so checksums agree
  bit for bit. The file headers define one operation, iteration and call.
- Arithmetic: double and wrapping 32-bit (`>>> 0`, `Math.imul` / `uint32_t`)
  addition and multiplication; dependent chains (latency) and four
  accumulators (throughput); 10M direct calls of `add`/`multiply`, indirect
  calls, closures; a loop/checksum control (reported, never subtracted);
  Float64Array updates over 4 KiB, 1 MiB and 64 MiB.
- Strings: UTF-16 code units on both sides (`std::u16string`); scan, `===`,
  `<`, owning slice, `indexOf`, immutable concatenation, push + join,
  split/join, replace/replaceAll (with the #387 log case), number
  formatting/parsing; ASCII, BMP and astral (surrogate pair) inputs of 16,
  1024 and 1 Mi code units; bounded iteration counts with code units and
  created code units reported. Byte strings, views, mutable append and a
  reserved builder are separate, labelled lower bounds.
- `build.mjs` (Nona and g++ builds, listings, metadata), `check-asm.mjs`
  (rejects C++ kernels whose loop/arithmetic/string call was eliminated,
  reports devirtualization and SIMD), `run.mjs` (warm-up + 11 rounds in
  seeded random order, exact checksum gate, raw samples), `report.mjs`
  (tables), `profile.mjs` (`perf` attribution through `NONA_ELF_MAP`).

### Environment

WSL2 Ubuntu 22.04.3 (kernel 6.18.54.1-microsoft-standard-WSL2) on Windows
11 Pro, Intel Core i7-13620H (6P + 4E, 16 threads), 16 GB RAM, Balanced
power plan, idle apart from the runs (WSL load average 0.8 before, 1.7–1.9
after). Nona 0.20.0 at `36737352`, built with Node.js v22.23.2 (Nona has no
optimization flags). g++ 11.4.0, libstdc++ 6.0.30: `-std=c++17 -O3 -DNDEBUG
-fno-fast-math -ffp-contract=off -march=x86-64 -mtune=generic`; diagnostic
builds `-fno-inline -DBENCH_NOINLINE` and `-march=native -flto`.
**Windows x64 C++: unavailable** (no compiler on the host); native Linux and
CI: not measured.

### 10,000,000 additions and multiplications (N = 1e7)

| Kernel           | Nona ms [IQR] | C++ `-O3` ms [IQR] | Nona/C++ | Nona ns/op | C++ ns/op |
| ---------------- | ------------- | ------------------ | -------- | ---------- | --------- |
| `f64_add_chain`  | 119 [118–126] | 5.45 [5.26–5.63]   | **21.9** | 11.9       | 0.545 ¹   |
| `f64_add_direct` | 183 [180–184] | 5.62 [5.46–5.99]   | **32.5** | 18.3       | 0.562 ¹   |
| `f64_mul_chain`  | 122 [119–124] | 10.9 [10.3–11.6]   | **11.2** | 12.2       | 1.09      |
| `f64_mul_direct` | 176 [174–179] | 11.1 [10.7–11.7]   | **15.8** | 17.6       | 1.11      |
| `u32_add_chain`  | 442 [431–444] | 2.93 [2.79–2.97]   | **151**  | 44.2       | 0.293 ¹   |
| `u32_add_direct` | 505 [501–507] | 3.13 [2.97–3.50]   | **162**  | 50.5       | 0.313 ¹   |
| `u32_mul_chain`  | 367 [359–408] | 8.06 [7.79–8.27]   | **45.5** | 36.7       | 0.806 ¹   |
| `u32_mul_direct` | 429 [418–442] | 8.14 [7.81–8.70]   | **52.6** | 42.9       | 0.814 ¹   |

¹ Timed region below 10 ms; the 30M calibration size agrees within 10%.

Calls and loops (N = 1e7): f64 indirect call 186 ms vs 11.5 ms (x16.1),
closure 169 vs 22.3 (x7.58; C++ `std::function`), four accumulators 77.2 vs
1.82 (x42.5), loop control 449 vs 2.97 (x151), Float64Array 1 MiB 116 vs
1.77 (x65.6), 64 MiB 114 vs 6.18 (x18.5). C++ `-fno-inline` direct calls
cost the same as inlined ones (5.39 ms); C++ `std::function` with
`-fno-inline` is 185–192 ms, on par with Nona's closures.

### Strings (selected; N = 1e7, bounded iterations)

| Kernel                         | Iterations × units | Nona ms | C++ ms | Nona/C++ |
| ------------------------------ | ------------------ | ------- | ------ | -------- |
| `str_scan_ascii_medium`        | 100,000 × 1,024    | 4196    | 6.87   | 611      |
| `str_parse_int_short`          | 10,000,000         | 8751    | 149    | 58.9     |
| `str_slice_ascii_short`        | 10,000,000 × 16    | 1988    | 46.7   | 42.5     |
| `str_replaceall_ascii_short`   | 1,000,000 × 16     | 1604    | 52.6   | 30.5     |
| `str_indexof_ascii_short_n4`   | 10,000,000 × 16    | 1030    | 91.5   | 11.3     |
| `str_builder_ascii_short_join` | 1,000,000 × 16     | 243     | 22.2   | 10.9     |
| `str_format_int_short`         | 10,000,000         | 3389    | 411    | 8.24     |
| `str_concat_ascii_short`       | 10,000,000 × 16    | 1173    | 168    | 6.99     |
| `str_slice_ascii_large`        | 1,000 × 1 Mi       | 49.0    | 22.4   | 2.19     |
| `str_replaceall_ascii_large`   | 100 × 1 Mi         | 179     | 151    | 1.18     |
| `str_indexof_ascii_large_n64`  | 100 × 1 Mi         | 75.1    | 102    | 0.734    |
| `str_equal_ascii_large`        | 100 × 1 Mi         | 9.01    | 26.0   | 0.347    |
| `str_concat_ascii_large`       | 2,000 × 1 Mi       | 1.94    | 186    | 0.0104 ² |

² Nona's ropes defer the copy that the C++ contract performs; a
representation difference, not faster copying. BMP and astral inputs match
ASCII within the spread.

### Correctness and statistics

- `check-asm.mjs` passed for every C++ kernel: loops, arithmetic and string
  routine calls present; `*_direct` inlined at `-O3`; every indirect call
  and `std::function` call remains an indirect call (not devirtualized);
  SIMD only in the typed-array, scan, copy and split/replace loops.
- Every group (arithmetic at 1e5, 1e6, 1e7, 3e7; strings at 1e5, 1e6, 1e7)
  had identical checksums, `units` and `allocUnits` in all 12 runs; 0 groups
  rejected. Checksums are exact (f64 bit patterns, no tolerance).
- 1 warm-up + 11 measured runs per binary, alternating in seeded random
  order, separate processes, in-process timing of the kernel only; startup
  measured separately (Nona 30.5 ms, C++ 5.6 ms, `loop_control 0`).
- For groups with a median of at least 10 ms the median IQR is 5.7% of the
  median (90th percentile 10.8%, worst 19.6%).

### Top measured causes (profiles: `perf` cpu-clock in WSL2)

1. ToInt32/ToUint32 of doubles outside the int32 range leaves the inline
   path (`emitNumberBinary`, `src/backend/x64/operations.ts`) for
   `rt.shiftUnsigned`/`rt.bitXor` → `rt.toNumber` → `rt.toInt32`: 48–49% of
   the u32 and control-loop samples, 23–29% of the short string kernels.
2. Frame-resident 16-byte tagged values, a double loop counter with checked
   int32 conversions for `i & MASK`, a reload and TDZ check of the global
   `const MASK`, materialized booleans and a GC poll per block: the
   compiled code is 39–63% of arithmetic samples.
3. Typed-array element access is `call rt.elementGet`/`rt.elementSet`: 35–43%
   of samples in the f64 kernels; no vectorization.
4. Calls: `rt.enterFrame2` and the callee add 5.4–6.4 ns; direct, indirect
   and closure calls cost the same 17–19 ns (f64).
5. `charCodeAt` is a full method call (lookup, receiver coercion, invoke):
   41–48 ns per code unit; `Number(s)` spends 96% in the exact big-number
   path; `replaceAll` on short strings spends 34% in prelude lookups.

QEMU instruction counts (`scripts/profile-runtime.mjs`) were unavailable:
no `qemu-user` in the WSL2 distribution.

### Limitations

One host, WSL2 only; no native Linux, Windows C++ or CI numbers. No CPU
pinning on a hybrid CPU. C++ timed regions under 10 ms are given in ms (ns/op
from the calibration table). `cpu-clock` samples, not instruction counts.
Allocation columns are contract counts, RSS was not measured. One C++
toolchain (GCC 11 / libstdc++ 11, whose `char16_t` compare and find are
scalar). The RegExp (#389) and sort (#388) hotspots have no C++ equivalent
here.

### Testing

`npm run build`; `node bench/cpp/build.mjs`; `node bench/cpp/check-asm.mjs`
(all kernels pass); the two `run.mjs` runs above (WSL2); `npm run
format:check`. Linux x64 only through WSL2; the Windows Nona binaries build
but were not timed. No compiler or runtime source changed.

### Links

Report: `docs/perf-cpp.md`; harness and protocol: `bench/cpp/README.md`;
raw results: `bench/cpp/results/2026-10-20-arith-linux-wsl2.json`,
`bench/cpp/results/2026-10-20-strings-linux-wsl2.json`, profiles in
`bench/cpp/results/profiles/`. Follow-up: #402.

## Update for #402

Inputs from #401 (report: `docs/perf-cpp.md`; WSL2, Intel Core i7-13620H,
Nona `36737352`, g++ 11.4 `-O3`; medians of 11 alternating runs). Baselines
are this report's medians; the targets are proposals. Re-measure with
`node bench/cpp/run.mjs --only <kernel>` on the same host.

| #   | Measured gap                                                              | Cause (evidence)                                                                                                       | Baseline → proposed target                                                                 | Related               |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------- |
| 1   | `u32_add_chain` x151 (442 ms), `loop_control` x151, u32 kernels x22–x263  | ToInt32/ToUint32 of non-int32 doubles goes to the runtime (verified: listings, 48–49% of samples)                      | 442 / 449 ms → ≤ 119 ms (the f64 chain); no `rt.shiftUnsigned`/`rt.toInt32` in the profile | #284, #94, #238       |
| 2   | `f64_add_chain` x21.9 (11.9 ns/op), `f64_mul_chain` x11.2                 | frame-resident tagged values, double induction variable, global `const` reload + TDZ check, GC poll (verified)         | 119 / 122 ms → < 40 ms                                                                     | #94, #284, #236       |
| 3   | `f64_array_*` x18.5–x65.6, `rt.elementGet/Set` 35–43% of samples          | typed-array access not inlined for `t[i & MASK]` / parameter receivers (hypothesis on why #240's path misses); no SIMD | `f64_array_1m` 116 ms → < 40 ms; no `rt.elementGet` in `f64_add_chain`                     | #240, #193, #31, #253 |
| 4   | `f64_add_direct` x32.5 (+5.4–6.4 ns per call); closures/indirect 17–19 ns | `rt.enterFrame2` + generic invocation, no inlining of small known callees (verified)                                   | `f64_add_direct` 183 ms → the inline kernel's time; `f64_add_closure` 169 ms → < 100 ms    | #47, #235, #239, #166 |
| 5   | `str_scan_*` x362–x693 (41–48 ns per code unit)                           | `charCodeAt` as a method call with receiver coercion (verified), plus #1                                               | `str_scan_ascii_medium` 4196 ms → < 420 ms                                                 | #47, #253             |
| 6   | `str_parse_int_short` x58.9 (875 ns per `Number(s)`)                      | exact big-number decimal path for every input (verified: 96% of samples)                                               | 8751 ms → < 1000 ms                                                                        | —                     |
| 7   | `str_replaceall_*_short` x24.5–x31.8                                      | prelude `replaceAll` lookups before the native scan (verified: 34% lookups)                                            | 1604 ms → < 600 ms (the `replace` row)                                                     | #387                  |
| 8   | short `slice`/`concat`/`indexOf`/`builder` x7–x48                         | mostly #1, #4, #5 in kernel and checksum code; string operations 15–22% of samples                                     | re-measure after #1, #4, #5                                                                | #48, #415             |

Already at or ahead of the C++ baseline (no action from this data): medium
and large `indexOf` (x0.73–x1.23), `===`/`<` (x0.22–x0.36), large
`replaceAll` (x1.18–x1.53) and large immutable concatenation (ropes). The
dynamic call through an unknown function, type checks of unproven values,
immutable strings and GC remain inherent; not every JavaScript workload can
reach C++ speed.
