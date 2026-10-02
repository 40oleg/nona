# Museum: wallpaper changer <Badge type="warning" text="Windows only" />

::: warning Windows only
This example calls Windows functions through `nona:win32` and compiles only for `win32-x64`.
:::

Museum is a background program that shows a different painting as the desktop wallpaper every few minutes. It runs without a console window, uses no CPU between changes, starts only once and can register itself to start with Windows. The whole program is one module of about 80 lines.

## Step 1: arguments

```js
const folder = process.argv[1];
const minutes = Number(process.argv[2] ?? 30);
const install = process.argv.includes('--install');
```

`process.argv[0]` is the executable and `process.argv[1]` the first argument. A GUI program has no console, so errors are shown with `MessageBoxW`:

```js
function fail(message) {
  MessageBoxW(null, message, 'Museum', MB_OK | MB_ICONERROR);
  process.exit(1);
}
```

## Step 2: the pictures

`readdirSync` from `node:fs` lists the folder. There is no `node:path`, so paths are joined by hand with `\`.

```js
const pictures = readdirSync(folder)
  .filter(name => /\.(jpe?g|png|bmp)$/i.test(name))
  .sort()
  .map(name => folder.replace(/[\\/]+$/, '') + '\\' + name);
```

## Step 3: a single instance

A named mutex exists as long as the process that created it. If it already exists, another Museum is running.

```js
CreateMutexW(null, false, 'Local\\NonaMuseum');
if (lastError() === ERROR_ALREADY_EXISTS) process.exit(0);
```

`lastError()` returns `GetLastError()` captured right after the previous FFI call.

## Step 4: setting the wallpaper

```js
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, picture, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)
```

The `wstr` parameter turns the JavaScript string into a temporary NUL-terminated UTF-16 copy, so paths with any characters work. `SPIF_UPDATEINIFILE` keeps the wallpaper after sign-out and `SPIF_SENDCHANGE` notifies other programs.

## Step 5: rotating

```js
showNext();
setInterval(showNext, minutes * 60 * 1000);
```

A pending interval keeps the process alive. Between ticks the event loop sleeps in the kernel, so the program uses no CPU while it waits.

## Step 6: build a GUI program

<<< ../../samples/museum.version.json

```sh
node dist/cli.js build museum.mjs -o build/museum.exe --subsystem windows --icon museum.ico --version-info museum.version.json
```

- `--subsystem windows` starts the program without a console window and embeds a default manifest (asInvoker, Windows 10/11, per-monitor DPI awareness).
- `--icon` embeds the icon that Explorer and the taskbar show.
- `--version-info` fills Properties → Details.

Run it with a folder and an interval in minutes:

```powershell
.\build\museum.exe "C:\Users\me\Pictures\Paintings" 30
```

## Step 7: start with Windows (optional)

With `--install`, Museum writes its command line to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. `RegCreateKeyExW` writes the opened key into an 8-byte buffer, which `readHandle` reads; `wideString` makes the UTF-16 data for `RegSetValueExW`.

```js
const key = new Uint8Array(8);
RegCreateKeyExW(HKEY_CURRENT_USER, runKey, 0, null, 0, KEY_WRITE, null, key, null);
const command = wideString(`"${process.execPath}" "${folder}" ${minutes}`);
RegSetValueExW(readHandle(key), 'NonaMuseum', 0, REG_SZ, command, command.byteLength);
```

To undo it, delete the `NonaMuseum` value in that key (for example with `RegDeleteValueW`, or in the Registry Editor).

## Full source

<<< ../../samples/museum.win32.mjs{js}

## See also

- [Native functions (FFI)](/reference/ffi) and the [`nona:win32` export list](/reference/modules#nona-win32)
- [Windows executables](/reference/windows-executables)
- [Timers and the event loop](/reference/host-apis)
