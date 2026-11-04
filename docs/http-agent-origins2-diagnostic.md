# Bounded origins/2 phase comparison (#616)

This supplementary diagnostic ref investigates the Windows `origins/2` timeout
after `woken` at source commit `a632e7fdcbedc5838176978e9eb2f03ed5ee1eeb`.
The original failure is `ETIMEDOUT` at 180000 ms, with exactly:

```text
queued 2 2
woken 2 /hold0,/other1,/other2
```

Its root cause remains **unknown**. The historical helper did not retain the
image or independently timestamped raw streams. A subsequent passing observation
cannot change that failure into a pass. This adapter changes no product code,
test registration, fixture, timeout, GC policy or release requirement.

Arm A is the exact `agentProgram(origins/2, true, 'on')` program: 3108 UTF-8
bytes, SHA-256
`12620f7d6cfd9c20e591f08fb1d12765920a2995582e19efb37946e8e5e609f5`.
Arm B adds observations inside existing held-response, response-end,
request-close and socket-close callbacks, around each held response's `end`,
each conditional resolver call, the final `Promise.all(holds)`, and cleanup.
Both held paths are observed from creation. Server response observations retain
`res.req.url` alongside the expected path. The request-close record retains its
local `ended` value, with resolver records only inside the original `if (ended)`.
There are no new finish listeners, emit wrappers or recurring timers.

Both native arms run sequentially, once each, with the original 180000 ms bound.
Each corresponding Node oracle retains the six-second cleanup watchdog and
60000 ms host budget. Native sources retain the original no-op stress watchdog.
Every source is compiled in a fresh process with `NONA_GC_STRESS=on` before
module load, through the original full-runtime pipeline:
`compileModuleToIR -> generate({gcStress:true}) -> linkHost`.
Pinned Git blobs and raw source hashes cover compiler/runtime/helper/package/
build inputs; built compiler, generated sources and executable hashes are kept.
Effective GC is derived from those pinned inputs, module-load selection and
options, not independent runtime telemetry.

The three original stdout lines are checked exactly against the original Node
oracle and expected output (only CRLF normalization). B writes separately
identified stderr rows: `ORIGINS2<TAB>[phase,path,url,ended,elapsedWallMs]`.
Unknown channels, phases or paths, wrong response URLs, malformed tuples,
duplicates and missing completion rows fail comparison. Ordinary stderr cannot
be discarded or allowlisted. Partial diagnostic rows are useful for a failed
run; their raw bytes remain authoritative even when parsing fails.

The observer, elapsed clock and stderr writes perturb B. Async process
supervision replaces historical `spawnSync`; byte pipes, synchronous capture,
chunk arrival timing and sanitized environment selection are interventions too.
The recovered supervisor's original kill deadline and two-second forced pipe
cleanup allowance remain. Added receipt metadata records chunk stream/offset/
byte count/monotonic arrival time, UTC finish, and individual error events.
Node version, runner image/load and compiler-process isolation may differ from
the historical run. Neither arm establishes product acceptance; every report
sets `productAcceptance: false` independently of collection and semantic results.

Only the existing `native-platforms` workflow's explicit `diagnostic_mode:
origins2` dispatch enables the single `windows-latest` job. The reviewed full
`diagnostic_commit` must equal both checkout HEAD and event SHA on
`codex/diagnostic-616-origins2-20261104` in `40oleg/nona`. It refuses local,
self-hosted, non-Windows, non-x64, non-26.9.0, source/load/compiler override,
main-branch and mismatched-commit execution. Checkout does not persist credentials.
Normal push, PR and default manual jobs keep their original behavior outside
the explicit opt-in exclusion. This mode launches no platform matrix, browser
compiler or full regression.

The parent reviews and publishes this ref, then dispatches exactly once. No
dispatch is performed by this implementation task. There is no retry or increased
budget. A builder or native failure must not suppress the other arm or Node
oracle. The always-uploaded artifact retains source/diff, images, build/input
inventories, raw stdout/stderr, command/argv/cwd, exit/error/timeout/close/pipe
receipts and report under `work/origins2-hosted616/`. Existing evidence is never
overwritten. Only nonsecret selection fields and passed environment key names
are recorded; credentials and full environment values are not logged.

Local verification is restricted to the pure test file, VM fake events/children,
syntax and formatting, with concurrency 1, shared mask 3 and BelowNormal
priority. Compiler/native/HTTP/socket/Node-oracle execution, build/install,
stress, benchmarks and full suites remain hosted. Documentation site generation
and any link check requiring it remain pending. This reference is intentionally
unlisted from the documentation site.
