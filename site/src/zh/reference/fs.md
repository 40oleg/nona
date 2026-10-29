# 文件系统（`nona:fs`、`node:fs`）

::: info 翻译说明
本页译自英文页面 [File system](/reference/fs)，其内容来自 [`docs/fs.md`](https://github.com/40oleg/nona/blob/main/docs/fs.md)。英文版为准，且可能更新。
:::

内置了 Node.js `fs` 模块的一个同步子集，并在其之上提供常用函数的回调和 Promise 形式。两个说明符解析到同一个实现；`import fs from 'node:fs'`、具名导入和 `require('fs')` 都可以使用。

| 函数                                                                      | 说明                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readFileSync(path, options?)`                                            | 不指定编码时返回 `Uint8Array`（Node.js 返回 `Buffer`）；`'utf8'` 时返回字符串。                                                                                                                                                             |
| `writeFileSync(path, data, options?)`                                     | `data`：字符串（UTF-8）、类型化数组、DataView 或 ArrayBuffer。`{flag: 'a'}` 表示追加。 `flag`: `w` / `a` / `wx`; POSIX `mode`.                                                                                                              |
| `appendFileSync(path, data)`                                              |                                                                                                                                                                                                                                             |
| `existsSync(path)`                                                        |                                                                                                                                                                                                                                             |
| `accessSync(path, mode?)`                                                 | 路径不存在时抛出 `ENOENT`；不检查权限位。                                                                                                                                                                                                   |
| `statSync(path, options?)`                                                | `isFile()`、`isDirectory()`、`isSymbolicLink()`、`isBlockDevice()`、`isCharacterDevice()`、`isFIFO()`、`isSocket()`、`size`、`mtimeMs`、`mtime`、`mode`；`{throwIfNoEntry: false}`。 `dev`, `ino`; `{bigint: true}` → BigInt `dev` / `ino`. |
| `lstatSync(path, options?)`                                               | 与 `statSync` 类似，但针对链接本身而非其目标；`{throwIfNoEntry: false}`。在 Windows 上，符号链接和 junction 都算作链接。                                                                                                                    |
| `readlinkSync(path)`                                                      | 符号链接（或 Windows junction）按存储形式给出的目标；其他文件抛出 `EINVAL`。                                                                                                                                                                |
| `realpathSync(path)`、`realpathSync.native(path)`                         | 解析符号链接后的规范绝对路径。                                                                                                                                                                                                              |
| `readdirSync(path, options?)`                                             | 不含 `.` 和 `..` 的名称；`{withFileTypes: true}` 返回 `fs.Dirent` 对象，具有 `name`、`parentPath`、`path` 以及 `Stats` 的 `is*()` 方法。                                                                                                    |
| `mkdirSync(path, {recursive}?)`                                           | 使用 `recursive` 时，返回创建的第一个目录。                                                                                                                                                                                                 |
| `rmSync(path, {recursive, force}?)`                                       | 删除文件，使用 `recursive` 时删除整个目录树；`force` 会忽略不存在的路径。                                                                                                                                                                   |
| `rmdirSync`、`unlinkSync`、`renameSync`、`copyFileSync(src, dest, mode?)` | 支持 `constants.COPYFILE_EXCL`。                                                                                                                                                                                                            |

路径是字符串（或 UTF-8 的 `Uint8Array`）。只支持 `utf8` 编码。错误是带有 Node.js 错误码（`ENOENT`、`EEXIST`、`EISDIR`、`ENOTDIR`、`ENOTEMPTY`、`EACCES`、`EPERM` 等）、`syscall` 和 `path` 的 `Error` 对象，消息格式与 Node.js 相同（在 Windows 上，Node.js 在消息中显示绝对路径；Nona 显示原样传入的路径）。

实现：在 Windows 上，该模块通过 [`nona:ffi`](/zh/reference/ffi) 调用 KERNEL32（`CreateFileW`、`ReadFile`、`FindFirstFileW` 等）；在 Linux 上，它使用通过 `define('syscall', number, signature)` 声明的原始系统调用。只有当前编译目标平台的函数会被链接进来。

## 回调与 Promise

`readFile`、`writeFile`、`appendFile`、`access`、`stat`、`lstat`、`readlink`、`realpath`（含 `realpath.native`）、`readdir`、`mkdir`, `mkdtemp`、`rm`、`rmdir`、`unlink`、`rename`, `truncate`、`copyFile`, `symlink`, `chmod`, `utimes` 和 `exists` 接受 Node.js 风格的回调（`(error, result)`；`exists` 只传一个布尔值）。去掉 `exists` 后的同一组函数会返回来自 `fs.promises` 以及 `node:fs/promises` 模块（`fs/promises`、`nona:fs/promises`）的 Promise，该模块与 `fs.promises` 是同一个对象。两种形式都在调用时执行同步操作，只是把回调推迟到之后的 tick 或让 Promise 完成：它们不会让文件系统操作与其他代码重叠执行。

## TextEncoder 与 TextDecoder {#textencoder-and-textdecoder}

`TextEncoder` 和 `TextDecoder` 是全局对象，按照 WHATWG Encoding 标准实现 UTF-8：`encode(string)`、`decode(bufferSource)`、`fatal` 和 `ignoreBOM` 选项，以及把无效序列和孤立代理项替换为 U+FFFD。其他编码会抛出 `RangeError`。

支持 Windows、Linux 和 macOS（x64 和 ARM64），以及 FreeBSD 和 OpenBSD（x64）。
