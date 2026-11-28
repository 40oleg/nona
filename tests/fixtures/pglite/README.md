# PGlite 0.3.14 offline oracle

This is step 1 of [#667](https://github.com/40oleg/nona/issues/667): a reproducible
Node oracle and a frozen package audit for the subsequent Nona implementation.
It does not establish that Nona can execute WebAssembly or boot PGlite yet.
The published package is used unchanged, with an **exact**
`@electric-sql/pglite@0.3.14` dependency and npm lockfile. No service, PostgreSQL
installation, VI Toolkit checkout, browser, downloaded image or network fetch
API is needed during execution.

## Explicit preparation

From the repository root, using Node 26.9.0 (the CI version):

```sh
npm --prefix tests/fixtures/pglite ci --ignore-scripts --no-audit --no-fund --cache .npm-cache
npm --prefix tests/fixtures/pglite run prepare:assets
npm --prefix tests/fixtures/pglite test
npm --prefix tests/fixtures/pglite run audit:check
```

For a cache wholly inside the fixture directory, run the equivalent commands
from that directory: `npm ci --ignore-scripts --no-audit --no-fund --cache .npm-cache`,
`npm run prepare:assets`, `npm test`, `npm run audit:check`. npm resolves `--cache`
relative to the calling directory; use an absolute path for cache handoff.
The install is the only network preparation step. Use `npm ci --offline` with a
previously filled cache to prepare on an isolated machine. Transfer the matching
lockfile, installed dependency tree and prepared assets to a network-isolated
runner if npm's cache is unavailable there. Keep the notices with those files.

`prepare.mjs` verifies all package resources listed in
[resources.json](resources.json) against their fixed SHA256 and byte size before
copying `pglite.wasm` and `pglite.data` into ignored `assets/`. This includes the
JavaScript entry point, its five shared chunks and NodeFS module, metadata,
license, standalone glue and the source maps used in the audit. npm independently
verifies tarball SHA512 from [package-lock.json](package-lock.json). Preparation
never imports package code or compiles WASM. Every oracle child rechecks package
files and **both** prepared assets before compilation and package import. A
missing or modified resource produces its local path and repair instructions.
The manifests are reviewed pins, not hashes regenerated from whatever is installed.

Installation and these tests are opt-in, independent of the root `npm ci`,
`npm run build`, `npm test` and ordinary compiler dependencies. The focused
[CI workflow](../../../.github/workflows/pglite-oracle.yml) prepares the fixture
explicitly on hosted Linux x64 and Windows x64, then runs these commands.
Changing a package pin requires reviewing provenance, notices, resource hashes,
the audit and oracle results together; do not substitute a newer release's API.

## Cases and execution bounds

`oracle.test.mjs` runs one child at a time:

1. `case.mjs select` supplies a compiled local `wasmModule` and local `fsBundle`
   Blob to `PGlite.create()`, checks `SELECT 1 AS value`, awaits `close()` and
   checks `closed === true`.
2. `case.mjs write PROFILE` creates a table containing Unicode text and a
   generated 259-byte `bytea`: every byte value 0–255, leading/trailing zeroes
   and a repeated 255. It writes the binary COPY result to `PROFILE/copy.bin`,
   checks PostgreSQL's binary COPY signature and closes.
3. After that child exits, `case.mjs reopen PROFILE` opens the same disk profile
   in a **new process**, checks the text and every byte, uses the saved Blob with
   `COPY ... FROM '/dev/blob' WITH (FORMAT binary)` into another table, checks
   that table and compares the entire re-exported binary COPY stream.
4. Separate negative cases remove and corrupt each prepared asset and check the
   resource-specific error. These validate the fixture preflight, not a future
   Nona diagnostic implementation.

Each child runs with `--permission` and no `--allow-net`, worker, child-process
or addon permissions. It verifies an attempted connection is denied and sets
`globalThis.fetch = undefined` before importing PGlite. Read permission covers
the checkout; write permission covers only the fixture's ignored `.work/`.
Emscripten's sole `process.binding("constants").fs` access is adapted to the
identical public `node:fs` constants because Node disables internal bindings
under its permission model. This fixture-only adapter grants no other bindings
and does not patch upstream files. This Node-specific policy is isolated in the
driver's `--import ./offline-node.mjs` preload, separate from `case.mjs`.

The runner clears inherited `NODE_OPTIONS`, caps each V8 heap at 256 MiB and WASM
compilation tasks at 1, limits child output to 64 KiB and kills a child after
30 seconds. These children cannot spawn descendants. Profiles are created under
`.work/` and removed in `finally` with bounded retries; dependencies and assets
remain reusable. Tests fail on nonzero exit, signal, timeout, unexpected stderr
or output mismatch. Hosted jobs have a five-minute total timeout and matrix
parallelism 1. Audit tools also run sequentially, with 256 MiB heaps, 30-second
per-command timeouts and 2 MiB captured output limits; temporary disassembly
inputs and the immediate-value histogram are removed. No benchmark or full
compiler suite is part of this fixture.

## Provenance and audit

[provenance.json](provenance.json) records the registry tarball, integrity,
observation date and historical source reference. The registry supplies no
`gitHead`; the issue's source commit is not presented as a verified npm build
commit. The inspected evidence is the **published** `dist/index.js`, its embedded
source maps, `dist/pglite.js`, `dist/pglite.wasm` and `dist/pglite.data`.
[NOTICE.md](NOTICE.md) preserves redistribution notices.

The [package audit](AUDIT.md) describes resource, callback, memory, table and
filesystem requirements. [audit.json](audit.json) contains WABT 1.0.39 section
headers, complete typed import declarations, type signatures and opcode counts
for the main module and the 28 WASM side modules embedded in `pglite.data`.
`npm run audit:check` reproduces it without downloading anything. To intentionally
refresh the snapshot after review, use `node --wasm-num-compilation-tasks=1 audit.mjs`.
Static presence is not evidence that every import or opcode ran in these cases;
passing Node oracles are not native Nona acceptance evidence.
