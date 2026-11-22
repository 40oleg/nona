# Formal verification scope and acceptance criteria

`verification/` is a standalone Lean 4.19.0 project for the move rules used by
`src/ir/copies.ts`. It contains an interpreter, a dead-move optimizer and
machine-checked correctness theorems. It is an initial proof model, not a proof
of the entire Nona compiler or its TypeScript optimizer implementation.

The owner's coverage decision is to retain this checked model and extend proofs
to production guard correspondence and selected numeric fast paths under
[#653](https://github.com/40oleg/nona/issues/653). Those extensions are planned,
not established by the current Lean project. The earlier experiment
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

## Planned coverage and acceptance criteria

[#653](https://github.com/40oleg/nona/issues/653) tracks these extensions:

- **Production move guards:** connect copy forwarding, dead writes and
  coalescing to the actual guards in [`src/ir/copies.ts`](../src/ir/copies.ts),
  including alias invalidation after redefinition, live temporaries, CFG
  liveness, numeric purity and mapped arguments. Extend the model where needed;
  the existing theorems alone do not establish this correspondence.
- **Int32 admission, remainder and masks:** specify target conversion
  assumptions, int32 endpoints, NaN and signed zero; establish the sign of a
  zero remainder and the conditions under which a power-of-two mask preserves
  remainder semantics. In particular, a mask must not lose a required negative
  zero result.
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
