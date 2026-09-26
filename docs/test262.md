# Test262 baseline

The runner uses the upstream Test262 revision
`7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd`. It intentionally does not
vendor Test262 into this repository. On Windows x64:

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/tc39/test262.git work/test262
git -C work/test262 sparse-checkout set harness test/language/expressions/coalesce test/language/expressions/arrow-function test/language/expressions/template-literal test/language/rest-parameters test/language/statements/for-in test/language/statements/for-of test/built-ins/Symbol test/built-ins/Array/prototype/includes test/built-ins/Array/prototype/pop test/built-ins/Math/pow test/built-ins/String/prototype/includes test/built-ins/Number/isFinite test/built-ins/Number/isInteger test/built-ins/Number/isNaN test/built-ins/Number/isSafeInteger
git -C work/test262 rev-parse HEAD
npm ci
npm run test262:smoke
node scripts/test262-smoke.mjs language/expressions/coalesce
```

The checkout must be at the pinned revision. If upstream HEAD has advanced,
fetch/check out that exact commit before running. `TEST262_ROOT` selects a
different checkout and `TEST262_REPORT` selects a different JSON report path.
The no-argument command runs the reviewed manifest in
`tests/test262-smoke.json`; a relative directory argument runs every `.js`
file beneath that Test262 group. Reports distinguish compile failures, runtime
failures, and skips.

This is a **baseline adapter**, not the full Test262 harness: modules, async,
raw and runtime-negative tests are currently skipped with reasons. Parse-negative
tests pass when Nona rejects source with a compiler diagnostic; the adapter does
not yet check diagnostic type equivalence. It runs positive
script tests with the standard `sta.js`/`assert.js` harness and declared
`includes`. Before a conformance claim, the adapter must support all applicable
metadata modes and both strict/sloppy variants, then run all applicable groups.
The repository's ordinary native tests still provide the primary regression
gate during this phase. Run tests and the oracle with Node 26 as required by
`package.json`; Node 22 differs in observable function metadata and may fail
when a test seals its global object.

The 2026-09-26 positive runtime smoke manifest has 22 pass, 0 fail, 0 skip.
Broader raw groups on the pinned revision have 72 pass / 26 fail for
`built-ins/Symbol`, 85 pass / 34 fail for `language/statements/for-in`, and
142 pass / 607 fail / 2 skip for `language/statements/for-of`. These groups
include cases outside the implemented subset and cases added after ES2020;
the raw counts are diagnostic, not ES2020 conformance percentages.
`built-ins/Array/prototype/includes` has 26 pass / 4 fail / 0 skip;
the failing cases use Proxy or resizable ArrayBuffers.
`built-ins/Math/pow` has 28 pass / 0 fail / 0 skip after adding the
ES2020 Math constants.
`built-ins/String/prototype/includes` has 25 pass / 2 fail / 0 skip;
the failing cases contain RegExp literals, which are not yet supported.
`built-ins/Array/prototype/pop` has 23 pass / 0 fail / 0 skip after adding
the ES2020 Number constants.
The four `Number.isFinite/isInteger/isNaN/isSafeInteger` groups have
8/9/7/10 pass respectively, with no failures or skips.
`language/rest-parameters` has 8 pass / 3 fail / 0 skip; the three failures
need destructuring patterns or classes.

On 2026-09-25 the `language/expressions/coalesce` group produced 21 pass,
3 fail, 0 skip. One failure requires the missing `Symbol` type; two exercise
proper tail calls in strict code and overflow the native stack. Four
parse-negative cases passed via compiler rejection. These are tracked
missing capabilities, not evidence that `??` itself is generally broken.
