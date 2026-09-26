# Test262 baseline

The runner uses the upstream Test262 revision
`7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd`. It intentionally does not
vendor Test262 into this repository. On Windows x64:

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/tc39/test262.git work/test262
git -C work/test262 sparse-checkout set harness test/language/expressions/coalesce test/language/expressions/arrow-function test/language/expressions/array test/language/expressions/call test/language/expressions/new test/language/expressions/template-literal test/language/rest-parameters test/language/statements/function test/language/statements/for-in test/language/statements/for-of test/built-ins/Symbol test/built-ins/Array/prototype/includes test/built-ins/Array/prototype/pop test/built-ins/Math/pow test/built-ins/Math/min test/built-ins/Math/max test/built-ins/Math/abs test/built-ins/Math/sign test/built-ins/Math/sqrt test/built-ins/Math/trunc test/built-ins/Math/floor test/built-ins/Math/ceil test/built-ins/Math/round test/built-ins/String/prototype/includes test/built-ins/Number/isFinite test/built-ins/Number/isInteger test/built-ins/Number/isNaN test/built-ins/Number/isSafeInteger
git -C work/test262 rev-parse HEAD
git -C work/test262 sparse-checkout add test/built-ins/Math/imul test/built-ins/Math/clz32
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

The 2026-09-26 positive runtime smoke manifest includes default parameter
and spread cases; its current counts are recorded in the development log.
Broader raw groups on the pinned revision have 72 pass / 26 fail for
`built-ins/Symbol`, 85 pass / 34 fail for `language/statements/for-in`, and
142 pass / 607 fail / 2 skip for `language/statements/for-of`. These groups
include cases outside the implemented subset and cases added after ES2020;
the raw counts are diagnostic, not ES2020 conformance percentages.
`built-ins/Array/prototype/includes` has 26 pass / 4 fail / 0 skip;
the failing cases use Proxy or resizable ArrayBuffers.
`built-ins/Math/pow` has 28 pass / 0 fail / 0 skip after adding the
ES2020 Math constants.
`built-ins/Math/min` and `built-ins/Math/max` each have 10 pass / 0 fail /
0 skip, including conversion of every argument and signed zero ordering.
`built-ins/String/prototype/includes` has 25 pass / 2 fail / 0 skip;
the failing cases contain RegExp literals, which are not yet supported.
`built-ins/String/prototype/padStart` and `padEnd` each have 13 pass /
0 fail / 0 skip, including conversion order and descriptor checks.
`built-ins/String/prototype/indexOf` has 44 pass / 3 fail / 0 skip; the
remaining cases depend on `eval` or BigInt.
`built-ins/String/prototype/lastIndexOf` has 25 pass / 0 fail / 0 skip.
`built-ins/String/fromCharCode` has 16 pass / 1 fail / 0 skip;
the remaining case requires BigInt.
`built-ins/Array/prototype/indexOf` has 193 pass / 8 fail / 0 skip, and
`lastIndexOf` has 189 pass / 9 fail / 0 skip after adding global `isNaN`.
The remaining cases use Date, RegExp, JSON, Proxy, resizable buffers/typed
arrays, or `eval`.
Global `isFinite` has 15 pass / 0 fail / 0 skip. Global `isNaN` has 14 pass /
1 fail / 0 skip; the remaining case uses `Array.prototype.forEach` in its
test harness body.
`built-ins/Array/prototype/pop` has 23 pass / 0 fail / 0 skip after adding
the ES2020 Number constants.
The four `Number.isFinite/isInteger/isNaN/isSafeInteger` groups have
8/9/7/10 pass respectively, with no failures or skips.
`language/rest-parameters` has 11 pass / 0 fail / 0 skip after destructuring
parameters and class methods.
After default parameter support, `language/expressions/arrow-function` has
147 pass / 196 fail / 0 skip; all 9 `dflt-params` cases in that group pass.
With array and object literal spread, `language/expressions/array` has
50 pass / 2 fail / 0 skip. The two remaining cases require generators.
With call and construction spread, `language/expressions/call` has 72 pass /
20 fail / 0 skip and `language/expressions/new` has 54 pass / 5 fail /
0 skip. Among the `spread-*` cases, only two in each group fail to compile
because they require generators. Other group failures involve unrelated
unsupported features, including `eval`.
The `Math.abs/sign/sqrt/trunc/floor/ceil/round` groups pass 8/5/10/12/11/11/11
tests respectively, with no failures or skips.
The `Math.imul` and `Math.clz32` groups pass 5/5 and 10/10 respectively.
After array and object binding patterns, the three declaration groups
`language/statements/variable/dstr`, `let/dstr`, and `const/dstr` pass
79/97, 77/93, and 77/93 cases respectively. Every remaining case fails to
compile because it uses generators or classes. These are selected Test262
groups, not an ES2020 conformance percentage.
`language/destructuring/binding/syntax` has 12 pass / 2 fail; both remaining
cases require generator and async syntax. `language/expressions/assignment/dstr`
has 323 pass / 45 compile failures / 0 runtime failures; those compile
failures require generators or classes.
The selected class groups `language/statements/class/method` and
`method-static` each pass 20/20. `language/statements/class/definition` has
46 pass / 17 compile failures / 2 skips; the remaining cases require syntax
outside the current class subset, including generators and async methods.

On 2026-09-25 the `language/expressions/coalesce` group produced 21 pass,
3 fail, 0 skip. One failure requires the missing `Symbol` type; two exercise
proper tail calls in strict code and overflow the native stack. Four
parse-negative cases passed via compiler rejection. These are tracked
missing capabilities, not evidence that `??` itself is generally broken.

On 2026-09-26 the complete pinned `built-ins/parseInt` and
`built-ins/parseFloat` groups passed 55/55 and 54/54. The initial full
`built-ins/Array` run had 2632 pass, 360 fail, 90 skip out of 3082;
all 90 skips are `Array.fromAsync` tests (an API after ES2020);
it exposed an iterator completion bug and five sparse-array timeouts,
which have since been fixed. The repeat full Array run has 2640 pass,
352 fail, 90 skip. Each remaining failure has a recorded prerequisite in
[the v0.4 deferral list](v0.4-array-deferred.json): 150 post-ES2020 API
cases, 72 resizable-buffer cases, and 130 other future dependencies or
the documented `eval` exception. The positive manifest passes 100/100.

After v0.4.0, the complete `built-ins/String/fromCodePoint` group passes
11/11. One case is retained in the pinned smoke manifest; the manifest
passes 101/101.
