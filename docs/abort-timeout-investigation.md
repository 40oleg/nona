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

The retained [main macOS ARM64 comparison](https://github.com/40oleg/nona/actions/runs/41317595406/job/124883849321)
at source `23c5c90d330e488539385ab213e996bb4c4d6457`, tooling merge
`2da160fe04c8657db03f762e016230d74fb15d56`, failed correctly: both plain
GC-stressed processes and both GC-off controls matched Node, while both verbose
traces printed the extra callback. In the traces the long timer deadlines
`185927.01` / `209831.163` preceded their admitting phase snapshots
`186025.244` / `209975.67`; callback IDs were `1,3,2`. All three timers were
already due. This proves the all-due path in those instrumented processes,
**not the original uninstrumented PR #624 failure cause**. Artifact `13091449487`
has ZIP SHA256 `08126448b692cd44dc9fef6a147372ec87e3044d783a790193af38a2b0821e2a`.
Preserve this completed run, its failure and all raw outcomes when adding newer
evidence; a passing scalar run cannot supersede the causal question.

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

## Supplementary scalar observations

[The scalar instrumenter and pure parser](../scripts/abort-timeout-scalar.mjs)
add a separate `--scalar` image. The generated runtime uses fixed closure scalar
slots, prepared before scenario registration. After the existing `push(timer)`,
branches on IDs 1/2/3 copy the existing ID, deadline, normalized delay, referenced
flag, active count and reference count. It copies the first **existing**
`phaseTime` and, after the original future-deadline admission check but before
`pop()`, records each admitted ID, deadline, that admission's existing phase
snapshot, count and references into three slots selected by sentinel branches.
After `run(timer); drain();` it records counts again. Multiple phases are
distinguished; a single initial snapshot would not establish later admission.

The inserted critical regions have no observer helper calls, clock/network
reads, computed indexing, arithmetic accumulators, allocations or printing in
their JavaScript source. Observations hold only existing numeric/boolean
values, never timer/callback/signal objects. The dump function constructs arrays
and JSON only after the existing loop returns. The artifact includes its versioned
field schema and exact generated instrumented source. The parser retains
future-deadline, changed-deadline, count/schedule and overflow findings; malformed
evidence fails comparison and leaves raw output intact. Every ordinary output
line, including `unexpected`, remains part of the exact oracle comparison.

This reduces known observer work; it does **not** establish zero allocation or
zero timing effect in native code. Extra captured bindings, branches, property
reads, closure setup, generated code and GC work may perturb or mask a rare
failure. Native assignment lowering/emission has not been verified in this
continuation because native compilation/emission is hosted-only. Interpret
schedule-to-admission stability, per-admission deadlines/phases and counts
alongside unchanged plain outcomes at the failing head and actual merge.
Scalar all-due behavior alone still cannot attribute an uninstrumented failure.

[Controlled source-clock tests](../tests/events-timeout-scalar-source.test.mjs)
run the original body against plain and scalar timer sources for normal,
all-due and clock-advanced-inside-callback cases. They compare exact output,
every clock read, wait, schedule and admission. Mutating away the deadline gate,
resampling the clock inside the phase, or stopping the phase after the last
reference makes the controls fail their behavioral contracts. The schema tests
reject malformed/duplicate/unbounded records and preserve anomalous evidence as
findings. These are deterministic source controls, not native acceptance tests.

## Hosted path and completion gate

After the harness publishes this branch as a PR with `full-ci` and `gc-stress`,
`.github/workflows/abort-timeout-investigation.yml` runs on the PR event without
requiring a new workflow on main. It checks all four revisions on hosted Darwin
ARM64, Windows x64 and Linux x64 with Node 26.9.0. Matrix concurrency is one;
within each job commands and native processes run serially.

For each revision, the probe compiles the original module fixture with full
runtime and GC stress, then separately with scalar observations, buffered traces
and without stress. Each mode defaults to two independent native processes.
Mismatches, stderr, nonzero exits, timeouts and invalid scalar evidence fail the
job; subsequent requested attempts, later modes and artifact upload still run.
An incremental comparison report preserves completed outcomes if a job is
interrupted. The non-stressed mode supplements
the original stressed mode. The candidate also runs the two public compiler
cases. Artifacts retain fixture/runtime/generated sources, commit/tree, runner
configuration, commands, executable hashes, complete stdout/stderr, statuses and
verbose/scalar schemas, effective generated source/hash, parsed observations
and findings. Source controls retain their TAP report and both controlled
outcomes too. No existing CI assertion or platform coverage is disabled.

For a coordinator-reviewed **hosted-only** campaign, `--attempts=N` accepts
integers 1 through 8 (default 2). Set the workflow's `ABORT_TIMEOUT_ATTEMPTS`
before publication to apply the same fixed count to original/plain and scalar;
verbose and GC-off controls stay at two. Alternatively, in the same pinned
hosted checkout, use `node scripts/diagnose-abort-timeout.mjs --native --attempts=8`
and `node scripts/diagnose-abort-timeout.mjs --native --scalar --attempts=8`.
The probe attempts the entire fixed count regardless of earlier success/failure;
the count is never extended until green. Existing process/job time limits still
apply; an interrupted campaign is incomplete proof. Native hosted/Node guards
remain mandatory.
The modes compile separate images and are sequential, so matched counts are
observational comparisons, not simultaneous measurements of one execution.

The matrix still pins main23c5c90, failing624head, the actual failing624merge and
the candidate across all three platforms, with `max-parallel: 1`, reports on
failure and no automatic cancellation. The parent alone coordinates any
superseding of **unstarted** older jobs with a recorded reason. This worker
does not cancel or rerun jobs or discard executed failed evidence.

The worker cannot run unpublished candidate code on GitHub-hosted runners while
obeying this turn's prohibition on pushes and PR creation. Local Node/source
checks cannot replace those runs. Required remaining work:

- Obtain scalar/plain comparisons on the pinned failing head/actual merge and
  other matrix revisions. Inspect scheduled versus admitted deadlines, each
  admission's phase and counts, with verbose I/O evidence as supplementary
  context. Account for observer perturbation and successful plain outcomes.
- Establish whether an original plain failure is legitimate all-due behavior
  or violates deadline, root, clock or liveness state. Report causal evidence
  before choosing a production or fixture-staging repair. Staged success alone
  cannot establish the original cause. If the defect belongs to #624, document
  that dependency and repair it there instead of copying selector changes here.
- Demonstrate a meaningful native public-API regression failing before the
  repair and passing afterward, preserving the original delays, event order,
  exact output and GC stress assertions.
- Validate the repair on hosted Darwin ARM64, Windows and Linux, then have the
  coordinator decide whether the evidence clears #624's release hold. Passing
  attempts alone do not dismiss the original failure.

## Local review validation

The scalar continuation starts at pinned PR #633 head
`3e2aa12aaceead0d6db7df0b62b63a4dbb425fdd` under claim `6561236354`.
`work/scalar632-red.txt` retains the initial identity-probe baseline: five
observation/schema failures, one passing behavioral mutation control, no skips.
That red proves missing diagnostic behavior, not a production/native defect.

On Windows x64 / Node 26.9.0, below normal priority and concurrency one, 16
targeted tests pass: seven new scalar source/schema controls, six existing
timeout source controls and three architecture/document index checks using
existing `dist` output. There are no failures/skips; raw plain/scalar controls
are retained in `work/scalar632-green.txt`. The retained original Node/source
probe, syntax checks, strict scalar-helper type check, targeted Prettier and
`git diff --check` also pass. The documented `node site/scripts/sync-docs.mjs`
prerequisite was run only after verifying `site/generated` is bounded to this
worktree (12 files, no junctions/reparse points); 1,564 document links then pass.
Only tiny targeted checks are used: no local build, native compile/emission/
execution, timing/GC campaign or full suite is run. Earlier build validation
belongs to the previous continuation. The updated hosted scalar path and native
public witnesses remain pending, so PR #624 stays held, PR #633 stays draft
`Part of #632`, and no native red/green acceptance or production/fixture repair
is claimed.
