# AbortSignal timeout investigation (#632)

Status: **unresolved; PR #624 remains held**. This branch adds public compiler
coverage and a runnable hosted comparison. It does not establish a Darwin root
cause or claim a runtime repair. Use `Part of #632`, not `Closes #632`, until the
remaining native evidence and repair are reviewed.

## Exact revisions and existing evidence

| Case                    | Source commit                              | Tree                                       |
| ----------------------- | ------------------------------------------ | ------------------------------------------ |
| Earlier main            | `23c5c90d330e488539385ab213e996bb4c4d6457` | `6837ba4fdd8f2497d72ccae222e0156479876400` |
| PR #624 head            | `9fd6dc4e8f2b012f08e9d68c30a10f04c3e852e8` | `121c2ad607a83c093027b438b6dabb40ac575503` |
| Actual failing checkout | `dbeb6c23a79d6d8be49d36684d6dd62029edb691` | `121c2ad607a83c093027b438b6dabb40ac575503` |

The failing [Darwin ARM64 job](https://github.com/40oleg/nona/actions/runs/41310180715/job/124858853269)
checked out the merge commit, although the run metadata names the PR head. It
used Node 26.9.0, macOS 15.8.2 (24H232), image 20261028.0489.1, and the original
module fixture requesting GC stress. `generate()` defaults to full-runtime
linking in `runModulesOnHost()`. The native result was exit 0 with the extra
`unexpected` line after `live true false`. The original executable was not
retained by that helper. Its test duration includes compilation, native execution
and the Node oracle; it cannot identify when any deadline passed.

The earlier main [Darwin job](https://github.com/40oleg/nona/actions/runs/41309788682/job/124857559230)
has a successful Events step. Its raw log was unavailable (404 BlobNotFound) when
rechecked, so identical runner images or timing conditions are not established.
The timer, AbortSignal, clock and original fixture sources inspected across main
and the PR head are unchanged. Equal merge/head trees are verified, but neither
fact proves selector ownership or exonerates it.

## What the controls distinguish

The original `1/1000/20` ms fixture prints exactly:

```text
timeout TimeoutError
live true false
```

Node 26.9.0 also prints `unexpected` when a supplementary `Atomics.wait` after
registration holds the initial loop until all three timers are due. The source
clock control agrees. Advancing the source clock only during the last referenced
callback does not admit the later deadline into the existing phase snapshot.
These controls rule out stopping every timer phase immediately when its last
reference disappears as a compatible general repair. They do **not** establish
which condition occurred in the failing native executable.

`tests/events.test.ts` now runs the unchanged complete imported fixture through
public `compile()` with `fullRuntime=false` and `true`, requesting GC stress in
both. Each asserts the Node status and exact two-line output before comparing the
native result byte for byte. These cases have not yet demonstrated an unfixed
native failure, so they are coverage pending regression proof, not evidence of a
completed fix. The existing module-to-IR oracle remains intact.

## Hosted path and completion gate

After the harness publishes this branch as a PR with `full-ci` and `gc-stress`,
`.github/workflows/abort-timeout-investigation.yml` runs on the PR event without
requiring a new workflow on main. It checks all four revisions on hosted Darwin
ARM64, Windows x64 and Linux x64 with Node 26.9.0. Matrix concurrency is one;
within each job commands and native processes run serially.

For each revision, the probe compiles the original module fixture with full
runtime and GC stress, then separately with buffered traces and without stress.
Each mode retains two independent native processes. Mismatches fail the job;
later controls and artifact upload still run. The non-stressed mode supplements
the original stressed mode. The candidate also runs the two public compiler
cases. Artifacts retain fixture/runtime/generated sources, commit/tree, runner
configuration, commands, executable hashes, complete stdout/stderr, statuses and
trace schema. No existing CI assertion or platform coverage is disabled.

The worker cannot run unpublished candidate code on GitHub-hosted runners while
obeying this turn's prohibition on pushes and PR creation. Local Node/source
checks cannot replace those runs. Required remaining work:

- Inspect schedule deadlines, phase snapshots, reference counts and I/O liveness
  in retained plain-versus-traced native runs, accounting for trace perturbation.
- Establish the owning timer, GC, clock or linking mechanism. If it belongs to
  #624, document that dependency and repair it there instead of copying selector
  changes into this branch.
- Demonstrate a meaningful native public-API regression failing before the
  repair and passing afterward, preserving the original delays, event order,
  exact output and GC stress assertions.
- Validate the repair on hosted Darwin ARM64, Windows and Linux, then have the
  coordinator decide whether the evidence clears #624's release hold. Passing
  attempts alone do not dismiss the original failure.

## Local review validation

On Windows x64 / Node 26.9.0, below normal priority and concurrency one: build,
the six `events-timeout-source` tests, the retained Node/source probe, script
syntax, targeted Prettier and `git diff --check` pass. No native test or stress
execution was performed locally. Documentation link checking still fails on
existing site reference anchors, outside the changed documents. The hosted
workflow and public native cases are unexecuted; no native red/green result is
claimed.
