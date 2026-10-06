# Módulos integrados y globales

Los programas de Nona se ejecutan sin Node.js. Las APIs del host que se describen a continuación forman parte del compilador: el runtime nativo y pequeños preludios de JavaScript se compilan en cada ejecutable, y los módulos integrados se compilan cuando un programa los importa.

## Resumen

| API | Tipo | Destinos | Referencia |
| --- | --- | --- | --- |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask`, `performance.now()` | globales | ambos | [Temporizadores y bucle de eventos](/es/reference/host-apis) |
| `process` | global | all eight native targets | [process](/es/reference/process) |
| `TextEncoder`, `TextDecoder` | globales | ambos | [Sistema de archivos y codificación de texto](/es/reference/fs#textencoder-and-textdecoder) |
| `console.log` | global | ambos | escribe UTF-8 en la salida estándar |
| `nona:process`, `node:process` | módulos | all eight native targets | [process](/es/reference/process) |
| `nona:fs`, `node:fs` | módulos | ambos | [Sistema de archivos y codificación de texto](/es/reference/fs) |
| `node:async_hooks`, `nona:async_hooks` | modules | all native targets | Manual async resources, hooks and local context storage; native resource hooks and GC destruction are not emitted. |
| `node:events`, `events`, `nona:events` | modules | all native targets | [EventEmitter and asynchronous event helpers](/es/reference/host-apis#events) |
| `node:path`, `path`, `node:path/posix`, `node:path/win32` | modules | all eight | [Paths](/es/reference/host-apis#paths-nodepath) |
| `nona:ffi` | módulo | Windows (DLL), Linux (llamadas al sistema) | [Funciones nativas (FFI)](/es/reference/ffi) |
| `nona:win32` | módulo | Windows | más abajo y en [FFI](/es/reference/ffi#nona-win32) |

## Reglas

- Los globales están disponibles en scripts y módulos.
- Los módulos integrados se pueden importar desde código de módulo (`.mjs` o `--module`) y con `import()` literal desde scripts. Las declaraciones FFI (`define`) deben estar en código de módulo.
- Supported Node modules: `node:fs`, `node:process`, `node:path` (`path` alias), `node:events` (`events`/`nona:events` aliases), `node:async_hooks` (`nona:async_hooks` alias), and `node:buffer` (`buffer`/`nona:buffer` aliases). Global `Buffer`, `Blob` and `File` are available. CommonJS `require` is not available.
- `nona:win32` y las declaraciones de DLL solo compilan para `win32-x64`; las declaraciones de llamadas al sistema, solo para `linux-x64`.

## `nona:win32` {#nona-win32}

Declaraciones listas para usar construidas sobre [`nona:ffi`](/es/reference/ffi). Cada función es un thunk nativo: los argumentos se convierten como se describe para los [tipos de firma](/es/reference/ffi#signatures).

### user32

| Exportación | Firma |
| --- | --- |
| `MessageBoxW` | `i32(ptr hwnd, wstr text, wstr caption, u32 type)` |
| `GetSystemMetrics` | `i32(i32 index)` |
| `SystemParametersInfoW` | `bool(u32 action, u32 param, wstr value, u32 flags)`: para parámetros de cadena como `SPI_SETDESKWALLPAPER` |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)`: para parámetros de búfer como `SPI_GETDESKWALLPAPER` |

### kernel32

| Exportación | Firma |
| --- | --- |
| `CreateMutexW` | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex` | `bool(ptr mutex)` |
| `CloseHandle` | `bool(ptr handle)` |
| `GetModuleFileNameW` | `u32(ptr module, buf path, u32 size)` |
| `GetCurrentProcessId` | `u32()` |

### advapi32

| Exportación | Firma |
| --- | --- |
| `RegCreateKeyExW` | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW` | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)` |
| `RegSetValueExW` | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)` |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)` |
| `RegDeleteValueW` | `i32(ptr key, wstr name)` |
| `RegDeleteKeyW` | `i32(ptr key, wstr subKey)` |
| `RegCloseKey` | `i32(ptr key)` |

### Constantes

| Exportación | Valor |
| --- | --- |
| `HKEY_CLASSES_ROOT`, `HKEY_CURRENT_USER`, `HKEY_LOCAL_MACHINE` | claves predefinidas del registro (como handles con extensión de signo) |
| `KEY_READ`, `KEY_WRITE`, `KEY_ALL_ACCESS` | `0x20019`, `0x20006`, `0xF003F` |
| `REG_SZ`, `REG_DWORD` | `1`, `4` |
| `ERROR_SUCCESS`, `ERROR_FILE_NOT_FOUND`, `ERROR_ALREADY_EXISTS` | `0`, `2`, `183` |
| `SPI_GETDESKWALLPAPER`, `SPI_SETDESKWALLPAPER` | `0x73`, `0x14` |
| `SPIF_UPDATEINIFILE`, `SPIF_SENDCHANGE` | `1`, `2` |
| `MB_OK`, `MB_ICONERROR`, `MB_ICONINFORMATION` | `0`, `0x10`, `0x40` |
| `MAX_PATH` | `260` |

### Funciones auxiliares

| Exportación | Descripción |
| --- | --- |
| `lastError()` | `GetLastError()` capturado justo después de la última llamada FFI (reexportado desde `nona:ffi`). |
| `wideString(text)` | Un `Uint16Array` terminado en NUL para parámetros `buf` que esperan una cadena UTF-16. |
| `fromWideString(buffer)` | Decodifica un búfer UTF-16 terminado en NUL. |
| `readHandle(buffer)` | Lee un handle (por ejemplo, un `HKEY`) que una función escribió en un búfer de 8 bytes. |

Para las funciones que no aparecen en la lista, decláralas tú mismo con `define` de [`nona:ffi`](/es/reference/ffi).


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.

`node:events` is also supported. It provides EventEmitter and asynchronous event helpers; see the linked host API reference for supported operations and limitations. Blob piping uses its AbortController signals and protects cancellation against stopped event propagation.

## `node:buffer`, `buffer`, `nona:buffer`

The aliases export the global `Buffer`, `Blob` and `File` constructors, byte validators, base64 helpers, transcoding, inspection settings and constants. Blob byte/text streams, BYOB readers and object URL registration/resolution are available. General URL parsing and arbitrary Web Stream construction remain separate dependency APIs. See [binary data](/reference/host-apis#buffer-and-binary-data) and the [runnable sample](https://github.com/40oleg/nona/blob/main/site/samples/buffer.mjs).
