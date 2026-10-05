# Встроенные модули и глобальные объекты

Программы Nona работают без Node.js. Перечисленные ниже API хоста — часть компилятора: нативный runtime и небольшие JavaScript-прелюдии компилируются в каждый исполняемый файл, а встроенные модули — когда программа их импортирует.

## Обзор

| API | Вид | Цели | Справка |
| --- | --- | --- | --- |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask`, `performance.now()` | глобальные | обе | [Таймеры и цикл событий](/ru/reference/host-apis) |
| `process` | глобальный | обе | [process](/ru/reference/process) |
| `TextEncoder`, `TextDecoder` | глобальные | обе | [Файловая система и кодировка текста](/ru/reference/fs#textencoder-and-textdecoder) |
| `console.log` | глобальный | обе | пишет UTF-8 в стандартный вывод |
| `nona:process`, `node:process` | модули | обе | [process](/ru/reference/process) |
| `nona:fs`, `node:fs` | модули | обе | [Файловая система и кодировка текста](/ru/reference/fs) |
| `nona:http`, `node:http`, `nona:net`, `node:net` | модули | обе | [Сеть (англ.)](/reference/network) |
| `node:events`, `node:buffer`, `node:string_decoder` | модули | обе | [Вспомогательные модули Node.js (англ.)](/reference/network#supporting-modules) |
| `nona:ffi` | модуль | Windows (DLL), Linux (системные вызовы) | [Нативные функции (FFI)](/ru/reference/ffi) |
| `nona:win32` | модуль | Windows | ниже и в [FFI](/ru/reference/ffi#nona-win32) |

## Правила

- Глобальные объекты доступны в скриптах и модулях.
- Встроенные модули можно импортировать из кода модулей (`.mjs` или `--module`) и литеральным `import()` из скриптов. Объявления FFI (`define`) должны находиться в коде модуля.
- Среди модулей `node:` есть `node:fs`, `node:process`, `node:http`, `node:net`, `node:events`, `node:buffer` и `node:string_decoder`; это реализации подмножеств Node.js в Nona, а не код Node.js. `node:path` и `require` недоступны; глобальный `Buffer` появляется после импорта `node:buffer`, `node:net` или `node:http`.
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
