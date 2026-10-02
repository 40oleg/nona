# Working on Nona (for agents)

These rules apply to every agent (and person) that works on this repository.
Several agents may work on it in parallel, so follow the claiming rules
exactly.

## Issues

- Write issues, pull requests, commit messages, code comments and docs in
  **English**.
- Every piece of work starts from an issue. If there is none, create it first:
  motivation, proposal, acceptance criteria.
- **Claim an issue before you start**: add the `blocked` label ("Taken by an
  agent; do not start in parallel"). Never start an issue that already has the
  `blocked` label, even if it looks abandoned; ask the owner instead.
- Also add a type label (`enhancement`, `bug`, `documentation`, …).
- Remove `blocked` when you give the issue up. When the pull request is merged,
  the issue is closed by `Closes #N`.

## Commits

- Commit as the repository owner: author and committer `helgus
  <oleg.merkulov701@gmail.com>`.
- Do **not** add `Co-Authored-By`, `Claude-Session`, "Generated with" or any
  other agent/tool trailers or footers to commit messages or pull request
  descriptions. Such trailers make the agent appear as a repository
  contributor.

## Branches and pull requests

- **One issue — one branch — one pull request.** Do not mix issues in a PR.
- Branch name: `issue-<number>-<short-slug>`, e.g. `issue-21-timers`.
- Branch from `main`. If an issue really depends on an unmerged one, branch
  from that branch and say so in the PR description ("Depends on #N"); rebase
  once the dependency is merged.
- The PR description contains `Closes #N`, a summary of the design, how it was
  tested (Linux, Windows, which suites), and known limitations.
- Keep `main` green: do not merge a PR whose `check` workflow fails.
- Do not push to `main` directly and do not rewrite published history of other
  people's branches.

## Before opening a PR

- `npm run check` (build + full test suite). The CI runs it on Windows with
  Node.js 26; native PE tests only run on Windows, ELF tests on Linux.
- `npm run compare` when runtime behaviour visible to programs changes.
- Add tests next to the existing ones in `tests/` (`*.test.ts`). Prefer
  `runOnHost` with the Node.js oracle (`runOracle`) so the same test runs on
  both targets under `gcStress`.
- Update the documentation: `README.md` and `README.ru.md` for user-visible
  features, `docs/` for details (`docs/host-apis.md` for host APIs), and an
  entry under `## Unreleased` in `CHANGELOG.md` that links the issue.
- Update the documentation site pages under `site/src/` that describe the
  feature (reference pages generated from `docs/` are included automatically);
  runnable samples go to `site/samples/` and must pass `npm run check:samples`
  in `site/`.

## Code conventions

- The compiler is TypeScript (`src/`); runtime code is emitted as x86-64 via
  `RuntimeBuilder` (`src/runtime/*.ts`) or written as JavaScript preludes
  (`src/runtime/*-source.ts`) compiled into every executable.
- Preludes must not add top-level `var` bindings (the runtime has exactly two
  prelude globals). Wrap code in an IIFE and attach helpers to
  `__nonaRegexpVm`.
- Native runtime functions follow the Win64 ABI used by the rest of the runtime
  (shadow space, 16-byte alignment at calls, callee-saved registers). Functions
  that hold `Value`s across calls that may allocate must use `rootedFn`.
- Every new KERNEL32 import needs a Linux shim in
  `src/backend/linux/shims.ts`, or the ELF link fails.
- Keep generated executables free of external dependencies: no libc, no C
  toolchain, no bundled DLLs.
