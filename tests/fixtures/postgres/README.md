# Real PostgreSQL package probes (#665)

These MIT-licensed CommonJS fixtures load the installed packages directly.
They do not spawn a JavaScript helper from the native executable. They use
temporary tables and a disposable database only. No VI Toolkit checkout or
dependency manifest is available in this checkout, so the fallback pin is
`pg@8.16.3`, matching `../pg-dns.cjs`; `pg-copy-streams` is exactly `7.0.0`.
The transitive versions and registry integrity hashes are committed in
`package-lock.json`. Never install these dependencies into the compiler's
package.json or use a shared node_modules directory.

## Reproduce on Linux x64

From the Nona root, with Node 26.9.0 and Docker:

```sh
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix tests/fixtures/postgres
npm run build
docker run --rm -d --name nona-postgres-665 \
  -p 127.0.0.1:55432:5432 \
  -e POSTGRES_USER=nona -e POSTGRES_DB=nona \
  -e POSTGRES_PASSWORD=nona-test-only -e POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:17.6 -c ssl=off
until docker exec nona-postgres-665 pg_isready -U nona -d nona; do sleep 1; done
docker exec nona-postgres-665 psql -U nona -d nona -Atc 'SELECT version()'
NONA_POSTGRES_TESTS=1 NONA_POSTGRES_REQUIRE_ELF=1 NONA_PG_PORT=55432 \
  NONA_PG_SERVER_VERSION="$(docker exec nona-postgres-665 psql -U nona -d nona -Atc 'SELECT version()')" \
  node --test --test-concurrency=1 dist/tests/postgres.test.js
docker stop nona-postgres-665
```

Stop the container even after a failed test. Readiness must succeed; do not
count a skipped or unavailable service as integration success. The hosted
`postgres` check job always enables every stage and requires a Linux x64
execution host. It installs the fixture explicitly and uploads evidence even
on failure. Ordinary compiler test runs only exercise package loading if
the optional fixture is installed; database and negative-host probes opt in.

Test authentication is **trust** on a disposable service, with fixed role
and database `nona`. The password `nona-test-only` is a test value and is not
validated in trust mode. Both clients set `ssl: false`; no TLS, password,
SCRAM or certificate compatibility is established by these tests. The service
must never be exposed to an untrusted network.

Run each Node oracle independently, or compile the same entry to ELF:

```sh
NONA_PG_PORT=55432 node tests/fixtures/postgres/load.cjs
NONA_PG_PORT=55432 node tests/fixtures/postgres/connect.cjs localhost
NONA_PG_PORT=55432 node tests/fixtures/postgres/connect.cjs 127.0.0.1
NONA_PG_PORT=55432 node tests/fixtures/postgres/transaction.cjs
NONA_PG_PORT=55432 node tests/fixtures/postgres/copy.cjs
timeout 10s node tests/fixtures/postgres/negative.cjs
node dist/cli.js build tests/fixtures/postgres/copy.cjs --target linux-x64 -o work/pg-copy.elf
NONA_PG_PORT=55432 timeout 20s ./work/pg-copy.elf
```

Use the test runner for authoritative negative-host evidence: it enforces a
10-second **parent-process** deadline independently for Node and native,
requires the observed `ENOTFOUND` marker and zero exit, and rejects timeout
kills. A timer inside the program cannot interrupt synchronous native DNS.

## What is checked

- `load.cjs`: actual `dns`, `require('pg').Client` and
  `pg-copy-streams.from` load together.
- `connect.cjs`: hostname and IPv4 TCP connections and a query.
- `dns-call.cjs`: the actual pinned `ConnectionParameters` method resolves an
  IPv4 literal and delivers its libpq string through the deferred callback.
- `negative.cjs`: an unknown absolute `.invalid` hostname returns a connection
  error. No service is needed for this probe.
- `transaction.cjs`: one Client, Cyrillic `SELECT $1::text`, temporary table
  created before BEGIN, parameterized insert, read inside the transaction,
  ROLLBACK and a read proving zero rows.
- `copy.cjs`: actual COPY FROM STDIN, two-byte Buffer chunks and a one-byte
  highWaterMark. Chunk boundaries cross UTF-8, escaped labels and hex bytea.
  The producer honors false/drain, awaits finish, compares the COPY command
  count, every row, label, byte length and byte, then queries on the same
  Client. Bytea cases cover empty data, NUL, backslashes and high bytes.

`work/postgres-evidence/<target>/*.json` records commands, compiler revision,
source/lock/image hashes, exact stdout/stderr, duration, exit, timeout error
and passed/failed/not-run stages. Native executables are retained beside
them. No network/package install occurs when the test module is imported.

## Recorded local run, 2026-11-28

Compiler: `df09199901394f8d7cc3244ee92fdca8d7a9727a` (preserved unchanged),
with these new fixture/test files. Host: Windows x64, Node 26.9.0. Server:
`PostgreSQL 17.6 on x86_64-windows, compiled by msvc-19.44.35213, 64-bit`,
from `@embedded-postgres/windows-x64@17.6.0-beta.15`, unpacked under ignored
`work/postgres-tools/`. No binary/server dependency is added to this fixture.

The local server was initialized with `initdb -D work/postgres-data -U nona
--auth=trust --encoding=UTF8 --no-locale` and started with `pg_ctl -D
work/postgres-data -l work/postgres-server.log -o '-h 127.0.0.1 -p 55432 -c
ssl=off -c max_connections=10 -c shared_buffers=8MB' -w start`. A Node pg
connection to database `postgres` created database `nona`. After the tests,
`pg_ctl -D work/postgres-data -m fast -w stop` stopped it.

Commands and actual outcomes:

- `npm ci --ignore-scripts` and fixture `npm ci --ignore-scripts`: passed.
- `npm run build`: passed.
- With `NONA_POSTGRES_TESTS=1`, `NONA_PG_PORT=55432`, and the server version
  recorded, `node --test --test-concurrency=1 dist/tests/postgres.test.js
dist/tests/suites.test.js`: **22 passed, 3 failed, none skipped**. Package
  loading, the actual pg DNS callback, hostname/IP connections, Cyrillic
  SELECT, rollback and COPY all passed under Node and native Windows. The
  three failures are the Node/native negative-host subtests and their parent.
- The focused positive database run with
  `--test-name-pattern='hostname|ipv4|transaction|copy'`: all 12 passed.
- `node --test --test-concurrency=1 dist/tests/dns.test.js
dist/tests/net.test.js dist/tests/net-send-source.test.js`: **31 passed,
  1 failed**. The smaller direct DNS negative probe exceeded its deadline.
- Both `load.cjs` and `copy.cjs` cross-compiled with `--target linux-x64` to
  ELF64 successfully; neither ELF was executed on this Windows host.
- `npm run format`, `npm run format:check` and `npm run check:doc-links`
  (after `node site/scripts/sync-docs.mjs`): passed.

Every local test command used `--test-concurrency=1`. Full checks, comparison
suites and long validation remain hosted. The DNS files from the preserved
commit received formatting only; the resolver behavior was not changed.

Node's negative probe reported `timeout expired` from pg before the process
deadline. Native Windows produced no output before the parent killed it.
These are failures, not successful bounded negative connections. The existing
direct DNS regression is the smaller resolver witness; no pg/CommonJS/Buffer/
stream fix was inferred from this shared timeout. The current callback DNS
implementation is retained.

Linux ELF execution is **not run locally** (no WSL or Docker). The acceptance
criteria for ELF connections, transactions and COPY remain **incomplete**
until the required hosted Linux job provides successful evidence. The local
Windows results do not substitute for those checks.
