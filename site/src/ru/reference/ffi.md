# Нативные функции (FFI)

::: info Перевод
Это перевод английской страницы [Native functions (FFI)](/reference/ffi), созданной из [`docs/ffi.md`](https://github.com/40oleg/nona/blob/main/docs/ffi.md). Английская версия — основная и может быть новее.
:::

Программы для Windows могут вызывать экспортируемые функции любой DLL через встроенный модуль `nona:ffi`. Объявления разрешаются при компиляции: каждый вызов `define` добавляет запись в таблицу импорта PE, поэтому программа не использует `LoadLibrary`/`GetProcAddress`.

```js
import { define, lastError } from 'nona:ffi';

const MessageBoxW = define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)');
MessageBoxW(null, 'Hello from Nona', 'Nona', 0);
```

- FFI доступен в коде модулей (`.mjs` или `--module`). `define` нужно вызывать напрямую с тремя строковыми литералами: имя DLL, имя экспорта и сигнатура. Всё остальное — ошибка компиляции (`E_FFI_STATIC`).
- Объявления DLL отклоняются для `--target linux-x64` (`E_FFI_TARGET`).
- На Linux `define('syscall', '<number>', signature)` объявляет прямой системный вызов (не больше шести целочисленных аргументов или аргументов `buf`; результат — сырое значение, возвращённое ядром, при ошибке — отрицательный `errno`). Объявления системных вызовов отклоняются для `win32-x64`.
- `lastError()` возвращает `GetLastError()`, сохранённый сразу после последнего вызова FFI.
- Если DLL или экспорта нет, загрузчик Windows отказывается запускать программу.

## Сигнатуры {#signatures}

`result(param, param, ...)`, например `bool(u32,u32,wstr,u32)`.

| Тип | Параметр | Результат |
| --- | --- | --- |
| `i8 i16 i32 i64 u8 u16 u32 u64` | Number (с отбрасыванием дробной части в сторону нуля) или Boolean | Number |
| `ptr` | Number, Boolean, `null`/`undefined` (NULL) | Number |
| `bool` | как `i32` | Boolean (Win32 `BOOL`, ненулевое значение — `true`) |
| `f32 f64` | Number | Number |
| `wstr` | String → временная копия UTF-16 с завершающим NUL; `null`/`undefined` → NULL | — |
| `str` | String → временная копия UTF-8 с завершающим NUL; `null`/`undefined` → NULL | — |
| `buf` | ArrayBuffer, SharedArrayBuffer, typed array или DataView → указатель на его байты (со смещением представления); `null`/`undefined` → NULL | — |
| `void` | — | `undefined` |

Аргументы других типов бросают `TypeError`, как и отсутствующие аргументы (кроме указательных типов, где `undefined` означает NULL) и отсоединённые буферы. Вызываемая функция может писать в память `buf` — так возвращаются выходные параметры: передайте `Uint16Array` для буфера строки UTF-16 или `Uint8Array(8)` для дескриптора. Временные копии строк освобождаются после вызова; вызываемая функция не должна сохранять указатель. Callbacks (`cb(...)`) и типы выходных параметров зарезервированы для следующих версий.

## `nona:win32` {#nona-win32}

Подобранный набор объявлений и вспомогательных функций на основе `nona:ffi`:

- user32: `MessageBoxW`, `GetSystemMetrics`, `SystemParametersInfoW` (строковый параметр), `SystemParametersInfoBufferW` (параметр-буфер);
- kernel32: `CreateMutexW`, `ReleaseMutex`, `CloseHandle`, `GetModuleFileNameW`, `GetCurrentProcessId`;
- advapi32: `RegCreateKeyExW`, `RegOpenKeyExW`, `RegSetValueExW`, `RegQueryValueExW`, `RegDeleteValueW`, `RegDeleteKeyW`, `RegCloseKey`;
- константы, например `HKEY_CURRENT_USER`, `KEY_ALL_ACCESS`, `REG_SZ`, `SPI_SETDESKWALLPAPER`, `SPIF_UPDATEINIFILE`, `ERROR_ALREADY_EXISTS`;
- вспомогательные функции `wideString(text)` (`Uint16Array` с завершающим NUL), `fromWideString(buffer)` и `readHandle(buffer)`; `lastError` реэкспортируется.

```js
import { SystemParametersInfoW, SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE } from 'nona:win32';
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, 'C:\\Pictures\\painting.jpg', SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
```
