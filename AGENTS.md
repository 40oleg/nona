# Working on Nona (for agents)

These rules apply to every agent (and person) that works on this repository.
Several agents may work on it in parallel, so follow the claiming rules
exactly.

## Issues

- Write issues, pull requests, commit messages, code comments and docs in
  **English**.
- Every piece of work starts from an issue. If there is none, create it first:
  motivation, proposal, acceptance criteria.
- Before starting an issue, look at its Development box and the PRs that
  mention it. If a merged PR already resolves it, close it with a link to that
  PR instead of starting work; if a merged PR did part of it, continue from
  what its PR description and the issue comments list as remaining.
- **Claim an issue before you start**: add the `blocked` label ("Taken by an
  agent; do not start in parallel"). Never start an issue that already has the
  `blocked` label, even if it looks abandoned; ask the owner instead.
- **Every issue and every pull request has a type label and a milestone.**
  Give it exactly one type label when you create it: `bug`, `enhancement` or
  `documentation` (releases and docs-only work are `documentation`). Add
  `complex` for large work. Set the milestone of the version it is planned for
  (`vX.Y.0`; create the milestone if it does not exist yet). The pull request
  takes the type label and milestone of its issue.
- When the issue is closed, its milestone must be the release that ships it:
  if it is merged after the planned version was released, move the issue and
  the pull request to the next open milestone. Close a milestone when its
  release is published.
- Remove `blocked` when you give the issue up and when the issue is closed
  (merged or not). When the pull request is merged, the issue is closed by
  `Closes #N`; check that it is closed and has no `blocked` label left.

## Commits

- Commit as the repository owner: author and committer
  `helgus <oleg.merkulov701@gmail.com>`.
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
- The PR description contains a summary of the design, how it was tested
  (Linux, Windows, which suites), and known limitations, and links every issue
  it works on, one line each:
    - `Closes #N` when the PR completes the issue. GitHub then lists the PR in
      the issue's Development box and closes the issue when the PR is merged.
    - `Part of #N` when it does only part of it. After the merge, comment on the
      issue with the PR link, what was done and what remains, and remove
      `blocked` unless you continue with it.
- GitHub closes issues only for PRs merged into `main`, and it closes (not
  retargets) a PR whose base branch is deleted. Before merging a PR, retarget
  every PR stacked on its branch to `main`; merge stacked PRs into `main`, not
  into each other's branches.
- After a merge, check that every `Closes` issue is closed; if not, close it by
  hand with a link to the PR.
- Keep `main` green: do not merge a PR whose `check` workflow fails. When a
  platform suite fails on `main` after a merge, fix or revert that first.
- Do not push to `main` directly and do not rewrite published history of other
  people's branches.

## Before opening a PR

- `npm run format` (Prettier, 4-space indent; `.prettierignore` lists the
  generated files). CI fails when `npm run format:check` does.
- `npm run check` (build + full test suite). The CI runs it on Windows with
  Node.js 26; native PE tests only run on Windows, ELF tests on Linux.
- CI on a pull request runs `check`, `program corpus`, `formal-verification`
  and `pages`. The platform suites (`native-platforms`: arm64, macOS, Linux
  distributions, BSD; `self-hosting`) run on `main` after the merge, on the
  last commit of a burst of merges, and on a pull request only with the
  `full-ci` label. Add `full-ci` when a change touches code generation or the
  runtime of a target other than linux-x64 and win32-x64, the loaders,
  self-hosting or packaging (#353).
- The Test262 directory jobs of `check` (`windows-<group>-test262`) run on a
  pull request only when it changes `src/`, the Test262 runner, package files
  or `check.yml`, or has `full-ci` (#371). The label is read when the run
  starts: add it before pushing, or push again after adding it.
- On a pull request, CI runs the test files without GC stress except those in
  `tests/gc-stress.json`, and the program corpus once without it (#372); `main`
  runs everything under GC stress. Add the `gc-stress` label (before pushing)
  when a change touches the collector, GC roots, `rootedFn`, allocation or the
  runtime's native code. Local `npm run check` keeps GC stress everywhere.
- `npm run check:doc-links` when you change Markdown documents or site pages
  (relative links and anchors).
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
- When you change an English site page, update its translations under
  `site/src/<locale>/` too, or at least keep them consistent with it (see
  `site/README.md`).

## Releases

- A release bumps the version in `package.json`, moves the `## Unreleased`
  entries of `CHANGELOG.md` under the new version and tags `vX.Y.Z`.
- **Refresh `PERFORMANCE.md` for every release.** Re-run the benchmarks
  (`node bench/run.mjs`, protocol in `bench/README.md`) against the current
  Node.js, Deno and Bun on one machine, add a dated section for the new
  version at the top of `PERFORMANCE.md` (machine, runtime versions, commit),
  and mark the section it replaces _superseded_. Keep the old sections.
- Update the figures quoted elsewhere to the new measurement: `README.md`,
  `README.ru.md` and the site's performance pages under `site/src/` (the
  translated pages at least link the new numbers).

## Code conventions

- The compiler is TypeScript (`src/`); runtime code is emitted as x86-64 via
  `RuntimeBuilder` (`src/runtime/*.ts`) or written as JavaScript preludes
  (`src/lib/runtime/*.js`, and `node:*` modules in `src/lib/modules/*.js`;
  `src/runtime/*-source.ts` export them) compiled into every executable.
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
  Exception authorized by the owner: macOS may link the operating system's
  `/usr/lib/libSystem.B.dylib` for native startup and OS services. This does not
  permit a bundled library, JavaScript interpreter, or C toolchain dependency.
