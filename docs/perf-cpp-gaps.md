# Nona vs optimized C++: ranked gap-to-cause map

Step 1 of [#402](https://github.com/40oleg/nona/issues/402). It ranks the gaps that the [#401](https://github.com/40oleg/nona/issues/401) harness (`bench/cpp/`) measures between Nona and `g++ -O3`, ties each one to its cause in the generated code or the runtime, separates what JavaScript semantics require from what Nona can remove, and selects the two fixes for the next steps. Fix A is implemented (step 2, [results](#fix-a-results-step-2)); the rest of this page is the step 1 baseline.

**Depends on #401.** The harness is not on `main` yet. This branch is rebased onto `origin/nona/issue-401` (`3673735`: arithmetic, call and UTF-16 string kernels) and is rebased again once #401 merges.

Figures marked _estimate_ are derived, not measured. Every other number comes from the raw results committed under `bench/cpp/results/`.

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

The ranking weighs the ratio, the absolute time per operation, how common the pattern is in real programs, and how confident the cause is. "Owner" is the issue (and open PR) that already covers the mechanism; gaps without one get a follow-up issue in step 4.

| Rank | Gap                                                                 | Kernels (Nona vs C++)                                                                                                   | Cause (short)                                                                                                         | Mandatory?                                         | Owner                                                     |
| ---- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| 1    | ToInt32/ToUint32 of integers outside int32 leave the inline path    | `u32_add_*` ×25–266, `loop_control` ×134, `str_scan_*` ×325–650 (part)                                                  | `>>>`, `&`, `\|`, `^`, `<<`, `>>` inline only when both operands are int32; a u32 sum ≥ 2^31 calls `rt.shiftUnsigned` | avoidable                                          | none (extends #238) → **Fix A**                           |
| 2    | `Number(string)` always runs the exact big-integer path             | `str_parse_int_short` ×54.9 (840 ns/op)                                                                                 | `rt.parseNumber` divides two scratch big integers bit by bit for every input, even `"123"`                            | avoidable                                          | none → **Fix B**                                          |
| 3    | `s.charCodeAt(i)` is a full method call                             | `str_scan_*` ×325–650 (rest), `str_slice_*_short` (part)                                                                | property lookup on a primitive, `rt.invoke`, rooted builtin frame per character                                       | avoidable (guarded)                                | #47 (PR #414) for call sites; inline intrinsic: follow-up |
| 4    | Typed-array and array element access is a stub call                 | all arithmetic kernels (`t[i & MASK]`), `f64_array_*` ×19–61                                                            | `rt.elementGet` / `rt.elementSet` per element                                                                         | avoidable (guarded)                                | #240 (PR #421)                                            |
| 5    | Values live in 16-byte stack slots; no register allocation          | `f64_add_chain` ×22.1, `f64_add_x4` ×37.0, `f64_mul_x4` ×26.7                                                           | every operation loads/stores tag+payload through memory; the loop counter is a double                                 | avoidable (architectural)                          | none; roadmap item 15 continues → follow-up               |
| 6    | Call overhead (known, indirect, closure)                            | `f64_add_direct` ×29.3, `*_indirect` ×15.7–16.2, `*_closure` ×7.3–7.5                                                   | `rt.enterFrameN` prologue stub, frame/root-record link, argument copies, `rt.invokeSite2` for unknown callees         | partly (no inlining in C++ `noinline`: ×0.88–0.96) | #47 (PR #414), #235 (PR #420), #239 (PR #419)             |
| 7    | `Math.imul` is a builtin call                                       | `u32_mul_*` ×32–138                                                                                                     | `rt.Math.imul.fn.code` with two `rt.toInt32` calls                                                                    | avoidable (guarded)                                | none → follow-up                                          |
| 8    | `String(number)`                                                    | `str_format_int_short` ×7.88 (340 ns/op)                                                                                | generic shortest round-trip formatting for integer-valued doubles                                                     | partly                                             | none → follow-up                                          |
| 9    | Fixed cost of short-string `replace`/`replaceAll`/`indexOf`/`slice` | `str_replaceall_*_short` ×25–31, `str_replace_*_short` ×19–20, `str_indexof_*_short` ×10–11, `str_slice_*_short` ×43–46 | per-call overhead dominates 16-unit inputs; the large cases are near parity (×0.75–2.05)                              | partly                                             | #387 (large replaceAll, done); call side #47              |
| 10   | Builders and split/join                                             | `str_builder_*_join` ×10.5–16.3, `str_splitjoin_*` ×4.0–8.9, `str_concat_*_short` ×6.9–7.3                              | array growth, per-part allocation and the join pass                                                                   | partly                                             | #236, #48 (done)                                          |

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

Probes (10,240,000 units): the scan loop without `charCodeAt` 73 ms; with it (f64 accumulator, no `>>>`) 253 ms, so about 17.6 ns per call; the same loop over a dense array of codes 133 ms. The remaining part of the 44 ns comes from gap 1 (the accumulator crosses 2^31) and `s.length` per iteration (`rt.getLengthCached` call). Each `charCodeAt` is a method call: the property is looked up on the primitive through `String.prototype`, the builtin is called through the generic call path, and the builtin (`src/runtime/string-builtins.ts`, `indexMethods`) builds a rooted frame, converts the position and loads one unit. An inline path needs a guard that `String.prototype.charCodeAt` is still the intrinsic (the same kind of epoch/identity guard the call-site caches of #47 use). Follow-up issue: "Inline `charCodeAt`/`charAt` on primitive strings behind an intrinsic guard" (step 4), coordinated with #47.

### 4. Element access through stubs

Every arithmetic kernel reads `t[i & MASK]` through `call rt.elementGet` (`src/runtime/array-elements.ts`), which dispatches on the receiver kind and the element type each time; `f64_array_*` also writes through `rt.elementSet`: `f64_array_4k` 103 ms vs 1.82 (×56.7), `_1m` 109 vs 1.79 (×61.2), `_64m` 112 vs 5.77 (×19.4, memory-bound in C++). Probe: removing the load from the f64 chain saves about 3.7 ns per iteration. Owned by #240; PR #421 adds an inline typed-array path for Number keys and then bounds-check elimination. Re-measure `f64_*`, `u32_*` and `f64_array_*` after it merges; this issue does not duplicate it.

### 5. Memory-resident values and the double loop counter

`f64_add_chain` 118 ms vs 5.36 (×22.1), `f64_add_x4` 70.2 vs 1.90 (×37.0), `f64_mul_chain` 118 vs 10.2 (×11.6), `f64_mul_x4` 73.8 vs 2.77 (×26.7). In `js.fn.8` every value is a 16-byte tag+payload slot on the stack: `s + t[...]` loads both tags, compares them with 3, adds from memory, stores the result tag and payload into a temporary, then copies the temporary into `s` (four 8-byte moves). `i` is a double: `i++` is `cvtsi2sd`+`addsd`, and `i & MASK` converts both operands back to integers with the round-trip checks of gap 1 (probe: about 4.8 ns per iteration for `i & 1023` alone). Each iteration also polls `rt.gcNeeded` (one compare, cheap). Reading the top-level `const MASK` costs two loads and a TDZ compare; the probe with a literal `1023` was within 1 ms, so it is not a gap. The x4 kernels gain less from independent accumulators than C++ does (Nona 118 → 70 ms, C++ 5.4 → 1.9 ms); the per-operation loads, stores and checks through the slots are the likely limit (not profiled).

These costs are avoidable but architectural: keeping proven-Number locals unboxed in XMM/GPR registers, with integer-typed induction variables, is the continuation of roadmap item 15 (`src/ir/numbers.ts` already proves which slots hold Numbers; the code generator still stores them as Values). It is too large for this issue; step 4 files it as a follow-up with these kernels as its measurement.

### 6. Calls

| Kernel                                     | Nona ms [IQR] | C++ `o3` [IQR]   | Ratio | C++ `noinline` | Ratio  |
| ------------------------------------------ | ------------- | ---------------- | ----- | -------------- | ------ |
| `f64_add_direct`                           | 168 [166–179] | 5.72 [5.24–6.03] | ×29.3 | 5.14           | ×32.7  |
| `f64_mul_direct`                           | 172 [168–178] | 11.6 [11.3–12.0] | ×14.9 | 10.9           | ×15.8  |
| `f64_add_indirect`                         | 172 [170–181] | 10.6 [10.3–11.8] | ×16.2 | 10.6           | ×16.1  |
| `f64_add_closure`                          | 162 [159–164] | 22.3 [21.9–22.6] | ×7.27 | 185            | ×0.877 |
| `f64_add_stdfn` (C++ only, vs JS indirect) | 176 [173–182] | 21.2 [21.0–22.1] | ×8.28 | 183            | ×0.963 |

A direct call adds about 5 ns over the inline expression (168 − 118 ms over 10^7 calls). In `js.fn.17` the caller loads the global `add`, checks its tag, kind and code pointer against `js.fn.4`, copies the two arguments into the outgoing area and calls; the callee calls `rt.enterFrame2` (stack check, frame set-up, parameter copies, `this`/`new.target` copies, root-record link in `rt.gcRoots`) and on return stores the result Value and unlinks the root record. `callIndirect` (`js.fn.21`) calls `rt.invokeSite2` and also re-checks the TDZ of `let s = init` three times per iteration, apparently because the initialization analysis (`src/ir/initialization.ts`) does not treat a copy of a parameter as initialized (not yet confirmed) (a small, separate avoidable cost). The C++ `noinline` build shows that once C++ must also make a real call through `std::function`, Nona's closure and indirect calls are at parity (×0.88–0.96): the remaining call gap is inlining and the cost of Nona's prologue, which #47 (PR #414: cheaper prologues for known callees), #235 (PR #420: guarded inlining) and #239 (PR #419: known callees through cells) address. This issue does not duplicate them; it re-measures these rows after they merge.

### 7. `Math.imul`

`u32_mul_chain` 363 ms vs 7.51 (×48.4), `u32_mul_x4` 361 vs 2.61 (×138), `u32_mul_direct` 408 vs 8.04 (×50.7). `Math.imul(p, t[i])` is a builtin call (`rt.Math.imul.fn.code`, `src/runtime/math.ts`) that calls `rt.toInt32` for each argument; its result is an int32, so the following `>>> 0` stays inline. Follow-up: an inline `Math.imul` behind an intrinsic guard (step 4).

### 8–10. Other string costs

- `str_format_int_short` 3398 ms [3377–3425] vs 431 [402–444] (×7.88): 340 ns per `String(x)` of an integer-valued double. Follow-up: an integer fast path in number formatting.
- Short inputs: `str_replaceall_ascii_short` 1628 vs 56.9 (×28.6), `str_replace_ascii_short` 605 vs 31.5 (×19.2), `str_indexof_ascii_short_n4` 1064 vs 98.7 (×10.8), `str_slice_ascii_short` 2142 vs 49.6 (×43.2). Large inputs of the same operations are close to C++ (`replaceall_log_large` ×1.06, `slice_*_large` ×2.0, `indexof_*_large` ×0.75–0.99), so the gap is fixed per-call cost. The `slice` kernel's iteration also makes two `Math.imul` calls and a `charCodeAt` call (`mix`, gaps 3 and 7); a probe of `s.slice(b, b + 4)` alone took about 48 ns per call.
- `str_builder_*_join` ×10.5–16.3, `str_splitjoin_*` ×4.0–8.9, `str_concat_*_short` ×6.9–7.3: allocation and per-element work; related to #236 (scalar replacement) and the finished #48. Not selected: smaller ratios and no single cause.

## Selection for the next steps

| Fix            | Gap                                                | Why this one                                                                                                                                                                                       | Bounded scope                                                                                                           | Measurable target                                                                                                                         |
| -------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **A** (step 2) | 1: ToInt32/ToUint32 of int64-range integers inline | Largest avoidable arithmetic gap not owned by an open PR (#240, #47, #235, #239 cover gaps 4 and 6); about 19 ns per affected operation; common in hashing, checksums, PRNGs and UTF-8/UTF-16 code | `int32Operand` and the bitwise branch in `src/backend/x64/integer-ops.ts` / `operations.ts`; no IR change               | `u32_add_chain` ≤ 260 ms (from 429), `u32_add_x4` and `loop_control` ≥ 1.5× faster, `str_scan_*` faster beyond IQR, no `f64_*` regression |
| **B** (step 3) | 2: `Number(string)` exact fast path                | Largest avoidable string gap with a single, local cause (840 ns per conversion, ×54.9); gap 3 is larger in ratio but needs an intrinsic guard that belongs with #47's call-site caches             | `rt.parseNumber` in `src/runtime/numeric/parse.ts`; the big-integer path is kept for everything outside the exact range | `str_parse_int_short` ≤ 1700 ms (from 8396, ≥ 5×), no regression in other string kernels                                                  |

Both fixes need differential Node oracle tests (`runOnHost`/`runOracle`) under `gcStress` for their edge cases, and a re-run of the affected kernels plus their neighbours (all `f64_*`/`u32_*` and `loop_control` for A; all `str_*` for B) on the same host with the C++ baselines unchanged. If a fix misses its target, the result is recorded here and the next justified path is chosen.

Follow-up issues for step 4: register-resident Number locals and integer induction variables (gap 5), inline `charCodeAt`/`charAt` (gap 3), inline `Math.imul` (gap 7), integer fast path of `String(number)` (gap 8), parameter copies in the TDZ analysis (gap 6), and the `--only strings` startup row of the harness (#401).

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
