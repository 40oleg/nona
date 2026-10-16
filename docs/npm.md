# npm packages

Nona compiles programs that use packages from `node_modules`. Install them with
npm (or pnpm, Yarn, Bun) as for Node.js, then build the program: the compiler
reads `node_modules` at build time and compiles every module the program can
load into the executable. Nothing is read from `node_modules` when the program
runs, and the executable does not need Node.js or npm.

```sh
npm install lodash
nona build app.js -o app
```

```js
// app.js
const _ = require("lodash");
console.log(JSON.stringify(_.chunk([1, 2, 3, 4, 5], 2)));
```

Nona does not run the npm command line itself and does not run package
install scripts (`preinstall`, `postinstall`, native add-on builds).

## Resolution

Specifiers are resolved as Node.js resolves them:

- **Relative and absolute paths** with the CommonJS file probing: `./x` loads
  `./x`, `./x.js`, `./x.json`, `./x.mjs`, `./x.cjs`, then `./x/package.json`
  `"main"` and `./x/index.js`. ES modules get the same probing, so Nona
  accepts imports that Node.js would reject for a missing extension.
- **Bare specifiers** (`pkg`, `pkg/sub/path`, `@scope/pkg`) are looked up in
  every `node_modules` directory from the importing file up to the root.
- **`package.json` `"exports"`**: subpaths, `*` patterns (the most specific
  pattern wins), arrays of fallbacks and nested conditions. A package with
  `"exports"` exposes only what it lists. Without `"exports"`, `"main"` (or
  `index.js`) is the package and every file is reachable by its path.
- **Conditions**: Nona matches `"nona"`, `"node"`, `"import"` for `import` and
  `import()` or `"require"` for `require()`, and `"default"`, in the order the
  package lists them. `--conditions <name>` (or `-C <name>`, repeatable, as in
  Node.js) adds conditions; the compile option is `conditions`. `"browser"`,
  `"deno"`, `"bun"` and similar conditions are not matched.
- **`"imports"`** (`#name` specifiers) of the nearest `package.json`, which may
  map to files of the package or to other packages.
- **Self-reference**: a package that has `"exports"` can import itself by name.
- **Symbolic links and junctions** resolve to their target, so a package
  linked from several places (pnpm's `node_modules/.pnpm` store, `npm link`,
  workspaces) is one module.

