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
| Bun 1.4.3          | [Release blog](https://bun.com/blog/bun-v1.4.3), [executables](https://bun.com/docs/bundler/executables) and [Node compatibility](https://bun.com/docs/runtime/nodejs-compat) support `bun check`, runtime-containing executables, six OS/CPU combinations plus musl variants, and incomplete compatibility. No promotional performance numbers are adopted.                                                                                                                                                                                                       |
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
