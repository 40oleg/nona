# Nona vs optimized C++: arithmetic, calls and UTF-16 strings (2026-10-20)

This report measures how close Nona's generated native code is to optimized
C++ on matched kernels, and where the remaining time goes
([#401](https://github.com/40oleg/nona/issues/401)). The kernels, the build,
assembly check and runner are in [`bench/cpp/`](../bench/cpp/README.md); the
raw samples and metadata of every number below are in
[`bench/cpp/results/`](../bench/cpp/results/). The follow-up work is tracked
in [#402](https://github.com/40oleg/nona/issues/402).

It is a separate measurement from the Node.js/Deno/Bun comparison in
[`PERFORMANCE.md`](../PERFORMANCE.md) and from the standard-suite report of
[#392](https://github.com/40oleg/nona/issues/392); nothing here is combined
with those numbers.

## Summary

- **10 million additions and multiplications.** On one host (WSL2 Ubuntu
  22.04, Intel Core i7-13620H), 10,000,000 dependent double additions take
  **119 ms in Nona and 5.45 ms in C++ `-O3` (x21.9)**; 10,000,000 calls of
  `add(a, b)` take **183 ms vs 5.62 ms (x32.5)**. Multiplication: **122 ms vs
  10.9 ms (x11.2)** inline and **176 ms vs 11.1 ms (x15.8)** through
  `multiply(a, b)`. With wrapping 32-bit arithmetic (`(a + b) >>> 0`,
  `Math.imul(a, b) >>> 0`) the gaps are x45–x162.
- **Nona spends about 12 ns per double operation, 37–50 ns per u32
  operation and about 6 ns more per call**, against 0.3–1.1 ns for C++. The
  per-operation cost is flat from N = 100,000 to 30,000,000 (calibration
  table), so it is a per-iteration cost, not startup or nonlinear growth.
- **The largest measured causes are avoidable implementation overhead, not
  JavaScript semantics**: ToInt32/ToUint32 of values outside the int32 range
  leaves the inline path for runtime calls (48–49% of samples in the u32
  and control loops); every value lives in a 16-byte tag/payload slot of the
  frame and the loop counter is a double; typed-array element reads are
  out-of-line `rt.elementGet` calls (26–43% of samples); a call costs a
  frame-entry stub and the same ~17–19 ns whether direct, indirect or a
  closure; `charCodeAt` is a full method call; `Number(s)` always takes the
  exact big-number decimal path.
- **Strings**: operations on existing storage over medium and large inputs
  are at or ahead of the libstdc++ `std::u16string` baseline (`indexOf`
  x0.73–x1.23, `===`/`<` x0.22–x0.36 thanks to Nona's 8-unit SIMD compare,
  `replaceAll` x1.18–x1.53 on 1 Mi units). Short-string and per-code-unit
  work is 10–690 times slower, dominated by the call and coercion costs
  above rather than by string copying. Immutable concatenation of large
  strings is 96 times faster in Nona because ropes defer the copy; that is a
  representation difference, not faster copying.
- The C++ baseline keeps all work: `check-asm.mjs` passed for every kernel
  (loops, arithmetic and string routine calls present; no indirect call
  devirtualized). Every group of every size had identical checksums in all
  runs (454 arithmetic and string groups, 0 rejected).

## Environment

| Item           | Value                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Date           | 2026-10-20, arithmetic 04:45–05:08 UTC, strings 05:08–06:11 UTC                                                |
| Host           | `tors`, laptop, 13th Gen Intel Core i7-13620H (6 P + 4 E cores, 16 threads), 16 GB RAM                         |
| OS             | Windows 11 Pro 10.0.26200, power plan Balanced; WSL 3.0.3.0, kernel 6.18.54.1-microsoft-standard-WSL2          |
| Measured in    | **WSL2** Ubuntu 22.04.3 LTS (7.6 GiB visible to the VM), not native Linux; governor not exposed in WSL2        |
| Load           | Windows CPU load 5–7% before the runs; WSL load average 0.77 before, 1.7–1.9 after (16 logical CPUs)           |
| Nona           | 0.20.0, commit `36737352` (`v0.20.0-5-g36737352`, clean), built with Node.js v22.23.2                          |
| Nona build     | `node dist/cli.js build <program>.js -o <out> --target linux-x64 --print-asm`; Nona has no optimization levels |
| C++ compiler   | g++ (Ubuntu 11.4.0-1ubuntu1~22.04.3) 11.4.0, libstdc++ 6.0.30 (`_GLIBCXX_RELEASE` 11), GNU ld 2.38             |
| C++ `o3`       | `-std=c++17 -O3 -DNDEBUG -fno-fast-math -ffp-contract=off -march=x86-64 -mtune=generic` (SSE2, no AVX)         |
| C++ diagnostic | `noinline`: `o3` + `-fno-inline -DBENCH_NOINLINE`; `native`: `-O3 ... -march=native -flto`                     |
| Linking        | g++ default: dynamic libstdc++, libm, libc; Nona: static, no libc                                              |

The machine is shared with a person; it was idle apart from the runs, which
ran one process at a time. A hybrid CPU can move a run between P and E
cores; the runner does not pin CPUs, and the spread shows any effect.

**Windows x64 native: unavailable.** The Windows host has no C++ compiler
(no MSVC, clang or MinGW), so there is no same-OS C++ column, and a Windows
Nona binary is not compared with the WSL2 C++ binary. Nona win32-x64
binaries were built (the listings are in `build/asm/`) but not timed for
this report. **Native Linux and CI: not measured.**

## Protocol and correctness checks

1. `npm run build`, `node bench/cpp/build.mjs` (Nona linux-x64 and win32-x64,
   C++ `o3`, `noinline`, `native`; listings, `objdump`, `nm` and GCC's
   vectorizer report in `bench/cpp/build/asm/`), `node bench/cpp/check-asm.mjs`
   (all kernels passed).
2. `node bench/cpp/run.mjs --only arith --sizes 100000,1000000,10000000,30000000 --runs 11 --builds o3,noinline,native`
   and `node bench/cpp/run.mjs --only strings --sizes 100000,1000000,10000000 --runs 11`,
   sequentially.
3. For every kernel and size: one discarded warm-up run per binary, then 11
   rounds, each running every binary once in a seeded random order
   (order seeds 401001 and 401002). Each run is a new process; the kernel
   times itself in-process (`performance.now()` / `std::chrono::steady_clock`)
   around the kernel call only; inputs are generated from seed 12345 before
   the timed region and nothing is printed inside it.
4. A group is accepted only when all 12 runs print the same checksum (exact
   string comparison; `f64` checksums are the bit pattern of the double, so
   no tolerance is used anywhere) and, for strings, the same `units` and
   `allocUnits`. All groups were accepted.
5. Reported: median and interquartile range [Q1–Q3] in ms, the ratio of the
   medians (Nona/C++, above 1 = Nona slower), ns/op only when the median
   timed region is at least 10 ms (otherwise `<10 ms`; the calibration table
   gives the raw quotient for every size), and throughput. Nothing is
   baseline-subtracted; `loop_control` is reported as its own kernel.
6. Spread: over the 487 Nona and C++ groups with a median of at least 10 ms
   the median IQR is 5.7% of the median (90th percentile 10.8%, worst 19.6%).
   Ratios closer to 1 than about x1.2 should be read as parity.

What one operation is: one arithmetic operation of the named kind (`*_x4`:
four per iteration, n/4 iterations), one call (`*_direct`, `*_indirect`,
`*_closure`), one element update of a Float64Array (`f64_array_*`). For
strings one iteration is one call of the operation on an input of 16, 1024
or 1,048,576 UTF-16 code units; the iteration counts are bounded per kernel
and given in every row. The contracts are in the headers of
[`js/arith.js`](../bench/cpp/js/arith.js) and
[`js/strings.js`](../bench/cpp/js/strings.js).

## Headline: 10,000,000 additions and multiplications

N = 10,000,000 operations per run, 11 runs, WSL2, C++ `-O3` baseline ISA.

| Kernel           | Contract                                  | Checksum               | Nona ms [IQR] | C++ ms [IQR]     | Nona/C++ | Nona ns/op | C++ ns/op ¹ |
| ---------------- | ----------------------------------------- | ---------------------- | ------------- | ---------------- | -------- | ---------- | ----------- |
| `f64_add_chain`  | `s = s + t[i & 1023]`, double, dependent  | `f64:41528f30f05aec80` | 119 [118–126] | 5.45 [5.26–5.63] | **21.9** | 11.9       | 0.545       |
| `f64_add_direct` | `s = add(s, t[i & 1023])`, 10M calls      | `f64:41528f30f05aec80` | 183 [180–184] | 5.62 [5.46–5.99] | **32.5** | 18.3       | 0.562       |
| `f64_mul_chain`  | `p = p * t[i & 1023]`, double, dependent  | `f64:3ff000baa3443671` | 122 [119–124] | 10.9 [10.3–11.6] | **11.2** | 12.2       | 1.09        |
| `f64_mul_direct` | `p = multiply(p, t[i & 1023])`, 10M calls | `f64:3ff000baa3443671` | 176 [174–179] | 11.1 [10.7–11.7] | **15.8** | 17.6       | 1.11        |
| `u32_add_chain`  | `s = (s + t[i & 1023]) >>> 0`             | `u32:212994551`        | 442 [431–444] | 2.93 [2.79–2.97] | **151**  | 44.2       | 0.293       |
| `u32_add_direct` | `s = addU32(s, t[i & 1023])`, 10M calls   | `u32:212994551`        | 505 [501–507] | 3.13 [2.97–3.50] | **162**  | 50.5       | 0.313       |
| `u32_mul_chain`  | `p = Math.imul(p, t[i & 1023]) >>> 0`     | `u32:1754030669`       | 367 [359–408] | 8.06 [7.79–8.27] | **45.5** | 36.7       | 0.806       |
| `u32_mul_direct` | `p = multiplyU32(p, t[i & 1023])`, calls  | `u32:1754030669`       | 429 [418–442] | 8.14 [7.81–8.70] | **52.6** | 42.9       | 0.814       |

¹ C++ timed regions under 10 ms: the quotient median/N from the calibration
table, given here because the 30M row agrees within 10% (0.565, 0.536,
1.06, 1.12, 0.268, 0.336, 0.856, 0.798 ns).

In the `-O3` build GCC inlines `add`/`multiply` into the loop
(`check-asm`: "inlined"), so the C++ direct-call rows equal the inline rows;
with `-fno-inline` the call stays and costs about nothing extra in C++
(`f64_add_direct` 5.39 ms, `u32_add_direct` 5.79 ms; diagnostic table
below). The C++ times are consistent with the latency of the dependent
operation (about 2.7 cycles per double add and 5.3 per double multiply at
the ~4.9 GHz boost clock; this is an inference from the times, not a counter
measurement). In Nona the call adds 5.4–6.4 ns per
call.

## Arithmetic and calls

The full tables at every size are in [Full tables](#full-tables). At N = 10M:

- **Throughput vs latency.** Four independent accumulators bring C++ to
  0.18 ns per double add and 0.29 ns per multiply; Nona to 7.7–7.8 ns
  (x42.5 and x27.2). Nona's per-iteration overhead is amortized over four
  operations, but its operations do not overlap the way C++'s do.
- **Indirect calls and closures.** C++ through a function pointer: 1.15 ns
  (f64 add), 1.46 ns (u32 add); through `std::function`: 2.1–2.5 ns;
  closure in `std::function`: 1.1–2.5 ns. `check-asm` shows every C++
  indirect call is a real `call *` (not devirtualized). Nona: 16.9–18.7 ns
  (f64) and 47–55 ns (u32), the same as its direct calls: Nona has no cheaper
  path for a known callee. The Nona/C++ ratio of these rows (x7.1–x43) is
  smaller only because the C++ side also pays for the indirect call.
- **The control loop** (`c = (c ^ t[i & 1023]) >>> 0`, the same loop, index
  and load as the u32 kernels) costs 44.9 ns/iteration in Nona and 0.30 ns in
  C++ — the u32 rows are dominated by the loop and coercions, not by the add
  or the multiply.
- **Typed arrays** (`a[j] = a[j] * k + c` over a Float64Array): 11.2–11.6 ns
  per element in Nona at every payload size (4 KiB, 1 MiB, 64 MiB); C++ 0.18
  ns in cache and 0.62 ns from memory (64 MiB). GCC vectorized this loop
  with 16-byte SSE2 vectors; Nona emits scalar code. The ratio narrows from
  x60–x66 in cache to x18.5 when C++ becomes memory-bound.
- **Diagnostic C++ builds** (not baselines): `-march=native -flto` changes
  most C++ times by less than the spread; exceptions are `f64_array_4k`
  (1.14 ms instead of 1.86, AVX), the u32 indirect calls (about -24%) and
  `f64_add_x4` (2.72 ms instead of 1.82, slower). `-fno-inline` makes the
  `std::function` and closure rows 8–17 times slower (185–192 ms), on par
  with Nona's f64 closure (169–178 ms).

## Strings

All string kernels use UTF-16 code units on both sides: JavaScript strings
and `std::u16string` (whose `compare` and `find` use code-unit order like
JavaScript). Inputs: ASCII, BMP (Cyrillic and CJK, one unit each) and astral
(emoji, surrogate pairs) text of 16, 1024 and 1,048,576 code units. Rows
whose contract is not the JavaScript one are labelled in the Contract column:
`bytes (not equivalent)` (ASCII `std::string`), `non-owning
std::u16string_view: lower bound`, `mutable s += piece: lower bound`,
`reserved std::u16string append: architectural lower bound of push + join`.
`Code units processed` and `Bytes allocated` are the contract's counts
(identical on both sides by construction and checked per run), not measured
allocator traffic.

Selected rows at N = 10M (iterations as given):

| Kernel                          | Iterations | Units/input | Nona ms [IQR]    | C++ ms [IQR]     | Nona/C++ | Note                                            |
| ------------------------------- | ---------- | ----------- | ---------------- | ---------------- | -------- | ----------------------------------------------- |
| `str_scan_ascii_medium`         | 100,000    | 1,024       | 4196 [4083–4434] | 6.87 [6.69–7.26] | 611      | `charCodeAt` loop: 41 ns vs 0.07 ns per unit    |
| `str_scan_astral_short`         | 10,000,000 | 16          | 7366 [6892–7525] | 19.5 [19.0–20.0] | 377      | same, short input                               |
| `str_parse_int_short`           | 10,000,000 | ≤16 digits  | 8751 [8723–8807] | 149 [146–155]    | 58.9     | `Number(s)`: 875 ns per parse                   |
| `str_slice_ascii_short`         | 10,000,000 | 16          | 1988 [1980–2013] | 46.7 [45.3–48.2] | 42.5     | owning `substr` on the C++ side                 |
| `str_replaceall_ascii_short`    | 1,000,000  | 16          | 1604 [1594–1622] | 52.6 [51.0–53.3] | 30.5     | prelude `replaceAll` per call                   |
| `str_indexof_ascii_short_n4`    | 10,000,000 | 16          | 1030 [1017–1041] | 91.5 [89.9–93.1] | 11.3     |                                                 |
| `str_builder_ascii_short_join`  | 1,000,000  | 16          | 243 [238–248]    | 22.2 [21.5–22.4] | 10.9     | push + join, matched contract                   |
| `str_splitjoin_ascii_short`     | 1,000,000  | 16          | 1068 [1031–1091] | 118 [114–125]    | 9.04     |                                                 |
| `str_format_int_short`          | 10,000,000 | —           | 3389 [3369–3486] | 411 [398–429]    | 8.24     | `String(x)` of integers below 2^53              |
| `str_concat_ascii_short`        | 10,000,000 | 16          | 1173 [1149–1195] | 168 [163–172]    | 6.99     | C++ builds a new string each time               |
| `str_equal_ascii_short`         | 10,000,000 | 16          | 119 [117–123]    | 50.2 [49.0–51.5] | 2.37     |                                                 |
| `str_slice_ascii_large`         | 1,000      | 1,048,576   | 49.0 [47.9–50.3] | 22.4 [21.3–23.6] | 2.19     | 512 KiB copy per iteration                      |
| `str_replaceall_ascii_large`    | 100        | 1,048,576   | 179 [177–184]    | 151 [148–160]    | 1.18     | native literal replaceAll (#387)                |
| `str_replaceall_log_large`      | 10         | 1,048,576   | 14.1 [13.0–15.6] | 11.3 [11.0–11.8] | 1.24     | the #387 log case                               |
| `str_indexof_ascii_medium_n4`   | 100,000    | 1,024       | 51.3 [50.7–52.1] | 53.0 [52.3–56.5] | 0.968    |                                                 |
| `str_indexof_ascii_large_n64`   | 100        | 1,048,576   | 75.1 [73.0–76.7] | 102 [101–108]    | 0.734    | the `bytes` C++ row is 50.3 ms (x1.48)          |
| `str_equal_ascii_large`         | 100        | 1,048,576   | 9.01 [8.90–9.22] | 26.0 [25.7–26.4] | 0.347    | Nona: 8-unit SIMD; libstdc++ char16_t: scalar   |
| `str_compare_ascii_medium`      | 100,000    | 1,024       | 9.52 [9.20–10.1] | 40.6 [37.9–42.5] | 0.235    | same                                            |
| `str_concat_ascii_large`        | 2,000      | 1,048,576   | 1.94 [1.86–1.99] | 186 [181–189]    | 0.0104   | Nona rope defers the copy; C++ copies ~2 GB     |
| `str_concat_ascii_large_append` | 2,000      | 1,048,576   | 2.08 [1.96–2.32] | 1.42 [1.36–1.47] | 1.47     | C++ mutable append lower bound vs the same rope |

BMP and astral inputs behave like ASCII within the spread for every
operation (the full table has all three); there is no non-ASCII penalty in
either implementation, as both work on code units. Search in astral text
differs because the needles and match positions differ (`units` column).

The C++ ASCII `std::string` rows (`*_bytes`) are a practical lower bound,
not equivalent Unicode work: they halve the C++ search time for medium and
large inputs (`indexOf` x1.26–x1.73 against bytes) and change little for
scan, where the C++ loop is already vectorized.

## Assembly evidence

From `bench/cpp/build/asm/check.json` and the listings (`build/` is not
committed; `node bench/cpp/build.mjs && node bench/cpp/check-asm.mjs`
regenerates them):

- **No eliminated C++ work.** Every C++ kernel keeps its loop and the
  measured instruction (`addsd`, `mulsd`, `add`, `imul`, or the call of
  `find`, `compare`, `operator new`, `memcpy`, `to_chars`, `from_chars`
  inside the iteration loop). Multiplication chains stay bounded (factors
  `1 ± k·2^-30` with mirrors, odd u32 factors). Results are kept with one
  empty `asm volatile` per result; the arithmetic itself is not `volatile`.
- **Dispatch.** `-O3`: `*_direct` inlined; `*_indirect`, `*_stdfn`,
  `*_closure` are indirect calls (`call *%rbp`, `call *0x18(%rbp)`), **not
  devirtualized**. `-fno-inline`: direct calls stay `call f64_add` etc.
- **Vectorization (C++).** `f64_array_*` (16-byte SSE2; AVX with
  `-march=native`), `str_scan_*` and the ASCII byte scan, the append/builder
  copies, `splitjoin` and `replaceall` inner loops. Not vectorized: the
  scalar chains (dependent by construction), `x4` kernels (GCC keeps the
  JavaScript order without fast-math), and libstdc++'s `char16_t`
  `compare`/`find` (scalar loops).
- **Vectorization (Nona).** None in the compiled kernels. The runtime string
  routines use SSE2: `rt.compareStrings` compares 8 code units at a time
  ([`src/runtime/strings.ts`](../src/runtime/strings.ts), #253), which is why
  Nona's `===`/`<` on medium and large strings beats the scalar libstdc++
  loop.
- **Nona's loop code** (`build/asm/arith-nona-linux-x64.asm`, `js.fn.8` =
  `f64AddChain`, `js.fn.12` = `u32AddChain`): every local is a 16-byte
  `(tag, payload)` slot in the frame (tag 3 = Number) and every operation
  loads and stores it; `i` is a double incremented with `addsd`; `i & MASK`
  converts both operands to int32 with `cvttsd2si`/`cvtsi2sd` round-trip
  and sign-extension checks; `MASK` (a top-level `const`) is loaded from
  `js.globals` with an uninitialized-binding (TDZ) check every iteration;
  `i < n` materializes a boolean and branches on it; each loop block polls
  `rt.gcNeeded`; `t[...]` is `call rt.elementGet`.

## Profiles

`node bench/cpp/profile.mjs <kernel> <n>` (in WSL2: `perf record -e cpu-clock`
at 2 kHz, samples attributed through Nona's `NONA_ELF_MAP` symbol table).
WSL2 has no hardware counters, so these are time samples, not instruction
counts. **`scripts/profile-runtime.mjs` (QEMU instruction counts) was
unavailable**: `qemu-user` is not installed in the WSL2 distribution. The
profiles cover the whole process (input generation included); n was chosen
so that the kernel dominates. Raw data:
[`bench/cpp/results/profiles/`](../bench/cpp/results/profiles/).

Share of samples by routine group (coercion = `rt.toNumber*`, `rt.toInt32`,
`rt.toNumeric`, `rt.shiftUnsigned`, `rt.bitXor`; lookup = property and
global lookups; call = `rt.invoke*`, `rt.enterFrame*`; GC = allocation and
sweep; kernel = compiled JavaScript code):

| Kernel (n)                        | Samples | Kernel code | Coercion | `rt.elementGet/Set` | Lookup | Call | String routines | GC  | Other                     |
| --------------------------------- | ------- | ----------- | -------- | ------------------- | ------ | ---- | --------------- | --- | ------------------------- |
| `f64_add_chain` (10M)             | 230     | 63%         | —        | 36%                 | —      | —    | —               | —   | 1%                        |
| `f64_add_direct` (10M)            | 363     | 53%         | —        | 35%                 | —      | 12%  | —               | —   |                           |
| `f64_add_closure` (10M)           | 348     | 48%         | —        | 26%                 | 1%     | 24%  | —               | —   |                           |
| `u32_add_chain` (10M)             | 932     | 39%         | 48%      | 13%                 | —      | —    | —               | —   |                           |
| `u32_mul_chain` (10M)             | 740     | 35%         | 27%      | 13%                 | 14%    | 7%   | —               | —   | 6% `Math.imul`            |
| `loop_control` (10M)              | 996     | 40%         | 49%      | 11%                 | —      | —    | —               | —   |                           |
| `f64_array_1m` (10M)              | 292     | 44%         | 10%      | 43%                 | —      | —    | —               | —   | 2%                        |
| `str_scan_ascii_medium` (20k)     | 1570    | 40%         | 20%      | —                   | 11%    | 6%   | 20% ²           | —   | 3%                        |
| `str_slice_ascii_short` (3M)      | 1471    | 19%         | 29%      | 2%                  | 11%    | 12%  | 15% ²           | 7%  | 5% incl. `Math.imul`      |
| `str_indexof_ascii_short_n4` (3M) | 849     | 20%         | 23%      | 4%                  | 16%    | 13%  | 22% ²           | —   | 2%                        |
| `str_replaceall_ascii_short` (1M) | 4082    | 8%          | 8%       | —                   | 34%    | 9%   | 21% ²           | 11% | 9%                        |
| `str_concat_ascii_short` (3M)     | 805     | 20%         | 27%      | 3%                  | 9%     | 10%  | 14% ²           | 9%  | 8%                        |
| `str_builder_ascii_short` (2M)    | 1127    | 12%         | 15%      | 2%                  | 18%    | 6%   | 21% ²           | 11% | 15%                       |
| `str_format_int_short` (2M)       | 1448    | 17%         | 27%      | 2%                  | 9%     | 12%  | 10% ²           | 4%  | 15% `fmt.*`, 3% `imul`    |
| `str_parse_int_short` (2M)        | 3873    | 1%          | 1%       | 1%                  | —      | —    | —               | —   | **96% `num.*`/`ratio.*`** |

² Includes `rt.toString` of the receiver and `rt.stringCharCodeAt`, which the
checksum `mix(h, s.charCodeAt(k))` also calls; `rt.stringIndexOf`,
`rt.stringSlice`, `rt.copyUnits`, `rt.concat*`, `rt.builder*`,
`rt.arrayJoinBody` and `rt.replaceAllUnits` are the operation itself.

## Gap analysis

Each cause is classified as **inherent** (required by JavaScript semantics
under ahead-of-time compilation without type feedback) or **avoidable**
(implementation overhead that a compiler can remove without changing
observable behaviour). **Verified** means shown by the listings and the
profiles above; **hypothesis** means it is consistent with the timings but
not shown directly.

1. **ToInt32/ToUint32 outside the int32 range goes to the runtime
   (avoidable, verified).** The inline bitwise path converts an operand only
   when it already is an int32 value
   ([`src/backend/x64/operations.ts`](../src/backend/x64/operations.ts),
   `emitNumberBinary`: "ToInt32 inline only for operands that already are
   int32 values: otherwise the runtime does the modular reduction"). A
   uint32 accumulator is at or above 2^31 half of the time, and `s + t[k]`
   up to 2^33, so `>>> 0` and `^` fall to `rt.shiftUnsigned`/`rt.bitXor` →
   `rt.toNumeric` → `rt.toNumber` → `rt.toInt32`
   ([`src/runtime/bitwise.ts`](../src/runtime/bitwise.ts)). Measured: 48%
   of `u32_add_chain` and 49% of `loop_control` samples; u32 kernels cost
   37–55 ns per operation against 12–19 ns for the double kernels with the
   same loop. The same path dominates the checksum `mix` of every string
   kernel (`Math.imul(h ^ x, 16777619) >>> 0`: 23–29% of samples in the
   short string kernels). ToUint32 of a double is a modular reduction that
   `cvttsd2si` with a 64-bit destination performs exactly for |x| < 2^63,
   so this is not a semantic cost.
2. **Values live in frame slots; counters are doubles (avoidable,
   verified).** Every local is a 16-byte tag/payload pair in memory, loaded
   and type-checked at each use; `i` is a double, so `i & MASK` needs two
   checked double→int32 conversions per iteration; the top-level `const
MASK` is reloaded from `js.globals` with a TDZ check; `i < n`
   materializes a boolean; each block polls `rt.gcNeeded`
   ([`src/backend/x64/operations.ts`](../src/backend/x64/operations.ts)).
   Measured: the compiled kernel code itself is 39–63% of the arithmetic
   samples; `f64_add_chain` costs 11.9 ns where the dependent add is 0.55 ns.
   Tag checks are inherent where types are unknown, but here the operands
   are provably Numbers (a Float64Array read and a numeric literal
   accumulator) and `i` is provably an int32 induction variable; register
   allocation of such values is not a semantic requirement. Links: #94,
   #284, #236.
3. **Typed-array element access is an out-of-line call (avoidable,
   verified for these kernels).** `t[i & MASK]` and `a[j]` compile to
   `call rt.elementGet` / `rt.elementSet`
   ([`src/runtime/array-elements.ts`](../src/runtime/array-elements.ts)):
   35–36% of `f64_add_chain`/`f64_add_direct` samples and 43% of
   `f64_array_1m`. #240 (closed) inlined typed-array access in counted
   loops; that path does not apply here. **Hypothesis:** it requires the
   index to be the loop variable itself (not `i & MASK`) or a receiver the
   compiler proves is a typed array in the same function (here a
   parameter). No SIMD is generated, so `f64_array_*` also lacks C++'s
   vectorization (x60–x66 in cache). Links: #240, #193, #31, #253.
4. **Calls cost a frame-entry stub and no known-callee path (avoidable,
   verified).** A direct call adds ~6.4 ns: `rt.enterFrame2`
   ([`src/runtime/prologue.ts`](../src/runtime/prologue.ts)) 12% and the
   callee body 12% of `f64_add_direct` samples. Direct, indirect and closure
   calls all cost 17–19 ns (f64), so neither inlining nor a cheaper
   direct-call convention is used for `add`; closures additionally go
   through `rt.invokeSite2`/`rt.invoke` (24% of `f64_add_closure`). C++
   inlines the direct call, and even with `-fno-inline` the call is free
   because it is off the dependency chain. A dynamic call through an
   unknown function value (the indirect rows) is inherent to JavaScript but
   costs C++ only 1–2.5 ns. Links: #47, #235, #239, #166, #167.
5. **`charCodeAt` and other string methods are full method calls
   (avoidable, verified).** Each `s.charCodeAt(j)` looks up the method
   (`rt.getPropertyCached`, `rt.propIndexProbe`, `rt.icGet`: 11% of
   `str_scan_ascii_medium`), coerces the receiver (`rt.toString`), calls
   `rt.stringCharCodeAt` through `rt.invokeSite1`/`rt.invoke` and returns a
   double; with the `>>> 0` coercion of the accumulator this makes 41–48 ns
   per code unit against 0.07 ns for C++'s vectorized loop (x362–x693).
   A known-string receiver with an int32 index needs a bounds check and a
   16-bit load. Same lookup/call pattern in the short `slice`, `indexOf`,
   `concat` rows, where the string operation itself is 15–22% of samples.
6. **`Number(s)` always uses the exact big-number decimal path (avoidable,
   verified).** 96% of `str_parse_int_short` samples are in `num.*`/`ratio.*`
   ([`src/runtime/numeric/parse.ts`](../src/runtime/numeric/parse.ts)) for
   inputs of at most 16 digits: 875 ns per parse vs 15 ns (x58.9). Integers
   up to 2^53 and decimals with at most 15 significant digits and a small
   exponent are exact in a double (Clinger's fast path); the exact path is
   only needed beyond that.
7. **`replaceAll` with a string pattern runs prelude JavaScript before the
   native scan (avoidable, verified for short inputs).** The prelude
   ([`src/lib/runtime/regexp-protocol.js`](../src/lib/runtime/regexp-protocol.js),
   `String.prototype.replaceAll`) checks `Symbol.match`/`Symbol.replace`,
   coerces and scans the replacement for `$`, with global and property
   lookups: lookups are 34% of `str_replaceall_ascii_short` samples
   (`rt.findGlobalBinding` alone 10%). On 1 Mi-unit inputs the native
   `rt.replaceAllUnits` (#387) dominates and the gap is x1.18–x1.53.
8. **Allocation and copying of new strings (partly inherent).** JavaScript
   strings are immutable, so `slice`, `replace`, `split`, `join` and `+`
   must produce new strings; the C++ rows with the same ownership contract
   (`substr`, a new string per concatenation) pay for that too. Large
   owning slices are x2.1–x2.4 (one 512 KiB copy per iteration plus Nona's
   allocation and sweep); non-owning views and mutable append are
   architectural lower bounds JavaScript cannot express directly. Nona's
   ropes make immutable concatenation of large strings cheaper than the
   C++ copy (x0.0104) at the cost of a later flatten.
9. **Startup (inherent part unknown).** `loop_control 0` takes 30.5 ms
   (Nona) vs 5.6 ms (C++) on the Linux side, both including one `date(1)`
   exec. **Hypothesis:** runtime and prelude initialization; not profiled
   here. Startup is excluded from all kernel timings.

What is inherent in these kernels: the double semantics of Number (the
same IEEE operations as C++ here, so no cost by itself), type checks where
types are not provable, the dynamic call through an unknown function value,
immutable strings, UTF-16 code units (identical on both sides), and a
garbage collector. None of the top causes above requires them.

## Follow-up items for #402

Ranked by measured gap and breadth. Baselines are the medians of this report
(WSL2, i7-13620H, N = 10M unless stated); a change should be judged against
the same kernel on the same host with the same protocol. The targets are
proposals, not measurements.

| #   | Gap (measured)                                                              | Cause / hypothesis                                                                                                     | Acceptance baseline → proposed target                                                                                  | Related               |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | u32 kernels x22–x263; `loop_control` x151; 23–29% of short string kernels   | ToInt32/ToUint32 of non-int32 doubles leaves the inline path (verified)                                                | `u32_add_chain` 442 ms, `loop_control` 449 ms → at most `f64_add_chain`'s 119 ms; no `rt.shiftUnsigned` in the profile | #284, #94, #238       |
| 2   | `f64_add_chain` x21.9 (11.9 ns/op), `f64_mul_chain` x11.2                   | frame-resident tagged values, double loop counter, global const reload + TDZ check, boolean materialization (verified) | 119 ms / 122 ms → under 40 ms (under 4 ns/op)                                                                          | #94, #284, #236       |
| 3   | `f64_array_*` x18.5–x65.6; `rt.elementGet` 35–43% of samples                | typed-array access not inlined for masked index / parameter receiver (hypothesis); no vectorization                    | `f64_array_1m` 116 ms → under 40 ms; no `rt.elementGet`/`Set` in `f64_add_chain`/`f64_array_1m` profiles               | #240, #193, #31, #253 |
| 4   | direct call +6.4 ns (x32.5 for `f64_add_direct`); closure/indirect 17–19 ns | `rt.enterFrame2` stub and generic invocation; no inlining of small known callees (verified)                            | `f64_add_direct` 183 ms → equal to the inline kernel; `f64_add_closure` 169 ms → under 100 ms                          | #47, #235, #239, #166 |
| 5   | `str_scan_*` x362–x693 (41–48 ns per code unit)                             | `charCodeAt` as a method call with receiver coercion (verified), plus #1                                               | `str_scan_ascii_medium` 4196 ms → under 420 ms (x10)                                                                   | #47, #253             |
| 6   | `str_parse_int_short` x58.9 (875 ns per parse)                              | exact big-number path for every input (verified)                                                                       | 8751 ms → under 1000 ms                                                                                                | —                     |
| 7   | `str_replaceall_*_short` x24.5–x31.8                                        | prelude `replaceAll` lookups before the native scan (verified)                                                         | `str_replaceall_ascii_short` 1604 ms → under 600 ms (the `replace` row)                                                | #387                  |
| 8   | short `slice`/`concat`/`indexOf`/`builder` x7–x48                           | mostly #1, #4 and #5 in the kernel and checksum code; the string operation is 15–22% of samples                        | re-measure after #1, #4, #5 before working on string allocation                                                        | #48, #415             |

Out of scope for #402 from this data: medium/large `indexOf`, `===`, `<`,
`replaceAll` and large concatenation are already at or ahead of the C++
baseline. Not every JavaScript workload can reach C++ speed: the dynamic
call, type checks of unproven values, immutable strings and garbage
collection remain.

## Limitations

- One host, WSL2 only. No native Linux, no Windows C++ (no compiler on the
  host) and no CI numbers; Windows Nona binaries were not timed. Results
  from other hosts must not be combined with these ratios.
- No CPU pinning, no fixed frequency (Balanced power plan, hybrid
  P/E-core CPU). The spread (median IQR 5.7%) bounds the effect for this run
  but not for other machines.
- C++ timed regions below 10 ms (most arithmetic rows) are reported in ms;
  their ns/op is given only from the calibration table, where the 30M size
  confirms it.
- `perf` in WSL2 samples `cpu-clock`, not cycles or instructions; QEMU
  instruction counts were unavailable. Sample shares are approximate
  (230–4082 samples per profile); profiles cover the whole process.
- String allocation columns are contract counts, not allocator
  measurements; RSS was not measured.
- One compiler (GCC 11 / libstdc++ 11). libstdc++'s `char16_t` `compare`
  and `find` are scalar; another standard library could change the string
  rows where Nona is ahead. No LTO in the headline column; `-march=native
-flto` is a diagnostic column for arithmetic only.
- The RegExp (#389) and sort (#388) hotspots have no standard-library C++
  equivalent and are not part of this comparison.

## Reproducing

```
npm run build
node bench/cpp/build.mjs
node bench/cpp/check-asm.mjs
node bench/cpp/run.mjs --only arith --sizes 100000,1000000,10000000,30000000 --runs 11 --builds o3,noinline,native
node bench/cpp/run.mjs --only strings --sizes 100000,1000000,10000000 --runs 11
node bench/cpp/report.mjs bench/cpp/results/<arith>.json bench/cpp/results/<strings>.json
node bench/cpp/profile.mjs u32_add_chain 10000000 --json out.json
```

Raw results of this report:
[`2026-10-20-arith-linux-wsl2.json`](../bench/cpp/results/2026-10-20-arith-linux-wsl2.json),
[`2026-10-20-strings-linux-wsl2.json`](../bench/cpp/results/2026-10-20-strings-linux-wsl2.json),
[`profiles/`](../bench/cpp/results/profiles/). Each file holds every sample
(per run: ns, checksum, status, order), the build metadata (Nona SHA, g++
version, flags, source hashes), the `check-asm` result and the host
description.

## Full tables

Generated by `node bench/cpp/report.mjs` from the two results files.

### Headline: 10,000,000 additions and multiplications

| Kernel           | Contract                          | Checksum               | Nona ms       | C++ -O3 ms       | Nona/C++ | Nona ns/op | C++ ns/op | Status |
| ---------------- | --------------------------------- | ---------------------- | ------------- | ---------------- | -------- | ---------- | --------- | ------ |
| `f64_add_chain`  | inline, dependent chain (latency) | `f64:41528f30f05aec80` | 119 [118–126] | 5.45 [5.26–5.63] | **21.9** | 11.9       | <10 ms    | ok     |
| `f64_add_direct` | direct call of add(a, b)          | `f64:41528f30f05aec80` | 183 [180–184] | 5.62 [5.46–5.99] | **32.5** | 18.3       | <10 ms    | ok     |
| `f64_mul_chain`  | inline, dependent chain (latency) | `f64:3ff000baa3443671` | 122 [119–124] | 10.9 [10.3–11.6] | **11.2** | 12.2       | 1.09      | ok     |
| `f64_mul_direct` | direct call of multiply(a, b)     | `f64:3ff000baa3443671` | 176 [174–179] | 11.1 [10.7–11.7] | **15.8** | 17.6       | 1.11      | ok     |
| `u32_add_chain`  | inline, dependent chain (latency) | `u32:212994551`        | 442 [431–444] | 2.93 [2.79–2.97] | **151**  | 44.2       | <10 ms    | ok     |
| `u32_add_direct` | direct call of add(a, b)          | `u32:212994551`        | 505 [501–507] | 3.13 [2.97–3.50] | **162**  | 50.5       | <10 ms    | ok     |
| `u32_mul_chain`  | inline, dependent chain (latency) | `u32:1754030669`       | 367 [359–408] | 8.06 [7.79–8.27] | **45.5** | 36.7       | <10 ms    | ok     |
| `u32_mul_direct` | direct call of multiply(a, b)     | `u32:1754030669`       | 429 [418–442] | 8.14 [7.81–8.70] | **52.6** | 42.9       | <10 ms    | ok     |

### Arithmetic, calls, control and typed arrays at N = 10,000,000

| Kernel             | Variant                                                                              | Checksum               | Nona ms          | C++ -O3 ms       | Nona/C++ | Nona ns/op | C++ ns/op | Nona Mop/s | C++ Mop/s | Status |
| ------------------ | ------------------------------------------------------------------------------------ | ---------------------- | ---------------- | ---------------- | -------- | ---------- | --------- | ---------- | --------- | ------ |
| `f64_add_chain`    | inline, dependent chain (latency)                                                    | `f64:41528f30f05aec80` | 119 [118–126]    | 5.45 [5.26–5.63] | 21.9     | 11.9       | <10 ms    | 83.7       | 1834      | ok     |
| `f64_add_x4`       | inline, 4 independent accumulators (throughput)                                      | `f64:41528f30f05aec80` | 77.2 [73.8–84.5] | 1.82 [1.76–1.98] | 42.5     | 7.72       | <10 ms    | 130        | 5507      | ok     |
| `f64_add_direct`   | direct call of add(a, b)                                                             | `f64:41528f30f05aec80` | 183 [180–184]    | 5.62 [5.46–5.99] | 32.5     | 18.3       | <10 ms    | 54.7       | 1779      | ok     |
| `f64_add_indirect` | indirect call of a function chosen at run time (C++: function pointer)               | `f64:41528f30f05aec80` | 186 [180–191]    | 11.5 [10.4–12.0] | 16.1     | 18.6       | 1.15      | 53.7       | 867       | ok     |
| `f64_add_stdfn`    | indirect call of a function chosen at run time (C++: std::function over the pointer) | `f64:41528f30f05aec80` | 187 [175–193]    | 23.4 [22.0–23.9] | 7.98     | 18.7       | 2.34      | 53.5       | 427       | ok     |
| `f64_add_closure`  | closure over the seeded table (C++: lambda capturing by value in std::function)      | `f64:41528f30f05aec80` | 169 [163–173]    | 22.3 [21.9–22.6] | 7.58     | 16.9       | 2.23      | 59.2       | 449       | ok     |
| `f64_mul_chain`    | inline, dependent chain (latency)                                                    | `f64:3ff000baa3443671` | 122 [119–124]    | 10.9 [10.3–11.6] | 11.2     | 12.2       | 1.09      | 82.1       | 917       | ok     |
| `f64_mul_x4`       | inline, 4 independent accumulators (throughput)                                      | `f64:3ff000baa344383f` | 77.8 [74.9–83.3] | 2.86 [2.76–2.99] | 27.2     | 7.78       | <10 ms    | 129        | 3495      | ok     |
| `f64_mul_direct`   | direct call of multiply(a, b)                                                        | `f64:3ff000baa3443671` | 176 [174–179]    | 11.1 [10.7–11.7] | 15.8     | 17.6       | 1.11      | 56.9       | 900       | ok     |
| `f64_mul_indirect` | indirect call of a function chosen at run time (C++: function pointer)               | `f64:3ff000baa3443671` | 181 [177–188]    | 11.8 [11.2–12.0] | 15.4     | 18.1       | 1.18      | 55.2       | 850       | ok     |
| `f64_mul_stdfn`    | indirect call of a function chosen at run time (C++: std::function over the pointer) | `f64:3ff000baa3443671` | 178 [175–179]    | 25.1 [24.3–26.3] | 7.11     | 17.8       | 2.51      | 56.2       | 399       | ok     |
| `f64_mul_closure`  | closure over the seeded table (C++: lambda capturing by value in std::function)      | `f64:3ff000baa3443671` | 178 [172–181]    | 24.7 [24.1–25.3] | 7.22     | 17.8       | 2.47      | 56.1       | 405       | ok     |
| `u32_add_chain`    | inline, dependent chain (latency)                                                    | `u32:212994551`        | 442 [431–444]    | 2.93 [2.79–2.97] | 151      | 44.2       | <10 ms    | 22.6       | 3407      | ok     |
| `u32_add_x4`       | inline, 4 independent accumulators (throughput)                                      | `u32:212994551`        | 436 [429–453]    | 1.66 [1.60–1.93] | 263      | 43.6       | <10 ms    | 22.9       | 6040      | ok     |
| `u32_add_direct`   | direct call of add(a, b)                                                             | `u32:212994551`        | 505 [501–507]    | 3.13 [2.97–3.50] | 162      | 50.5       | <10 ms    | 19.8       | 3198      | ok     |
| `u32_add_indirect` | indirect call of a function chosen at run time (C++: function pointer)               | `u32:212994551`        | 519 [512–535]    | 14.6 [14.3–15.0] | 35.5     | 51.9       | 1.46      | 19.3       | 684       | ok     |
| `u32_add_stdfn`    | indirect call of a function chosen at run time (C++: std::function over the pointer) | `u32:212994551`        | 513 [503–547]    | 21.3 [20.4–22.3] | 24.1     | 51.3       | 2.13      | 19.5       | 469       | ok     |
| `u32_add_closure`  | closure over the seeded table (C++: lambda capturing by value in std::function)      | `u32:212994551`        | 548 [538–561]    | 14.6 [14.1–15.1] | 37.5     | 54.8       | 1.46      | 18.3       | 685       | ok     |
| `u32_mul_chain`    | inline, dependent chain (latency)                                                    | `u32:1754030669`       | 367 [359–408]    | 8.06 [7.79–8.27] | 45.5     | 36.7       | <10 ms    | 27.3       | 1240      | ok     |
| `u32_mul_x4`       | inline, 4 independent accumulators (throughput)                                      | `u32:1754030669`       | 372 [357–383]    | 2.68 [2.64–2.72] | 139      | 37.2       | <10 ms    | 26.9       | 3735      | ok     |
| `u32_mul_direct`   | direct call of multiply(a, b)                                                        | `u32:1754030669`       | 429 [418–442]    | 8.14 [7.81–8.70] | 52.6     | 42.9       | <10 ms    | 23.3       | 1228      | ok     |
| `u32_mul_indirect` | indirect call of a function chosen at run time (C++: function pointer)               | `u32:1754030669`       | 485 [464–497]    | 14.1 [13.7–14.4] | 34.3     | 48.5       | 1.41      | 20.6       | 707       | ok     |
| `u32_mul_stdfn`    | indirect call of a function chosen at run time (C++: std::function over the pointer) | `u32:1754030669`       | 470 [465–490]    | 21.1 [20.4–22.0] | 22.3     | 47.0       | 2.11      | 21.3       | 474       | ok     |
| `u32_mul_closure`  | closure over the seeded table (C++: lambda capturing by value in std::function)      | `u32:1754030669`       | 475 [461–486]    | 11.0 [10.9–11.2] | 43.4     | 47.5       | 1.10      | 21.0       | 913       | ok     |
| `loop_control`     | loop/checksum control (not subtracted)                                               | `u32:3090143325`       | 449 [442–461]    | 2.97 [2.76–3.47] | 151      | 44.9       | <10 ms    | 22.3       | 3366      | ok     |
| `f64_array_4k`     | Float64Array / std::vector<double> of 4096 bytes                                     | `f64:404ce521f6e01009` | 112 [106–115]    | 1.86 [1.77–2.22] | 60.4     | 11.2       | <10 ms    | 89.0       | 5374      | ok     |
| `f64_array_1m`     | Float64Array / std::vector<double> of 1048576 bytes                                  | `f64:40cce521f6e001aa` | 116 [111–122]    | 1.77 [1.62–1.87] | 65.6     | 11.6       | <10 ms    | 86.0       | 5641      | ok     |
| `f64_array_64m`    | Float64Array / std::vector<double> of 67108864 bytes                                 | `f64:4142965c9aaddb3e` | 114 [112–116]    | 6.18 [5.87–6.47] | 18.5     | 11.4       | <10 ms    | 87.5       | 1617      | ok     |

### Diagnostic C++ builds at N = 10,000,000 (not baselines)

| Kernel             | C++ -O3 ms       | -fno-inline ms   | Nona / no-inline | -march=native -flto ms | Nona / native |
| ------------------ | ---------------- | ---------------- | ---------------- | ---------------------- | ------------- |
| `f64_add_chain`    | 5.45 [5.26–5.63] | —                | —                | 5.55 [5.42–5.67]       | 21.5          |
| `f64_add_x4`       | 1.82 [1.76–1.98] | —                | —                | 2.72 [2.67–2.78]       | 28.3          |
| `f64_add_direct`   | 5.62 [5.46–5.99] | 5.39 [5.28–5.60] | 33.9             | 5.43 [5.24–5.50]       | 33.7          |
| `f64_add_indirect` | 11.5 [10.4–12.0] | 11.6 [11.0–12.0] | 16.0             | 13.2 [12.6–13.5]       | 14.1          |
| `f64_add_stdfn`    | 23.4 [22.0–23.9] | 189 [184–191]    | 0.987            | 23.2 [21.6–23.6]       | 8.06          |
| `f64_add_closure`  | 22.3 [21.9–22.6] | 189 [181–195]    | 0.894            | 23.1 [22.4–23.3]       | 7.31          |
| `f64_mul_chain`    | 10.9 [10.3–11.6] | —                | —                | 10.5 [10.4–11.7]       | 11.6          |
| `f64_mul_x4`       | 2.86 [2.76–2.99] | —                | —                | 2.79 [2.66–2.87]       | 27.8          |
| `f64_mul_direct`   | 11.1 [10.7–11.7] | 11.3 [11.0–11.6] | 15.5             | 10.9 [10.6–11.7]       | 16.1          |
| `f64_mul_indirect` | 11.8 [11.2–12.0] | 11.5 [10.6–12.4] | 15.7             | 12.0 [11.8–12.7]       | 15.1          |
| `f64_mul_stdfn`    | 25.1 [24.3–26.3] | 185 [182–187]    | 0.960            | 25.8 [25.4–26.5]       | 6.89          |
| `f64_mul_closure`  | 24.7 [24.1–25.3] | 191 [187–193]    | 0.934            | 25.2 [24.7–27.9]       | 7.06          |
| `u32_add_chain`    | 2.93 [2.79–2.97] | —                | —                | 3.26 [3.09–3.47]       | 136           |
| `u32_add_x4`       | 1.66 [1.60–1.93] | —                | —                | 1.79 [1.68–1.84]       | 244           |
| `u32_add_direct`   | 3.13 [2.97–3.50] | 5.79 [5.66–6.05] | 87.2             | 3.15 [3.06–3.46]       | 160           |
| `u32_add_indirect` | 14.6 [14.3–15.0] | 13.5 [13.4–15.0] | 38.3             | 11.1 [10.7–11.4]       | 46.7          |
| `u32_add_stdfn`    | 21.3 [20.4–22.3] | 185 [180–188]    | 2.77             | 21.4 [20.6–21.9]       | 24.0          |
| `u32_add_closure`  | 14.6 [14.1–15.1] | 192 [190–196]    | 2.84             | 15.8 [14.8–16.4]       | 34.7          |
| `u32_mul_chain`    | 8.06 [7.79–8.27] | —                | —                | 7.85 [7.57–8.07]       | 46.7          |
| `u32_mul_x4`       | 2.68 [2.64–2.72] | —                | —                | 2.66 [2.58–2.87]       | 140           |
| `u32_mul_direct`   | 8.14 [7.81–8.70] | 8.42 [7.72–8.66] | 50.9             | 8.01 [7.85–8.42]       | 53.5          |
| `u32_mul_indirect` | 14.1 [13.7–14.4] | 14.2 [13.4–14.5] | 34.3             | 10.9 [10.5–11.4]       | 44.6          |
| `u32_mul_stdfn`    | 21.1 [20.4–22.0] | 190 [185–195]    | 2.47             | 20.8 [20.1–21.8]       | 22.6          |
| `u32_mul_closure`  | 11.0 [10.9–11.2] | 186 [175–193]    | 2.56             | 12.8 [12.4–13.2]       | 37.1          |
| `loop_control`     | 2.97 [2.76–3.47] | —                | —                | 3.19 [2.84–4.52]       | 141           |
| `f64_array_4k`     | 1.86 [1.77–2.22] | —                | —                | 1.14 [1.10–1.17]       | 98.5          |
| `f64_array_1m`     | 1.77 [1.62–1.87] | —                | —                | 1.73 [1.66–1.91]       | 67.3          |
| `f64_array_64m`    | 6.18 [5.87–6.47] | —                | —                | 5.93 [5.86–6.09]       | 19.3          |

### Calibration: ns per operation at every N (Nona / C++ -O3)

ns/op here is the median timed region divided by N, also below 10 ms, so the smallest N shows the timer and constant overhead.

| Kernel             | N = 1e+5     | N = 1e+6     | N = 1e+7     | N = 3e+7     |
| ------------------ | ------------ | ------------ | ------------ | ------------ |
| `f64_add_chain`    | 13.3 / 0.528 | 12.7 / 0.557 | 11.9 / 0.545 | 12.2 / 0.565 |
| `f64_add_x4`       | 8.55 / 0.165 | 7.62 / 0.186 | 7.72 / 0.182 | 7.54 / 0.189 |
| `f64_add_direct`   | 18.0 / 0.515 | 17.7 / 0.528 | 18.3 / 0.562 | 17.8 / 0.536 |
| `f64_add_indirect` | 16.7 / 1.12  | 17.7 / 1.11  | 18.6 / 1.15  | 17.8 / 1.10  |
| `f64_add_stdfn`    | 17.5 / 2.24  | 17.5 / 2.15  | 18.7 / 2.34  | 17.9 / 2.26  |
| `f64_add_closure`  | 15.6 / 2.11  | 16.2 / 2.16  | 16.9 / 2.23  | 17.7 / 2.27  |
| `f64_mul_chain`    | 14.8 / 1.11  | 12.2 / 1.12  | 12.2 / 1.09  | 11.8 / 1.06  |
| `f64_mul_x4`       | 8.84 / 0.265 | 7.25 / 0.286 | 7.78 / 0.286 | 7.53 / 0.269 |
| `f64_mul_direct`   | 18.9 / 1.06  | 17.5 / 1.15  | 17.6 / 1.11  | 17.4 / 1.12  |
| `f64_mul_indirect` | 16.4 / 1.06  | 17.6 / 1.10  | 18.1 / 1.18  | 18.4 / 1.11  |
| `f64_mul_stdfn`    | 16.6 / 2.38  | 18.2 / 2.67  | 17.8 / 2.51  | 18.4 / 2.48  |
| `f64_mul_closure`  | 15.7 / 2.37  | 17.7 / 2.57  | 17.8 / 2.47  | 17.7 / 2.52  |
| `u32_add_chain`    | 45.9 / 0.265 | 45.4 / 0.271 | 44.2 / 0.293 | 44.8 / 0.268 |
| `u32_add_x4`       | 45.1 / 0.155 | 43.3 / 0.163 | 43.6 / 0.166 | 41.6 / 0.162 |
| `u32_add_direct`   | 52.7 / 0.265 | 50.3 / 0.271 | 50.5 / 0.313 | 50.9 / 0.336 |
| `u32_add_indirect` | 49.7 / 1.50  | 51.7 / 1.49  | 51.9 / 1.46  | 51.9 / 1.41  |
| `u32_add_stdfn`    | 49.5 / 2.17  | 50.9 / 2.12  | 51.3 / 2.13  | 51.5 / 2.15  |
| `u32_add_closure`  | 51.0 / 1.32  | 53.2 / 1.42  | 54.8 / 1.46  | 53.0 / 1.45  |
| `u32_mul_chain`    | 36.9 / 0.814 | 36.4 / 0.791 | 36.7 / 0.806 | 37.0 / 0.856 |
| `u32_mul_x4`       | 36.9 / 0.258 | 37.6 / 0.274 | 37.2 / 0.268 | 37.0 / 0.265 |
| `u32_mul_direct`   | 41.0 / 0.772 | 44.5 / 0.813 | 42.9 / 0.814 | 42.8 / 0.798 |
| `u32_mul_indirect` | 43.5 / 1.42  | 47.7 / 1.46  | 48.5 / 1.41  | 46.4 / 1.40  |
| `u32_mul_stdfn`    | 45.2 / 2.06  | 45.5 / 2.14  | 47.0 / 2.11  | 47.3 / 2.12  |
| `u32_mul_closure`  | 45.0 / 1.06  | 47.6 / 1.19  | 47.5 / 1.10  | 46.6 / 1.19  |
| `loop_control`     | 49.9 / 0.279 | 45.4 / 0.278 | 44.9 / 0.297 | 43.4 / 0.286 |
| `f64_array_4k`     | 14.6 / 0.163 | 11.2 / 0.175 | 11.2 / 0.186 | 10.8 / 0.188 |
| `f64_array_1m`     | 19.4 / 0.207 | 12.5 / 0.167 | 11.6 / 0.177 | 11.8 / 0.164 |
| `f64_array_64m`    | 20.3 / 0.726 | 11.9 / 0.687 | 11.4 / 0.618 | 11.7 / 0.556 |

### Strings at N = 10,000,000 (bounded iterations)

| Kernel                               | Iterations | Input units | Contract                                                                         | Alloc | Code units processed | Bytes allocated | Checksum               | Nona ms          | C++ ms              | Nona/C++ | Nona ns/it | C++ ns/it | Nona Mcu/s | C++ Mcu/s | Status |
| ------------------------------------ | ---------- | ----------- | -------------------------------------------------------------------------------- | ----- | -------------------- | --------------- | ---------------------- | ---------------- | ------------------- | -------- | ---------- | --------- | ---------- | --------- | ------ |
| `str_scan_ascii_short`               | 10,000,000 | 16          | UTF-16                                                                           | no    | 160,000,000          | 0               | `u32:3219999744`       | 7160 [6978–7213] | 19.8 [18.7–20.3]    | 362      | 716        | 1.98      | 22.3       | 8095      | ok     |
| `str_scan_ascii_short_bytes`         | 10,000,000 | 16          | bytes (not equivalent)                                                           | no    | 160,000,000          | 0               | `u32:3219999744`       | 6674 [6666–6893] | 21.8 [20.4–21.9]    | 306      | 667        | 2.18      | 24.0       | 7332      | ok     |
| `str_equal_ascii_short`              | 10,000,000 | 16          | UTF-16                                                                           | no    | 142,500,000          | 0               | `u32:5000000`          | 119 [117–123]    | 50.2 [49.0–51.5]    | 2.37     | 11.9       | 5.02      | 1198       | 2840      | ok     |
| `str_compare_ascii_short`            | 10,000,000 | 16          | UTF-16                                                                           | no    | 142,500,000          | 0               | `u32:2500000`          | 166 [164–168]    | 68.8 [67.0–69.3]    | 2.42     | 16.6       | 6.88      | 857        | 2072      | ok     |
| `str_slice_ascii_short`              | 10,000,000 | 16          | UTF-16                                                                           | yes   | 40,000,000           | 80,000,000      | `u32:212488039`        | 1988 [1980–2013] | 46.7 [45.3–48.2]    | 42.5     | 199        | 4.67      | 20.1       | 856       | ok     |
| `str_slice_ascii_short_view`         | 10,000,000 | 16          | UTF-16, non-owning std::u16string_view: lower bound                              | yes   | 40,000,000           | 80,000,000      | `u32:212488039`        | 1987 [1962–2016] | 19.4 [19.1–19.6]    | 102      | 199        | 1.94      | 20.1       | 2061      | ok     |
| `str_indexof_ascii_short_n4`         | 10,000,000 | 16          | UTF-16                                                                           | no    | 137,500,000          | 0               | `u32:355505728`        | 1030 [1017–1041] | 91.5 [89.9–93.1]    | 11.3     | 103        | 9.15      | 134        | 1503      | ok     |
| `str_indexof_ascii_short_n4_bytes`   | 10,000,000 | 16          | bytes (not equivalent)                                                           | no    | 137,500,000          | 0               | `u32:355505728`        | 1039 [1021–1048] | 93.5 [91.9–95.4]    | 11.1     | 104        | 9.35      | 132        | 1471      | ok     |
| `str_concat_ascii_short`             | 10,000,000 | 16          | UTF-16                                                                           | yes   | 100,000,000          | 200,000,000     | `u32:833663312`        | 1173 [1149–1195] | 168 [163–172]       | 6.99     | 117        | 16.8      | 85.3       | 596       | ok     |
| `str_concat_ascii_short_append`      | 10,000,000 | 16          | UTF-16, mutable s += piece: lower bound                                          | yes   | 100,000,000          | 200,000,000     | `u32:833663312`        | 1226 [1152–1307] | 31.7 [30.3–32.7]    | 38.7     | 123        | 3.17      | 81.5       | 3152      | ok     |
| `str_builder_ascii_short`            | 1,000,000  | 16          | UTF-16, reserved std::u16string append: architectural lower bound of push + join | yes   | 4,000,000            | 8,000,000       | `u32:533981032`        | 222 [220–225]    | 2.69 [2.63–2.77]    | 82.5     | 222        | <10 ms    | 18.0       | 1486      | ok     |
| `str_builder_ascii_short_join`       | 1,000,000  | 16          | UTF-16                                                                           | yes   | 4,000,000            | 8,000,000       | `u32:533981032`        | 243 [238–248]    | 22.2 [21.5–22.4]    | 10.9     | 243        | 22.2      | 16.4       | 180       | ok     |
| `str_splitjoin_ascii_short`          | 1,000,000  | 16          | UTF-16                                                                           | yes   | 16,000,000           | 58,000,000      | `u32:2114987876`       | 1068 [1031–1091] | 118 [114–125]       | 9.04     | 1068       | 118       | 15.0       | 135       | ok     |
| `str_replace_ascii_short`            | 1,000,000  | 16          | UTF-16                                                                           | yes   | 16,000,000           | 34,000,000      | `u32:336317114`        | 583 [558–600]    | 29.1 [28.5–31.7]    | 20.1     | 583        | 29.1      | 27.4       | 551       | ok     |
| `str_replaceall_ascii_short`         | 1,000,000  | 16          | UTF-16                                                                           | yes   | 16,000,000           | 34,000,000      | `u32:336317114`        | 1604 [1594–1622] | 52.6 [51.0–53.3]    | 30.5     | 1604       | 52.6      | 9.97       | 304       | ok     |
| `str_scan_ascii_medium`              | 100,000    | 1,024       | UTF-16                                                                           | no    | 102,400,000          | 0               | `u32:165984256`        | 4196 [4083–4434] | 6.87 [6.69–7.26]    | 611      | 41957      | <10 ms    | 24.4       | 14903     | ok     |
| `str_scan_ascii_medium_bytes`        | 100,000    | 1,024       | bytes (not equivalent)                                                           | no    | 102,400,000          | 0               | `u32:165984256`        | 4394 [4370–4472] | 6.68 [6.38–6.98]    | 658      | 43943      | <10 ms    | 23.3       | 15338     | ok     |
| `str_equal_ascii_medium`             | 100,000    | 1,024       | UTF-16                                                                           | no    | 89,625,000           | 0               | `u32:50000`            | 8.01 [7.53–8.59] | 27.5 [27.0–27.8]    | 0.291    | <10 ms     | 275       | 11196      | 3258      | ok     |
| `str_compare_ascii_medium`           | 100,000    | 1,024       | UTF-16                                                                           | no    | 89,625,000           | 0               | `u32:50000`            | 9.52 [9.20–10.1] | 40.6 [37.9–42.5]    | 0.235    | <10 ms     | 406       | 9415       | 2208      | ok     |
| `str_slice_ascii_medium`             | 1,000,000  | 1,024       | UTF-16                                                                           | yes   | 256,000,000          | 512,000,000     | `u32:2050816504`       | 274 [267–278]    | 20.2 [18.8–20.7]    | 13.6     | 274        | 20.2      | 933        | 12667     | ok     |
| `str_slice_ascii_medium_view`        | 1,000,000  | 1,024       | UTF-16, non-owning std::u16string_view: lower bound                              | yes   | 256,000,000          | 512,000,000     | `u32:2050816504`       | 287 [274–294]    | 2.22 [2.17–2.30]    | 130      | 287        | <10 ms    | 892        | 115501    | ok     |
| `str_indexof_ascii_medium_n4`        | 100,000    | 1,024       | UTF-16                                                                           | no    | 79,281,250           | 0               | `u32:819463620`        | 51.3 [50.7–52.1] | 53.0 [52.3–56.5]    | 0.968    | 513        | 530       | 1545       | 1496      | ok     |
| `str_indexof_ascii_medium_n4_bytes`  | 100,000    | 1,024       | bytes (not equivalent)                                                           | no    | 79,281,250           | 0               | `u32:819463620`        | 52.7 [50.7–57.3] | 41.8 [41.0–42.1]    | 1.26     | 527        | 418       | 1505       | 1896      | ok     |
| `str_indexof_ascii_medium_n64`       | 100,000    | 1,024       | UTF-16                                                                           | no    | 81,068,750           | 0               | `u32:2469527916`       | 47.9 [47.5–49.9] | 53.2 [51.7–55.1]    | 0.901    | 479        | 532       | 1691       | 1524      | ok     |
| `str_indexof_ascii_medium_n64_bytes` | 100,000    | 1,024       | bytes (not equivalent)                                                           | no    | 81,068,750           | 0               | `u32:2469527916`       | 47.9 [47.0–49.8] | 29.9 [29.5–31.3]    | 1.60     | 479        | 299       | 1694       | 2709      | ok     |
| `str_concat_ascii_medium`            | 1,000,000  | 1,024       | UTF-16                                                                           | yes   | 520,000,000          | 1,040,000,000   | `u32:675629924`        | 54.9 [52.3–56.1] | 34.8 [33.6–37.4]    | 1.58     | 54.9       | 34.8      | 9474       | 14924     | ok     |
| `str_concat_ascii_medium_append`     | 1,000,000  | 1,024       | UTF-16, mutable s += piece: lower bound                                          | yes   | 520,000,000          | 1,040,000,000   | `u32:675629924`        | 53.6 [52.3–54.6] | 2.22 [2.16–2.32]    | 24.1     | 53.6       | <10 ms    | 9707       | 234363    | ok     |
| `str_builder_ascii_medium`           | 1,000,000  | 1,024       | UTF-16, reserved std::u16string append: architectural lower bound of push + join | yes   | 16,000,000           | 32,000,000      | `u32:675629924`        | 123 [121–129]    | 2.16 [2.07–2.34]    | 56.7     | 123        | <10 ms    | 130        | 7394      | ok     |
| `str_builder_ascii_medium_join`      | 1,000,000  | 1,024       | UTF-16                                                                           | yes   | 16,000,000           | 32,000,000      | `u32:675629924`        | 125 [122–131]    | 9.80 [9.39–10.3]    | 12.8     | 125        | <10 ms    | 128        | 1633      | ok     |
| `str_splitjoin_ascii_medium`         | 10,000     | 1,024       | UTF-16                                                                           | yes   | 10,240,000           | 37,100,000      | `u32:3199016812`       | 229 [227–233]    | 30.6 [29.8–31.4]    | 7.50     | 22917      | 3055      | 44.7       | 335       | ok     |
| `str_replace_ascii_medium`           | 100,000    | 1,024       | UTF-16                                                                           | yes   | 102,400,000          | 205,000,000     | `u32:2080906359`       | 158 [155–161]    | 29.1 [28.3–29.5]    | 5.44     | 1585       | 291       | 646        | 3514      | ok     |
| `str_replaceall_ascii_medium`        | 10,000     | 1,024       | UTF-16                                                                           | yes   | 10,240,000           | 20,520,000      | `u32:2037350445`       | 30.0 [29.2–31.2] | 5.53 [5.37–5.69]    | 5.42     | 2995       | <10 ms    | 342        | 1853      | ok     |
| `str_scan_ascii_large`               | 100        | 1,048,576   | UTF-16                                                                           | no    | 104,857,600          | 0               | `u32:3403920064`       | 4664 [4607–4793] | 7.24 [7.01–7.77]    | 644      | 46638949   | <10 ms    | 22.5       | 14478     | ok     |
| `str_scan_ascii_large_bytes`         | 100        | 1,048,576   | bytes (not equivalent)                                                           | no    | 104,857,600          | 0               | `u32:3403920064`       | 4623 [4553–4681] | 6.98 [6.67–7.09]    | 662      | 46227829   | <10 ms    | 22.7       | 15018     | ok     |
| `str_equal_ascii_large`              | 100        | 1,048,576   | UTF-16                                                                           | no    | 91,750,425           | 0               | `u32:50`               | 9.01 [8.90–9.22] | 26.0 [25.7–26.4]    | 0.347    | <10 ms     | 259515    | 10187      | 3535      | ok     |
| `str_compare_ascii_large`            | 100        | 1,048,576   | UTF-16                                                                           | no    | 91,750,425           | 0               | `u32:50`               | 9.24 [8.98–10.1] | 38.4 [37.0–39.7]    | 0.241    | <10 ms     | 384074    | 9925       | 2389      | ok     |
| `str_slice_ascii_large`              | 1,000      | 1,048,576   | UTF-16                                                                           | yes   | 262,144,000          | 524,288,000     | `u32:1352249917`       | 49.0 [47.9–50.3] | 22.4 [21.3–23.6]    | 2.19     | 48954      | 22378     | 5355       | 11714     | ok     |
| `str_slice_ascii_large_view`         | 1,000      | 1,048,576   | UTF-16, non-owning std::u16string_view: lower bound                              | yes   | 262,144,000          | 524,288,000     | `u32:1352249917`       | 49.9 [48.5–51.0] | 0.193 [0.180–0.197] | 259      | 49896      | <10 ms    | 5254       | 1359457   | ok     |
| `str_indexof_ascii_large_n4`         | 100        | 1,048,576   | UTF-16                                                                           | no    | 14,564,827           | 0               | `u32:2511893413`       | 12.6 [12.2–13.0] | 14.7 [14.0–15.4]    | 0.860    | 126214     | 146794    | 1154       | 992       | ok     |
| `str_indexof_ascii_large_n4_bytes`   | 100        | 1,048,576   | bytes (not equivalent)                                                           | no    | 14,564,827           | 0               | `u32:2511893413`       | 13.1 [12.1–13.6] | 7.58 [7.34–7.76]    | 1.73     | 130859     | <10 ms    | 1113       | 1922      | ok     |
| `str_indexof_ascii_large_n64`        | 100        | 1,048,576   | UTF-16                                                                           | no    | 79,634,839           | 0               | `u32:2167581853`       | 75.1 [73.0–76.7] | 102 [101–108]       | 0.734    | 750577     | 1023012   | 1061       | 778       | ok     |
| `str_indexof_ascii_large_n64_bytes`  | 100        | 1,048,576   | bytes (not equivalent)                                                           | no    | 79,634,839           | 0               | `u32:2167581853`       | 74.6 [72.4–78.4] | 50.3 [50.2–51.9]    | 1.48     | 745558     | 502963    | 1068       | 1583      | ok     |
| `str_concat_ascii_large`             | 2,000      | 1,048,576   | UTF-16                                                                           | yes   | 1,025,613,824        | 2,051,227,648   | `u32:3833988530`       | 1.94 [1.86–1.99] | 186 [181–189]       | 0.0104   | <10 ms     | 93126     | 529109     | 5507      | ok     |
| `str_concat_ascii_large_append`      | 2,000      | 1,048,576   | UTF-16, mutable s += piece: lower bound                                          | yes   | 1,025,613,824        | 2,051,227,648   | `u32:3833988530`       | 2.08 [1.96–2.32] | 1.42 [1.36–1.47]    | 1.47     | <10 ms     | <10 ms    | 493460     | 723980    | ok     |
| `str_builder_ascii_large`            | 100,000    | 1,048,576   | UTF-16, reserved std::u16string append: architectural lower bound of push + join | yes   | 102,400,000          | 203,423,744     | `u32:3041936056`       | 138 [135–142]    | 7.07 [6.79–7.34]    | 19.6     | 1385       | <10 ms    | 740        | 14489     | ok     |
| `str_builder_ascii_large_join`       | 100,000    | 1,048,576   | UTF-16                                                                           | yes   | 102,400,000          | 203,423,744     | `u32:3041936056`       | 137 [134–146]    | 8.37 [7.79–8.84]    | 16.4     | 1372       | <10 ms    | 747        | 12236     | ok     |
| `str_splitjoin_ascii_large`          | 10         | 1,048,576   | UTF-16                                                                           | yes   | 10,485,760           | 38,127,420      | `u32:2434455824`       | 303 [297–313]    | 75.7 [73.6–79.4]    | 4.00     | 30324691   | 7571924   | 34.6       | 138       | ok     |
| `str_replace_ascii_large`            | 100        | 1,048,576   | UTF-16                                                                           | yes   | 104,857,600          | 209,715,400     | `u32:1901973594`       | 43.7 [43.2–46.2] | 8.31 [8.20–8.96]    | 5.25     | 436655     | <10 ms    | 2401       | 12612     | ok     |
| `str_replaceall_ascii_large`         | 100        | 1,048,576   | UTF-16                                                                           | yes   | 104,857,600          | 210,232,800     | `u32:2370591863`       | 179 [177–184]    | 151 [148–160]       | 1.18     | 1789241    | 1513120   | 586        | 693       | ok     |
| `str_scan_bmp_short`                 | 10,000,000 | 16          | UTF-16                                                                           | no    | 160,000,000          | 0               | `u32:4013870080`       | 7735 [7678–7887] | 19.8 [19.4–21.4]    | 391      | 774        | 1.98      | 20.7       | 8090      | ok     |
| `str_equal_bmp_short`                | 10,000,000 | 16          | UTF-16                                                                           | no    | 142,500,000          | 0               | `u32:5000000`          | 127 [125–137]    | 52.1 [51.0–54.3]    | 2.44     | 12.7       | 5.21      | 1123       | 2737      | ok     |
| `str_compare_bmp_short`              | 10,000,000 | 16          | UTF-16                                                                           | no    | 142,500,000          | 0               | `u32:0`                | 169 [166–178]    | 74.2 [68.9–76.5]    | 2.27     | 16.9       | 7.42      | 845        | 1920      | ok     |
| `str_slice_bmp_short`                | 10,000,000 | 16          | UTF-16                                                                           | yes   | 40,000,000           | 80,000,000      | `u32:435448082`        | 2216 [2188–2236] | 46.4 [45.2–49.9]    | 47.8     | 222        | 4.64      | 18.0       | 863       | ok     |
| `str_slice_bmp_short_view`           | 10,000,000 | 16          | UTF-16, non-owning std::u16string_view: lower bound                              | yes   | 40,000,000           | 80,000,000      | `u32:435448082`        | 2183 [2153–2220] | 20.6 [20.4–22.0]    | 106      | 218        | 2.06      | 18.3       | 1940      | ok     |
| `str_indexof_bmp_short_n4`           | 10,000,000 | 16          | UTF-16                                                                           | no    | 137,500,000          | 0               | `u32:355505728`        | 1111 [1102–1144] | 104 [100–108]       | 10.7     | 111        | 10.4      | 124        | 1327      | ok     |
| `str_concat_bmp_short`               | 10,000,000 | 16          | UTF-16                                                                           | yes   | 100,000,000          | 200,000,000     | `u32:473124128`        | 1258 [1231–1262] | 173 [169–185]       | 7.29     | 126        | 17.3      | 79.5       | 579       | ok     |
| `str_concat_bmp_short_append`        | 10,000,000 | 16          | UTF-16, mutable s += piece: lower bound                                          | yes   | 100,000,000          | 200,000,000     | `u32:473124128`        | 1253 [1214–1271] | 30.9 [29.8–33.0]    | 40.6     | 125        | 3.09      | 79.8       | 3236      | ok     |
| `str_builder_bmp_short`              | 1,000,000  | 16          | UTF-16, reserved std::u16string append: architectural lower bound of push + join | yes   | 4,000,000            | 8,000,000       | `u32:4215028848`       | 240 [228–262]    | 2.80 [2.63–2.88]    | 85.6     | 240        | <10 ms    | 16.7       | 1430      | ok     |
| `str_builder_bmp_short_join`         | 1,000,000  | 16          | UTF-16                                                                           | yes   | 4,000,000            | 8,000,000       | `u32:4215028848`       | 238 [229–258]    | 20.8 [20.2–21.1]    | 11.5     | 238        | 20.8      | 16.8       | 193       | ok     |
| `str_splitjoin_bmp_short`            | 1,000,000  | 16          | UTF-16                                                                           | yes   | 16,000,000           | 58,000,000      | `u32:2391680912`       | 1092 [1079–1116] | 120 [119–124]       | 9.11     | 1092       | 120       | 14.6       | 133       | ok     |
| `str_replace_bmp_short`              | 1,000,000  | 16          | UTF-16                                                                           | yes   | 16,000,000           | 34,000,000      | `u32:2086741820`       | 597 [581–613]    | 30.6 [29.5–31.2]    | 19.5     | 597        | 30.6      | 26.8       | 522       | ok     |
| `str_replaceall_bmp_short`           | 1,000,000  | 16          | UTF-16                                                                           | yes   | 16,000,000           | 34,000,000      | `u32:2086741820`       | 1683 [1666–1704] | 53.0 [52.3–57.2]    | 31.8     | 1683       | 53.0      | 9.51       | 302       | ok     |
| `str_scan_bmp_medium`                | 100,000    | 1,024       | UTF-16                                                                           | no    | 102,400,000          | 0               | `u32:2136736768`       | 4746 [4686–4860] | 7.23 [7.01–7.67]    | 657      | 47461      | <10 ms    | 21.6       | 14167     | ok     |
| `str_equal_bmp_medium`               | 100,000    | 1,024       | UTF-16                                                                           | no    | 89,625,000           | 0               | `u32:50000`            | 8.38 [8.15–8.55] | 26.6 [26.1–26.8]    | 0.316    | <10 ms     | 266       | 10695      | 3375      | ok     |
| `str_compare_bmp_medium`             | 100,000    | 1,024       | UTF-16                                                                           | no    | 89,625,000           | 0               | `u32:25000`            | 8.84 [8.42–9.07] | 40.6 [39.1–43.6]    | 0.218    | <10 ms     | 406       | 10138      | 2207      | ok     |
| `str_slice_bmp_medium`               | 1,000,000  | 1,024       | UTF-16                                                                           | yes   | 256,000,000          | 512,000,000     | `u32:3202877607`       | 272 [270–289]    | 18.5 [17.5–18.7]    | 14.7     | 272        | 18.5      | 941        | 13827     | ok     |
| `str_slice_bmp_medium_view`          | 1,000,000  | 1,024       | UTF-16, non-owning std::u16string_view: lower bound                              | yes   | 256,000,000          | 512,000,000     | `u32:3202877607`       | 277 [268–286]    | 2.10 [2.05–2.17]    | 132      | 277        | <10 ms    | 924        | 121840    | ok     |
| `str_indexof_bmp_medium_n4`          | 100,000    | 1,024       | UTF-16                                                                           | no    | 79,281,250           | 0               | `u32:819463620`        | 51.6 [50.3–52.4] | 53.2 [52.8–57.0]    | 0.970    | 516        | 532       | 1536       | 1491      | ok     |
| `str_indexof_bmp_medium_n64`         | 100,000    | 1,024       | UTF-16                                                                           | no    | 81,068,750           | 0               | `u32:2469527916`       | 46.6 [44.9–47.9] | 50.6 [49.4–52.0]    | 0.921    | 466        | 506       | 1741       | 1603      | ok     |
| `str_concat_bmp_medium`              | 1,000,000  | 1,024       | UTF-16                                                                           | yes   | 520,000,000          | 1,040,000,000   | `u32:212801424`        | 50.3 [50.1–52.4] | 31.8 [31.4–32.9]    | 1.58     | 50.3       | 31.8      | 10329      | 16360     | ok     |
| `str_concat_bmp_medium_append`       | 1,000,000  | 1,024       | UTF-16, mutable s += piece: lower bound                                          | yes   | 520,000,000          | 1,040,000,000   | `u32:212801424`        | 50.4 [49.9–51.3] | 2.31 [2.22–2.57]    | 21.8     | 50.4       | <10 ms    | 10320      | 225033    | ok     |
| `str_builder_bmp_medium`             | 1,000,000  | 1,024       | UTF-16, reserved std::u16string append: architectural lower bound of push + join | yes   | 16,000,000           | 32,000,000      | `u32:212801424`        | 130 [123–140]    | 2.09 [2.06–2.37]    | 61.9     | 130        | <10 ms    | 123        | 7638      | ok     |
| `str_builder_bmp_medium_join`        | 1,000,000  | 1,024       | UTF-16                                                                           | yes   | 16,000,000           | 32,000,000      | `u32:212801424`        | 128 [124–138]    | 9.94 [9.69–10.1]    | 12.9     | 128        | <10 ms    | 125        | 1610      | ok     |
| `str_splitjoin_bmp_medium`           | 10,000     | 1,024       | UTF-16                                                                           | yes   | 10,240,000           | 37,100,000      | `u32:1082252742`       | 224 [217–225]    | 30.0 [29.1–30.7]    | 7.47     | 22412      | 3000      | 45.7       | 341       | ok     |
| `str_replace_bmp_medium`             | 100,000    | 1,024       | UTF-16                                                                           | yes   | 102,400,000          | 205,000,000     | `u32:2941487492`       | 138 [130–145]    | 17.5 [16.9–18.3]    | 7.90     | 1385       | 175       | 739        | 5846      | ok     |
| `str_replaceall_bmp_medium`          | 10,000     | 1,024       | UTF-16                                                                           | yes   | 10,240,000           | 20,520,000      | `u32:835844970`        | 27.7 [27.3–28.4] | 6.07 [5.71–6.30]    | 4.56     | 2768       | <10 ms    | 370        | 1687      | ok     |
| `str_scan_bmp_large`                 | 100        | 1,048,576   | UTF-16                                                                           | no    | 104,857,600          | 0               | `u32:2375232912`       | 4761 [4666–4868] | 7.50 [7.14–8.13]    | 634      | 47609351   | <10 ms    | 22.0       | 13975     | ok     |
| `str_equal_bmp_large`                | 100        | 1,048,576   | UTF-16                                                                           | no    | 91,750,425           | 0               | `u32:50`               | 9.31 [8.77–9.74] | 25.9 [25.7–26.3]    | 0.360    | <10 ms     | 258720    | 9853       | 3546      | ok     |
| `str_compare_bmp_large`              | 100        | 1,048,576   | UTF-16                                                                           | no    | 91,750,425           | 0               | `u32:25`               | 9.11 [8.83–9.81] | 38.2 [37.5–38.7]    | 0.238    | <10 ms     | 382203    | 10074      | 2401      | ok     |
| `str_slice_bmp_large`                | 1,000      | 1,048,576   | UTF-16                                                                           | yes   | 262,144,000          | 524,288,000     | `u32:2273110339`       | 50.7 [47.8–51.8] | 21.3 [21.1–22.1]    | 2.39     | 50716      | 21255     | 5169       | 12333     | ok     |
| `str_slice_bmp_large_view`           | 1,000      | 1,048,576   | UTF-16, non-owning std::u16string_view: lower bound                              | yes   | 262,144,000          | 524,288,000     | `u32:2273110339`       | 49.5 [47.3–51.1] | 0.189 [0.176–0.192] | 262      | 49451      | <10 ms    | 5301       | 1386279   | ok     |
| `str_indexof_bmp_large_n4`           | 100        | 1,048,576   | UTF-16                                                                           | no    | 14,564,827           | 0               | `u32:2511893413`       | 12.4 [11.9–13.1] | 14.5 [13.8–14.8]    | 0.857    | 123978     | 144703    | 1175       | 1007      | ok     |
| `str_indexof_bmp_large_n64`          | 100        | 1,048,576   | UTF-16                                                                           | no    | 79,634,839           | 0               | `u32:2167581853`       | 74.6 [72.0–76.6] | 97.0 [95.6–104]     | 0.770    | 746379     | 969626    | 1067       | 821       | ok     |
| `str_concat_bmp_large`               | 2,000      | 1,048,576   | UTF-16                                                                           | yes   | 1,025,613,824        | 2,051,227,648   | `u32:3405729177`       | 1.94 [1.89–2.01] | 184 [180–186]       | 0.0105   | <10 ms     | 92019     | 529977     | 5573      | ok     |
| `str_concat_bmp_large_append`        | 2,000      | 1,048,576   | UTF-16, mutable s += piece: lower bound                                          | yes   | 1,025,613,824        | 2,051,227,648   | `u32:3405729177`       | 2.11 [1.98–2.16] | 1.47 [1.38–1.49]    | 1.43     | <10 ms     | <10 ms    | 487039     | 698702    | ok     |
| `str_builder_bmp_large`              | 100,000    | 1,048,576   | UTF-16, reserved std::u16string append: architectural lower bound of push + join | yes   | 102,400,000          | 203,423,744     | `u32:1908863601`       | 136 [133–137]    | 7.03 [6.88–7.60]    | 19.3     | 1360       | <10 ms    | 753        | 14559     | ok     |
| `str_builder_bmp_large_join`         | 100,000    | 1,048,576   | UTF-16                                                                           | yes   | 102,400,000          | 203,423,744     | `u32:1908863601`       | 135 [133–141]    | 7.92 [7.83–8.22]    | 17.1     | 1355       | <10 ms    | 756        | 12936     | ok     |
| `str_splitjoin_bmp_large`            | 10         | 1,048,576   | UTF-16                                                                           | yes   | 10,485,760           | 38,127,420      | `u32:4215232771`       | 291 [287–297]    | 75.1 [74.7–80.5]    | 3.88     | 29146145   | 7510783   | 36.0       | 140       | ok     |
| `str_replace_bmp_large`              | 100        | 1,048,576   | UTF-16                                                                           | yes   | 104,857,600          | 209,715,400     | `u32:473220178`        | 44.4 [42.0–47.6] | 9.01 [8.33–9.10]    | 4.93     | 444231     | <10 ms    | 2360       | 11638     | ok     |
| `str_replaceall_bmp_large`           | 100        | 1,048,576   | UTF-16                                                                           | yes   | 104,857,600          | 210,218,800     | `u32:2246739769`       | 183 [180–187]    | 120 [118–129]       | 1.53     | 1832342    | 1197875   | 572        | 875       | ok     |
| `str_scan_astral_short`              | 10,000,000 | 16          | UTF-16                                                                           | no    | 160,000,000          | 0               | `u32:686246912`        | 7366 [6892–7525] | 19.5 [19.0–20.0]    | 377      | 737        | 1.95      | 21.7       | 8187      | ok     |
| `str_slice_astral_short`             | 10,000,000 | 16          | UTF-16                                                                           | yes   | 40,000,000           | 80,000,000      | `u32:360926916`        | 2035 [2009–2082] | 46.1 [45.1–46.7]    | 44.1     | 203        | 4.61      | 19.7       | 867       | ok     |
| `str_slice_astral_short_view`        | 10,000,000 | 16          | UTF-16, non-owning std::u16string_view: lower bound                              | yes   | 40,000,000           | 80,000,000      | `u32:360926916`        | 2074 [2029–2096] | 20.4 [19.9–20.8]    | 102      | 207        | 2.04      | 19.3       | 1964      | ok     |
| `str_indexof_astral_short_n4`        | 10,000,000 | 16          | UTF-16                                                                           | no    | 141,875,000          | 0               | `u32:2384107344`       | 1189 [1173–1201] | 125 [118–126]       | 9.52     | 119        | 12.5      | 119        | 1136      | ok     |
| `str_replace_astral_short`           | 1,000,000  | 16          | UTF-16                                                                           | yes   | 16,000,000           | 34,000,000      | `u32:2594957937`       | 602 [596–625]    | 30.8 [30.4–31.7]    | 19.6     | 602        | 30.8      | 26.6       | 520       | ok     |
| `str_replaceall_astral_short`        | 1,000,000  | 16          | UTF-16                                                                           | yes   | 16,000,000           | 36,000,000      | `u32:1433036202`       | 1667 [1618–1689] | 67.9 [67.0–70.8]    | 24.5     | 1667       | 67.9      | 9.60       | 236       | ok     |
| `str_scan_astral_medium`             | 100,000    | 1,024       | UTF-16                                                                           | no    | 102,400,000          | 0               | `u32:815764480`        | 4468 [4386–4577] | 7.44 [7.22–7.86]    | 600      | 44678      | <10 ms    | 22.9       | 13755     | ok     |
| `str_slice_astral_medium`            | 1,000,000  | 1,024       | UTF-16                                                                           | yes   | 256,000,000          | 512,000,000     | `u32:3211901312`       | 284 [272–289]    | 19.2 [18.2–19.4]    | 14.8     | 284        | 19.2      | 901        | 13350     | ok     |
| `str_slice_astral_medium_view`       | 1,000,000  | 1,024       | UTF-16, non-owning std::u16string_view: lower bound                              | yes   | 256,000,000          | 512,000,000     | `u32:3211901312`       | 282 [269–288]    | 2.20 [2.03–2.39]    | 128      | 282        | <10 ms    | 909        | 116130    | ok     |
| `str_indexof_astral_medium_n4`       | 100,000    | 1,024       | UTF-16                                                                           | no    | 69,531,250           | 0               | `u32:2627439364`       | 57.1 [56.1–62.3] | 46.5 [45.5–47.0]    | 1.23     | 571        | 465       | 1218       | 1496      | ok     |
| `str_indexof_astral_medium_n64`      | 100,000    | 1,024       | UTF-16                                                                           | no    | 83,412,500           | 0               | `u32:3658780124`       | 61.4 [60.6–63.4] | 56.5 [54.9–58.0]    | 1.09     | 614        | 565       | 1357       | 1477      | ok     |
| `str_replace_astral_medium`          | 100,000    | 1,024       | UTF-16                                                                           | yes   | 102,400,000          | 205,000,000     | `u32:2618999118`       | 97.0 [94.5–101]  | 5.04 [4.80–5.51]    | 19.3     | 970        | <10 ms    | 1055       | 20328     | ok     |
| `str_replaceall_astral_medium`       | 10,000     | 1,024       | UTF-16                                                                           | yes   | 10,240,000           | 21,180,000      | `u32:3965838348`       | 58.4 [57.6–60.4] | 13.0 [12.4–14.1]    | 4.48     | 5843       | 1304      | 175        | 785       | ok     |
| `str_scan_astral_large`              | 100        | 1,048,576   | UTF-16                                                                           | no    | 104,857,600          | 0               | `u32:2047474688`       | 4777 [4672–4861] | 6.90 [6.70–7.20]    | 693      | 47766818   | <10 ms    | 22.0       | 15203     | ok     |
| `str_slice_astral_large`             | 1,000      | 1,048,576   | UTF-16                                                                           | yes   | 262,144,000          | 524,288,000     | `u32:3877532846`       | 45.4 [44.5–47.5] | 21.8 [21.3–22.9]    | 2.08     | 45440      | 21814     | 5769       | 12017     | ok     |
| `str_slice_astral_large_view`        | 1,000      | 1,048,576   | UTF-16, non-owning std::u16string_view: lower bound                              | yes   | 262,144,000          | 524,288,000     | `u32:3877532846`       | 47.1 [46.5–48.3] | 0.183 [0.181–0.200] | 258      | 47139      | <10 ms    | 5561       | 1432708   | ok     |
| `str_indexof_astral_large_n4`        | 100        | 1,048,576   | UTF-16                                                                           | no    | 1,110,641            | 0               | `u32:538983181`        | 1.58 [1.49–1.81] | 1.31 [1.26–1.43]    | 1.20     | <10 ms     | <10 ms    | 705        | 847       | ok     |
| `str_indexof_astral_large_n64`       | 100        | 1,048,576   | UTF-16                                                                           | no    | 76,685,379           | 0               | `u32:2599576147`       | 110 [102–110]    | 149 [143–157]       | 0.736    | 1098833    | 1492474   | 698        | 514       | ok     |
| `str_replace_astral_large`           | 100        | 1,048,576   | UTF-16                                                                           | yes   | 104,857,600          | 209,715,400     | `u32:2174881875`       | 44.2 [42.7–45.9] | 9.32 [8.74–9.63]    | 4.74     | 441702     | <10 ms    | 2374       | 11250     | ok     |
| `str_replaceall_astral_large`        | 100        | 1,048,576   | UTF-16                                                                           | yes   | 104,857,600          | 217,324,400     | `u32:195664560`        | 520 [516–527]    | 412 [408–421]       | 1.26     | 5199930    | 4121131   | 202        | 254       | ok     |
| `str_replaceall_log_large`           | 10         | 1,048,576   | UTF-16                                                                           | yes   | 10,485,760           | 18,455,760      | `u32:2605627441`       | 14.1 [13.0–15.6] | 11.3 [11.0–11.8]    | 1.24     | 1407312    | 1130778   | 745        | 927       | ok     |
| `str_format_int_short`               | 10,000,000 | —           | UTF-16                                                                           | yes   | 86,057,420           | 172,114,840     | `u32:1137588210`       | 3389 [3369–3486] | 411 [398–429]       | 8.24     | 339        | 41.1      | 25.4       | 209       | ok     |
| `str_format_int_short_bytes`         | 10,000,000 | —           | char buffer, no string object: lower bound                                       | yes   | 86,057,420           | 172,114,840     | `u32:1137588210`       | 3423 [3406–3469] | 279 [264–286]       | 12.3     | 342        | 27.9      | 25.1       | 308       | ok     |
| `str_parse_int_short`                | 10,000,000 | —           | UTF-16                                                                           | no    | 81,894,483           | 0               | `f64:4442cfb22ee45f9a` | 8751 [8723–8807] | 149 [146–155]       | 58.9     | 875        | 14.9      | 9.36       | 551       | ok     |
| `str_parse_int_short_bytes`          | 10,000,000 | —           | std::string digits, no narrowing: lower bound                                    | no    | 81,894,483           | 0               | `f64:4442cfb22ee45f9a` | 8698 [8625–8772] | 96.8 [95.8–100]     | 89.9     | 870        | 9.68      | 9.42       | 846       | ok     |

### Startup (loop_control 0, wall time on the Linux side)

| Binary       | Median ms | IQR ms    | Min–max ms | Status |
| ------------ | --------- | --------- | ---------- | ------ |
| nona         | 30.5      | 29.5–32.8 | 27.1–36.7  | ok     |
| cpp-o3       | 5.57      | 5.33–6.59 | 4.66–7.58  | ok     |
| cpp-noinline | 6.21      | 5.59–6.62 | 5.38–8.88  | ok     |
| cpp-native   | 5.52      | 4.94–5.79 | 4.52–5.88  | ok     |

Groups: 454, not accepted: 0.
