# Native functions (FFI)

Programs can call exported functions of shared libraries through the built-in
`nona:ffi` module: DLLs on Windows, shared objects (`.so`) on Linux and dylibs
or frameworks on macOS. Declarations are resolved at compile time: every
`define` call adds an entry to the executable's import table (the PE import
table, the ELF dynamic section or the Mach-O bind table), so the program does
not use `LoadLibrary`/`GetProcAddress` or `dlopen`/`dlsym`, and the operating
system's loader resolves every symbol before the program starts.

```js
import { define, lastError } from "nona:ffi";

const MessageBoxW = define(
    "user32.dll",
    "MessageBoxW",
    "i32(ptr,wstr,wstr,u32)",
);
MessageBoxW(null, "Hello from Nona", "Nona", 0);
```

```js
import { define, lastError } from "nona:ffi";

const strlen = define(
    {
        win32: "ucrtbase.dll",
        linux: "libc.so.6",
        darwin: "/usr/lib/libSystem.B.dylib",
    },
    "strlen",
    "u64(str)",
);
const cos = define(
    {
        win32: "ucrtbase.dll",
        linux: "libm.so.6",
        darwin: "/usr/lib/libSystem.B.dylib",
    },
    "cos",
    "f64(f64)",
);
console.log(strlen("hello"), cos(0)); // 5 1
```

- FFI is available in module code (`.mjs` or `--module`). `define` must be
  called directly, with three literals: the library, the symbol name and the
  signature. Anything else is a compile error (`E_FFI_STATIC`).
- The library is a string literal, or a **portable declaration**: an object
  literal of string literals keyed by operating system (`win32`, `linux`,
  `darwin`). The compiler selects the key of the target; a target without a
  key is a compile error (`E_FFI_TARGET`). Declarations stay static either
  way: no key is read at run time.
- `lastError()` returns the error code captured immediately after the most
  recent FFI call: `GetLastError()` on Windows, `errno` on Linux and macOS.
  Like `errno` itself, it is meaningful after a call that reported a failure;
  a successful call may leave an older value.
- On Linux, Darwin and BSD, `define('syscall', '<number>', signature)` declares a
  raw system call (at most six integer or `buf` arguments; the result is the raw
  kernel return value, negative `errno` on failure). System call declarations
  are rejected for Windows targets. Numbers belong to the selected kernel and
  CPU; Darwin uses the BSD syscall number without the `0x2000000` class prefix.
  BSD/Darwin carry errors are normalized to negative `errno`. `lastError()` is
  not updated by a system call; inspect its result.
- A missing library or symbol makes the operating system's loader refuse to
  start the program (Windows reports a missing DLL; `ld.so` prints
  `symbol lookup error` and exits with status 127; dyld reports the missing
  symbol).

| Target                   | Library argument                                                                                                                           | Mechanism                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| win32-x64, win32-arm64   | DLL name without a path (`kernel32.dll`, `ucrtbase.dll`)                                                                                   | PE import table                                                                                            |
| linux-x64, linux-arm64   | soname or path (`libc.so.6`, `libm.so.6`, `libsqlite3.so.0`, `/opt/lib/libfoo.so`)                                                         | dynamically linked ELF: `PT_INTERP`, `DT_NEEDED`, `GLOB_DAT` relocations resolved at start (`DT_BIND_NOW`) |
| darwin-x64, darwin-arm64 | dylib path or framework binary (`/usr/lib/libSystem.B.dylib`, `/usr/lib/libsqlite3.dylib`, `/System/Library/Frameworks/Foo.framework/Foo`) | dyld: one `LC_LOAD_DYLIB` per library, a bind per symbol                                                   |
| freebsd-x64, openbsd-x64 | —                                                                                                                                          | system calls only; a library declaration is `E_FFI_TARGET`                                                 |

A Windows DLL name on a Linux or macOS target, or a `.so`/`.dylib` name on
Windows, is `E_FFI_TARGET` as well: use a portable declaration.

## Signatures

`result(param, param, ...)`, for example `bool(u32,u32,wstr,u32)`.

