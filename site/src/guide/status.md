# Status and roadmap

## Current release

**v0.10.0** — see the [changelog](/changelog). Nona is experimental: it has not had a security audit and is not a drop-in replacement for Node.js.

## Test262 audit

Full pinned Test262 on Windows x64 for v0.8.0 (`scripts/test262-audit.ps1 -Unit`, features from ES2020 and earlier plus the supported later ones such as the ES2022 class elements):

| Directory | Passed / applicable | Remaining failures |
| --- | --- | --- |
| `language/` | **22436 / 22492** (26 skipped) | 44 `eval`, 1 newer semantics, 11 other |
| `built-ins/` | **15868 / 15933** | 16 `eval`, 12 newer semantics, 37 other |
| `built-ins/Atomics` (agents) | **268 / 268** | — |
| `annexB/` | **996 / 1016** (8 skipped) | 20 `eval` |

The classification comes from `scripts/test262-summary.mjs`: "`eval`" tests call `eval` or `$262.evalScript` with source text Nona cannot know at compile time; "newer semantics" tests check behaviour from later editions (the `v` flag, numeric separators, `Promise.any`, …) under an old or missing feature tag. The unit suite runs on Windows and Linux in CI and compiles and executes real PE and ELF files, many under GC stress. How to run the audits is described on the [Test262](/reference/test262) page.

## Remaining failures

All "other" failures on Windows are classified:

- `built-ins/Function` (26): the function source comes from `toString` of objects at run time — the `eval` exception.
- `is-a-constructor` for `AsyncFunction`, `AsyncGeneratorFunction` and `GeneratorFunction`, and the async arrow `prototype` test (4): the Test262 harness builds source text at run time.
- Other realms (8): default prototypes from another realm ([#7](https://github.com/40oleg/nona/issues/7)).
- Classes created through `Function`, also in another realm (10, `language/expressions/class`): source text built at run time. The same tests through an `eval` alias count as `eval` failures.

The audit of v0.8.0 also found seven crashes (`Array.prototype.indexOf` on `Math` with an element, inherited and own keys of typed arrays) introduced with dense elements; they are fixed in [#119](https://github.com/40oleg/nona/issues/119), and the rerun of `built-ins/Array` and `built-ins/TypedArrayConstructors` after the fix (included above) passes them.

## Open work

- [#11](https://github.com/40oleg/nona/issues/11) — `eval` and `Function` with source computed at run time.
- [#7](https://github.com/40oleg/nona/issues/7) — default prototypes from other realms for prelude constructors.
- [#13](https://github.com/40oleg/nona/issues/13), [#36](https://github.com/40oleg/nona/issues/36) — dense array elements and hash tables for `Map`/`Set`.

The full list is on [GitHub](https://github.com/40oleg/nona/issues).

## Detailed reports

- [ES2020 status for 0.17–0.20](https://github.com/40oleg/nona/blob/main/docs/v0.17-v0.20-status.md) (Russian)
- [v0.6 status](https://github.com/40oleg/nona/blob/main/docs/v0.6-status.md)
- [Roadmap: V8-inspired plan and target architectures](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [Release roadmap 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/release-roadmap-0.4-0.20.md) (Russian)
