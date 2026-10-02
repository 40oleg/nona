# Museum: cambiador de fondos de pantalla <Badge type="warning" text="Solo Windows" />

::: warning Solo Windows
Este ejemplo llama a funciones de Windows a través de `nona:win32` y solo compila para `win32-x64`.
:::

Museum es un programa en segundo plano que pone un cuadro distinto como fondo de escritorio cada pocos minutos. Se ejecuta sin ventana de consola, no consume CPU entre cambios, solo arranca una instancia y puede registrarse para iniciarse con Windows. Todo el programa es un único módulo de unas 80 líneas.

## Paso 1: argumentos

```js
const folder = process.argv[1];
const minutes = Number(process.argv[2] ?? 30);
const install = process.argv.includes('--install');
```

`process.argv[0]` es el ejecutable y `process.argv[1]` el primer argumento. Un programa gráfico no tiene consola, así que los errores se muestran con `MessageBoxW`:

```js
function fail(message) {
  MessageBoxW(null, message, 'Museum', MB_OK | MB_ICONERROR);
  process.exit(1);
}
```

## Paso 2: las imágenes

`readdirSync` de `node:fs` lista la carpeta. No hay `node:path`, así que las rutas se unen a mano con `\`.

```js
const pictures = readdirSync(folder)
  .filter(name => /\.(jpe?g|png|bmp)$/i.test(name))
  .sort()
  .map(name => folder.replace(/[\\/]+$/, '') + '\\' + name);
```

## Paso 3: una sola instancia

Un mutex con nombre existe mientras vive el proceso que lo creó. Si ya existe, es que hay otro Museum en ejecución.

```js
CreateMutexW(null, false, 'Local\\NonaMuseum');
if (lastError() === ERROR_ALREADY_EXISTS) process.exit(0);
```

`lastError()` devuelve `GetLastError()` capturado justo después de la llamada FFI anterior.

## Paso 4: cambiar el fondo de pantalla

```js
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, picture, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)
```

El parámetro `wstr` convierte la cadena de JavaScript en una copia UTF-16 temporal terminada en NUL, así que funcionan rutas con cualquier carácter. `SPIF_UPDATEINIFILE` conserva el fondo tras cerrar sesión y `SPIF_SENDCHANGE` avisa a los demás programas.

## Paso 5: rotación

```js
showNext();
setInterval(showNext, minutes * 60 * 1000);
```

Un intervalo pendiente mantiene vivo el proceso. Entre ticks, el bucle de eventos duerme en el kernel, así que el programa no consume CPU mientras espera.

## Paso 6: compilar un programa gráfico

<<< ../../../samples/museum.version.json

```sh
node dist/cli.js build museum.mjs -o build/museum.exe --subsystem windows --icon museum.ico --version-info museum.version.json
```

- `--subsystem windows` inicia el programa sin ventana de consola e incrusta un manifiesto predeterminado (asInvoker, Windows 10/11, reconocimiento de DPI por monitor).
- `--icon` incrusta el icono que muestran el Explorador y la barra de tareas.
- `--version-info` rellena Propiedades → Detalles.

Ejecútalo con una carpeta y un intervalo en minutos:

```powershell
.\build\museum.exe "C:\Users\me\Pictures\Paintings" 30
```

## Paso 7: iniciar con Windows (opcional)

Con `--install`, Museum escribe su línea de comandos en `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. `RegCreateKeyExW` escribe la clave abierta en un búfer de 8 bytes, que lee `readHandle`; `wideString` genera los datos UTF-16 para `RegSetValueExW`.

```js
const key = new Uint8Array(8);
RegCreateKeyExW(HKEY_CURRENT_USER, runKey, 0, null, 0, KEY_WRITE, null, key, null);
const command = wideString(`"${process.execPath}" "${folder}" ${minutes}`);
RegSetValueExW(readHandle(key), 'NonaMuseum', 0, REG_SZ, command, command.byteLength);
```

Para deshacerlo, borra el valor `NonaMuseum` de esa clave (por ejemplo con `RegDeleteValueW` o en el Editor del Registro).

## Código fuente completo

<<< ../../../samples/museum.win32.mjs{js}

## Véase también

- [Funciones nativas (FFI)](/es/reference/ffi) y la [lista de exportaciones de `nona:win32`](/es/reference/modules#nona-win32)
- [Ejecutables de Windows](/es/reference/windows-executables)
- [Temporizadores y bucle de eventos](/es/reference/host-apis)
