# Файловая система (`nona:fs`, `node:fs`)

::: info Перевод
Это перевод английской страницы [File system](/reference/fs), созданной из [`docs/fs.md`](https://github.com/40oleg/nona/blob/main/docs/fs.md). Английская версия — основная и может быть новее.
:::

Встроено синхронное подмножество модуля `fs` из Node.js. Оба спецификатора указывают на одну и ту же реализацию; работают и `import fs from 'node:fs'`, и именованные импорты.

| Функция | Примечания |
| --- | --- |
| `readFileSync(path, options?)` | Без кодировки возвращает `Uint8Array` (Node.js возвращает `Buffer`); с `'utf8'` возвращает строку. |
| `writeFileSync(path, data, options?)` | `data`: строка (UTF-8), typed array, DataView или ArrayBuffer. `{flag: 'a'}` дописывает в конец. `flag`: `w` / `a` / `wx`; POSIX `mode`. |
| `appendFileSync(path, data)` | |
| `existsSync(path)` | |
| `statSync(path, options?)` | `isFile()`, `isDirectory()`, `isSymbolicLink()`, `size`, `mtimeMs`, `mtime`, `mode`; `{throwIfNoEntry: false}`. `dev`, `ino`; `{bigint: true}` → BigInt `dev` / `ino`. |
| `realpathSync(path)` | Канонический абсолютный путь с разрешением символических ссылок. |
| `readdirSync(path, options?)` | Имена без `.` и `..`; `{withFileTypes: true}` возвращает записи с `name`, `isFile()`, `isDirectory()`, `isSymbolicLink()`. |
| `mkdirSync(path, {recursive}?)` | С `recursive` возвращает первый созданный каталог. |
| `rmdirSync`, `unlinkSync`, `renameSync`, `copyFileSync(src, dest, mode?)` | `constants.COPYFILE_EXCL` поддерживается. |

Пути — строки (или `Uint8Array` в UTF-8). Поддерживается только кодировка `utf8`. Ошибки — объекты `Error` с кодами Node.js (`ENOENT`, `EEXIST`, `EISDIR`, `ENOTDIR`, `ENOTEMPTY`, `EACCES`, `EPERM`, …), `syscall` и `path` и с тем же форматом сообщений, что в Node.js (на Windows Node.js показывает в сообщениях абсолютный путь, а Nona — путь в том виде, в каком он передан).

Реализация: на Windows модуль вызывает KERNEL32 (`CreateFileW`, `ReadFile`, `FindFirstFileW`, …) через [`nona:ffi`](/ru/reference/ffi); на Linux он использует прямые системные вызовы, объявленные через `define('syscall', number, signature)`. В программу попадают только функции той платформы, для которой идёт компиляция.

## TextEncoder и TextDecoder {#textencoder-and-textdecoder}

`TextEncoder` и `TextDecoder` — глобальные объекты, реализующие UTF-8 по стандарту WHATWG Encoding: `encode(string)`, `decode(bufferSource)`, параметры `fatal` и `ignoreBOM`, замена некорректных последовательностей и одиночных суррогатов на U+FFFD. Другие кодировки бросают `RangeError`.

Доступно на Windows, Linux и macOS (x64 и ARM64), FreeBSD и OpenBSD (x64).
