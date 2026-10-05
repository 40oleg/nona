# Funciones nativas (FFI)

::: info Traducción
Esta página es una traducción de la página en inglés [Native functions (FFI)](/reference/ffi), generada a partir de [`docs/ffi.md`](https://github.com/40oleg/nona/blob/main/docs/ffi.md). La versión en inglés es la de referencia y puede ser más reciente.
:::

Los programas de Windows pueden llamar a funciones exportadas de cualquier DLL mediante el módulo integrado `nona:ffi`. Las declaraciones se resuelven en tiempo de compilación: cada llamada a `define` añade una entrada a la tabla de importaciones PE, así que el programa no usa `LoadLibrary`/`GetProcAddress`.

```js
import { define, lastError } from 'nona:ffi';

const MessageBoxW = define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)');
MessageBoxW(null, 'Hello from Nona', 'Nona', 0);
```

- FFI está disponible en código de módulo (`.mjs` o `--module`). `define` debe llamarse directamente, con tres literales de cadena: el nombre de la DLL, el nombre de la exportación y la firma. Cualquier otra cosa es un error de compilación (`E_FFI_STATIC`).
- Las declaraciones de DLL se rechazan con `--target linux-x64` (`E_FFI_TARGET`).
- En Linux, `define('syscall', '<number>', signature)` declara una llamada al sistema directa (como máximo seis argumentos enteros o `buf`; el resultado es el valor devuelto tal cual por el kernel, `errno` negativo en caso de fallo). Las declaraciones de llamadas al sistema se rechazan para `win32-x64`.
- `lastError()` devuelve `GetLastError()` capturado justo después de la última llamada FFI.
- Si falta una DLL o una exportación, el cargador de Windows se niega a iniciar el programa.

## Firmas {#signatures}

`result(param, param, ...)`, por ejemplo `bool(u32,u32,wstr,u32)`.

| Tipo | Parámetro | Resultado |
| --- | --- | --- |
| `i8 i16 i32 i64 u8 u16 u32 u64` | Number (truncado hacia cero) o Boolean | Number |
| `ptr` | Number, Boolean, `null`/`undefined` (NULL) | Number |
| `bool` | como `i32` | Boolean (`BOOL` de Win32, distinto de cero es `true`) |
| `f32 f64` | Number | Number |
| `wstr` | String → copia temporal UTF-16 terminada en NUL; `null`/`undefined` → NULL | — |
| `str` | String → copia temporal UTF-8 terminada en NUL; `null`/`undefined` → NULL | — |
| `buf` | ArrayBuffer, SharedArrayBuffer, typed array o DataView → puntero a sus bytes (en el desplazamiento de la vista); `null`/`undefined` → NULL | — |
| `void` | — | `undefined` |

Los argumentos de otros tipos lanzan `TypeError`; también los argumentos que faltan (salvo en los tipos puntero, donde `undefined` significa NULL) y los búferes desvinculados. La función llamada puede escribir en la memoria `buf`, que es la forma de devolver parámetros de salida: pasa un `Uint16Array` para un búfer de cadena UTF-16 o un `Uint8Array(8)` para un handle. Las copias temporales de cadenas se liberan tras la llamada; la función llamada no debe conservar el puntero. Los callbacks (`cb(...)`) y los tipos de parámetro de salida quedan reservados para una versión posterior.

## `nona:win32` {#nona-win32}

Un conjunto seleccionado de declaraciones y funciones auxiliares construido sobre `nona:ffi`:

- user32: `MessageBoxW`, `GetSystemMetrics`, `SystemParametersInfoW` (parámetro de cadena), `SystemParametersInfoBufferW` (parámetro de búfer);
- kernel32: `CreateMutexW`, `ReleaseMutex`, `CloseHandle`, `GetModuleFileNameW`, `GetCurrentProcessId`;
- advapi32: `RegCreateKeyExW`, `RegOpenKeyExW`, `RegSetValueExW`, `RegQueryValueExW`, `RegDeleteValueW`, `RegDeleteKeyW`, `RegCloseKey`;
- constantes como `HKEY_CURRENT_USER`, `KEY_ALL_ACCESS`, `REG_SZ`, `SPI_SETDESKWALLPAPER`, `SPIF_UPDATEINIFILE`, `ERROR_ALREADY_EXISTS`;
- las funciones auxiliares `wideString(text)` (`Uint16Array` terminado en NUL), `fromWideString(buffer)` y `readHandle(buffer)`; `lastError` se reexporta.

```js
import { SystemParametersInfoW, SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE } from 'nona:win32';
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, 'C:\\Pictures\\painting.jpg', SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
```


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
