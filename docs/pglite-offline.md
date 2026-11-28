# Offline PGlite profiles and binary COPY

The [pinned PGlite 0.3.14 fixture](../tests/fixtures/pglite/README.md) provides an
offline adapter and a standalone native workload for
[#667](https://github.com/40oleg/nona/issues/667). It uses the published package
unchanged. The workload runs `SELECT 1 AS value`, stores Unicode text and binary
`bytea` in a disk profile, round-trips PostgreSQL binary COPY through `/dev/blob`,
awaits `close()` and rechecks the data in a second process. Omitting the profile
selects the original in-memory SELECT/close workload. Native acceptance runs on
hosted CI; passing Node or descriptor tests alone does not establish native
PostgreSQL acceptance.

## Build and invocation

From the repository root, prepare the pinned package and assets once:

```sh
npm ci
npm run build
npm --prefix tests/fixtures/pglite ci --ignore-scripts --no-audit --no-fund
npm --prefix tests/fixtures/pglite run prepare:assets
mkdir -p tests/fixtures/pglite/.work
node dist/cli.js build tests/fixtures/pglite/boot.mjs --target linux-x64 -o tests/fixtures/pglite/.work/pglite-boot
```

On Linux x64, run with an explicit absolute asset directory, including from a
different working directory:

```sh
repo="$PWD"
cd tests/fixtures/pglite/.work
./pglite-boot "$repo/tests/fixtures/pglite/assets"
```

Use the **same executable** for the writer and reader, with a new profile
directory owned by this run:

```sh
mkdir profile
./pglite-boot "$repo/tests/fixtures/pglite/assets" write "$PWD/profile"
./pglite-boot "$repo/tests/fixtures/pglite/assets" reopen "$PWD/profile"
```

Each profile command prints its mode followed by
`select=1 bytes=259 copy=true closed=true fetch=undefined` and exits with status 0.
The adapter passes `dataDir: PROFILE/pgdata` to the pinned `PGlite.create()` API,
which selects its disk NodeFS backend. `PROFILE/copy.bin` stores the complete
binary COPY stream. The writer inserts the fixture row, exports it with
`COPY fixture TO '/dev/blob' WITH (FORMAT binary)`, imports into a second table
using the query's `{ blob: new Blob([copyBytes]) }` option and re-exports it.
The fresh reader verifies both tables and compares the entire exported stream
with `copy.bin`. Both processes check Unicode text and all 259 payload bytes:
all values 0–255, leading/trailing zeroes and a repeated 255. The fixture data is
original and requires no image download. Awaited close is checked even after an
SQL assertion fails.

Profiles are single-owner, sequentially opened directories. Concurrent writers,
crash recovery and power-loss durability are outside this workload. NODEFS in
this release performs direct host writes without an fsync stream hook; the new
[`fsyncSync`/`fdatasyncSync` APIs](fs.md#file-descriptors) do not change upstream's
durability policy. Never use the same profile for Node and Nona validation.

Expected output is `select=1 closed=true fetch=undefined` with exit status 0.
The executable includes the package's JavaScript and Nona's scalar WASM engine.
Deployment needs only that ELF, `pglite.wasm` and `pglite.data`; retain the
[redistribution notices](../tests/fixtures/pglite/NOTICE.md) alongside them.
No package directory, manifest, JavaScript engine, PostgreSQL installation,
network service or fetch implementation is needed at execution time.
There is no default resource directory and no resolution relative to the ELF,
package installation or the compiler's original working directory. A relative
argument is resolved against the caller's working directory.

## Resource and platform contract

[`offline.mjs`](../tests/fixtures/pglite/offline.mjs) establishes this contract
for the workload and subsequent profile adapter:

- `createOfflinePGlite(assetDirectory, profileDirectory?)` reads exactly `pglite.wasm` and
  `pglite.data` in the selected directory. Both must match the byte sizes and
  SHA256 pins in [resources.json](../tests/fixtures/pglite/resources.json).
  The pins are embedded in the executable; preparation checks the package too.
  An optional nonempty profile directory is resolved against the caller's cwd;
  its `pgdata` child is the database root. Omit it for in-memory storage.
  Missing, truncated or modified resources reject before upstream initialization.
  The error includes the absolute resource path, the underlying read error or
  integrity mismatch, and repair instructions; `.cause` retains the original error.
- Each read preserves `buffer`, `byteOffset` and `byteLength` through an exact
  Uint8Array view. The main module is precompiled with `WebAssembly.compile`;
  a compilation rejection names the WASM path and retains its cause. The adapter
  supplies `wasmModule` and a Blob `fsBundle` to `PGlite.create()`. It never uses
  streaming compilation, fetch or an upstream default resource URL.
- The [audited upstream checks](../tests/fixtures/pglite/AUDIT.md) select Node
  using `typeof process.versions.node === "string"`. Nona normally exposes only
  its own version. `withPGlitePlatform` temporarily supplies a marker string
  through package import and database readiness. This is a fixture-specific
  environment selector, not a Node version or general compatibility claim.
- Emscripten initializes NODEFS even for an in-memory database and requests
  `process.binding("constants").fs`. The same scope supplies public `node:fs`
  constants and rejects every other internal binding. It restores original
  property descriptors on success and failure; overlapping platform scopes
  reject explicitly. Import and create through this adapter, and do not start
  unrelated platform-sensitive work during its asynchronous scope. Upstream
  caches environment flags, so later direct package imports share that choice.
- `boot.mjs` sets fetch to undefined, checks SQL results, awaits clean close and
  checks restoration of the process properties. Resource errors exit with status 1.

The compiler's CommonJS planner also recognizes `createRequire` aliases
destructured from namespace/default imports of `module` or `node:module`, and
from literal `import("module")` or `import("node:module")`, including an awaited
import inside a function. It embeds their literal require targets
in the module's require table, just as for statically imported factories.
This supplies Emscripten's `require("fs")` and `require("path")` without runtime
package resolution. Alias tracking respects lexical bindings and closures;
unrelated callbacks with the same name do not import additional modules.
Computed require targets retain the existing compiler limits.

## Verification

The mandatory `linux-native` job in [check.yml](../.github/workflows/check.yml)
prepares the pinned fixture, then runs the `pglite` suite with
`NONA_PGLITE_INTEGRATION=1` and `NONA_TEST_CONCURRENCY=1`. The test compiles the
actual package for the host target from a temporary source tree, deletes that
tree, then runs with only the executable and two assets in a fresh working
directory and with fetch absent. It checks SQL,
close, zero exit status and empty stderr. Separate children check missing,
truncated and same-size corrupt WASM, plus missing and same-size corrupt data.
The native child's PATH is empty, so an external JavaScript engine cannot be
found through PATH. A single compilation embeds all modes; independent writer
and reader processes share only the native profile. Fast, separate Node oracles
use their own profile and run the same adapter and boot
entry with network permission denied, fetch absent and a 256-MiB V8 heap cap.
They cover both normal Node metadata and absent `process.versions.node` and
`process.binding`, exercising the scoped adapter against the real pinned glue.
These checks do not substitute for the native ELF acceptance case.
Every child is bounded, output is capped at 64 KiB, and temporary files are removed.
Scalar interpretation makes PostgreSQL's first initialization slower than the
small WASM probes; each hosted writer/reader has a thirty-minute timeout, with
seventy-five minutes for the suite step. Bad resources have a separate fifteen-second assertion.
The long native profile/COPY case runs only with
`RUNNER_ENVIRONMENT=github-hosted`, supplied explicitly by that workflow step.
The preceding runner check rejects a non-hosted runner. This keeps long
validation off the owner's shared PC without making Linux CI boot optional.

After preparation, run the focused compilation and bad-resource coverage locally:

```sh
NONA_PGLITE_INTEGRATION=1 NONA_TEST_CONCURRENCY=1 node scripts/run-suite.mjs pglite
```

On a local machine this reports the long profile/COPY case as skipped. Do not
set the hosted runner marker locally to bypass that policy. The hosted job runs
the same suite with the marker and must pass both native processes as well.

Without the integration environment variable, ordinary test runs still check
buffer ranges, pin consistency, explicit directory diagnostics and platform
scope restoration without installing the optional package. They skip native
PostgreSQL boot. A skipped boot is not native acceptance evidence.
