# Paths (`node:path`, `path`)

The built-in path module implements the Node.js 26 API as JavaScript compiled
into the executable. It has no filesystem side effects or external runtime
dependencies. All eight native targets support it.

```js
import path, {posix, win32, matchesGlob} from 'node:path';
console.log(posix.normalize('/a/../b/')); // /b/
console.log(win32.basename('C:\\temp\\file.txt')); // file.txt
console.log(path.join('data', 'report.txt')); // native separators
console.log(matchesGlob('src/main.js', '**/*.js')); // true
```

## Imports and flavors

`path` resolves to the same module as `node:path`, preserving both namespace
and default object identity. Bare and `node:` flavor aliases likewise share
the same namespace, including literal dynamic imports.
`posix` and `win32` are available on both operating systems. Their `posix` and
`win32` properties refer to the same flavor objects. Explicit flavor modules
(`path/posix`, `node:path/posix`, `path/win32`, `node:path/win32`) support default
and named imports. Literal dynamic `import()` works through Nona's module loader.
CommonJS `require` is not supported by that loader.

## API

| Function/property | Behavior |
| --- | --- |
| `normalize(path)` | Resolve `.` and `..`, repeated separators and Windows roots; retain trailing separators. |
| `join(...paths)` | Join nonempty segments and normalize the result. |
| `resolve(...paths)` | Resolve from right to left using the executable's current directory when needed. |
| `relative(from, to)` | Return a relative path, or the resolved target on different Windows devices. |
| `isAbsolute(path)` | Recognize absolute paths without normalizing them. |
| `dirname(path)`, `basename(path, suffix?)`, `extname(path)` | Extract components, ignoring trailing separators. Suffix stripping is case sensitive. |
| `parse(path)` | Return `{root, dir, base, ext, name}`. |
| `format(object)` | Respect `dir` over `root`, `base` over `name`/`ext`; add a missing extension dot. |
| `toNamespacedPath(path)` | Convert Windows drive/UNC absolute paths to namespace paths; POSIX passes input through. |
| `matchesGlob(path, pattern)` | Match strings using Node.js 26 glob rules, without accessing the filesystem. |
| `sep`, `delimiter` | POSIX `/`, `:`; Windows `\\`, `;`. |

Windows algorithms handle UNC shares, drive-relative paths, namespace/device
roots, case insensitive device comparison and reserved device names.
Drive-relative resolution consults `process.env['=C:']` (for example) and
`process.cwd()` using Node's fallback rules. POSIX resolution on Windows
converts the current directory to forward slashes and removes its drive prefix.
Neither flavor resolves symlinks or checks whether paths exist.

## Glob rules

`matchesGlob` uses an original token parser and matcher. `*`, `?`, `**`,
character classes, brace expansion/ranges and extglobs
are supported. Dot-prefixed components require an explicit dot. Leading `!`
and `#` are literal rather than negation or comments. Backslashes in patterns
are separators rather than escapes. Windows matching uses Node's case rules;
the explicit POSIX flavor still uses the host's case sensitivity rules, as in
Node.js. Patterns and paths must be strings.

## Compatibility and implementation

String inputs, path object validation, `TypeError` and
`code === 'ERR_INVALID_ARG_TYPE'` follow Node. Diagnostic messages for invalid
arguments use concise descriptions; Node's full `util.inspect` formatting is
not reproduced. The legacy `_makeLong` alias is retained.

Importing the full module includes both path flavors and the glob matcher.
An x64 normalize example produces a 6.90 MB PE or 6.87 MB ELF, compared with
2.26 MB and 2.24 MB for hello world, respectively.
Function-level module elimination is not implemented. Glob patterns are parsed
on demand without a persistent cache.

The path and glob algorithms are original Nona code. Node.js 26.9.0 is used
only as a behavioral oracle; no Node.js or minimatch source is bundled or
adapted. Imported functions are ordinary JavaScript closures compiled by
Nona, not interpreted at runtime.

`tests/path.test.ts` compares native module output with Node on Windows/Linux
under GC stress. `tests/path-source.test.ts` separately checks the actual
module source against Node, including 91,000 seeded component/root/path-pair
comparisons, 5,888 glob token/traversal cases and 4,032 concatenated extglob
cases and 700 nested-group cases. Compact native regressions also cover
nullable/negated groups, nested dot guards and empty-input repetition.
Windows relative-path regressions also exercise device-less roots and UNC
prefix boundaries using a simulated POSIX working directory. The source suite
checks a 729-pair root matrix and 2,500 generated pairs in that environment,
while empty/dot inputs are checked against Node on the actual CI host.
The native platform probe matrix exercises runtime cwd resolution, relative
paths, both flavors and glob matching on all eight OS/CPU targets.

On Windows/Linux, the module uses the existing native `process` adapter.
On FreeBSD/OpenBSD it uses `__getcwd` directly. Darwin opens the current
directory, reads its path with `fcntl(F_GETPATH)`, and closes the descriptor
in a `finally` block. These helpers use raw kernel calls via `nona:ffi` and
do not require the full `process` adapter, libc, or an additional library.
