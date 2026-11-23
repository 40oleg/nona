# v0.36.0 candidate handoff

Preparation record for [#656](https://github.com/40oleg/nona/issues/656),
23 November 2026. Version metadata and release scope are prepared locally.
**Preparation is incomplete:** measurements of the committed 0.36.0 candidate,
performance tables, final-head hosted validation and review remain required.
The source worker must commit without pushing or opening a PR; the existing
harness/coordinator performs those operations. No tag or release is authorized
for the source worker.

The coordinator committed the initial preparation as
**`15b7f4b397dc3d20644beb2b0ec8e71e4ffd0e13`** and opened draft
[PR #657](https://github.com/40oleg/nona/pull/657). Its head matches this
checkout. The earlier local staging failure did not prevent that coordinator
handoff. This review worker must still commit locally without pushing,
opening another PR, tagging or publishing.

**Review-update commit blocker:** staging the review document failed with
permission denied while creating the shared worktree's `index.lock` outside
the writable checkout. No review commit was created and no permission bypass
was attempted. The current review diff is retained in ignored
`work/release-656-evidence/review-update.patch`; the coordinator must stage
and commit it through its normal worktree access.

## Ownership and scope

- The existing branch is `nona/issue-656`, starting at current main
  **`a9719b0ace8adf6d00b8e147f3a806de753f928b`**. The issue's closure references,
  cross-reference timeline and associated PR search showed no resolving PR.
- The issue readback showed exactly one type, `documentation`, plus `complex`,
  `nona-agent`, `blocked`, `nona-agent:wip`, `nona-agent:release` and milestone
  **v0.36.0** (31). All claim/state labels are preserved. The existing harness
  status comment identifies host `DESKTOP-BPQOR38`, PID 16876 and startup at
  05:38 UTC. That PID is not visible from this execution environment and no
  launcher logs are available in this checkout; live launcher/worker health is
  **unverified**, not a successful-run
  receipt. The explicit worker assignment authorizes continuing this claim;
  no takeover, new harness launch or foreign-claim reset was performed.
- [#654](https://github.com/40oleg/nona/issues/654) is closed after
  [PR #655](https://github.com/40oleg/nona/pull/655) merged at the exact main SHA
  above. Git history since v0.35.0 contains merged scope from **#648, #649 and
  #654** only: subsystem-reference policy, the `win32-x64` settings bridge and
  the Lean proof policy. The bridge rejects Windows ARM64 and other targets.
  The Lean policy describes future correspondence/numeric coverage; it does
  not ship those proofs. [PR #286](https://github.com/40oleg/nona/pull/286) is
  closed with no merge date and is excluded.
- Readbacks confirm [#653](https://github.com/40oleg/nona/issues/653),
  [#602](https://github.com/40oleg/nona/issues/602) and the preserved open draft
  [PR #630](https://github.com/40oleg/nona/pull/630) belong to **v0.37.0**.
  Their work and state are untouched. `NONA_WORK_AHEAD=0` remains set.
- Version 0.36.0 changes only the root version in `package.json`, both root
  version entries in `package-lock.json`, generated `src/version.ts` and CLI
  expectations. Dependencies are unchanged. The generator's version-emission
  block was executed without running a compiler build. Current-version and
  CLI pages are synchronized across all nine site languages; historical
  Test262 audits, changelog entries and performance figures retain their dates.

## Verified preceding-release gate

The [v0.35.0 release](https://github.com/40oleg/nona/releases/tag/v0.35.0)
(release ID 449555114) is published, non-draft, dated 2026-11-18. Its eight
native archives and `SHA256SUMS` are present and nonempty. The annotated tag
object `f437c716b001fa7645a49709ae64adc495a42a3f` dereferences to
**`087502ab143a4c3d1e78c6a7a5743b7cbd7b34a3`**, matching successful completed
[`release.yml` run 44232776575](https://github.com/40oleg/nona/actions/runs/44232776575).
Milestone **v0.35.0** (29) is closed with zero open members; its open-member
endpoint also returned an empty list. This satisfies the prerequisite gate
for preparing v0.36.0. No published asset or tag was changed.

At 05:49 UTC on 2026-11-23, main at `a9719b0ace8a` had successful
[formal verification](https://github.com/40oleg/nona/actions/runs/45118633599),
[pages](https://github.com/40oleg/nona/actions/runs/45118633626) and
[HTTP regression](https://github.com/40oleg/nona/actions/runs/45118633523).
[Check](https://github.com/40oleg/nona/actions/runs/45118633713) was queued;
[corpus](https://github.com/40oleg/nona/actions/runs/45118633557),
[native platforms](https://github.com/40oleg/nona/actions/runs/45118633825) and
[self-hosting](https://github.com/40oleg/nona/actions/runs/45118633531) were
running. No failure was reported in this snapshot, but these are **pending
baseline checks**, not candidate passes. Recheck their terminal results and
prioritize any current-release CI failure before proceeding.

## Hosted benchmark status

Review readback at **05:54 UTC on 2026-11-23** found the candidate's
[release-benchmark run 45120442439](https://github.com/40oleg/nona/actions/runs/45120442439)
**queued**, with no conclusion and **zero artifacts**. It was created at
05:52:06 UTC for the exact committed version-0.36.0 candidate
**`15b7f4b397dc3d20644beb2b0ec8e71e4ffd0e13`**. The workflow checks out the
PR head SHA and runs all seven report suites and both HTTP generators on
one GitHub-hosted runner. Reuse this run; a duplicate dispatch is unnecessary.
Neither completed measurements nor successful candidate validation can be
claimed while it is queued. The review's blocking performance-refresh finding
therefore remains open until its terminal result and complete artifacts have
been verified and the tables below have been replaced.

PR #657 is **draft**, uses `Part of #656`, and has exactly the
**documentation** type plus **complex, full-ci, gc-stress**, with milestone
**v0.36.0**. These were read back from GitHub. The applicable candidate check,
corpus, formal-verification, pages, semantic-replay, native-platforms,
self-hosting and HTTP runs were also still queued. They are not successful
validation receipts. This worker has not pushed or changed the PR.

The earlier [main run 45116873583](https://github.com/40oleg/nona/actions/runs/45116873583)
was still **in progress, with no terminal conclusion**, when rechecked at
05:54 UTC on 2026-11-23. Its report step succeeded and its load-generator
HTTP step was running; wrk, completeness validation and final evidence upload
were pending. Do not infer workflow success from the report artifact.

Its exact source is **`8a7b04fc865370c09def4b97531a157e9209efbc`**.
Both the committed package and artifact environment identify **Nona 0.35.0**.
The difference from this worker's starting main consists only of `AGENTS.md`,
`CHANGELOG.md`, `docs/architecture.md` and `docs/formal-verification.md`.
However, the new candidate changes package/build inputs: `scripts/build.mjs`
embeds the package version. **Rerun the existing release-benchmark workflow
on the committed 0.36.0 candidate; do not relabel the earlier measurements.**

The partial report ZIP was downloaded and its actual bytes verified:

| Artifact                                                                                                                                                            |  Bytes | Downloaded ZIP SHA-256                                             | Retention                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: | ------------------------------------------------------------------ | --------------------------------------------------- |
| [14793410890](https://github.com/40oleg/nona/actions/runs/45116873583/artifacts/14793410890), `release-benchmark-report-8a7b04fc865370c09def4b97531a157e9209efbc-1` | 95,629 | `6b75a868246b9a6ea6d82bd0469969ea58d6cd5de92880e99fc8e6e86d996a42` | Unexpired; 90 days, expires 2027-02-21 05:17:50 UTC |

The downloaded hash matches GitHub's API digest. `source-sha.txt` matches
the measured revision; all four `source-sha256.txt` entries match its committed
Git blobs (`bench/report.mjs`, both vendor-fetch scripts and `package-lock.json`).
The recorded machine was GitHub-hosted Linux 7.0.0-1014-aws x64, Ubuntu 24.04,
Intel Xeon 6975P-C, four vCPUs, 15.3 GiB RAM; no exposed CPU governor,
unknown infrastructure contention. Actual versions: Node.js **v26.9.0**,
Deno **2.9.8**, Bun **1.4.5**, hyperfine **1.18.0**, valgrind **3.22.0**.
The artifact retains fuller machine/tool versions, protocol, vendor pins and
raw report samples.

All seven suite files are present: startup 2 cases, corpus 10, micro 14,
real 6 programs, AWFY 14, game 9 and profile 8, with nine raw startup
hyperfine exports. Their mismatch arrays are empty. The real suite records
the documented Deno/lodash CommonJS default-export failure; the startup table
also retains that limitation. These observations are a **partial evidence
audit**, not complete sample/correctness acceptance. This artifact has no
`validation.json`, HTTP tables or raw HTTP invocations; it cannot establish
complete benchmark success. Its numbers have not replaced published tables.
The local download is retained under ignored `work/release-656-evidence/`;
retain the hosted artifacts and archive them before expiry.

## Local verification

Local `npm ci --no-audit --no-fund` completed inside this checkout. Small
sequential source audits passed for dependency preservation, version-generator
consistency, CLI literal expectations, 36 site version edits, unchanged
historical changelog/performance evidence and the partial artifact's identity
and four input hashes. Changed-file Prettier and `git diff --check` passed.
`node site/scripts/sync-docs.mjs` regenerated 13 included documents, and
`npm run check:doc-links` passed (1,679 links in 313 documents).

An independent read-only review of the local draft diff and partial measurement
receipt found no defects. It independently verified the ZIP size/hash, measured
0.35.0 identity, version consistency, release scope and historical evidence
preservation. This review accepts an **incomplete draft handoff**, not release
readiness; the final diff and new 0.36.0 receipts still require independent
review after the hosted work below.

No local compiler build, native executable test, benchmark, HTTP generator or
full suite was run. The CLI test was **not executed locally**; its execution
and full/native validation remain hosted. Local commands use concurrency 1
and BelowNormal priority; no background workload is started.

The review update reran the sequential source audit, changed-file Prettier,
site document synchronization, `npm run check:doc-links` (1,679 links in 313
documents) and `git diff --check`; all passed. The source audit checked
package/lock/generated-version consistency without building the compiler and
reconfirmed that the available checkpoint measures **0.35.0**, lacks HTTP
evidence and has no final validator result. It is not a candidate benchmark
pass. The GitHub CLI is authenticated, but the recorded launcher PID remains
unavailable to this worker; no live harness-health claim is made.

## Coordinator handoff and remaining gates

1. Recheck the existing harness process, recent logs, actual #656 activity and
   current-main CI. Report any authentication/startup blocker plainly. Preserve
   existing draft **PR #657**, targeting `main` on this branch, titled
   **`[nona] Release v0.36.0`**. Recheck exactly the **documentation** type,
   **complex**, milestone **v0.36.0**, and **full-ci, gc-stress** before the
   relevant CI-triggering push. Initial unlabeled runs do not satisfy final
   validation.
   Use `Part of #656` while preparation remains incomplete; change it to
   `Closes #656` only after preparation and review are complete.
2. Await existing candidate **run 45120442439** of the
   [release-benchmark workflow](../.github/workflows/release-benchmark.yml).
   Record its exact full source SHA, terminal conclusion, artifact IDs,
   retention/expiry and actual downloaded ZIP SHA-256 hashes. Verify source
   identity and input hashes, actual machine/runtime/tool versions and vendor
   pins. Require `validation.json` with no unexplained problems, all seven
   reports with expected sample counts and correctness comparisons, and both
   **load and wrk at 1/32/256 connections**, including raw HTTP output,
   successful preflights and 216 invocations per generator. Preserve the
   documented Deno/lodash limitations, all failures and all raw evidence.
   Everything runs sequentially on GitHub-hosted runners per the
   [release protocol](../bench/README.md), never on the owner's machine.
3. Replace the pending notice atop [PERFORMANCE.md](../PERFORMANCE.md) with
   a dated 0.36.0 report containing all seven suite reports, both HTTP
   generators, measured revision, machine/runtime versions, protocol and
   limitations. Retain the entire prior section and its historical links,
   marking it superseded. Recompute startup/category/HTTP summaries in both
   READMEs from the verified artifacts and update the English performance page
   and the ar/bn/es/fr/hi/pt/ru/zh notices, retaining historical translated
   tables. Update this receipt. Documentation-only follow-ups may reuse
   measurements only after comparing **all** relevant compiler, package,
   lockfile, build, benchmark and workflow inputs against the measured SHA.
4. On the final head, use GitHub-hosted runners to verify:

    ```sh
    npm ci
    npm run build
    git diff --exit-code -- src/version.ts
    node --test --test-concurrency=1 --test-name-pattern="^CLI help and version$" dist/tests/cli.test.js
    npm run format:check
    node site/scripts/sync-docs.mjs
    npm run check:doc-links
    ```

    Require successful applicable **current-head** check, corpus, formal
    verification, pages, semantic replay (including the candidate lane), native
    platforms, self-hosting and HTTP workflows. Use a manual hosted
    `release.yml` run on the candidate for artifact-only packaging validation;
    verify checksums, extracted contents, versions, licenses and notices with
    `scripts/verify-release-archives.mjs`. A manual run does **not** publish a
    release. Obtain independent final diff and measurement-receipt review;
    keep the PR draft until all preparation gates pass.

5. After merge, only the coordinator/harness tags the merged commit and
   publishes. Completion still requires a **published non-draft v0.36.0**,
   successful `release.yml` on that exact dereferenced tag commit, all eight
   nonempty native archives plus `SHA256SUMS`, actual downloaded archive hash
   and extracted content/version/license/notice verification with
   `scripts/verify-release-archives.mjs --archives <dir> --tag v0.36.0`, every
   milestone member closed, `blocked` removed from closed issues, and a
   closed milestone with zero open members. Preserve the serial gate and
   v0.37.0 work until those publication receipts exist.
