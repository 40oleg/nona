# Formal verification scope and acceptance criteria

`verification/` is a standalone Lean 4.19.0 project for the move rules used by
`src/ir/copies.ts` and the numeric guards used by `src/backend/x64/integer-ops.ts`.
It contains an interpreter, a dead-move optimizer, represented Number semantics
and correctness theorems. These are proof models, not a proof of the entire
Nona compiler or its TypeScript implementation.

The owner's coverage decision is to retain this checked model and extend proofs
to production guard correspondence and selected numeric fast paths under
[#653](https://github.com/40oleg/nona/issues/653). Numeric coverage is described
below; production IR correspondence and switch dispatch remain separate tasks.
The earlier experiment
[#284](https://github.com/40oleg/nona/issues/284) and
[PR #286](https://github.com/40oleg/nona/pull/286) are historical evidence, not
accepted production coverage. This scope does not imply a whole-compiler proof
or a verification percentage.

## Run the checker

Install [Lean via elan](https://lean-lang.org/install/), then run from the
repository root:

```sh
npm run check:proofs
# Equivalent: lake -d verification build
```

The pinned [`lean-toolchain`](../verification/lean-toolchain) selects Lean 4.19.0. The project needs no Mathlib or
third-party proof packages. Node.js and elan are development tools; they are
not linked into compiled Nona programs. The [`formal-verification` CI workflow](../.github/workflows/formal-verification.yml)
runs this same Lake build on pull requests and pushes to main.

The build treats warnings as errors, so proof holes (`sorry`/`admit`) fail.
[`Nona/Audit.lean`](../verification/Nona/Audit.lean) also inspects transitive dependencies of every theorem in the `Nona` namespace
in the checked kernel environment. Only Lean's standard logical axioms
`propext`, `Classical.choice` and `Quot.sound` are allowed. Project-defined
axioms and `sorryAx` are rejected; the audit also prints the dependencies of
the main theorems. Examples use kernel-checked `decide`, not `native_decide`.

## What is proved today

[`Nona/MoveRules.lean`](../verification/Nona/MoveRules.lean) establishes the
following guarantees within the pure, straight-line model.

A state maps slot numbers to values. Expressions read slots, contain literals,
and apply pure unary/binary functions. Instructions evaluate all operands in
the old state and then write one destination. Programs are finite instruction
lists. Observation is equality at a specified list of live slots.

Values and operator functions are arbitrary parameters. The proofs never
assume `x + 0 = x`, nor treat a JavaScript Number as a mathematical integer.
A value domain can distinguish NaN representations, signed zeros, object
identities and the uninitialized marker. Modeling these values does not
establish the correctness of Nona's actual binary64 implementation.

| Theorem              | Guarantee                                                                                                       | Production connection                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `substitute_correct` | Replacing a read preserves expression evaluation while the two slots hold equal values                          | Operand forwarding in `propagateCopies`; redefinitions must invalidate aliases |
| `dead_write_correct` | A write to an unobserved slot preserves all observed slots                                                      | Removing dead copies, constants and uninitialized markers                      |
| `coalesce_correct`   | `t = e; x = t` and `x = e` agree when `t` is unobserved; `x` may occur in operands                              | Constants and inline numeric producers in `coalesceMoves`                      |
| `run_congr`          | Inputs equal at backward-computed live slots produce equal observations                                         | The continuation condition required by dead-write removal                      |
| `optimizer_correct`  | For every program, state and observation list, the modeled recursive dead-move optimizer preserves observations | A complete correctness theorem for the modeled straight-line pass              |

The core statement is:

```lean
theorem optimizer_correct (p : Program V) (s : State V) (live : List Slot) :
    Agree live (run (optimizeDead p live) s) (run p s)
```

It quantifies over all programs in this fragment and all their inputs, rather
than enumerating test cases. `optimizeDead` removes only literal/read writes;
pure unary/binary producers remain. Backward liveness includes reads before
killing a written slot, allowing a destination to also be an operand.

## Numeric semantics and production correspondence

[`Nona/Numeric.lean`](../verification/Nona/Numeric.lean) is separately importable
for [#660](https://github.com/40oleg/nona/issues/660). Its statements live in
`Nona.Numeric` and are imported by the normal library and transitive audit.
The production specification is
[`integer-ops.ts`](../src/backend/x64/integer-ops.ts), with Number type checks
and literal selection in [`operations.ts`](../src/backend/x64/operations.ts).
This correspondence is a source-level argument supported by native regressions;
the TypeScript emitter and target encoders have not been proved in Lean.

### Represented Numbers and equality

`Number` distinguishes finite integers, finite fractions, NaN, each infinity,
positive zero (`integer 0`) and `negativeZero`. A fraction represents
`(-1)^negative * (whole + numerator / 2^(shift+1))`, with a strictly positive,
proper, odd numerator. The canonicalization contract is to extract the whole
magnitude, reduce the fractional numerator by removing factors of two, and
retain the sign. Thus `1.5` and `3/2` use the same normalized data
`(false, 1, 1, 0)`; `2.5` uses `(false, 2, 1, 0)`. Unnormalized fractions are
not model inputs. Proof fields do not affect equality. `fraction_residue` and
`fraction_nonintegral` establish the proper residue and nonintegrality of the
rational magnitude; `fraction_quotient` justifies taking the whole part in
`truncate`. `fraction_comparison` identifies fractional equality with equality
of the canonical data.

All finite binary64 values have a dyadic interpretation, but the model also
admits integers and dyadics outside binary64's precision and exponent limits.
A parsed expression such as `1/3` must be mapped to its actual binary64 dyadic
value, not to the mathematical rational `1/3`. No binary64 decoder or
canonicalization implementation is verified here. NaN payloads are collapsed
because this observation does not expose them.

`integerValue` returns an integer only for finite integral inputs, identifying
both zeros with zero. `numberEq` compares canonical fractional identities,
makes NaN unequal even to itself, and identifies the zeros. `negativeZero`
observes the zero sign separately. Checked examples distinguish equal and
unequal fractions and the two observations on zeros. This API supports future
strict-equality dispatch work; it proves no switch selection theorem yet.
`finite` retains the finite/special distinction; `inInt32Range` describes the
closed numerical interval even for fractions near its endpoints.
`admission_finite_integral_range` restates exact admission using these separate
finiteness, integrality and range predicates.

### Admission, division and masking theorems

The following names are in `Nona.Numeric`. The principal results are printed
by `Nona.Audit`; its transitive check covers every theorem and example.

| Theorem                                                | Checked statement                                                                                                       | Production guard or instruction                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `ordered_equal`                                        | Ordered ZF equality is numerical equality; unordered comparisons also set ZF                                            | `ucomisd`, `jp slow`, `jne slow`                                    |
| `signExtend32_fixed`                                   | `(n + 2^31) mod 2^32 - 2^31 = n` iff `-2^31 <= n <= 2^31-1`                                                             | `shl r11,32; sar r11,32; cmp r11,reg`                               |
| `admission_exact`                                      | Modeled admission accepts exactly finite integral int32 values, including both zeros                                    | `int32Operand`, including its conversion round trip and range check |
| `remainder_eligibility`                                | Admission of both operands plus separate negative-zero and zero-divisor checks is exactly remainder eligibility         | Early sign-bit rejection and dynamic divisor rejection              |
| `remainder_decomposition`                              | `tmod n d + d * tdiv n d = n`                                                                                           | Signed division, truncated toward zero                              |
| `remainder_bounds`                                     | For nonzero `d`, remainder magnitude is less than `abs d` and its sign follows `n`                                      | `cqo; idiv rcx`; distinct from Euclidean `%` for negative inputs    |
| `division_fits`                                        | Admitted operands and a nonzero divisor give an int64 quotient and int32 remainder                                      | 64-bit division; `INT_MIN / -1 = 2147483648` is safe                |
| `division_result_correct`, `dynamic_fast_path_correct` | Guarded conversions, division and original-sign reconstruction compose to the independent integral Number specification | Complete dynamic remainder fast path                                |
| `remainder_zero_sign`, `integer_remainder_zero_sign`   | A vanishing remainder has the separately supplied dividend sign, including negative zero for negative integer dividends | Early `-0` fallback and post-division sign reconstruction           |
| `guarded_toInt32`                                      | Guarded `d` and `d-1` are unchanged by signed 32-bit conversion                                                         | JavaScript bitwise coercions in `maskableDivisor`                   |
| `static_guard_exact`, `number_static_guard_exact`      | The complete static guard, including the bit predicate, admits exactly `2^k` with `0 <= k <= 30`                        | Integer literal, `1 <= d <= 2^30`, `(d & (d-1)) === 0`              |
| `static_mask_remainder`, `static_mask_number`          | On nonnegative inputs, a statically admitted divisor's mask agrees with truncating remainder and the Number result      | Nonnegative mask path in `integerRemainder`                         |
| `static_fast_path_correct`                             | Guarded masking for nonnegative dividends and division for negative dividends agree with the integral Number result     | Complete static-divisor branch, preserving the negative fallback    |

`cvtt` specifies finite truncation to a signed int64 with
`-9223372036854775808` for invalid/out-of-range conversion. `admission_exact`
derives its conclusion from this conversion, ordered comparison and the
sign-extension fixed-point theorem. Its explicit `ExactInt32Encoding encode`
parameter requires only that int32 integers encode exactly to the modeled
Number. It does **not** assume arbitrary int64-to-binary64 conversions are
exact. The forward proof first obtains the int32 range from sign extension,
then uses encoding exactness only within that range. The reverse proof derives
the admitted conversion from truncation and the int64 bounds.
`cvtt_fits` establishes that every modeled conversion result is a signed
64-bit word, including the invalid sentinel.

Three eligibility conditions must remain separate:

- `int32Operand` accepts both zeros as integer zero. It is stricter than
  `toInt32Operand`, whose caller only needs the low 32 bits of an exactly
  converted integer. The latter's wider int64 admission rule is not this theorem.
- `integerRemainder` first rejects the raw negative-zero dividend, then admits
  int32 operands and rejects either divisor zero. `remainderEligible` records
  these separate conditions. Negative nonzero dividends divide, and an exact
  multiple reconstructs `-0`. `remainderResult` also specifies the signed-zero
  result required from the early fallback. General `rt.rem`/fmod correctness
  for fractions, infinities, coercions and large Numbers remains outside Lean.
- Only `maskableDivisor` supplies the literal argument to the static mask path.
  `static_guard_exact` adapts the coordinator's
  [pinned guard proof](https://github.com/40oleg/nona/issues/659#issuecomment-7101846990)
  and connects it to the bounded JavaScript bit conversions. The dividend must
  additionally pass int32 admission and be nonnegative; negative dividends
  branch to division. The mathematical `nonnegative_mask` theorem itself has
  no int32 or `2^30` bound. For example `2^31` is mathematically a valid power
  of two, but is excluded by the compiler's exact static eligibility policy.

Kernel-checked examples retain endpoints and adjacent out-of-range integers,
int64 invalid conversions, fractions, unordered comparison, both zeros and
infinities, plus concrete guard witnesses:

- `1.5` truncates to `1` but fails the round trip; omitting that comparison
  admits a fraction.
- Unordered comparison with NaN sets ZF without numerical equality. PF is
  required for the round-trip comparison law; with the specified sentinel the
  later int32 range check also rejects NaN, so PF is not independently necessary
  for this complete int32 sequence.
- `2147483648` and `-2147483649` round-trip as integers but fail sign extension;
  the round trip alone is insufficient for int32 admission. `-2^63` can also
  round-trip as the invalid sentinel and must fail the int32 range check.
- Integer `7.tmod 0 = 7` is not JavaScript `7 % 0` (NaN). Both signed divisor
  zeros require the runtime route.
- Zero passes the unbounded bit trick but is a zero divisor. Six is not a
  power of two: `6 & 5 = 4`, whereas `6 % 6 = 0`.
- Negative dividends invalidate the mask identity: `-7 & 7 = 1`, whereas
  truncating `-7 % 8 = -7`. For `-8`, the integer mask zero additionally loses
  the required Number `-0`.
- Converting an early `-0` dividend to integer zero loses the sign even before
  division. Positive-zero conversion of an exact negative multiple likewise
  loses the sign unless it is reconstructed.

### Machine and binary64 obligations

These are target correspondence obligations, not project axioms or
kernel-checked hardware theorems:

- [`x64/assembler.ts`](../src/backend/x64/assembler.ts) emits signed 64-bit
  CVTTSD2SI and CVTSI2SD (REX.W), UCOMISD, `48 99` (CQO) and 64-bit IDIV.
  We rely on truncation toward zero, the invalid-conversion sentinel with FP
  exceptions masked, binary64 exactness for int32 integers, comparison flags,
  two's-complement shifts, raw zero-sign observation, and signed division's
  quotient/remainder behavior. No exactness claim is made for arbitrary int64
  conversion to binary64 or for nondefault FP control modes.
- [`arm64/assembler.ts`](../src/backend/arm64/assembler.ts) overrides those
  operations. `fpToInteger` explicitly rejects NaN and values at least `+2^63`
  with the x64 sentinel, then uses FCVTZS; negative overflow relies on FCVTZS
  saturating to the signed minimum. SCVTF encodes admitted integers, FCMP and
  synthesized flags implement ordered/unordered comparison, and
  `signExtendRax` plus `divide128` implement signed division with magnitude
  division and sign restoration. Their encodings, register mapping, flag
  emulation, overflow/trap behavior and algorithmic correctness remain
  assumptions supported by sampled native tests, not Lean results.
- The host's binary64 decoding, Number tags, sign-bit loads, canonical model
  interpretation and runtime slow path remain outside the kernel model.
  In particular no assumption about machine instructions is hidden in the
  theorem audit. `ExactInt32Encoding` is a quantified theorem hypothesis.

### Production tests and evidence

[`tests/remainder.test.ts`](../tests/remainder.test.ts) compiles runtime
arguments with `runOnHost` and compares against `runOracle` (Node.js), observing
zero signs with `Object.is`. The proof-boundary test crosses int32 endpoints,
adjacent integers, fractions near endpoints, NaN, both infinities, both zeros,
int64 limits/overflow and extreme binary64 values with dynamic divisors. Literal
paths include `1`, `2`, `2^30`, and rejected `0`, `-0`, `-1`, `6`, `2^30+1`,
`2^31`, `1.5`. Negative exact multiples and `INT_MIN % -1` are included.
Focused emitted-code assertions check the early zero-sign guard, both operand
conversions, comparisons, sign-extension checks, dynamic zero rejection,
guarded masks, negative fallback, REX.W division and zero-sign reconstruction.
Assembly assertions establish emission evidence only, not native execution.

The file belongs to `core-runtime` in
[`tests/suites.json`](../tests/suites.json). The hosted
[`native-platforms` loader matrix](../.github/workflows/native-platforms.yml)
actually invokes `core-runtime` on Linux x64/ARM64, macOS x64/ARM64 and Windows
ARM64. The hosted [`check` workflow](../.github/workflows/check.yml) runs Windows
x64 regressions. The PR requires `full-ci` **before** its triggering push.
Do not infer native numeric coverage from an assembler-only job or a switch
suite that a target does not select.

Evidence available before this change is the coordinator's Windows x64
v0.36.0 baseline (162 Node comparisons, Object.is zero observation, package
SHA-256 recorded in the linked issue comment), at source/tag commit
`1eaeb279fdd7305f6dff21299be4e395a6a970ac`. It is not evidence for this revision
or ARM64. During #659 development, the standalone Numeric module passed the
shared pinned Lean 4.19.0 checker (`-j1 -DwarningAsError=true`), and all six
remainder tests passed on Windows x64 / Node 26.9.0 with GC stress off, CPU
mask 3 and test concurrency one. The new boundary matrix contains 728 observed
results. These checks used compiler source at the base commit above with the
#659 proof/test additions; they are local evidence, not hosted head validation.
The boundary test emits its native target, Node version and `GITHUB_SHA` into
hosted test logs so the execution evidence is tied to the checked-out revision.

Current-revision acceptance requires the pinned hosted Lake/axiom check and
the matching native regressions at the PR's exact tested SHA. Until those runs
complete, integrated validation is pending; ARM64 behavior is source-reviewed
and represented by assumptions, not newly observed hardware evidence. Retain
run URLs and tested SHAs in the PR validation record rather than replacing
them with a toolchain smoke result.

## An error the checker rejects

Suppose a buggy coalescing pass transforms:

```js
const t = a + b;
const x = t;
return t;
```

into an IR sequence which computes only `x = a + b` but still returns `t`.
With `a = 2`, `b = 3` and an old temporary-slot value of `0`, the original
returns `5` and the transformed sequence returns `0`.

`Nona/Examples.lean` proves that these results differ. Trying to prove their
equality with `by decide` fails with:

```text
error: tactic 'decide' proved that the proposition ... is false
```

The valid theorem requires the temporary to be absent from the live observation
list. The return observes it, so the theorem cannot justify this transformation.
Other checked counterexamples cover deleting a live constant and forwarding a
copy after its source has changed. Signed-zero tags and operand/destination
aliasing are also checked examples.

## Trusted boundary and limits

The TypeScript compiler does not call Lean during compilation. This is neither
translation validation of each emitted executable nor a verified extraction
of the production pass. `tests/ir-move-rules.test.ts` exercises the actual
TypeScript rules and guards, but those tests do not prove equivalence between
TypeScript and Lean.

The straight-line IR model excludes control-flow graphs, loops, exceptions, heap effects,
coercion side effects, mapped arguments, allocation/GC, code generation and
machine instructions. Abstract operators must be pure, total functions. The
production pass only coalesces constants and operations marked numeric, and
skips propagation in functions with `newArguments`. Those restrictions and
production CFG liveness are regression-tested, not formally proved here.
The coalescing theorem is slightly stronger than the production guard: it also
holds when source and destination coincide, although the production pass does
not perform that redundant rewrite.

The modeled DCE uses recursive backward liveness on one straight-line block;
the production pass uses CFG analysis and at most four elimination rounds.
The correspondence is a design argument, not a machine-checked refinement.
Extending this work requires formalizing these boundaries before claiming a
proof of the production optimizer or ECMAScript semantics.

## Planned coverage and acceptance criteria

[#653](https://github.com/40oleg/nona/issues/653) tracks these extensions:

- **Production move guards:** connect copy forwarding, dead writes and
  coalescing to the actual guards in [`src/ir/copies.ts`](../src/ir/copies.ts),
  including alias invalidation after redefinition, live temporaries, CFG
  liveness, numeric purity and mapped arguments. Extend the model where needed;
  the existing theorems alone do not establish this correspondence.
- **Int32 admission, remainder and masks:** implemented as the numeric model
  above in [#659](https://github.com/40oleg/nona/issues/659), with production
  correspondence and hardware boundaries stated separately. Retain integrated
  Lake and native CI evidence when changing these guarantees.
- **Dense switch dispatch:** establish agreement with JavaScript strict
  equality and case selection, including conversion and index-range guards,
  NaN, signed zero, duplicate cases and the identity of fractional cases.

For each covered rule, acceptance requires all of the following:

1. Name the Lean statement and its production counterpart, with explicit
   semantic assumptions, observations and excluded behavior. Model the relevant
   distinctions between values rather than assuming the desired JavaScript
   result of an abstract operator.
2. Explain how the production guards establish the theorem's preconditions,
   including target-specific conversion behavior where applicable. State which
   correspondence obligations are checked and which remain design arguments;
   do not claim a proof of production behavior while those obligations remain.
3. Keep a counterexample showing why a required guard or semantic distinction
   matters, and matching positive and negative regressions that exercise the
   actual production pass or compiler. Numeric and dispatch comparisons must
   include the relevant boundary values and equal and unequal fractions,
   including `case 1.5` versus default.
4. Pass the pinned Lake build and transitive axiom audit on the integrated
   revision, and run the matching production regressions. Kernel checking
   verifies the statements about the model; production tests check concrete
   executions of the implementation. Neither substitutes for the other.

Whenever a covered rule changes, review its assumptions, matching production
tests and Lean statement in the same PR, and update this specification to keep
the coverage and remaining boundaries accurate.

### Why the fractional switch experiment is insufficient

In [PR #286](https://github.com/40oleg/nona/pull/286), every nonintegral finite
Number collapses to a single abstract fraction value, and the modeled
fraction-to-fraction equality always returns false. Consider a switch with
`case 1.5`: JavaScript must select that clause for `1.5` and default for `2.5`.
The experimental equality instead sends both inputs to default, even though
the matching fractional clause exists.

Both sides of the experimental dispatch theorem use that same modeled
fallback. Proving that the two executions agree therefore cannot establish
JavaScript equality or correct case selection. Future dispatch coverage must
distinguish equal from unequal fractions and connect the fallback to production
strict equality, with matching Node/native comparisons. PR #286 was closed
without merging; its theorem claims are not part of the checked model above.

## Production validation remains required

[`tests/ir-move-rules.test.ts`](../tests/ir-move-rules.test.ts) calls the actual
TypeScript move passes on hand-built IR. It checks forwarding, invalidation,
operand/destination aliasing, observed temporaries (including a successor
block), exclusion of generic coercing operations and mapped arguments, and
preservation of selected Number/identity distinctions. These are production
regressions, not a proof of TypeScript/Lean correspondence.

[`tests/remainder.test.ts`](../tests/remainder.test.ts) compares native remainder
results with Node.js for sampled int32 and fallback inputs, including signed
zero, and inspects emitted assembly for a mask path.
[`tests/numeric.test.ts`](../tests/numeric.test.ts) includes binary64 special
values and exact-remainder examples.
[`tests/switch-table.test.ts`](../tests/switch-table.test.ts) compares native
dispatch with Node.js for dense integer cases and sampled noninteger and
non-Number inputs, and checks table eligibility and assembly. Its fractional
inputs do not establish the missing equal-fraction case-label guarantee from
PR #286. These finite checks exercise production code; they do not prove all
numeric or switch semantics.

Keep Node/native comparisons and OS integration checks for runtime, GUI,
network, FFI and packaging behavior. These remain outside the current Lean
model and require validation of actual native execution and OS interactions.
Full and long validation stays on hosted CI; this scope document does not
replace it with model verification.