A specifier that cannot be resolved is a compile error (`E_MODULE`) that names
the importing file. Specifiers computed at run time cannot be resolved ahead of
time: `require(name)` with a variable `name` throws `MODULE_NOT_FOUND` when it
runs, unless the same string is also required literally elsewhere in that
file, or through [`module.createRequire`](#modulecreaterequire).

## CommonJS and ES modules

A file is CommonJS or an ES module by these rules, in order:

1. `.cjs` is CommonJS and `.mjs` an ES module; `.json` is a JSON module.
2. Inside a package (a `package.json` above the file, up to `node_modules`),
   `"type": "module"` makes `.js` files ES modules and `"type": "commonjs"`
   makes them CommonJS.
3. Otherwise the syntax decides: `import`/`export` declarations or
   `import.meta` make an ES module; free uses of `require`, `module` or
   `exports` make a CommonJS module; anything else is an ES module (the
   program's own files keep working as before).

The program's entry file follows rule 1 and 3 only. A program built with
`--module` is always an ES module.

CommonJS modules work as in Node.js:

- the module wrapper `(exports, require, module, __filename, __dirname)` with
  the real file names, `module.exports`, `module.id`, `module.loaded`,
  `module.children`, `module.parent` and `require.main`;
- code is sloppy unless the file starts with `'use strict'`, and top-level
  declarations stay local to the module;
- `require` runs a module once and caches it by file name in `require.cache`;
  deleting the entry runs the module again, and a module that throws is
  forgotten so that a later `require` retries it;
- cycles see the partially filled `module.exports`, as in Node.js;
- `require.resolve(id)` returns the resolved file name (`node:path` for a
  builtin); `require.resolve.paths` returns `null`;
- `require('./data.json')` returns the parsed file.

Between the two systems:

- `import x from './file.cjs'` gives `module.exports`; named imports
  (`import {a} from 'pkg'`) work for the names a static scan finds, as
  Node.js's `cjs-module-lexer` does: `exports.a = …`, `module.exports.a = …`,
  `Object.defineProperty(exports, 'a', …)`, `module.exports = {a, b: …}`,
  re-exports through `module.exports = require(…)` and TypeScript's
  `__exportStar(require(…))`. `__esModule` is exported too, and, as in
  Node.js 23 and later, `module.exports` itself under the name
  `"module.exports"`.
- `require()` of an ES module returns its namespace object, as `require(esm)`
  does in Node.js 22 and later. An ES module with top-level `await` cannot be
  required (Nona does not support top-level `await`).
- JSON can be imported with `import data from './x.json' with {type: 'json'}`;
  import attributes (`with`, and the older `assert`) are accepted.
- `import.meta.url`, `import.meta.filename` and `import.meta.dirname` work in ES
  modules; `__filename` and `__dirname` in CommonJS modules.

A CommonJS module is compiled once with the rest of the program; its code runs
when it is first required or imported, not before.

## module.createRequire

`createRequire(filename)` from `node:module` (or `module`) returns a `require`
for a file, as in Node.js. Modules are resolved when the program is compiled,
so the function finds only what the program contains: the literal
`require('x')` calls of the file that makes the `require` function (for
example `createRequire(import.meta.url)` or `createRequire(__filename)`, also
through a destructured `{ createRequire }` or `module.createRequire`), the
program's CommonJS files and the modules that other files of the program
require with a literal string. Any other id, including one computed at run
time, throws `MODULE_NOT_FOUND`, as `require(variable)` does. A relative or
non-absolute `filename` throws a `TypeError`.

## Built-in modules

`require('fs')`, `require('node:fs')` and `import fs from 'fs'` load Nona's
own built-in modules. Besides the modules described in [host APIs](host-apis.md),
[file system](fs.md), [process](process.md) and [networking](network.md),
these modules exist mainly for packages (see
[Node.js support modules](host-apis.md#nodejs-support-modules)):

| Module                                | What it provides                                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node:os`                             | `EOL`, `platform`, `arch`, `type`, `homedir`, `tmpdir`, `hostname`, `userInfo`, `endianness`, `constants`; `cpus()` and `networkInterfaces()` are empty                                                                        |
| `node:tty`                            | `isatty`, `ReadStream`, `WriteStream`                                                                                                                                                                                          |
| `node:util`                           | `format`, `inspect`, `inherits`, `promisify`, `callbackify`, `deprecate`, `debuglog`, `isDeepStrictEqual`, `types`, `stripVTControlCharacters`, `styleText`                                                                    |
| `node:url`                            | `URL`, `URLSearchParams`, `fileURLToPath`, `pathToFileURL`, the legacy `parse`, `format` and `resolve`                                                                                                                         |
| `node:assert`                         | `ok`, `equal`, `strictEqual`, `deepStrictEqual`, `throws`, `rejects`, `match` and their negations, `AssertionError`                                                                                                            |
| `node:crypto`                         | `randomBytes`, `randomFillSync`, `randomUUID`, `randomInt`, `getRandomValues`, `createHash` and `createHmac` (MD5, SHA-1, SHA-256, SHA-384, SHA-512), `timingSafeEqual`; the global `crypto` (`getRandomValues`, `randomUUID`) |
| `node:querystring`                    | `parse`, `stringify`, `escape`, `unescape`                                                                                                                                                                                     |
| `node:timers`, `node:timers/promises` | the timer functions; promise `setTimeout`, `setImmediate`, `setInterval`                                                                                                                                                       |
| `node:perf_hooks`                     | `performance`                                                                                                                                                                                                                  |
| `node:module`                         | `builtinModules`, `isBuiltin`; `createRequire` (resolves only what the program contains, see [module.createRequire](#modulecreaterequire))                                                                                     |
| `node:worker_threads`                 | `isMainThread` (always `true`)                                                                                                                                                                                                 |
| `node:child_process`                  | exists so that packages mentioning it load; every function throws `ERR_NONA_UNSUPPORTED`                                                                                                                                       |
| `node:https`                          | `Agent` and `globalAgent` (Linux and Windows); there is no TLS, so `request`, `get` and `createServer` throw `ERR_NONA_UNSUPPORTED`                                                                                            |
| `node:tls`, `node:http2`              | exist so that packages mentioning them load: the constants of Node.js (`http2.constants`); every function and class throws `ERR_NONA_UNSUPPORTED`                                                                              |
| `node:zlib`                           | deflate, inflate, gzip and raw DEFLATE (sync, callback and stream APIs), `crc32`; Brotli functions throw `ERR_NONA_UNSUPPORTED` (see [host-apis](host-apis.md#zlib))                                                           |

A package that loads a module Nona does not provide (`dns`, `dgram`,
`cluster`, …) fails to compile with `E_MODULE: Cannot resolve module`.

## Tested packages

Every package below is compiled with a small program and its output compared
with Node.js (`tests/npm.test.ts` covers the mechanisms; the package list is
checked by hand for now):

acorn, ansi-styles, axios (HTTP requests to `http:` URLs), big.js, bignumber.js, chalk, classnames, commander,
date-fns, dayjs, debug, decimal.js, deepmerge, diff, escape-html,
fast-deep-equal, immer, js-yaml, kleur, lodash, marked, minimist, ms,
mustache, nanoid, picocolors, qs, ramda, semver, strip-ansi, underscore, uuid,
validator, yargs, zod.

yargs (18.2, with `yargs-parser` 22) was checked from its ESM and CommonJS
entries with options and their types, aliases, defaults, `demandOption`,
commands with positional arguments and a handler, `.strict()`, `.parse()` of
fixed argument arrays, `--help`, `--version` and the errors for unknown and
missing options, both through `.fail()` and on the real command line. Two
differences follow from Nona's design:

- `process.version` is Nona's version and `process.versions` has no `node`, so
  `yargs-parser` stops at import with its "minimum Node.js version" check
  unless the environment sets `YARGS_MIN_NODE_VERSION=0`.
- `process.argv` has no script path (see [process](process.md)), so
  `hideBin(process.argv)` drops the first real argument; use
  `process.argv.slice(1)` instead.

## Limitations

- **Code generated at run time.** Packages that compile code with `new
Function` or `eval` from strings built at run time fail when they do so:
  `ajv` (schema compilation), `lodash.template` and `_.template`, `ejs`,
  `handlebars.compile`. See [eval and Function](es2020-contract.md).
- **`Intl`** has only `Intl.Segmenter` (grapheme clusters, which `string-width`
  and `cliui` use for terminal columns). Packages that format dates or numbers
  with the other `Intl` services (`luxon`, `Intl`-based `date-fns-tz`) fail when
  they use them.
- **Version checks.** `process.version` is Nona's version and Nona does not
  report a Node.js version (see [process](process.md)). Packages that refuse
  to run below a Node.js version (`yargs-parser` 22) stop with their own error,
  unless they have a way to turn the check off (see [yargs](#tested-packages)).
- **TLS and Brotli.** `https:` requests and Brotli compression fail with
  `ERR_NONA_UNSUPPORTED`.
- **Native add-ons** (`.node` files, `node-gyp`, N-API) cannot be loaded.
- **Dynamic `require`.** `require(variable)` only finds modules that the same
  file also requires with a literal string; `require.extensions` and
  `Module._load` hooks do nothing. `module.createRequire` resolves only the
  modules the program contains (see [module.createRequire](#modulecreaterequire)).
- **`console.log` of objects** prints `String(value)` rather than Node.js's
  `util.inspect` format; use `util.inspect` or `JSON.stringify`.
- The `"browser"` field and `"browser"` condition are ignored: Nona builds
  for the command line.
