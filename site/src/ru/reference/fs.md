# Файловая система (`nona:fs`, `node:fs`)

::: info Перевод
Это перевод английской страницы [File system](/reference/fs), созданной из [`docs/fs.md`](https://github.com/40oleg/nona/blob/main/docs/fs.md). Английская версия — основная и может быть новее.
:::

Встроено синхронное подмножество модуля `fs` из Node.js, а поверх него — формы с обратным вызовом (callback) и с промисами для распространённых функций. Оба спецификатора указывают на одну и ту же реализацию; работают `import fs from 'node:fs'`, именованные импорты и `require('fs')`.

| Функция                                                                   | Примечания                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `readFileSync(path, options?)`                                            | Без кодировки возвращает `Uint8Array` (Node.js возвращает `Buffer`); с `'utf8'` возвращает строку.                                                                                                                                         |
| `writeFileSync(path, data, options?)`                                     | `data`: строка (UTF-8), typed array, DataView или ArrayBuffer. `{flag: 'a'}` дописывает в конец. `flag`: `w` / `a` / `wx`; POSIX `mode`.                                                                                                   |
| `appendFileSync(path, data)`                                              |                                                                                                                                                                                                                                            |
| `existsSync(path)`                                                        |                                                                                                                                                                                                                                            |
| `accessSync(path, mode?)`                                                 | Бросает `ENOENT`, если пути нет; биты прав не проверяются.                                                                                                                                                                                 |
| `statSync(path, options?)`                                                | `isFile()`, `isDirectory()`, `isSymbolicLink()`, `isBlockDevice()`, `isCharacterDevice()`, `isFIFO()`, `isSocket()`, `size`, `mtimeMs`, `mtime`, `mode`; `{throwIfNoEntry: false}`. `dev`, `ino`; `{bigint: true}` → BigInt `dev` / `ino`. |
| `lstatSync(path, options?)`                                               | Как `statSync`, но для самой ссылки, а не её цели; `{throwIfNoEntry: false}`. На Windows ссылками считаются символические ссылки и точки соединения (junction).                                                                            |
| `readlinkSync(path)`                                                      | Цель символической ссылки (или junction Windows) в том виде, как она хранится; `EINVAL` для остальных файлов.                                                                                                                              |
| `realpathSync(path)`, `realpathSync.native(path)`                         | Канонический абсолютный путь с разрешением символических ссылок.                                                                                                                                                                           |
| `readdirSync(path, options?)`                                             | Имена без `.` и `..`; `{withFileTypes: true}` возвращает объекты `fs.Dirent` с `name`, `parentPath`, `path` и методами `is*()` из `Stats`.                                                                                                 |
| `mkdirSync(path, {recursive}?)`                                           | С `recursive` возвращает первый созданный каталог.                                                                                                                                                                                         |
| `rmSync(path, {recursive, force}?)`                                       | Удаляет файл или, с `recursive`, дерево каталогов; `force` игнорирует отсутствующий путь.                                                                                                                                                  |
| `truncateSync(path, len = 0)`                                             | Укорачивает файл до `len` байт или дополняет нулевыми байтами; отрицательное `len` считается нулём.                                                                                                                                        |
| `rmdirSync`, `unlinkSync`, `renameSync`, `copyFileSync(src, dest, mode?)` | `constants.COPYFILE_EXCL` поддерживается.                                                                                                                                                                                                  |

Пути — строки (или `Uint8Array` в UTF-8). Поддерживается только кодировка `utf8`. Ошибки — объекты `Error` с кодами Node.js (`ENOENT`, `EEXIST`, `EISDIR`, `ENOTDIR`, `ENOTEMPTY`, `EACCES`, `EPERM`, …), `syscall` и `path` и с тем же форматом сообщений, что в Node.js (на Windows Node.js показывает в сообщениях абсолютный путь, а Nona — путь в том виде, в каком он передан).

Реализация: на Windows модуль вызывает KERNEL32 (`CreateFileW`, `ReadFile`, `FindFirstFileW`, …) через [`nona:ffi`](/ru/reference/ffi); на Linux он использует прямые системные вызовы, объявленные через `define('syscall', number, signature)`. В программу попадают только функции той платформы, для которой идёт компиляция.

## Обратные вызовы и промисы

`readFile`, `writeFile`, `appendFile`, `access`, `stat`, `lstat`, `readlink`, `realpath` (с `realpath.native`), `readdir`, `mkdir`, `mkdtemp`, `rm`, `rmdir`, `unlink`, `rename`, `truncate`, `copyFile`, `symlink`, `chmod`, `utimes` и `exists` принимают обратный вызов в стиле Node.js (`(error, result)`; `exists` передаёт только булево значение). Те же функции без `exists` возвращают промисы из `fs.promises` и из модуля `node:fs/promises` (`fs/promises`, `nona:fs/promises`), который является тем же объектом, что и `fs.promises`. Обе формы выполняют синхронную операцию в момент вызова и лишь откладывают обратный вызов на следующий такт или завершают промис: работа с файловой системой не перекрывается с другим кодом.

## TextEncoder и TextDecoder {#textencoder-and-textdecoder}

`TextEncoder` и `TextDecoder` — глобальные объекты, реализующие UTF-8 по стандарту WHATWG Encoding: `encode(string)`, `decode(bufferSource)`, параметры `fatal` и `ignoreBOM`, замена некорректных последовательностей и одиночных суррогатов на U+FFFD. Другие кодировки бросают `RangeError`.

Доступно на Windows, Linux и macOS (x64 и ARM64), FreeBSD и OpenBSD (x64).
