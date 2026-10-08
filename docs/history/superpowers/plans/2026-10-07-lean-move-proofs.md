# Lean move proof implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement inline.

**Goal:** Machine-check the IR move rules and a small dead-move optimizer.
**Architecture:** A standalone Lean package plus production pass regressions.
**Tech Stack:** Lean 4.19.0, TypeScript, Node.js 26, GitHub Actions.
**Spec:** ../specs/2026-10-07-lean-move-proofs-design.md

## Global constraints

English project text; no new runtime dependencies; no changes to compiler
behavior; no proof holes or user axioms; keep main unchanged and open one PR.

## Review focus

Source and destination redefinitions invalidate copies; live temporaries
prevent coalescing; destinations may alias operands; mapped arguments disable
propagation; opaque values preserve negative zero, NaN and object identity.

## Task 1: Proof package and pass correspondence

- [x] Add production IR regressions for forwarding, invalidation, dead/live
      moves, coalescing aliasing and mapped arguments.
- [x] Define slot states, expressions, instruction execution and live inputs.
- [x] State proof obligations before filling proofs; verify that the checker
      rejects unfinished proofs and an incorrect dead-write transformation.
- [x] Prove substitution, observational dead writes, destination coalescing,
      execution congruence and recursive dead-move optimizer correctness.
- [x] Build checked examples including counterexamples for missing guards.

## Task 2: Delivery and verification

- [x] Add a pinned proof CI job and local command.
- [x] Document usage, correspondence and the unverified boundary; update
      English/Russian READMEs and changelog.
- [x] Run Lean build, focused regressions and npm run check on Linux/Node 26;
      record pre-existing failures without changing unrelated runtime code.
- [x] Review the final diff, commit as helgus and open a PR closing #160.

## Validation record

Lean build and dependency audit pass. An isolated test with a theorem relying
on `Hidden.assumption : False` is rejected by the audit. An incorrect
coalescing equality is rejected by `decide`. All 14 focused IR/native-oracle
tests pass. A mutation that disables source-alias invalidation fails the new
source-redefinition test. The full Linux baseline run reports existing failures,
including tests explicitly compiling Windows PE images; its result must be
reported separately from the focused checks.

Independent whole-branch review found no remaining Critical/Important issues.
Future hardening: the automatic axiom scan targets the `Nona` namespace; proofs
added under other namespaces would need to be included in that scan.
