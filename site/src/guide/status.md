# Status and roadmap

## Current release

**v0.12.0** — see the [changelog](/changelog). Nona is experimental: it has not had a security audit and is not a drop-in replacement for Node.js.

## Test262 audit

The last full pinned Test262 audit, on Windows x64 for v0.8.0 (`scripts/test262-audit.ps1 -Unit`, features from ES2020 and earlier plus the supported later ones such as the ES2022 class elements):

| Directory                    | Passed / applicable            | Remaining failures                      |
| ---------------------------- | ------------------------------ | --------------------------------------- |
| `language/`                  | **22436 / 22492** (26 skipped) | 44 `eval`, 1 newer semantics, 11 other  |
| `built-ins/`                 | **15868 / 15933**              | 16 `eval`, 12 newer semantics, 37 other |
| `built-ins/Atomics` (agents) | **268 / 268**                  | —                                       |
| `annexB/`                    | **996 / 1016** (8 skipped)     | 20 `eval`                               |

The classification comes from `scripts/test262-summary.mjs`: "`eval`" tests call `eval` or `$262.evalScript` with source text Nona cannot know at compile time; "newer semantics" tests check behaviour from later editions (the `v` flag, numeric separators, `Promise.any`, …) under an old or missing feature tag. The unit suite runs on Windows and Linux in CI and compiles and executes real PE and ELF files, many under GC stress. How to run the audits is described on the [Test262](/reference/test262) page.

## Array change-by-copy methods

Checked after the audit against the pinned revision (Windows x64, [#308](https://github.com/40oleg/nona/issues/308)): `built-ins/Array/prototype/{toSorted,toReversed,toSpliced,with}` and `Symbol.unscopables` pass 94 of 94 with no remaining failures. The `%TypedArray%` variants are not implemented; see the [Test262 baseline](https://github.com/40oleg/nona/blob/main/docs/test262.md).

## Remaining failures

These are the failures of the v0.8.0 audit; later releases have not repeated the full run. All "other" failures on Windows are classified:

- `built-ins/Function` (26): the function source comes from `toString` of objects at run time — the `eval` exception.
- `is-a-constructor` for `AsyncFunction`, `AsyncGeneratorFunction` and `GeneratorFunction`, and the async arrow `prototype` test (4): the Test262 harness builds source text at run time.
- Other realms (8): default prototypes from another realm ([#7](https://github.com/40oleg/nona/issues/7), closed after the audit).
- Classes created through `Function`, also in another realm (10, `language/expressions/class`): source text built at run time. The same tests through an `eval` alias count as `eval` failures.

The audit of v0.8.0 also found seven crashes (`Array.prototype.indexOf` on `Math` with an element, inherited and own keys of typed arrays) introduced with dense elements; they are fixed in [#119](https://github.com/40oleg/nona/issues/119), and the rerun of `built-ins/Array` and `built-ins/TypedArrayConstructors` after the fix (included above) passes them.

## Open work

Language and library gaps:

- [#11](https://github.com/40oleg/nona/issues/11) — `eval` and `Function` with source computed at run time.
- [#44](https://github.com/40oleg/nona/issues/44) — Promise reactions: a dedicated promise kind and one record per `then`.

Performance, the main line of the [roadmap](https://github.com/40oleg/nona/blob/main/docs/roadmap.md):

- Calls and allocation: [#47](https://github.com/40oleg/nona/issues/47) (call overhead), [#48](https://github.com/40oleg/nona/issues/48) (short-lived objects), [#235](https://github.com/40oleg/nona/issues/235) (inlining), [#236](https://github.com/40oleg/nona/issues/236) (scalar replacement).
- Generated code: [#237](https://github.com/40oleg/nona/issues/237)–[#242](https://github.com/40oleg/nona/issues/242) (optional chaining, `%`, direct calls, typed-array loops, `switch` jump tables, dead-zone checks).
- Library: [#155](https://github.com/40oleg/nona/issues/155) (`JSON.stringify`), [#258](https://github.com/40oleg/nona/issues/258) (RegExp start scan), [#262](https://github.com/40oleg/nona/issues/262) (`shift` and `splice` on large arrays).

The full list is on [GitHub](https://github.com/40oleg/nona/issues).

## Detailed reports

- [ES2020 status for 0.17–0.20](https://github.com/40oleg/nona/blob/main/docs/status.md) (Russian)
- [Release history](/changelog) and the [development log](https://github.com/40oleg/nona/blob/main/docs/history/development-log.md) (Russian)
- [Roadmap: V8-inspired plan and target architectures](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [Release roadmap 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/history/release-roadmap-0.4-0.20.md) (Russian)
