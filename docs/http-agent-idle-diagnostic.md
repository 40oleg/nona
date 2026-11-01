# HTTP Agent idle-timeout diagnostic (#616)

This is supplemental evidence for the sole failing idle-timeout witness in
Linux job 124886702153, run 41319568587. Its source pin is
`7b4b56cc7eb644870dd2cc270d82a0815618b8ae`; the earlier actual checkout
`df69dfc18094772f7a64bbdbcc3cf68a2ea82ba0` had the same tree. The native
process exited zero and printed `timed out 0 true`; its unstaged Node oracle
printed `timed out 1 true`. Both replaced the socket. Native stderr and signal
were unavailable in that old report. The earlier default server keep-alive
deadline is a source-supported hazard, **not a proven cause**.

## Dispatch protocol

The parent reviews these uncommitted changes and owns all refs, claims, GitHub
mutations and publication. On a temporary **non-release branch ref** containing
the reviewed diagnostic commit, dispatch the existing registered
`native-platforms.yml` with `mode=idle-agent-diagnostic` and
`diagnostic_commit=<exact 40-character reviewed commit>`. This delivery creates
no ref and performs no dispatch. Keep PR #631's original head and already
started CI untouched. Do not use a `v*` tag, release, main, or skip-CI commit.

Absent mode and `mode=full` retain every original PR/main/manual job, its steps
and its original condition. The explicit special manual mode runs only the
diagnostic matrix: literal `ubuntu-24.04` and `windows-latest`, Node 26.9.0 x64,
`max-parallel: 1`, test concurrency 1. There is no runner fallback. Identity
guards reject local/self-hosted execution, other events/repositories/platforms,
main/tags, wrong commit input or checkout, and compiler environment overrides.
They record the actual checkout/head/tree, source pin/tree, workflow ref, run
and attempt. Original compiler, runtime, helpers and Agent tests must match the
7b Git blobs, including checkout-filter-aware verification on Windows.

Each OS gets **one attempt**, four serial native builds/runs and five Node
controls. A native build has a 180000ms bound; stressed native children retain
180000ms, normal native and Node children retain 60000ms. The job has a 45-minute
outer budget, including dependency installation and compiler build. Any budget
exhaustion, missing case/build/control, skip, malformed receipt, truncated pipe,
nonzero exit, signal, spawn error, unexpected stderr or output mismatch fails
or leaves the report incomplete. There is no retry-for-green. A mismatch still
collects later cases and controls. Always-upload artifacts include partial
identity, sources, reports, raw output and errors even on failure. A setup or
checkout failure may leave no report; the always-run upload then also fails,
and such a run is incomplete evidence.

## Exact plan and build identity

| Case              | Native GC request / module-load selection | Node controls                                                                    |
| ----------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| `original-stress` | true / on                                 | Original unstaged false and staged true, each with original 6000ms cleanup guard |
| `normal-off`      | false / off                               | Exact normal source with original guard                                          |
| `scalar-stress`   | true / on                                 | Same staged scalar variant with original Node guard                              |
| `trace-stress`    | true / on                                 | Same staged chronology variant with original Node guard                          |

Original sources come from the unchanged `agentCases` and `agentProgram`.
The original stressed native source is byte-identical to the generated 7b
program: 2240 UTF-8 bytes, SHA-256
`3a56740f611c7b8c983180cd1f47f5fd86a2748a9eeb53f591cbb8ad721ca764`.
The normal native/original unstaged oracle source is 2015 bytes, SHA-256
`2a7ed3b3c82fce0911892574dd73f314def670a890e8ea9ee83a8b5584343abf`.
All actual native and Node source files are kept separately, without rewriting
one source over another. The original fixture and runtime files are unchanged.

Every build is a fresh Node child with `NONA_GC_STRESS=on` or `off` set **before
compiler module import**. Only `--hosted-build` imports the compiler, after
hosted identity and source guards. It calls the original helper pipeline:
`compileModuleToIR(source, entry)`, `generate(ir, {gcStress})`, then
`linkHost(program)`. No public `compile` profile, runtime pruning/link option,
or new lowering option replaces the original full-runtime generate default.
Receipts record source/image/compiler SHA-256, original source inventory,
compiled JS inventory, target, head/tree, module defaults and generate options.
The recorded actual GC setting is derived from the pinned codegen module-load
off guard, fresh-process environment and passed options; it is explicitly
labelled as derived rather than independent runtime telemetry. Normal builds
and every Node control are **not forced GC**.

## Observers and interpretation

The original client 200ms measured timeout, 2000ms API timeout elsewhere in the
untouched fixtures, and default server 5000+1000ms keep-alive deadline remain
unchanged. Stressed fixtures retain their disabled cleanup watchdog; normal
and Node controls retain 6000ms. No timer-staging repair is included.

