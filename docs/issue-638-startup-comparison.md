# Bounded hosted environment startup comparison (#638)

[The driver](../scripts/process-environment-startup.mjs) compares the accepted
baseline `cbd9d287fd2cdd3b5e65bdc592d88e91b3fab876` with one immutable
candidate head that includes both #638 steps. The baseline `process.js` Git
blob is `e32b22cb33372868a2bf979600b78337f0f73e2e`. Supply the candidate's
full commit and `process.js` blob; obtain the latter with
`git rev-parse <candidate>:src/lib/runtime/process.js`. Do not use a moving
branch, an old candidate, or substitute #615's HTTP image.

This is a small process/stdio startup fixture, followed by one stdin round
trip and environment semantic probe. It has no HTTP server, requests, sockets,
load generator or soak. [The keep-alive witness](../scripts/http-keepalive-check.mjs)
and [soak wrapper](../scripts/http-soak-check.mjs) supplied provenance,
lifecycle and artifact patterns only. Their workloads and deadlines are not
this oracle.

## Scope and interpretation

The permanent [source regressions](../tests/process-environment-source.test.ts)
establish the Windows initializer's scaling and semantics separately. Their
unchanged-baseline counts were 528, 2080 and 11325 folds for 32, 64 and 150
distinct keys; the source correction bounds folds by the number of distinct
keys in those fixtures. POSIX performs zero folds. That does not establish a
native timing improvement, ownership correction or explanation of a timeout.

The old original-image #602 experiment, run 41451952016, used six conditions
and 128 requests per Node control. Its stressed Nona results were conditional
count/shape evidence on one fixed-order host. This new minimal fixture changes
the workload and uses synthetic values. It cannot reproduce historical timing
or establish #602's product/57-case acceptance, even when counts and volume
match. Neither a full 57-case retry nor redispatch of that old experiment is
part of this step. #602's fresh product campaign remains separate and waits
for accepted, pinned #615 evidence.

Use one GitHub-hosted Windows x64 job for **all** Windows builds and conditions.
Use a second GitHub-hosted Linux x64 job for the unchanged POSIX semantic
control, with the same pins, source, plan and deadlines. The Linux control
checks separate case aliases, descriptors, exact allowlisted values and
enumerable entry counts; it is not a Windows timing comparator. The driver
checks unchanged `process.js` outside the initial environment builder. Review
the pinned source diff and the pure source regressions to confirm that the
initializer's changed branches remain Windows-only.

## Fixtures and fixed plan

