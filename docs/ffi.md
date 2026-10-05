# Native functions (FFI)

Windows programs can call exported functions of any DLL through the built-in
`nona:ffi` module. Declarations are resolved at compile time: every `define`
call adds an entry to the PE import table, so the program does not use
`LoadLibrary`/`GetProcAddress`.

```js
import { define, lastError } from 'nona:ffi';

const MessageBoxW = define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)');
MessageBoxW(null, 'Hello from Nona', 'Nona', 0);
```

- FFI is available in module code (`.mjs` or `--module`). `define` must be
  called directly, with three string literals: the DLL name, the export name
  and the signature. Anything else is a compile error (`E_FFI_STATIC`).
- DLL declarations require a Windows x64 or ARM64 target (`E_FFI_TARGET`).
- On Linux, Darwin and BSD, `define('syscall', '<number>', signature)` declares a raw system
  call (at most six integer or `buf` arguments; the result is the raw kernel
  return value, negative `errno` on failure). System call declarations are
  rejected for Windows targets. Numbers belong to the selected kernel and CPU;
  Darwin uses the BSD syscall number without the `0x2000000` class prefix.
  BSD/Darwin carry errors are normalized to negative `errno`.
- `lastError()` returns `GetLastError()` captured immediately after the most
  recent Windows FFI call. On other targets, inspect the syscall result.
- A missing DLL or export makes the Windows loader refuse to start the program.

## Signatures

`result(param, param, ...)`, for example `bool(u32,u32,wstr,u32)`.

| Type | Parameter | Result |
| --- | --- | --- |
| `i8 i16 i32 i64 u8 u16 u32 u64` | Number (truncated towards zero) or Boolean | Number |
| `ptr` | Number, Boolean, `null`/`undefined` (NULL) | Number |
| `bool` | like `i32` | Boolean (Win32 `BOOL`, non-zero is `true`) |
| `f32 f64` | Number | Number |
| `wstr` | String → temporary NUL-terminated UTF-16 copy; `null`/`undefined` → NULL | — |
| `str` | String → temporary NUL-terminated UTF-8 copy; `null`/`undefined` → NULL | — |
| `buf` | ArrayBuffer, SharedArrayBuffer, typed array or DataView → pointer to its bytes (at the view offset); `null`/`undefined` → NULL | — |
| `void` | — | `undefined` |

Other argument types throw `TypeError`; so do missing arguments (except for
pointer types, where `undefined` means NULL) and detached buffers. The callee
may write into `buf` memory, which is how out-parameters are returned: pass a
`Uint16Array` for a UTF-16 string buffer or a `Uint8Array(8)` for a handle.
Temporary string copies are freed after the call; the callee must not keep
the pointer. Callbacks (`cb(...)`) and out-parameter types are reserved for a
later version.

## `nona:win32`

A curated set of declarations and helpers built on `nona:ffi`:

- user32: `MessageBoxW`, `GetSystemMetrics`, `SystemParametersInfoW` (string
  parameter), `SystemParametersInfoBufferW` (buffer parameter);
- kernel32: `CreateMutexW`, `ReleaseMutex`, `CloseHandle`,
  `GetModuleFileNameW`, `GetCurrentProcessId`;
- advapi32: `RegCreateKeyExW`, `RegOpenKeyExW`, `RegSetValueExW`,
  `RegQueryValueExW`, `RegDeleteValueW`, `RegDeleteKeyW`, `RegCloseKey`;
- constants such as `HKEY_CURRENT_USER`, `KEY_ALL_ACCESS`, `REG_SZ`,
  `SPI_SETDESKWALLPAPER`, `SPIF_UPDATEINIFILE`, `ERROR_ALREADY_EXISTS`;
- helpers `wideString(text)` (NUL-terminated `Uint16Array`),
  `fromWideString(buffer)` and `readHandle(buffer)`; `lastError` is
  re-exported.

```js
import { SystemParametersInfoW, SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE } from 'nona:win32';
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, 'C:\\Pictures\\painting.jpg', SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
```
