# Prepared PR: Completeness and readiness audit for v0.20.0

This is a local handoff for the single issue-394 PR to `main`. No push or PR
creation is authorized in this step. Retain the current work branch for this
handoff; resolve its harness-selected `nona/issue-394` name before publication
if repository branch naming requires it. The text below is the prepared body.

## Summary

Nona's public compatibility claims span different compiler versions, platform
coverage and test denominators. Add a commit-pinned audit that distinguishes
working samples, partial APIs, intentional AOT constraints and unknowns, so
users can assess a concrete workload before migration.

- Publish `docs/completeness-audit.md`, a validated 140-row capability/API
  inventory covering 42 module entry points and all eight targets, and a
  bounded roadmap with evidence, severity, workarounds and acceptance tests.
- Add opt-in pinned package/API probes, explicit compile/run outcomes,
  Test262 denominator accounting and retained evidence. Keep them outside
  heavyweight default runs. The baseline is
  `453418c167b9b34cd5ff7c0f748674e79222e1cc`; the frozen release comparison
  is v0.18.0. A dated addendum records the later v0.19.0 release without
  substituting its artifacts or claiming v0.20.0 is released.
- Publish the report through docs/site navigation, update English/Russian
  README claims and all nine localized module entry points. Use the same
  canonical module path for browser/Node playground image comparisons.
- Retain the independent review, corrections and final re-review in
  `docs/completeness-review.md`, with exact reviewed report/matrix hashes
  distinct from the compiler baseline.

Closes #394

## Verification and review

Windows 11 x64, Node 26.9.0, TypeScript 7.0.2 and Prettier 3.9.10. Final
commands/results are retained in `docs/evidence/completeness/step6-finalization.json`;
`docs/completeness-review.md` records the independent commands, outcomes and
exact report/matrix hashes. **Final independent verdict: accepted for the local
audit and PR handoff; RV1/RV2 resolved, no material review finding remains.**
The reviewer checks underlying sources, repeats material Windows/WSL checks
and adds a fresh GC-stress interaction sample. Acceptance concerns this audit's
claims, not general compiler or security assurance.

- Fresh compiler build; strict inventory/Git-object validation; focused
  `completeness-inventory`, `completeness-probes` and `suites` tests with
  `--test-concurrency=2` (**14 pass, zero failures/skips**); bounded package/API
  and eight-file Test262 checks (**six runtime and two compile-only passes**).
- Sequential production documentation build with page concurrency two,
  repository/local link checks (**718 generated-site repository links**),
  Prettier and whitespace checks. Fresh browser/Node playground comparisons
  pass for **18 images across eight targets**, plus the syntax diagnostic.
- Earlier step-5 site sample compilation passes and remains dated evidence;
  no sample/compiler code changed in finalization.
- Linux coverage is Windows-built x64 ELF execution in Ubuntu 22.04.3 WSL2,
  without CPU emulation or a Linux Node oracle/compiler-host build. Six other
  targets were not executed locally; artifact emission and historical CI
  remain separately scoped evidence.

The full test suite (`npm run check`/`npm test`), full Test262/corpus/platform/
bootstrap, `compare`, Lean rebuild and benchmarks were not rerun locally under
the explicit shared-machine resource limit. Heavy commands were sequential;
parallelism was capped at two. No compiler/runtime/loaders/self-hosting/
packaging change requires `full-ci` or `gc-stress` for this audit diff.

## Performance coordination

Keep #392 with its existing owner. The 2026-10-18 21:48 UTC observation links
its open [PR #395](https://github.com/40oleg/nona/pull/395), head
`f9cb33f718062694064d2d01affeed1f2d708e67`, whose proposed report describes
Linux x64 measurements at the audited compiler SHA. Reference its methods and
results as an unmerged external proposal; do not duplicate benchmarks or
present its ratios as independently reproduced here. The checkout's older
`PERFORMANCE.md` remains historical evidence with explicit comparability limits.

## Limitations and CI handoff

fs-extra, Undici and workerpool compile but fail in the recorded Windows
samples; fs-extra also fails in WSL2 Linux x64. Their first failing internal
operations remain unknown. Package samples do not establish package-wide npm
compatibility. Transitive fixture installation bytes were not reauthenticated
in review. Untested API/options, six local target executions, long-lived
memory/network behavior, TLS/FFI assurance, release-archive provenance and
notices, and current comparable performance remain explicit limitations or
separately scoped follow-ups.

There is **no audit-branch PR CI result yet** because this work is unpushed.
At the recorded 21:48 UTC check, later main `0dbf4c5f` has successful check,
program corpus, formal-verification, pages and self-hosting runs, with
native-platforms still running. Those results do not validate this branch.
The audited `453418c1` check failed on temporary-directory cleanup and its
platform run was cancelled; retain those observations. After publication,
require the applicable PR workflows, including a green `check`, before merge.
No merge or manual issue closure is performed by this handoff.
