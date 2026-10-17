# Встроенные модули и глобальные объекты

Программы Nona работают без Node.js. Перечисленные ниже API хоста — часть компилятора: нативный runtime и небольшие JavaScript-прелюдии компилируются в каждый исполняемый файл, а встроенные модули — когда программа их импортирует.

## Обзор

| API                                                                                                                                                                                                                                                                                                                  | Вид                 | Цели                                                                                 | Справка                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `setImmediate`/`clearImmediate`, `queueMicrotask`, `performance.now()`                                                                                                                                                                                 | глобальные          | all eight native targets                                                             | [Таймеры и цикл событий](/ru/reference/host-apis)                                                                  |
| `process`                                                                                                                                                                                                                                                                                                            | глобальный          | all eight native targets                                                             | [process](/ru/reference/process)                                                                                   |
| `TextEncoder`, `TextDecoder`                                                                                                                                                                                                                                                                                         | глобальные          | обе                                                                                  | [Файловая система и кодировка текста](/ru/reference/fs#textencoder-and-textdecoder)                                |
| `console.log`                                                                                                                                                                                                                                                                                                        | глобальный          | обе                                                                                  | пишет UTF-8 в стандартный вывод                                                                                    |
| `console.error`, `console.warn`                                                                                                                                                                                                                                                                                      | глобальный          | обе                                                                                  | пишет UTF-8 в стандартный поток ошибок (`console.info`, `console.debug`: стандартный вывод)                        |
| `nona:process`, `node:process`                                                                                                                                                                                                                                                                                       | модули              | all eight native targets                                                             | [process](/ru/reference/process)                                                                                   |
| `node:stream`, `stream`, `nona:stream`, `node:stream/promises`, `node:stream/consumers`                                                                                                                                                                                                                              | modules             | all eight native targets                                                             | [Streams and standard I/O](/ru/reference/process)                                                                  |
| `node:zlib`, `zlib`, `nona:zlib`                                                                                                                                                                                                                                                                                     | modules             | all eight native targets                                                             | [zlib](/reference/host-apis#zlib)                                                                                  |
| `nona:fs`, `node:fs`, `node:fs/promises`                                                                                                                                                                                                                                                                             | модули              | обе                                                                                  | [Файловая система и кодировка текста](/ru/reference/fs)                                                            |
| `node:async_hooks`, `nona:async_hooks`                                                                                                                                                                                                                                                                               | modules             | all native targets                                                                   | Manual async resources, hooks and local context storage; native resource hooks and GC destruction are not emitted. |
| `node:events`, `events`, `nona:events`                                                                                                                                                                                                                                                                               | modules             | all native targets                                                                   | [EventEmitter and asynchronous event helpers](/ru/reference/host-apis#events)                                      |
| `node:path`, `path`, `node:path/posix`, `node:path/win32`                                                                                                                                                                                                                                                            | modules             | all eight                                                                            | [Paths](/ru/reference/host-apis#paths-nodepath)                                                                    |
| `nona:http`, `node:http`, `node:https`, `nona:net`, `node:net`                                                                                                                                                                                                                                                       | модули              | обе                                                                                  | [Сеть (англ.)](/reference/network)                                                                                 |
| `node:events`, `node:string_decoder`                                                                                                                                                                                                                                                                                 | модули              | обе                                                                                  | [Вспомогательные модули Node.js (англ.)](/reference/network#supporting-modules)                                    |
| `URL`, `URLSearchParams`, `node:url`, `url`                                                                                                                                                                                                                                                                          | глобальные и модуль | все восемь                                                                           | [URL](/ru/reference/host-apis#url)                                                                                 |
| `node:os`, `node:tty`, `node:util`, `node:util/types`, `node:assert`, `node:assert/strict`, `node:crypto`, `node:querystring`, `node:timers`, `node:timers/promises`, `node:perf_hooks`, `node:module`, `node:worker_threads`, `node:child_process`, `node:tls`, `node:http2`, `node:zlib` (и их имена без префикса) | модули              | все восемь                                                                           | [Вспомогательные модули Node.js](/ru/reference/host-apis#nodejs-support-modules)                                   |
| `nona:ffi`                                                                                                                                                                                                                                                                                                           | модуль              | Windows (DLL), Linux и macOS (разделяемые библиотеки), все восемь (системные вызовы) | [Нативные функции (FFI)](/ru/reference/ffi)                                                                        |
| `nona:win32`                                                                                                                                                                                                                                                                                                         | модуль              | Windows                                                                              | ниже и в [FFI](/ru/reference/ffi#nona-win32)                                                                       |

## Правила

- Глобальные объекты доступны в скриптах и модулях.
- Встроенные модули можно импортировать из кода модулей (`.mjs` или `--module`), подключать через `require` из модулей CommonJS (`require('fs')`, `require('node:fs')`) и загружать литеральным `import()` из скриптов. Объявления FFI (`define`) должны находиться в коде модуля.
- Поддерживаемые модули Node: `node:fs`, `node:process`, `node:path` (псевдоним `path`), `node:events` (псевдонимы `events`/`nona:events`), `node:async_hooks` (псевдоним `nona:async_hooks`), а также `node:stream`, `node:stream/promises`, `node:stream/consumers`, `node:zlib`, `node:buffer` (псевдонимы `buffer`/`nona:buffer`). Доступны глобальные `Buffer`, `Blob`, `File`, `URL`, `URLSearchParams` и `crypto`. Для работы с сетью доступны `node:http`, `node:net` и `node:string_decoder`, а для [пакетов npm](/reference/npm) — `node:os`, `node:tty`, `node:util`, `node:url`, `node:assert`, `node:crypto`, `node:querystring`, `node:timers`, `node:perf_hooks`, `node:module`, `node:worker_threads` и `node:child_process`, `node:https`, `node:tls`, `node:http2`.
- `nona:win32` и объявления DLL компилируются только для `win32-x64`; объявления системных вызовов — только для `linux-x64`.

## `nona:win32` {#nona-win32}

Готовые объявления на основе [`nona:ffi`](/ru/reference/ffi). Каждая функция — нативный переходник: аргументы преобразуются так, как описано для [типов сигнатур](/ru/reference/ffi#signatures).

### user32

| Экспорт                       | Сигнатура                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `MessageBoxW`                 | `i32(ptr hwnd, wstr text, wstr caption, u32 type)`                                                               |
| `GetSystemMetrics`            | `i32(i32 index)`                                                                                                 |
| `SystemParametersInfoW`       | `bool(u32 action, u32 param, wstr value, u32 flags)` — для строковых параметров, например `SPI_SETDESKWALLPAPER` |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)` — для параметров-буферов, например `SPI_GETDESKWALLPAPER`    |

### kernel32

| Экспорт               | Сигнатура                                           |
| --------------------- | --------------------------------------------------- |
| `CreateMutexW`        | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex`        | `bool(ptr mutex)`                                   |
| `CloseHandle`         | `bool(ptr handle)`                                  |
| `GetModuleFileNameW`  | `u32(ptr module, buf path, u32 size)`               |
| `GetCurrentProcessId` | `u32()`                                             |

### advapi32

| Экспорт            | Сигнатура                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `RegCreateKeyExW`  | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW`    | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)`                                                         |
| `RegSetValueExW`   | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)`                                                    |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)`                                                    |
| `RegDeleteValueW`  | `i32(ptr key, wstr name)`                                                                                                |
| `RegDeleteKeyW`    | `i32(ptr key, wstr subKey)`                                                                                              |
| `RegCloseKey`      | `i32(ptr key)`                                                                                                           |

### Константы

| Экспорт                                                         | Значение                                                             |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `HKEY_CLASSES_ROOT`, `HKEY_CURRENT_USER`, `HKEY_LOCAL_MACHINE`  | предопределённые ключи реестра (как дескрипторы с расширением знака) |
| `KEY_READ`, `KEY_WRITE`, `KEY_ALL_ACCESS`                       | `0x20019`, `0x20006`, `0xF003F`                                      |
| `REG_SZ`, `REG_DWORD`                                           | `1`, `4`                                                             |
| `ERROR_SUCCESS`, `ERROR_FILE_NOT_FOUND`, `ERROR_ALREADY_EXISTS` | `0`, `2`, `183`                                                      |
| `SPI_GETDESKWALLPAPER`, `SPI_SETDESKWALLPAPER`                  | `0x73`, `0x14`                                                       |
| `SPIF_UPDATEINIFILE`, `SPIF_SENDCHANGE`                         | `1`, `2`                                                             |
| `MB_OK`, `MB_ICONERROR`, `MB_ICONINFORMATION`                   | `0`, `0x10`, `0x40`                                                  |
| `MAX_PATH`                                                      | `260`                                                                |

### Вспомогательные функции

| Экспорт                  | Описание                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `lastError()`            | `GetLastError()` (Windows) или `errno` (Linux, macOS), сохранённый сразу после последнего вызова FFI (реэкспорт из `nona:ffi`). |
| `wideString(text)`       | `Uint16Array` с завершающим NUL для параметров `buf`, которые ожидают строку UTF-16.                                            |
| `fromWideString(buffer)` | Декодирует буфер UTF-16 с завершающим NUL.                                                                                      |
| `readHandle(buffer)`     | Читает дескриптор (например, `HKEY`), который функция записала в 8-байтовый буфер.                                              |

Функции, которых нет в списке, объявите сами с помощью `define` из [`nona:ffi`](/ru/reference/ffi).

## `node:buffer`, `buffer`, `nona:buffer`

Эти псевдонимы экспортируют глобальные конструкторы `Buffer`, `Blob` и `File`, проверки байтов, вспомогательные функции base64, перекодирование, настройки инспекции и константы. Доступны байтовые и текстовые потоки Blob, читатели BYOB, а также регистрация и разрешение объектных URL. Общий разбор URL выполняет глобальный [`URL`](/ru/reference/host-apis#url); построение произвольных Web Streams остаётся отдельным зависимым API. См. [двоичные данные (англ.)](/reference/host-apis#buffer-and-binary-data) и [запускаемый пример](https://github.com/40oleg/nona/blob/main/site/samples/buffer.mjs).
