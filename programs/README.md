# Small program corpus

These ten deterministic applications exercise combinations of JavaScript features.
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

`tests/program-corpus.test.ts` gives each program an individual test name and
specifies its expected stdout. The test first verifies that result with the
Node.js oracle, then compiles and executes the source through `runOnHost` both
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

To expand the corpus, add another numbered `.js` file here and register its
independently determined expected output in `tests/program-corpus.test.ts`.
