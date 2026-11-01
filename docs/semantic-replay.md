# Public compile semantic replay

The dedicated [workflow](../.github/workflows/semantic-replay.yml) tests the
public `compile(source, options)` boundary, where optional runtime selection
happens. The existing IR/full-runtime helpers in `tests/helpers/host.ts` retain
their original purpose. They are not silently redirected to selected linking.
This lane supplements ordinary CI. It does not establish native acceptance
until its Windows **and** Linux reports actually pass.

## Inputs and modes

[cases.json](../scripts/semantic-replay/fixtures/cases.json) is the permanent
inventory. IDs, exact source bytes, parse goals, module files, provenance,
mode choices and expected observations are reviewable there. Source coverage
hashes of both dependency test files fail the inventory unit test when those
families change; update the inventory deliberately rather than silently losing
coverage. Only the source coverage hashes normalize CRLF to LF across checkouts.
Fixture source hashes always describe the exact stored text.

| Family                                                | PR cases | Goals                | Modes                           |
| ----------------------------------------------------- | -------: | -------------------- | ------------------------------- |
| Retained research inputs                              |        7 | script               | default/full; six also explicit |
| Numeric T01 native inputs and finite AST counterparts |       56 | script               | default/full; two also explicit |
| T02 parameter/default/shadowing inputs                |       80 | 40 script, 40 module | default/full; 40 also explicit  |
| Effect observations                                   |        6 | script               | default/full                    |
| Real relative module graphs                           |        2 | module               | default/full/explicit           |
| Deterministic corpus sample                           |       12 | script               | default/full                    |

The PR set contains **163 cases, 162 unique input/goal graphs, 163 Node controls
and 376 native executions** (373 unique input/mode/goal combinations):
163 default, 163 full and 50 explicit. Goals are
121 scripts and 42 modules. `default-regexp` deliberately aliases
`parameter-script-regexp-2`: its exact research identity and its parameter-family
identity both remain visible. The summary lists this alias; it is not accidental
test discovery. The native driver is outside `*.test.*`. Only small pure
reporter/inventory and selector unit files belong to `tests/suites.json`.

The four original reproducers are copied byte-for-byte from retained
`research/compiler/artifacts/link-results.json` (audited compiler
`1b414d66ba98c05bac82c722578f100ebbd17f81`), with a checked-in
[source inventory](../scripts/semantic-replay/fixtures/retained.json). In order,
`default-proxy`, `default-regexp`, `length-key`, and `counter-key` must print
`function\n`, `true\n`, `function\n`, and `function\n`; each exits zero with
empty stderr. In particular the RegExp input calls `x("x").test("x")`.

T02 includes all ten parameter-scope forms and ten shadowing controls for each
of Proxy/RegExp and script/module goals, as individual inputs without wrapping
them in a new function. T01 retains the 16 native mutation/scope forms, four
selectivity controls and both original reproducers. All 30 unsafe-key AST
inputs and 14 restricted-numeric AST inputs keep their original selector
assertions in the small selector unit. Each has a named finite executable peer:
unbounded loops gain finite iteration controls; undefined reference-only
objects gain concrete values; dormant mutation/capture examples gain calls or
observable reads. Original AST text and the counterpart mapping remain in
`selectorContracts`. Counterparts assert executable semantics, while original
AST selection assertions retain the exact analysis boundary.

The corpus sample is manifest IDs **11, 175, 176, 340, 341, 505, 506, 670, 671,
835, 836, 1000**, the first/last of each six-category block. Every selected file
must match its manifest SHA-256 and Node must match its recorded stdout.
Candidate dispatch also runs all **1,000** manifest IDs, default/full, in ten
disjoint modulo-ID shards of 100, with one native worker in each job. These
2,000 executions per platform are measured separately from the bounded PR set.
Candidate dispatch also runs the bounded set and historical controls. Sample
IDs appearing in both distinct lanes are deliberate controls, not a second
ordinary-test registration.

All five retained optimizer fixtures were reviewed as bounded inputs and copied
exactly from `research/compiler/artifacts/optimizer-results.json`:
`alias-coercion`, `number-loops`, `scalar-snapshots`, `finally-iterator`, and
`typed-length-effects`. Their own JSON/primitive/event traces remain unchanged:
mapped arguments and captured changes, valueOf call counts, reciprocal negative
zero and NaN flags, object snapshots, iterator close/finally order and typed
array length effects. A sixth fixture explicitly records TypeError name/message
and primitive negative-zero/NaN observations. There is no injected generic
serializer, event sorting, stdout trimming or stderr suppression. No GC stress
mode is used: every report records `gcStress: false` explicitly.

## Isolated documented limitation

Only `documented-computed-name` has a default-mode exception:

