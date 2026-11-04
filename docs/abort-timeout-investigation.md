# AbortSignal timeout investigation (#632)

Status: **unresolved; PR #624 remains held; PR #633 remains draft**. This branch
repairs the fixture's phase contracts and prepares hosted discriminating controls.
It does not establish a native root cause or claim native acceptance. Use
`Part of #632`, not `Closes #632`, until the remaining evidence is reviewed.

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

The newer [hosted comparison](https://github.com/40oleg/nona/actions/runs/41331470725)
retains candidate macOS artifact `13106980859` (ZIP SHA256
`7424e85f87ac9e54752e32943ff0d628c4f3527e66072f31021ba365e789dfc5`)
at actual source `598e57fa7a5bf14433e3fee28b7541a3d42f6bc6`. Plain GC stress
has **one failure and one pass**; normal/plain and stress/scalar each have two
passes; stress/trace has two failures. Main23 artifact `13105466687` (ZIP SHA256
`e0568b8505aa8569eaed1c8d77033e269474ab145bdf2534c6869c02aa48b7dc`)
has all eight attempts passing. Shared original fixture, generated JS, timers and
events source hashes match. Native binary identity has not been proved.
The failed plain candidate's first phase remains **UNOBSERVED**. Scalar passes
and trace failures do not supply the missing observation. These results and the
earlier failed trace experiment remain historical failures, without relabeling.

## What the controls distinguish

The original `1/1000/20` ms fixture normally prints:

```text
timeout TimeoutError
live true false
```

The parent's actual Node 26.9.0 receipt records two lines normally and three
lines, including `unexpected`, after a 1100 ms `Atomics.wait` following the same
registration and original delays. Creating the later timer inside the final
referenced callback prints two lines even after that setup pause. The source
clock control agrees. Advancing the source clock only during the last referenced
callback does not admit the later deadline into the existing phase snapshot.
These controls rule out stopping every timer phase immediately when its last
reference disappears as a compatible general repair. They do **not** establish
which condition occurred in the failing native executable.

The old assertion that an unref timeout never fires is therefore not an
unconditional Node contract once its deadline is already due. This justifies
explicit fixture contracts, but does not explain the failed plain native attempt.
An early break when the last reference disappears is still an incompatible
production change and is not implemented here.

[The current fixture helper](../tests/helpers/abort-timeout-fixture.ts) defines:

- **Future-unref:** keep the 1 ms early timeout and 20 ms last referenced
  callback; create the 1000 ms unref timeout inside that callback. Store the
  signal in an outer `let later` captured by a process exit listener, keeping it
  strongly reachable through exit. The exit listener reads the binding and
  throws if missing. Require exactly the two lines above and process exit without
  the late callback. No deadline is widened and no output is filtered.
- **All-due:** keep the original registration order and 1/1000/20 ms values,
  then intentionally block setup using one finite 1100 ms `Atomics.wait`.
  Require its `timed-out` return and a measured elapsed time of at least 1100 ms;
  failure of either guard fails the fixture. Require exactly the two lines above
  followed by `unexpected`. This guards against a break on the last reference.
- **Referenced negative (diagnostic only):** make only the 1000 ms native timer
  referenced in generated diagnostic source, with the staged fixture unchanged.
  It must stay alive and print all three lines. The actual Node counterpart adds
  one ordinary referenced timer to keep the retained signal alive until its real
  abort callback fires. It does not synthesize the third output line. The native
  mutation is restored in `finally`; tracked runtime sources are never modified.

These native timing/GC experiments run only in Actions, with no platform skips.
Local controls use the real timer/events source and a fake clock; tiny actual
Node controls use `Atomics.wait`, without CPU busy-waiting. The delay, order,
strong root, exact lines, pause guards, early-break mutation and referenced
negative controls have source tests. None is evidence of a native fix.

[The original source](../tests/fixtures/abort-timeout/original.mjs) is retained
as exact LF bytes, independently of the active fixture. Its SHA256 is
`912309ce70d7e31624f54c19f233fb3a8f91fcce0db9a3578d34c9e30256e27f`.
The probe and tests assert the raw-byte hash and copy it unchanged into each
diagnostic directory as `original.mjs`. Prettier excludes this evidence file.
No capture depends on extracting the active fixture from `events.test.ts`.

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

On normal PR events, `.github/workflows/abort-timeout-investigation.yml` checks
the candidate on hosted macOS ARM64, Windows x64 and Linux x64, pinned to Node
26.9.0, with matrix concurrency one and serial native processes. The Events suite
also contains these assertions for ordinary CI: future-unref and all-due each
run through public default/full `compile()` and module-to-IR with GC off/on
(twelve tests). `events` is in the always-GC manifest so ordinary PR routing
cannot silently turn the GC-on requests off. Explicit GC-off requests remain off.
The fixture tests reject a global GC-off override and require a hosted runner.

Each public path retains source, expected lines, source hash, platform/Node/commit,
compile/image hash and complete Node/native results under `work/abort-timeout`.
The IR helper keeps its existing execution conventions; the tests retain its
returned results, and the separate probe retains plain future/all-due IR images
and complete process receipts. Hosted negative controls run with GC on and off.
Probe metadata names the contract, exact expected output, setup pause, original
raw-byte SHA, effective timer/generated source SHA and image SHA. Every run gets
a new directory. Artifact upload always runs; failures remain job failures.
No `continue-on-error`, acceptance of either two or three lines, suppression of
`unexpected`, wider native timeout, GC bypass or skipped platform is used.

The **historical four-revision experiment is manual**: dispatch the workflow with
`historical=true` on the reviewed branch. It still pins main23c5c90, failing624head,
failing624merge and the candidate on all three platforms, `max-parallel: 1`.
Only diagnostic tooling and pinned fixtures are copied to historical checkouts;
no selector/runtime patch is transplanted. The original/plain, scalar, trace and
GC-off modes retain their strict historical two-line comparison. An extra line
still fails that experiment even if it might be Node-compatible under all-due
conditions. The report names that historical assertion and does not infer phase
timing from a mismatch. Later modes and uploads run after failures, while the
job stays failed. Existing completed failures and artifacts are never replaced.

Explicit commands after a hosted build (serially):

```sh
node scripts/diagnose-abort-timeout.mjs --native --case=future-unref --attempts=1
node scripts/diagnose-abort-timeout.mjs --native --case=all-due --attempts=1
node scripts/diagnose-abort-timeout.mjs --native --case=future-referenced --attempts=1
node scripts/diagnose-abort-timeout.mjs --native --case=future-referenced --no-stress --attempts=1
node scripts/diagnose-abort-timeout.mjs --native --case=original
node scripts/diagnose-abort-timeout.mjs --native --case=original --scalar
node scripts/diagnose-abort-timeout.mjs --native --case=original --trace
node scripts/diagnose-abort-timeout.mjs --native --case=original --no-stress
```

Historical `--attempts=N` still accepts 1..8, default two, and runs the entire
fixed count regardless of outcomes. Interrupted campaigns remain incomplete;
counts are never extended until green. Native compilation/execution is guarded
by `GITHUB_ACTIONS=true`, `RUNNER_ENVIRONMENT=github-hosted` and Node 26.9.0.
Scalar/trace modes are restricted to `--case=original`, whose schema they describe.

The parent alone owns PR #633 publication, label/milestone readback, hosted
runs and integration. Remaining acceptance includes reviewed hosted contracts
and negative controls across all three platforms, full platform/CI evidence,
and final main integration. The failed plain original's phase/cause remains an
independent unresolved question; staged success cannot answer it. No #612
production patch is included. PR #624 stays held and issue #632 remains open.

## Historical local review validation

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

## Phase-contract continuation

This continuation starts at `d73286fd4f6143e391383fd1b65dfdf4178869f4` under own
claim `6571889171`. It reads the parent's phase findings and actual Node receipt
without modifying root research outputs. `work/phase632-red.txt` retains the
original-body baseline: six failures and one pass, no skips. That red exposes
missing staging/root/pause contracts; it is not a native regression receipt.
`work/phase632-green.txt` and `work/phase632-review.txt` record the final tiny
serial BelowNormal checks, exact commands/source diff and remaining hosted gates.
No local native build, emission, execution, GC/load campaign or full suite is
used. No production runtime/compiler file changes or GitHub mutations are made.

## Platform probe phase-copy correction

The next actual [Darwin x64 full-CI failure](https://github.com/40oleg/nona/actions/runs/41412837359/job/125169585857)
checked out merge `13370f93a902e1a80aed824b36f48937440eba09`, combining PR head
`33ccdbf8bbc477bed83e50b1b8e126bfc49407c3` with main
`ba94164b6573eef306b87a59d0b174630973e364`. On Node 26.9.0, all twelve explicit
phase tests passed. The separate `event-probes.test` failed its exact stdout
assertion for `event-timeout-liveness`: it printed `timeout TimeoutError`,
`live true false`, then `unexpected`. Earlier in the same job, the manifest's
execution of that stale probe passed. The parent's original raw log remains at
`research/release035/632-darwin-x64-fullci-failure.log`, SHA256
`ff2409ac3bfbb53deeb203ffa65e27734d7582f9678a5533be9631df5a55cc0a`.
This exposes a missed independent fixture copy; it does not prove the failed
native process's timer phase or a production cause.

The active [pure probe definitions](../tests/probes/event-probe-sources.ts) now
map **both** reviewed `timeoutContracts` bodies and exact expectations into
`event-timeout-future-unref` and `event-timeout-all-due`. Strong retention, the
guarded 1100 ms setup pause, original timer delays and exact two/three-line
contracts come directly from the unchanged helper. The four other event probe
definitions are unchanged. The compiler-facing wrapper re-exports the existing
source API; compiler, native linking, GC stress and execution bounds are unchanged.

The stale platform source was distinct: it registered the 1000 ms signal before
the 1 ms signal and used `earlier` rather than `early`. Its complete template
value, including leading/trailing LF, is preserved verbatim in
[platform-original.mjs](../tests/fixtures/abort-timeout/platform-original.mjs),
SHA256 `1a8060f020b54cff97c0c8a62c1f3e733ae563c24cd0653e56a2060838c0bc75`.
It was extracted from `tests/probes/event-probes.ts` at the PR head above;
that original TS file's raw-byte SHA256 is
`e3d054cf04143c196b14f617121e2945660b045df147c3c92ba553b610417d75`.
Prettier excludes both historical inputs. The original `912309...` fixture,
historical diagnostics, raw results and historical v0.34 changelog stay intact.
No additional published diagnostic workflow is introduced.

Source inspection accounts for the timeout coverage separately:

| Consumer                                  | Actual coverage after this correction                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events.test.ts`                          | Unchanged twelve future/all-due × IR/default/full × GC off/on hosted cases; its independent immediate-exit case has no referenced timer.                                                                                                                                                                             |
| `event-probes.test.ts`                    | Both phase probes plus four other event probes, native host, GC stress, exact stdout.                                                                                                                                                                                                                                |
| `event-probes-source.test.ts`             | Node oracles for all six definitions, plus all six compiled for each of eight targets under GC stress; hosted only for compilation.                                                                                                                                                                                  |
| Platform manifest builder/runner          | Dynamic map over every event probe for seven build targets; six event entries per selected target, replacing five. No fixed count/name filter; each expected file and manifest row retains its exact expectation. The native platform workflow runs these and the Events suite separately.                           |
| `events-timeout-source.test.ts`           | Six existing source-clock controls: immediate exit, timeout while referenced, last-reference exit, clearing the reference, same-phase already-due dispatch and validation. These use the real source with a fake clock and small Node oracles; they are not a third native copy of the original 1/1000/20 assertion. |
| `events-timeout-phase-source.test.mjs`    | Existing helper/root/pause/negative controls plus the actual six-entry probe list, delayed-entry behavior for both platform phases, strong-root and pause checks, early-break rejection, exact real Node phase oracles and both historical byte hashes.                                                              |
| Scalar source tests and diagnostic script | Original fixture remains independent; original/plain/scalar/trace, explicit future/all-due and referenced negative diagnostic coverage remain unchanged.                                                                                                                                                             |

The bounded local red at `work/review/platform-probe632-red.txt` imports the
extracted, unchanged stale definitions and fails three checks: both phase
registrations are missing and the six-entry list is incomplete. Its historical
phase control passes. Green/review receipts use the corresponding
`platform-probe632-green.txt` and `platform-probe632-review.txt` paths. Local
checks remain serial and BelowNormal, using pure modules/source/mocks and tiny
Node processes. The pure module's one emitted-JS helper import is resolved to
its TS source only during the no-build source test import; the compiler-facing
module is never imported locally.

This continuation uses own claim `6574225830`, marker
`nona-review632-01a1918d-20261102-platform-probe-contract`. Parent independent
review, normal publication on the same PR #633 with required labels/milestone
verified before push, all twelve hosted contracts and actual native platform
full CI on the new head remain mandatory. Existing accepted main work is
preserved. Issue #632 remains unresolved, and #612 stays held out of the queue
until #632 is fully accepted.
