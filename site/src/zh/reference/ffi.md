# 原生函数（FFI）

::: info 翻译说明
本页译自英文页面 [Native functions (FFI)](/reference/ffi)，其内容来自 [`docs/ffi.md`](https://github.com/40oleg/nona/blob/main/docs/ffi.md)。英文版为准，且可能更新。
:::

Windows 程序可以通过内置的 `nona:ffi` 模块调用任意 DLL 的导出函数。声明在编译时解析：每个 `define` 调用都会在 PE 导入表中添加一项，因此程序不使用 `LoadLibrary`/`GetProcAddress`。

```js
import { define, lastError } from 'nona:ffi';

const MessageBoxW = define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)');
MessageBoxW(null, 'Hello from Nona', 'Nona', 0);
```

- FFI 在模块代码（`.mjs` 或 `--module`）中可用。`define` 必须被直接调用，并带有三个字符串字面量：DLL 名称、导出名称和签名。其他写法都是编译错误（`E_FFI_STATIC`）。
- 对 `--target linux-x64`，DLL 声明会被拒绝（`E_FFI_TARGET`）。
- 在 Linux 上，`define('syscall', '<number>', signature)` 声明一个原始系统调用（最多六个整数或 `buf` 参数；结果是内核原样返回的值，失败时为负的 `errno`）。对 `win32-x64`，系统调用声明会被拒绝。
- `lastError()` 返回在最近一次 FFI 调用后立即捕获的 `GetLastError()`。
- 如果缺少 DLL 或导出，Windows 加载器会拒绝启动程序。

## 签名 {#signatures}

`result(param, param, ...)`，例如 `bool(u32,u32,wstr,u32)`。

| 类型 | 参数 | 结果 |
| --- | --- | --- |
| `i8 i16 i32 i64 u8 u16 u32 u64` | Number（向零截断）或 Boolean | Number |
| `ptr` | Number、Boolean、`null`/`undefined`（NULL） | Number |
| `bool` | 同 `i32` | Boolean（Win32 `BOOL`，非零为 `true`） |
| `f32 f64` | Number | Number |
| `wstr` | String → 以 NUL 结尾的临时 UTF-16 副本；`null`/`undefined` → NULL | — |
| `str` | String → 以 NUL 结尾的临时 UTF-8 副本；`null`/`undefined` → NULL | — |
| `buf` | ArrayBuffer、SharedArrayBuffer、类型化数组或 DataView → 指向其字节的指针（考虑视图偏移）；`null`/`undefined` → NULL | — |
| `void` | — | `undefined` |

其他类型的参数会抛出 `TypeError`；缺失参数（指针类型除外，此时 `undefined` 表示 NULL）和已分离的缓冲区也会抛出。被调用方可以写入 `buf` 内存，这就是返回输出参数的方式：对 UTF-16 字符串缓冲区传入 `Uint16Array`，对句柄传入 `Uint8Array(8)`。临时字符串副本在调用后释放；被调用方不得保留该指针。回调（`cb(...)`）和输出参数类型留待以后的版本。

## `nona:win32` {#nona-win32}

基于 `nona:ffi` 精选的一组声明和辅助函数：

- user32：`MessageBoxW`、`GetSystemMetrics`、`SystemParametersInfoW`（字符串参数）、`SystemParametersInfoBufferW`（缓冲区参数）；
- kernel32：`CreateMutexW`、`ReleaseMutex`、`CloseHandle`、`GetModuleFileNameW`、`GetCurrentProcessId`；
- advapi32：`RegCreateKeyExW`、`RegOpenKeyExW`、`RegSetValueExW`、`RegQueryValueExW`、`RegDeleteValueW`、`RegDeleteKeyW`、`RegCloseKey`；
- 常量，例如 `HKEY_CURRENT_USER`、`KEY_ALL_ACCESS`、`REG_SZ`、`SPI_SETDESKWALLPAPER`、`SPIF_UPDATEINIFILE`、`ERROR_ALREADY_EXISTS`；
- 辅助函数 `wideString(text)`（以 NUL 结尾的 `Uint16Array`）、`fromWideString(buffer)` 和 `readHandle(buffer)`；`lastError` 被重新导出。

```js
import { SystemParametersInfoW, SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE } from 'nona:win32';
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, 'C:\\Pictures\\painting.jpg', SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
```


## Native target availability

Windows/Linux x64 and ARM64, Intel macOS and FreeBSD/OpenBSD x64 targets are available. Apple Silicon startup is not enabled. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
