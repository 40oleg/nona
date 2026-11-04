# Bounded hosted environment startup comparison (#638)

[The driver](../scripts/process-environment-startup.mjs) compares trusted baseline
`cbd9d287fd2cdd3b5e65bdc592d88e91b3fab876` (process.js blob
`e32b22cb33372868a2bf979600b78337f0f73e2e`) with the exact candidate PR head.
[The executable workflow](../.github/workflows/process-environment-startup.yml)
is the hosted entry point. PR639 remains draft pending review and hosted work.
The parent owns Git, claims, PRs, dispatch, release gates and acceptance.

## Measurement boundary and interpretation

The native fixture observes real `process.env`, sets up stdin and emits READY.
It reads seven fixed names: `NONA_CASE`, `7`, `constructor`, `toString`, `π`,
`__proto__` and `NONA_GC_STRESS` (at most eight property reads). It never enumerates
environment properties before READY or in its post-ready proof. After receiving
the synthetic manifest on stdin it compares those selected values, and checks
Windows alias get/has/descriptor/set/delete/reinsert or POSIX case distinctions.
The existing runtime Proxy/mutation behavior is unchanged. Mutations internally
publish the backing map as before; the fixture adds no environment-wide scan.

Previously READY called `aggregateEnvironment(process.env)` and the post-ready
probe scanned every key again, measuring additional quadratic Proxy lookup work.
The permanent pure regression runs the actual generated native fixture against
the actual initializer/Proxy source in a VM. It rejects enumeration at either
boundary and bounds observation folds. This diagnostic correction is separate
from the independently reviewed initializer correction.

| Scope                     | Measured                                                                                                       | Not established by this scope                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Sanitized Node parent     | Exact constructed keys/values, count, UTF-16 units, data descriptors and shape                                 | Actual native visibility                                                    |
| Sanitized Node child      | Full child aggregate before READY, full key/value shape after READY, selected/alias/mutation semantics         | Native aggregate/full shape                                                 |
| Native baseline/candidate | Real READY, fixed sentinels, selected values, alias/mutation semantics, output/status/streams, cleanup, timing | Count, UTF-16 units, full descriptors, unselected extra/missing keys/values |
| Existing pure source VM   | Actual initializer/Proxy enumeration and semantics, Windows linear initializer folds, POSIX zero folds         | Native timing or OS-visible full shape                                      |

Schema 2 records `visibility`, `readyVerified`, `parentAggregateVerified`,
`aggregateVerified` and `probeVerified` separately. Native rows require
`visibility=sampled-native` and `aggregateVerified=null`. Node rows require
`visibility=full-node-control` and a verified child aggregate. Expected parent
aggregates are recorded but never substituted for native visibility evidence.
`measurementBoundary` makes these scopes explicit in the report.

The unchanged [source controls](../tests/process-environment-source.test.ts)
independently establish initializer scaling/semantics. Historical baseline counts
were 528/2080/11325 folds for 32/64/150 Windows keys; the reviewed initializer
bounds folds by distinct keys. POSIX performs zero folds. Report source scaling
and native findings separately. This small process/stdio fixture has no sockets,
HTTP, load generator or soak. It cannot establish #602's product/57-case
acceptance, reconstruct its original environment or explain its historical
native timing. That campaign remains separate and waits for accepted pinned
#615 evidence. Neither `nativeTimingImprovementEstablished` nor
`historical602Acceptance` becomes true. `decision.pass` means only the complete
bounded protocol passed within the visibility scope above. Inspect every
contrary pair, failure, Node control and cleanup result before acceptance.

## Safe fixtures and fixed plan