| Type                            | Parameter                                                                                                                      | Result                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `i8 i16 i32 i64 u8 u16 u32 u64` | Number (truncated towards zero) or Boolean                                                                                     | Number                                     |
| `ptr`                           | Number, Boolean, `null`/`undefined` (NULL)                                                                                     | Number                                     |
| `bool`                          | like `i32`                                                                                                                     | Boolean (Win32 `BOOL`, non-zero is `true`) |
| `f32 f64`                       | Number                                                                                                                         | Number                                     |
| `wstr`                          | String → temporary NUL-terminated UTF-16 copy; `null`/`undefined` → NULL                                                       | —                                          |
| `str`                           | String → temporary NUL-terminated UTF-8 copy; `null`/`undefined` → NULL                                                        | —                                          |
| `buf`                           | ArrayBuffer, SharedArrayBuffer, typed array or DataView → pointer to its bytes (at the view offset); `null`/`undefined` → NULL | —                                          |
| `void`                          | —                                                                                                                              | `undefined`                                |

Other argument types throw `TypeError`; so do missing arguments (except for
pointer types, where `undefined` means NULL) and detached buffers. The callee
may write into `buf` memory, which is how out-parameters are returned: pass a
`Uint16Array` for a UTF-16 string buffer or a `Uint8Array(8)` for a handle.
Temporary string copies are freed after the call; the callee must not keep
the pointer. Callbacks (`cb(...)`) and out-parameter types are reserved for a
later version. A function takes at most 32 parameters.

`bool` is a 32-bit integer (`BOOL`, `int`). For a C `_Bool`/`bool` result,
whose upper bits are unspecified, declare `u8` and compare with `0`.

## Linux and macOS

- **Calling conventions.** linux-x64 and darwin-x64 use the SysV AMD64 ABI
  (integer arguments in RDI, RSI, RDX, RCX, R8, R9, floating-point arguments in
  XMM0–XMM7, the rest on the stack; `AL` holds the number of vector registers,
  so variadic functions such as `snprintf` receive `int` and `double` arguments
  correctly on x86-64). linux-arm64 uses AAPCS64 (X0–X7, D0–D7, then the
  stack with 8 bytes per argument); darwin-arm64 uses Apple's variant, where
  stack arguments are packed by their natural size and alignment and the caller
  extends `i8`/`i16`/`u8`/`u16` arguments. Nona extends narrow integer
  arguments on every POSIX target. Variadic functions are not supported on
  ARM64 (Apple passes variadic arguments on the stack): declare the fixed
  parameters only and avoid variadic calls there.
- **Libraries.** Linux executables name the GNU C library loader
  (`/lib64/ld-linux-x86-64.so.2`, `/lib/ld-linux-aarch64.so.1`) and always need
  `libc.so.6` (for `errno`); they do not run on musl systems such as Alpine.
  A soname (`libm.so.6`) is searched like any program's dependency
  (`LD_LIBRARY_PATH`, the system cache, `/lib`, `/usr/lib`); a name with a
  slash is a path. On macOS, system libraries live in the dyld shared cache and
  are named by their install path; a bare file name is searched in
  `DYLD_LIBRARY_PATH` and the fallback paths.
- **Static when unused.** A program without library declarations is the same
  static, libc-free executable as before (Linux) or keeps the kernel startup
  (Intel macOS); only a program that declares a library function is linked
  dynamically. Apple Silicon output always uses dyld and libSystem.
- **The C library's state.** The loader initializes libc (thread-local storage,
  `environ`, locale data) before the program starts, and Nona's runtime does
  not change the thread pointer, so libc functions see their own state. The
  runtime starts its own threads (agents, `Worker`) with `clone` without
  thread-local storage of their own: call library functions from the main
  thread. Nona exits through the kernel, not `exit()`, so flush C `stdio`
  buffers yourself (`fflush(NULL)`) if a library wrote through them.
  Library functions that install signal handlers may interfere with
  `process.on('SIGINT')`.
- **`lastError()`** reads `errno` through `__errno_location` (glibc) or
  `__error` (Darwin) immediately after the call, before any other library call
  changes it.
- Inspect the result with `readelf -d -l` (`NEEDED`, `BIND_NOW`, `INTERP`) or
  `otool -L` / `dyld_info -bind` on macOS.

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
import {
    SystemParametersInfoW,
    SPI_SETDESKWALLPAPER,
    SPIF_UPDATEINIFILE,
    SPIF_SENDCHANGE,
} from "nona:win32";
SystemParametersInfoW(
    SPI_SETDESKWALLPAPER,
    0,
    "C:\\Pictures\\painting.jpg",
    SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
);
```

`nona:win32` declares DLLs, so importing it requires a Windows target.
