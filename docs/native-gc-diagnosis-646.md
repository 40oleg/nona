# Native GC execution diagnosis (#646)

This records step 2 diagnostic support and the inconclusive step 3 admission
review. No production repair or release admission is established.
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
run one at a time, each bounded to 55 minutes (330 runner-minutes total maximum).
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
in artifacts. A worker error, failed result or failed original assertion fails
the run. Evidence completeness is checked independently: missing final/partial
reports, phases, counts, streams, image hashes, samples, timings, logs or source
provenance fail acceptance. Always-run uploads retain input/partial evidence
before execution and final/partial evidence after it, including failed runs.

Local validation is the serial lightweight test:

```powershell
node --test --test-concurrency=1 scripts/native-execution-evidence.test.mjs
```

It verifies controlled Node exit, platform-reported signal and timeout metadata;
binary retention; every helper execution branch with injected outcomes; and
complete pinned fixture composition/oracle replay using small serial Node
controls. It never builds or executes a Nona image. Hosted execution additionally
checks serialization on POSIX, where an actual signal result is asserted.
