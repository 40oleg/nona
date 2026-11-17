# v0.35.0 candidate handoff

Preparation step 1 for [#634](https://github.com/40oleg/nona/issues/634),
18 November 2026. This commit prepares the version and changelog inputs for
hosted validation and measurement. Preparation, merge and publication remain
separate gates.

## Ownership and release scope

- Continue the existing harness claim and `nona/issue-634` branch from main
  `3c2d3bae1402305811fae1fb2ba608fbc0a92160`. The issue timeline, Development
  closure references and associated PR search showed no existing release PR.
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

## Local validation

Changed-file Prettier checks and `git diff --check` passed. After the small
`node site/scripts/sync-docs.mjs` generation step, `npm run check:doc-links`
passed (1,605 links in 310 documents). A source consistency audit verified the
package/lock/generated version, CLI expectations, all 36 site version edits,
unchanged dependencies, preserved historical changelog entries and unchanged
benchmark documentation. Checks ran sequentially at BelowNormal priority.
The full build, generated-version confirmation and CLI execution remain hosted
follow-ups below, not local test passes.

## Coordinator handoff and pending hosted work

Use the exact step-1 commit SHA reported by the worker as the candidate; retain
that SHA in the PR and benchmark receipts. This worker does not push, open a PR,
merge, tag or publish.

1. Open the existing branch's **draft** PR against `main`, with a title beginning
   **`[nona] Release `** and a description containing **`Closes #634`**. Apply
   **documentation, complex, full-ci, gc-stress** and milestone **v0.35.0**;
   read them back **before subsequent CI-triggering pushes**. Initial unlabeled
   runs do not satisfy labeled validation. Preserve the draft until missing
   measurements and validation are complete.
2. Run the full `scripts/build.mjs` on GitHub-hosted runners and confirm it
   leaves `src/version.ts` unchanged. Only its small version-emission block was
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

3. Use the existing [release-benchmark workflow](../.github/workflows/release-benchmark.yml)
   and [bench/report.mjs protocol](../bench/README.md) on the committed 0.35.0
   candidate. Retain startup, corpus, micro, real, awfy, game and profile suites,
   both HTTP generators at 1/32/256 connections, actual current Node/Deno/Bun
   versions, one-machine identity, exact measured source SHA, clean-source
   provenance and raw artifact hashes. Preserve genuine unsupported/runtime
   failures. A compiler/package/benchmark input change requires remeasurement.
4. Step 2 updates `PERFORMANCE.md`, both READMEs and all nine performance pages
   from actual hosted results, marking the old section superseded. This commit
   deliberately retains the existing dated v0.34.0 benchmark claims.
5. Require independent final diff/measurement review and successful necessary
   current-head CI before merge. All full/native/long validation stays hosted.
   Local work remains small, concurrency 1, BelowNormal, at most three workers.
6. After preparation merges, separately verify the published non-draft release,
   successful `release.yml` on the exact tag commit, eight nonempty native
   archives plus matching `SHA256SUMS`, extracted contents/version/notices,
   closed release issues and a closed milestone with no open members. Until
   then v0.35.0 is unfinished and v0.36.0 remains gated.
