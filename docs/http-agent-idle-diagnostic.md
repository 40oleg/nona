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

Each OS gets **one attempt**, five serial native builds/runs and eight Node
controls: the four original native cases and five original Node controls,
the approved two supplementary Node timing controls, and one uninstrumented
native isolation with its matching Node control. A native build has a 180000ms bound; stressed native children retain
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

| Case                          | Native GC request / module-load selection | Node controls                                                                    |
| ----------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| `original-stress`             | true / on                                 | Original unstaged false and staged true, each with original 6000ms cleanup guard |
| `normal-off`                  | false / off                               | Exact normal source with original guard                                          |
| `scalar-stress`               | true / on                                 | Same staged scalar variant with original Node guard                              |
| `trace-stress`                | true / on                                 | Same staged chronology variant with original Node guard                          |
| `server-idle-disabled-stress` | true / on                                 | Exact same isolated staged source, including its original no-op stress watchdog  |

The two additional timing controls, `node-native-stress-baseline` and
`node-native-stress-prearm-hold`, remain separate from these five case entries.
Schema 3 requires exactly five native cases and eight Node controls, in the
declared order, with no missing, duplicate or unknown cases. Each case keeps
its own strict comparison. An isolated pass cannot change an original failure;
any original mismatch still fails the campaign. This is no aggregate acceptance
or replacement for the planned full matrix.

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
unchanged in all four original cases. Stressed fixtures retain their disabled
cleanup watchdog; normal and the five original Node controls retain 6000ms.
The timing pair and the new isolation use the exact stressed no-op watchdog.
Only the separately labelled isolation disables the server idle timeout.

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

The approved native trace adds a real `res.on('finish', callback)` before
`res.end`, because pinned Nona's `_sent` schedules finish only with an actual
listener. It records code 2 once, without also wrapping response `emit` or
manually emitting finish. The existing Node response `emit` observer remains
unchanged. These are different, perturbed executions: the native listener adds
callback/allocation/GC work. Missing code 2 still fails validation, retaining
the parsed trace rows. The new native listener observer has **not yet run on
the hosted native targets**.

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

## Retained results and the last isolation

The earlier hosted evidence remains unchanged: Linux original and scalar stress
printed counter 0, while normal passed; Windows original and scalar passed.
Both scalar captures were live/free. Both old native traces lacked required
code 2 and remain failed evidence. Their overdue peer deadlines belong to
instrumented executions and cannot establish the original native cause.

The approved actual local Node pair is retained in
`work/idle616-observer-pair-once/pair.json`: baseline counter 1, delayed counter
0 after a 7007.1169ms non-CPU synchronous hold, both live/free with replacement
connection count 2 and clean process/pipe receipts. This demonstrates timing
**sufficiency in that controlled Node intervention**, not the original native
cause. Its code and receipts are unchanged; it was not rerun for this isolation.

`server-idle-disabled-stress` is the exact 2240-byte original staged stress
source with one line added immediately after actual server creation, before
`listen` or any response:

```diff
 const server = http.createServer((req, res) => res.end(req.url));
+server.keepAliveTimeout = 0;
```

The result is 2269 UTF-8 bytes, SHA-256
`39b252fd7cad09b0b578c4be1e1e144009a558b4fb867753d05d627a90ef9fbc`.
The unique insertion and exact reverse diff are checked; the hosted plan and
case report retain the original/new hashes and exact diff under `sourceChange`.
There are no added callbacks, scalar captures, clocks, trace storage or logs in
this program. `node-server-idle-disabled` runs that same source byte for byte,
including the unchanged no-op stress cleanup watchdog.

Pinned `src/lib/modules/http.js` lines 2402–2406 arm peer idle only when
`server.keepAliveTimeout` is truthy. Zero before the first response therefore
removes that competing 6000ms server idle arm in this source path. This is a
source-derived exclusion, not independent native timer telemetry. Setting zero
after the first response would not reliably clear an already armed deadline.
Client 200ms, native GC stress on, native 180000ms and Node 60000ms outer bounds,
GC/runtime/Agent code and original source helpers remain unchanged.

Both isolated children must match the entire original stdout exactly:

```text
body /first false
idle
timed out 1 true
body /second false
replacement true 2
```

A counter 0, hang, error, nonzero status, signal, stderr or incomplete pipe
receipt fails its own comparison and is retained without retries or rewritten
expectations. The single local Node isolation passed (282.8871ms process time,
status 0, empty stderr, complete pipes); raw receipts are retained under
`work/idle616-isolation-node-aYybcb/`. **Native isolation has not run.** With
the competing peer idle arm excluded, a hosted counter 1 would support the
controlled explanation; a persistent 0 would point elsewhere. Neither result
alone establishes the original cause or approves a permanent fixture/product
fix. Review actual hosted provenance before that decision.

## Retained process evidence and local checks

Each directly supervised child retains `.stdout.bin` and `.stderr.bin` raw
bytes, plus JSON for status, signal, full error fields, deadline, exit/close,
pipe end/close and elapsed times. Timeout sends SIGKILL and gives pipe cleanup
2000ms; forced pipe cleanup marks the run incomplete. Assertions happen after
receipts are written. Successful-case images are removed after verified output;
failed/incomplete-case images remain for fault replay. Source and image hashes
remain in either case.

The exact `original-stress`, `normal-off` and uninstrumented isolation compare their entire stdout,
normalizing only CRLF to LF. Only `scalar-stress` and `trace-stress` may separate
their respective observer suffix, which must occupy complete lines at the end
of stdout with its final newline. The entire preceding original output must
still match. Unknown, duplicate, malformed or extra observer/output lines fail;
trace fields must be four finite decimal numbers per row with the original
count, event and chronology checks. Raw bytes and receipts are never rewritten
by comparison, and a Node mismatch still fails the case.

For this isolation, only focused source/schema/mock checks, the single new
roughly 200ms Node control and matching inherited-strict `noEmit` check run
locally, serially at BelowNormal priority with a 4000ms validation-process bound:

```powershell
./work/idle616-isolation-run.ps1 red
./work/idle616-isolation-run.ps1 types-green
./work/idle616-isolation-run.ps1 green
```

These are retained executed-command records, not a request to retry the Node
isolation. The tests import original source generators, never the native test
or compiler. Isolation RED/GREEN and handoff are
`work/idle616-isolation-{red,green,review}.txt`; exact source, diff, raw outputs,
digests and provenance are retained alongside them. The prior 82 checks and
actual Node pair receipts remain evidence for the unchanged observer/pair code.
No local compiler build, emit, native run, GC campaign or long suite is part
of this protocol.

The independent-review comparator fix has separate RED/GREEN transcripts at
`work/idle616-reviewfix-red.txt` and `work/idle616-reviewfix-green.txt`, with the
parent handoff in `work/idle616-reviewfix.txt`.

This mode cannot make draft PR #631 ready. After a causal repair and final main
integration, all **32 stressed native + 4 normal controls**, and all required
current-head CI on both hosts, remain mandatory. Diagnostic success cannot
substitute for that validation or for serial release completion.