No parent environment is enumerated, copied, logged or hashed. Each child and
compiler receives a new null-prototype map. Windows uses literal
`SystemRoot=C:\Windows`, `WINDIR=C:\Windows`, `SystemDrive=C:`,
`ComSpec=C:\Windows\System32\cmd.exe`,
`PATH=C:\Windows\System32;C:\Windows` and the experiment directory for TEMP/TMP.
The literal OS path must exist. Synthetic `HOMEDRIVE=C:`,
`HOMEPATH=\nona-synthetic-user`, `LOGONSERVER=\\NONA-SYNTHETIC`,
`USERDOMAIN=NONA-SYNTHETIC`, `USERNAME=nona-synthetic-user` and
`USERPROFILE=C:\nona-synthetic-user` complete all eleven entries in
[Node 26.9.0's libuv required-variable list](https://github.com/nodejs/node/blob/v26.9.0/deps/uv/src/win/process.c#L47-L59).
This prevents required-variable injection from the parent. Linux uses literal
`PATH=/usr/bin:/bin`, `LANG=C` and the experiment's TMPDIR.

Each map contains `NONA_GC_STRESS=off` or `on`, the seven sentinel names,
numbered synthetic filler, and padding containing only `p` for non-base shapes.
Initial Windows keys have unique uppercase forms. OS/stress entries count in
the totals constructed and validated in the parent and Node control:

| Shape | Entries |                               UTF-16 units |
| ----- | ------: | -----------------------------------------: |
| base  |      39 | Measured; depends on safe path and GC mode |
| few   |      40 |                                       9221 |
| many  |     150 |                                       9221 |

Units mean `1 + sum(key.length + 1 + value.length + 1)`, including equals signs,
entry NULs and final block NUL. This applies on Linux too; it is not POSIX byte
size. Construction fails if safe paths exceed fixed volume. No filtering,
parent-derived padding or deadline changes are permitted.

The default two counterbalanced pairs per shape/GC mode are
`Node, baseline, candidate; candidate, baseline, Node`. Four pairs are the only
alternative and repeat that predetermined pattern. Shape order is base/few/many;
GC order is off/on. The 36 default or 72 maximum conditions run serially.
Node's stress entry is inert and claims no V8 GC-stress coverage. Its full-control
fixture has a separate retained source/hash. Native fixture bytes/hash are
identical for baseline/candidate, both GC modes and both platforms.

## Executable hosted workflow and provenance

The workflow has `contents: read`, no secrets, persisted checkout credentials,
tags, releases, self-hosted routing or owner-PC fallback. Its fixed matrix is
`windows-latest` and `ubuntu-24.04`, `max-parallel: 1`, `fail-fast: false`, with
Node **26.9.0**. Newer heads do not cancel active comparisons. Every job checks
`runner.environment=github-hosted`; the driver also requires Windows/Linux x64,
exact Node and nonempty hosted identity fields. Each platform builds and compares
old/candidate on one machine. Linux is a separate POSIX control, never a
cross-machine Windows timing comparator.

The path-focused `pull_request` entry uses opened/synchronize/reopened events.
Admission requires repository/owner `40oleg/nona`/`40oleg`, open PR **639**
authored by `40oleg`, same-repository owner head `nona/issue-638`, and base `main`.
The helper rechecks the payload and `refs/pull/639/merge`, but checks out and
measures **head.sha**, never the merge SHA. `workflow_dispatch` requires actor
`40oleg`, selected ref `refs/heads/nona/issue-638`, and full `candidate` SHA equal
to that dispatch's `github.sha`. Supply `candidate_blob` matching that commit's
process.js Git blob and choose pairs 2 or 4. Select the branch explicitly when
dispatching; availability on the default branch remains a GitHub/manual gate.
No fork, arbitrary ref or `pull_request_target` entry is accepted.

Candidate checkout uses the admitted immutable SHA. Before dependency execution,
`--admit` derives the actual process.js blob, verifies HEAD, tracked cleanliness,
blob content, source tree and per-file hashes, and writes admission.json and step
outputs. Dispatch input pins must match the payload/derived blob. Pure admission
checks use mocked payloads; they are not a live GitHub admission observation.

Both source checkouts are fresh and dependencies use `npm ci`. The driver checks
identical lockfile/build-script hashes and unchanged process.js outside the
initializer. It builds each compiler with `scripts/build.mjs`, then reuses the
comparison build helper with explicit target win32-x64 or linux-x64, module=true,
fullRuntime=false and gcStress=false/true. Reports retain workflow event/ref/SHA,
run/attempt, runner/image/hostname/OS, Node binary hash, actual commit/tree/blob,
source/built-source/compiler manifests, fixture/build-driver hashes and actual
image hashes/sizes. Fixtures/images are rehashed before each measurement.
Windows old/new images must differ; Linux may eliminate the Windows-only branch.
Each engine's GC-off/on images must differ.

## Bounds, raw failures and cleanup

Original limits remain **60000 ms READY**, **90000 ms hard**, and **10000 ms
post-ready probe/exit**, measured from their original boundaries. Native READY
includes process initialization, fixed sentinel reads, stdio setup and ready-line
delivery; it excludes manifest parsing/mutations and environment-wide diagnostic
enumeration. Node READY includes its full aggregate scan and is a control timing.

Compiler/image builds keep their 180-second bound and five-second cleanup grace.
Timed-out Windows build trees use fixed OS taskkill /T /F; Linux uses an isolated
process group. Native fixtures have no descendants. Forced termination must be
followed by exit/close/reap and PID absence. Five seconds after the hard deadline
are for recording cleanup, never extra useful execution. SIGINT/SIGTERM retain
partial evidence and kill/reap the active child. Unverified cleanup stops
subsequent work. Abrupt runner loss cannot prove cleanup.

Raw stdout/stderr, status/signals, stream errors, duplicate/malformed/partial
protocol output, semantic errors and deadlines remain failures. No arbitrary
allowances or expected-failure exemptions are introduced. After verified build
cleanup, unavailable images do not suppress safe Node controls. Invalid source
provenance is a preflight failure. Dependency logs/statuses remain artifacts;
comparison still records build failure/Node controls when admission and pure
checks passed. The 150-minute job cap covers maximum plan/build overhead without
changing any child deadline.

Always-run artifact upload retains evidence/ and pure callback evidence. These
include admission/pure/install/driver raw logs and exit files, even on failure.
The comparison subdirectory holds incremental report.json, both fixture sources,
build driver/images, compiler/build stdout/stderr/events/results and every
started condition's raw streams/events/result. Missing artifacts, skipped jobs,
partial plans, failed install/preflight or unverifiable cleanup/provenance cannot
be accepted. Download both runner artifacts by run ID/attempt. Preserve original
failed logs; only explicit hosted identity and source/build/native files are
recorded/hashed, never an inherited environment snapshot.

## Local evidence and remaining gates

Only pure Node/VM/fake-child/schema/format/narrow-document checks run locally,
at BelowNormal priority with concurrency 1. No compiler import/build, native
emission/execution, GC workload, sockets/HTTP, full suite or long campaign is
authorized. The reviewed initializer, its source test and suites.json are
byte-for-byte unchanged.

This repair's raw evidence/handoff lives under `work/review/638-repair/`. The
boundary regression first failed against the original driver on real Proxy
enumeration; the corrected native fixture enumerates zero times at both
boundaries. Full Node controls still reject equal-volume wrong values. Mocked
child callbacks exercise the real measurement/decision code for protocol,
streams/status and cleanup; they do not prove native lifecycle behavior. The
initial stream-error RED left a non-closing fake until the existing cleanup
bound; its actual failure/status are retained, and the fake now closes in
finally. No deleted automatic638 rawwork was recovered. Historical worker
DONE/status is unchanged; initializer historical RED/GREEN regeneration belongs
to the parent separately.

Before the relevant push the parent must recheck exactly one type label `bug`,
plus `complex`, `full-ci`, `gc-stress` and milestone **29 (v0.35.0)**. Full new-head
hosted CI and actual comparisons on both hosted runners are required before
acceptance, together with inspection of contrary evidence/cleanup. PR639 remains
draft. Respect serial release completion; future milestones and the preserved
future620 base remain gated. This worker performs no Git, claim, PR, dispatch,
release or historical status operations.
