# Formal verification scope and acceptance criteria

`verification/` is a standalone Lean 4.19.0 project for the move rules used by
`src/ir/copies.ts`. It contains an interpreter, a dead-move optimizer and
machine-checked correctness theorems. It is an initial proof model, not a proof
of the entire Nona compiler or its TypeScript optimizer implementation.

The owner's coverage decision is to retain this checked model and extend proofs
to production guard correspondence and selected numeric fast paths under
[#653](https://github.com/40oleg/nona/issues/653). The IR correspondence model
described below is added by [#658](https://github.com/40oleg/nona/issues/658);
numeric arithmetic and switch proofs remain planned. The earlier experiment
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
runs this same Lake build on pull requests and pushes to main. Separate hosted
Windows/Linux jobs execute the three move/liveness regression files serially,
with and without GC stress, at normal and pinned-local thresholds. Full
production validation continues in the other required workflows.

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

## Production IR correspondence

[`Nona/ProductionMoves.lean`](../verification/Nona/ProductionMoves.lean) retains
the original guarantees and adds the following checked obligations. Names below
have the prefix `Nona.Production`. This is a model of the production guards and
their semantic contracts, not verified extraction of `copies.ts`.

### Operation and observation contracts

`Op` lists every operand occurrence and every definition. A flag identifies
whether rewriting supports each operand field; unrewritten fields remain actual
reads for liveness. `args` evaluates all reads in the incoming state; `exec`
then writes only `defs`, using those old values. Definitions may overlap reads
and include multiple slots. `events` records a deterministic observable trace
from the same operand values. `exec_frame` derives the unchanged-slot contract.

`producer` constructs a single-destination operation with a total pure value
function and an empty event trace. Silence and its write frame follow from
the constructor; no preservation proposition is an operation field. `Item.pure`
admits these producers to modeled DCE; `Item.keep` retains unsupported operations
even when their destinations are dead. Production's constants, copies, TDZ
markers, `globalObject`, `isFunctionCode`, noncoercing tests and numeric
operations must meet this contract to justify their `pure` classification.
Their implementations and numeric annotations remain trusted admission
obligations. Effectful operations can participate in forwarding/continuations
under `Op`'s read/event/write contract, but cannot be deleted or coalesced as
arbitrary `Item.keep` operations.

Values remain arbitrary, including object identity, NaN distinctions, signed
zero and uninitialized markers. No arithmetic identity is used. Abstract event
traces are not implementations of heaps, coercion, exceptions, allocation or GC.
Implicit frame aliases and other unmodeled effects require a richer contract
before claiming a production semantic proof.

`producer_exec` connects the constructor to a single old-state write;
`copy_producer_exec` specializes it to reading exactly the source slot. Its
fallback value only totalizes malformed operand lists and is never read by
the constructed singleton-operand copy.

### Theorem, guard and regression map

Tests below are in
[`ir-move-rules.test.ts`](../tests/ir-move-rules.test.ts) unless linked otherwise.
“Existing” identifies coverage retained from before #658; “new” identifies #658
additions.

| Checked statement                                                           | Production guard or obligation                                                                                                                                                                               | Matching coverage                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `empty_valid`, `resolve_valid`                                              | Empty map at each block entry; one-hop resolution asserts equality now, not equality with an old source value.                                                                                               | Existing forwarding; new alias-chain/block-isolation test, including a successor reached with a still-valid predecessor alias.                                                                                                              |
| `invalidate_valid`, `insert_valid`, `copy_update_valid`                     | Delete keys and aliases targeting every definition; insert only non-self copies, using the already-resolved source. The new equality is derived from the write.                                              | Existing source/destination redefinition; new key/target invalidation for both `getIterator` outputs, `iteratorStep.dest/done`, `yieldDelegated.dest/mode`.                                                                                 |
| `rewrite_args`, `rewrite_correct`, `operation_update_valid`, `forward_step` | Rewrite supported operands before invalidation. Equality of operand values derives execution/event equality; invalidation follows from the write frame.                                                      | Existing operand/destination aliasing; new supported-field and unrewritten-use tests, including invoke receiver/newTarget/arguments, object values/elements and unchanged literal keys.                                                     |
| `forward_block_correct`, `block_terminator_correct`                         | Induction derives validity through a whole block; final aliases rewrite branch/switch/return/throw observations. Successors start anew.                                                                      | Existing forwarded return; new four terminator cases, chains and block isolation. Return sentinel `-1` has no slot observation.                                                                                                             |
| `args_congr`, `transfer_correct`                                            | Kill all definitions, then add all reads, including same-slot operands. Derive equal live outputs, events and pre-operation handler observations.                                                            | New secondary-definition/same-slot checks. Existing [liveness tests](../tests/liveness.test.ts): overwritten destinations, call roots, property mutation and callee/destination aliasing.                                                   |
| `floor_transfer_correct`, `effective_dead`                                  | Effective liveness is `slot < liveFloor                                                                                                                                                                      |                                                                                                                                                                                                                                             | set.has(slot)`. Dead destinations are at/above the floor and absent from the set. | New pinned-local/dead-temporary test; hosted threshold 0 runs exercise compact floor sets. |
| `continuation_correct`, `continuation_handlers`, `boundary_observations`    | Backward inputs imply equal continuation outputs/traces and handler observations before each operation. Boundary covers terminator reads and normal/exception successor entries, including back edges.       | Existing live temporary locally/at a successor; new terminator and exception/loop-successor tests. Existing liveness back-edge test needs a multi-block fixed point.                                                                        |
| `dead_producer_continuation`, `eliminate_correct`                           | Remove a silent single-write producer only if dead before the continuation. A round consults the original suffix, not its already-optimized suffix.                                                          | Existing dead constants/live `-0`; new eligibility table covers all five removable kinds, noncoercing unary tests, strict equality and numeric unary/binary. Generic arithmetic, loose equality, loads, getters and calls remain.           |
| `bounded_dce_correct`                                                       | Recompute liveness from each changed program and repeat a proved round any finite number of times, including four. No round-preservation hypothesis. Early stopping is sound; a fixed point is not promised. | New bounded-DCE test: six dependent producers leave two after one invocation and none after another.                                                                                                                                        |
| `coalesce_producer_continuation`                                            | Exact adjacent shape `temp = producer; dest = temp`, matching source, pure producer and effectively dead temporary before the continuation. Reads use the old state even if dest is an operand.              | Existing aliased destination/live temporary/generic-coercion tests; new positive constant/numeric unary/binary cases and negative adjacency/source/self-copy/eligibility cases. Production skips self-copy although the algebra permits it. |

The production DCE eligibility test explicitly covers `copy`, `constant`,
`uninitialized`, `globalObject`, `isFunctionCode`, unary `!`, `typeof`,
`isNullish`, `typeofIs:`/`typeofNot:`, binary `===`/`!==`, and `numeric: true`
unary/binary operations. Coalescing admits only constants or numeric unary/binary
producers; being removable by DCE alone does not make a producer eligible.

The new native comparison, “native move observations match Node for mutation,
coercion, identity and signed zero”, compiles and executes JavaScript through
`runOnHost` and compares it with `runOracle`, checking both successful exit and
output. Observations include copy-chain mutation, source snapshots, mapped
arguments, catch/loop boundaries, iterator/delegation traces, coercion order/count,
NaN, object identity, `Object.is(-0)` and reciprocal zero signs. It supplements
the existing native [`ir-optimizations` tests](../tests/ir-optimizations.test.ts):
“forwarded copies observe every later write” (swaps, snapshots, mapped/strict
arguments, destructuring, try/finally, closures), “Number operations keep
JavaScript semantics when types change” and numeric annotation checks. The old
hand-inspected returned-value fixture remains structural coverage; it is not
counted as native execution.

`newArguments` bypasses only `propagateCopies`, including its DCE rounds. The
existing mapped-arguments test pins that bypass; production checks only the
kind, so unmapped `newArguments` also bypasses it. Coalescing has no matching
bypass: a new positive case coalesces after `newArguments`. It still requires
the single-write/read-before-write contract, including backend behavior for
mapped parameter destinations.

### Checked boundaries and remaining correspondence gaps

The alias proofs use a functional map; production uses JavaScript `Map`.
Key/target deletion and resolution have the same specified meaning, but no
theorem verifies JavaScript iteration or translates `rewriteUses`, `definitions`
and `operationUses` exhaustively. Tests pin selected fields and all current
multi-definition kinds. Lowering must provide valid slots, complete reads/writes
and valid metadata. Simultaneous modeled writes do not establish backend
ordering for iterator/generator outputs.

Continuation proofs cover finite block suffixes with supplied observations.
`continuation_handlers` checks handler agreement before every instruction;
`boundary_observations` projects agreement to successors/terminators/handlers.
The production CFG fixed-point solver is unverified. Loop convergence, successor
union, exceptional-entry inclusion, handler slot conventions and correspondence
of snapshots to these predicates remain trusted and regression-tested. There
is no operational exception semantics or proof over arbitrary looping CFG
executions. Modeled DCE keeps the supplied boundary fixed across rounds;
production recomputes whole-CFG boundaries, which must satisfy the stated
obligations each time.

Coalescing proves the exact adjacent pattern and its continuation, not arbitrary
instruction reordering. Its constant/numeric-only restriction establishes the
intended pure producer contract by a design argument. Numeric annotation
soundness in `numbers.ts`, backend operand ordering and nonthrowing/no-coercion
behavior remain unverified. Propagation retains unrewritten reads through
liveness; its `newArguments` bypass excludes implicit parameter mutation.
Concrete heap callbacks, allocation/GC and implicit effects remain outside the
semantics. These are admission assumptions, not assumptions that alias updates,
dead-write removal or coalescing preserve observations.

Both the default `Nona` Lake target and `Audit.lean` import every new module.
The transitive audit includes all helper theorems and checked examples under
`Nona`. The new proofs use no holes, new axioms or `native_decide`.

## Trusted boundary and limits

The TypeScript compiler does not call Lean during compilation. This is neither
translation validation of each emitted executable nor a verified extraction
of the production pass. `tests/ir-move-rules.test.ts` exercises the actual
TypeScript rules and guards, but those tests do not prove equivalence between
TypeScript and Lean.

The original model excludes control-flow graphs, loops, exceptions, heap effects,
coercion side effects, mapped arguments, allocation/GC, code generation and
machine instructions. Abstract operators must be pure, total functions. The
production pass only coalesces constants and operations marked numeric, and
skips propagation in functions with `newArguments`. Those restrictions and
production CFG liveness remain regression-tested, not formally proved here.
The extension checks the local contracts and boundary obligations above.
The coalescing theorem is slightly stronger than the production guard: it also
holds when source and destination coincide, although the production pass does
not perform that redundant rewrite.

The original modeled DCE uses recursive backward liveness on one block. The
extension additionally proves finite recomputed rounds under explicit contracts.
Connecting production CFG sets, operation implementations and numeric annotations
to those contracts remains necessary before claiming a proof of the production
optimizer or ECMAScript semantics.

## Planned coverage and acceptance criteria

[#653](https://github.com/40oleg/nona/issues/653) tracks these extensions:

- **Production move guards:** #658 checks the local obligations above for
  copy forwarding, dead writes and
  coalescing to the actual guards in [`src/ir/copies.ts`](../src/ir/copies.ts),
  including alias invalidation after redefinition, live temporaries, CFG
  liveness, numeric purity and mapped arguments. Full CFG/implementation
  correspondence and the listed semantic admission obligations remain open.
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
