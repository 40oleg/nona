# compile() API

The command line is a thin wrapper around `compile()` from `src/compiler.ts`. The package is not published to npm; after `npm run build` the module is `dist/src/compiler.js` in your clone.

## Example

```js
// build.mjs — run with Node.js from the repository root.
import { writeFileSync } from 'node:fs';
import { compile } from './dist/src/compiler.js';

const source = 'console.log("built with compile()");';
const result = compile(source, { fileName: 'app.js', target: 'linux-x64' });
if (!result.ok) {
  for (const d of result.diagnostics) console.error(`${d.code}: ${d.message}`);
  process.exit(1);
}
writeFileSync('app', result.image, { mode: 0o755 });
```

## `compile(source, options)`

Compiles one source text and returns `CompileResult`. It does not write files.

### `CompileOptions`

| Option | Type | Description |
| --- | --- | --- |
| `fileName` | `string` | Name used in diagnostics; for modules also the path that relative imports are resolved against. Required. |
| `target` | `Target` | OS and CPU from the [native platform matrix](/reference/native-platforms). Required. |
| `module` | `boolean` | Compile as an ES module. |
| `subsystem` | `'console' \| 'windows'` | PE subsystem (`win32-x64` only). |
| `icon` | `Uint8Array` | Contents of an `.ico` file (`win32-x64` only). |
| `manifest` | `string` | Application manifest XML (`win32-x64` only). |
| `versionInfo` | `VersionInfo` | Version information fields (`win32-x64` only). |
| `moduleHost` | `ModuleHost` | Custom module resolution (see below). |
| `unhandledRejections` | `'throw' \| 'ignore'` | Whether an unhandled Promise rejection fails the program (default `'throw'`). |
| `fullRuntime` | `boolean` | Link the whole runtime instead of only the parts the program can reach (see [Linked runtime parts](/guide/compatibility#linked-runtime-parts)). |
| `baseCache` | `BaseImageCache` | Keep the compiled runtime and preludes between processes. `fileBaseImageCache(directory?)` from `src/cache.ts` (Node.js only) stores them in a directory; the command line uses it by default (see [Runtime cache](/reference/cli#runtime-cache)). Within one process they are always reused. |
| `callStats` | `boolean` | Count every call by target and print the counts to stderr when the program ends (see [`--call-stats`](/reference/cli#options)). |
| `coverage` | `{directory, url}` | Write per-function V8 coverage to `directory` when the program ends; `url` is the program's script URL (`file://…`) in the report (see [`--coverage`](/reference/cli#options)). |
| `scriptPrelude`, `realms`, `agents` | — | Options used by the Test262 harness. |

### `CompileResult`

```ts
type CompileResult =
  | { ok: true; image: Uint8Array; imports: string[] }   // imports: "DLL!function" of a PE image
  | { ok: false; diagnostics: Diagnostic[] };            // { code, message, file, span }
```

`span.start` and `span.end` are UTF-16 offsets into the source.

## `ModuleHost`

```ts
interface ModuleHost {
  resolve(specifier: string, referrer: string): string | undefined;
  read(path: string): string | undefined;
  candidates?(referrer: string): string[];
}
```

Paths are canonical `/`-separated strings chosen by the host. The default host resolves relative specifiers next to the referring file and reads files from disk. `candidates` lists the modules a computed `import()` may name, so that they are compiled in. Built-in `nona:*` and `node:*` modules are resolved before the host is asked.


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