```js
const key = "Pro" + "xy";
console.log(typeof globalThis[key]);
```

Default must omit `proxy`, exit zero and print `undefined\n`. Explicit
`link: ["proxy"]`, full runtime and Node must exit zero and print `function\n`.
All stderr is empty. If selection improves, the default contract fails and must
be reviewed and updated truthfully. This exception cannot match another ID or
excuse other computed-property omissions.

## Evidence and failure behavior

[run.mjs](../scripts/semantic-replay/run.mjs) calls `compile()` with
`reportLink: true` in a separate bounded child per mode. It saves effective
target, parse goal, file name, default/full/explicit flags, diagnostics, image
SHA-256/length, linked parts/reasons, compile time and execution time. Node is
version 26. Classic scripts execute via `vm.runInThisContext` in an isolated
child, preserving global script scope; modules execute as real files and a real
module graph. The compiler host resolves only exact relative graph file names;
its serializable rule, all graph files and actual resolution calls are retained.
No ModuleHost function is pretended to be JSON-serializable.

Reports include raw stdout/stderr text **and base64 bytes**, status, signal,
process error properties, invocation, working directory and elapsed time.
Comparison explicitly normalizes CRLF only. Compile workers preserve their own
raw child outcomes too. Compiler/source/selector/build hashes and a per-file
source/build hash inventory, actual Git SHA/dirty status, Node executable,
runner image/identity and workflow run/attempt accompany every lane.

`startup.json` is written before installation/build. Provenance and each
case/mode report are flushed before the next operation. Compiler diagnostics,
exceptions, crashes, signals, timeouts and partial outcomes are failures and
remain useful evidence. All modes are attempted before reporting a case's
discrepancies; a failed case does not stop the remaining inventory. Cancellation
may leave `complete: false`; it never becomes passing acceptance. Images are
hashed then removed to bound artifact size. Exact inputs and outcomes remain.
Artifact upload uses `always()` on both platforms, including failed runs.

## Genuine omission control

Each platform checks out and builds the exact audited bad compiler in a separate
hosted directory, preserving its tracked sources. The same unchanged `length-key`
source, public compile worker, raw recorder and comparator are used. Historical
default must successfully compile and exit zero, omit `proxy` and print
`undefined\n`; historical full and Node must print `function\n`, exit zero and
have empty stderr. `compare.mjs` must exit **1** for the stdout mismatch.
Operational failures exit **2** and cannot prove detection. `negative-proof.json`
retains this command's raw outcome plus the exact compiler SHA and provenance
path, which includes the compiler path/hash. Installation/build failure, crash,
timeout or incomplete evidence never counts as a successful negative control.

## Hosted cost and acceptance

Use the workflow's `workflow_dispatch` path after merge (`lane: pr` or
`lane: candidate`). Runners are restricted to `ubuntu-latest` and
`windows-latest`; both workflow and driver check `RUNNER_ENVIRONMENT`.
Each job executes native work serially. Native/Node processes have 15-second
caps and compile workers have 120-second caps; job caps are provisional safety
limits of 120 minutes (historical control: 30 minutes). These are **not measured
overhead or an accepted PR budget**. Do not remove supported families to fit a
guessed cost.

`summary.json` measures complete replay wall time (including provenance and
inventory preparation, excluding dependency installation/compiler build), total
compile/native/oracle time, per-mode compile/native/worker costs and the
full/default compile ratio. The workflow's budget job consumes the two complete,
clean bounded reports for the same source and emits `measured-pr-budget.json`:
the slower platform's measured wall time plus 50%, rounded up to a minute.
It refuses incomplete, failing, missing or mixed-source reports. The report
documents the first measured budget for review; later changes require
remeasurement. Candidate shard reports retain their separate costs; they do
not redefine the PR budget. Setup/build costs remain in workflow step timings.

**Pending until actual hosted evidence exists:** Windows/Linux semantic parity,
the historical negative control on both platforms, observed split-string
behavior, complete bounded-set overhead, measured/accepted PR budget and full
candidate corpus results. Source/unit checks alone prove none of these.
Integrated prerequisites, final-main update and independent review also precede
readiness/closure. This is current-release v0.35.0 work, with publication owned
by the parent coordinator.

## Small local checks

```sh
npm run test:replay-unit
npm run check:replay-types
npm run replay:inventory
```

These commands do not import the native compiler or emit/execute native images.
The AST selector unit runs against built JavaScript on hosted runners. Native
entry points refuse local/self-hosted startup. Ordinary full CI still applies
on hosted runners. After Markdown changes, `node scripts/check-doc-links.mjs`
checks links. `node site/scripts/sync-docs.mjs` refreshes only the fixed
`site/generated/` document inventory (including the changelog); verify that
resolved output directory stays inside this checkout before invoking it.
