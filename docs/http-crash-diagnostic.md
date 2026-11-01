# HTTP native crash diagnosis (#602)

This is a diagnostic deliverable for [#602](https://github.com/40oleg/nona/issues/602),
not evidence of a product fix. The historical Windows `0xc0000005` was reported
at `4d75a9d9`; a timeout/cleanup mechanism remains a hypothesis. Keep the issue
open until a fault has been connected to its owning object/state and a reduced
regression fails before a demonstrated repair. A clean run after #601 is not
proof that #602 is fixed.

## Running and retaining evidence

Run the **HTTP crash diagnostic** workflow manually on the implementation ref.
It uses `windows-2025` directly, checks `RUNNER_ENVIRONMENT=github-hosted`, and
uses Node 26.9.0. There is no self-hosted fallback. `node scripts/http-crash.mjs`
also rejects local execution. No workload runs on pushes or pull requests.
Auto-merge and auto-release remain disabled.

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

Base source inspected: `69efefd6ea2c457db3bb0a1f8ef22f51305b3955` (v0.34.0).
Local validation covers the diagnostic driver's tiny Node fixtures, matrix,
error classification, partial logs, child deadlines/cancellation and cleanup.
The controlled server compiles to win32-x64. No native crash trial or soak was
run on the owner's PC. Hosted trial results: **0/57 executed; all pending**.
No crash mechanism or repair is claimed. Linux remains untested for this fault.

Validation commands: `npm run build`,
`node --test --test-concurrency=1 dist/tests/http-crash-diagnostic.test.js dist/tests/suites.test.js`,
`node site/scripts/sync-docs.mjs` followed by `npm run check:doc-links`, plus
Prettier checks on changed supported files and PowerShell syntax parsing.
These validate the harness; WER capture and hosted crash trials remain pending.

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
