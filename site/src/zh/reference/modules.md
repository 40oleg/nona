# 内置模块与全局对象

Nona 程序在没有 Node.js 的情况下运行。下面的宿主 API 是编译器的一部分：原生运行时和小型 JavaScript 前导代码会编译进每个可执行文件，内置模块则在程序导入时编译进去。

## 概览

| API | 类型 | 目标平台 | 参考 |
| --- | --- | --- | --- |
| `setTimeout`、`setInterval`、`clearTimeout`、`clearInterval`、`queueMicrotask`、`performance.now()` | 全局 | 两者 | [定时器与事件循环](/zh/reference/host-apis) |
| `process` | 全局 | 两者 | [process](/zh/reference/process) |
| `TextEncoder`、`TextDecoder` | 全局 | 两者 | [文件系统与文本编码](/zh/reference/fs#textencoder-and-textdecoder) |
| `console.log` | 全局 | 两者 | 以 UTF-8 写入标准输出 |
| `nona:process`、`node:process` | 模块 | 两者 | [process](/zh/reference/process) |
| `nona:fs`、`node:fs` | 模块 | 两者 | [文件系统与文本编码](/zh/reference/fs) |
| `nona:ffi` | 模块 | Windows（DLL）、Linux（系统调用） | [原生函数（FFI）](/zh/reference/ffi) |
| `nona:win32` | 模块 | Windows | 见下文及 [FFI](/zh/reference/ffi#nona-win32) |

## 规则

- 全局对象在脚本和模块中都可用。
- 内置模块可以在模块代码（`.mjs` 或 `--module`）中导入，也可以在脚本中用字面量 `import()` 导入。FFI 声明（`define`）必须位于模块代码中。
- `node:` 模块中只有 `node:fs` 和 `node:process`；它们是 Nona 子集的别名，而不是 Node.js 的实现。`node:path`、`Buffer` 和 `require` 不可用。
- `nona:win32` 和 DLL 声明只能为 `win32-x64` 编译；系统调用声明只能为 `linux-x64` 编译。

## `nona:win32` {#nona-win32}

基于 [`nona:ffi`](/zh/reference/ffi) 的现成声明。每个函数都是一个原生转换桩：参数按照[签名类型](/zh/reference/ffi#signatures)中的说明进行转换。

### user32

| 导出 | 签名 |
| --- | --- |
| `MessageBoxW` | `i32(ptr hwnd, wstr text, wstr caption, u32 type)` |
| `GetSystemMetrics` | `i32(i32 index)` |
| `SystemParametersInfoW` | `bool(u32 action, u32 param, wstr value, u32 flags)`——用于字符串参数，例如 `SPI_SETDESKWALLPAPER` |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)`——用于缓冲区参数，例如 `SPI_GETDESKWALLPAPER` |

### kernel32

| 导出 | 签名 |
| --- | --- |
| `CreateMutexW` | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex` | `bool(ptr mutex)` |
| `CloseHandle` | `bool(ptr handle)` |
| `GetModuleFileNameW` | `u32(ptr module, buf path, u32 size)` |
| `GetCurrentProcessId` | `u32()` |

### advapi32

| 导出 | 签名 |
| --- | --- |
| `RegCreateKeyExW` | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW` | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)` |
| `RegSetValueExW` | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)` |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)` |
| `RegDeleteValueW` | `i32(ptr key, wstr name)` |
| `RegDeleteKeyW` | `i32(ptr key, wstr subKey)` |
| `RegCloseKey` | `i32(ptr key)` |

### 常量

| 导出 | 值 |
| --- | --- |
| `HKEY_CLASSES_ROOT`、`HKEY_CURRENT_USER`、`HKEY_LOCAL_MACHINE` | 预定义的注册表键（符号扩展后的句柄） |
| `KEY_READ`、`KEY_WRITE`、`KEY_ALL_ACCESS` | `0x20019`、`0x20006`、`0xF003F` |
| `REG_SZ`、`REG_DWORD` | `1`、`4` |
| `ERROR_SUCCESS`、`ERROR_FILE_NOT_FOUND`、`ERROR_ALREADY_EXISTS` | `0`、`2`、`183` |
| `SPI_GETDESKWALLPAPER`、`SPI_SETDESKWALLPAPER` | `0x73`、`0x14` |
| `SPIF_UPDATEINIFILE`、`SPIF_SENDCHANGE` | `1`、`2` |
| `MB_OK`、`MB_ICONERROR`、`MB_ICONINFORMATION` | `0`、`0x10`、`0x40` |
| `MAX_PATH` | `260` |

### 辅助函数

| 导出 | 说明 |
| --- | --- |
| `lastError()` | 在最近一次 FFI 调用后立即捕获的 `GetLastError()`（从 `nona:ffi` 重新导出）。 |
| `wideString(text)` | 以 NUL 结尾的 `Uint16Array`，用于期望 UTF-16 字符串的 `buf` 参数。 |
| `fromWideString(buffer)` | 解码以 NUL 结尾的 UTF-16 缓冲区。 |
| `readHandle(buffer)` | 读取函数写入 8 字节缓冲区的句柄（例如 `HKEY`）。 |

未列出的函数，请用 [`nona:ffi`](/zh/reference/ffi) 中的 `define` 自行声明。


## Native target availability

Windows/Linux x64 and ARM64, Intel macOS and FreeBSD/OpenBSD x64 targets are available. Apple Silicon startup is not enabled. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
