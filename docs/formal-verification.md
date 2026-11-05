# Formal verification prototype

`verification/` is a standalone Lean 4.19.0 project for the move rules used by
`src/ir/copies.ts`. It contains an interpreter, a dead-move optimizer and
machine-checked correctness theorems. It is an initial proof model, not a proof
of the entire Nona compiler or its TypeScript optimizer implementation.

## Run the checker

Install [Lean via elan](https://lean-lang.org/install/), then run from the
repository root:

```sh
npm run check:proofs
# Equivalent: lake -d verification build
```

The pinned `lean-toolchain` selects Lean 4.19.0. The project needs no Mathlib or
third-party proof packages. Node.js and elan are development tools; they are
not linked into compiled Nona programs. The `formal-verification` CI workflow
runs this same Lake build on pull requests and pushes to main.

The build treats warnings as errors, so proof holes (`sorry`/`admit`) fail.
`Nona/Audit.lean` also inspects transitive dependencies of every theorem in the `Nona` namespace
in the checked kernel environment. Only Lean's standard logical axioms
`propext`, `Classical.choice` and `Quot.sound` are allowed. Project-defined
axioms and `sorryAx` are rejected; the audit also prints the dependencies of
the main theorems. Examples use kernel-checked `decide`, not `native_decide`.

## What is proved

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

## Int32 fast paths of the code generator

`Nona/Int32Paths.lean` ([#284](https://github.com/40oleg/nona/issues/284))
models the int32 fast paths of the x64 code generator (also re-encoded for
ARM64) on an abstraction of binary64 values: NaN, the infinities, -0, finite
integers and non-integral finite values. The double-to-integer conversion is
a parameter (`Machine`) that only has to truncate in range, so every theorem
holds for both `cvttsd2si` (x86-64, an indefinite value out of range) and
FCVTZS (ARM64, saturating).

| Theorem                    | Guarantee                                                                                            | Production code                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `int32Operand_sound`       | The round-trip test accepts an int32 value with its value, and -0 as 0; nothing else                 | `int32Operand` in `src/backend/x64/integer-ops.ts`            |
| `integerRemainder_correct` | The inline `%` returns ECMA-262 `Number::remainder` whenever it does not call `rt.rem`               | `integerRemainder`                                            |
| `mask_needs_negZero_guard` | Without its -0 test, the masked `x % 2^k` would return +0 for -0 % 4                                 | the -0 test of the mask path                                  |
| `mask_is_remainder`        | `n & (2^k - 1)` is the truncated remainder of a non-negative `n`                                     | the mask path                                                 |
| `dispatch_eq_chain`        | Jump-table dispatch of a dense `switch` selects the same case as the chain of `===`, for every value | `emitSwitchTable`, `switchTable` in `src/ir/lower/control.ts` |

`integerRemainder_correct` holds whether or not the divide path tests for a
-0 dividend: that path takes the sign of a zero remainder from the
dividend's bits, which -0 has set. The divide path therefore has no -0 test;
only the mask path keeps one. `dispatch_eq_chain` assumes
`-2^31 < low` and `low + length ≤ 2^31`, which `switchTable` guarantees by
admitting only case values with `|v| < 2^31`.

The model is of the instruction sequence, written by hand from the emitter;
it is not extracted from the TypeScript, and the encodings of the
instructions are trusted.

## Trusted boundary and limits

The TypeScript compiler does not call Lean during compilation. This is neither
translation validation of each emitted executable nor a verified extraction
of the production pass. `tests/ir-move-rules.test.ts` exercises the actual
TypeScript rules and guards, but those tests do not prove equivalence between
TypeScript and Lean.

The model excludes control-flow graphs, loops, exceptions, heap effects,
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
