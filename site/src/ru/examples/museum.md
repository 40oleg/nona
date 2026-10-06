# Museum: смена обоев <Badge type="warning" text="Только Windows" />

::: warning Только Windows
Этот пример вызывает функции Windows через `nona:win32` и компилируется только для `win32-x64`.
:::

Museum — фоновая программа, которая каждые несколько минут показывает на рабочем столе другую картину. Она работает без консольного окна, не тратит CPU между сменами, запускается только в одном экземпляре и может прописать себя в автозагрузку Windows. Вся программа — один модуль примерно из 80 строк.

## Шаг 1: аргументы

```js
const folder = process.argv[1];
const minutes = Number(process.argv[2] ?? 30);
const install = process.argv.includes('--install');
```

`process.argv[0]` — исполняемый файл, а `process.argv[1]` — первый аргумент. У GUI-программы нет консоли, поэтому ошибки показываются через `MessageBoxW`:

```js
function fail(message) {
  MessageBoxW(null, message, 'Museum', MB_OK | MB_ICONERROR);
  process.exit(1);
}
```

## Шаг 2: картины

`readdirSync` from `node:fs` lists the folder. This sample joins paths with `\\`; `node:path` is also available.

```js
const pictures = readdirSync(folder)
  .filter(name => /\.(jpe?g|png|bmp)$/i.test(name))
  .sort()
  .map(name => folder.replace(/[\\/]+$/, '') + '\\' + name);
```

## Шаг 3: единственный экземпляр

Именованный мьютекс существует, пока жив создавший его процесс. Если он уже есть, значит, другой Museum уже запущен.

```js
CreateMutexW(null, false, 'Local\\NonaMuseum');
if (lastError() === ERROR_ALREADY_EXISTS) process.exit(0);
```

`lastError()` возвращает `GetLastError()`, сохранённый сразу после предыдущего вызова FFI.

## Шаг 4: установка обоев

```js
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, picture, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)
```

Параметр `wstr` превращает строку JavaScript во временную копию UTF-16 с завершающим NUL, поэтому работают пути с любыми символами. `SPIF_UPDATEINIFILE` сохраняет обои после выхода из системы, а `SPIF_SENDCHANGE` уведомляет другие программы.

## Шаг 5: смена картин

```js
showNext();
setInterval(showNext, minutes * 60 * 1000);
```

Активный интервал не даёт процессу завершиться. Между тиками цикл событий спит в ядре, поэтому во время ожидания программа не тратит CPU.

## Шаг 6: сборка GUI-программы

<<< ../../../samples/museum.version.json

```sh
node dist/cli.js build museum.mjs -o build/museum.exe --subsystem windows --icon museum.ico --version-info museum.version.json
```

- `--subsystem windows` запускает программу без консольного окна и встраивает манифест по умолчанию (asInvoker, Windows 10/11, поддержка DPI для каждого монитора).
- `--icon` встраивает иконку, которую показывают Проводник и панель задач.
- `--version-info` заполняет вкладку «Свойства → Подробно».

Запустите программу, указав папку и интервал в минутах:

```powershell
.\build\museum.exe "C:\Users\me\Pictures\Paintings" 30
```

## Шаг 7: автозапуск с Windows (по желанию)

С `--install` Museum записывает свою командную строку в `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. `RegCreateKeyExW` записывает открытый ключ в 8-байтовый буфер, который читает `readHandle`; `wideString` готовит данные UTF-16 для `RegSetValueExW`.

```js
const key = new Uint8Array(8);
RegCreateKeyExW(HKEY_CURRENT_USER, runKey, 0, null, 0, KEY_WRITE, null, key, null);
const command = wideString(`"${process.execPath}" "${folder}" ${minutes}`);
RegSetValueExW(readHandle(key), 'NonaMuseum', 0, REG_SZ, command, command.byteLength);
```

Чтобы отменить это, удалите значение `NonaMuseum` в этом ключе (например, через `RegDeleteValueW` или в редакторе реестра).

## Полный исходник

<<< ../../../samples/museum.win32.mjs{js}

## См. также

- [Нативные функции (FFI)](/ru/reference/ffi) и [список экспортов `nona:win32`](/ru/reference/modules#nona-win32)
- [Исполняемые файлы Windows](/ru/reference/windows-executables)
- [Таймеры и цикл событий](/ru/reference/host-apis)
