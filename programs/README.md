# Small program corpus

These 1,000 individually authored deterministic applications exercise combinations of JavaScript features.
They are independent of Test262 and need no network, external files, timers or
third-party packages. Keep the programs here and the test runner in `tests/`.

| Program | Combined behavior |
| --- | --- |
| `001-insertion-sort.js` | Copying arrays, nested loops, short-circuit conditions, duplicate/negative values and indexed mutation |
| `002-binary-search.js` | Function calls, loop bounds, arithmetic, short-circuiting and empty/missing/duplicate cases |
| `003-prime-sieve.js` | Sparse arrays, nested loops, continue, truthiness and accumulation |
| `004-closure-accounts.js` | Classes, private fields, escaped arrows capturing this, independent instances and loop closures |
| `005-expression-parser.js` | Nested functions, captured mutable state, mutual recursion, precedence, string indexing and numeric conversion |
| `006-tree-traversal.js` | Object trees, destructuring, recursive generators, yield delegation and for-of |
| `007-shortest-path.js` | Cyclic graph traversal, a growing queue, Map/Set, for-of, path reconstruction and nullish fallback |
| `008-matrix-multiply.js` | Nested arrays, typed-array rows, three nested loops, indexed reads/writes and checksums |
| `009-run-length-encoding.js` | String scanning, record arrays, JSON round trips, destructuring, string concatenation and empty inputs |
| `010-exception-cleanup.js` | Async/await, promises, exceptions, returns through catch/finally and observable cleanup order |

## Run the corpus

With Node.js 26 or newer and dependencies installed at the repository root:

```sh
npm run check:programs
```

The original ten keep independently specified expected stdout in
`tests/program-corpus.test.ts`. The other 990 are divided among ten test shards.
`manifest.json` records each purpose, interacting features, source SHA-256 and
Node.js reference output. Every run verifies the current Node.js result against
that snapshot, then compiles and executes the source through `runOnHost` both
normally and with GC stress. A launch error, timeout, nonzero exit, unexpected
stderr or mismatched stdout fails the test. Windows CRLF output is normalized
to LF; no other output differences are ignored. Existing helpers limit the
Node.js run to 5 seconds and each native run to 60 seconds.

The corpus is also included in `npm run check`.

The dedicated `program corpus` GitHub Actions workflow runs `npm run check:programs`
on both Linux and Windows for every branch push and pull request. Each platform
runs all programs in normal and GC-stress execution; a failed comparison fails
its job. Push and pull-request runs have separate concurrency groups so they
cannot cancel each other.

To run one case after building:

```sh
node --test --test-name-pattern=005-expression-parser dist/tests/program-corpus.test.js
```

## Run a program directly

For example, on Linux x64, from the repository root after `npm run build`:

```sh
node programs/005-expression-parser.js
node dist/cli.js build programs/005-expression-parser.js -o build/expression-parser --target linux-x64
./build/expression-parser
```

Both print `11`, `4` and `-18` on separate lines. Other programs can be run the
same way with the appropriate host target and executable extension. These
programs intentionally avoid depending on script-versus-module global semantics
so direct Node.js execution and the script-mode oracle have the same behavior.

## Authored scenarios

The original ten above are preserved. The other programs are organized into
six directories, each containing 165 independent sources and a `cases.json`
catalog with the purpose and feature combination of each case:

| Directory | IDs | Focus |
| --- | --- | --- |
| `algorithms/` | 11–175 | Graphs, dynamic programming, numerical methods, geometry, search and simulations |
| `collections/` | 176–340 | Record processing, indexes, joins, reconciliation, histories and collection protocols |
| `text/` | 341–505 | Parsers, codecs, tokenizers, formatting and text transformations |
| `async/` | 506–670 | Promise workflows, async iteration, scheduling, recovery and cleanup |
| `objects/` | 671–835 | Classes, accessors, descriptors, proxies and object protocols |
| `language/` | 836–1000 | Composed applications involving scope, destructuring, generators and exceptions |

The sources are checked in directly. There is no source generator, seed
expansion or template multiplication. Review both the source and its purpose;
counting files or detecting byte duplicates alone does not establish diversity.
The inventory tests enforce contiguous IDs, exact file registration, source
hashes, category catalogs matching the manifest, and distinct bodies after removing whole-line comments and empty lines.

The reference-data tool only executes existing sources and updates the manifest:

```sh
npm run snapshot:programs
```

Review snapshot changes rather than accepting an unexpected result automatically.
A snapshot is a differential oracle, not an independent specification of the
application's correctness. Programs also include domain invariants where useful.
A compiler mismatch must fail the test; do not change the Node.js reference to
match Nona.

After building, run one shard or select an individual program:

```sh
node --test dist/tests/program-corpus-00.test.js
node --test --test-name-pattern=0011- dist/tests/program-corpus-00.test.js
```

All 1,000 sources are executed in each dedicated Linux/Windows pipeline run,
with 2,000 native executions per platform. The original test and ten shards
run with at most four concurrent test processes in `check:programs`.
