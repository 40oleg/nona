# HTTP native crash diagnosis (#602)

This is a diagnostic deliverable for [#602](https://github.com/40oleg/nona/issues/602),
not evidence of a product fix. The historical Windows `0xc0000005` was reported
at `4d75a9d9`; its original cause remains unknown. Keep the issue
open until a fault has been connected to its owning object/state and a reduced
regression fails before a demonstrated repair. A clean run after #601 is not
proof that #602 is fixed.

## Bounded environment count versus volume diagnostic

The distinct **`env-602`** option in `native-platforms.yml` prepares six serial
trials on one literal GitHub-hosted `windows-2025` x64 runner with Node **26.9.0**.
It is source preparation only: the parent must retain all ten outcomes of campaign
**41431845892** and verify that campaign is authoritatively terminal before any
new dispatch. PR630 stays draft at `3f199321d8fd543257d04f7680609ca1b459fa9e`.
No dispatch, product cause/fix, full57, merge or release acceptance follows from
these source changes.

The fixed order is **base Node, base Nona stress, many Node, many Nona stress,
few Node, few Nona stress**. All use the original reference source, original
listeners/keepalive, c32, four rounds, 64 KiB × 16 chunk payload, selected-port
protocol and 22-second observation. Startup/hard child limits remain 60/90 seconds;
the campaign/job limits remain 20/35 minutes. Six child caps give nine nominal
minutes, not an absolute wall-time guarantee for restoration, I/O and cleanup.
There is no compiler invocation, rebuild, SDK setup or live CDB sampling here.

The driver must descend `8fdac26b6460227deb8cd87e109d10f4f4b01680` and accepted
main `ba94164b6573eef306b87a59d0b174630973e364`, preserving the exact 8fd `src`
subtree, including no working-tree changes or extra untracked source files. Its
HEAD/tree/src identity is separate from the retained image producer at original
3f/tree `054e3768db264be6728a0bc530d5ba0a4078349f`. The existing restore path keeps
the original run **41337528064**, artifact **13099115124**, ZIP SHA-256
`2e60c99f112f3140b9da9ae91e48add5b948b178f0fb82be88a9eeadc423327e`, provenance,
ZIP inventory/path/size/link/overwrite protections, original successful build
receipt and assembly. Reference source SHA-256 stays
`bd8e4abac8b6cde1af33a8dd717882ab34a0e894243fd8bb2e75c04b4d380eda` and must
equal current `serverSource(true)` bytes. Native stress image SHA-256 stays
`23bfce34206002318c362f7c285eef3dc3547901113b8146fd9e8f7153a770d7`.

Before restoration `GH_TOKEN` injection, guarded `--verify` writes an exclusive
`work/http-startup/env-boundary-provenance.json` receipt bound to repository,
owner/manual event/inputs, temp ref, exact driver/workflow SHA/ref, run/attempt,
runner and source ancestry. It records **aggregate counts and UTF16 units only**,
never parent key names, values, credentials, environment dictionaries or secret
hashes. This measures current logical aggregate pressure; it does not reconstruct
an old OS environment. A separate `env-owner.json` records the executing driver.

`env602-utf16-v1` defines block units as `1 + sum(key.length + 1 + value.length + 1)`
(final NUL, equals signs and entry NULs), using JavaScript UTF16 `string.length`, case
canonicalization and final trusted DIAG overrides. Base is the unchanged
`startupChildEnv` allowlist plus those original DIAG settings. Let its metrics be
Bk/Bu and the saved parent metrics Pk/Pu. Many generates K = Pk − Bk synthetic
case-unique ASCII keys and exactly U = Pu − Bu added units. Few generates exactly
**one** synthetic key with the **same U**, including names, equals and NULs. All
real base entries are identical in all conditions. Missing, nonfinite, fractional,
negative, colliding/aliased/invalid names, K ≤ 1, U ≤ 0, insufficient name headroom,
over 256 synthetic keys or over 32767 total UTF16 units reject the experiment.
There is no clipping, fallback or caller-supplied padding. Children receive only
the safe base, internally generated padding and trusted DIAG flags. Generated
environments go directly to `runTrial`; restoration helpers use the old sanitizer.

Artifact and cleanup helpers separately admit env-602 through the verified receipt;
the legacy `startup-602` admission and unchanged-src gate stay intact. No mode is
spoofed. Cleanup admits only exact recorded Node/reference, retained native/port,
or inventory/extraction helper commands, checking PID, parent PID, recorded exact
creation time, executable/name and internally compared command identity. It never
serializes live command lines or environments. Bounded registration queries and
cancellation fallback cover both trial runtimes and restore helpers. Reused/foreign
identities stay untouched and make cleanup fail. There are no process-name sweeps.

Only env-602 gets a run-ID/run-attempt-unique **top-level** concurrency group;
full/push/PR/legacy grouping stays unchanged. Every normal job excludes env-602,
and the old startup job admits only startup-602. The new job has read-only
contents/actions permissions and no shared job group or self-hosted runner.

`env-boundary.json` is incremental and always uploaded with partial raw streams,
provenance, hashes, aggregate/condition metrics, fixed order, wall/trial timings,
completed/missing conditions and cleanup receipts. Existing raw client events
give a readiness **upper bound** at the first request, not an invented exact
ready timestamp. The strong oracle requires settings/ready, all 128 correct
responses, full request/socket/termination lifecycle, status/chunked bytes, clean
stderr, no dropped output, original workload and the full observation window.
Every timeout/fault/wrong output/operational error or missing raw evidence stays
failing/nonzero; later planned trials are still attempted unless interrupted.
`productFix:false` and `full57Accepted:false` always remain. A single fixed-order
many/few difference is conditional sensitivity evidence, not definitive historical
cause or native GC/helper ownership.

Shard reporting now names each null/malformed-settings trial and its raw failure
reason, and independently checks source, build and timing evidence for later rows.
It invents no settings and changes no raw ordinary/destroy verdicts, original
full57 plan/holds or stressed-destroy acceptance policy. Local checks use only
small serial pure Node/VM/fake-child/source, syntax, format and strict no-emit
validation; HTTP/native/compiler/build/full suites remain hosted.

## Canonical 57-trial collection in ten shards

The reviewed collection budget repair replaces the single default 57-trial
workflow process with **ten serial hosted Windows jobs**: shards 1–9 contain
six consecutive trials each, and shard 10 contains trials 55–57. Each of the
19 unchanged configurations keeps its Node / Nona-off / Nona-stress trio on
one host. IDs, order, source bytes, readiness-before-clients, c32, GC and compile
options, payload/oracle, four keepalive rounds and all observation windows stay
unchanged. The CLI requires an explicit fixed selector, for example
`node scripts/http-crash.mjs work/http-crash --shard 1`; arbitrary subsets and
implicit unsharded execution are unavailable. The original full57 evaluator
still rejects a six-trial matrix.

Each process retains the **20-minute** campaign cap; each literal
`windows-2025` job retains **35 minutes**, Node **26.9.0** and the eight-minute
SDK step. Startup / child / compile bounds remain **60 / 90 / 120 seconds**;
reference observation remains **22 seconds**, controlled observation **8.5–15
seconds**. Six child caps plus four compile caps give a nominal 17-minute timer
envelope, not a wall-time guarantee for setup, cleanup or I/O. Ten jobs can take
more than twenty minutes combined. Matrix `max-parallel: 1` and
`fail-fast: false` let later shards collect evidence after an earlier failure.
There is no workflow/job concurrency group: its single pending slot can replace
sibling jobs. The parent must check actual active campaigns before **one**
manual exact-head dispatch; this workflow provides no cross-run lease.

The integrated full57 campaign must include accepted main
`ba94164b6573eef306b87a59d0b174630973e364` and pinned #601 dependency
`47193961f3bf9b69c0177d5522de3db1069447df` as verified ancestors before install
or build. It records the exact new source SHA/tree, per-image source/image hashes
and successful build receipts. **This is a new compiler and new image evidence**,
not the retained compiler/image at `3f199321d8fd543257d04f7680609ca1b459fa9e`.
The reference blob remains `51e15fbb68eda99909e4afe2fd3f225d8aeed07e`.
Retained startup sources, compiler/image pins, old diagnostic proofs and startup
inspector runs remain independent and unchanged. PR630 remains draft at its old
head until separately reviewed product and current-head hosted acceptance.

Each job always collects exceptions/PC/modules/stacks/dumps through the existing
`collect -Startup602` path, which omits environment/command-line expansion, and
always cleans WER keys and attempts partial uploads. A small proof artifact is
named by run, attempt and shard, separately from large native images/assembly and
dumps. It contains matrix/acceptance/provenance/runner receipts, actual fixture
sources, raw trial/termination/client/stdout/stderr files, all attempted build
logs/receipts and a byte-length/SHA-256 manifest. Missing or failed uploads fail
the job. A shard receipt can set only `shardAccepted`; `fullAccepted` stays false.

The authorized aggregate runs after all shards even when jobs fail. It downloads
only the ten exact current-run/current-attempt proof artifacts into isolated
directories, checks distinct artifact IDs and manifests, and re-evaluates all
raw evidence. Cached acceptance flags are not evidence. Exact source/tree,
workflow/event/run/attempt, Node, reference/dependency/main ancestry and source
bytes must agree. Every trial appears once in canonical order within its owning
shard, with same-host matching controls and ten preserved runner records; runner
names need not be globally unique and the aggregate never invents a common host.
Missing, duplicate, extra, stale, relabelled, corrupt, mixed, interrupted or failed
proof cannot pass, nor can failed/skipped/cancelled matrix jobs. The aggregate
writes and uploads a failing report when evidence is incomplete. Forced whole-run
cancellation can prevent aggregation and never constitutes acceptance.

Full collection may honestly remain red: the six stressed destroy configurations
still have **no intended-destroy acceptance extension**. Actual matching stressed
raw proof and separate review must precede any extension. Raw `client-error`
remains `client-error`; `productFix` remains false. The actual old **45/57 failed**
campaign is preserved and supplies no new-head acceptance. This change repairs
evidence collection budgeting; it establishes neither an original cause nor a
runtime/compiler/product repair. Full/native validation remains hosted only.

## Hosted evidence and startup follow-up (2026-11-01)

[Run 41337528064, job 124940395131](https://github.com/40oleg/nona/actions/runs/41337528064/job/124940395131)
at `3f199321d8fd543257d04f7680609ca1b459fa9e` **failed**, completing 45/57
trials before the original twenty-minute bound. Node and Nona/off each produced
12 clean observations and three `client-error` observations. All 15 attempted
stressed trials reused only two images: 14 reached the original 60-second startup
deadline; the last was interrupted at 39.856 seconds. None produced stdout,
stderr, settings, readiness or requests. All four compiler children exited 0
(about 8–9 seconds). No native-fault exit or WER dump was observed before
deliberate SIGKILL. These facts establish neither a runtime/GC cause nor a repair.
The earlier pre-launch status recorded below is historical and superseded.

The next experiment is **optional `startup-602` mode of the already registered
`native-platforms.yml`**, rather than another 57-trial campaign. Parent review and
publication remain mandatory: leave PR630 draft at its existing head and preserve
its CI. The coordinator may publish the reviewed diagnostic commit to a temporary
same-issue `issue-602-startup-*` branch and dispatch the registered workflow there:

```sh
gh workflow run native-platforms.yml --repo 40oleg/nona \
  --ref issue-602-startup-<review-id> \
  -f diagnostic_mode=startup-602 -f diagnostic_sha=<exact-reviewed-commit>
```

This document does not authorize this worker to publish or dispatch. The default
`full` input preserves every original manual/PR/main job and condition. Special
mode admits only one literal `windows-2025` job, with Node **26.9.0 x64**, no
self-hosted fallback, and serial attempts/concurrency one. Guards check repository,
manual event, temporary non-main/non-tag ref, exact input/event/checkout/workflow
commit, tree, hosted identity, unchanged compiler `src` tree from the retained
head, and pinned #601 ancestor. New workflows absent from main cannot bootstrap
through dispatch; this mode deliberately uses the registered workflow.

One attempt per probe, in order:

1. **Exact retained stressed reference first**, from artifact `13099115124` of
   the run above. Verify original ZIP SHA-256
   `2e60c99f112f3140b9da9ae91e48add5b948b178f0fb82be88a9eeadc423327e`,
   retained source/build/provenance, and image SHA-256
   `23bfce34206002318c362f7c285eef3dc3547901113b8146fd9e8f7153a770d7`.
   Download/extraction occurs only after hosted guards. Validate every ZIP path,
   alias, size and link mode before extraction; never substitute a regenerated
   image. The original artifact lacks a compiler-binary digest: record that
   limitation, its exact compiler source tree, original build entry and options.
2. Console-only native stressed marker.
3. Console marker, first `process.stdout` access, then stream write and markers.
4. HTTP import only, then console marker.
5. Minimal HTTP create/listen, with import/create/listen-callback markers.
6. One instrumented original reference with literal markers after import,
   process access, JSON, big string, create and listen callback.
7. If the remaining original campaign budget permits, one exact-retained-source
   `compileModuleToIR` → `generate` → `linkPe` comparison. This is a different
   pipeline, not a second retained baseline. Public `compile` collects source
   usage and calls `requestLink`; helper `generate` defaults to `fullRuntimeLink`.
   Both prune builtins. Retain actual paths/options, selected links, compiler
   file hashes, source, assembly, image hashes and raw child status.

Startup remains **60 seconds**, child hard bound **90 seconds**, compiler bound
**120 seconds**, campaign **20 minutes**, with actual GC stress enabled. As in the
original campaign, the campaign clock starts in the driver after workflow
installation/build/SDK preparation, and includes artifact restoration and all
probe builds. Reference probes retain the server/API/client timers, four bounded
requests and 22-second observation, using one client in this startup experiment.
The small finite/listen probes send no workload. The old 57-trial matrix, fixture,
timers, PR trigger and default fault collector remain compatible. No retry-for-green or local
native/image/debugger execution is allowed.

For the unchanged retained image, external process queries sample CPU time and
working/private bytes near 5/15/20/30/40/50 seconds while still pre-ready. CDB
attempts small text snapshots near 20/40 seconds, with at most five seconds each,
inside the original wall deadline. Microsoft documents
[`-pvr`](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/cdb-command-line-options)
as noninvasive without suspending the target, unlike ordinary
[noninvasive attach](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/noninvasive-debugging--user-mode-).
The command records modules, thread registers and stacks, then
[`qd`](https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/qd--quit-and-detach-).
There are no symbol-server waits or new memory dumps in live inspection. Running
thread contexts can be unavailable/inconsistent; retain raw PC/module bases and
base-relative addresses when possible. Start/end/elapsed/PID/attach-mode/exit/
timeout and partial stdout/stderr are retained, including failed capture. Missing
capture is incomplete evidence, never an inferred stack. Inspection is aborted
and awaited with the trial; child deadline runs independently. The always cleanup
step also checks recorded child PID/parent/creation time before stopping it.

Startup children receive only an explicit, case-insensitive allowlist of needed
Windows OS/PATH/temp/SDK fields, hosted identity/provenance and PORT/DIAG/GC/cache
settings, through `scripts/http-startup-env.mjs`. This includes native probes,
compiler children, Git helpers, PowerShell inspectors, artifact helpers, SDK
installation and fault analysis. Unknown variables and credentials never pass
this boundary. Only the parent artifact API fetch retains its required token;
headers and environment values are never logged. Live snapshots omit `!peb`,
which [displays environment and command-line data](https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/-peb).
Startup fault analysis uses the collector's opt-in `-Startup602` command set to
omit process/environment expansion and derive the fault module base from `lm`.
The default collector and its original campaign retain their existing behavior.
Raw receipts and full WER child dumps remain retained; this is prevention before
spawn, not filtering or redacting captured evidence.

Static HTTP dependencies evaluate before the fixture's first statement, even a
marker textually above the import. Native `console.log` uses `rt.log` → `rt.write`
→ `WriteFile`; `process.stdout` lazily initializes stream machinery. Source:
`src/runtime/io.ts`, `src/runtime/console.ts`, `src/lib/runtime/process.js` and
`tests/helpers/host.ts`. The helper's 180-second stress allowance is a hypothesis
to investigate, not permission to alter the 60-second campaign bound. Markers
change demand, allocations, roots and potentially linking; even external
inspection perturbs scheduling. No marker variant or assembly listing alone
establishes a GC cause. Preserve the baseline and report observer effects.

The workflow always retains `work/http-startup/`, including `startup.json`,
separate workflow/event/head/tree/dependency provenance, original ZIP/extraction
inventory, API and retained-build verification, per-probe source/build/link/hash/
assembly/status receipts, partial output, CPU and CDB receipts, cleanup and the
original WER collector outputs. Fault/infrastructure failures stop the plan;
timeouts remain failures. Budget exhaustion or unavailable evidence is bounded
incomplete. Hosted causality and any product regression/repair remain pending.

## Separate scenario acceptance

Aggregate acceptance requires the independently built original 57-trial plan,
including every parameter, runtime, GC mode, ID and order. The driver and
validator share `scripts/http-crash-plan.mjs`; an artifact cannot redefine the
campaign by trimming its own plan. Empty, partial, altered, duplicate, extra or
reordered plans/results and missing or inconsistent completion metadata fail.
Per-row evidence can still establish intended destruction in a partial campaign;
it cannot make that campaign complete or set `productFix` to true.

`classifyTermination` and raw `matrix.json`/trial/client/server records remain
unchanged. `acceptance.json` adds an independent per-row `acceptance` field and
`productFix: false`. `intended-destroy` is permitted only for a unique, matching
Node/native-off pair with the same scenario/source/cardinalities, one request per
client, zero responses/wrong output/hangs, exactly one `ECONNRESET` / `socket hang
up` per client, and positive queued bytes followed by explicit destruction before
`end()` on every server connection. Both members need complete matching raw
reports, settings/readiness, clean stderr, zero dropped bytes, sequential uncapped
traces, client closure, ordinary coordinated observation-complete termination,
source/provenance and successful native compiler receipts. No arbitrary
`client-error` or state-only exception is admitted. Stressed intentional-destroy
acceptance remains incomplete until its own matching evidence exists.

Exact retained text for pairs 13/14 (original, c1), 25/26 (original, c32), and
37/38 (no listeners, c1) is copied into a pure regression fixture, with no native
images. Tests exercise these payloads and negative corruption of either member.
The six raw verdicts stay `client-error`; only their separate scenario acceptance
changes. The actual **45/57 + 14 startup failures + one interruption still fails**.
All other client errors, native faults (including missing dump/provenance), wrong
output, unexpected exits/signals, hangs, startup failures, missing/truncated data
and incomplete/interrupted matrices fail or remain incomplete. This is diagnostic
infrastructure acceptance, not #602 product acceptance or permission to close it.

Local validation uses only the separate pure/source/fake-child test files, serial
at BelowNormal. Do not run `http-crash-diagnostic.test.ts` locally: it imports the
compiler and contains a native test. RED/GREEN logs and parent handoff are in
`work/review/602-*-red.txt`, `work/review/602-pure-green.txt` and
`work/review602-startup.txt`. No build, full suite, native compilation, artifact
image download/execution, debugger/provisioning or startup campaign ran locally.

## Original campaign (preserved)

The original **draft PR630** campaign uses `full-ci`. The **HTTP crash
diagnostic** workflow accepts `pull_request` opened,
reopened, synchronize and ready-for-review events only for PR630 when both
repositories are `40oleg/nona` and that label is present. Draft status does not
block the job. Other PRs cannot start this campaign. Parent review, publication
and label readback remain with the coordinator.

The workflow retains manual `workflow_dispatch` for a registered workflow.
The PR event path permits the first launch while the workflow is absent from
default `main`; it does not require merging this diagnostic PR first.
The checkout explicitly selects the exact PR head SHA (the selected event SHA
for manual runs), rather than GitHub's synthetic PR merge checkout. See
[GitHub's PR event and checkout semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request).
Full history is fetched, credentials are not persisted, and Git must verify
`47193961f3bf9b69c0177d5522de3db1069447df` as an ancestor before any build or trial,
including on manual runs. The current ten-shard workflow described above replaces
the original single process and shared concurrency group; each Windows shard
retains the 35-minute job timeout.

It uses `windows-2025` directly, checks both
`RUNNER_ENVIRONMENT=github-hosted` and Windows identity, and uses Node 26.9.0.
There is no self-hosted fallback. `node scripts/http-crash.mjs` also rejects
local execution. Auto-merge and auto-release remain disabled.

All trials and compiler children run serially. The campaign stops after twenty
minutes, on cancellation, an infrastructure failure, or the first native fault.
Server startup is limited to 60 seconds; every server has a separate 90-second
hard deadline. The normal observation window is at least 8.5 seconds, adjusted
to the reported keep-alive timeout plus buffer plus 1.5 seconds, capped at 15
seconds. The reference observes for 22 seconds. `timeoutWindowCovered` records
whether the window covers the settings actually reported. Unknown properties
are recorded as `"undefined"`, never treated as known defaults.

The driver kills its direct children, destroys its clients and clears timers
before returning. Each server is a fresh isolated process. There are at most 32
connections, one outstanding response per connection, four requests per client,
and 1 MiB per response. There are no invalid FFI calls or intentional faults.
Tests of the driver use only tiny Node children and one client.

The workflow always uploads `work/http-crash/`, including after failures:

- `provenance.json`: workflow SHA/ref, event SHA/ref/action, PR head/draft state,
  actual checkout head/tree, Git's pinned #601 ancestor result, runner identity
  and accepted #601 control references. Rejected provenance is retained too.
  Event/workflow SHAs may differ from the source head; they are recorded
  separately. A mismatch or unverifiable dependency fails before the campaign.
- `runner.json` and `matrix.json`: actual runner/image version, source SHA,
  Node version, complete planned trials, completed counts, verdicts and next
  experiment. The initial matrix is saved before compilation, then after each
  trial and in the driver's final cleanup.
- `trial-N/trial.json`: source and image SHA-256, runtime/GC mode, fixture,
  listener selection, concurrency, route/write sizes, port/PID, settings,
  timing/deadlines, response counts and exact termination code/signal/hex/error.
- `trial-N/stdout.log`, `stderr.log`, `client.jsonl`: raw server events and
  client event order, response status/headers/body validation, reused-connection
  observations, timeouts, errors with type/code/message and termination.
  Each raw output stream is capped at 4 MiB; discarded bytes are counted.
  Controlled server state traces are capped at 2048 events.
- Generated source, matching executables and `.asm` listings, plus compiler
  stdout/stderr and termination records. Listings describe the compiled user
  functions. The PE backend does not currently export a matching runtime
  function/source map; this workflow does not invent one or require B13.
- `dumps/`, `dump-index.json`, `windows-fault-events.json`: per-image WER full
  dumps, dump hashes, CDB raw exception context (`.exr -1`, `.ecxr`, registers
  including fault PC), actual loaded module bases (`lm`), and best available
  stack (`kv`). The current shard collector uses its existing no-environment
  `-Startup602` mode; the general collector remains unchanged. Match dump PID to the
  trial PID, then use that trial's binary hash and assembly. Missing dumps for
  a native fault make collection fail as incomplete evidence.

WER is configured only on the disposable hosted runner for `nona-http.exe` and
the Node control. The driver stops at the first native fault to preserve the
bounded dump retention. Debugger installation is a prerequisite; collection
still retains dumps and raw logs if symbol download or analysis fails. CDB
analysis has a sixty-second deadline per dump. Registry keys created for this
run are removed in an unconditional cleanup step. See Microsoft's
[WER configuration](https://learn.microsoft.com/en-us/windows/win32/wer/collecting-user-mode-dumps)
and [Windows debugging tools](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/debugger-download-tools).

## Exact trial matrix

Each configuration below runs once under Node 26, once under Nona without GC
stress and once under Nona with collection/poisoning on every allocation. Node's
GC mode is recorded as `n/a`; the workload is otherwise identical within each
configuration. Total: **57 trials**, comprising 19 Node controls and 38 Nona
trials (19 normal, 19 GC stress).

| Fixture            | Listener selection | Concurrency | State/workload                                                                             | Writes per response | Configurations |
| ------------------ | ------------------ | ----------- | ------------------------------------------------------------------------------------------ | ------------------- | -------------- |
| Reference          | Original           | 32          | Repeated `/big` keep-alive                                                                 | 16 × 64 KiB         | 1              |
| Controlled         | Original / none    | 1 / 32      | Repeated keep-alive, paused peer with explicit timeout, drained idle, destroy after writes | 16 × 64 KiB         | 16             |
| Reduced controlled | Original / none    | 4           | Destroy after writes                                                                       | 4 × 16 KiB          | 2              |

The immutable reference fixture is the entire original
`bench/http/soak-server.mjs` from #603 at `4d75a9d9`, Git blob
`51e15fbb68eda99909e4afe2fd3f225d8aeed07e`. Its routes and listener/closure
topology are retained; only a settings print is appended to the generated
copy. The client workload is deliberately bounded, so this is not the full
historical soak campaign.

The controlled fixture retains all routes and the server-level `connection`,
`clientError` and `error` handlers. `original` retains request/response error
listeners and socket error/close listeners. `none` disables those four
registrations for `/big`; the unused `/slow` close handler remains in the source.
Tracing runs inside existing handler bodies and after writes/end, without
adding socket/response observation listeners. The reference has no state
tracing to avoid attributing changes from instrumentation to a repair.

`queued-timeout` pauses client reads and explicitly requests a 1000 ms socket
timeout after `end()`. `idle-timeout` drains one response then leaves the
connection idle. `destroy-queued` destroys the server socket immediately after
the synchronous writes, before `end()`. These are **attempted states**: OS
buffers can drain the entire response despite a paused peer. Inspect
`socketQueued`, `responseQueued`, `ended`, `destroyed`, actual socket timeout,
socket ID and event sequence before calling a state queued, timed out or idle.
The controlled trace reads the numeric public `socket.timeout` first, then
Nona's internal `socket._timeout` as a diagnostic fallback. `timeoutSource`
records `socket.timeout`, `socket._timeout` or `unavailable`; an unavailable
timeout is explicitly `null`. A zero timeout is retained. This reads the
effective value at each event rather than substituting the requested timeout.
Absent queue properties remain absent in the raw trace; they do not prove an
empty queue. A changed failure class during minimization is a different result.

Verdicts distinguish `native-fault`, `hang`, `wrong-output`, `client-error`,
startup failure/timeout, interruption and infrastructure failure. Intentional
destroy trials can produce client errors; they remain recorded as client
errors. `observed-no-fault` means only that the bounded observation completed
without a detected fault. The terminal driver kill is explicitly distinguished
from spontaneous exit. Non-clean outcomes make the workflow fail while
preserving the evidence; no green run establishes a fix.

## Results and next experiment (2026-11-01)

The original base inspected was `69efefd6ea2c457db3bb0a1f8ef22f51305b3955`
(v0.34.0). The current diagnostic branch **explicitly includes #601**, pinned
at `47193961f3bf9b69c0177d5522de3db1069447df`, through parent-provided local
merge `594c92467b87c58a3a53967b3d35b499e13b24a4`. This stack is authorized by
[coordinator claim 6562051439](https://github.com/40oleg/nona/issues/602#issuecomment-6562051439).
The separately accepted Windows/Linux focused #601 controls are recorded in
[PR622's acceptance note](https://github.com/40oleg/nona/pull/622#issuecomment-6562034633)
and [hosted run 41314077453](https://github.com/40oleg/nona/actions/runs/41314077453).
Their references, including the Windows artifact ID/hash, accompany every
diagnostic provenance report. These controls do not establish historical crash
repair. PR630 remains draft, `Part of #602` and **Depends on #622**; #601 final
acceptance, #622 merge, final main integration and current-head full CI still
gate PR630 merge.

Earlier local validation covered the diagnostic driver's tiny Node fixtures, matrix,
error classification, partial logs, child deadlines/cancellation and cleanup.
One earlier tiny native instrumentation test on win32-x64 used one connection, a
64-byte response and a 200 ms observation window. Its `queued-timeout` end
event contains `timeout: 1000` with `timeoutSource: "socket._timeout"`. The
same regression fails with the pre-review fixture because the timeout is
omitted. The Node control records `timeoutSource: "socket.timeout"`.
No native crash trial or soak was run on the owner's PC.
Before the first hosted launch, trial results were recorded as
**0/57 executed; all pending** (0/19 Node controls,
0/19 Nona normal, 0/19 Nona GC stress). The tiny test does not count toward
the hosted matrix or establish a completed non-reproduction result.
No crash mechanism or repair is claimed. Linux remains untested for this fault.

### Hosted launch repair awaiting publication and proof

The earlier dispatch-only implementation could not bootstrap: the workflow was
absent from default `main`. On 2026-11-01, this launch attempt:

```sh
gh workflow run http-crash-diagnostic.yml --repo 40oleg/nona --ref nona/issue-602
```

returned exit status 1 and:

```text
HTTP 404: workflow http-crash-diagnostic.yml not found on the default branch (https://api.github.com/repos/40oleg/nona/actions/workflows/http-crash-diagnostic.yml)
```

No run, hosted runner, trial artifacts or fault evidence was created by that
attempt. The PR630/full-ci trigger repairs this launch path in source; actual
hosted execution remains pending coordinator review and publication. The remote
PR head at this review was `d0415dda2f2d4ce48dd5193deb7131b0054ec94d`; the
included #601 stack and launch repair have not yet been published. After the
parent's normal push, verify the hosted run's workflow/event/source identities,
ancestor check and runner identity, then retain run/artifact links, exact
completed/pending counts and verdicts here. Keep #602 open.

Launch-repair validation is source-only, with Node children at BelowNormal and
test concurrency one:

```sh
node --experimental-strip-types --test --test-concurrency=1 tests/http-crash-workflow.test.ts
```

The pre-fix failure is retained in `work/review/602-launch-red.txt` and the
post-fix result in `work/review/602-launch-green.txt` for parent review. This
separate test never imports the compiler or native diagnostic test module.
Changed-file Prettier checks and `node site/scripts/sync-docs.mjs` followed by
`npm run check:doc-links` check documentation (verify the generated target is
inside this worktree with no junctions before syncing). No local build, native
acceptance test, load or campaign is part of the launch repair. WER capture,
all 57 trials and current integrated-head CI remain hosted and pending.

The startup follow-up described above supersedes the former proposal to repeat
the broad matrix. Preserve historical fault signature (exception code and PC
relative to the image base) if a fault is observed. Startup checkpoints/CPU/stack
and matching control evidence must precede speculative runtime changes. The
#601 before/after causal comparison remains outstanding; this work does not
establish a #602 mechanism or close the issue.
