# Benchmarks

Micro-benchmarks (`05_*` ... `15_*`), the real-world corpus (`real/`) and the HTTP server cases (`http/`) behind [`PERFORMANCE.md`](../PERFORMANCE.md).

## Running

```
npm run build
node bench/run.mjs [--scale 0.1] [--runs 3] [--timeout 600] [--only 05,06] [--runtimes node,nona] [--real]
```

- Every script reads `SCALE` from the environment: the problem size is `SCALE` times the size named in the script (1M elements, 10M calls, ...). `--scale 0.1` gives the N = 100 000 used in the tables for arrays, objects, Map/Set, calls and classes.
- `run.mjs` builds each script with `dist/cli.js`, runs it `--runs` times per runtime and prints one JSON line per run (wall time, the script's own per-phase timings in `metrics`, peak RSS on Linux). Every script prints a `check` value; it must be identical on every runtime.
- `--runtimes` defaults to `node,deno,bun,nona`; runtimes that are not installed are skipped.
- `--real` runs `real/` instead (run `node bench/real/fetch.mjs` first). HTTP cases are described in `http/`.

## Protocol for a release update

1. Build the release commit (`npm ci && npm run build`) and note the commit hash, the OS, the CPU and the Node.js version.
2. Close other programs. If the machine is shared, say so next to the table: differences of about x1.5 or less are noise.
3. Run `node bench/run.mjs --scale 0.1 --runs 3 --runtimes node,nona` and take the median of the runs per metric. Add Deno and Bun when they are installed (`--runtimes node,deno,bun,nona`).
4. Compare the `check` values of the runtimes; a mismatch is a correctness bug, not a performance result.
5. Update `PERFORMANCE.md`: put the date, the commit and the version next to every table you re-measured, and mark the tables you did not re-measure with the version they were measured with.

## Known limitations

- `12_fs.mjs` writes to `/tmp` and fails on Windows.
- `01_hello.js` is measured by the startup and size sections of `PERFORMANCE.md` with `hyperfine`, not by `run.mjs`.
- Peak RSS is only available on Linux, where it is read from `/usr/bin/time`.
