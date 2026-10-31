# Queued HTTP completion verification (#601)

The deterministic baseline was reproduced on Windows x64 with Node.js 26.9.0
on 2026-10-31. The production source was commit
`6d4c6704b90d225b744bbe44fa844f9824c2c17a`, the #620 hosted-runner guard on
which this work is stacked. The initial, single regression in
[`tests/net-send-source.test.ts`](../tests/net-send-source.test.ts) was run with:

```sh
node --test --test-concurrency=1 dist/tests/net-send-source.test.js
```

The test queued a normal write followed by an HTTP `_sent` completion object,
then forced successful flushing. Its preceding assertions verified the complete
wire bytes `[1, 2, 3, 4, 5]` and an empty write queue. Delivery of the HTTP
completion still failed: only the first callback ran. The process exited with
status 1 and retained this failure:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
+ actual - expected

  [
    'first',
-   'response'
  ]

code: 'ERR_ASSERTION'
actual: [ 'first' ]
expected: [ 'first', 'response' ]
operator: 'deepStrictEqual'
```

This is evidence of lost completion after successful byte delivery. It does
not constitute a hosted native baseline or a completed soak run.

The fixed local run passed 25 focused tests: the deterministic socket cases,
the HTTP Node.js oracle regression and suite registration. The separate small
compiled ownership fixture passed with `gcStress: true`. Build, changed-file
Prettier checks, script syntax checks and documentation links also passed (the
link check requires `node site/scripts/sync-docs.mjs` first). Local test commands
used `--test-concurrency=1`; neither the 100-response transfer nor soak ran here.

The production change preserves public `write` overloads and existing terminal
behavior. The deterministic tests retain two separate T06/B04 reproductions:
an already ended/destroyed socket drops an `_sent` completion, and an immediate
send error omits the supplied completion. These cancellation defects remain
outside this successful-write forwarding fix.

The [hosted HTTP workflow](../.github/workflows/http-keepalive.yml) adds the
remaining Windows/Linux x64 checks using Node.js 26.9.0. On pull requests it
requires `full-ci`; `gc-stress` retains stress in the HTTP/socket regression
files, consistent with the standard check workflow. The workflow checks and
records the actual GitHub-hosted runner identity and never uses the owner's
self-hosted overflow runner.

The [narrow witness](../scripts/http-keepalive-check.mjs) runs the same minimal
server under Node.js and the current compiler. It requires exactly 100
sequential chunked 1 MiB responses, each made with sixteen synchronous 64 KiB
writes, using one `http.Agent({ keepAlive: true, maxSockets: 1 })` connection.
Every body must have the expected bytes and SHA-256; every response must emit
exactly one finish in order, with `writableFinished` true. Reports retain the
source, compiler and executable identity, response hashes, client event order,
typed errors, raw server stdout/stderr and exit status. Deadlines bound requests
and child cleanup.

The [soak wrapper](../scripts/http-soak-check.mjs) recovers only the two source
files from [#516's PR #603](https://github.com/40oleg/nona/pull/603), pinned at
`ab5ea083d793e0a665fde8b0a4b33bc1fa67208e`, into ignored `work/`. It builds that
server with the current compiler and runs the original five-minute command:

```sh
NONA_SOAK_MIX=big=1 NONA_SOAK_CONNECTIONS=1 node scripts/http-soak.mjs --smoke
```

The recovered harness receives diagnostic logging only; its route, duration
and pass criteria remain unchanged. Artifacts include the exact original and
executed harness, both hashes, current compiler/executable hashes, original
JSON/Markdown reports, raw server logs and process events. The original soak
report's commit identifies its recovered source checkout; `verification.json`
separately identifies the current compiler commit. Failures retain a nonzero
result and partial artifacts, with bounded process-tree cleanup.

Hosted native 100-response witnesses, the five-minute big-only smoke, existing
HTTP/socket suites, full CI and comparisons remain pending until their actual
GitHub-hosted results are available. This smoke does not satisfy #516's
three-hour, full-mix acceptance criteria. #602 remains separately tracked.

Publication stays with the parent harness. Keep the PR stacked on
`nona/issue-620`, declare `Depends on #621`, and retarget it to `main` after
[#621](https://github.com/40oleg/nona/pull/621) is integrated, before deleting
the base branch. Inherit #601's `bug` label and release milestone, and apply
`full-ci` and `gc-stress` before the relevant push. Keep
`NONA_AUTO_MERGE=false` and `NONA_AUTO_RELEASE=false`; no merge or release is
part of this step.

## CI repair investigation (2026-10-31)

The failed HTTP workflow is
[#41202372511](https://github.com/40oleg/nona/actions/runs/41202372511).
The other reported platform, bootstrap, program and Windows check runs were
cancelled; their cancelled jobs do not establish additional test failures.

The Windows access violation was reproduced locally with the pinned soak
server and a single connection, `big=1`, three seconds of load, no warm-up and
statistics sampled every 0.5 seconds. The first loaded statistics request
crashed with `0xc0000005`. The debugger stopped in `process.heapSnapshot.code`
while dereferencing the backing pointer of a dead ArrayBuffer. Large backing
allocations had already been released, but the object's small cell still had
its old kind and pointer because its class is swept lazily.

The narrow regression command, after `npm ci` and `npm run build`, is:

```sh
node --test --test-concurrency=1 --test-name-pattern="heap snapshot excludes" dist/tests/gc.test.js
```

Before the fix, the 64-byte case failed its accounting assertion and the
9 MiB case crashed with `0xc0000005`. Both now pass. They verify newly allocated
and rooted buffers as well as dead owners awaiting sweeping. Heap snapshots
check the current GC epoch before inspecting any backing pointer. The same
short local soak then completed all its criteria with no crash or failed
requests. This short reproduction does not replace the five-minute hosted
smoke or #516's long validation.

Eight focused Windows tests passed: the new regressions, existing GC checks,
the HTTP oracle regression, forced-collection socket ownership, and process
snapshot/shape checks. Build, changed-file formatting, script syntax and
documentation links also passed. All local tests used concurrency one.

The Linux artifact records PASS and the native server's expected SIGTERM at
12:51:16 UTC, followed by the wrapper's deadline at 12:54:07 UTC. The harness
itself ultimately exited with SIGTERM when cleaned up. Its shutdown stall
remains unresolved; a successful workload report is not a successful harness
exit. The wrapper retains its deadline and original pass criteria. Subsequent
runs additionally retain `harness-exit.json` when the recovered harness enters
its JavaScript exit listeners, and record the harness process's `exit` and
`close` events separately. This distinguishes a shutdown stall from output
descriptors remaining open after process termination. Linux execution is not
available in this Windows checkout; a hosted rerun is still required.