The scalar variant computes the public Agent key before the first request.
Immediately before client rearming it only copies `socket.destroyed` and a
boolean test of the first free-list entry. There are no new clock calls,
objects, arrays, allocations or logging in that capture. It emits its primitive
values after the original behavior and cleanup. Its key and extra primitive
locals can still affect compilation/liveness; only the original case is exact.

Chronology uses 512 preallocated numeric slots (128 records), with four numbers
per record: event code, `performance.now()` timestamp, value A, value B. Overflow,
missing required events, nonfinite numbers, count mismatch or backwards time
is incomplete evidence. Records print after original cleanup and a final
immediate to drain close callbacks. No new socket/request/response is kept in
the trace, and no timeout listener is added. Wrapping `emit` delegates to the
original method and preserves its boolean result, so observing a server or
response timeout does not claim it was handled or suppress HTTP's default
destruction.

| Code   | Event                                                                     | A / B                                                                 |
| ------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1      | Peer timer arming, through existing `setTimeout` or native `_idleTimeout` | Actual delay / native `_deadline`, or -1 when Node does not expose it |
| 2      | Server response `finish`                                                  | 0 / 0                                                                 |
| 3, 4   | Peer `timeout`, `close`                                                   | Destroyed / 0                                                         |
| 5      | Client `keepSocketAlive`, after original super call                       | Destroyed / original keep decision                                    |
| 6      | Client deadline cleared by original staging                               | Destroyed / native deadline or -1                                     |
| 7      | Immediately before original client 200ms rearm                            | Destroyed / first free-list entry matches                             |
| 8, 9   | First client `timeout`, `close`                                           | Destroyed / 0                                                         |
| 10     | First request closed and immediate completed, before original `idle` log  | Destroyed / 0                                                         |
| 12, 14 | Server `timeout`, `close` emission                                        | 0 / 0                                                                 |
| 13     | First client public `setTimeout` returned                                 | Actual delay / native deadline or -1                                  |

The trace wraps real methods and adds monotonic clock reads, calls, callbacks
and storage. It **cannot be observationally neutral** under forced GC. In
particular the event timestamp follows the underlying arm, while native
`_deadline` records its actual stored monotonic deadline; Node's unavailable
deadline is not fabricated. No cause may be inferred from traced mode alone.
Correlate the exact witness, scalar liveness and both Node staging controls
before interpreting the chronology. A peer timeout/close preceding client arm
would support the timing hypothesis in that traced run; absence of that order
leaves other native deadline/event/GC mechanisms open. Hosted causality remains
pending until these artifacts exist and are reviewed.

## Retained process evidence and local checks

Each directly supervised child retains `.stdout.bin` and `.stderr.bin` raw
bytes, plus JSON for status, signal, full error fields, deadline, exit/close,
pipe end/close and elapsed times. Timeout sends SIGKILL and gives pipe cleanup
2000ms; forced pipe cleanup marks the run incomplete. Assertions happen after
receipts are written. Successful-case images are removed after verified output;
failed/incomplete-case images remain for fault replay. Source and image hashes
remain in either case.

The exact `original-stress` and `normal-off` cases compare their entire stdout,
normalizing only CRLF to LF. Only `scalar-stress` and `trace-stress` may separate
their respective observer suffix, which must occupy complete lines at the end
of stdout with its final newline. The entire preceding original output must
still match. Unknown, duplicate, malformed or extra observer/output lines fail;
trace fields must be four finite decimal numbers per row with the original
count, event and chronology checks. Raw bytes and receipts are never rewritten
by comparison, and a Node mismatch still fails the case.

Only the small source/protocol tests, tiny fake Node children and five exact
Node controls may run locally, serially at BelowNormal priority:

```powershell
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
node --test --test-concurrency=1 tests/http-agent-idle-diagnostic.test.ts
```

The test imports the original source generators, never the native test or the
compiler. RED and GREEN transcripts are `work/idle616-diagnostic-red.txt` and
`work/idle616-diagnostic-green.txt`. No local compiler build, emit, native run,
GC campaign or long suite is part of this protocol.

The independent-review comparator fix has separate RED/GREEN transcripts at
`work/idle616-reviewfix-red.txt` and `work/idle616-reviewfix-green.txt`, with the
parent handoff in `work/idle616-reviewfix.txt`.

This mode cannot make draft PR #631 ready. After a causal repair and final main
integration, all **32 stressed native + 4 normal controls**, and all required
current-head CI on both hosts, remain mandatory. Diagnostic success cannot
substitute for that validation or for serial release completion.
