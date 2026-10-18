# Funciones nativas (FFI)

::: info Traducción
Esta página es una traducción de la página en inglés [Native functions (FFI)](/reference/ffi), generada a partir de [`docs/ffi.md`](https://github.com/40oleg/nona/blob/main/docs/ffi.md). La versión en inglés es la de referencia y puede ser más reciente.
:::

Los programas pueden llamar a funciones exportadas de bibliotecas compartidas mediante el módulo integrado `nona:ffi`: DLL en Windows, objetos compartidos (`.so`) en Linux y dylibs o frameworks en macOS. Las declaraciones se resuelven en tiempo de compilación: cada llamada a `define` añade una entrada a la tabla de importación del ejecutable (la tabla de importación PE, la sección dinámica ELF o la tabla de enlaces Mach-O), de modo que el programa no usa `LoadLibrary`/`GetProcAddress` ni `dlopen`/`dlsym`, y el cargador del sistema operativo resuelve todos los símbolos antes de que el programa arranque.

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

- FFI está disponible en código de módulo (`.mjs` o `--module`). `define` debe llamarse directamente, con tres literales: la biblioteca, el nombre del símbolo y la firma. Cualquier otra cosa es un error de compilación (`E_FFI_STATIC`).
- La biblioteca es un literal de cadena o una **declaración portable**: un literal de objeto de literales de cadena con claves por sistema operativo (`win32`, `linux`, `darwin`). El compilador selecciona la clave del destino; un destino sin clave es un error de compilación (`E_FFI_TARGET`). Las declaraciones siguen siendo estáticas en ambos casos: no se lee ninguna clave en tiempo de ejecución.
- `lastError()` devuelve el código de error capturado justo después de la última llamada FFI: `GetLastError()` en Windows, `errno` en Linux y macOS. Como el propio `errno`, tiene sentido tras una llamada que informó de un fallo; una llamada con éxito puede dejar un valor anterior.
- En Linux, Darwin y BSD, `define('syscall', '<number>', signature)` declara una llamada al sistema directa (como máximo seis argumentos enteros o `buf`; el resultado es el valor devuelto tal cual por el kernel, `errno` negativo en caso de fallo). Las declaraciones de llamadas al sistema se rechazan para los destinos Windows. Los números pertenecen al kernel y la CPU elegidos; Darwin usa el número BSD sin el prefijo de clase `0x2000000`. Los errores por acarreo de BSD/Darwin se normalizan a `errno` negativo. Una llamada al sistema no actualiza `lastError()`; examina su resultado.
- Si falta una biblioteca o un símbolo, el cargador del sistema operativo se niega a iniciar el programa (Windows informa de la DLL que falta; `ld.so` imprime `symbol lookup error` y termina con estado 127; dyld informa del símbolo que falta).

| Destino                  | Argumento de biblioteca                                                                                                                          | Mecanismo                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| win32-x64, win32-arm64   | nombre de DLL sin ruta (`kernel32.dll`, `ucrtbase.dll`)                                                                                          | tabla de importación PE                                                                                              |
| linux-x64, linux-arm64   | soname o ruta (`libc.so.6`, `libm.so.6`, `libsqlite3.so.0`, `/opt/lib/libfoo.so`)                                                                | ELF enlazado dinámicamente: `PT_INTERP`, `DT_NEEDED`, reubicaciones `GLOB_DAT` resueltas al arrancar (`DT_BIND_NOW`) |
| darwin-x64, darwin-arm64 | ruta de dylib o binario de framework (`/usr/lib/libSystem.B.dylib`, `/usr/lib/libsqlite3.dylib`, `/System/Library/Frameworks/Foo.framework/Foo`) | dyld: un `LC_LOAD_DYLIB` por biblioteca, un enlace por símbolo                                                       |
| freebsd-x64, openbsd-x64 | —                                                                                                                                                | solo llamadas al sistema; una declaración de biblioteca es `E_FFI_TARGET`                                            |

Un nombre de DLL de Windows en un destino Linux o macOS, o un nombre `.so`/`.dylib` en Windows, también es `E_FFI_TARGET`: usa una declaración portable.

## Firmas {#signatures}

`result(param, param, ...)`, por ejemplo `bool(u32,u32,wstr,u32)`.

| Tipo                            | Parámetro                                                                                                                                  | Resultado                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `i8 i16 i32 i64 u8 u16 u32 u64` | Number (truncado hacia cero) o Boolean                                                                                                     | Number                                                |
| `ptr`                           | Number, Boolean, `null`/`undefined` (NULL)                                                                                                 | Number                                                |
| `bool`                          | como `i32`                                                                                                                                 | Boolean (`BOOL` de Win32, distinto de cero es `true`) |
| `f32 f64`                       | Number                                                                                                                                     | Number                                                |
| `wstr`                          | String → copia temporal UTF-16 terminada en NUL; `null`/`undefined` → NULL                                                                 | —                                                     |
| `str`                           | String → copia temporal UTF-8 terminada en NUL; `null`/`undefined` → NULL                                                                  | —                                                     |
| `buf`                           | ArrayBuffer, SharedArrayBuffer, typed array o DataView → puntero a sus bytes (en el desplazamiento de la vista); `null`/`undefined` → NULL | —                                                     |
| `void`                          | —                                                                                                                                          | `undefined`                                           |

Los argumentos de otros tipos lanzan `TypeError`; también los argumentos que faltan (salvo en los tipos puntero, donde `undefined` significa NULL) y los búferes desvinculados. La función llamada puede escribir en la memoria `buf`, que es la forma de devolver parámetros de salida: pasa un `Uint16Array` para un búfer de cadena UTF-16 o un `Uint8Array(8)` para un handle. Las copias temporales de cadenas se liberan tras la llamada; la función llamada no debe conservar el puntero. Los callbacks (`cb(...)`) y los tipos de parámetro de salida quedan reservados para una versión posterior. Una función acepta como máximo 32 parámetros.

`bool` es un entero de 32 bits (`BOOL`, `int`). Para un resultado C `_Bool`/`bool`, cuyos bits superiores no están definidos, declara `u8` y compara con `0`.

## Linux y macOS

- **Convenciones de llamada.** linux-x64 y darwin-x64 usan la ABI SysV AMD64 (argumentos enteros en RDI, RSI, RDX, RCX, R8, R9, argumentos de coma flotante en XMM0–XMM7, el resto en la pila; `AL` contiene el número de registros vectoriales, por lo que las funciones variádicas como `snprintf` reciben correctamente argumentos `int` y `double` en x86-64). linux-arm64 usa AAPCS64 (X0–X7, D0–D7, después la pila con 8 bytes por argumento); darwin-arm64 usa la variante de Apple, donde los argumentos de pila se empaquetan por su tamaño y alineación naturales y el llamador extiende los argumentos `i8`/`i16`/`u8`/`u16`. Nona extiende los argumentos enteros estrechos en todos los destinos POSIX. Las funciones variádicas no se admiten en ARM64 (Apple pasa los argumentos variádicos por la pila): declara solo los parámetros fijos y evita allí las llamadas variádicas.
- **Bibliotecas.** Los ejecutables de Linux nombran el cargador de la biblioteca C de GNU (`/lib64/ld-linux-x86-64.so.2`, `/lib/ld-linux-aarch64.so.1`) y siempre necesitan `libc.so.6` (para `errno`); no se ejecutan en sistemas con musl como Alpine. Un soname (`libm.so.6`) se busca como la dependencia de cualquier programa (`LD_LIBRARY_PATH`, la caché del sistema, `/lib`, `/usr/lib`); un nombre con barra es una ruta. En macOS, las bibliotecas del sistema viven en la caché compartida de dyld y se nombran por su ruta de instalación; un nombre de archivo simple se busca en `DYLD_LIBRARY_PATH` y en las rutas de reserva.
- **Estático cuando no se usa.** Un programa sin declaraciones de biblioteca es el mismo ejecutable estático sin libc que antes (Linux) o conserva el arranque del kernel (macOS Intel); solo un programa que declara una función de biblioteca se enlaza dinámicamente. La salida para Apple Silicon siempre usa dyld y libSystem.
- **El estado de la biblioteca C.** El cargador inicializa libc (almacenamiento local del hilo, `environ`, datos de configuración regional) antes de que el programa arranque, y el runtime de Nona no cambia el puntero de hilo, así que las funciones de libc ven su propio estado. El runtime crea sus propios hilos (agentes, `Worker`) con `clone` sin almacenamiento local propio: llama a las funciones de biblioteca desde el hilo principal. Nona termina a través del kernel, no de `exit()`, así que vacía tú mismo los búferes de `stdio` de C (`fflush(NULL)`) si una biblioteca escribió a través de ellos. Las funciones de biblioteca que instalan manejadores de señales pueden interferir con `process.on('SIGINT')`.
- **`lastError()`** lee `errno` mediante `__errno_location` (glibc) o `__error` (Darwin) justo después de la llamada, antes de que otra llamada a la biblioteca lo cambie.
- Examina el resultado con `readelf -d -l` (`NEEDED`, `BIND_NOW`, `INTERP`) o con `otool -L` / `dyld_info -bind` en macOS.

## `nona:win32` {#nona-win32}

Un conjunto seleccionado de declaraciones y funciones auxiliares construido sobre `nona:ffi`:

- user32: `MessageBoxW`, `GetSystemMetrics`, `SystemParametersInfoW` (parámetro de cadena), `SystemParametersInfoBufferW` (parámetro de búfer);
- kernel32: `CreateMutexW`, `ReleaseMutex`, `CloseHandle`, `GetModuleFileNameW`, `GetCurrentProcessId`;
- advapi32: `RegCreateKeyExW`, `RegOpenKeyExW`, `RegSetValueExW`, `RegQueryValueExW`, `RegDeleteValueW`, `RegDeleteKeyW`, `RegCloseKey`;
- constantes como `HKEY_CURRENT_USER`, `KEY_ALL_ACCESS`, `REG_SZ`, `SPI_SETDESKWALLPAPER`, `SPIF_UPDATEINIFILE`, `ERROR_ALREADY_EXISTS`;
- las funciones auxiliares `wideString(text)` (`Uint16Array` terminado en NUL), `fromWideString(buffer)` y `readHandle(buffer)`; `lastError` se reexporta.

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

`nona:win32` declara DLL, por lo que importarlo requiere un destino Windows.
