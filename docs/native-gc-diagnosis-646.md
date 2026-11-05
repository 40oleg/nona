# Native GC execution diagnosis (#646)

## Prepared mapping-only derivation of the existing partial capture

This is a partial data-processing handoff for parent review/publication in
existing PR #647, Part of #646. It establishes no production repair, cause,
issue completion or release acceptance. No new native execution, Node oracle,
sampler or C# execution is part of this workflow. Earlier observation plans
below are historical; the current job imports the second attempt instead.

### Capture and immutable receipts

The second run [41990050032](https://github.com/40oleg/nona/actions/runs/41990050032)
at `45ce52357468985128f807c600588a6a8d8a95d1` captured **1626 rows / 7356
instruction snapshots** of retained image
`8157abc9333625725348fda654d2e5997693ee6779ae9b5d9ac33f61c3ac5451`.
The target is PID **4020**, raw creation **134383386716948292**, base
`0x7ff6c9160000`. Raw `samples.jsonl` SHA256 is
`b7a30312f54b9ccef9f7efb43a17054f00c2256a3f028de00050f6334de16cc3`.
Its observed window is `2026-11-05T07:51:12.3926351Z` through
`2026-11-05T07:54:11.5957435Z`. These are wall-clock thread instruction
snapshots, without stacks or exclusive GC CPU-time accounting.

The sampler retained `cleanup: true`, **`complete: false`, exit 1**, and
`SuspendThread` Win32 error 5 at `2026-11-05T07:54:11.7182736Z`.
The native result finished at `07:54:11.712Z`, retaining its **180000 ms
timeout**, `ETIMEDOUT`, `SIGTERM`, `deadlineExpired: true`, and failed output
assertion. The unchanged Node result remains exit 0. The timing suggests an
exit race but does not prove its cause. No error is reclassified, ignored or
cleared. Original map stages were skipped because observe failed; terminal
capture completeness remains missing.

The fixed input is observation artifact **13397577754**, uploaded after the
failed observation and before mapping: **31957391 bytes**, ZIP SHA256
`8d9bb5d13e72b1625af64a2cecb2e5d15e20e6280d32e4c830da913bd4956cca`.
The separate metadata artifact **13398585305**, **12480 bytes**, SHA256
`03f705caf5f62092abbeab78a5b038ba5cc8de237fb57c7fd29e3e2854314edf`,
preserves the subsequent original `verification.json`. Both API run/head/digest
bindings and complete ZIP digests are checked. Exact flat entry names, sizes,
local/central headers and CRCs are checked before extraction; duplicate names,
directories, symlinks, missing entries and suffix lookalikes fail. Overlapping
entries in the two artifacts must be byte-identical. Raw ZIPs, image, samples,
streams and old reports remain intact; retained JSON is never rewritten.

The local evidence includes exact decoded entries from the whole-ZIP SHA/CRC
checked `646-profile-45ce-metadata-entries.json` and
`646-profile-45ce-final.log` under the owner's `research/release035/` directory.
The display-only worker timestamp difference `.719162Z` / `.7191620Z` is
compared as integer UTC 100 ns units, including calendar validation and raw
FILETIME consistency. Different 100 ns values, invalid dates and unknown
identities fail. Raw PID, creation string, image path/hash, parent and command
remain exact; millisecond rounding is not used for this identity comparison.

### Implementation sequence and publication boundary

The implementation plan stays in this document to keep the authorized file
scope: add precise metadata regressions; validate/import the fixed capture;
bind the current helper and map in a separate certificate; wire the guarded
mapping-only job; then run serial lightweight checks and hand off to the parent.

The PR-triggered Windows job keeps its **15-minute** outer limit, owner/ref
guards and exact-head changed-filename preflight. Its only processing path is
`prepare-existing` → checkout compiler source
`b78f81820ff19105ab85fb10773fab4353b3d8f5` → `npm ci` / compiler build solely
for labels → exact rebuilt-image equality → `derive-partial`. Rebuilt bytes
are never executed. The six-row campaign guard and all product CI remain.
There is no observe, native-worker, sampler, PowerShell or Node oracle launch
step, retry or fallback to resampling.

Before attribution the controller checks original retained ZIP/input/request
provenance, launch and stream hashes, single native and Node attempt counts,
worker/target identities, source/image equality and the exact sample digest and
counts. Every selected row must be complete and valid; source/image/map
mismatches, malformed rows and unmapped in-image offsets fail attribution.
Outside-image snapshots remain explicitly outside the image, never assigned
to a GC label.

`derivation-certificate.json` binds the old capture artifact/run/head/digest
and retained-file digests to the **current** helper run/head/attempt, workflow
SHA and helper hashes. `map-result.json` binds that certificate and helper to
the image/map hashes. `GITHUB_RUN_ID` and `PROFILE_HEAD` keep their current
values; the old plan, worker, sampler and `verification.json` stay unchanged.
Separate `partial-input-validation.json`, `partial-verification.json` and
`partial-attribution.json` record identity/stream/image/map checks, observed
window/counts and original sampler/native/Node outcomes. They always carry
`partial: true`, `completeCaptureAccepted: false`, `nativePassed: false`,
`historicalFailuresCleared: false`, and `releaseAcceptance: false`.
Validated pre-failure snapshots can support a scoped hotspot observation;
successful mapping/data processing is explicitly **not a native/capture pass**.

Read-only local validation of the complete observation ZIP and original
retained ZIP found **1623 in-image snapshots and 5733 outside-image snapshots**
within the 7356 total. This is address classification only; function labels and
hotspots remain pending the hosted image-equal map. All 20 exact metadata
entries matched their recorded size/digest, and overlapping observation bytes
matched. The separate 12480-byte metadata ZIP also passed full digest/CRC and
exact-entry validation; its old verification remains incomplete.

Always-run full uploads retain both raw ZIPs and all capture/derivation files.
The small metadata upload includes the certificate, map/map-result, partial
reports, old errors/outcomes and original verification. Failure still uploads
metadata and raw evidence. Parent review/publication remains pending; hosted
map equality and any hotspot attribution have not been established locally.

Local checks used affinity mask 3 and BelowNormal priority: 21 serial pure
metadata/JS tests, JS syntax, sampler PowerShell parsing without execution,
selected-file formatting with cached Prettier 3.6.2 (the available cache), and
`git diff --check`. No installs, compiler build, native workload, oracle,
sampling or C# execution ran. The document-link checker examined 1589 links in
308 documents and exited 1 with 95 missing-anchor diagnostics in unchanged site
pages; the baseline comparison produced the identical 95 diagnostics. Those
unrelated documents are outside this task's allowed file scope.

Prepared partial publication: existing capture identity, streams, image and
sample bytes are validated for scoped derivation; collection remains partial
with its original terminal error and native timeout. Parent review/publication
and hosted map equality remain pending. No capture pass, historical failure
clearance, exclusive GC CPU-time claim, cause, repair or release acceptance is
asserted.

## Profile support after the failed first attempt (partial support, 2026-11-05)

This section records prepared follow-up support, **not a valid profile, established
cause, production repair, completion of #646 or admission of #628/#631/#635**.
PR #647 remains the existing draft, with `Part of #646`. The earlier review
sections below are historical records; their missing-evidence statements refer
to those reviews, not to the subsequently completed campaign.

### First attempt receipts and bounded follow-up

The parent's absolute files under
`C:/Users/helgus/Documents/ChatGPT/nona/research/release035/` are the evidence:
`646-profile-00c-range-proof.json`, `646-map-startup-negative.json`,
`646-map-startup-negative.log` and `646-profile-00c-final.log`.
At head `00c75b005b01388029629d560f3f2e64d0c5d422`, run
[`41986142335`](https://github.com/40oleg/nona/actions/runs/41986142335)
produced result artifact **13395654814**, reported digest
`06e7c00feaf5f9bc7656c46c4e372a4bcedbcd35033e65ae1e9ef37847793331`.
The parent verified selected flat entries' text and CRC through ZIP ranges;
the whole result ZIP SHA256 was **not locally verified** because the large
transfer timed out. Separately, the hosted prepare step verified the exact
original retained ZIP, image and input hashes.

The retained native image timed out at 180000 ms; the unchanged Node control
passed. The sampler exited before `identity.json`, with **zero rows and zero
samples**, `cleanup: true`, and `More than one child of native worker` at
`sampler.ps1:147`. Candidate identities were not retained, so these receipts
do not identify a particular console/helper executable. The mapper separately
hit an import cycle: its top-level await dynamically imported the profile
module, which statically imported the mapper. Both the hosted log and direct
CLI negative control show an unsettled top-level await; the local CLI exited
13 before reaching its hosted guard. There is **no profile to re-map**.

The prepared changes defer mapper CLI kickoff until module evaluation finishes
and catch CLI errors explicitly. Owned selection records at most 20 snapshots
of 64 candidate identities, verifies the worker's PID/creation epoch and
selects only a unique child with the expected parent, launch window, canonical
image path and pinned file hash. Node `realpathSync.native` resolves Windows
short/long aliases. Known nonmatching children may coexist; ambiguous matches,
unknown identity and inaccessible metadata fail closed. Selection holds process
handles and rechecks creation/path/hash before thread capture.

The supervisor watches sampler exit while the native worker is running. Early
collection failure writes `observation-abort.json` and stops only this owned
worker tree after checking its PID, creation epoch, parent, canonical Node
image path and file hash. Cleanup retains descendant identities/handles and
checks their termination too. After verified cleanup the temporary executable
is removed; the retained `image.bin` and all failure receipts remain. Aborted
attempts are explicitly incomplete, cannot count as native deadline witnesses,
and cannot pass verification. Missing native streams/results stay missing.
The unchanged Node oracle runs once after cleanup. A valid sampling attempt
still uses the exact 180000 ms native deadline. Failed observation skips map
reconstruction; verification and both final uploads still run.

The next hosted target remains exactly **one new observation** of the same
retained original image and one unchanged 60000 ms Node oracle, within the
15-minute job. No first-attempt output is reused or derived as valid profile
data, and no retry matrix, markers, GC changes or larger deadline is added.
The first-attempt receipts remain untouched. OS selection, tree cleanup and
map equality still require hosted validation after parent review/publication.

The completed read-only investigation inspected
[`41979548935`](https://github.com/40oleg/nona/actions/runs/41979548935)
at diagnostic head `5278ca50cff7356338332440bad4f73f510064c0`.
Its recorded `result.text`, `646-http-windows-outcomes.json` and
`646-http-windows-entries.json` under the owner's
`C:/Users/helgus/Documents/ChatGPT/nona/research/release035/` establish:

- Windows original HTTP, both concurrent copies, isolated tail and marked
  variant timed out at the unchanged 180000 ms deadline. Startup passed.
  The original accumulated approximately 177 CPU seconds near 180 seconds
  elapsed. It printed `queued 2 2`; the historical failure had reached `woken`.
- Linux's four unmodified HTTP executions passed around 138 seconds; only the
  marked variant timed out. All four assert/RegExp jobs passed within their
  bounded fresh-worker scope. These results do not clear historical failures.
- Pinned x64 stress emission calls `rt.collect` before every IR operation.
  Collector cost is plausible, but no instruction profile establishes its
  share. HTTP liveness, finite expensive work and repeating work remain open.

### Fixed design and implementation sequence

The authorized next observation is one external Windows instruction profile
of the retained unmodified `01-original` image. The small Kernel32 PInvoke
fallback avoids installing an SDK or adding image instrumentation. Rebuilding
is exclusively for labels and ranges; rebuilt bytes are never executed.
The implementation sequence is: pin and retain provenance; sample one replay
with its original Node oracle; reconstruct and verify an image-bound map;
verify evidence and raw failures independently. Lightweight parser/provenance/
identity negative controls accompany this support. All OS/native/build
validation belongs to the hosted job.

[`issue646-profile.yml`](../.github/workflows/issue646-profile.yml) has one
Windows GitHub-hosted job with an outer limit of **15 minutes**, no matrix and
no second Nona execution. A cheap Ubuntu preflight accepts only owner
`40oleg`, repository `40oleg/nona`, same-repository PR **647**, exact head branch
`nona/issue-646`, or explicit dispatch on that branch. It reads the exact event
head commit's paginated filenames, including previous names for renames.
Unknown/truncated metadata fails explicitly. Automatic profiling runs only
when the new workflow, profile controller, sampler, mapper or their metadata
test changed in that commit. Documentation-only and unrelated subsequent
pushes do not repeat the observation. Explicit dispatch remains available for
future authorized use; publishing this support is not an instruction to
dispatch it repeatedly.

The completed six-row campaign keeps its matrix, tests, deadlines and manual
dispatch. Its PR trigger types change only from `[opened, synchronize,
reopened]` to `[opened, reopened]`: PR path filters inspect the whole PR diff,
so `synchronize` would otherwise rerun the entire completed campaign on another
push to #647. This prevents unrequested duplicate campaigns. It waives no
failed witness or required product CI; all other product workflows remain intact.

### Immutable inputs and launch

Artifact **13394086354**, run **41979548935**, is pinned to ZIP size
**28446976** and SHA256
`c7350500cc5f8ca5c1c4be5b4dd3cbb7d7b5319d7f35e6696ca6355b8a7c68e1`.
The exact canonical entry is
`native-gc-diagnosis/01-original/executions/modules-2gJyVw/image.bin`, size
**13835776**, SHA256
`8157abc9333625725348fda654d2e5997693ee6779ae9b5d9ac33f61c3ac5451`.
There is no suffix selection; synthetic `native-evidence-tests` trees cannot
be selected. API metadata binds the artifact to the completed failed diagnostic
run. The whole ZIP and each selected entry must pass their recorded digest
and size checks. No binary artifacts belong in Git.

The controller also pins the exact request, native input, Node input, historical
native/Node results and context entries. It binds their graph, `main.mjs` entry,
stress, full-runtime linking, compiler path, oracle and deadlines to compiler/
runtime owner **b78f81820ff19105ab85fb10773fab4353b3d8f5**, independently of the
diagnostic branch or accepted main. Before execution it retains these inputs,
the ZIP, parsed PE metadata, plan and launch configuration and uploads them.

The replay creates the original `nona-modules-*` temporary-directory shape,
writes the original graph and `image.exe`, uses that directory as cwd, supplies
no arguments and preserves `windowsHide: true`, empty stdin, default 1 MiB
`spawnSync` buffer limits and the **180000 ms** native deadline. The temporary
basename may differ; it is retained in the launch report. A dedicated Node
worker returns the raw original-style `spawnSync` stdout/stderr/status/error/
signal, including `ETIMEDOUT` on timeout. Exclusive attempt records reject a
second execution in the same evidence directory. After native termination,
the same cwd's entry is replaced with the original distinct Node oracle source
and Node **26.9.0** executes it once with its original **60000 ms** limit.
Its raw streams must match the original Node assertions. Neither image stress
nor original watchdog policy is changed.

### Sampling, mapping and failure semantics

[`issue646-sampler.ps1`](../scripts/issue646-sampler.ps1) compiles a small .NET
helper only on GitHub-hosted Windows AMD64. It uses the
[AMD64 CONTEXT layout](https://learn.microsoft.com/windows/win32/api/winnt/ns-winnt-context)
and [GetThreadContext suspension requirement](https://learn.microsoft.com/windows/win32/api/processthreadsapi/nf-processthreadsapi-getthreadcontext).
The 1232-byte context backing store is aligned to 16 bytes, flags are at byte
48 and RIP at byte 248. Each successful owned-thread suspend has one resume
in `finally`; each thread handle is closed. Unexpected suspend counts and
resume/handle failures are explicit failures. The sampler binds the worker's
unique matching native child to its canonical executable path/hash, parent PID, creation
window and an open process handle. Per-thread handles must belong to that
process; creation identities are retained. Final verification compares the
discovered PID to the native worker's raw result PID.

The actual main-module load base and image size, CPU milliseconds, RSS,
timestamp, PID/process creation identity, thread identities and instruction
addresses are retained. Limits are 100 ms between ticks, 1800 ticks, 32 threads
per tick and 32 MiB of raw samples. Every completed row is flushed immediately.
These are wall-clock RIP snapshots with no stacks or exclusive CPU-time
accounting; sampling suspension/overhead perturbs execution. They can expose
repeated offsets or concentration in mapped functions but cannot alone prove
GC dominance, scenario phase timing or a production cause.

[`issue646-map.mjs`](../scripts/issue646-map.mjs) rebuilds solely for metadata
on the hosted runner using the owner pin, Node 26.9.0 and retained original
inputs and original compile filename. It requires **exact rebuilt image SHA256
equality** before emitting a usable map. The pinned linker layout must cover
the complete executable section; all unwind function boundaries must match the
retained image's `.pdata`. Map and sample hashes bind the attribution report.
Dependency/build commands retain raw streams and status/error reports as well.
Mismatched images, missing labels or incomplete coverage fail closed. The
verifier retains raw samples and actual-base-relative offsets before mapping;
an attribution gap is reported explicitly, never replaced with GC attribution.

Native success, profile completeness and attribution completeness are separate
fields. Native failure is retained even when profiling fails; a valid profile
of a timeout still fails the job. Unavailable APIs/permissions, zero valid
retained-image samples, cleanup failure, unsuccessful worker/sampler exit,
incomplete streams/reports, changed provenance, wrong identities or wrong
counts also fail. Missing build/map reports fail verification while preserving
the raw profile. A separate always-uploaded `issue646-profile-metadata-*`
artifact includes verification, sampler/identity/candidate reports, map/result,
attribution and abort/failure/cleanup context when present, plus a missing-file
index. It excludes images, ZIPs and raw sample streams. The full evidence
artifact and earlier checkpoints remain. All reports, partial failures and streams are uploaded with
`if: always()`, including an observation checkpoint before rebuilding; uploaded
inputs survive a later timeout or cancellation. Hard
runner loss can still prevent final reporting/upload and is incomplete evidence.

### Local checks and publication handoff

Only lightweight serial JS/metadata tests, syntax/parser checks, selected
formatting and document-link checks are permitted locally, at affinity mask 3
and BelowNormal priority. No local compiler build, dependency installation,
C# compilation, profiler or Nona native execution is part of validation.
The real Windows APIs, cleanup under native exit races, artifact availability,
image equality and native outcomes remain unvalidated until the prepared hosted
job runs; each has a failing path rather than an assumed success.

The parent handles review and publication on the existing #647 branch/PR.
This preparation does not commit, push, create PRs, change labels, dispatch jobs
or wait for hosted outcomes. Keep #647 draft and `Part of #646`, retain all
historical failures and the current-release admission hold.

The earlier prepared-support checks passed seven serial metadata tests, JS
syntax, PowerShell parsing and selected Prettier checks. That imported-export
coverage missed the actual mapper CLI cycle; the follow-up regression invokes
the real CLI with `GITHUB_ACTIONS=false`, requires the hosted guard, and rejects
exit 13, unsettled-await warnings and hangs without building or running Nona.
Additional pure tests cover child selection/aliases and early-failure supervision.
The earlier document-link check found 95 existing site-anchor errors, exactly
matching its in-memory `HEAD` baseline; no site files were changed. These checks
provide no Windows sampling, image-rebuild or native-run result.

Follow-up local validation at mask 3 / BelowNormal with Node 26.9.0 passed
**14 serial pure metadata tests**, selected JS syntax and Prettier checks, and
PowerShell parsing without executing the script or C#. The current document-link
check found 95 errors across 1589 links in 308 documents; substituting both
edited documents from `HEAD` in memory reproduced the exact same 95 errors.
Parent review/publication and one new hosted observation remain outstanding.

**Scope: partial diagnostic infrastructure. Part of #646.** Any PR for this
branch must use `Part of #646`, keep the issue open and retain the release hold.
The step names in commit history do not establish completed diagnosis or repair.
This branch supplies evidence retention and diagnostic failure handling only;
it does not complete #646's native diagnosis, production repair, permanent native
regression or required current-head release CI. Those remain follow-up work on
this current-release issue, with HTTP Agent behavior owned by #616.

This records step 2 diagnostic support and the inconclusive step 3 admission
review. No production repair or release admission is established. The review
fixes below do not add hosted results or change that conclusion.
The branch started at accepted main `37fc352d771113653813c18b0442681428c314f6`.
The supplied task says step 1 is committed, but this checkout's history and tree
contain no step-1 evidence bundle or matrix. The issue's immutable pins and
original job logs therefore remain the evidence authority. No old refs, draft
PRs, assertions, suites, HTTP concurrency-1 tail or execution deadlines are changed.

## Read-only findings and limits

| Group                                                              | Source                                            | Original evidence                                                                            | Established result                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Assert: ordinary objects/cycles, Map keys, strict equality         | `79afe8e11770d6c297eb0e84476af09fb46a0bf2` (#628) | [Darwin ARM64 job](https://github.com/40oleg/nona/actions/runs/41870436370/job/126715703580) | Native `ETIMEDOUT`; reported aggregate durations include compilation.                           |
| RegExp: Unicode/index advancement, nested sets, string disjunction | `a80f8b4a67c921546860806c8445d722710d8e9f` (#631) | [Darwin ARM64 job](https://github.com/40oleg/nona/actions/runs/41873101270/job/126728303402) | Native status null; original assertion output does not establish signal/error or prove timeout. |
| HTTP Agent `origins/2`                                             | `b78f81820ff19105ab85fb10773fab4353b3d8f5` (#635) | [Windows 4/4 job](https://github.com/40oleg/nona/actions/runs/41886396573/job/126798789063)  | `queued 2 2` and `woken 2 /hold0,/other1,/other2` preceded native `ETIMEDOUT` at 180000 ms.     |

Source inspection establishes a diagnostic gap: the native, Linux host and
module paths discarded `signal`; module Node controls returned only stdout/status;
RegExp failure assertions reported stderr without the native error. This change
repairs that evidence path. It does not establish a common execution defect.
HTTP scenario behavior remains owned by #616; any demonstrated Agent repair must
be coordinated there rather than folded into this diagnostic step.

No native, build, load or benchmark workload ran locally. At the end of step 2,
hosted results were pending and the diagnostic files were unpublished. The
step 3 audit below records the subsequent publication without hosted execution.
The harness must arrange execution of this narrowly scoped workflow. A successful
original retry, comparison, startup control or instrumented variant cannot erase the historical
failures. The mechanism diagnosis, repair and required current-head CI remain
outstanding.

## Step 3 result: inconclusive, release admission held

Read-only GitHub checks on 2026-11-05 at 05:58 UTC found:

- Remote `main` remains `37fc352d771113653813c18b0442681428c314f6`.
- Remote `nona/issue-646` contains diagnostic commit
  `f2d564983a460c227e402f52dacf993699d49960`. The Actions runs endpoint queried
  with that exact `head_sha` returned `total_count: 0`, including all event
  types. This is missing validation, not a successful diagnostic run.
- The repository's Actions workflow inventory does not include
  `.github/workflows/native-gc-diagnosis.yml`; the PR inventory for head
  `nona/issue-646` is empty. The branch file alone does not establish a
  dispatchable workflow or executed jobs. This step is forbidden to push or
  open a PR, so it cannot supply the missing PR-triggered run.
- PRs #628, #631 and #635 are open drafts at the exact source pins in the
  evidence table above. None is admitted by this review.
- Issue #646 is open with its existing `bug`, `complex`, `nona-agent`,
  `nona-reliability`, `blocked` and `nona-agent:wip` labels. Milestone 29 is
  open `v0.35.0`. The existing harness claim and draft PRs were left intact.

No retained hosted report establishes a common cause or a specific owning
mechanism. In particular, the historical aggregate durations cannot separate
compilation, startup, GC, scenario execution and infrastructure contention. The
HTTP progress lines establish partial scenario progress, not why it stopped.
The RegExp null status still has no established original error or signal.
Consequently there is no evidence-backed production repair, scheduling change
or before/after native regression result to report. The existing diagnostic
helper regressions test evidence retention; their success is not native release
acceptance. No deadline, fixture, oracle, GC mode or platform was changed.

Release admission remains dependent on these steps, in order:

1. Obtain and retain complete results from the predeclared hosted matrix below
   at the original pins and deadlines. Keep failed and incomplete reports as
   failures or inconclusive evidence. Passing isolated or marked variants do
   not dismiss the original witnesses.
2. Attribute a specific mechanism before editing its owning layer, then retain
   a permanent regression failing before and passing after the repair alongside
   the unchanged witnesses and Node 26 controls. Any HTTP Agent behavior repair
   belongs to #616 and must be coordinated there; #646 does not absorb it.
3. Validate the repair in bounded hosted jobs at the original deadlines. Before
   the harness's relevant CI-triggering pushes, verify the required `full-ci`
   and `gc-stress` labels, exactly one type label and `v0.35.0` milestone on
   each affected PR. Require the necessary successful CI on each final
   integrated head, including required platform suites, before changing draft
   status or admitting a release PR. Historical passes and absent reports do
   not satisfy this gate.

This records an unresolved current-release blocker, not completion of #646.
No new campaign, later-milestone work or deferred #602 work was started.

Step 3 local checks on Windows with Node 26.9.0 passed: all seven lightweight
evidence tests (serial), Prettier for this document, and `npm run check:doc-links`
(1586 links in 308 documents). These checks ran at affinity mask 3 and
BelowNormal priority; no Nona compilation or native workload ran locally.

## Review fixes: diagnostic failure handling only

Worker reports are written before worker shutdown. The controller now retains
the independent launcher's status, signal and error alongside every report and
fails any unsuccessful launcher, even when the report looks successful. Final
failure records include the launcher outcome. Evidence verification rejects
failed launchers and discrepancies between final failure flags and retained
worker outcomes; retained artifacts still include unsuccessful attempts.

Unchanged concurrent comparisons and the isolated HTTP tail now replay their
entire pinned assertion callbacks, including expected stdout and both native
and Node stderr checks. For groups with multiple programs, only the selected
comparison's results are substituted; other calls keep the original results.
Original results are restored after replay. Each comparison retains its
assertion report and a failed assertion fails the run. Marked variants remain
separate native diagnostics, whose intentional stderr markers do not constitute
an unchanged-witness pass.

Serial lightweight regressions cover a worker writing a successful-looking
report before exit 7 or termination, launcher errors, verifier rejection of
failed launchers, and exit-zero HTTP comparison/tail outcomes whose sole defect
is unexpected stderr. Positive controls still pass. These regressions exercise
diagnostic handling without building or running Nona; they provide no evidence
that the historical native execution failures have been repaired. Publication
and the bounded hosted diagnosis remain a harness handoff; this review does
not push, open a PR or start a hosted campaign.

## Fixed hosted matrix

`native-gc-diagnosis.yml` runs only for the issue-646 PR branch or explicit manual
dispatch. It has six fixed rows: assert and RegExp on `macos-15` ARM64, HTTP on
`windows-latest` x64, and each pinned group on `ubuntu-24.04` x64. Node is exactly
26.9.0. The original runner labels are retained; GitHub may update their images
or hardware, so image version, runner name, job metadata and source are recorded.
This is a bounded comparison, not recreation of the whole original suite load.

The controller writes its plan and incremental manifest before executions.
Counts below apply per row and include matching raw Node controls for every
native execution:

| Group  | Original groups | Original native/Node | Concurrent comparison native/Node | Isolated tail native/Node | Marked native/Node | Startup native/Node | Total native/Node |
| ------ | --------------: | -------------------: | --------------------------------: | ------------------------: | -----------------: | ------------------: | ----------------: |
| Assert |               3 |                  6/6 |                               2/2 |                       0/0 |                1/1 |                 1/1 |             10/10 |
| RegExp |               3 |                  5/5 |                               2/2 |                       0/0 |                1/1 |                 1/1 |               9/9 |
| HTTP   |               1 |                  1/1 |                               2/2 |                       1/1 |                1/1 |                 1/1 |               6/6 |

There are **50 native executions and 50 Node controls** across six jobs. Jobs
run in parallel on up to six independent GitHub-hosted rows, each still bounded to 55 minutes (330 runner-minutes aggregate maximum).
The controller is bounded to 35 minutes, each fixture worker to 8 minutes, and
the pinned compiler build to 10 minutes. Worker cancellation kills its process
tree. These outer bounds never increase the native execution deadline.

All unchanged witnesses run first, serially. Assert preserves both normal and
stress modes for each group. RegExp preserves all five stressed programs,
including all three nested-set programs. HTTP preserves its stressed `origins/2`
source and distinct original Node oracle source, including their watchdog policy.
The compiler remains the pinned `compileToIR`/`compileModuleToIR` → `generate`
path with its full runtime default and original host linker. Stress is enabled;
explicit original non-stress controls remain non-stress. Native deadlines remain
60000/180000 ms, Node controls 60000 ms, with original buffer limits.

Then two selected stressed witnesses run concurrently: the first/last assert
groups, Unicode/string disjunction for RegExp, and two unchanged `origins/2`
executions for HTTP. This measures selected contention only, not full-suite
interference. HTTP additionally gets its own isolated concurrency-1 tail. Next,
one separately identified native variant adds scenario-entry/end timestamps,
memory snapshots and HTTP stdout-progress timestamps on stderr. Its Node control
keeps the original source. Finally a distinct minimal startup control uses the
same full runtime/stress/compiler path (and assert or HTTP import for modules).

External sampling records process IDs, parent IDs, accumulated CPU, resident
memory and command/state where the OS exposes them, approximately every two
seconds. Sampling commands and errors are retained. Original images receive no
instrumentation. Marked entry time separates prelude/startup from scenario time
only for that distinct image; it is not a measurement of the original image's
startup. Native collection counters are hidden by the prelude; no supported
external per-process GC-time counter was found. GC mode and memory observations
are retained, but neither RSS nor elapsed time proves GC cost. Startup cost,
GC cost, contention and scenario liveness remain separate, unresolved hypotheses
until the hosted evidence supports an attribution.

## Retention and review

Before the helper overlay, setup archives the entire pinned tracked tree and
downloads original job/run metadata and raw logs. Only diagnostic helpers/scripts
are overlaid; production compiler/runtime sources and original tests stay pinned.
Each execution retains exact source/module graph and options before compilation,
compile/generate/link timings, image bytes and SHA256, original budgets, raw
stdout/stderr with hashes, status, signal, non-enumerable/nested error metadata,
raw Node results and external samples before temporary-directory cleanup.
Requests identify original, concurrent, tail, marked and startup variants.

The controller evaluates the original assertion callbacks after collecting every
program in each selected group, so an early failure cannot suppress later
programs or Node controls. Original failures and all comparison outcomes remain
in artifacts. A launcher failure, worker error, failed result or failed original
or unchanged-comparison assertion fails the run. Evidence completeness is checked
independently of native witness success: missing final/partial
reports, phases, counts, streams, image hashes, samples, timings, logs or source
provenance fail acceptance. Always-run uploads retain input/partial evidence
before execution and final/partial evidence after it, including failed runs.

Local validation is the serial lightweight test:

```powershell
node --test --test-concurrency=1 scripts/native-execution-evidence.test.mjs
```

It verifies controlled Node exit, platform-reported signal and timeout metadata;
binary retention; every helper execution branch with injected outcomes; and
complete pinned fixture composition/oracle replay, launcher failure handling and
stderr-only HTTP negatives using small serial Node controls. It never builds
or executes a Nona image. Hosted execution additionally
checks serialization on POSIX, where an actual signal result is asserted.
