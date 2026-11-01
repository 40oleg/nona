# CI runners: GitHub-hosted validation

Full suites and long validation run on GitHub-hosted runners. This applies to
pull requests, pushes to `main` and manual runs, even when hosted jobs queue
and the owner's self-hosted runner is idle. The owner's PC is reserved for at
most three agents running small targeted checks with concurrency 1
([#620](https://github.com/40oleg/nona/issues/620)).

## How a Windows job picks its runner

`check.yml` (the `windows` shards and `windows-compare`) and `program-corpus.yml` (the Windows half of
`programs`) first run a small `route` job on `ubuntu-latest`. It runs
[`scripts/pick-runner.mjs`](../scripts/pick-runner.mjs). Both workflows set
`TRUSTED: "false"`, so it returns `windows-latest` without enabling local
overflow. Fork code also remains hosted. The `route` job summary records the
selected runner and reason.

The Test262 matrix jobs (eight short jobs) stay on GitHub-hosted runners: one
self-hosted runner would run them one after another.

## Optional overflow support (disabled)

The decision helper retains its overflow capability for a future owner-approved
policy change. Runner registration and secrets are preserved; neither enables
overflow while the workflows explicitly set `TRUSTED: "false"`.

1. Register the runner for this repository (Settings → Actions → Runners → New
   self-hosted runner, Windows x64) with the default labels `self-hosted`,
   `Windows`, `X64`.
2. Create a fine-grained personal access token for `40oleg/nona` with the
   repository permission **Administration: Read-only** (listing runners needs
   it; the run's own `GITHUB_TOKEN` cannot) and store it as the repository
   secret `RUNNER_STATUS_TOKEN` (Settings → Secrets and variables → Actions).
   Without the secret every job stays on GitHub-hosted runners.
3. Keep "Require approval for all external contributors" (Settings → Actions →
   General) enabled.

## What the machine needs

- Git. Node.js is installed per job by `actions/setup-node` (the version in
  the workflow's `NODE_VERSION`).
- Several gigabytes of free disk in the runner's `_work` directory.
- Enough memory for the tests it runs at once. `node --test` would run one
  test file per hardware thread, and every file compiles and runs native
  programs, so on a machine with many threads it runs out of memory.
  `scripts/run-shard.mjs` and `scripts/run-suite.mjs` therefore run 3 files at
  once on a self-hosted runner, as many as on a GitHub-hosted Windows runner
  ([#380](https://github.com/40oleg/nona/issues/380)). Set
  `NONA_TEST_CONCURRENCY` in the runner's environment (its `.env` file) to
  change it; with several runners on one machine, divide what the machine can
  take between them.
- No interactive crash dialogs: the tests deliberately crash child processes.
  Run the runner as a Windows service (`config.cmd --runasservice`), whose
  session shows no Windows Error Reporting dialogs, or set
  `HKCU\Software\Microsoft\Windows\Windows Error Reporting\DontShowUI` to 1
  for the runner's account. The `Record isolated Windows Node abort behavior`
  step, which changes these settings itself, runs only on GitHub-hosted
  runners.

## Closed pull requests

When a pull request is merged or closed, `cancel-closed.yml` cancels its
unfinished workflow runs (queued, waiting or running) so they stop holding
runners ([#373](https://github.com/40oleg/nona/issues/373)). It cancels only
runs started by `pull_request` events of that pull request's branch, never
runs of `main` (which check the merge commit) or of other branches. Pull
requests from forks are skipped: their token cannot cancel runs.

## Windows test shards

`check` runs the Windows test files in four parallel jobs, `windows (1/4)` …
`windows (4/4)` ([#370](https://github.com/40oleg/nona/issues/370)).
[`scripts/run-shard.mjs`](../scripts/run-shard.mjs) splits
`dist/tests/*.test.js` by the seconds per file in `tests/timings.json`, the
longest file first onto the least loaded shard, so every shard computes the
same split and each file runs once. `program-corpus*` is left out: the
`program corpus` workflow runs it on Windows. `windows-compare` runs the
Node.js comparison (`scripts/compare.mjs`) and the Test262 smoke manifest.

Locally, `node scripts/run-shard.mjs --shard 2/4 --list` prints a shard's
files. Each CI shard uploads `windows-test-timings-<n>` with the duration of
its files and prints its slowest ones. When the shards drift apart, download
the four artifacts and run
`node scripts/test-timings.mjs --write test-timings-*.json` to refresh
`tests/timings.json`. A new test file without an entry counts as the mean.

## Test262 directory jobs on pull requests

The eight `windows-<group>-test262` jobs of `check` run on every push to
`main`. On a pull request the `changes` job
([`scripts/ci-changes.mjs`](../scripts/ci-changes.mjs),
[#371](https://github.com/40oleg/nona/issues/371)) runs them only when the
pull request changes `src/`, the Test262 runner or the build scripts it uses,
`tests/test262*`, `package.json`, `package-lock.json`, `tsconfig.json` or
`check.yml`, or has the `full-ci` label; otherwise they show as skipped. When
the list of changed files cannot be read, they run.

## GC stress on pull requests

Oracle tests build their programs with `gcStress` (a collection on every
allocation), which makes them several times slower: six of the heaviest files
took 818 s under GC stress and 150 s without it on Linux. On a pull request
without the `gc-stress` label ([#372](https://github.com/40oleg/nona/issues/372)):

- the Windows shards run with `NONA_GC_STRESS_SCOPE=marked`: the files of
  `tests/gc-stress.json` (collector, roots, weak references, ropes) run as
  usual, every other file with `NONA_GC_STRESS=off`, which makes the code
  generator ignore `gcStress` (`src/backend/x64/codegen.ts`);
- the program corpus runs each program once, without GC stress.

`main` runs everything under GC stress, so a missing root still fails there
right after the merge. Local `npm run check` is unchanged.

### HTTP Agent lifetime witnesses

The real loopback programs in [http-agent.test.ts](../tests/http-agent.test.ts)
request GC stress. The [fixture policy](../tests/helpers/http-agent-policy.ts)
uses the same effective selection as `generate()`: only the exact environment
value `NONA_GC_STRESS=off` suppresses requested stress. Explicit non-stress
controls remain normal builds. The request passed to the compiler is never
changed to make a stress-labelled witness run normally.

Cleanup watchdogs are distinct from API timing assertions. The original 6000ms
cleanup guard remains in normal native builds and Node 26 oracles. Effective
forced-GC witnesses use the existing **180000ms per-program execution bound**
in [host.ts](../tests/helpers/host.ts), without an earlier cleanup timer. Neither
the host bound nor the dedicated control workflow's wrapper budget is increased.

This follows matched hosted Windows evidence supplied for
[run 41312762448, job 124866420275](https://github.com/40oleg/nona/actions/runs/41312762448/job/124866420275):
GC off passed; GC on reached the 6000ms watchdog in phase `hold`, at elapsed
42250ms, with phase starts `listen1:84,listen2:15858,hold:28606`. No queued
request had been created and no `/hold` request had been observed. Head `51e8`
retained the same fixture as source `fc024e026f6ce2e66f624d37bf6d9d9979886957`.
Exit 13 / unsettled await followed watchdog cleanup. This establishes a
startup/watchdog false positive, not a production GC-root defect; the host helper
already documents very slow initialization when collecting on every allocation.

Each original parameter tuple now runs in its own program: both global limits,
every assigned-write phase/action, every queued/deferred/socket cancellation,
peer close/refusal/Agent destruction, CONNECT and upgrade, retained contexts,
creation failure and idle timeout/unref. This avoids charging multiple real-I/O
scenarios to one forced-GC program bound. All original exact event, value,
status, stdout and stderr comparisons remain. Cross-origin non-stress controls
are retained; idle probes also have explicit non-stress native controls.

The forced-GC idle probes use public request/socket APIs and the Agent's public
`keepSocketAlive` hook, calling the original hook to preserve its pooling and
unref decision. Active requests use `timeout: 0`; the hook pauses the idle timer
until response/close, `setImmediate` and readiness logging finish. They then arm
the original **200ms idle eviction** or **2000ms unref exit** deadline. The fixture
never unreferences the client itself. Normal native controls and the Node oracle
keep the original unstaged fixture. The unref probe's socket timeout follows the
socket's reference state, so a missing Agent unref still fails the exit probe.

[Small Node/source regressions](../tests/http-agent-fixtures.test.ts) check the
actual code-generator selection prefix without native compilation, replay the
measured startup clock, cover each parameter tuple with exact Node transcripts,
run both idle variants, and show that a deliberately referenced real client
socket still reaches the unref watchdog. They supplement native coverage.

The dedicated retained-context controls keep their exact test name, source-head
recording, separate GC-off/on runs on hosted Windows/Linux, retained artifacts
and positive TAP guard (one actual passing witness; no skips/TODO/cancellation).
Fresh native proof for these edits remains pending: run those controls and the
complete Agent witnesses with requested stress on hosted Windows/Linux, followed
by required full CI. Keep PR #631 draft until that actual evidence is reviewed.
On the owner's PC, run only small Node/source/doc checks with concurrency 1;
never run native compilation/execution or a GC campaign for this repair.
