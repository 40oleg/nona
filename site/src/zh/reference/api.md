# compile() API

命令行只是对 `src/compiler.ts` 中 `compile()` 的一层薄封装。该包没有发布到 npm；执行 `npm run build` 后，模块位于你的克隆中的 `dist/src/compiler.js`。

## 示例

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

编译一段源码并返回 `CompileResult`。它不写入任何文件。

### `CompileOptions`

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `fileName` | `string` | 诊断信息中使用的名称；对模块而言，也是解析相对导入的基准路径。必填。 |
| `target` | `Target` | OS and CPU from the [native platform matrix](/reference/native-platforms). Required. |
| `module` | `boolean` | 按 ES 模块编译。 |
| `subsystem` | `'console' \| 'windows'` | PE 子系统（仅限 `win32-x64`）。 |
| `icon` | `Uint8Array` | `.ico` 文件的内容（仅限 `win32-x64`）。 |
| `manifest` | `string` | 应用程序清单 XML（仅限 `win32-x64`）。 |
| `versionInfo` | `VersionInfo` | 版本信息字段（仅限 `win32-x64`）。 |
| `moduleHost` | `ModuleHost` | 自定义模块解析（见下文）。 |
| `unhandledRejections` | `'throw' \| 'ignore'` | 未处理的 Promise 拒绝是否让程序失败（默认 `'throw'`）。 |
| `scriptPrelude`、`realms`、`agents` | — | Test262 测试框架使用的选项。 |

### `CompileResult`

```ts
type CompileResult =
  | { ok: true; image: Uint8Array; imports: string[] }   // imports: "DLL!function" of a PE image
  | { ok: false; diagnostics: Diagnostic[] };            // { code, message, file, span }
```

`span.start` 和 `span.end` 是源码中的 UTF-16 偏移量。

## `ModuleHost`

```ts
interface ModuleHost {
  resolve(specifier: string, referrer: string): string | undefined;
  read(path: string): string | undefined;
  candidates?(referrer: string): string[];
}
```

路径是由宿主选择的、以 `/` 分隔的规范字符串。默认宿主相对于引用文件解析相对说明符，并从磁盘读取文件。`candidates` 列出计算形式的 `import()` 可能引用的模块，以便把它们编译进程序。内置的 `nona:*` 和 `node:*` 模块会在询问宿主之前解析。


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
