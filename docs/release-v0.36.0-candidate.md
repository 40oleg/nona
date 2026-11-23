# Nona v0.36.0 release verification

The release adds the modeless settings window for Windows x64 and documents the project’s subsystem references and Lean verification policy. [Changelog](../CHANGELOG.md) · [Win32 settings](win32-settings.md) · [Formal verification](formal-verification.md).

The experimental dense-switch proof in [PR #286](https://github.com/40oleg/nona/pull/286) was closed after review found a counterexample involving distinct fractional switch labels. The [Lean coverage roadmap](https://github.com/40oleg/nona/issues/653) tracks the production guards, regression cases and proofs for a subsequent release.

## Hosted benchmark receipt

The [release benchmark](https://github.com/40oleg/nona/actions/runs/45120442439) ran on 2026-11-23 against version 0.36.0 at [`15b7f4b397dc3d20644beb2b0ec8e71e4ffd0e13`](https://github.com/40oleg/nona/commit/15b7f4b397dc3d20644beb2b0ec8e71e4ffd0e13). SHA-256 digests were checked for the report generator, both vendor-fetch scripts and the package lock against their committed Git blobs.

| Artifact                                                                                                                                             | ID          | SHA-256                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| [release-benchmark-report-15b7f4b397dc3d20644beb2b0ec8e71e4ffd0e13-1](https://github.com/40oleg/nona/actions/runs/45120442439/artifacts/14795733359) | 14795733359 | `6af411b90f29c8b6d7e51b0d70f0c02519cbd0928f68c72da1d027d5ab600849` |
| [release-benchmark-15b7f4b397dc3d20644beb2b0ec8e71e4ffd0e13-1](https://github.com/40oleg/nona/actions/runs/45120442439/artifacts/14797595434)        | 14797595434 | `f233c42e2ab3049360d47c9f8e7a81a5c64c56a73cc0fd672acdcc1c6f9eb16d` |

Each of the seven suites supplied a machine-readable result and a report. Each HTTP generator supplied 216 invocations, including 36 response preflights. The raw samples cover 1, 32 and 256 connections. All preflights returned HTTP 200 with nonempty bodies. The [performance report](../PERFORMANCE.md) includes both generators and the runtime versions.

The validator reported **complete-with-documented-limitations**. Its recorded limitations are shown below.

```text
startup/lodash-hello: error: Uncaught SyntaxError: The requested module '../real/vendor/lodash/lodash.js' does not provide an export named 'default'
import _ from "../real/vendor/lodash/lodash.js";
       ^
    at <anonymous> (file:///home/runner/work/nona/nona/bench/startup/lodash-hello.mjs:4:8)
Command exited with non-zero status 1
```

```text
real: lodash on deno: 1 run(s) failed: error: Uncaught SyntaxError: The requested module './vendor/lodash/lodash.js' does not provide an export named 'default'
```

## Release records

The [release PR](https://github.com/40oleg/nona/pull/657) records the required checks for the integrated candidate. The [tagged release](https://github.com/40oleg/nona/releases/tag/v0.36.0) provides the native archives and checksum manifest.
