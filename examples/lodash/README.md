# lodash compiled by Nona

lodash 4.17.21 (`lodash.js`, 17 000 lines) compiles with Nona. Its own test suite (`test/test.js`, run by QUnit 2) runs as a native executable and passes everything except `_.template`, which compiles JavaScript at run time.

## Use lodash in a program

`lodash.js` is a UMD script. Compiled as a classic script, it installs `_` on the global object:

```sh
cat lodash.js my-program.js > app.js
node ../../dist/cli.js build app.js -o app
```

`lodash.js` alone compiles in 7 s with 640 MB of memory into a 9 MB Linux x64 executable.

## Run lodash's test suite

```sh
git clone --branch 4.17.21 https://github.com/lodash/lodash
cd lodash && mkdir -p node_modules
# node_modules/lodash: the npm package lodash@4.17.21 (the "stable" copy the suite compares with)
# node_modules/qunitjs: qunitjs@2.4.1; node_modules/qunit-extras: qunit-extras@3.0.0
node …/nona/examples/lodash/build-tests.mjs . lodash-tests.js
node …/nona/dist/cli.js build lodash-tests.js -o lodash-tests
./lodash-tests
```

Nona has no CommonJS `require`. `build-tests.mjs` therefore wraps QUnit, qunit-extras, both lodash copies and `test/test.js` as modules behind a small loader, in one 2 MB script. It does not provide the Node.js modules `fs`, `path` and `vm`; the suite uses them only inside `attempt` or `try`.

Run on Node.js, the same bundle fails 10 assertions:

- the `vm` realm values (`realm.map`, `realm.set`) are missing;
- the suite cannot reload lodash with an overwritten `Symbol`;
- `isBuffer` without `Buffer` fails.

Results by assertion (2026-10-08). By test, 50 fail natively and 8 on Node.js; the 42 extra are the `_.template` ones.

| | Linux x64 | Windows x64 |
| --- | --- | --- |
| Nona-native | 6 651 passed, 62 failed of 6 713, 46 s | 6 651 passed, 62 failed of 6 713, 57 s |
| The bundle on Node.js 22 | 6 780 passed, 10 failed of 6 790, 10 s | 6 780 passed, 10 failed of 6 790, 11 s |

Compiling the bundle takes 17 s and 0.9 GB of memory. The executable is 27 MB.

### The failures

- **`_.template`: 41 tests, plus "lodash methods should accept falsey arguments".** `_.template` builds a function's source from the template and calls `Function(...)`. Nona compiles ahead of time and has no run-time compiler, so these throw EvalError. They stop at their first assertion, so the native total is 77 assertions lower.
- **The other 8 failing tests also fail on Node.js with this bundle.** They are listed above: the `vm` realm values, the overwritten `Symbol` and `isBuffer` without `Buffer`.

Every other module passes the same assertions as on Node.js.

## What had to change in Nona

1. **`Function('return this')()` at lodash's top level threw EvalError.** Nona compiles `Function` calls with literal source ahead of time. It skipped the whole program, though, as soon as any function declared its own `Function`, and lodash's `runInContext` does (`var Function = context.Function`). Now only the calls inside a function that binds `Function` are left as written (`src/frontend/dynamic-functions.ts`).
2. **A global `replace` was quadratic in the number of matches.** `RegExp.prototype[Symbol.replace]` and `String.prototype.replaceAll` appended every piece to one string, which copied it each time. qunit-extras runs `toString(value).replace(/\s+/g, '')` on every assertion's expected value, and the suite did not finish in 10 minutes. The result is now joined from its pieces once:
   - 20 000 matches of `/\s+/g`: 2.5 s before, 0.4 s after;
   - 20 000 matches of `/ /g`: 3.6 s before, 0.2 s after.

`s += x` in a loop is still quadratic in general: 40 000 appends take 1.3 s. That needs string ropes or builders in the runtime, which is a separate change.