No parent environment snapshot is used. The child and compiler receive a
new null-prototype map. Windows OS entries are literal `SystemRoot=C:\Windows`,
`WINDIR=C:\Windows`, `SystemDrive=C:`, `ComSpec=C:\Windows\System32\cmd.exe`
and `PATH=C:\Windows\System32;C:\Windows`; `TEMP` and `TMP` point to the
new experiment's `safe-temp` directory. Windows also supplies synthetic
`HOMEDRIVE=C:`, `HOMEPATH=\nona-synthetic-user`,
`LOGONSERVER=\\NONA-SYNTHETIC`, `USERDOMAIN=NONA-SYNTHETIC`,
`USERNAME=nona-synthetic-user` and `USERPROFILE=C:\nona-synthetic-user`.
Together these explicitly cover all eleven entries in
[Node 26.9.0's libuv required-variable list](https://github.com/nodejs/node/blob/v26.9.0/deps/uv/src/win/process.c#L47-L59),
preventing libuv from filling missing entries with parent-derived values even
when spawn receives an explicit environment. All entries are added before
calculating numbered filler and padding, retaining the exact total counts and
equal-volume controls below. The literal Windows OS location must exist;
the synthetic profile and logon server are fixture values only.
Linux uses literal `PATH=/usr/bin:/bin`, `LANG=C` and the new directory as
`TMPDIR`. Nothing is copied from the parent's PATH, user profile or temporary
directory settings.

Each map includes `NONA_GC_STRESS=off` or `on`, `NONA_CASE=first`, numeric
name `7`, prototype-collision names `__proto__`, `constructor` and
`toString`, a Unicode `π` key, and synthetic numbered filler. Initial Windows
keys have unique uppercase forms. OS and stress-control entries count toward
these **total** shapes:

| Shape | Total entries |                               UTF-16 units |
| ----- | ------------: | -----------------------------------------: |
| base  |            39 | Measured; depends on safe path and GC mode |
| few   |            40 |                                       9221 |
| many  |           150 |                                       9221 |

Units mean `1 + sum(key.length + 1 + value.length + 1)`: one equals sign and
entry NUL, plus the final block NUL, using JavaScript UTF-16 code units.
The same convention is used on Linux for comparison; it is not POSIX byte
size. Padding contains only `p`. Its length compensates for the explicit safe
path and GC entry. The driver fails fixture construction if padding would be
negative; it never changes volume or deadlines to accommodate a host.

The child reports its actual enumerable count, units and data-descriptor
errors at readiness. After readiness the parent sends the synthetic expected
map over stdin, and the child verifies every value and rejects extra/missing
keys without printing names or values. The probe also checks Windows alias
get/has/descriptor/set/delete/reinsert, or POSIX case distinctions. The parent's
spawn map is not accepted as proof of the child environment. An injected
variable, hidden/merged key, unexpected descriptor or different volume makes
the condition fail and not comparable; the remaining safe controls still run.
Do not silently filter unexpected keys or pad based on observed parent data.

The default is two counterbalanced pairs for each shape and GC mode:
`Node, baseline, candidate; candidate, baseline, Node`. Four pairs are the
only other supported choice and repeat that predetermined pattern. The shape
order is base/few/many; GC order is off/on. This gives 36 conditions by default,
72 at the maximum, including Node controls with the same synthetic maps.
Everything runs serially in one process; no timing-driven retries, random
ordering or parallel children are permitted.
The stress-control entry is inert in Node; these controls do not claim V8
GC-stress coverage.

The compiler is built from each verified checkout by `node scripts/build.mjs`,
then a retained build driver calls `compile` with explicit
`target=win32-x64` (or `linux-x64`), `module=true`, `fullRuntime=false`,
`gcStress=false/true`, with no base-image cache. The build environment's
`NONA_GC_STRESS` agrees with that mode; inherited CI settings cannot disable
stress. Each compiler/image build is bounded to 180 seconds. Off/on images
must have different hashes; identical Windows old/new images also require
investigation. Identical Linux old/new images are allowed if Windows-only
code is eliminated.
Build output streams directly to raw logs. Timed-out/cancelled Windows builds
use the fixed OS `taskkill /T /F` utility before killing the parent so that
TypeScript descendants are included; Linux builds use an isolated process
group. Build cleanup has a separate five-second grace. Unverified build-tree
cleanup withholds all remaining builds and conditions rather than allowing
overlap with a possible survivor.

## Deadlines, termination and evidence

Readiness is bounded to the original **60000 ms** from spawn. The hard
process limit remains **90000 ms** from spawn. After readiness there is a
separate **10000 ms** stdin/probe/exit bound, still inside that hard limit.
Startup timing includes process initialization, stdio setup, environment
enumeration and delivery of the ready line; it excludes expected-map JSON
parsing and mutations. Probe timing is recorded separately.

The child fixture launches no descendants. Timeout sends a forced kill to
the direct child; the driver records exit and close events and checks PID
absence. A 5000 ms cleanup grace after the hard deadline is only for recording
termination, never additional startup/probe time. A normal condition records
the same cleanup verification. If cleanup cannot be verified, stop launching
more children and leave the remaining plan incomplete; do not overlap with
an unknown survivor. SIGINT/SIGTERM request active-child kill/reap and retain
an interrupted result. A forcibly destroyed runner cannot prove cleanup;
its last checkpoint is partial evidence.

Build failures produce unavailable-image records and do not suppress other
builds or Node controls. Condition errors/timeouts continue to the remaining
controls after verified cleanup. Invalid pins, source provenance or fixture
construction are preflight failures; the retained plan remains unexecuted.
Never interpret cancelled, partial, missing-artifact or unverified-cleanup
runs as passing.

Every fresh output directory contains:

- `report.json`: runner/OS/Node identity, run and attempt, exact commits and
  Git trees/blobs, source/build/compiler file manifests and SHA-256 hashes,
  fixture/build-driver hashes, build configuration, image hashes and sizes,
  planned order, every started/unavailable condition and aggregate decision.
- `fixture.mjs`, `build-image.mjs` and all four native images that built.
  The image and fixture hashes are rechecked before each measurement.
- `baseline.compiler.*.log`, `candidate.compiler.*.log` and
  `{baseline,candidate}-{off,on}.build.{stdout,stderr}.log`.
  Each build prefix also has incremental `.events.jsonl` and `.result.json`
  records for spawn, timeout, tree termination, exit/close and cleanup.
- One directory per started condition, named
  `<shape>-<gc>-<pair>-<engine>`, with raw safe `stdout.log`, `stderr.log`,
  timestamped `events.jsonl` and incrementally written `result.json`.
  Results include startup/probe/total milliseconds, expected and child-visible
  aggregates, exit code/signal, timeout classification, errors and cleanup.
  An unstarted condition has no child output; the plan and unavailable-image
  record explain why. An interruption may leave only a partial result.

Only explicit CI identity fields and repository/build/native files are hashed
or recorded. There is no parent environment enumeration, reconstruction,
name/value logging, secret hashing or environment dump. Keep raw artifacts,
including failures, in the private/repository-appropriate Actions retention
scope; do not replace failed logs with a successful retry.

`decision.pass` means the complete bounded protocol/semantic plan passed.
It is **not** a performance verdict. `decision.contrary` lists paired candidate
startup times slower than successful baselines, and candidate failures paired
with successful baselines. Even small positive deltas may be noise; inspect
all raw paired results, Node controls, GC modes, cleanup and fixture validity.
Investigate contrary native results before acceptance, preserving the pins,
deadlines and controls. Always report source scaling and native findings in
separate paragraphs. The script deliberately never sets
`nativeTimingImprovementEstablished` or `historical602Acceptance` to true.

## Parent workflow wiring and invocation

The parent owns adding/dispatching the focused workflow, review, integration
and publication. No workflow is dispatched by this implementation worker.
Use a manual workflow with read-only contents permissions, a fixed candidate
input, `fail-fast: false`, no self-hosted routing, no auto-cancellation of a
running comparison, and artifact upload with `if: always()`. The following is
the complete job wiring to place in a parent-owned workflow (both checkouts
are fresh; the driver builds compilers itself). The 150-minute job cap covers
the maximum fixed plan and build/cleanup overhead; it changes no child bound.

```yaml
name: Process environment startup 638
on:
    workflow_dispatch:
        inputs:
            candidate:
                description: Full accepted candidate commit including both 638 steps
                required: true
                type: string
            candidate_blob:
                description: Full process.js Git blob at that candidate
                required: true
                type: string
            pairs:
                description: Predetermined balanced pairs
                type: choice
                options: ["2", "4"]
                default: "2"
permissions:
    contents: read
jobs:
    comparison:
        runs-on: ${{ matrix.runner }}
        timeout-minutes: 150
        strategy:
            fail-fast: false
            max-parallel: 1
            matrix:
                runner: [windows-latest, ubuntu-24.04]
        steps:
            - name: Require GitHub-hosted
              if: runner.environment != 'github-hosted'
              shell: pwsh
              run: throw 'Hosted-only startup comparison'
            - uses: actions/checkout@v4
              with:
                  ref: ${{ inputs.candidate }}
                  path: control
                  persist-credentials: false
            - uses: actions/setup-node@v4
              with:
                  node-version: "26.9.0"
            - uses: actions/checkout@v4
              id: old-source
              with:
                  ref: cbd9d287fd2cdd3b5e65bdc592d88e91b3fab876
                  path: old
                  persist-credentials: false
            - uses: actions/checkout@v4
              id: candidate-source
              with:
                  ref: ${{ inputs.candidate }}
                  path: candidate
                  persist-credentials: false
            - name: Pure regressions
              shell: pwsh
              run: |
                  node --test --test-concurrency=1 control/scripts/process-environment-startup.test.mjs
                  if ($LASTEXITCODE) { exit $LASTEXITCODE }
                  node --test --test-concurrency=1 candidate/tests/process-environment-source.test.ts
                  exit $LASTEXITCODE
            - name: Install baseline dependencies
              id: old-deps
              if: ${{ !cancelled() && runner.environment == 'github-hosted' && steps.old-source.outcome == 'success' }}
              run: npm --prefix old ci
            - name: Install candidate dependencies
              id: candidate-deps
              if: ${{ !cancelled() && runner.environment == 'github-hosted' && steps.candidate-source.outcome == 'success' }}
              run: npm --prefix candidate ci
            - name: Same-machine serial comparison
              if: ${{ !cancelled() && runner.environment == 'github-hosted' && steps.old-source.outcome == 'success' && steps.candidate-source.outcome == 'success' }}
              shell: pwsh
              env:
                  NONA_RUNNER_ENVIRONMENT: ${{ runner.environment }}
                  CANDIDATE_PIN: ${{ inputs.candidate }}
                  CANDIDATE_BLOB: ${{ inputs.candidate_blob }}
                  PAIRS: ${{ inputs.pairs }}
              run: |
                  node control/scripts/process-environment-startup.mjs --baseline cbd9d287fd2cdd3b5e65bdc592d88e91b3fab876 --candidate "$env:CANDIDATE_PIN" --candidate-process-blob "$env:CANDIDATE_BLOB" --baseline-root old --candidate-root candidate --pairs "$env:PAIRS" --out evidence
                  exit $LASTEXITCODE
            - name: Preserve complete and partial evidence
              if: always()
              uses: actions/upload-artifact@v4
              with:
                  name: process-env-638-${{ matrix.runner }}-${{ github.run_id }}-${{ github.run_attempt }}
                  path: evidence/
                  if-no-files-found: warn
                  retention-days: 30
```

Input strings reach Node only through quoted environment variables; never
interpolate untrusted dispatch inputs directly into shell commands. Both
Windows comparisons share one runner hostname/image/Node binary. Linux gets
its own same-machine old/candidate comparison, not cross-machine timing claims.
Download both artifacts by run ID/attempt and inspect `report.json` plus every
failed or contrary condition directory. If installation or preflight prevents
creation of `evidence/`, retain the Actions step logs and classify the run as
unavailable, not successful.
The comparison step deliberately runs after dependency-install failures when
both source checkouts exist: build failures are recorded and Node controls
remain available after verified cleanup.

Before the single PR's relevant CI-triggering push, the parent must apply and
read back exactly one type label `bug`, plus `complex`, `full-ci`, `gc-stress`
and milestone **29 (v0.35.0)**, preserving unrelated labels. Parent-run hosted
full required checks, formatting and documentation-link checks must pass at
the accepted head, in addition to both focused hosted comparison jobs.
Respect the current-release gate; preserve future PRs/branches and do not
enable work-ahead. No push, PR creation, workflow dispatch or release is part
of this worker's step.

## Local preparation evidence

Only cheap pure configuration/aggregation/decision tests and the actual
generated fixture in a VM are permitted locally; no compiler import, build,
native execution, socket, load or process-lifecycle experiment. Run serially
at BelowNormal priority on Windows:

```powershell
$process = Get-Process -Id $PID
$process.PriorityClass = 'BelowNormal'
node --test --test-concurrency=1 scripts/process-environment-startup.test.mjs tests/process-environment-source.test.ts
node --check scripts/process-environment-startup.mjs
node node_modules/prettier/bin/prettier.cjs --check scripts/process-environment-startup.mjs scripts/process-environment-startup.test.mjs docs/issue-638-startup-comparison.md
node site/scripts/sync-docs.mjs
npm run check:doc-links
```

The new tests were added before the driver and first failed on its absent
module. Additional decision regressions then failed on accepting invalid
timing/incomplete records before their fixes. These are tooling RED/GREEN
checks, separate from step 1's unchanged-main scaling RED/GREEN. Local logs
are retained in ignored `work/issue-638-step2/`. The final targeted run passed
27 tests (11 tooling/fixture and 16 existing source tests), with zero skips;
changed-file Prettier, script syntax and documentation links also passed.
Native lifecycle, timeout, cleanup, compiler/image provenance and timing
behavior remain **unexecuted
locally and pending hosted validation**. Passing pure tests cannot substitute
for that evidence.

The review correction adds a pure regression covering the complete libuv
required-variable allowlist in every Windows shape and GC mode, including
exact synthetic/allowlisted values, unique case-insensitive names, total counts,
descriptors and equal-volume controls. Before the correction it failed on
missing `HOMEDRIVE` (`0 !== 1`); the other 11 tooling tests passed with zero
skips. The correction supplies the six missing variables before sizing.
After the correction, all 28 focused tooling/fixture and source tests passed
with zero skips; changed-file Prettier and driver syntax checks also passed.
This RED/GREEN check does not execute native children or establish a timing
improvement; hosted validation remains pending.
