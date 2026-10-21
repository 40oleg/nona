# Nona vs optimized C++: ranked gap-to-cause map

Step 1 of [#402](https://github.com/40oleg/nona/issues/402). It ranks the gaps that the [#401](https://github.com/40oleg/nona/issues/401) harness (`bench/cpp/`) measures between Nona and `g++ -O3`, ties each one to its cause in the generated code or the runtime, separates what JavaScript semantics require from what Nona can remove, and selects the two fixes for the next steps. Fix A (step 2, [results](#fix-a-results-step-2)) and Fix B (step 3, [results](#fix-b-results-step-3)) are implemented, and gap 5 is addressed by [#424](#register-resident-numbers-and-int32-counters-424); the rest of this page is the step 1 baseline.

**Depends on #401.** The harness is not on `main` yet. This branch is rebased onto `origin/nona/issue-401` (`3673735`: arithmetic, call and UTF-16 string kernels) and is rebased again once #401 merges.

Figures marked _estimate_ are derived, not measured. Every other number comes from the raw results committed under `bench/cpp/results/`.

## Results of Fix A and Fix B

Same host and protocol as the baseline; "before" and "after" are measured in the same session, C++ binaries unchanged. Details, spreads and neighbouring kernels are in [Fix A results](#fix-a-results-step-2) and [Fix B results](#fix-b-results-step-3).

| Fix | Kernel                  | Before ms | After ms | Speedup | Nona/C++ before | Nona/C++ after |
| --- | ----------------------- | --------- | -------- | ------- | --------------- | -------------- |
| A   | `u32_add_chain`         | 439       | 202      | ×2.17   | ×160            | ×75.9          |
| A   | `u32_add_x4`            | 415       | 99.0     | ×4.19   | ×240            | ×60.2          |
| A   | `loop_control`          | 450       | 233      | ×1.93   | ×157            | ×74.8          |
| A   | `str_scan_ascii_short`  | 7136      | 4469     | ×1.60   | ×345            | ×234           |
| A   | `str_scan_ascii_medium` | 4745      | 2741     | ×1.73   | ×646            | ×387           |
| B   | `str_parse_int_short`   | 8632      | 407      | ×21.2   | ×57.1           | ×2.66          |

The other `u32_add_*` and `str_scan_*` kernels gain ×1.5–2.2 in the same way (Fix A table). Remaining gaps are linked from [Selection for the next steps](#selection-for-the-next-steps).

## Baseline

| Item        | Value                                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host        | `tors`, Intel Core i7-13620H (hybrid P/E cores), 16 GiB RAM; Windows 11 Pro (balanced power plan), WSL2 Ubuntu 22.04.3 (kernel 6.18.54.1), governor unavailable                           |
| Nona        | 0.20.0, `e78df329` (arithmetic run) / `3673735` (string run); the compiler is the same in both (#401 adds only `bench/cpp/`). `node dist/cli.js build … --target linux-x64`, no flags     |
| C++         | g++ 11.4 (WSL2), libstdc++; `o3` = `-std=c++17 -O3 -DNDEBUG -fno-fast-math -ffp-contract=off -march=x86-64 -mtune=generic`; `noinline` is diagnostic only                                 |
| Protocol    | `node bench/cpp/run.mjs --runs 11 --platform linux` (N = 10 000 000; string rows use the harness's per-kernel iteration counts); one warm-up per binary, 11 rounds in seeded random order |
| Checks      | `node bench/cpp/check-asm.mjs`: every C++ kernel keeps its loop and operation; every timed group printed one checksum in all 11 runs                                                      |
| Raw results | `bench/cpp/results/2026-10-20-tors-linux-wsl2-arith.{json,txt}`, `bench/cpp/results/2026-10-20-tors-linux-wsl2-strings.{json,txt}`                                                        |
| Caveats     | WSL2 on a shared desktop: other processes were running and the runner does not pin cores, so the spread includes P/E-core moves. Ratios are for this host only.                           |

Startup (`loop_control 0`, arithmetic run): Nona 31.4 ms [IQR 29.1–32.6], C++ 6.41 ms [5.81–7.27]. The string run's startup row failed: `--only strings` runs `loop_control` against the strings program, which has no such kernel (a harness issue, reported on #401); the string kernel timings are unaffected.

Times below are medians in ms with the interquartile range; the ratio is Nona/C++ `o3` of the medians.

## Ranked gaps

The ranking weighs the ratio, the absolute time per operation, how common the pattern is in real programs, and how confident the cause is. "Owner" is the issue (and open PR) that already covers the mechanism; gaps without one get a follow-up issue (step 4, filed).

| Rank | Gap                                                                 | Kernels (Nona vs C++)                                                                                                   | Cause (short)                                                                                                         | Mandatory?                                         | Owner                                                                                             |
| ---- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1    | ToInt32/ToUint32 of integers outside int32 leave the inline path    | `u32_add_*` ×25–266, `loop_control` ×134, `str_scan_*` ×325–650 (part)                                                  | `>>>`, `&`, `\|`, `^`, `<<`, `>>` inline only when both operands are int32; a u32 sum ≥ 2^31 calls `rt.shiftUnsigned` | avoidable                                          | none (extends #238) → **Fix A**                                                                   |
| 2    | `Number(string)` always runs the exact big-integer path             | `str_parse_int_short` ×54.9 (840 ns/op)                                                                                 | `rt.parseNumber` divides two scratch big integers bit by bit for every input, even `"123"`                            | avoidable                                          | none → **Fix B**                                                                                  |
| 3    | `s.charCodeAt(i)` is a full method call                             | `str_scan_*` ×325–650 (rest), `str_slice_*_short` (part)                                                                | property lookup on a primitive, `rt.invoke`, rooted builtin frame per character                                       | avoidable (guarded)                                | #47 (PR #414) for call sites; inline intrinsic: [#425](https://github.com/40oleg/nona/issues/425) |
| 4    | Typed-array and array element access is a stub call                 | all arithmetic kernels (`t[i & MASK]`), `f64_array_*` ×19–61                                                            | `rt.elementGet` / `rt.elementSet` per element                                                                         | avoidable (guarded)                                | #240 (PR #421)                                                                                    |
| 5    | Values live in 16-byte stack slots; no register allocation          | `f64_add_chain` ×22.1, `f64_add_x4` ×37.0, `f64_mul_x4` ×26.7                                                           | every operation loads/stores tag+payload through memory; the loop counter is a double                                 | avoidable (architectural)                          | none; roadmap item 15 continues → [#424](https://github.com/40oleg/nona/issues/424)               |
| 6    | Call overhead (known, indirect, closure)                            | `f64_add_direct` ×29.3, `*_indirect` ×15.7–16.2, `*_closure` ×7.3–7.5                                                   | `rt.enterFrameN` prologue stub, frame/root-record link, argument copies, `rt.invokeSite2` for unknown callees         | partly (no inlining in C++ `noinline`: ×0.88–0.96) | #47 (PR #414), #235 (PR #420), #239 (PR #419)                                                     |
| 7    | `Math.imul` is a builtin call                                       | `u32_mul_*` ×32–138                                                                                                     | `rt.Math.imul.fn.code` with two `rt.toInt32` calls                                                                    | avoidable (guarded)                                | none → [#426](https://github.com/40oleg/nona/issues/426)                                          |
| 8    | `String(number)`                                                    | `str_format_int_short` ×7.88 (340 ns/op)                                                                                | generic shortest round-trip formatting for integer-valued doubles                                                     | partly                                             | none → [#427](https://github.com/40oleg/nona/issues/427)                                          |
| 9    | Fixed cost of short-string `replace`/`replaceAll`/`indexOf`/`slice` | `str_replaceall_*_short` ×25–31, `str_replace_*_short` ×19–20, `str_indexof_*_short` ×10–11, `str_slice_*_short` ×43–46 | per-call overhead dominates 16-unit inputs; the large cases are near parity (×0.75–2.05)                              | partly                                             | #387 (large replaceAll, done); call side #47                                                      |
| 10   | Builders and split/join                                             | `str_builder_*_join` ×10.5–16.3, `str_splitjoin_*` ×4.0–8.9, `str_concat_*_short` ×6.9–7.3                              | array growth, per-part allocation and the join pass                                                                   | partly                                             | #236, #48 (done)                                                                                  |

Where Nona is already ahead, it is because of a different representation, not a faster loop: `str_concat_*_large` ×0.010–0.011 (ropes, #46, against an immutable C++ copy per step) and `str_equal`/`str_compare` medium/large ×0.21–0.36 (why the C++ `std::u16string` comparison is slower was not investigated; it is not a target here). `str_indexof_*_medium/large` is at parity (×0.75–1.17).

## Gap details

### 1. ToInt32/ToUint32 inline path accepts only int32 operands (Fix A)

| Kernel                                  | Nona ms [IQR]    | C++ `o3` ms [IQR] | Ratio |
| --------------------------------------- | ---------------- | ----------------- | ----- |
| `u32_add_chain`                         | 429 [419–449]    | 2.82 [2.50–2.90]  | ×152  |
| `u32_add_x4`                            | 413 [409–424]    | 1.55 [1.48–1.69]  | ×266  |
| `u32_add_direct`                        | 472 [460–483]    | 2.93 [2.84–3.53]  | ×161  |
| `u32_add_indirect`                      | 481 [473–498]    | 13.6 [13.5–13.9]  | ×35.4 |
| `u32_add_closure`                       | 521 [506–535]    | 13.3 [13.1–14.4]  | ×39.2 |
| `loop_control`                          | 444 [430–464]    | 3.32 [2.94–3.45]  | ×134  |
| `f64_add_chain` (same loop, no `>>> 0`) | 118 [116–120]    | 5.36 [5.12–5.69]  | ×22.1 |
| `str_scan_ascii_short`                  | 7043 [6957–7119] | 21.7 [20.8–22.8]  | ×325  |

**Evidence.** `u32AddChain` (`js.fn.12` in `bench/cpp/build/asm/arith-nona-linux-x64.asm`) runs the same loop as `f64AddChain` (`js.fn.8`) plus `>>> 0`, yet takes 3.6× as long (429 vs 118 ms). The inline `>>>` path is:

```
cvttsd2si r10, xmm0          ; truncate the left operand
cvtsi2sd  xmm1, r10
ucomisd   xmm1, xmm0         ; integral?
jp/jne    generic
mov r11, r10 ; shl r11, 0x20 ; sar r11, 0x20
cmp r11, r10                 ; ...and an int32?
jne       generic            ; → call rt.shiftUnsigned
```

`src/backend/x64/integer-ops.ts` (`int32Operand`) requires each operand of `& | ^ << >> >>>` to be an int32 value; `src/backend/x64/operations.ts` (the bitwise branch of the binary fast path) says so: "ToInt32 inline only for operands that already are int32 values: otherwise the runtime does the modular reduction". A u32 accumulator plus a u32 table entry lies in [0, 2^33), so about every other iteration takes `rt.shiftUnsigned` (`src/runtime/bitwise.ts`): a rooted frame, two `rt.toNumeric` and two `rt.toInt32` calls. `loop_control` (`(c ^ t[i]) >>> 0` over u32 values) and the string `scan` kernels (`(acc + (code ^ k)) >>> 0`) hit the same path, so `loop_control` is not a clean control for this harness until the gap is closed.

Diagnostic probes (scratch program outside the repository, same loop shape, median of 7 runs, N = 10^7): `(s + t[i]) >>> 0` with a full u32 table 404–434 ms; the same with table values below 128, so every sum stays an int32 and takes the inline path, 214 ms; the f64 loop without `>>> 0` 124 ms. The slow path costs about 19 ns per iteration on this host.

**Cause and semantics.** ToInt32 and ToUint32 are the integer modulo 2^32. For any integral double `x` with |x| < 2^63, `cvttsd2si` gives `x` exactly as an int64, and its low 32 bits are `x mod 2^32`. The round trip `cvtsi2sd`/`ucomisd` already rejects fractions, NaN, ±Infinity and anything outside the int64 range (`cvttsd2si` returns the integer-indefinite value 0x8000000000000000, which only round-trips for exactly -2^63, whose low 32 bits, 0, are also correct). -0 truncates to 0, as ToInt32 requires. The int32 range test is therefore unnecessary: the operand only has to be integral and representable as an int64; the result is then sign-extended from the low 32 bits for `& | ^ >> <<`, zero-extended for `>>>`. The shift count already uses only its low five bits. This is a mandatory-semantics-preserving change, not a weakening: every input that left the fast path before either still leaves it (non-integral, NaN, ±Infinity, |x| ≥ 2^63, non-Number tags) or now gets the exact result inline.

**Mechanism (Fix A).** Replace the int32 test in `int32Operand` for the bitwise operators by "integral and int64-representable", then normalize to the low 32 bits. Keep `integerRemainder` (`%`) on the strict int32 test, because `%` is not modular. Tag checks and the generic fallback stay.

**Target (from the measurements).** `u32_add_chain` from 429 ms to at most 260 ms (≥ 1.6×; the int32-only probe ran in 214 ms, so the expected value is about 210–230 ms, an _estimate_), `u32_add_x4` and `loop_control` by at least 1.5×, and `str_scan_*` measurably faster (the probes put about half of the scan iterations on the slow path, an _estimate_). No `f64_*` kernel may get slower beyond its IQR. Code size of the binary fast path grows by at most a few bytes per site (a sign extension replaces the shift/shift/compare/branch of the range test; _estimate_).

### 2. `Number(string)` always uses the exact big-integer path (Fix B)

| Kernel                                                       | Nona ms [IQR]    | C++ `o3` ms [IQR] | Ratio |
| ------------------------------------------------------------ | ---------------- | ----------------- | ----- |
| `str_parse_int_short`                                        | 8396 [8358–8522] | 153 [150–160]     | ×54.9 |
| `str_parse_int_short_bytes` (C++ `std::string`, lower bound) | 8540 [8483–8709] | 107 [103–108]     | ×80.1 |

10 000 000 conversions of 1–16 digit decimal integers: 840 ns per `Number(s)`.

**Evidence.** Probes (N = 10^6, median of 5): reading `digits[r & 1023].length` 12 ms; `Number(s)` for 1–4 digit strings 670 ms; for 13-digit strings 864 ms; unary `+s` 855 ms. The cost is about 650 ns per call even for one-digit inputs, so it is a fixed cost, not per-digit work. `rt.parseNumber` (`src/runtime/numeric/parse.ts`) trims, accumulates the digits into a scratch big integer (`num.mul`/`num.add`, `src/runtime/numeric/biguint.ts`), scales by powers of ten and then always calls `num.ratio`, which produces the 53-bit significand by long division one bit per iteration, each iteration calling `num.cmp`, `num.sub` and `num.shr` (more than 54 iterations of three calls). There is no fast path for inputs whose value is exactly representable.

**Cause and semantics.** The big-integer path is the correctly rounded general algorithm (1,200 significant digits, sticky digit) and must stay for long or extreme inputs. For a decimal significand `m ≤ 2^53` with at most 19 digits and a decimal exponent `e` with |e| ≤ 22, both `m` and `10^|e|` are exact doubles, so `m * 10^e` or `m / 10^-e` is one correctly rounded IEEE operation and equals the correctly rounded value of the decimal string (Clinger's fast path, the one `strtod` implementations use). Sign, -0 (`"-0"`), whitespace trimming, `Infinity`, the `0x`/`0o`/`0b` prefixes and syntax errors (NaN) are decided by the existing scanner before or instead of the conversion.

**Mechanism (Fix B).** In `rt.parseNumber`, keep a 64-bit significand next to the big integer while scanning decimal digits (with a flag that drops out on overflow or more than 19 significant digits), and at the end of a valid decimal literal convert directly when `m ≤ 2^53` and the effective exponent is in [-22, 22], using a table of exact powers of ten. Everything else takes the existing path unchanged. All callers of `rt.parseNumber` (`Number()`, unary `+`, implicit ToNumber, `primitives.ts`, `objects.ts`, `bigint.ts`, `format.ts`) benefit; `parseInt`/`parseFloat` keep their own routines.

**Guards and tests.** Differential Node oracle tests over: `""`, whitespace-only and padded inputs (including U+FEFF, U+3000), `"-0"`, `"+0"`, `"0.1"`, `"1e22"`, `"1e23"`, `"9007199254740992"`, `"9007199254740993"` (above 2^53: must fall back and round to even), 19- and 20-digit significands, `"1e-22"`, `"123.456e-5"`, `".5"`, `"5."`, `"1_0"`, `"0x10"`, `"Infinity"`, `"-Infinity"`, `"1e400"`, `"1e-400"`, and a seeded random sweep compared bit-for-bit with Node.

**Target (from the measurements).** `str_parse_int_short` from 8396 ms to at most 1700 ms (≥ 5×; the probes put the non-parse part of the loop at a few tens of ns per iteration, so about 80–150 ns per conversion is the expected range, an _estimate_). `str_format_int_short` and the other string kernels must not regress beyond their IQR.

### 3. `charCodeAt` is a method call

`str_scan_ascii_short` 7043 ms [6957–7119] vs 21.7 ms (×325); `str_scan_ascii_medium` 4546 vs 7.45 (×610); `str_scan_*_large` ×622–649; BMP and astral inputs behave the same (×362–649), so encoding is not a factor (all inputs are UTF-16 code units in Nona's flat strings). About 44 ns per code unit.

Probes (10,240,000 units): the scan loop without `charCodeAt` 73 ms; with it (f64 accumulator, no `>>>`) 253 ms, so about 17.6 ns per call; the same loop over a dense array of codes 133 ms. The remaining part of the 44 ns comes from gap 1 (the accumulator crosses 2^31) and `s.length` per iteration (`rt.getLengthCached` call). Each `charCodeAt` is a method call: the property is looked up on the primitive through `String.prototype`, the builtin is called through the generic call path, and the builtin (`src/runtime/string-builtins.ts`, `indexMethods`) builds a rooted frame, converts the position and loads one unit. An inline path needs a guard that `String.prototype.charCodeAt` is still the intrinsic (the same kind of epoch/identity guard the call-site caches of #47 use). Follow-up: [#425](https://github.com/40oleg/nona/issues/425), coordinated with #47.

### 4. Element access through stubs

Every arithmetic kernel reads `t[i & MASK]` through `call rt.elementGet` (`src/runtime/array-elements.ts`), which dispatches on the receiver kind and the element type each time; `f64_array_*` also writes through `rt.elementSet`: `f64_array_4k` 103 ms vs 1.82 (×56.7), `_1m` 109 vs 1.79 (×61.2), `_64m` 112 vs 5.77 (×19.4, memory-bound in C++). Probe: removing the load from the f64 chain saves about 3.7 ns per iteration. Owned by #240; PR #421 adds an inline typed-array path for Number keys and then bounds-check elimination. Re-measure `f64_*`, `u32_*` and `f64_array_*` after it merges; this issue does not duplicate it.

### 5. Memory-resident values and the double loop counter

`f64_add_chain` 118 ms vs 5.36 (×22.1), `f64_add_x4` 70.2 vs 1.90 (×37.0), `f64_mul_chain` 118 vs 10.2 (×11.6), `f64_mul_x4` 73.8 vs 2.77 (×26.7). In `js.fn.8` every value is a 16-byte tag+payload slot on the stack: `s + t[...]` loads both tags, compares them with 3, adds from memory, stores the result tag and payload into a temporary, then copies the temporary into `s` (four 8-byte moves). `i` is a double: `i++` is `cvtsi2sd`+`addsd`, and `i & MASK` converts both operands back to integers with the round-trip checks of gap 1 (probe: about 4.8 ns per iteration for `i & 1023` alone). Each iteration also polls `rt.gcNeeded` (one compare, cheap). Reading the top-level `const MASK` costs two loads and a TDZ compare; the probe with a literal `1023` was within 1 ms, so it is not a gap. The x4 kernels gain less from independent accumulators than C++ does (Nona 118 → 70 ms, C++ 5.4 → 1.9 ms); the per-operation loads, stores and checks through the slots are the likely limit (not profiled).

These costs are avoidable but architectural: keeping proven-Number locals unboxed in XMM/GPR registers, with integer-typed induction variables, is the continuation of roadmap item 15 (`src/ir/numbers.ts` already proves which slots hold Numbers; the code generator still stores them as Values). It is too large for this issue; it is filed as [#424](https://github.com/40oleg/nona/issues/424) with these kernels as its measurement. Implemented: [results](#register-resident-numbers-and-int32-counters-424).

### 6. Calls

| Kernel                                     | Nona ms [IQR] | C++ `o3` [IQR]   | Ratio | C++ `noinline` | Ratio  |
| ------------------------------------------ | ------------- | ---------------- | ----- | -------------- | ------ |
| `f64_add_direct`                           | 168 [166–179] | 5.72 [5.24–6.03] | ×29.3 | 5.14           | ×32.7  |
| `f64_mul_direct`                           | 172 [168–178] | 11.6 [11.3–12.0] | ×14.9 | 10.9           | ×15.8  |
| `f64_add_indirect`                         | 172 [170–181] | 10.6 [10.3–11.8] | ×16.2 | 10.6           | ×16.1  |
| `f64_add_closure`                          | 162 [159–164] | 22.3 [21.9–22.6] | ×7.27 | 185            | ×0.877 |
| `f64_add_stdfn` (C++ only, vs JS indirect) | 176 [173–182] | 21.2 [21.0–22.1] | ×8.28 | 183            | ×0.963 |

A direct call adds about 5 ns over the inline expression (168 − 118 ms over 10^7 calls). In `js.fn.17` the caller loads the global `add`, checks its tag, kind and code pointer against `js.fn.4`, copies the two arguments into the outgoing area and calls; the callee calls `rt.enterFrame2` (stack check, frame set-up, parameter copies, `this`/`new.target` copies, root-record link in `rt.gcRoots`) and on return stores the result Value and unlinks the root record. `callIndirect` (`js.fn.21`) calls `rt.invokeSite2` and also re-checks the TDZ of `let s = init` three times per iteration, apparently because the initialization analysis (`src/ir/initialization.ts`) does not treat a copy of a parameter as initialized (not yet confirmed) (a small, separate avoidable cost, filed as [#428](https://github.com/40oleg/nona/issues/428)). The C++ `noinline` build shows that once C++ must also make a real call through `std::function`, Nona's closure and indirect calls are at parity (×0.88–0.96): the remaining call gap is inlining and the cost of Nona's prologue, which #47 (PR #414: cheaper prologues for known callees), #235 (PR #420: guarded inlining) and #239 (PR #419: known callees through cells) address. This issue does not duplicate them; it re-measures these rows after they merge.

### 7. `Math.imul`

`u32_mul_chain` 363 ms vs 7.51 (×48.4), `u32_mul_x4` 361 vs 2.61 (×138), `u32_mul_direct` 408 vs 8.04 (×50.7). `Math.imul(p, t[i])` is a builtin call (`rt.Math.imul.fn.code`, `src/runtime/math.ts`) that calls `rt.toInt32` for each argument; its result is an int32, so the following `>>> 0` stays inline. Follow-up: [#426](https://github.com/40oleg/nona/issues/426), an inline `Math.imul` behind an intrinsic guard.

### 8–10. Other string costs

- `str_format_int_short` 3398 ms [3377–3425] vs 431 [402–444] (×7.88): 340 ns per `String(x)` of an integer-valued double. Follow-up: [#427](https://github.com/40oleg/nona/issues/427), an integer fast path in number formatting.
- Short inputs: `str_replaceall_ascii_short` 1628 vs 56.9 (×28.6), `str_replace_ascii_short` 605 vs 31.5 (×19.2), `str_indexof_ascii_short_n4` 1064 vs 98.7 (×10.8), `str_slice_ascii_short` 2142 vs 49.6 (×43.2). Large inputs of the same operations are close to C++ (`replaceall_log_large` ×1.06, `slice_*_large` ×2.0, `indexof_*_large` ×0.75–0.99), so the gap is fixed per-call cost. The `slice` kernel's iteration also makes two `Math.imul` calls and a `charCodeAt` call (`mix`, gaps 3 and 7); a probe of `s.slice(b, b + 4)` alone took about 48 ns per call.
- `str_builder_*_join` ×10.5–16.3, `str_splitjoin_*` ×4.0–8.9, `str_concat_*_short` ×6.9–7.3: allocation and per-element work; related to #236 (scalar replacement) and the finished #48. Not selected: smaller ratios and no single cause.

## Selection for the next steps

| Fix            | Gap                                                | Why this one                                                                                                                                                                                       | Bounded scope                                                                                                           | Measurable target                                                                                                                         |
| -------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **A** (step 2) | 1: ToInt32/ToUint32 of int64-range integers inline | Largest avoidable arithmetic gap not owned by an open PR (#240, #47, #235, #239 cover gaps 4 and 6); about 19 ns per affected operation; common in hashing, checksums, PRNGs and UTF-8/UTF-16 code | `int32Operand` and the bitwise branch in `src/backend/x64/integer-ops.ts` / `operations.ts`; no IR change               | `u32_add_chain` ≤ 260 ms (from 429), `u32_add_x4` and `loop_control` ≥ 1.5× faster, `str_scan_*` faster beyond IQR, no `f64_*` regression |
| **B** (step 3) | 2: `Number(string)` exact fast path                | Largest avoidable string gap with a single, local cause (840 ns per conversion, ×54.9); gap 3 is larger in ratio but needs an intrinsic guard that belongs with #47's call-site caches             | `rt.parseNumber` in `src/runtime/numeric/parse.ts`; the big-integer path is kept for everything outside the exact range | `str_parse_int_short` ≤ 1700 ms (from 8396, ≥ 5×), no regression in other string kernels                                                  |

Both fixes need differential Node oracle tests (`runOnHost`/`runOracle`) under `gcStress` for their edge cases, and a re-run of the affected kernels plus their neighbours (all `f64_*`/`u32_*` and `loop_control` for A; all `str_*` for B) on the same host with the C++ baselines unchanged. If a fix misses its target, the result is recorded here and the next justified path is chosen.

Follow-up issues (filed in step 4): register-resident Number locals and integer induction variables (gap 5, [#424](https://github.com/40oleg/nona/issues/424)), inline `charCodeAt`/`charAt` (gap 3, [#425](https://github.com/40oleg/nona/issues/425)), inline `Math.imul` (gap 7, [#426](https://github.com/40oleg/nona/issues/426)), integer fast path of `String(number)` (gap 8, [#427](https://github.com/40oleg/nona/issues/427)) and parameter copies in the TDZ analysis (gap 6, [#428](https://github.com/40oleg/nona/issues/428)). The `--only strings` startup row of the harness is reported in a [comment on #401](https://github.com/40oleg/nona/issues/401) (the harness is in PR #422).

## Fix A results (step 2)

**Change.** The bitwise operators `& | ^ << >> >>>` take ToInt32/ToUint32 inline for every integral Number that `cvttsd2si` represents exactly as an int64, not only for int32 values (`toInt32Operand` in `src/backend/x64/integer-ops.ts`, the bitwise branch of `emitNumberBinary` in `src/backend/x64/operations.ts`). The operand check is the existing round trip (`cvttsd2si`, `cvtsi2sd`, `ucomisd`, `jp`/`jne` to the runtime); the int32 range test (`mov`/`shl`/`sar`/`cmp`/`jne`) is gone. The operations then use only the low 32 bits: `& | ^ <<` work on the 64-bit registers and convert the low 32 bits as a signed int32 (`cvtsi2sd xmm0, r10d`, new `Assembler.cvtsi2sd32`), `>>` sign-extends them first (`movsxd r10, r10d`, new `Assembler.movsxd`), `>>>` masks them as before. The shift count already used only its low five bits. `%` keeps the strict int32 test (`int32Operand`), because it is not modular. ARM64 translates the two new instructions to `scvtf Dd, Wn` and `sxtw`; its `cvttsd2si` already returns 0x8000000000000000 for out-of-range inputs, as on x64, so the same round trip guards it. The IR is unchanged.

**Semantics.** As argued under gap 1: the inline path now gives the exact ToInt32 result for every input it accepts, and every input it rejects (non-Number tags, fractions, NaN, ±Infinity, |x| ≥ 2^63) still takes `rt.<operator>` with ToPrimitive/valueOf, BigInt dispatch and exceptions in the original order. Tests: `tests/bitwise-int64.test.ts` (Node oracle under GC stress: all six operators over int32 boundaries, ±2^31…2^64, ±2^63 and its neighbours, -0, fractions, NaN, ±Infinity, `Number.MAX_VALUE`/`MIN_VALUE`, u32 accumulators crossing 2^31, valueOf order and side effects, throwing valueOf, strings, null/undefined/booleans/arrays, BigInt and mixed BigInt errors; plus a listing check that the range test is gone and the 32-bit forms are emitted), a new ARM64 encoding test in `tests/arm64-assembler.test.ts`, the existing `tests/language-operators.test.ts` and `tests/remainder.test.ts`, and the Test262 directories `language/expressions/{bitwise-and,bitwise-or,bitwise-xor,bitwise-not,left-shift,right-shift,unsigned-right-shift}` (233/233 pass, win32-x64).

**First attempt, rejected.** The first version kept the operands sign-extended (`shl reg, 32; sar reg, 32` after the round trip). It met the u32 targets but an interleaved A/B of the before and after binaries (9–11 alternating runs per kernel) showed `f64_add_chain` +4% and `f64_add_closure` +9% beyond the IQR: the sign extension sat on the data path of `i & MASK`, where the removed range test had been off it (a predicted branch). A second variant that kept the old int32 data path and branched to the wide case only for out-of-range values fixed `f64_add_chain` but cost 5–25% on the u32 kernels (unpredictable branch). The committed version (32-bit conversion, no extension except before `>>`) was the fastest of the three on every kernel in that A/B (`u32_add_chain` 186 ms vs 193/202, `u32_add_x4` 87 vs 97/122, `loop_control` 207 vs 214/252, `f64_add_chain` 102 vs 104 before, `f64_add_closure` 157 vs 160 before; medians, ms).

**Protocol.** Same host as the baseline (`tors`, WSL2), `node bench/cpp/run.mjs --runs 11 --platform linux --only f64_,u32_,loop_control,str_scan`, N = 10 000 000. "Before" is the compiler at `3673735` (the baseline binaries), measured again in this session immediately before the "after" run; "after" is `8232af7` plus this change. The C++ binaries are the same files in both runs (rebuilt by `build.mjs`, byte-identical by MD5) and every kernel printed the same checksum before and after. Raw results: `bench/cpp/results/2026-10-20-tors-linux-wsl2-fix-a-{before,after}.{json,txt}`. Medians in ms with the IQR; C++ is `o3`.

| Kernel                   | Nona before ms [IQR] | Nona after ms [IQR] | Nona speedup | C++ `o3` before  | C++ `o3` after   | Nona/C++ before | Nona/C++ after |
| ------------------------ | -------------------- | ------------------- | ------------ | ---------------- | ---------------- | --------------- | -------------- |
| `f64_add_chain`          | 125 [115–127]        | 121 [117–127]       | ×1.03        | 5.18 [5.03–5.39] | 5.86 [5.40–6.10] | ×24.1           | ×20.6          |
| `f64_add_x4`             | 72.2 [69.9–75.0]     | 70.6 [69.8–70.8]    | ×1.02        | 1.91 [1.84–2.02] | 1.96 [1.94–2.20] | ×37.9           | ×36.0          |
| `f64_add_direct`         | 173 [172–188]        | 176 [169–180]       | ×0.98        | 5.47 [5.12–5.87] | 5.38 [5.04–5.66] | ×31.6           | ×32.8          |
| `f64_add_indirect`       | 179 [175–187]        | 185 [178–193]       | ×0.97        | 11.3 [10.6–12.0] | 10.6 [10.4–11.0] | ×15.8           | ×17.5          |
| `f64_add_stdfn`          | 177 [172–179]        | 179 [174–186]       | ×0.99        | 21.9 [21.4–22.6] | 21.7 [20.8–22.2] | ×8.08           | ×8.22          |
| `f64_add_closure`        | 170 [167–178]        | 170 [166–173]       | ×1.00        | 21.7 [21.2–22.7] | 21.9 [21.5–22.3] | ×7.83           | ×7.76          |
| `f64_mul_chain`          | 116 [114–121]        | 118 [114–121]       | ×0.98        | 10.9 [10.2–11.4] | 10.9 [10.4–11.2] | ×10.6           | ×10.8          |
| `f64_mul_x4`             | 77.7 [75.3–78.2]     | 69.3 [68.2–74.5]    | ×1.12        | 2.83 [2.71–2.95] | 2.68 [2.62–2.84] | ×27.5           | ×25.9          |
| `f64_mul_direct`         | 176 [171–179]        | 170 [167–175]       | ×1.04        | 11.0 [10.7–11.6] | 10.3 [10.1–10.6] | ×16.0           | ×16.5          |
| `f64_mul_indirect`       | 182 [178–193]        | 176 [172–183]       | ×1.03        | 11.1 [10.9–12.2] | 10.2 [10.1–10.9] | ×16.4           | ×17.3          |
| `f64_mul_stdfn`          | 185 [175–187]        | 172 [169–173]       | ×1.08        | 25.3 [24.8–25.9] | 23.4 [22.9–24.5] | ×7.33           | ×7.35          |
| `f64_mul_closure`        | 180 [175–183]        | 161 [155–163]       | ×1.12        | 25.3 [24.8–25.7] | 23.1 [22.8–23.7] | ×7.13           | ×6.97          |
| `u32_add_chain`          | 439 [434–447]        | 202 [196–214]       | ×2.17        | 2.74 [2.63–3.04] | 2.66 [2.47–2.75] | ×160            | ×75.9          |
| `u32_add_x4`             | 415 [414–425]        | 99.0 [97.5–101]     | ×4.19        | 1.73 [1.61–1.78] | 1.65 [1.36–1.82] | ×240            | ×60.2          |
| `u32_add_direct`         | 497 [495–506]        | 247 [240–251]       | ×2.01        | 3.17 [2.96–3.35] | 3.38 [2.83–3.69] | ×157            | ×73.3          |
| `u32_add_indirect`       | 541 [517–578]        | 256 [250–260]       | ×2.11        | 14.2 [14.0–14.7] | 13.6 [13.3–14.6] | ×38.0           | ×18.8          |
| `u32_add_stdfn`          | 533 [512–540]        | 255 [249–263]       | ×2.09        | 20.9 [20.1–22.5] | 20.0 [19.7–21.2] | ×25.5           | ×12.7          |
| `u32_add_closure`        | 552 [541–573]        | 253 [248–256]       | ×2.18        | 13.9 [13.8–14.5] | 14.4 [13.4–14.9] | ×39.7           | ×17.5          |
| `u32_mul_chain`          | 391 [371–396]        | 359 [340–373]       | ×1.09        | 8.78 [8.15–8.88] | 7.88 [7.36–7.96] | ×44.6           | ×45.5          |
| `u32_mul_x4`             | 365 [361–383]        | 345 [335–358]       | ×1.06        | 2.83 [2.66–2.93] | 2.68 [2.64–2.77] | ×129            | ×129           |
| `u32_mul_direct`         | 424 [420–439]        | 423 [408–440]       | ×1.00        | 8.27 [8.11–8.52] | 7.74 [7.33–7.89] | ×51.3           | ×54.6          |
| `u32_mul_indirect`       | 483 [465–497]        | 487 [472–495]       | ×0.99        | 14.0 [13.7–14.4] | 13.3 [13.1–14.2] | ×34.6           | ×36.6          |
| `u32_mul_stdfn`          | 473 [462–484]        | 462 [453–469]       | ×1.02        | 20.0 [19.4–20.9] | 20.2 [19.4–20.6] | ×23.7           | ×22.9          |
| `u32_mul_closure`        | 492 [478–503]        | 447 [444–462]       | ×1.10        | 11.2 [10.9–11.5] | 11.3 [10.9–12.0] | ×43.8           | ×39.6          |
| `loop_control`           | 450 [446–477]        | 233 [228–234]       | ×1.93        | 2.87 [2.77–3.13] | 3.11 [2.80–3.50] | ×157            | ×74.8          |
| `f64_array_4k`           | 112 [110–123]        | 110 [108–117]       | ×1.01        | 1.91 [1.73–2.28] | 1.75 [1.66–1.85] | ×58.4           | ×62.9          |
| `f64_array_1m`           | 116 [112–117]        | 113 [111–118]       | ×1.03        | 1.59 [1.55–1.70] | 1.71 [1.64–1.79] | ×72.6           | ×65.9          |
| `f64_array_64m`          | 114 [112–117]        | 113 [112–115]       | ×1.01        | 5.63 [5.51–6.20] | 5.31 [5.09–5.50] | ×20.2           | ×21.3          |
| `str_scan_ascii_short`   | 7136 [7088–7251]     | 4469 [4380–4755]    | ×1.60        | 20.7 [19.9–20.9] | 19.1 [18.8–20.6] | ×345            | ×234           |
| `str_scan_ascii_medium`  | 4745 [4687–4808]     | 2741 [2652–2821]    | ×1.73        | 7.34 [6.77–7.55] | 7.08 [6.67–7.36] | ×646            | ×387           |
| `str_scan_ascii_large`   | 4685 [4642–4711]     | 2846 [2746–2892]    | ×1.65        | 7.12 [6.88–7.35] | 6.77 [6.68–6.99] | ×658            | ×420           |
| `str_scan_bmp_short`     | 7647 [7453–7760]     | 4580 [4485–4604]    | ×1.67        | 23.8 [21.3–28.1] | 20.4 [19.0–21.0] | ×322            | ×225           |
| `str_scan_bmp_medium`    | 4414 [4375–4524]     | 2758 [2634–2898]    | ×1.60        | 7.66 [6.88–7.92] | 7.30 [6.82–7.62] | ×576            | ×378           |
| `str_scan_bmp_large`     | 4699 [4572–4884]     | 2975 [2813–3045]    | ×1.58        | 7.27 [6.70–7.49] | 6.93 [6.77–7.38] | ×646            | ×429           |
| `str_scan_astral_short`  | 7199 [7149–7272]     | 4701 [4624–4820]    | ×1.53        | 20.1 [19.1–20.8] | 20.8 [19.7–22.9] | ×359            | ×226           |
| `str_scan_astral_medium` | 4499 [4414–4640]     | 2671 [2588–2766]    | ×1.68        | 6.98 [6.78–7.05] | 6.66 [6.28–7.19] | ×645            | ×401           |
| `str_scan_astral_large`  | 4679 [4633–4763]     | 2624 [2579–2759]    | ×1.78        | 6.89 [6.83–7.16] | 7.01 [6.50–7.30] | ×679            | ×374           |

**Outcome against the targets.** `u32_add_chain` 439 → 202 ms (×2.17; target ≤ 260 ms), `u32_add_x4` ×4.19 and `loop_control` ×1.93 (target ≥ 1.5×), every `str_scan_*` kernel ×1.53–1.78 with non-overlapping IQRs. The u32 call variants gain the same ~24 ns per call (×2.0–2.2), so their remaining ratio is now set by the call costs of gap 6. No `f64_*` or `f64_array_*` kernel is slower beyond its before-IQR; the `f64_mul_*` closure/stdfn rows came out 8–12% faster, which this change does not explain (their only bitwise operation is `i & 1023`, two instructions shorter per operand) and is treated as run-to-run variation. `u32_mul_*` is unchanged within noise, as expected: `Math.imul` (gap 7) dominates it.

**Why the gap shrank.** About every other iteration of the u32 kernels and the scan accumulators produced a sum ≥ 2^31 and called `rt.shiftUnsigned` (rooted frame, two `rt.toNumeric` and two `rt.toInt32` calls, about 19–24 ns). Those iterations now stay inline. `u32_add_x4` gains most, probably because its four independent sums all took the slow path and the inline code lets their iterations overlap (not profiled).

**Remaining.** `u32_add_chain` is still ×76 of C++ and `loop_control` ×75: the rest is gaps 4 and 5 (element access through `rt.elementGet`, Values in stack slots, the double loop counter). `str_scan_*` remains ×225–429, now dominated by the `charCodeAt` call (gap 3).

**Code size.** The listing of the arithmetic program shrank from 14 442 to 13 768 lines and the string program's from 20 362 to 19 986 (each inline bitwise site loses five instructions per operand, `<<` two more and `>>` gains one `movsxd`; the preludes compiled into every executable have such sites too). The linux-x64 executables shrank by 8 KiB (arith, 3 932 160 → 3 923 968 bytes) and 4 KiB (strings, 4 096 000 → 4 091 904). Build time is unchanged: `node dist/cli.js build` of the arithmetic program took 0.73–0.80 s in three runs after the change, 0.76 s in the baseline `meta.json` (the `build.mjs` rebuild recorded 3.2 s while other work was running on the host; not a compiler cost).

## Fix B results (step 3)

**Change.** `rt.parseNumber` (`src/runtime/numeric/parse.ts`) first scans a decimal literal without big integers and without calls. After the trimming, the sign and the `Infinity` check, it keeps the significand `m` in a 64-bit register (RBX), counts the significant digits (leading zeros do not count) and the fraction digits, and parses an optional exponent, which saturates at 100 000, far outside the fast range. The fast path applies when the literal is valid, has at most 19 significant digits, `m ≤ 2^53`, and the effective decimal exponent `e` is in [-22, 22]. The result is then `cvtsi2sd m` followed by one `mulsd` (e ≥ 0) or `divsd` (e < 0) by an exact power of ten from a new 23-entry `.rdata` table `num.pow10` (10^0…10^22). The sign is OR-ed in afterwards, as on the existing path, and a literal whose digits are all zero gives ±0 directly. Any other input (radix prefixes, a second dot, a missing exponent digit, any other character, more than 19 significant digits, `m > 2^53`, |e| > 22) restarts at the first digit on the unchanged path: `num.init`, the big-integer accumulation and `num.ratio`.

The fast scan uses only registers that the Native prologue already saves (RBX, R12–R15) plus the volatile R8–R10, keeps RSI in a frame slot for the restart and makes no calls, so the Win64 frame, shadow space and alignment are unchanged; it holds no Values. ARM64 shares this emitter through `Arm64Assembler`, which translates `cvtsi2sd`, `mulsd`/`divsd` with a memory operand and `lea` of an `.rdata` symbol. The linux-arm64, darwin-arm64 and win32-arm64 targets build, but no ARM64 hardware or emulator was available locally, so only the `full-ci` platform suites exercise them.

**Semantics.** This is Clinger's fast path. `m ≤ 2^53` and `10^|e|` for |e| ≤ 22 are exact binary64 values, so one IEEE multiply or divide (round to nearest even) gives the correctly rounded value of `m × 10^e`, the same result as the big-integer path. Whitespace trimming, the empty and whitespace-only strings (0), `"+"`/`"-"` (NaN), `Infinity` and the sign are all handled before the fast scan. Every input the fast scan rejects is parsed again from the same position by the old code, so its result is unchanged. `"-0"`, `"-0.0"` and `"-0e5"` give -0.

Tests: `tests/parse-number-fast.test.ts`, compared with the Node oracle:

1. Under GC stress, 82 edge inputs through `Number(s)` and unary `+`, plus implicit ToNumber (`"5" * 2`, `"3" - 1`, …). The inputs cover signed zeros, leading zeros, padding with U+00A0, U+FEFF, U+3000 and line terminators, 1e22/1e23, 1.5e-22/1e-23, 2^53 and 2^53 + 1, 19- and 20-digit significands, 2^64 - 1, 0.1/0.3, `1e308`/`1e309`/`4.9e-324`, `1.`, `.5`, `.`, `1e`, `1e+`, `12a`, `1_0`, radix prefixes with and without signs, `Infinity` variants, saturated exponents, and the neighbours of `MAX_VALUE`/`MIN_VALUE`.
2. A seeded sweep of 3 000 random decimal strings (1–25 digits, optional fraction, signed exponent up to 400), compared line by line with Node. This test runs without GC stress: the function neither allocates nor holds Values, and building the strings under GC stress takes minutes.

The existing `tests/number-builtins.test.ts` passes. `tests/fast-paths.test.ts` crashes the local Node.js 22 test runner in libuv (`idna.c` assertion) at the parent commit too, so it says nothing about this change. CI uses Node.js 26.

**Protocol.** Same host as the baseline and Fix A (`tors`, WSL2), `node bench/cpp/run.mjs --runs 11 --platform linux --only str_ --no-startup` (all 115 `str_*` groups), N = 10 000 000. "Before" is the compiler at `9dff4d1` (Fix A); "after" is `9dff4d1` plus this change. Both were built in this session with `npm run build` and `node bench/cpp/build.mjs` and measured one after the other (before 08:16–08:48 UTC, after 08:49–09:18 UTC; order seeds 1482826242 and 1484793685). `meta.json` marks both builds `dirty` because the working tree held this change; the "before" build swapped `parse.ts` back to `9dff4d1`. `check-asm.mjs` passed for both builds. The C++ binaries were byte-identical (MD5) in both runs, and every group printed one checksum, the same before and after. Raw results: `bench/cpp/results/2026-10-20-tors-linux-wsl2-fix-b-{before,after}.{json,txt}`. Times are medians in ms with the IQR; C++ is `o3`. The table lists the rows with JavaScript's contract plus the C++ byte-string lower bound for parsing; the raw files have every row.

| Kernel                                                       | Nona before ms [IQR] | Nona after ms [IQR] | Nona speedup | C++ `o3` before  | C++ `o3` after   | Nona/C++ before | Nona/C++ after |
| ------------------------------------------------------------ | -------------------- | ------------------- | ------------ | ---------------- | ---------------- | --------------- | -------------- |
| `str_scan_ascii_short`                                       | 4925 [4847–5179]     | 5033 [4948–5133]    | ×0.98        | 21.7 [20.7–22.7] | 21.8 [21.1–23.1] | ×227            | ×231           |
| `str_equal_ascii_short`                                      | 131 [123–138]        | 129 [125–133]       | ×1.01        | 53.0 [51.5–54.9] | 54.3 [53.8–56.9] | ×2.47           | ×2.38          |
| `str_compare_ascii_short`                                    | 193 [189–201]        | 186 [182–191]       | ×1.04        | 75.8 [71.7–78.3] | 73.3 [71.4–78.7] | ×2.54           | ×2.54          |
| `str_slice_ascii_short`                                      | 1817 [1734–1871]     | 1841 [1758–1861]    | ×0.99        | 51.5 [48.6–56.1] | 50.2 [49.5–56.3] | ×35.3           | ×36.7          |
| `str_indexof_ascii_short_n4`                                 | 847 [827–873]        | 867 [822–902]       | ×0.98        | 97.6 [93.8–104]  | 103 [95.4–110]   | ×8.68           | ×8.39          |
| `str_concat_ascii_short`                                     | 1048 [1019–1134]     | 1064 [986–1123]     | ×0.99        | 168 [167–190]    | 178 [174–182]    | ×6.24           | ×5.98          |
| `str_builder_ascii_short`                                    | 212 [207–236]        | 224 [215–233]       | ×0.94        | 2.59 [2.42–2.93] | 2.80 [2.65–3.03] | ×81.7           | ×80.2          |
| `str_splitjoin_ascii_short`                                  | 954 [909–1008]       | 1014 [973–1028]     | ×0.94        | 123 [119–131]    | 127 [126–134]    | ×7.76           | ×7.96          |
| `str_replace_ascii_short`                                    | 530 [479–545]        | 582 [544–618]       | ×0.91        | 33.0 [30.5–35.8] | 34.0 [31.6–38.8] | ×16.1           | ×17.1          |
| `str_replaceall_ascii_short`                                 | 1653 [1466–1681]     | 1593 [1548–1680]    | ×1.04        | 55.4 [53.9–59.2] | 57.0 [54.1–61.3] | ×29.9           | ×27.9          |
| `str_scan_ascii_medium`                                      | 2917 [2859–2996]     | 2906 [2730–3049]    | ×1.00        | 7.61 [7.14–8.08] | 7.32 [7.13–7.60] | ×383            | ×397           |
| `str_equal_ascii_medium`                                     | 7.96 [7.78–8.21]     | 7.92 [7.81–8.35]    | ×1.01        | 25.9 [25.2–27.3] | 27.9 [27.3–28.5] | ×0.31           | ×0.28          |
| `str_compare_ascii_medium`                                   | 9.37 [8.88–9.46]     | 9.26 [8.92–9.78]    | ×1.01        | 39.5 [38.4–41.1] | 40.9 [40.1–42.7] | ×0.24           | ×0.23          |
| `str_slice_ascii_medium`                                     | 228 [226–244]        | 233 [222–247]       | ×0.98        | 19.0 [17.9–19.9] | 19.0 [18.2–20.6] | ×12.0           | ×12.3          |
| `str_indexof_ascii_medium_n4`                                | 50.3 [49.3–51.3]     | 48.8 [47.7–49.8]    | ×1.03        | 53.2 [51.5–55.0] | 54.0 [50.9–56.3] | ×0.95           | ×0.90          |
| `str_indexof_ascii_medium_n64`                               | 43.6 [43.4–45.2]     | 46.1 [45.3–47.2]    | ×0.95        | 54.5 [52.3–56.5] | 58.3 [53.3–61.9] | ×0.80           | ×0.79          |
| `str_concat_ascii_medium`                                    | 56.7 [55.6–59.4]     | 55.6 [53.3–56.3]    | ×1.02        | 36.0 [34.0–40.8] | 36.3 [36.1–38.9] | ×1.57           | ×1.53          |
| `str_builder_ascii_medium`                                   | 124 [117–139]        | 130 [127–140]       | ×0.95        | 2.28 [1.96–2.43] | 2.17 [2.11–2.24] | ×54.5           | ×59.9          |
| `str_splitjoin_ascii_medium`                                 | 231 [215–250]        | 242 [234–257]       | ×0.96        | 31.4 [30.1–31.7] | 33.0 [31.8–33.7] | ×7.37           | ×7.33          |
| `str_replace_ascii_medium`                                   | 160 [152–167]        | 159 [155–169]       | ×1.00        | 29.1 [28.0–30.7] | 30.5 [28.5–32.6] | ×5.48           | ×5.21          |
| `str_replaceall_ascii_medium`                                | 28.1 [27.1–28.7]     | 28.6 [27.9–29.8]    | ×0.98        | 5.48 [4.62–5.62] | 6.05 [5.43–6.52] | ×5.12           | ×4.73          |
| `str_scan_ascii_large`                                       | 2901 [2867–3065]     | 2864 [2825–2996]    | ×1.01        | 7.47 [7.41–7.64] | 7.75 [7.46–7.87] | ×388            | ×369           |
| `str_equal_ascii_large`                                      | 8.62 [7.63–8.89]     | 9.85 [9.47–10.1]    | ×0.88        | 27.0 [26.7–27.6] | 28.1 [27.1–28.8] | ×0.32           | ×0.35          |
| `str_compare_ascii_large`                                    | 9.72 [8.84–10.3]     | 9.74 [9.27–10.7]    | ×1.00        | 36.4 [36.0–40.0] | 38.6 [36.2–40.1] | ×0.27           | ×0.25          |
| `str_slice_ascii_large`                                      | 48.5 [44.4–52.8]     | 48.1 [44.5–51.2]    | ×1.01        | 23.2 [22.2–24.2] | 23.4 [22.4–24.9] | ×2.09           | ×2.06          |
| `str_indexof_ascii_large_n4`                                 | 13.0 [12.6–13.2]     | 12.4 [11.9–13.3]    | ×1.05        | 14.6 [14.2–15.1] | 14.7 [13.5–18.0] | ×0.89           | ×0.84          |
| `str_indexof_ascii_large_n64`                                | 73.8 [69.4–77.4]     | 75.4 [72.4–79.0]    | ×0.98        | 101 [91.0–107]   | 97.4 [89.8–108]  | ×0.73           | ×0.77          |
| `str_concat_ascii_large`                                     | 2.39 [2.15–3.29]     | 2.29 [2.04–2.39]    | ×1.04        | 181 [171–199]    | 187 [178–193]    | ×0.01           | ×0.01          |
| `str_builder_ascii_large`                                    | 144 [139–153]        | 138 [135–147]       | ×1.04        | 7.11 [6.65–7.52] | 7.09 [6.91–7.70] | ×20.2           | ×19.4          |
| `str_splitjoin_ascii_large`                                  | 301 [290–315]        | 304 [298–322]       | ×0.99        | 78.7 [76.0–79.7] | 75.2 [74.2–80.4] | ×3.83           | ×4.04          |
| `str_replace_ascii_large`                                    | 47.9 [44.9–50.5]     | 47.8 [43.1–51.0]    | ×1.00        | 8.67 [8.53–9.26] | 8.64 [8.24–9.10] | ×5.52           | ×5.54          |
| `str_replaceall_ascii_large`                                 | 180 [177–190]        | 185 [183–190]       | ×0.97        | 141 [137–153]    | 155 [144–159]    | ×1.28           | ×1.20          |
| `str_scan_bmp_short`                                         | 4823 [4803–5047]     | 4944 [4777–5055]    | ×0.98        | 21.3 [20.2–22.8] | 21.3 [20.1–23.2] | ×226            | ×232           |
| `str_equal_bmp_short`                                        | 131 [123–136]        | 128 [125–129]       | ×1.02        | 54.9 [53.1–57.1] | 52.3 [51.4–55.8] | ×2.39           | ×2.45          |
| `str_compare_bmp_short`                                      | 182 [177–192]        | 174 [171–177]       | ×1.05        | 75.6 [72.1–83.5] | 74.1 [71.8–78.1] | ×2.41           | ×2.35          |
| `str_slice_bmp_short`                                        | 1744 [1721–1833]     | 1835 [1748–1848]    | ×0.95        | 50.8 [48.9–52.2] | 50.0 [49.0–55.0] | ×34.3           | ×36.7          |
| `str_indexof_bmp_short_n4`                                   | 882 [864–930]        | 893 [842–925]       | ×0.99        | 102 [100–104]    | 101 [92.1–112]   | ×8.64           | ×8.82          |
| `str_concat_bmp_short`                                       | 1061 [1041–1105]     | 1068 [1036–1097]    | ×0.99        | 173 [170–179]    | 176 [171–182]    | ×6.14           | ×6.07          |
| `str_builder_bmp_short`                                      | 221 [213–233]        | 243 [233–249]       | ×0.91        | 2.79 [2.66–2.98] | 2.77 [2.73–2.92] | ×79.2           | ×87.8          |
| `str_splitjoin_bmp_short`                                    | 996 [942–1028]       | 1000 [979–1016]     | ×1.00        | 125 [119–135]    | 128 [124–131]    | ×7.94           | ×7.80          |
| `str_replace_bmp_short`                                      | 510 [478–539]        | 516 [509–540]       | ×0.99        | 31.1 [30.8–31.6] | 31.1 [30.0–32.9] | ×16.4           | ×16.6          |
| `str_replaceall_bmp_short`                                   | 1610 [1469–1637]     | 1593 [1551–1605]    | ×1.01        | 55.9 [54.2–59.3] | 54.4 [53.9–56.6] | ×28.8           | ×29.3          |
| `str_scan_bmp_medium`                                        | 2924 [2783–3073]     | 2831 [2760–2911]    | ×1.03        | 7.44 [7.11–7.62] | 7.36 [7.04–8.87] | ×393            | ×385           |
| `str_equal_bmp_medium`                                       | 7.58 [7.40–8.05]     | 8.23 [7.89–8.76]    | ×0.92        | 28.1 [25.7–28.4] | 28.0 [27.3–29.5] | ×0.27           | ×0.29          |
| `str_compare_bmp_medium`                                     | 9.31 [9.21–9.77]     | 9.44 [8.84–9.95]    | ×0.99        | 39.9 [38.2–42.2] | 37.4 [36.7–40.3] | ×0.23           | ×0.25          |
| `str_slice_bmp_medium`                                       | 246 [221–258]        | 243 [234–251]       | ×1.01        | 18.4 [17.8–18.7] | 19.2 [18.8–19.9] | ×13.3           | ×12.6          |
| `str_indexof_bmp_medium_n4`                                  | 49.7 [48.9–50.9]     | 51.5 [50.6–52.2]    | ×0.97        | 49.5 [48.7–52.8] | 55.0 [52.3–64.8] | ×1.00           | ×0.94          |
| `str_indexof_bmp_medium_n64`                                 | 44.6 [42.7–46.4]     | 45.1 [43.9–46.3]    | ×0.99        | 49.9 [48.1–53.3] | 51.3 [50.0–53.7] | ×0.90           | ×0.88          |
| `str_concat_bmp_medium`                                      | 58.0 [55.2–59.2]     | 53.0 [51.5–54.0]    | ×1.10        | 34.4 [32.6–36.4] | 33.7 [32.7–36.2] | ×1.69           | ×1.57          |
| `str_builder_bmp_medium`                                     | 131 [122–147]        | 134 [122–139]       | ×0.97        | 2.21 [2.11–3.01] | 2.29 [2.05–2.68] | ×59.1           | ×58.7          |
| `str_splitjoin_bmp_medium`                                   | 221 [213–240]        | 238 [222–249]       | ×0.93        | 33.0 [31.5–34.3] | 31.3 [30.3–33.5] | ×6.68           | ×7.60          |
| `str_replace_bmp_medium`                                     | 121 [114–138]        | 130 [116–135]       | ×0.93        | 17.3 [16.8–18.1] | 17.0 [16.4–17.4] | ×6.99           | ×7.69          |
| `str_replaceall_bmp_medium`                                  | 27.8 [26.6–31.0]     | 27.3 [26.7–28.3]    | ×1.02        | 5.67 [5.22–6.16] | 5.63 [5.51–5.69] | ×4.89           | ×4.85          |
| `str_scan_bmp_large`                                         | 2904 [2820–3052]     | 2947 [2857–3041]    | ×0.99        | 7.53 [7.12–7.75] | 7.15 [7.04–8.00] | ×385            | ×412           |
| `str_equal_bmp_large`                                        | 8.57 [8.43–10.1]     | 10.0 [9.52–10.3]    | ×0.85        | 27.0 [25.8–31.6] | 26.4 [25.3–26.9] | ×0.32           | ×0.38          |
| `str_compare_bmp_large`                                      | 9.86 [9.17–10.6]     | 9.57 [9.13–9.90]    | ×1.03        | 36.6 [36.3–38.5] | 39.7 [35.1–40.2] | ×0.27           | ×0.24          |
| `str_slice_bmp_large`                                        | 49.3 [47.7–53.0]     | 45.0 [43.6–51.7]    | ×1.10        | 22.3 [21.9–23.0] | 22.3 [21.3–23.1] | ×2.21           | ×2.02          |
| `str_indexof_bmp_large_n4`                                   | 12.8 [11.8–13.6]     | 13.8 [12.5–15.7]    | ×0.93        | 14.7 [13.6–15.5] | 15.6 [14.2–16.5] | ×0.87           | ×0.88          |
| `str_indexof_bmp_large_n64`                                  | 78.1 [73.8–83.8]     | 77.0 [71.0–77.9]    | ×1.01        | 104 [96.9–107]   | 96.1 [94.1–102]  | ×0.75           | ×0.80          |
| `str_concat_bmp_large`                                       | 2.75 [2.28–3.19]     | 2.37 [2.34–2.47]    | ×1.16        | 186 [172–188]    | 197 [185–203]    | ×0.01           | ×0.01          |
| `str_builder_bmp_large`                                      | 126 [122–143]        | 146 [141–157]       | ×0.86        | 7.69 [6.86–8.22] | 7.28 [7.02–7.64] | ×16.4           | ×20.0          |
| `str_splitjoin_bmp_large`                                    | 307 [295–313]        | 300 [292–319]       | ×1.02        | 75.7 [72.9–78.2] | 80.2 [72.2–84.2] | ×4.05           | ×3.74          |
| `str_replace_bmp_large`                                      | 44.7 [42.6–47.2]     | 43.7 [40.5–45.3]    | ×1.02        | 9.41 [8.55–9.74] | 9.26 [9.08–9.75] | ×4.75           | ×4.72          |
| `str_replaceall_bmp_large`                                   | 180 [175–189]        | 181 [175–185]       | ×0.99        | 124 [122–127]    | 121 [117–128]    | ×1.45           | ×1.50          |
| `str_scan_astral_short`                                      | 4849 [4772–4963]     | 4849 [4787–4957]    | ×1.00        | 20.4 [19.6–20.8] | 20.6 [20.3–22.2] | ×238            | ×235           |
| `str_slice_astral_short`                                     | 1814 [1776–1843]     | 1784 [1761–1830]    | ×1.02        | 47.6 [46.4–51.8] | 50.1 [49.1–54.8] | ×38.1           | ×35.6          |
| `str_indexof_astral_short_n4`                                | 1021 [990–1031]      | 987 [969–1000]      | ×1.03        | 121 [119–127]    | 123 [118–126]    | ×8.47           | ×8.02          |
| `str_replace_astral_short`                                   | 502 [491–519]        | 519 [501–531]       | ×0.97        | 30.5 [29.9–32.5] | 31.8 [30.4–33.1] | ×16.5           | ×16.3          |
| `str_replaceall_astral_short`                                | 1606 [1590–1626]     | 1613 [1596–1631]    | ×1.00        | 67.1 [65.4–67.6] | 68.5 [66.0–70.9] | ×23.9           | ×23.5          |
| `str_scan_astral_medium`                                     | 2841 [2806–3018]     | 2829 [2760–2877]    | ×1.00        | 7.09 [6.74–7.62] | 7.14 [7.01–7.44] | ×401            | ×396           |
| `str_slice_astral_medium`                                    | 236 [223–258]        | 226 [220–243]       | ×1.04        | 20.1 [18.6–20.5] | 18.1 [17.5–19.3] | ×11.7           | ×12.5          |
| `str_indexof_astral_medium_n4`                               | 55.3 [53.5–58.7]     | 54.9 [54.4–57.3]    | ×1.01        | 50.3 [46.9–53.0] | 49.0 [48.0–51.5] | ×1.10           | ×1.12          |
| `str_indexof_astral_medium_n64`                              | 60.1 [59.7–60.7]     | 61.4 [60.7–62.8]    | ×0.98        | 53.2 [51.2–56.7] | 57.3 [55.9–60.6] | ×1.13           | ×1.07          |
| `str_replace_astral_medium`                                  | 91.5 [79.5–96.4]     | 89.3 [87.4–98.0]    | ×1.02        | 4.91 [4.72–5.44] | 5.31 [5.03–5.69] | ×18.6           | ×16.8          |
| `str_replaceall_astral_medium`                               | 59.3 [56.2–61.7]     | 60.5 [59.2–67.1]    | ×0.98        | 12.1 [11.6–13.3] | 13.9 [12.7–15.2] | ×4.91           | ×4.37          |
| `str_scan_astral_large`                                      | 2911 [2804–3070]     | 2946 [2942–2971]    | ×0.99        | 7.68 [7.30–7.84] | 7.80 [7.59–9.00] | ×379            | ×378           |
| `str_slice_astral_large`                                     | 49.4 [44.8–50.3]     | 47.6 [45.5–50.9]    | ×1.04        | 22.7 [21.4–23.7] | 22.3 [21.8–23.9] | ×2.17           | ×2.13          |
| `str_indexof_astral_large_n4`                                | 2.00 [1.78–2.20]     | 1.83 [1.57–2.34]    | ×1.09        | 1.34 [1.26–1.40] | 1.31 [1.29–1.38] | ×1.49           | ×1.40          |
| `str_indexof_astral_large_n64`                               | 107 [106–116]        | 109 [105–111]       | ×0.98        | 145 [129–156]    | 141 [133–150]    | ×0.74           | ×0.77          |
| `str_replace_astral_large`                                   | 46.5 [42.9–49.9]     | 44.3 [42.2–46.4]    | ×1.05        | 9.35 [9.09–10.1] | 9.11 [8.78–9.48] | ×4.97           | ×4.86          |
| `str_replaceall_astral_large`                                | 519 [504–528]        | 519 [510–526]       | ×1.00        | 400 [359–406]    | 393 [380–400]    | ×1.30           | ×1.32          |
| `str_replaceall_log_large`                                   | 14.0 [13.3–15.2]     | 13.8 [13.2–14.1]    | ×1.02        | 11.5 [10.7–13.3] | 10.9 [10.8–11.1] | ×1.22           | ×1.26          |
| `str_format_int_short`                                       | 3033 [2803–3173]     | 2798 [2668–2870]    | ×1.08        | 432 [422–455]    | 416 [405–431]    | ×7.01           | ×6.72          |
| `str_parse_int_short`                                        | 8632 [8546–8690]     | 407 [396–432]       | ×21.23       | 151 [145–156]    | 153 [149–158]    | ×57.1           | ×2.66          |
| `str_parse_int_short_bytes` (C++ `std::string`, lower bound) | 8534 [8495–8573]     | 419 [398–423]       | ×20.37       | 102 [101–108]    | 106 [102–109]    | ×83.3           | ×3.94          |

**Outcome against the target.** `str_parse_int_short` went from 8632 to 407 ms (×21.2; the target was ≤ 1700 ms). That is 863 → 41 ns per `Number(s)`, and the gap to C++ shrank from ×57.1 to ×2.66 (×3.94 against the `std::string` lower bound). The "before" figure is 3% above the step 1 baseline (8396 ms), within this host's session-to-session spread.

Of the other 84 rows, 13 had an "after" median above the "before" Q3. About as many moved by similar amounts the other way, for example `str_concat_bmp_medium` ×1.10, `str_slice_bmp_large` ×1.10 and `str_format_int_short` ×1.08. None of these kernels calls `rt.parseNumber`. An interleaved A/B of the 13 flagged kernels ran the before and after `strings` executables alternately, 11 measured rounds each after one discarded round. It put 12 of the 13 within 0.96–1.04 of "before", with overlapping IQRs.

The exception is `str_equal_ascii_large`, 1.11× slower in that A/B and again in a 31-round A/B (7.0 [6.7–7.8] → 7.8 [7.5–8.4] ms). In the same 31-round A/B, `str_equal_bmp_large` was 1.06× slower with overlapping IQRs, and `str_compare_ascii_large` was 0.98×. The timed region of `str_equal_ascii_large` is 7–10 ms for 100 comparisons of 1 Mi-unit strings. The numeric runtime is emitted after the string runtime, so the string runtime does not move. What moves is everything placed after `rt.parseNumber` (the compiled program's functions), which shifts by the size of the new code. The difference is probably a code-placement or alignment effect in that comparison loop. It was not investigated further and remains recorded here as a ~0.8 ms (+11%) difference on this one kernel.

**Why the gap shrank.** Before this change, every `Number(s)` set up two scratch big integers, called `num.mul` and `num.add` for every digit, and then called `num.ratio`. `num.ratio` derives the 53-bit significand by long division one bit per iteration, calling `num.cmp`, `num.sub` and `num.shr` in every iteration: more than 160 calls and about 820 ns per conversion, even for `"7"`. For the harness's 1–16 digit integers, the fast scan now spends about a dozen instructions per digit, then one `cvtsi2sd` and, with `e = 0`, a multiply by 1.0, with no calls after the trimming.

**Remaining.** A conversion takes about 41 ns, against 15 ns for `from_chars` with UTF-16 narrowing. This was not profiled. The rest is _probably_ the call of the `Number` builtin and its argument handling, the two `num.space` calls of the trimming, and the kernel loop's array load and accumulation (gaps 4 and 5). Inputs outside the fast range (more than 19 significant digits, |e| > 22, `m > 2^53`) still take the big-integer path at the old cost. An extended fast path would cover most of them, for example the exact `m × 10^k` for small `m` with e up to 22 + 15, or an Eisel-Lemire step before the big-integer fallback. The measured kernels do not need it, so it is left for a follow-up. `parseFloat` reaches the fast path through `rt.parseNumber` after copying its prefix into a new string; `parseInt` has its own routine and is unchanged.

**Code size and build time.** `rt.parseNumber` grows by about 100 instructions, plus the 184-byte table. The linux-x64 executables keep their size at page granularity (strings 4 091 904 bytes, arith 3 923 968). The win32-x64 strings executable grew by 512 bytes (4 159 488 → 4 160 000, one file-alignment unit). The `--print-asm` listing of the strings program stays at 19 986 lines, because it shows the program's code, not the runtime. Build time is unchanged: three builds of the strings program with the new compiler took 0.89–0.99 s, against 0.99–1.05 s in the "before" `meta.json`. The "after" `build.mjs` run recorded 3–6 s because it started right after `npm run build` on a busy host; that is not a compiler cost.

## Register-resident Numbers and int32 counters (#424)

**Change.** Gap 5. `src/ir/representations.ts` (last pass of `optimizeFunction`) proves which loop slots can be unboxed and which loop counters stay int32; `src/backend/x64/register-loops.ts` and `operations.ts` emit such a loop as a register copy: int32 induction variables and integer temporaries in R12–R15, written double slots in XMM2–XMM4, with typed-array indexing, `&`, `<`, `++` and the accumulator arithmetic done on the registers (no tag tests, no `cvttsd2si` round trip on the counter). ARM64 translates the new register forms (x19–x22, d2–d5). Design note: [Register-resident Numbers](architecture.md#register-resident-numbers-424).

**Semantics.** Doubles keep their IEEE operations (no fast-math), so NaN, ±Infinity and -0 behave as before; an int32 slot never holds -0. A counter whose int32 range depends on its bound is tested once on loop entry and the unchanged loop runs when the test fails (a fractional or NaN bound, a bound above 2^31 - 1, a counter that starts at 2^31 - 2 with step 0.5, a double counter past 2^53). Registers are written back as boxed Numbers before every call, safepoint, slow path, throw, loop exit and return, so stack maps, the collector and exception handlers see ordinary Values. Tests: `tests/unboxed-numbers.test.ts` and `tests/register-loops.test.ts` (Node oracle under GC stress: accumulators giving NaN, ±Infinity and -0, int32 counters at 2^31 - 1 and -2^31 with `<`, `<=`, `>`, `>=`, counters that must stay doubles, 2^53, loops with calls, captured accumulators, try/catch/finally that throws mid-loop, break/continue/labels, nested loops, x4 accumulators, typed-array loops, allocation and string building inside the loop), a listing check and the ARM64 encoding tests.

**Protocol.** Same host as the baseline (`tors`, WSL2, Intel Core i7-13620H), `node bench/cpp/run.mjs --runs 11 --platform linux --only f64_,u32_,loop_control`, N = 10 000 000. "Before" is the compiler at `16371594` (v0.21.0, the commit before this branch), built in a separate worktree and measured immediately before "after" (this branch) in the same session; the C++ binaries are rebuilt by `build.mjs` in both (same flags) and every kernel printed the same checksum in all runs. The host is a shared desktop and the runner does not pin cores, so absolute times differ from the earlier sections (this session's "before" `u32_add_chain` is 247 ms against 202 ms in the Fix A "after"). Raw results: `bench/cpp/results/2026-10-21-tors-linux-wsl2-unboxed-{before,after}.{json,txt}`. Medians in ms with the IQR.

| Kernel             | Nona before ms [IQR] | Nona after ms [IQR] | Nona speedup | C++ `o3` before  | C++ `o3` after   | Nona/C++ before | Nona/C++ after |
| ------------------ | -------------------- | ------------------- | ------------ | ---------------- | ---------------- | --------------- | -------------- |
| `f64_add_chain`    | 128 [127–129]        | 42.0 [41.1–42.3]    | ×3.05        | 6.13 [5.99–6.62] | 5.47 [5.11–5.95] | ×20.9           | ×7.68          |
| `f64_add_x4`       | 59.7 [58.7–60.7]     | 38.3 [37.8–39.2]    | ×1.56        | 2.19 [2.07–2.28] | 1.96 [1.78–2.08] | ×27.3           | ×19.5          |
| `f64_add_direct`   | 132 [131–134]        | 50.8 [48.8–52.6]    | ×2.60        | 6.21 [5.87–6.50] | 5.34 [5.26–5.75] | ×21.3           | ×9.51          |
| `f64_add_indirect` | 199 [195–203]        | 144 [141–149]       | ×1.38        | 13.0 [12.9–14.1] | 12.5 [12.3–13.3] | ×15.3           | ×11.5          |
| `f64_add_stdfn`    | 198 [191–199]        | 138 [135–143]       | ×1.43        | 24.5 [24.0–25.7] | 23.9 [22.7–24.3] | ×8.08           | ×5.77          |
| `f64_add_closure`  | 185 [180–188]        | 173 [171–177]       | ×1.07        | 25.0 [23.8–25.4] | 27.5 [27.0–28.8] | ×7.40           | ×6.29          |
| `f64_mul_chain`    | 126 [124–127]        | 58.8 [56.9–60.9]    | ×2.14        | 12.1 [11.7–12.6] | 13.1 [12.9–13.5] | ×10.4           | ×4.49          |
| `f64_mul_x4`       | 58.3 [57.3–61.0]     | 41.8 [40.9–42.4]    | ×1.39        | 3.22 [3.10–3.44] | 3.57 [3.13–3.57] | ×18.1           | ×11.7          |
| `f64_mul_direct`   | 130 [128–135]        | 56.3 [52.9–59.2]    | ×2.31        | 11.9 [11.5–12.8] | 12.7 [12.3–12.9] | ×10.9           | ×4.43          |
| `f64_mul_indirect` | 194 [193–202]        | 139 [136–141]       | ×1.40        | 12.5 [12.0–13.4] | 13.2 [12.4–14.6] | ×15.5           | ×10.5          |
| `f64_mul_stdfn`    | 199 [192–205]        | 147 [142–149]       | ×1.35        | 28.2 [27.0–30.2] | 30.0 [28.3–30.7] | ×7.06           | ×4.90          |
| `f64_mul_closure`  | 194 [188–201]        | 171 [165–173]       | ×1.13        | 29.3 [28.9–30.6] | 29.2 [26.8–30.8] | ×6.62           | ×5.86          |
| `u32_add_chain`    | 247 [242–257]        | 138 [133–144]       | ×1.79        | 3.26 [3.06–3.50] | 3.47 [3.41–4.09] | ×75.8           | ×39.8          |
| `u32_add_x4`       | 133 [130–135]        | 114 [112–115]       | ×1.17        | 1.83 [1.75–1.94] | 1.95 [1.83–2.06] | ×72.7           | ×58.5          |
| `u32_add_direct`   | 248 [243–251]        | 137 [133–138]       | ×1.81        | 3.37 [3.18–3.64] | 3.76 [3.14–3.93] | ×73.6           | ×36.4          |
| `u32_add_indirect` | 320 [307–326]        | 209 [206–215]       | ×1.53        | 16.9 [16.4–19.6] | 16.0 [15.4–16.7] | ×18.9           | ×13.1          |
| `u32_add_stdfn`    | 348 [337–352]        | 209 [204–214]       | ×1.67        | 29.0 [28.5–30.1] | 24.6 [23.1–26.2] | ×12.0           | ×8.50          |
| `u32_add_closure`  | 318 [316–321]        | 191 [187–193]       | ×1.66        | 19.8 [18.6–20.8] | 16.7 [15.2–17.6] | ×16.1           | ×11.4          |
| `u32_mul_chain`    | 350 [346–369]        | 244 [242–255]       | ×1.43        | 10.6 [10.1–11.5] | 8.60 [8.47–8.80] | ×33.0           | ×28.4          |
| `u32_mul_x4`       | 294 [283–314]        | 243 [240–246]       | ×1.21        | 3.62 [3.49–3.69] | 3.10 [2.92–3.14] | ×81.2           | ×78.4          |
| `u32_mul_direct`   | 313 [309–337]        | 254 [250–259]       | ×1.23        | 9.88 [9.39–10.7] | 9.21 [8.22–9.77] | ×31.7           | ×27.6          |
| `u32_mul_indirect` | 379 [368–386]        | 305 [297–306]       | ×1.24        | 17.0 [16.3–18.2] | 13.7 [13.2–14.4] | ×22.3           | ×22.3          |
| `u32_mul_stdfn`    | 366 [358–373]        | 295 [292–300]       | ×1.24        | 24.8 [23.5–25.9] | 21.3 [20.6–22.3] | ×14.8           | ×13.8          |
| `u32_mul_closure`  | 349 [344–355]        | 272 [268–276]       | ×1.28        | 13.3 [12.7–13.7] | 11.6 [11.3–12.0] | ×26.2           | ×23.4          |
| `loop_control`     | 266 [262–277]        | 104 [101–105]       | ×2.56        | 3.29 [3.10–3.52] | 3.14 [2.91–3.31] | ×80.9           | ×33.1          |
| `f64_array_4k`     | 58.5 [57.7–61.9]     | 35.3 [35.1–36.3]    | ×1.66        | 1.95 [1.84–2.21] | 2.01 [1.88–2.10] | ×30.0           | ×17.6          |
| `f64_array_1m`     | 56.6 [56.5–60.6]     | 34.3 [33.9–35.8]    | ×1.65        | 1.98 [1.89–2.11] | 1.69 [1.61–1.76] | ×28.6           | ×20.3          |
| `f64_array_64m`    | 54.9 [53.8–55.6]     | 35.6 [34.9–38.1]    | ×1.54        | 6.22 [6.09–6.63] | 5.75 [5.61–6.23] | ×8.83           | ×6.19          |

**Outcome.** Every kernel with a counted loop is faster with non-overlapping IQRs: `f64_add_chain` 128 → 42.0 ms (×3.05), `f64_mul_chain` 126 → 58.8 ms (×2.1), `f64_add_x4` 59.7 → 38.3 ms (×1.56), `f64_mul_x4` 58.3 → 41.8 ms, `loop_control` 266 → 104 ms (×2.56), `u32_add_chain` 247 → 138 ms (×1.8), `f64_array_*` 55–59 → 34–36 ms. Nona/C++ for `f64_add_chain` goes from ×20.9 to ×7.7 (the issue's baseline was ×22.1). The call variants (`*_direct`) gain the same loop savings (`f64_add_direct` ×2.6); the indirect, `stdfn` and closure variants gain 12–60 ms, bounded by the call costs of gap 6 (they are not planned loops: a call in the loop writes the registers back). No kernel is slower beyond its IQR and C++ is unchanged within noise. The x4 kernels remain ×12–20 of C++; the cause was not profiled (probably the typed-array element read, which still tests its receiver per access, and C++ scheduling the four chains freely).

**Remaining.** Loops that push an exception handler, are entered by one, suspend (generators, `await`) or have slots live into a handler are not planned and keep the boxed code, as do functions with a mapped `arguments` object and very large functions. Temporaries across calls are written back, not kept in callee-saved registers. Values are not unboxed outside loops. `u32_mul_*` stays dominated by `Math.imul` (gap 7).

**Code size.** The `arith` program's linux-x64 executable grows from 4 628 480 to 4 710 400 bytes (+80 KiB, +1.8%) and its `--print-asm` listing from 20 289 to 26 829 lines (+32%): a planned loop is emitted twice (register copy and the unchanged loop for a failed entry test), and the runtime preludes' loops are planned too. The hello-world executable (`console.log("hello")`) is 1 212 416 bytes before and after (page granularity).
