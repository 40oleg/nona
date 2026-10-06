# 文件系统（`nona:fs`、`node:fs`）

::: info 翻译说明
本页译自英文页面 [File system](/reference/fs)，其内容来自 [`docs/fs.md`](https://github.com/40oleg/nona/blob/main/docs/fs.md)。英文版为准，且可能更新。
:::

内置了 Node.js `fs` 模块的一个同步子集。两个说明符解析到同一个实现；`import fs from 'node:fs'` 和具名导入都可以使用。

| 函数 | 说明 |
| --- | --- |
| `readFileSync(path, options?)` | 不指定编码时返回 `Uint8Array`（Node.js 返回 `Buffer`）；`'utf8'` 时返回字符串。 |
| `writeFileSync(path, data, options?)` | `data`：字符串（UTF-8）、类型化数组、DataView 或 ArrayBuffer。`{flag: 'a'}` 表示追加。 `flag`: `w` / `a` / `wx`; POSIX `mode`. |
| `appendFileSync(path, data)` | |
| `existsSync(path)` | |
| `statSync(path, options?)` | `isFile()`、`isDirectory()`、`isSymbolicLink()`、`size`、`mtimeMs`、`mtime`、`mode`；`{throwIfNoEntry: false}`。 `dev`, `ino`; `{bigint: true}` → BigInt `dev` / `ino`. |
| `realpathSync(path)` | 解析符号链接后的规范绝对路径。 |
| `readdirSync(path, options?)` | 不含 `.` 和 `..` 的名称；`{withFileTypes: true}` 返回具有 `name`、`isFile()`、`isDirectory()`、`isSymbolicLink()` 的条目。 |
| `mkdirSync(path, {recursive}?)` | 使用 `recursive` 时，返回创建的第一个目录。 |
| `rmdirSync`、`unlinkSync`、`renameSync`、`copyFileSync(src, dest, mode?)` | 支持 `constants.COPYFILE_EXCL`。 |

路径是字符串（或 UTF-8 的 `Uint8Array`）。只支持 `utf8` 编码。错误是带有 Node.js 错误码（`ENOENT`、`EEXIST`、`EISDIR`、`ENOTDIR`、`ENOTEMPTY`、`EACCES`、`EPERM` 等）、`syscall` 和 `path` 的 `Error` 对象，消息格式与 Node.js 相同（在 Windows 上，Node.js 在消息中显示绝对路径；Nona 显示原样传入的路径）。

实现：在 Windows 上，该模块通过 [`nona:ffi`](/zh/reference/ffi) 调用 KERNEL32（`CreateFileW`、`ReadFile`、`FindFirstFileW` 等）；在 Linux 上，它使用通过 `define('syscall', number, signature)` 声明的原始系统调用。只有当前编译目标平台的函数会被链接进来。

## TextEncoder 与 TextDecoder {#textencoder-and-textdecoder}

`TextEncoder` 和 `TextDecoder` 是全局对象，按照 WHATWG Encoding 标准实现 UTF-8：`encode(string)`、`decode(bufferSource)`、`fatal` 和 `ignoreBOM` 选项，以及把无效序列和孤立代理项替换为 U+FFFD。其他编码会抛出 `RangeError`。
