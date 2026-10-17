# CI runners: GitHub-hosted with a self-hosted overflow

The Windows jobs are the slowest part of CI and GitHub runs only a few of them
at a time, so a burst of pull requests queues them for hours. The owner's
self-hosted Windows runner takes the overflow.

## How a Windows job picks its runner

`check.yml` (the `windows` job) and `program-corpus.yml` (the Windows half of
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
