# HTTP native crash diagnosis (#602)

This is a diagnostic deliverable for [#602](https://github.com/40oleg/nona/issues/602),
not evidence of a product fix. The historical Windows `0xc0000005` was reported
at `4d75a9d9`; a timeout/cleanup mechanism remains a hypothesis. Keep the issue
open until a fault has been connected to its owning object/state and a reduced
regression fails before a demonstrated repair. A clean run after #601 is not
proof that #602 is fixed.

## Running and retaining evidence

Publish the reviewed update of existing **draft PR630** with `full-ci` already
present. The **HTTP crash diagnostic** workflow accepts `pull_request` opened,
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
including on manual runs. PR and manual campaigns share one concurrency group;
each run retains the 35-minute job timeout.

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
  including fault PC), actual loaded module bases (`lm`, `!peb`), best available
  stack (`kv`) and `!analyze -v` with Microsoft symbols. Match dump PID to the
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
Hosted trial results: **0/57 executed; all pending** (0/19 Node controls,
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

The next experiment is the first hosted matrix at the implementation SHA,
retaining raw artifacts regardless of outcome. If it produces no native fault,
repeat the exact reference/traced controls with the historical `4d75a9d9`
compiler and the #601 before/after compiler commits on the same hosted image.
First determine whether the second request stalls and whether queued output
survives until close; compare listener variants with matching queue/close
sequences. Preserve historical fault signature (exception code and PC relative
to the image base) before reducing concurrency or route topology further.
The #601 before/after evidence is still needed; this work does not assert that
dependency has been satisfied or close #602.
