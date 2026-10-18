# Opt-in completeness workloads

These fixtures belong to issue [#394](https://github.com/40oleg/nona/issues/394).
They exercise small, meaningful operations in real published packages. They are
not the packages' full test suites or a statistical sample of npm compatibility.
Pins deliberately stay fixed; they are not claims about the latest versions.

| Package and primary repository                                | Pin    | Selection and operation                                                                                                                  |
| ------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [minimist](https://github.com/minimistjs/minimist)            | 1.2.8  | Small CommonJS CLI dependency: aliases, numeric arguments and negation, then write/read/delete JSON through `node:fs`.                   |
| [fs-extra](https://github.com/jprichardson/node-fs-extra)     | 11.3.0 | Higher-level filesystem dependency graph: async directory creation, JSON output/read, recursive copy and removal.                        |
| [json5](https://github.com/json5/json5)                       | 2.2.3  | Configuration/data parsing: comments, single quotes, trailing commas, serialization and invalid-input rejection.                         |
| [Express](https://github.com/expressjs/express)               | 5.1.0  | Real HTTP framework: JSON middleware, route dispatch, POST body, status and response. Uses an ephemeral loopback port.                   |
| [Undici](https://github.com/nodejs/undici)                    | 7.16.0 | HTTP client with a substantial host API dependency graph: consume JSON from the runner's loopback server.                                |
| [fflate](https://github.com/101arrowz/fflate)                 | 0.8.2  | Streaming pure-JS gzip in two chunks and independent decompression; fixed gzip timestamp. Does not test its async worker implementation. |
| [cross-spawn](https://github.com/moxystudio/node-cross-spawn) | 7.0.6  | Subprocess wrapper: capture output and nonzero exit from the explicitly selected Node executable, with a timeout and no shell.           |
| [p-limit](https://github.com/sindresorhus/p-limit)            | 6.2.0  | ESM promise concurrency: four timed tasks, maximum two active, ordered results and emptied queue. This is not parallel CPU execution.    |
| [workerpool](https://github.com/josdejong/workerpool)         | 9.3.4  | Actual worker-thread task submission and result, with one worker and explicit termination. Exercises the expected worker/AOT boundary.   |

`sources.json` preserves registry URLs, source repositories, registry `gitHead`
when present, tarball URLs and integrity strings observed on 2026-10-18.
`package-lock.json` pins transitive versions and integrity. No package is patched
or replaced by a synthetic implementation. Installation disables lifecycle
scripts. It is explicit and is never part of `npm test` or `npm run build`.

From the repository root, using Node >=26 and an existing compiler build:

```sh
node scripts/completeness-probes.mjs --install --npm-cli /path/to/npm/bin/npm-cli.js --output work/completeness-results.json
node scripts/completeness-probes.mjs --cases cli,json,stream-writable-queues,gc-roots --output work/completeness-repeat.json
```

Without `--install`, the runner checks existing top-level versions, records that
the installation is unverified, and does not access the network. An absent or
wrong dependency prevents package probes from running. Use `--install` to obtain
fresh, lock-checked dependencies. To regenerate the lock intentionally, run
`npm install --package-lock-only --ignore-scripts --no-audit --no-fund` **inside
this directory**, then update `sources.json` and review version changes.

All expected output is in `tests/probes/completeness-cases.mjs`. The runner
copies the dependencies to an owned temporary tree and gives the Node oracle
and native binary separate working directories. It uses the repository's
`compile` interface with ordinary module resolution, as `tests/npm.test.ts`
does. The existing `runModulesOnHost`/`runOracle` helpers combine stages or
apply Script semantics; they cannot preserve the separate module compilation,
artifact and execution failures needed here. The two stream cases are reused
directly from `tests/probes/stream-probes.ts`. TLS uses the existing test CA and
EC certificate on loopback with TLS 1.3/AES-128-GCM; it checks trusted, wrong-host
and untrusted connections, not general security assurance.

Execution is sequential. Each compiler child has a 768 MiB V8 heap cap and a
45-second timeout; each oracle/native program has 15 seconds, except native TLS
at 30 seconds. Installation has 60 seconds. Output is bounded. Timeouts kill
the child process tree. Servers and sockets are closed, temporary files are
removed with retries, and cleanup failure is an infrastructure error. Installed
fixture dependencies remain for reuse; generated executables do not.

The JSON report records the compiler source commit, checkout commit, source and
fixture hashes, tool versions, commands/working directories, expected/actual
stdout, stderr, exit/signal, timeout/error, artifact size/hash and cleanup.
Durations are timeout evidence, **not benchmarks**. A zero runner exit means
the evidence collection completed with valid Node oracles; it does not mean
every workload is compatible. Inspect each `assessment`: `compile-failed`,
`runtime-failed` and `expected-api-gap` are retained findings. Setup, oracle or
infrastructure failures return nonzero. Report freshness is tied to content
hashes; rebuild after compiler changes and rerun after fixture/runner changes.

The selected Node executable is also the explicit subprocess payload dependency.
That particular workload therefore does not demonstrate a deployment without
Node. Package-level failures are retained with their exact diagnostics; a
generic runtime error does not establish which transitive API caused it.
