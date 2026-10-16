# Built-in modules and globals

Nona programs run without Node.js. The host APIs below are part of the compiler: the native runtime and small JavaScript preludes are compiled into every executable, and built-in modules are compiled in when a program imports them.

## Overview

| API                                                                                                                                                                                                                                                                                                               | Kind                | Targets                                  | Reference                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `setImmediate`/`clearImmediate`, `queueMicrotask`, `performance.now()`                                                                                                                                                                              | globals             | all eight native targets                 | [Timers and the event loop](/reference/host-apis)                                                                  |
| `process`                                                                                                                                                                                                                                                                                                         | global              | all eight native targets                 | [process](/reference/process)                                                                                      |
| `TextEncoder`, `TextDecoder`                                                                                                                                                                                                                                                                                      | globals             | all eight                                | [File system and text encoding](/reference/fs#textencoder-and-textdecoder)                                         |
| `console.log`                                                                                                                                                                                                                                                                                                     | global              | all eight                                | writes UTF-8 to standard output                                                                                    |
| `console.error`, `console.warn`                                                                                                                                                                                                                                                                                   | global              | all eight                                | writes UTF-8 to standard error (`console.info`, `console.debug`: standard output)                                  |
| `nona:process`, `node:process`                                                                                                                                                                                                                                                                                    | modules             | all eight native targets                 | [process](/reference/process)                                                                                      |
| `node:stream`, `stream`, `nona:stream`, `node:stream/promises`, `node:stream/consumers`                                                                                                                                                                                                                           | modules             | all eight native targets                 | [Streams and standard I/O](/reference/process)                                                                     |
| `nona:fs`, `node:fs`                                                                                                                                                                                                                                                                                              | modules             | all eight                                | [File system and text encoding](/reference/fs)                                                                     |
| `node:async_hooks`, `nona:async_hooks`                                                                                                                                                                                                                                                                            | modules             | all eight                                | Manual async resources, hooks and local context storage; native resource hooks and GC destruction are not emitted. |
| `node:events`, `events`, `nona:events`                                                                                                                                                                                                                                                                            | modules             | all eight                                | [EventEmitter and asynchronous event helpers](/reference/host-apis#events)                                         |
| `node:path`, `path`, `node:path/posix`, `node:path/win32`                                                                                                                                                                                                                                                         | modules             | all eight                                | [Paths](/reference/host-apis#paths-nodepath)                                                                       |
| `nona:http`, `node:http`, `node:https`, `nona:net`, `node:net`, `node:string_decoder`                                                                                                                                                                                                                             | modules             | Windows, Linux                           | [Networking](/reference/network)                                                                                   |
| `URL`, `URLSearchParams`, `node:url`, `url`                                                                                                                                                                                                                                                                       | globals and module  | all eight                                | [URL](/reference/host-apis#url)                                                                                    |
| `node:os`, `node:tty`, `node:util`, `node:util/types`, `node:assert`, `node:assert/strict`, `node:crypto`, `node:querystring`, `node:timers`, `node:timers/promises`, `node:perf_hooks`, `node:module`, `node:worker_threads`, `node:child_process`, `node:tls`, `node:http2`, `node:zlib` (and their bare names) | modules             | all eight                                | [Node.js support modules](/reference/host-apis#nodejs-support-modules)                                             |
| `node:buffer`, `buffer`, `nona:buffer`, `Buffer`, `Blob`, `File`                                                                                                                                                                                                                                                  | globals and modules | all eight                                | [Buffer and binary data](/reference/host-apis#buffer-and-binary-data)                                              |
| `nona:ffi`                                                                                                                                                                                                                                                                                                        | module              | Windows (DLLs), all eight (system calls) | [Native functions (FFI)](/reference/ffi)                                                                           |
| `nona:win32`                                                                                                                                                                                                                                                                                                      | module              | Windows                                  | below and [FFI](/reference/ffi#nona-win32)                                                                         |

## Rules

- Globals are available in scripts and modules.
- Built-in modules can be imported from module code (`.mjs` or `--module`), required from CommonJS modules (`require('fs')`, `require('node:fs')`) and loaded with literal `import()` from scripts. FFI declarations (`define`) must be in module code.
- Supported Node modules: `node:fs`, `node:process`, `node:path` (`path` alias), `node:events` (`events`/`nona:events` aliases), `node:async_hooks` (`nona:async_hooks` alias), and `node:stream`, `node:stream/promises`, `node:stream/consumers`, `node:buffer` (`buffer`/`nona:buffer` aliases). Global `Buffer`, `Blob`, `File`, `URL`, `URLSearchParams` and `crypto` are available. `node:http`, `node:net` and `node:string_decoder` are available for networking, and `node:os`, `node:tty`, `node:util`, `node:url`, `node:assert`, `node:crypto`, `node:querystring`, `node:timers`, `node:perf_hooks`, `node:module`, `node:worker_threads` and `node:child_process`, `node:https`, `node:tls`, `node:http2` and `node:zlib` for [npm packages](/reference/npm).
- `nona:win32` and DLL declarations require Windows x64 or ARM64; system call declarations use the selected Linux, Darwin or BSD kernel.

## `nona:win32`

Ready-made declarations built on [`nona:ffi`](/reference/ffi). Every function is a native thunk: arguments are converted as described for the [signature types](/reference/ffi#signatures).

### user32

| Export                        | Signature                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `MessageBoxW`                 | `i32(ptr hwnd, wstr text, wstr caption, u32 type)`                                                          |
| `GetSystemMetrics`            | `i32(i32 index)`                                                                                            |
| `SystemParametersInfoW`       | `bool(u32 action, u32 param, wstr value, u32 flags)` — for string parameters such as `SPI_SETDESKWALLPAPER` |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)` — for buffer parameters such as `SPI_GETDESKWALLPAPER`  |

### kernel32

| Export                | Signature                                           |
| --------------------- | --------------------------------------------------- |
| `CreateMutexW`        | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex`        | `bool(ptr mutex)`                                   |
| `CloseHandle`         | `bool(ptr handle)`                                  |
| `GetModuleFileNameW`  | `u32(ptr module, buf path, u32 size)`               |
| `GetCurrentProcessId` | `u32()`                                             |

### advapi32

| Export             | Signature                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `RegCreateKeyExW`  | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW`    | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)`                                                         |
| `RegSetValueExW`   | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)`                                                    |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)`                                                    |
| `RegDeleteValueW`  | `i32(ptr key, wstr name)`                                                                                                |
| `RegDeleteKeyW`    | `i32(ptr key, wstr subKey)`                                                                                              |
| `RegCloseKey`      | `i32(ptr key)`                                                                                                           |

### Constants

| Export                                                          | Value                                               |
| --------------------------------------------------------------- | --------------------------------------------------- |
| `HKEY_CLASSES_ROOT`, `HKEY_CURRENT_USER`, `HKEY_LOCAL_MACHINE`  | predefined registry keys (as sign-extended handles) |
| `KEY_READ`, `KEY_WRITE`, `KEY_ALL_ACCESS`                       | `0x20019`, `0x20006`, `0xF003F`                     |
| `REG_SZ`, `REG_DWORD`                                           | `1`, `4`                                            |
| `ERROR_SUCCESS`, `ERROR_FILE_NOT_FOUND`, `ERROR_ALREADY_EXISTS` | `0`, `2`, `183`                                     |
| `SPI_GETDESKWALLPAPER`, `SPI_SETDESKWALLPAPER`                  | `0x73`, `0x14`                                      |
| `SPIF_UPDATEINIFILE`, `SPIF_SENDCHANGE`                         | `1`, `2`                                            |
| `MB_OK`, `MB_ICONERROR`, `MB_ICONINFORMATION`                   | `0`, `0x10`, `0x40`                                 |
| `MAX_PATH`                                                      | `260`                                               |

### Helpers

| Export                   | Description                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `lastError()`            | `GetLastError()` captured right after the most recent FFI call (re-exported from `nona:ffi`). |
| `wideString(text)`       | A NUL-terminated `Uint16Array` for `buf` parameters that expect a UTF-16 string.              |
| `fromWideString(buffer)` | Decodes a NUL-terminated UTF-16 buffer.                                                       |
| `readHandle(buffer)`     | Reads a handle (for example an `HKEY`) that a function wrote into an 8-byte buffer.           |

For functions that are not listed, declare them yourself with `define` from [`nona:ffi`](/reference/ffi).

## `node:buffer`, `buffer`, `nona:buffer`

The aliases export the global `Buffer`, `Blob` and `File` constructors, byte validators, base64 helpers, transcoding, inspection settings and constants. Blob byte and text streams, BYOB readers and object URL registration are available. General URL parsing is the global [`URL`](/reference/host-apis#url); arbitrary Web Stream construction remains a separate dependency API. See [binary data](/reference/host-apis#buffer-and-binary-data) and the [runnable sample](https://github.com/40oleg/nona/blob/main/site/samples/buffer.mjs).
