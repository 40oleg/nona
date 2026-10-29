# Independent completeness review: initial verdict

This is **step 4 of 6**, reviewed on **2026-10-18 UTC** (2026-10-19 in
Europe/Moscow). **Initial verdict: changes requested before final acceptance.**
The report's central readiness judgment and sampled runtime findings are
supported. The current structured inventory contains contradictory, obsolete
limitations that need reconciliation (RV1). Later release metadata and new
Linux evidence also need a dated disposition (RV2). This is an initial review,
not the correction or final re-review required by
[#394](https://github.com/40oleg/nona/issues/394).

## Independence and immutable review inputs

The reviewer is a separate agent that did not author steps 1–3. The configured
reviewer model is **gpt-6-astra**, reasoning **high**, as supplied for this
review session. This records the actual configuration rather than asserting
an unverified mapping to the harness's `strong` label. The coordinator owns
the existing issue claim and will commit this record; the reviewer made no
issue, PR, commit, push, implementation or audited-artifact changes.

| Input                                 | Revision or SHA-256                                                |
| ------------------------------------- | ------------------------------------------------------------------ |
| Reviewed report checkout              | `1a9e10510629efc3db1fac4edf6468f3c488cfdb`                         |
| Compiler/runtime/workflow baseline    | `453418c167b9b34cd5ff7c0f748674e79222e1cc`                         |
| Report's published-release comparison | v0.18.0, `ce350fdf7e1632b258862db1618db4d71bde97f1`                |
| `docs/completeness-audit.md`          | `43e05a66a2f766b7dd1c764d03bf6df89b93ac4ac87309daa70a070a5b68f242` |
| `docs/completeness-matrix.json`       | `67fd044bf6d78a412cd89f3ff905bcefdbc494113c53d2f63cb5a0cf21c58058` |

Both hashes were independently calculated before and after evidence gathering.
`git diff <baseline> HEAD -- src .github/workflows` is empty. A fresh compiler
build preceded execution. Existing report, matrix and evidence files remain
unchanged; only this review and `review-*` evidence are added. A future final
verdict must identify the corrected revision and new report/matrix hashes.

## Scope and acceptance-criterion assessment

I read the complete narrative and examined all 140 capability rows, all eight
target records and the entry-point/evidence inventory. I then independently
opened underlying implementation, selected test bodies, workflow predicates,
CI logs, release/PR metadata and official comparator documentation. This is a
risk-based factual review, not a line-by-line correctness or security audit of
all 446 referenced files. Authenticating every reference's bytes does not
establish its semantic sufficiency.

The nine acceptance criteria below follow the issue's order.

| Criterion                                                 | Initial assessment and evidence                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Comprehensive status inventory                         | Substantively covered: language/AOT constraints, compiler, runtime, 66 host-API rows, packaging, tooling, ecosystem and eight targets. Method/option distinctions are meaningful, particularly fs, streams, TLS, crypto and stubs. RV1 prevents accepting the current ledger as internally consistent.                                   |
| 2. Auditable claims and clear untested/unreleased scope   | Source registry authentication passes for 446 records against both trees. Executions and CI are mostly well separated; no whole-row verified status is inferred from a toy pass. RV1 contradicts actual execution fields; RV2 needs a dated release/evidence update before finalization.                                                 |
| 3. Missing APIs tied to workloads                         | Covered by the workload/API table and R1–R10: bounded files versus file streams/watchers, CPU workers versus promise concurrency, cryptographic signing, DNS/UDP, Fetch, locale and embedding. Workarounds and prerequisites are qualified rather than advertised as tested substitutes.                                                 |
| 4. Fair versioned comparison and performance coordination | Material claims agree with independently opened official sources listed below. Packaging models are distinguished. Historical performance is explicitly stale/non-comparable; #392 remains open/blocked without linked closing PRs. No new benchmarks were run.                                                                          |
| 5. Risk register and actionable roadmap                   | F1–F13 distinguish observed gaps from unmeasured risk; R0–R10 provide outcomes, dependencies, relative size, uncertainty and acceptance. Sample issue links #328/#235/#387 resolve to the claimed open work. R8/R9 explicitly require separate scopes; no duplicate issues were created.                                                 |
| 6. Reproducible representative verification               | Windows success/failure, Worker stub, stream backpressure, TLS and GC samples reproduced. Four Linux x64 ELF cases executed in WSL2; one extra Windows process case checked platform differences. Eight Test262 files reproduced with denominators independently counted. Exact commands/source/output are retained below.               |
| 7. Parsing, evidence, links and focused checks            | Independent alias-union and Git-object checks pass; inspected local Markdown file targets resolve. Coordinator reran 14 focused tests and the strict inventory validator successfully. Prior site-build checks are retained historical evidence, not rerun by this reviewer. Formatting of this new record is a coordinator final check. |
| 8. Independent strong-model review and resolution         | The independent review/reproduction part is performed here. RV1/RV2 disposition, corrections and step 6 re-review remain pending; this criterion is not complete.                                                                                                                                                                        |
| 9. Issue-linked PR with verification and review outcome   | Deferred to step 6. No audit PR is opened or approved by this review. The PR must report this initial verdict and subsequent disposition, current unknowns and `Closes #394` only when all work is complete.                                                                                                                             |

The deliverables already include opt-in probes, pinned fixtures, English/Russian
README/changelog updates, docs navigation and nine consistent localized module
entry points. The review record is now added. Source inspection of
`site/scripts/check-playground.mjs` confirms that the step-3 change gives the
browser the same canonical `modulePath` used by the Node compiler; exact image
comparison remains. I did not rerun the full site pipeline or independently
claim that all prior site outcomes were reproduced.

## Environment and resource limits

Windows host: TORS, Windows 11 x64 / NT 10.0.26200, Intel Core i7-13620H;
PowerShell 7.6.5, Git 2.43.0.windows.1, GitHub CLI 2.101.0. The executable
`work/completeness-tools/node.exe` reports Node **26.9.0**, V8
**14.6.202.34-node.32**, OpenSSL **3.5.8**. TypeScript is **7.0.2**, Prettier
**3.9.10**. The ambient Node is 22.23.2 and was not used for compiler/runtime
verification. The existing npm installation is 10.9.8; no package installation
or alternative-runtime installation was performed in this review.

Linux execution: Ubuntu **22.04.3 LTS**, WSL2 kernel
**6.18.54.1-microsoft-standard-WSL2**, x86_64, UID 1000. Linux Node is absent:
`node --version` in Ubuntu returned exit 127, `node: not found`. ELF artifacts
were compiled on Windows and executed as Linux processes inside WSL2, without
CPU emulation. This is Linux guest execution, not a native Linux compiler build
or a Linux Node-oracle comparison. Platform-neutral package/GC expectations
reuse the passing Windows Node oracle; the credential expectation comes from
the POSIX adapter contract and the separately observed Linux environment.

All compiles/probes were sequential. Compiler children use a 768 MiB V8 heap
cap and 45-second timeout; program limits are 15 seconds, TLS 30 seconds.
Linux execution additionally uses guest `timeout 15s`, with a 20-second outer
bound. The build used `GOMAXPROCS=2`; later supplemental commands also set
`UV_THREADPOOL_SIZE=2`. No two heavy commands overlapped. Coordinator validation
began only after I released exclusive execution ownership. No benchmark,
`npm test`, `npm run check`, full corpus/Test262/platform/bootstrap run, full
site rebuild, security test campaign or Lean rebuild was performed. Six other
targets had no available execution environment and were not executed. Review
temporary executable directories were removed and probe services closed.

## Independent reproductions

Raw records contain exact argv, working directory, source or source hash,
expected/actual stdout, stderr, exit/timeout state and cleanup:

- [Windows replay](evidence/completeness/review-windows-x64.json).
- [Cross-target and platform-dependent replay](evidence/completeness/review-cross-target.json).
- [Test262 replay](evidence/completeness/review-test262-windows.json).
- [Independent reference, alias and denominator inspection](evidence/completeness/review-inspection.json).

The existing fixture installation was reused. Top-level package versions and
locks were checked by the runner, but transitive installed bytes were not
freshly authenticated with `npm ci`; the raw record explicitly says
`existing-install` / `unverified`. This is a replay of the recorded installation,
not an independent clean-install supply-chain reproduction.

| Check                                               | Expected / actual                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| minimist 1.2.8 CLI/file workload, Windows and Linux | Compilation succeeds; both print `cli 3 false input.json`, exit 0, matching the Windows Node oracle.                                                                                                                                                 |
| fs-extra 11.3.0, Windows and Linux                  | Node prints `filesystem 5`; both Nona builds succeed and binaries exit 1 with empty stdout and `Nona runtime error\r\n`. Reproduces the reported failure; does not diagnose its first failing internal operation.                                    |
| Undici 7.16.0, Windows loopback client              | Node prints `client 200 42`; Nona builds then exits 1 with `TypeError: Invalid operation`. No root-cause attribution added.                                                                                                                          |
| Public Worker, Windows                              | Node worker returns 42; Nona builds and reports `worker ERR_NONA_UNSUPPORTED`, exit 0. This is a verified service gap, not compatibility.                                                                                                            |
| Writable queue/backpressure, Windows                | Exact expected two-line output: `pressure true false 2 true`, then `closed batch:a,b,c\|a\|b\|end 0 true true`. Queue pressure, batching, callbacks and final state agree. This replay is not GC stress.                                             |
| Closure roots, Windows and Linux                    | With `gcStress: true`, both print `roots 100 value-0 99`, exit 0. Narrow retained-object/capture case only; no weak-memory cap or proof of root completeness.                                                                                        |
| TLS verification, Windows                           | Trusted fixture CA yields `authorized true`; wrong host yields `ERR_TLS_CERT_ALTNAME_INVALID`; untrusted leaf yields `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. All match Node, no timeout. Not Linux trust-store or adversarial TLS coverage.               |
| Platform-dependent credentials                      | Windows Node and Nona print `identity win32 undefined absent`; Linux Nona prints `identity linux function true` for nonnegative `process.getuid()`. This probes presence and basic result, not full credentials/NSS or mutating identity operations. |
| Test262 coalesce selection, Windows                 | Eight pass: six native runtime cases and two compile-only syntax negatives; zero failures/skips. The two negatives actually returned `E_SYNTAX` here, although the general runner accepts any compilation failure.                                   |

Windows reproduction commands from repository root:

```powershell
$reviewNode = (Resolve-Path work/completeness-tools/node.exe).Path
$env:GOMAXPROCS = '2'
$env:UV_THREADPOOL_SIZE = '2'
& $reviewNode scripts/build.mjs
& $reviewNode scripts/completeness-probes.mjs --cases cli,filesystem,http-client,worker-api,stream-writable-queues,gc-roots,tls-verification --audited-commit 453418c167b9b34cd5ff7c0f748674e79222e1cc --output work/review-windows-rerun.json
$env:TEST262_JOBS = '1'
$env:TEST262_RUNTIME_TIMEOUT_MS = '15000'
$env:TEST262_DELETE_BINARIES = '1'
$env:TEST262_FILE_LIST = 'tests/probes/completeness-test262.txt'
$env:TEST262_REPORT = 'work/review-test262-rerun.json'
& $reviewNode scripts/test262-smoke.mjs language/expressions/coalesce
```

The retained run used the corresponding `docs/evidence/completeness/review-*`
output paths. Rerun paths above preserve this review's evidence. To reproduce
the Linux CLI independently, without the temporary review orchestration script:

```powershell
$reviewRoot = Join-Path (Get-Location) 'work/review-linux-rerun'
New-Item -ItemType Directory -Force $reviewRoot | Out-Null
$reviewImage = Join-Path $reviewRoot 'program'
$reviewEntry = (Resolve-Path tests/fixtures/completeness/cli.mjs).Path
& $reviewNode --max-old-space-size=768 scripts/completeness-probes.mjs --compile $reviewEntry linux-x64 $reviewImage false
$reviewGuest = (wsl -d Ubuntu --exec wslpath -a $reviewRoot).Trim()
wsl -d Ubuntu --cd $reviewGuest --exec timeout 15s ./program
```

For fs-extra, substitute `filesystem.mjs`. For the custom GC/identity cases,
extract the exact source from the committed record; no untracked script is
needed:

```powershell
$reviewData = Get-Content docs/evidence/completeness/review-cross-target.json -Raw | ConvertFrom-Json
$reviewCase = $reviewData.cases | Where-Object id -eq 'linux-identity'
$reviewEntry = Join-Path $reviewRoot 'main.mjs'
[IO.File]::WriteAllText($reviewEntry, $reviewCase.source)
& $reviewNode --max-old-space-size=768 scripts/completeness-probes.mjs --compile $reviewEntry $reviewCase.target $reviewImage $reviewCase.gcStress.ToString().ToLowerInvariant()
wsl -d Ubuntu --cd $reviewGuest --exec timeout 15s ./program
```

Choose `linux-gc` for the stress case; `windows-identity` requires a `.exe`
artifact executed directly on Windows. Commands for every actual execution are
also in the JSON. These reruns leave their owned `work/review-linux-rerun`
directory for inspection; original review cleanup is recorded separately.

## Evidence checked beyond the validator

An independent `git cat-file --batch-check=%(objectname)` query authenticated
all **446** matrix reference records against the audited and v0.18.0 trees:
zero mismatches, including expected release absences. The freshly built
`builtinSpecifiers()` union over eight targets contains **86** public aliases,
exactly matching the ledger, with no missing or invented aliases. This checks
the registration union; target service semantics were separately read in
`builtin-modules.ts`, `net-module.ts`, `child-process-module.ts` and
`fs-module.ts`. Explicit provider fallback is not equivalent to inventory
availability. The baseline lacks universal `nona:` aliases, as reported.

These inspection checks can be repeated directly, without the temporary
orchestration file. The batch query below is the same Git-object operation
used for the retained inspection; compare its alternating output lines with
each record's `blob` and `releaseBlob` (`missing` is expected for null):

```powershell
$reviewMatrix = Get-Content docs/completeness-matrix.json -Raw | ConvertFrom-Json
$reviewRefs = @($reviewMatrix.evidence.PSObject.Properties.Value)
$reviewObjects = foreach ($ref in $reviewRefs) {
    "$($ref.commit):$($ref.path)"
    "$($reviewMatrix.audit.publishedRelease.commit):$($ref.path)"
}
$reviewObjects | git cat-file '--batch-check=%(objectname)'
git -C work/test262 rev-parse HEAD
$reviewPaths = @(git -C work/test262 ls-tree -r --name-only HEAD test | Where-Object { $_.EndsWith('.js') -and -not $_.Contains('_FIXTURE') })
$reviewPaths.Count
@($reviewPaths | Where-Object { $_.StartsWith('test/language/expressions/coalesce/') }).Count
& $reviewNode --input-type=module -e 'import {readFileSync} from "node:fs"; import {builtinSpecifiers} from "./dist/src/frontend/builtin-modules.js"; const m=JSON.parse(readFileSync("docs/completeness-matrix.json")); const a=new Set(m.entryPoints.filter(x=>x.visibility==="public").flatMap(x=>[x.specifier,...x.aliases])); const b=new Set(m.targets.flatMap(x=>[...builtinSpecifiers(x.id)])); console.log({registered:b.size,inventory:a.size,unrecorded:[...b].filter(x=>!a.has(x)),unregistered:[...a].filter(x=>!b.has(x))});'
```

For retained CI artifact authentication, recursively enumerate JSON files in
`work/completeness-ci`, SHA-256 their bytes and match the nine `sha256` values
in `test262-ci-summary.json`; then count each source report's `results` by
`phase` and `outcome`. The committed inspection JSON retains every matched
hash and independently recounted group/result totals. The existing
`completeness-test262-summary.mjs` supplies a separate reproducible cross-check,
not the sole basis for the independent counts.

I independently counted **53,597** tracked Test262 `.js` files excluding
`_FIXTURE`, including **24** coalesce files, at the pinned revision
`7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd`. The eight-file selection therefore
excludes 16 group files and does not evaluate 53,589 tree files. All nine
previously downloaded CI source-report hashes match their recorded digests;
recounting their actual result phases gives 3,187 runtime passes, no compiler-only
results, no failures/skips, in 4,231 group files. The 1,044 exclusions remain
exclusions. These CI artifacts were inspected locally and their run metadata
was re-queried; they were not freshly downloaded or executed by this reviewer.

The parser-negative branch at `scripts/test262-smoke.mjs` accepts `!parsed.ok`
without the expected error class; default tests run one strictness variant;
file-list/full-runtime settings are not serialized. Reading the actual
`cannot-chain-head-with-logical-and.js` metadata and runtime short-circuit test
confirmed why runtime versus compile-only and file versus variant counts matter.
The report's conformance limitations are accurate.

Representative implementation/test checks included:

- `compiler.ts`, `ir/optimize.ts`, `ir/copies.ts`, `link.ts` and compiler
  diagnostics/module-path handling: static graph, ordered fact/copy passes,
  lexical runtime selection and source locations have the stated boundaries.
- `runtime/root-scope.ts`, GC tracing/ephemeron/poisoning paths and
  `tests/runtime-roots.test.ts`: snapshot/container roots and stable range-root
  assumptions are real invariants. The direct-root test body was read, not run
  separately; the actual execution sample is the stress closure case above.
- Worker and HTTP2 providers, fs exports/promise wrappers, OS telemetry,
  encoding/URL providers and error-stack prelude: throwing/no-op, synchronous,
  UTF-8/streaming, IDNA and anonymous CallSite limits agree with the report.
- `http.js`, `https.js`, `tls.js`, `x509.js` and TLS fixture/stream probe bodies:
  timeout fields, ignored TLS options, custom verification and server stubs
  are distinguished from the narrow positive execution evidence.
- `verification/Nona/MoveRules.lean`, `Examples.lean`, `Audit.lean` and production
  copy-pass context: the proof covers a parameterized pure straight-line model;
  it does not certify TS refinement, CFGs, effects, GC, ABI or machine code.
  No Lean kernel build was performed in this review.
- `package-native-cli.mjs`, release packaging/workflow and
  `THIRD_PARTY_NOTICES.md`: the concrete notice-copy omission is source-backed.
  Published archives were not downloaded; no legal or complete supply-chain
  assurance is added.

Read-only GitHub commands independently confirmed the report's historical
workflow outcomes and merge separation:

```powershell
gh run view 39160044403 --json headSha,conclusion,jobs
gh run view 39160044403 --log-failed
gh run view 39160044376 --json headSha,conclusion,jobs
gh run view 39160044376 --log
gh run view 39142649906 --json headSha,conclusion,jobs
gh run view 39160044385 --json headSha,conclusion
gh pr view 356 --json state,mergedAt,mergeCommit
gh pr view 357 --json state,mergedAt,mergeCommit
gh pr view 361 --json state,mergedAt,mergeCommit
gh pr view 390 --json state,mergedAt,mergeCommit
gh pr view 393 --json state,mergedAt,mergeCommit
gh api repos/40oleg/nona/releases/latest
gh issue view 392 --json state,labels,closedByPullRequestsReferences
```

The audited check run fails Windows shard 1/4 with `rmSync`/`EPERM` in
`runtime-link.test.js`; the log supports the cleanup characterization. The
audited self-hosting run succeeds; logs show x64 stage-2 identity with Node
absent from PATH and other-platform smoke mode. The v0.18.0 platform run has
the reported three ARM64 failures and successful x64/BSD jobs. The audited
corpus run is successful. Configuration and historical job evidence do not
replace the unavailable target reproductions. The coordinator separately ran
the strict inventory validator and 14 focused structural/runner tests: all
passed, zero failed/skipped. Those are coordinator checks, not additional
independent capability reproductions.

## Coordinator validation of the review artifacts

After independent reproduction finished, the coordinator ran the following
focused checks with Node 26.9.0. The 14 tests passed with zero failures/skips;
the inventory validator authenticated 140 capabilities, 42 entry points and
eight targets. Prettier and staged whitespace checks passed. A separate local
link/JSON/hash check resolved all four local links in this review, parsed its
four evidence files and confirmed both original input hashes above. The report,
matrix and existing evidence remain unchanged. These checks validate the review
artifacts; they do not replace the independent runtime observations.

```powershell
$env:UV_THREADPOOL_SIZE = '2'
$env:NODE_OPTIONS = '--v8-pool-size=2 --max-old-space-size=1536'
& $reviewNode --test --test-concurrency=2 dist/tests/completeness-probes.test.js dist/tests/completeness-inventory.test.js dist/tests/suites.test.js
& $reviewNode scripts/check-completeness-inventory.mjs --git
& $reviewNode node_modules/prettier/bin/prettier.cjs --check docs/completeness-review.md 'docs/evidence/completeness/review-*.json'
git diff --cached --check
```

## Official comparison-source review

The following pages were opened successfully on 2026-10-18 UTC, not inferred
from search snippets. Claims below are documentation/source observations; only
the Node oracle was executed.

| Comparator         | Sources and independent conclusion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node 26.9.0        | [Versioned SEA manual](https://nodejs.org/download/release/v26.9.0/docs/api/single-executable-applications.html) confirms built-in `--build-sea`, ESM/CJS and opt-in VFS, runtime embedding and cross-platform cache/snapshot restrictions. [Permissions](https://nodejs.org/download/release/v26.9.0/docs/api/permissions.html) does not establish an arbitrary hostile-code sandbox.                                                                                                                                                                             |
| Deno 2.9.7         | [Release](https://github.com/denoland/deno/releases/tag/v2.9.7), [compile](https://docs.deno.com/runtime/reference/cli/compile/), [Node/npm](https://docs.deno.com/runtime/fundamentals/node/) and [security](https://docs.deno.com/runtime/fundamentals/security/) support the stated runtime/target/permission distinctions. The experimental QuickJS alternative is separately documented. The [Cloudflare announcement](https://deno.com/blog/cloudflare) supports the limited future runtime-maintenance horizon; this unusual claim was explicitly verified. |
| Bun 1.4.3          | [Release blog](https://bun.com/blog/bun-v1.4.3), [executables](https://bun.com/docs/bundler) and [Node compatibility](https://bun.com/docs/runtime/nodejs-compat) support `bun check`, runtime-containing executables, six OS/CPU combinations plus musl variants, and incomplete compatibility. No promotional performance numbers are adopted.                                                                                                                                                                                                       |
| QuickJS 2026-06-04 | [Release page](https://bellard.org/quickjs/) and [manual](https://bellard.org/quickjs/quickjs.html) support the interpreter/C-toolchain packaging distinction and upstream-scoped language claims. They are not Nona's conformance denominator or an independently measured security score.                                                                                                                                                                                                                                                                        |
| QuickJS-NG 0.17.0  | [Release](https://github.com/quickjs-ng/quickjs/releases/tag/v0.17.0), [CLI](https://quickjs-ng.github.io/quickjs/cli/), [feature policy](https://quickjs-ng.github.io/quickjs/es_features/) and [platform policy](https://quickjs-ng.github.io/quickjs/supported_platforms/) support appended bytecode/base-executable packaging, prebundling needs, Intl exclusion and limited BSD/mobile testing.                                                                                                                                                               |
| Static Hermes      | Pinned [shermes source](https://github.com/facebook/hermes/blob/17b37301da5da4a2cd55d78f9697c46c0fd96123/tools/shermes/shermes.cpp) contains generated-C/native output modes; pinned [feature policy](https://github.com/facebook/hermes/blob/17b37301da5da4a2cd55d78f9697c46c0fd96123/doc/Features.md) supports treating it as a separate source-only design comparator. No target-readiness equivalence is inferred.                                                                                                                                             |

Attempts to open package tag URLs for minimist `v1.2.8`, fs-extra `11.3.0`
and Undici `v7.16.0` through the browser returned restricted-fetch errors.
They are not counted as verified remote source reads. Local installed package
metadata, fixture pins/locks/source metadata and real execution were inspected.
Mutable comparator manuals remain dated observations; pinned release pages do
not make every unversioned manual claim immutable.

`PERFORMANCE.md` and `bench/README.md` were independently read. Their reused
2026-10-14 `b58f0bc` measurements, warm runtime cache, small run counts, shared
VM noise, missing fresh SEA/Deno artifacts and peak-RSS limits are accurately
qualified in the report. #392 remains separately claimed. No probe duration
or artifact size is treated as a benchmark.

## Findings, disagreements and step-5 acceptance

### RV1 — Reconcile the current matrix's stale limitations

**Priority P2 / material; confidence high. Affects criteria 1, 2 and 7.**
The JSON declares step 3, but several row limitations still describe step-1
absence of evidence without a historical qualifier:

- `platform.win32-x64.limitations` says local build/run was not attempted,
  while its `execution` contains passing Windows build/run records.
- `api.fs.read-write.limitations` says the adapters are unexecuted here,
  while the same row records the passing Windows CLI/fs workload.
- `assurance.test262.limitations` says there was no fresh run, while the same
  row records the eight-file local run and its six native executions.
- `ecosystem.comparisons.limitations` still defers comparison to step 3,
  and its evidence-needed text requests a step-2 capability probe, although
  the completed report contains the versioned comparison.
- Other ecosystem limitations retain planning language such as “Step 2 must
  pin/install/build/run separately” despite their recorded package outcomes.

These are contradictions inside the current capability ledger, not objections
to the report's explicitly dated step-1 historical narrative. A machine-reader
or maintainer cannot reliably use limitations and evidence-needed fields as
current status. Conservative `implemented-unverified` statuses remain sensible
for broad rows; the correction must not promote an entire method/target family
merely because one sample passed.

**Step-5 acceptance:** review every limitations/evidence-needed field against its
execution/results and the completed report; remove or explicitly date obsolete
planning claims. Preserve exact target and method scope, failures, CI/local
separation and genuine remaining unknowns. Revalidate the matrix and have
step 6 inspect these example rows plus a sample of the rest. No runtime change
is required to address this finding.

### RV2 — Disposition later release metadata and new Linux evidence

**Priority P2 refresh requirement; confidence high. Affects criteria 2, 6 and 8.**
Live metadata now identifies
[v0.19.0](https://github.com/40oleg/nona/releases/tag/v0.19.0), published
**2026-10-18T21:10:48Z**, after the report's explicit 21:05 release check.
[#390](https://github.com/40oleg/nona/pull/390) merged at
**20:36:05Z**, merge SHA `0dbf4c5fc1477a5f463fc3ba8166e45eaa97dba1`.
The report's 20:12–20:15 provenance table calling it open is historically
valid. #393, #369 and #286 remain open at this review. The three post-v0.18.0
feature PRs have the exact merge SHAs recorded in the report.

The new Linux observations also supersede a current-reader inference that
this audit has no local Linux execution, but they do not retroactively change
what step 2 ran. These are subsequent observations rather than original-source
defects. They must not silently turn the reviewed compiler baseline into the
new release or imply a Linux Node oracle or eight-target reproduction.

**Step-5 acceptance:** add a dated current-release/review-evidence addendum or
explicitly preserve the frozen snapshot and link this review as the later
state. Keep the original baseline and old evidence immutable. If the release
comparison itself is refreshed, resolve the tag to its commit, compare inputs,
and update source relationships deliberately. Record WSL2 Linux execution,
Windows compiler/oracle provenance and the remaining six unexecuted targets;
retain fs-extra failure and unverified transitive installation. Step 6 must
decide whether the final public entry points accurately describe the scope.

### Retained limitations, not newly discovered defects

No material disagreement was found in the sampled implementation, historical
CI, formal-proof boundary, package outcomes or comparator packaging models.
The fs-extra/Undici/workerpool first failing operations remain unknown. Package
sample success does not establish package-wide compatibility. TLS, GC, FFI,
concurrency, long-lived service behavior and six targets remain far beyond the
local reproduction scope. The source-observed notice omission merits the
report's separate packaging follow-up; this review neither fixes it nor asserts
the contents of published archives. No security certification or new exploit
claim follows from this review.

**Disposition at this revision:** RV1 unresolved; RV2 pending refresh decision;
no corrections made to audited artifacts. The initial verdict remains
**changes requested**. Step 5 should correct/document these findings, then step
6 should independently re-review the corrected report/matrix and record the
final verdict against their new commit and hashes. Issue #394 is not complete.

## Step 5 author resolution record

Appended by the implementation coordinator on **2026-10-18 UTC / 2026-10-19
Moscow**, starting from review commit
`0962f7345ed1f79096c99b0a982740f4c0c0ec35`. Everything above remains the original
independent review, including its **changes requested** verdict. This appendix
records corrections and author validation; it neither revises that verdict nor
supplies step-6 independent approval. Matrix reconciliation was delegated with
**gpt-6-astra/high** requested; actual model routing/tier assignment is not
independently verified here. That implementation agent did not conduct final review.

| Finding                                                   | Author disposition and correction                                                                                                                                                                                                                                                                                                                                                                                                                                            | Evidence and remaining limit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV1 — Stale matrix limitations and evidence-needed fields | Corrected for re-review. Reviewed every such field against recorded outcomes; removed obsolete step-2/3 planning claims, reconciled Windows/Linux file and target observations, retained exact Test262 denominators and separated completed source comparison from unperformed experiments. `ecosystem.comparisons` changes from unknown to partial; no row becomes fully verified.                                                                                          | [Corrected matrix](completeness-matrix.json), [report correction record](completeness-audit.md#step-5-corrections-and-validation), [strict validator and 14 focused tests](evidence/completeness/step5-validation.json), [bounded Windows replay](evidence/completeness/step5-windows-x64.json), [eight-file replay](evidence/completeness/step5-test262-windows.json). Windows/Linux package failures remain. Build fields also record playground image generation on all eight targets, explicitly distinct from execution; six targets remain locally unexecuted. |
| RV2 — Later release metadata and Linux evidence           | Corrected through an explicit frozen-snapshot decision and dated addendum. GitHub's v0.19.0 publication and #390 merge are separate observations; the audited compiler SHA, v0.18.0 comparison, source blobs and row release relationships remain unchanged. Incorporated the review's four Windows-built WSL2 Linux x64 cases and Windows identity check at their exact scope. Updated English/Russian README, docs index, changelog and all nine site module entry points. | [Dated report addendum](completeness-audit.md#dated-release-and-review-addendum), [original cross-target evidence](evidence/completeness/review-cross-target.json), [release/PR responses and validation](evidence/completeness/step5-validation.json). v0.19.0 source/artifacts were not substituted or verified; no Linux Node oracle/compiler-host build. fs-extra still fails; transitive installed fixture bytes remain unverified.                                                                                                                             |

The unchanged baseline evidence registry, original per-row release relationships
and prior execution records are preserved. New evidence is additive. The matrix
and report agree on 140 rows: 58 implemented-unverified, 59 partial, 16 missing,
three intentionally unsupported, four unknown, zero implemented-verified.
Summary failure states preserve a failed recorded sample alongside successes;
they do not claim universal platform failure. Repeated Test262 observations
cover the same eight files and are not added to the distinct-file denominator.

Author validation and environment are recorded in the report's
[step-5 section](completeness-audit.md#step-5-corrections-and-validation) and
[raw command record](evidence/completeness/step5-validation.json). The complete
`npm run check`/`npm test` suite is intentionally omitted under the user's final
shared-machine instruction; focused tests, bounded probes and docs/site checks
are used instead. Runtime/compiler feature implementation and #392 benchmarks
remain outside this step. No `full-ci`/`gc-stress` label is required by this diff.

Remaining limitations are accepted as explicit scope, not reviewer approval:
fs-extra/Undici/workerpool root causes; untested API/options and six target
executions; fresh transitive fixture authentication; Linux compiler/Node oracle;
v0.19.0 archive/source comparison; long-lived memory/network/TLS/FFI assurance;
current comparable performance; full-suite and final independent review.
None is silently converted into a pass or implemented feature.

Step 6 must independently inspect RV1's named rows and a sample of other
limitations, the updated target build/execution distinction, RV2's frozen
release comparison, the public entry points and the final artifacts identified
below before recording its own verdict. Issue #394 remains incomplete.

### Corrected artifacts for step 6

These SHA-256 values identify the corrected files in the commit containing this
appendix; they bind the resolution table to exact report/matrix bytes without
requiring a self-referential commit ID. Step 6 should also record the correction
commit SHA and its own final verdict. The original step-3 input hashes at the
top of this record remain unchanged.

| Artifact                        | SHA-256 after corrections and formatting                           |
| ------------------------------- | ------------------------------------------------------------------ |
| `docs/completeness-audit.md`    | `17b7aec4b4dad098a46c95154b58542c0b0ae6fa942a004e01e8351e824dfc15` |
| `docs/completeness-matrix.json` | `0cb27f8bb1c404fa230f71897ead162b2efcc4bbb1136fa41a59ce7a72057aa3` |

The author integrity check preserved all 446 evidence records, all 140
capability IDs/release relationships, all 47 prior execution records and ten
historical evidence files. It also confirmed that the complete original review
is an exact unchanged prefix of this file. The new validation record retains
these checks and the corrected hashes. Verify them from the checkout with:

```powershell
Get-FileHash -Algorithm SHA256 docs/completeness-audit.md, docs/completeness-matrix.json
git log -1 --format='%H' -- docs/completeness-audit.md docs/completeness-matrix.json
```

## Step 6 final independent review

Reviewed on **2026-10-18 UTC / 2026-10-19 Europe/Moscow**.
**Final verdict: accepted for the local audit and PR handoff, with the explicit
limitations below. RV1 and RV2 are resolved; no material review finding remains
open in the reviewed artifacts.** This accepts the report's evidence and scoped
claims, not the compiler's general correctness, security or release readiness.
Publication and applicable PR CI remain outstanding under the user's explicit
instruction to prepare a local commit/draft without pushing or opening a PR.
This review does not close #394 or count the absent PR as an existing one.

### Reviewer independence and exact final inputs

This is a new, separate reviewer that authored none of steps 1–5 or the
coordinator's final report/matrix corrections. The actual configured model is
**gpt-6-astra**, reasoning **high**. The mapping of this configuration to the
harness's `strong` tier was **not independently authenticated**. I read the
initial review and author dispositions, but formed this verdict from the
corrected narrative/ledger, underlying source and retained evidence, fresh
executions, official sources and the finalization diff. No other final reviewer's
conclusion is adopted. I changed only this appended review and new
`final-review-*` evidence; no report/matrix, prior evidence, compiler or GitHub
state was changed by this reviewer.

| Input                                                                 | Revision / SHA-256                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Step-5 correction commit, reviewed independently                      | `3b8432a7e8b8c7e17315bec7a2c370d9b62e0e45`                             |
| Report in that correction commit                                      | `17b7aec4b4dad098a46c95154b58542c0b0ae6fa942a004e01e8351e824dfc15`     |
| Matrix in that correction commit                                      | `0cb27f8bb1c404fa230f71897ead162b2efcc4bbb1136fa41a59ce7a72057aa3`     |
| **Final reviewed report bytes**                                       | **`519ca2b49bd7dc3441a56d3008d8cfbdc84032355a66920c267477eb1871c410`** |
| **Final reviewed matrix bytes**                                       | **`3fd06b8da073c73ea802d0e987f1d1c40b19322a71f925009ae7e2a515ad4381`** |
| Compiler/runtime/workflow baseline, distinct from the report revision | `453418c167b9b34cd5ff7c0f748674e79222e1cc`                             |
| Frozen comparison release                                             | v0.18.0, `ce350fdf7e1632b258862db1618db4d71bde97f1`                    |

The final two hashes bind the coordinator's uncommitted finalization content on
top of the correction commit, including the dated #392/#395 observation and
review-status pointers. They are not hashes of a v0.19.0 compiler or a future
commit. A final commit may package these exact bytes; any further report/matrix
change requires renewed review/hash binding. Source/workflow/package/build
inputs still have no diff from the compiler baseline.

The [independent inspection record](evidence/completeness/final-review-inspection.json)
authenticates all **446** source/test/doc registry records against both pinned
Git trees, with zero mismatches. Finalization leaves all 140 capability objects,
eight target records, 42 entry points and the registry unchanged from the
correction commit. All **47** pre-correction execution records remain, and all
13 evidence files present at the correction commit retain their exact bytes.
The entire previous review plus step-5 resolution remains an unchanged prefix
of this document. These integrity checks establish provenance, not the semantic
sufficiency of every cited test.

### Findings and disposition

| Finding                                             | Independent re-review decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV1: current ledger contradicted completed evidence | **Resolved.** I read all 140 scope/status/limitations/evidence-needed records and checked the named `platform.win32-x64`, `api.fs.read-write`, `assurance.test262` and `ecosystem.comparisons` rows against their execution records. Windows/file/Test262 evidence is now acknowledged; comparisons are source-based and partial. Ecosystem rows preserve each pinned outcome rather than requesting already-completed installation/probes. No row becomes fully verified.                              |
| RV1: other rows and target summaries                | **Resolved at their stated scope.** Additional checks included `runtime.gc`, `runtime.array-from-async`, `language.float16`, `api.process.credentials`, `api.fs.mutations`, stream/TLS/worker rows, packaging/self-hosting, security/notice and all eight platform rows. Playground build passes are distinct from six `run: not-run` targets; Windows/Linux summary failures retain real failed samples alongside successes. Generic remaining evidence requests do not erase recorded narrower cases. |
| RV2: later release and Linux evidence               | **Resolved by an explicit frozen-snapshot decision.** v0.19.0 publication and #390 merge are dated separately; audited source/release relationships remain `453418c1` versus v0.18.0. Windows-built WSL2 evidence, absent Linux Node/compiler-host build, retained fs-extra failure and unverified transitive installed bytes are explicit. Fresh Linux reproduction agrees.                                                                                                                            |
| Finalization wording raised during this review      | **Corrected by the coordinator and rechecked.** The comparison table now includes WSL2 Linux evidence, F1 explicitly includes Linux fs-extra failure, and `audit.executionPolicy` points to step 6 instead of claiming final review is pending. The Nona comparison label explicitly says frozen release comparison. These clarify scope/state without changing capability conclusions.                                                                                                                 |
| Later performance work                              | **Correctly attributed.** The #395 proposal is pinned to `f9cb33f718062694064d2d01affeed1f2d708e67` and described as unmerged, externally collected evidence at the same compiler baseline. Its Linux-only/shared-VM and runtime-version limits remain visible. I read the retained fetched report/metadata; I did not reproduce or approve benchmark ratios. No benchmark work was duplicated.                                                                                                         |

The readiness conclusion remains warranted: bounded, specifically tested tools
have useful evidence; broad npm services, public workers, descriptor/stream
filesystem workloads, secure exposed services and six other target deployments
still face stated blockers or unknowns. The risk register distinguishes observed
errors from unmeasured risks, and the roadmap supplies bounded outcomes and
acceptance contracts rather than claiming those features were implemented.

### Fresh reproductions and all eight targets

A fresh compiler build preceded the executions. The selected executable was
`work/completeness-tools/node.exe`, **Node 26.9.0**, V8
**14.6.202.34-node.32**, OpenSSL **3.5.8**, on Windows 11 x64 / 10.0.26200,
TORS, Intel Core i7-13620H. Linux execution used Ubuntu **22.04.3 LTS**, WSL2
kernel **6.18.54.1-microsoft-standard-WSL2**, x86_64, UID 1000. The fresh guest
check again found no `node` command. There was no CPU emulation. All compiler
and portable oracle processes ran on Windows; the Linux identity expectation
comes from the POSIX contract, not a Linux Node run.

Heavy commands were sequential, with exclusive execution ownership released to
the coordinator only after the final playground check. `GOMAXPROCS=2`,
`UV_THREADPOOL_SIZE=2` and `NODE_OPTIONS='--v8-pool-size=2
--max-old-space-size=1536'` bounded host pools/memory. Compiler children were
limited to 768 MiB/45 seconds; ordinary programs 15 seconds, TLS 30 seconds;
WSL runs also used guest `timeout 15s` with a 20-second outer bound. No retained
probe timed out or overflowed output. Owned execution directories were removed,
and the Windows runner recorded service/subprocess cleanup. No child service
was deliberately left running.

| Fresh check                                                                          | Observed outcome and limit                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| minimist 1.2.8 plus synchronous fs, Windows and WSL2 Linux                           | Both compile and print `cli 3 false input.json`, exit 0, matching the Windows Node oracle.                                                                                                                                                                                                                 |
| fs-extra 11.3.0, Windows and WSL2 Linux                                              | Both compile, then exit 1 with empty stdout and `Nona runtime error\r\n`; Windows Node prints `filesystem 5`. The expected existing failure is reproduced, not counted as compatibility success or diagnosed further.                                                                                      |
| Worker stub, Windows                                                                 | Node prints `worker 42`; Nona prints `worker ERR_NONA_UNSUPPORTED`. The explicit API-gap result is reproduced separately from workerpool's undiagnosed failure.                                                                                                                                            |
| TLS trust/hostname, Windows                                                          | Trusted fixture CA prints `trusted authorized true`; wrong hostname gives `ERR_TLS_CERT_ALTNAME_INVALID`; untrusted leaf gives `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Three outputs match Node; no Linux trust-store or adversarial-security inference.                                                        |
| Process identity, WSL2 Linux                                                         | `identity linux function true`, exit 0; Windows oracle separately prints `identity win32 undefined absent`. No credential mutation/name-resolution claim.                                                                                                                                                  |
| **New reviewer-written interaction sample**, Windows and WSL2 Linux, `gcStress=true` | Math.f16round, Float16Array, DataView float16, Iterator.from/map/toArray and asynchronous Array.fromAsync mapping jointly print `later 1 1 2.5 2,4,6 4,5`, matching Windows Node. This is fresh sample evidence for the post-v0.18.0 additions, not their whole-method or cross-architecture verification. |
| Same eight-file Test262 selection                                                    | Eight passes, zero failures/skips: six runtime cases and two compile-only negatives returning `E_SYNTAX`. No distinct-file count is increased by replaying the same selection.                                                                                                                             |
| Fresh browser-worker bundle and playground comparisons                               | All 18 image comparisons and the syntax diagnostic pass, including hello/path images for every target. Canonical `modulePath` inputs and exact byte comparison are retained. This executes the browser compiler in Node, not native foreign programs.                                                      |

Raw commands, sources, expected/actual output, exits, bounds and cleanup are in
[Windows replay](evidence/completeness/final-review-windows-x64.json),
[cross-target/new sample](evidence/completeness/final-review-cross-target.json),
[Test262 replay](evidence/completeness/final-review-test262-windows.json) and
[validation commands](evidence/completeness/final-review-validation.json).
Dependencies were reused with top-level version/lock checks; transitive
installed package bytes were not freshly authenticated with `npm ci`.

| Target       | Fresh image comparison | Local native-program evidence available to this final review                                                                                              |
| ------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| win32-x64    | Pass                   | Fresh package/API/TLS and new GC-stress sample executions; earlier broader samples remain separately attributed.                                          |
| linux-x64    | Pass                   | Fresh Windows-built ELF execution in WSL2: CLI/identity/new stress sample pass, fs-extra fails. Earlier Linux GC-root result remains historical evidence. |
| linux-arm64  | Pass                   | Not executed locally. Network/child services absent; 64 KiB-kernel behavior still unverified.                                                             |
| win32-arm64  | Pass                   | Not executed locally. Network/child services absent; hardware-unwind/source-stack limits remain.                                                          |
| darwin-x64   | Pass                   | Not executed locally. libSystem/deployment boundary and network/child gaps remain.                                                                        |
| darwin-arm64 | Pass                   | Not executed locally. libSystem/ad-hoc-signing/deployment boundary and service gaps remain.                                                               |
| freebsd-x64  | Pass                   | Not executed locally. Historical guest smoke is not a local/full Node-oracle suite.                                                                       |
| openbsd-x64  | Pass                   | Not executed locally. Same distinction, with execPath and BSD ABI limits retained.                                                                        |

The freshly built public alias union is exactly **86** names, matching the
inventory's 36 public providers; six private providers remain excluded.
Per-target inspection finds filesystem imports on all eight and network
inventory entries only on Windows/Linux x64. Child-process import names on
other targets are **not service support**: the dispatch selects throwing
adapters. These source distinctions agree with the matrix and the target table.

Reproduce the Windows and image checks without an untracked review helper:

```powershell
$finalNode = (Resolve-Path work/completeness-tools/node.exe).Path
$env:GOMAXPROCS = '2'
$env:UV_THREADPOOL_SIZE = '2'
$env:NODE_OPTIONS = '--v8-pool-size=2 --max-old-space-size=1536'
& $finalNode scripts/build.mjs
& $finalNode scripts/check-completeness-inventory.mjs --git
& $finalNode scripts/completeness-probes.mjs --cases cli,filesystem,worker-api,tls-verification --output work/final-review-windows-rerun.json
$env:TEST262_DIR = (Resolve-Path work/test262).Path
$env:TEST262_JOBS = '1'
$env:TEST262_RUNTIME_TIMEOUT_MS = '15000'
$env:TEST262_DELETE_BINARIES = '1'
$env:TEST262_FILE_LIST = 'tests/probes/completeness-test262.txt'
$env:TEST262_REPORT = 'work/final-review-test262-rerun.json'
& $finalNode scripts/test262-smoke.mjs language/expressions/coalesce
& $finalNode site/scripts/build-playground.mjs
& $finalNode site/scripts/check-playground.mjs
```

For the fresh Linux interaction case, use the exact source retained in JSON:

```powershell
$finalData = Get-Content docs/evidence/completeness/final-review-cross-target.json -Raw | ConvertFrom-Json
$finalCase = $finalData.cases | Where-Object id -eq 'linux-later-builtins-fresh'
$finalDir = Join-Path (Get-Location) 'work/final-review-linux-rerun'
New-Item -ItemType Directory -Force $finalDir | Out-Null
$finalEntry = Join-Path $finalDir 'main.mjs'
$finalImage = Join-Path $finalDir 'program'
[IO.File]::WriteAllText($finalEntry, $finalCase.source)
& $finalNode $finalEntry
& $finalNode --max-old-space-size=768 scripts/completeness-probes.mjs --compile $finalEntry linux-x64 $finalImage true
$finalGuest = (wsl -d Ubuntu --exec wslpath -a $finalDir).Trim()
wsl -d Ubuntu --cd $finalGuest --exec timeout 15s ./program
```

This rerun leaves its explicit owned directory for inspection. To replay CLI or
fs-extra, use the original fixture entry path so its pinned dependencies resolve;
do not move the package-import source away from its installation and call that
the same reproduction. Exact original paths/argv are retained as provenance.

### Factual checks beyond execution

I read the complete corrected narrative and final diff, all capability
limitations/evidence needs, entry-point registry, targets and previous review
dispositions. Semantic source checks were risk-based, not a line-by-line audit
of every referenced file. They included:

- Registry and fs/net/child dispatch; Worker/HTTP2 stubs; synchronous fs callback
  and promise wrappers; OS telemetry and UTF-8 decoder behavior; HTTPS option
  forwarding and HTTP timeout fields; anonymous error-stack CallSites. Actual
  provider bodies support the stated distinctions between names and services.
- `ir/optimize.ts`, `link.ts`, `runtime/root-scope.ts` and representative
  `runtime-roots.test.ts`/`float16.test.ts` bodies: pass ordering, lexical
  triggers, stable range/snapshot/container roots and narrow stress/oracle
  contracts agree with the report. Those full test files were not rerun.
- Test262 selection/negative-test branches and metadata: any compilation failure
  can satisfy the general parse-negative branch, and one default strictness
  variant is run. Fresh success does not cure these runner limitations.
- `MoveRules.lean` and `Audit.lean`: the modeled program is pure and
  straight-line, with transitive theorem-axiom checks; it is not a refinement
  proof of production TypeScript, GC, ABI or machine code. No Lean build was run.
- Native packaging/release scripts and workflow predicates: notice copying is
  absent in the inspected packager; `full-ci`, platform smoke and target-specific
  runners have the described boundaries. Archives were not inspected or fixed.

Independent recounting again finds **53,597** Test262 candidate files and **24**
coalesce files at `7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd`. All nine retained
CI source-report hashes match the local downloaded artifacts. Their actual
results contain **3,187 runtime passes**, zero failures/skips, within **4,231**
group files, leaving **1,044 exclusions**. The CI artifacts were inspected,
not freshly downloaded or rerun; their counts do not become local executions.

Official comparison pages reopened on this review date support the material
packaging/platform distinctions: versioned [Node SEA](https://nodejs.org/download/release/v26.9.0/docs/api/single-executable-applications.html)
includes the runtime and built-in generation/VFS restrictions;
[Deno compile](https://docs.deno.com/runtime/reference/cli/compile/) embeds denort
and lists six targets; [Bun executables](https://bun.com/docs/bundler)
include Bun and list six OS/CPU pairs plus musl variants;
[QuickJS](https://bellard.org/quickjs/) makes its own scoped ES2025 claim, while
[QuickJS-NG CLI](https://quickjs-ng.github.io/quickjs/cli/) appends bytecode to an
interpreter executable and requires prebundling dependencies. Pinned
[Static Hermes features](https://github.com/facebook/hermes/blob/17b37301da5da4a2cd55d78f9697c46c0fd96123/doc/Features.md)
and [shermes source](https://github.com/facebook/hermes/blob/17b37301da5da4a2cd55d78f9697c46c0fd96123/tools/shermes/shermes.cpp)
remain a source-only comparator. The unusual Deno lifecycle statement was
explicitly rechecked against its [2026-10-09 announcement](https://deno.com/blog/cloudflare).
These are documentation observations, not an executed comparative benchmark,
security rating or common conformance run; mutable manuals remain dated.

### Acceptance, public entry points and remaining handoff

| Issue criterion                                                | Final assessment                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–3: inventory, auditable claims and workload/API impact       | Accepted at the stated scope. 140 rows and eight targets retain explicit unverified/partial/missing boundaries; no universal compatibility percentage or inferred service support.                                                                                               |
| 4–5: alternatives, performance coordination, risks and roadmap | Accepted. Versioned primary sources and frozen baseline are explicit; #392/#395 remains separately owned; findings and bounded outcomes do not promise universal Node parity or all missing features in v0.20.0.                                                                 |
| 6: reproducible representative verification                    | Accepted. Fresh Windows/WSL, positive/negative and new interaction samples have exact raw records and reproduction commands; omitted suites are explicit.                                                                                                                        |
| 7: inventory, links and relevant checks                        | Strict validation and independent references/aliases/denominators pass. Coordinator's final 14 focused tests pass with zero failures/skips; refreshed production site build and 718 repository links pass. Final formatting/whitespace packaging is recorded by the coordinator. |
| 8: independent strong-model review/corrections/re-review       | Completed with the actual configuration recorded above, substantive independent reproduction and explicit RV1/RV2 resolution. No material unresolved disagreement.                                                                                                               |
| 9: linked PR and verification/review description               | Local PR description reviewed and prepared with `Closes #394`, verification, unknowns and review link. An actual PR and its CI remain pending publication, as explicitly required by the user's no-push/no-PR instruction.                                                       |

English/Russian READMEs, docs navigation, changelog, the report wrapper and all
nine localized module entry points now consistently describe bounded Windows
and Windows-built WSL2 evidence and point to this final verdict. They do not
call v0.20.0 released or infer eight-target execution. The independent local
file-link scan includes the local PR draft and this review. Its exact final
count is in the inspection record. The reviewer also checked 704 repository
links in the existing step-5 HTML; **that was not a regenerated final site**.
After execution ownership was released, the coordinator's new production
build checked **718** repository links; its commands and 14-test output were
read in [step-6 validation](evidence/completeness/step6-finalization.json).

The retained limitations remain substantive: undiagnosed fs-extra/Undici/
workerpool operations; untested methods/options, six local native targets and
Linux compiler/oracle builds; transitive package-byte authentication; long-lived
memory/network behavior; TLS/FFI/security assurance; notice delivery and archive
provenance; comparable independent performance. Fresh samples do not promote
whole matrix rows. No full `npm run check`/`npm test`, full Test262/corpus/
platform/bootstrap, `compare`, benchmark, Lean rebuild or security campaign was
run in this final review. The later main CI successes do not validate this
unpushed branch or erase the audited check failure/cancelled platform run.

**Disposition:** RV1 resolved; RV2 resolved; finalization consistency comments
resolved. The exact report/matrix bytes above are accepted for the authorized
local handoff. Apply the future PR's required CI/merge rules separately and
retain #394's existing claim until the owner completes or gives up that handoff.
