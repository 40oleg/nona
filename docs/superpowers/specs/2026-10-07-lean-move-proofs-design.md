# Lean proofs for IR move rules

Goal: add a runnable, machine-checked prototype related to `src/ir/copies.ts`.
The proof language models straight-line IR with slots, constants, copies and
pure unary/binary expressions. Values and operators are arbitrary parameters;
no integer identities are substituted for JavaScript Number semantics.

Prove expression read substitution when two slots hold equal values, deletion
of a dead assignment under live-slot observation, and producer/copy destination
coalescing when the temporary is dead. A recursive dead-move optimizer must
preserve observations for every program in the fragment, not just examples.

Pin Lean 4.19.0; use its standard library only. Build with warnings as errors,
include checked examples and counterexamples for missing guards, and report
axiom dependencies. Keep the TypeScript passes and runtime unchanged. Add
regression tests for the actual passes, a dedicated CI job, and documentation.

The correspondence between TypeScript and Lean is documented, not proved.
CFG liveness, mapped arguments, effects, exceptions, heap mutation, GC and
machine-code emission remain outside the formal guarantee.
