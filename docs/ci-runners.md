# CI runners: GitHub-hosted with a self-hosted overflow

The Windows jobs are the slowest part of CI and GitHub runs only a few of them
at a time, so a burst of pull requests queues them for hours. The owner's
self-hosted Windows runner takes the overflow.

## How a Windows job picks its runner

`check.yml` (the `windows` shards and `windows-compare`) and `program-corpus.yml` (the Windows half of
`programs`) first run a small `route` job on `ubuntu-latest`. It runs
[`scripts/pick-runner.mjs`](../scripts/pick-runner.mjs), which looks at the
repository's runners and at the jobs of other workflow runs that wait for a
runner, and gives the Windows job one of two `runs-on` values:

- the self-hosted runner (`[self-hosted, Windows, X64]`) when at least one
  `windows-latest` job is already waiting for a GitHub-hosted runner, the
  self-hosted runner is online and idle, and no other job waits for it;
- `windows-latest` otherwise.

The job summary of `route` says which one it chose and why. Pushes to `main`,
manual runs and pull requests from branches of this repository may use the
self-hosted runner. **Pull requests from forks always stay on GitHub-hosted
runners**: the repository is public, and the self-hosted runner executes
whatever the workflow checks out on the owner's machine. Any API failure also
keeps the job hosted.

The Test262 matrix jobs (eight short jobs) stay on GitHub-hosted runners: one
self-hosted runner would run them one after another.

## Setup

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
