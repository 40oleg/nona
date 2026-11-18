# v0.35.0 candidate handoff

Preparation record for [#634](https://github.com/40oleg/nona/issues/634),
18 November 2026. The committed version candidate and its hosted measurements
now supply the release performance documentation. Final validation, merge and
publication remain separate gates.

## Ownership and release scope

- Continue the existing harness claim and `nona/issue-634` branch from main
  `3c2d3bae1402305811fae1fb2ba608fbc0a92160`. The issue timeline, Development
  closure references and associated PR search initially showed no release PR;
  the coordinator subsequently opened draft [PR #650](https://github.com/40oleg/nona/pull/650).
  The current two-step harness plan matches this assignment; no foreign claim
  or status label was reset.
- GitHub metadata was read back: open issue, exactly the `documentation` type,
  `complex`, `nona-agent`, `blocked`, `nona-agent:wip`, `nona-agent:release`,
  milestone **v0.35.0** (29). These existing labels were preserved.
- On 2026-11-04 the owner deferred still-open
  [#602](https://github.com/40oleg/nona/issues/602) and draft
  [PR #630](https://github.com/40oleg/nona/pull/630) to **v0.36.0**. Their open,
  draft and milestone metadata was verified. This is neither a crash fix nor
  a successful complete diagnostic. Preserve the PR and all historical evidence.
- The owner's 2026-11-04 decision in
  [#516](https://github.com/40oleg/nona/issues/516) waives the mandatory
  three-hour native/all-route campaign. No long-run pass is claimed. Short
  correctness, necessary current-head CI and exact-tag publication checks remain.
- Keep `NONA_WORK_AHEAD=0` (verified in this worker's environment), the
  non-release runnable queue off and the future `nona/issue-620` branch
  preserved. Its observed remote SHA was
  `b7b70af445ec3866433801aeb76144f8a27c69e2`. No later-milestone work is authorized.
- The milestone-filtered open-issue endpoint returned only #634. The milestone
  summary endpoint nevertheless reported five open members. Retain this
  discrepancy and reconcile actual open issues **and PRs** before milestone
  completion; do not infer completion from either count alone.

## Verified prerequisite receipts

The repository's main ref, this branch's starting HEAD and every integrated
run below identify **`3c2d3bae1402305811fae1fb2ba608fbc0a92160`**. The runs
were completed successfully; these are baseline receipts, not results for the
new version commit.

| Evidence                                                                             | Observed result                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Candidate semantic replay](https://github.com/40oleg/nona/actions/runs/44142911288) | 25/25 jobs successful: Windows/Linux bounded replay, historical negative controls, 20 candidate shards and measured budget. All 25 report artifacts were nonempty and unexpired.                                                                                                                                |
| [Native platforms](https://github.com/40oleg/nona/actions/runs/44142856797)          | All 14 automatic jobs successful; the separate manual Windows full-regression job was skipped.                                                                                                                                                                                                                  |
| [Compiler builds](https://github.com/40oleg/nona/actions/runs/44142856984)           | 8/8 jobs successful; all eight `nona-<target>` distribution artifacts were nonempty and unexpired.                                                                                                                                                                                                              |
| [Check](https://github.com/40oleg/nona/actions/runs/44142856830)                     | 17/17 jobs successful, including Linux native, four Windows shards and eight selected Test262 groups.                                                                                                                                                                                                           |
| Other integrated workflows                                                           | [HTTP](https://github.com/40oleg/nona/actions/runs/44142856940), [corpus](https://github.com/40oleg/nona/actions/runs/44142856791), [formal verification](https://github.com/40oleg/nona/actions/runs/44142857075) and [pages](https://github.com/40oleg/nona/actions/runs/44142856761) completed successfully. |

[#646](https://github.com/40oleg/nona/issues/646) and
[roadmap #619](https://github.com/40oleg/nona/issues/619) were verified closed.
Their final acceptance records retain supported default/full semantic replay,
4,000 full-corpus native executions and the original GC-stressed HTTP,
macOS assert and RegExp witnesses. Earlier failures, the unrecorded original
RegExp signal and inconclusive historical cause attribution remain preserved;
the version update makes no broader diagnostic claim.

[#618](https://github.com/40oleg/nona/issues/618) is closed and retains its
all-eight packaging acceptance. Its final integrated artifact-only
[run 41462090260](https://github.com/40oleg/nona/actions/runs/41462090260)
at `ee482f34b8440e652c24aa8bc2501484c748f956` has nine successful jobs,
including assembly and extracted-archive verification; publication was skipped.
The retained `release-archives` artifact (13171044589) is 166,700,206 bytes,
unexpired, with API digest
`sha256:f5563cc6d06642a60cdce544d60d1035b458edd800842510406d109826f7b676`.
This preserves the prior archive/notices/checksum evidence; it is not new
0.35.0 packaging or publication validation.

The previous serial-release gate was also checked: the
[v0.34.0 release](https://github.com/40oleg/nona/releases/tag/v0.34.0) is
published and non-draft, with eight nonempty native archives plus `SHA256SUMS`.
Its annotated tag resolves to `69efefd6ea2c457db3bb0a1f8ef22f51305b3955`,
matching successful [release run 41225837947](https://github.com/40oleg/nona/actions/runs/41225837947).
The v0.34.0 milestone is closed with no open members. No published tag or
artifact was changed.

## Hosted benchmark receipt

The coordinator's [release-benchmark run 44182184617](https://github.com/40oleg/nona/actions/runs/44182184617)
completed successfully on the exact version-0.35.0 candidate
**`b57979de3ab82fc85e4c3bcf752e80895e30871b`**. Its single benchmark job and
all measurement/validation steps succeeded. Measurements began
**2026-11-17 at 21:40:56 UTC**, distinct from the 18 November release date.

All workloads ran sequentially on one GitHub-hosted Ubuntu 24.04.5 LTS runner:
Intel Xeon 6975P-C, four vCPUs, 15.3 GiB RAM, Linux 7.0.0-1014-aws x64.
The CPU governor was not exposed and infrastructure contention is unknown.
Actual versions were Node.js **v26.9.0**, Deno **2.9.8**, Bun **1.4.4**,
hyperfine **1.18.0** and valgrind **3.22.0**. Machine/tool output, affinity,
vendor pins and the protocol are retained in the artifacts.

| Artifact                                                                                                                     |  Bytes | SHA-256 of downloaded ZIP                                          |
| ---------------------------------------------------------------------------------------------------------------------------- | -----: | ------------------------------------------------------------------ |
| [Final report and HTTP evidence, 14375758451](https://github.com/40oleg/nona/actions/runs/44182184617/artifacts/14375758451) | 210186 | `329d6f965292f4b34d0fb1d8f8faaac32fc28afc47ba1256c5175bce87447709` |
| [Seven-suite checkpoint, 14373638616](https://github.com/40oleg/nona/actions/runs/44182184617/artifacts/14373638616)         |  95198 | `c167801fdb3d14f14d544375368d589f382e912a4d63a29c37a56c9cb9429d8b` |

Both downloaded ZIP digests match the GitHub artifact API. The final ZIP was
independently compared byte-for-byte with every extracted input used for these
documentation updates. Both artifacts are unexpired and retained until
2027-02-15; preserve them before expiry if longer retention is needed.

Clean-source provenance is the workflow's exact-SHA checkout and unpatched
build, together with `source-sha.txt`, `source.txt`, the retained protocol and
these `source-sha256.txt` entries, independently verified against Git blobs:

| Input                  | SHA-256                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `bench/report.mjs`     | `c48c971c6dedf994adcbf01ba5ff539879e0afb1a1c1d436250a80b7b217fd33` |
| `bench/real/fetch.mjs` | `abfb4c4be87fff91bc7c4b4f52eb84cd50dce7a8f9d9927fdbafcab8fa06aecb` |
| `bench/awfy/fetch.mjs` | `53a0049f1d81d1a51707b424f45407cc8706a8a63a88b55c22f45669c2d58a0e` |
| `package-lock.json`    | `63ec74ea4d7d06696ad8a7ee415ca9d490d147c5a376cc9834c4d3a176bb9c63` |

The benchmark workflow makes no tracked compiler or benchmark source patches.
The later review edits change documentation only; compiler, package, build and
benchmark inputs match the measured candidate. Any later input change requires
remeasurement. No post-build clean-working-tree receipt was emitted, so the
separate generated-version consistency check below remains required.

The retained command was:

```sh
node bench/report.mjs --suite startup,corpus,micro,real,awfy,game,profile --runs 10 --startup-runs 30 --iterations 10 --scale 0.1 --runtimes node,deno,bun,nona --out work/release-benchmark
```

Independent read-only checks verified the seven JSON/Markdown suite pairs:
2 startup cases, 10 corpus programs, 14 micro programs, 6 real programs,
14 Are-We-Fast-Yet cases, 9 Benchmarks Game cases and 8 profiles. All expected
successful sample counts, nine raw 30-sample hyperfine exports, recorded
correctness checks, summary categories and ratios match. The validator reports
`complete-with-documented-limitations`, zero problems and exactly two
limitations: Deno cannot import the pinned lodash CommonJS default export in
the startup and real suites. Their failures remain in the published tables
and raw evidence; no rows were dropped.

Both HTTP generators (`load` and `wrk`) ran all six cases at **1, 32 and 256**
connections, with server CPU 0 and client CPU 1. Each cell has a two-second
warm-up and five three-second measurements for Node and Nona. Each generator
retains **216 successful invocations**, including **36 successful HTTP 200/body
preflights**. Independent checks recomputed all 18 rows per generator from raw
samples (median/min/max throughput, ratios and p99), with zero request/socket
errors or unexpected stderr.

`PERFORMANCE.md` now contains these measurements, preserving the v0.34.0 tables
as superseded history. Both READMEs quote the new startup/category/wrk numbers;
the English performance page includes the report and all eight translations
link the v0.35.0 measurements while identifying their older tables as history.
These Linux x64 measurements do not establish native validation for other
targets, current-head CI acceptance or publication.

## Local validation

The initial version candidate's changed-file Prettier checks and
`git diff --check` passed. After the small
`node site/scripts/sync-docs.mjs` generation step, `npm run check:doc-links`
passed (1,605 links in 310 documents). A source consistency audit verified the
package/lock/generated version, CLI expectations, all 36 site version edits,
unchanged dependencies, preserved historical changelog entries and unchanged
benchmark documentation. Checks ran sequentially at BelowNormal priority.
The hosted benchmark subsequently built the compiler successfully;
generated-version consistency and CLI execution remain hosted follow-ups below,
not local test passes.

For the measured documentation update, changed-file Prettier and
`git diff --check` passed. Regenerating the site's included Markdown and
`npm run check:doc-links` passed (1,612 links in 310 documents). Small,
sequential read-only audits verified artifact bytes, raw sample counts,
correctness receipts, recomputed HTTP rows, exact publication of every report
table, both README summaries and all nine performance pages. The historical
performance section is byte-for-byte unchanged except for its superseded
notice. A diff against the measured SHA confirms unchanged compiler, package,
build and benchmark inputs. All local checks ran at BelowNormal priority;
no local build, benchmarks, native validation or full suite was run.

## Coordinator handoff and remaining hosted work

Use the measured candidate SHA above for benchmark provenance. The coordinator
opened draft PR #650 against `main`; its draft status, **documentation, complex,
full-ci, gc-stress** labels and **v0.35.0** milestone were read back during this
review update. This worker does not push, open a PR, merge, tag or publish.

1. Keep PR #650 **draft** until final validation and independent review are
   complete. Its current description uses **`Related to #634`**; change that to
   **`Closes #634`** only when preparation is complete. Preserve its release
   title and required labels/milestone; read them back **before subsequent
   CI-triggering pushes**. Initial unlabeled runs do not satisfy labeled validation.
2. On the final head, run `scripts/build.mjs` on GitHub-hosted runners and confirm
   it leaves `src/version.ts` unchanged. Only its small version-emission block was
   executed locally to synchronize the committed module; no local compiler build
   was run. Hosted regeneration and CLI validation remain pending. After
   `npm ci` and `npm run build`, run:

    ```sh
    git diff --exit-code -- src/version.ts
    node --test --test-concurrency=1 --test-name-pattern="^CLI help and version$" dist/tests/cli.test.js
    npm run format:check
    node site/scripts/sync-docs.mjs
    npm run check:doc-links
    ```

3. The [hosted benchmark receipt](#hosted-benchmark-receipt) and performance
   documentation complete the measurement portion of step 2. Retain the raw
   artifacts and limitations. Use the existing [release-benchmark workflow](../.github/workflows/release-benchmark.yml)
   and [protocol](../bench/README.md) again if compiler/package/benchmark inputs change.
4. Require independent final diff/measurement review and successful necessary
   current-head CI before merge. All full/native/long validation stays hosted.
   Local work remains small, concurrency 1, BelowNormal, at most three workers.
5. After preparation merges, separately verify the published non-draft release,
   successful `release.yml` on the exact tag commit, eight nonempty native
   archives plus matching `SHA256SUMS`, extracted contents/version/notices,
   closed release issues and a closed milestone with no open members. Until
   then v0.35.0 is unfinished and v0.36.0 remains gated.
