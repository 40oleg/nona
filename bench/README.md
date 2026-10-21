# Benchmarks

Micro-benchmarks (`05_*` ... `18_*`), the real-world corpus (`real/`), the Are-We-Fast-Yet suite (`awfy/`), the Benchmarks Game programs (`game/`), the start-up cases (`01_hello.js`, `startup/`) and the HTTP server cases (`http/`) behind [`PERFORMANCE.md`](../PERFORMANCE.md).

[`cpp/`](cpp/README.md) holds the separate comparison of Nona with optimized C++ (#401): matched arithmetic, call and UTF-16 string kernels, its own build, assembly check and runner. The current results are in [docs/perf-cpp.md](../docs/perf-cpp.md) (2026-10-20).

## The report (`report.mjs`)

```
npm run build
node bench/real/fetch.mjs      # acorn, marked, lodash, prettier (pinned versions)
node bench/awfy/fetch.mjs      # Are-We-Fast-Yet JavaScript benchmarks (pinned commit)
node bench/report.mjs [--suite startup,corpus,micro,real,awfy,game,profile] [--runs 10] [--scale 0.1] [--runtimes node,deno,bun,nona] [--only 05,06] [--out bench/results]
```

`report.mjs` regenerates every table of the current `PERFORMANCE.md` section: it builds each program with `dist/cli.js`, runs it `--runs` times per runtime after one untimed warm-up run, and prints Markdown tables with the median and the interquartile range, the Nona/Node ratio (≈ marks ratios within ×1.5, the noise of a shared machine) and a summary with the geometric mean per category. Raw runs go to `bench/results/<suite>.json` (git-ignored), the tables to `bench/results/<suite>.md`.

- `startup`: hello world and `startup/lodash-hello.mjs` with [hyperfine](https://github.com/sharkdp/hyperfine) when installed (30 runs after 5 warm-ups, `--startup-runs`), executable size, build time (median of 3 builds) and peak RSS; `bun build --compile` when Bun is installed.
- `corpus`: ten programs of [`programs/`](../programs/), whole-process time.
- `micro`: the `05_*`–`18_*` scripts (per-phase timings from the scripts' JSON lines; labels and categories in `lib/metrics.mjs`).
- `real`: `real/*.mjs|js` (acorn, marked, lodash, Prettier, the `log-scan` case of #387–#389 and a 20 MB JSON file); `--real-scale` sets their SCALE (default 1).
- `awfy`: the 14 Are-We-Fast-Yet benchmarks through `awfy/awfy.js`, `--iterations` (default 10) timed iterations per process with the suite's standard inner-iteration counts; first iteration and steady state (median of iterations 4–n) are reported, with the per-iteration warm-up curve.
- `game`: the nine programs of `game/` with their sizes in `report.mjs`, whole-process time and md5 of stdout compared between runtimes; `fasta` output (N = 250 000) is generated once into `build/`.
- `profile`: instruction counts and routine profiles of selected cases, Nona under QEMU (`scripts/profile-runtime.mjs`) and Node.js under callgrind (Linux x64; needs `qemu-x86_64`, `objdump` and `valgrind`).

Every program prints or produces something that is compared between runtimes (the `check` value of the scripts' JSON line, the verified result of the Are-We-Fast-Yet harness, the md5 of stdout for whole programs); a mismatch or a program Nona cannot build is listed under the table, never dropped.

Third-party code is not kept in the repository: `real/fetch.mjs` unpacks pinned npm packages into `real/vendor/`, `awfy/fetch.mjs` makes a sparse, shallow clone of [smarr/are-we-fast-yet](https://github.com/smarr/are-we-fast-yet) at a pinned commit into `awfy/vendor/` together with its `LICENSE.md` (MIT for the SOM-derived benchmarks, Sun's terms for Richards and DeltaBlue, Apache 2.0 for Havlak). The `game/` programs were written for this repository after the problem descriptions of the [Computer Language Benchmarks Game](https://benchmarksgame-team.pages.debian.net/benchmarksgame/) and are MIT like the rest of Nona; their outputs match the game's expected outputs for the sizes it publishes (n-body 1000, fannkuch-redux 7, spectral-norm 100, binary-trees 10, k-nucleotide and regex-redux on fasta 1000). N and INPUT come from the environment because Nona's `process.argv` has no script path.

## Running the older scripts (`run.mjs`)

```
npm run build
node bench/run.mjs [--scale 0.1] [--runs 3] [--timeout 600] [--only 05,06] [--runtimes node,nona] [--real]
```

- Every script reads `SCALE` from the environment: the problem size is `SCALE` times the size named in the script (1M elements, 10M calls, ...). `--scale 0.1` gives the N = 100 000 used in the tables for arrays, objects, Map/Set, calls and classes.
- `run.mjs` builds each script with `dist/cli.js`, runs it `--runs` times per runtime and prints one JSON line per run (wall time, the script's own per-phase timings in `metrics`, peak RSS on Linux). Every script prints a `check` value; it must be identical on every runtime.
- `--runtimes` defaults to `node,deno,bun,nona`; runtimes that are not installed are skipped.
- `--real` runs `real/` instead (run `node bench/real/fetch.mjs` first). HTTP cases are described in `http/`.

## Protocol for a release update

1. Build the release commit (`npm ci && npm run build`) and note the commit hash, the OS, the CPU and the Node.js version (`report.mjs` prints them as its first line).
2. Close other programs. If the machine is shared, say so next to the table: differences of about x1.5 or less are noise (the tables mark them ≈).
3. Run `node bench/report.mjs` (all suites, 10 runs; the real programs and the Benchmarks Game with `--runs 5` keep a Nona run under a minute) with Deno and Bun installed when possible; `bench/http/run.sh` for the HTTP table. One full pass takes about 40 minutes on the reference VM.
4. Compare the `check` values and output hashes of the runtimes (the report lists mismatches under each table); a mismatch is a correctness bug, not a performance result.
5. Update `PERFORMANCE.md`: a new dated section at the top with the version, commit, machine and runtime versions, the summary table (`bench/results/summary.md`) and the per-suite tables (`bench/results/<suite>.md`); mark the section it replaces _superseded_. Update the figures in `README.md`, `README.ru.md` and the site's translated performance pages.

## Profiling

`node scripts/profile-runtime.mjs <script> [--scale s] [--group]` runs a script compiled for Linux x64 under QEMU's execution trace and prints how many instructions each runtime routine and compiled function executed (Linux x64 host; needs `qemu-user` and `binutils`). The trace takes about 20 bytes per instruction, so keep profiled runs to a few hundred million instructions. [docs/simd.md](../docs/simd.md) describes the method and shows results.

## Known limitations

- `12_fs.mjs` writes to `/tmp` and fails on Windows.
- `01_hello.js` is measured by the startup table (`report.mjs --suite startup`, hyperfine), not by `run.mjs`.
- Peak RSS is only available on Linux, where it is read from `/usr/bin/time` (GNU time).
- Nona executables cannot run under valgrind (the frame prologue probes the pages of a large frame before moving RSP); `profile` uses QEMU for Nona and callgrind for Node.js.
- Deno cannot import lodash's CommonJS `lodash.js` (no default export without a `"type"` in its package.json): the lodash rows have no Deno column.
