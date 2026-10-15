# Módulos integrados y globales

Los programas de Nona se ejecutan sin Node.js. Las APIs del host que se describen a continuación forman parte del compilador: el runtime nativo y pequeños preludios de JavaScript se compilan en cada ejecutable, y los módulos integrados se compilan cuando un programa los importa.

## Resumen

| API                                                                                                                                                                                                                                                                             | Tipo               | Destinos                                      | Referencia                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `setImmediate`/`clearImmediate`, `queueMicrotask`, `performance.now()`                                                                                                                                            | globales           | los ocho destinos nativos                     | [Temporizadores y bucle de eventos](/es/reference/host-apis)                                                       |
| `process`                                                                                                                                                                                                                                                                       | global             | los ocho destinos nativos                     | [process](/es/reference/process)                                                                                   |
| `TextEncoder`, `TextDecoder`                                                                                                                                                                                                                                                    | globales           | los ocho                                      | [Sistema de archivos y codificación de texto](/es/reference/fs#textencoder-and-textdecoder)                        |
| `console.log`                                                                                                                                                                                                                                                                   | global             | los ocho                                      | escribe UTF-8 en la salida estándar                                                                                |
| `console.error`, `console.warn`                                                                                                                                                                                                                                                 | global             | los ocho                                      | escribe UTF-8 en la salida de error estándar (`console.info`, `console.debug`: salida estándar)                    |
| `nona:process`, `node:process`                                                                                                                                                                                                                                                  | módulos            | los ocho destinos nativos                     | [process](/es/reference/process)                                                                                   |
| `node:stream`, `stream`, `nona:stream`, `node:stream/promises`, `node:stream/consumers`                                                                                                                                                                                         | módulos            | los ocho destinos nativos                     | [Streams and standard I/O](/es/reference/process)                                                                  |
| `nona:fs`, `node:fs`, `node:fs/promises`                                                                                                                                                                                                                                        | módulos            | los ocho                                      | [Sistema de archivos y codificación de texto](/es/reference/fs)                                                    |
| `node:async_hooks`, `nona:async_hooks`                                                                                                                                                                                                                                          | módulos            | los ocho                                      | Manual async resources, hooks and local context storage; native resource hooks and GC destruction are not emitted. |
| `node:events`, `events`, `nona:events`                                                                                                                                                                                                                                          | módulos            | los ocho                                      | [EventEmitter and asynchronous event helpers](/es/reference/host-apis#events)                                      |
| `node:path`, `path`, `node:path/posix`, `node:path/win32`                                                                                                                                                                                                                       | módulos            | los ocho                                      | [Paths](/es/reference/host-apis#paths-nodepath)                                                                    |
| `nona:http`, `node:http`, `nona:net`, `node:net`, `node:string_decoder`                                                                                                                                                                                                         | módulos            | Windows, Linux                                | [Red (en inglés)](/reference/network)                                                                              |
| `URL`, `URLSearchParams`, `node:url`, `url`                                                                                                                                                                                                                                     | globales y módulo  | los ocho                                      | [URL](/es/reference/host-apis#url)                                                                                 |
| `node:os`, `node:tty`, `node:util`, `node:util/types`, `node:assert`, `node:assert/strict`, `node:crypto`, `node:querystring`, `node:timers`, `node:timers/promises`, `node:perf_hooks`, `node:module`, `node:worker_threads`, `node:child_process` (y sus nombres sin prefijo) | módulos            | los ocho                                      | [Módulos de apoyo de Node.js](/es/reference/host-apis#nodejs-support-modules)                                      |
| `node:buffer`, `buffer`, `nona:buffer`, `Buffer`, `Blob`, `File`                                                                                                                                                                                                                | globales y módulos | los ocho                                      | [Buffer y datos binarios](/reference/host-apis#buffer-and-binary-data)                                             |
| `nona:ffi`                                                                                                                                                                                                                                                                      | módulo             | Windows (DLL), los ocho (llamadas al sistema) | [Funciones nativas (FFI)](/es/reference/ffi)                                                                       |
| `nona:win32`                                                                                                                                                                                                                                                                    | módulo             | Windows                                       | más abajo y en [FFI](/es/reference/ffi#nona-win32)                                                                 |

## Reglas

- Los globales están disponibles en scripts y módulos.
- Los módulos integrados se pueden importar desde código de módulo (`.mjs` o `--module`), cargar con `require` desde módulos CommonJS (`require('fs')`, `require('node:fs')`) y cargar con `import()` literal desde scripts. Las declaraciones FFI (`define`) deben estar en código de módulo.
- Módulos de Node compatibles: `node:fs`, `node:fs/promises`, `node:process`, `node:path` (alias `path`), `node:events` (alias `events`/`nona:events`), `node:async_hooks` (alias `nona:async_hooks`), y `node:stream`, `node:stream/promises`, `node:stream/consumers`, `node:buffer` (alias `buffer`/`nona:buffer`). Están disponibles los globales `Buffer`, `Blob`, `File`, `URL`, `URLSearchParams` y `crypto`. `node:http`, `node:net` y `node:string_decoder` están disponibles para redes, y `node:os`, `node:tty`, `node:util`, `node:url`, `node:assert`, `node:crypto`, `node:querystring`, `node:timers`, `node:perf_hooks`, `node:module`, `node:worker_threads` y `node:child_process` para los [paquetes npm](/reference/npm).
- `nona:win32` y las declaraciones de DLL solo compilan para `win32-x64`; las declaraciones de llamadas al sistema, solo para `linux-x64`.

## `nona:win32` {#nona-win32}

Declaraciones listas para usar construidas sobre [`nona:ffi`](/es/reference/ffi). Cada función es un thunk nativo: los argumentos se convierten como se describe para los [tipos de firma](/es/reference/ffi#signatures).

### user32

| Exportación                   | Firma                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `MessageBoxW`                 | `i32(ptr hwnd, wstr text, wstr caption, u32 type)`                                                          |
| `GetSystemMetrics`            | `i32(i32 index)`                                                                                            |
| `SystemParametersInfoW`       | `bool(u32 action, u32 param, wstr value, u32 flags)`: para parámetros de cadena como `SPI_SETDESKWALLPAPER` |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)`: para parámetros de búfer como `SPI_GETDESKWALLPAPER`   |

### kernel32

| Exportación           | Firma                                               |
| --------------------- | --------------------------------------------------- |
| `CreateMutexW`        | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex`        | `bool(ptr mutex)`                                   |
| `CloseHandle`         | `bool(ptr handle)`                                  |
| `GetModuleFileNameW`  | `u32(ptr module, buf path, u32 size)`               |
| `GetCurrentProcessId` | `u32()`                                             |

### advapi32

| Exportación        | Firma                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `RegCreateKeyExW`  | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW`    | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)`                                                         |
| `RegSetValueExW`   | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)`                                                    |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)`                                                    |
| `RegDeleteValueW`  | `i32(ptr key, wstr name)`                                                                                                |
| `RegDeleteKeyW`    | `i32(ptr key, wstr subKey)`                                                                                              |
| `RegCloseKey`      | `i32(ptr key)`                                                                                                           |

### Constantes

| Exportación                                                     | Valor                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `HKEY_CLASSES_ROOT`, `HKEY_CURRENT_USER`, `HKEY_LOCAL_MACHINE`  | claves predefinidas del registro (como handles con extensión de signo) |
| `KEY_READ`, `KEY_WRITE`, `KEY_ALL_ACCESS`                       | `0x20019`, `0x20006`, `0xF003F`                                        |
| `REG_SZ`, `REG_DWORD`                                           | `1`, `4`                                                               |
| `ERROR_SUCCESS`, `ERROR_FILE_NOT_FOUND`, `ERROR_ALREADY_EXISTS` | `0`, `2`, `183`                                                        |
| `SPI_GETDESKWALLPAPER`, `SPI_SETDESKWALLPAPER`                  | `0x73`, `0x14`                                                         |
| `SPIF_UPDATEINIFILE`, `SPIF_SENDCHANGE`                         | `1`, `2`                                                               |
| `MB_OK`, `MB_ICONERROR`, `MB_ICONINFORMATION`                   | `0`, `0x10`, `0x40`                                                    |
| `MAX_PATH`                                                      | `260`                                                                  |

### Funciones auxiliares

| Exportación              | Descripción                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `lastError()`            | `GetLastError()` capturado justo después de la última llamada FFI (reexportado desde `nona:ffi`). |
| `wideString(text)`       | Un `Uint16Array` terminado en NUL para parámetros `buf` que esperan una cadena UTF-16.            |
| `fromWideString(buffer)` | Decodifica un búfer UTF-16 terminado en NUL.                                                      |
| `readHandle(buffer)`     | Lee un handle (por ejemplo, un `HKEY`) que una función escribió en un búfer de 8 bytes.           |

Para las funciones que no aparecen en la lista, decláralas tú mismo con `define` de [`nona:ffi`](/es/reference/ffi).

## `node:buffer`, `buffer`, `nona:buffer`

Los alias exportan los constructores globales `Buffer`, `Blob` y `File`, validadores de bytes, utilidades de base64, transcodificación, ajustes de inspección y constantes. Están disponibles los flujos de bytes y de texto de Blob, los lectores BYOB y el registro de URL de objeto. El análisis general de URL lo realiza el [`URL`](/es/reference/host-apis#url) global; la construcción de Web Streams arbitrarios sigue siendo una API de dependencia aparte. Consulta [datos binarios (en inglés)](/reference/host-apis#buffer-and-binary-data) y el [ejemplo ejecutable](https://github.com/40oleg/nona/blob/main/site/samples/buffer.mjs).
