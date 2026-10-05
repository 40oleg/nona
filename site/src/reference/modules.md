# Built-in modules and globals

Nona programs run without Node.js. The host APIs below are part of the compiler: the native runtime and small JavaScript preludes are compiled into every executable, and built-in modules are compiled in when a program imports them.

## Overview

| API | Kind | Targets | Reference |
| --- | --- | --- | --- |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask`, `performance.now()` | globals | both | [Timers and the event loop](/reference/host-apis) |
| `process` | global | both | [process](/reference/process) |
| `TextEncoder`, `TextDecoder` | globals | both | [File system and text encoding](/reference/fs#textencoder-and-textdecoder) |
| `console.log` | global | both | writes UTF-8 to standard output |
| `nona:process`, `node:process` | modules | both | [process](/reference/process) |
| `nona:fs`, `node:fs` | modules | both | [File system and text encoding](/reference/fs) |
| `node:events`, `events`, `nona:events` | modules | all native targets | [EventEmitter and asynchronous event helpers](/reference/host-apis#events) |
| `nona:ffi` | module | Windows (DLLs), Linux (system calls) | [Native functions (FFI)](/reference/ffi) |
| `nona:win32` | module | Windows | below and [FFI](/reference/ffi#nona-win32) |

## Rules

- Globals are available in scripts and modules.
- Built-in modules can be imported from module code (`.mjs` or `--module`) and with literal `import()` from scripts. FFI declarations (`define`) must be in module code.
- `node:fs`, `node:process` and `node:events` are supported; they are aliases of the Nona subsets, not the Node.js implementations. `node:path`, `Buffer` and `require` are not available.
- `nona:win32` and DLL declarations require Windows x64 or ARM64; system call declarations use the selected Linux, Darwin or BSD kernel.

## `nona:win32`

Ready-made declarations built on [`nona:ffi`](/reference/ffi). Every function is a native thunk: arguments are converted as described for the [signature types](/reference/ffi#signatures).

### user32

| Export | Signature |
| --- | --- |
| `MessageBoxW` | `i32(ptr hwnd, wstr text, wstr caption, u32 type)` |
| `GetSystemMetrics` | `i32(i32 index)` |
| `SystemParametersInfoW` | `bool(u32 action, u32 param, wstr value, u32 flags)` — for string parameters such as `SPI_SETDESKWALLPAPER` |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)` — for buffer parameters such as `SPI_GETDESKWALLPAPER` |

### kernel32

| Export | Signature |
| --- | --- |
| `CreateMutexW` | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex` | `bool(ptr mutex)` |
| `CloseHandle` | `bool(ptr handle)` |
| `GetModuleFileNameW` | `u32(ptr module, buf path, u32 size)` |
| `GetCurrentProcessId` | `u32()` |

### advapi32

| Export | Signature |
| --- | --- |
| `RegCreateKeyExW` | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW` | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)` |
| `RegSetValueExW` | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)` |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)` |
| `RegDeleteValueW` | `i32(ptr key, wstr name)` |
| `RegDeleteKeyW` | `i32(ptr key, wstr subKey)` |
| `RegCloseKey` | `i32(ptr key)` |

### Constants

| Export | Value |
| --- | --- |
| `HKEY_CLASSES_ROOT`, `HKEY_CURRENT_USER`, `HKEY_LOCAL_MACHINE` | predefined registry keys (as sign-extended handles) |
| `KEY_READ`, `KEY_WRITE`, `KEY_ALL_ACCESS` | `0x20019`, `0x20006`, `0xF003F` |
| `REG_SZ`, `REG_DWORD` | `1`, `4` |
| `ERROR_SUCCESS`, `ERROR_FILE_NOT_FOUND`, `ERROR_ALREADY_EXISTS` | `0`, `2`, `183` |
| `SPI_GETDESKWALLPAPER`, `SPI_SETDESKWALLPAPER` | `0x73`, `0x14` |
| `SPIF_UPDATEINIFILE`, `SPIF_SENDCHANGE` | `1`, `2` |
| `MB_OK`, `MB_ICONERROR`, `MB_ICONINFORMATION` | `0`, `0x10`, `0x40` |
| `MAX_PATH` | `260` |

### Helpers

| Export | Description |
| --- | --- |
| `lastError()` | `GetLastError()` captured right after the most recent FFI call (re-exported from `nona:ffi`). |
| `wideString(text)` | A NUL-terminated `Uint16Array` for `buf` parameters that expect a UTF-16 string. |
| `fromWideString(buffer)` | Decodes a NUL-terminated UTF-16 buffer. |
| `readHandle(buffer)` | Reads a handle (for example an `HKEY`) that a function wrote into an 8-byte buffer. |

For functions that are not listed, declare them yourself with `define` from [`nona:ffi`](/reference/ffi).


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.

`node:events` is also supported. It provides EventEmitter and asynchronous event helpers; see the linked host API reference for supported operations and limitations.
