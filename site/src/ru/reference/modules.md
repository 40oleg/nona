# Встроенные модули и глобальные объекты

Программы Nona работают без Node.js. Перечисленные ниже API хоста — часть компилятора: нативный runtime и небольшие JavaScript-прелюдии компилируются в каждый исполняемый файл, а встроенные модули — когда программа их импортирует.

## Обзор

| API | Вид | Цели | Справка |
| --- | --- | --- | --- |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask`, `performance.now()` | глобальные | обе | [Таймеры и цикл событий](/ru/reference/host-apis) |
| `process` | глобальный | all eight native targets | [process](/ru/reference/process) |
| `TextEncoder`, `TextDecoder` | глобальные | обе | [Файловая система и кодировка текста](/ru/reference/fs#textencoder-and-textdecoder) |
| `console.log` | глобальный | обе | пишет UTF-8 в стандартный вывод |
| `nona:process`, `node:process` | модули | all eight native targets | [process](/ru/reference/process) |
| `nona:fs`, `node:fs` | модули | обе | [Файловая система и кодировка текста](/ru/reference/fs) |
| `node:async_hooks`, `nona:async_hooks` | modules | all native targets | Manual async resources, hooks and local context storage; native resource hooks and GC destruction are not emitted. |
| `node:events`, `events`, `nona:events` | modules | all native targets | [EventEmitter and asynchronous event helpers](/ru/reference/host-apis#events) |
| `node:path`, `path`, `node:path/posix`, `node:path/win32` | modules | all eight | [Paths](/ru/reference/host-apis#paths-nodepath) |
| `nona:ffi` | модуль | Windows (DLL), Linux (системные вызовы) | [Нативные функции (FFI)](/ru/reference/ffi) |
| `nona:win32` | модуль | Windows | ниже и в [FFI](/ru/reference/ffi#nona-win32) |

## Правила

- Глобальные объекты доступны в скриптах и модулях.
- Встроенные модули можно импортировать из кода модулей (`.mjs` или `--module`) и литеральным `import()` из скриптов. Объявления FFI (`define`) должны находиться в коде модуля.
- Supported Node modules: `node:fs`, `node:process`, `node:path` (`path` alias), `node:events` (`events`/`nona:events` aliases), `node:async_hooks` (`nona:async_hooks` alias), and `node:buffer` (`buffer`/`nona:buffer` aliases). Global `Buffer`, `Blob` and `File` are available. CommonJS `require` is not available.
- `nona:win32` и объявления DLL компилируются только для `win32-x64`; объявления системных вызовов — только для `linux-x64`.

## `nona:win32` {#nona-win32}

Готовые объявления на основе [`nona:ffi`](/ru/reference/ffi). Каждая функция — нативный переходник: аргументы преобразуются так, как описано для [типов сигнатур](/ru/reference/ffi#signatures).

### user32

| Экспорт | Сигнатура |
| --- | --- |
| `MessageBoxW` | `i32(ptr hwnd, wstr text, wstr caption, u32 type)` |
| `GetSystemMetrics` | `i32(i32 index)` |
| `SystemParametersInfoW` | `bool(u32 action, u32 param, wstr value, u32 flags)` — для строковых параметров, например `SPI_SETDESKWALLPAPER` |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)` — для параметров-буферов, например `SPI_GETDESKWALLPAPER` |

### kernel32

| Экспорт | Сигнатура |
| --- | --- |
| `CreateMutexW` | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex` | `bool(ptr mutex)` |
| `CloseHandle` | `bool(ptr handle)` |
| `GetModuleFileNameW` | `u32(ptr module, buf path, u32 size)` |
| `GetCurrentProcessId` | `u32()` |

### advapi32

| Экспорт | Сигнатура |
| --- | --- |
| `RegCreateKeyExW` | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW` | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)` |
| `RegSetValueExW` | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)` |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)` |
| `RegDeleteValueW` | `i32(ptr key, wstr name)` |
| `RegDeleteKeyW` | `i32(ptr key, wstr subKey)` |
| `RegCloseKey` | `i32(ptr key)` |

### Константы

| Экспорт | Значение |
| --- | --- |
| `HKEY_CLASSES_ROOT`, `HKEY_CURRENT_USER`, `HKEY_LOCAL_MACHINE` | предопределённые ключи реестра (как дескрипторы с расширением знака) |
| `KEY_READ`, `KEY_WRITE`, `KEY_ALL_ACCESS` | `0x20019`, `0x20006`, `0xF003F` |
| `REG_SZ`, `REG_DWORD` | `1`, `4` |
| `ERROR_SUCCESS`, `ERROR_FILE_NOT_FOUND`, `ERROR_ALREADY_EXISTS` | `0`, `2`, `183` |
| `SPI_GETDESKWALLPAPER`, `SPI_SETDESKWALLPAPER` | `0x73`, `0x14` |
| `SPIF_UPDATEINIFILE`, `SPIF_SENDCHANGE` | `1`, `2` |
| `MB_OK`, `MB_ICONERROR`, `MB_ICONINFORMATION` | `0`, `0x10`, `0x40` |
| `MAX_PATH` | `260` |

### Вспомогательные функции

| Экспорт | Описание |
| --- | --- |
| `lastError()` | `GetLastError()`, сохранённый сразу после последнего вызова FFI (реэкспорт из `nona:ffi`). |
| `wideString(text)` | `Uint16Array` с завершающим NUL для параметров `buf`, которые ожидают строку UTF-16. |
| `fromWideString(buffer)` | Декодирует буфер UTF-16 с завершающим NUL. |
| `readHandle(buffer)` | Читает дескриптор (например, `HKEY`), который функция записала в 8-байтовый буфер. |

Функции, которых нет в списке, объявите сами с помощью `define` из [`nona:ffi`](/ru/reference/ffi).


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.

`node:events` is also supported. It provides EventEmitter and asynchronous event helpers; see the linked host API reference for supported operations and limitations. Blob piping uses its AbortController signals and protects cancellation against stopped event propagation.

## `node:buffer`, `buffer`, `nona:buffer`

The aliases export the global `Buffer`, `Blob` and `File` constructors, byte validators, base64 helpers, transcoding, inspection settings and constants. Blob byte/text streams, BYOB readers and object URL registration/resolution are available. General URL parsing and arbitrary Web Stream construction remain separate dependency APIs. See [binary data](/reference/host-apis#buffer-and-binary-data) and the [runnable sample](https://github.com/40oleg/nona/blob/main/site/samples/buffer.mjs).
