# Ejecutables de Windows

::: info Traducción
Esta página es una traducción de la página en inglés [Windows executables](/reference/windows-executables), generada a partir de [`docs/windows-executables.md`](https://github.com/40oleg/nona/blob/main/docs/windows-executables.md). La versión en inglés es la de referencia y puede ser más reciente.
:::

## Subsistema

`nona build app.js -o app.exe --subsystem windows` marca la imagen PE como programa gráfico (campo Subsystem 2 de la cabecera opcional). Windows lo inicia entonces sin ventana de consola, lo que conviene a programas en segundo plano y utilidades de la bandeja del sistema. El valor predeterminado es `--subsystem console` (3). La opción requiere `--target win32-x64`.

Un programa gráfico sigue escribiendo la salida de `console.log` en los handles de salida estándar que hereda (por ejemplo, tuberías preparadas por el proceso padre). Cuando no hay salida estándar —sin consola, con un handle cerrado o desvinculado, o con una escritura que falla—, la salida se descarta y el programa continúa; las versiones anteriores terminaban con código de salida 1.

## Recursos

```text
nona build app.js -o app.exe --icon app.ico --manifest app.manifest --version-info version.json
```

- `--icon` incrusta todas las imágenes de un archivo `.ico` (`RT_ICON` 1…n y `RT_GROUP_ICON` 1); el Explorador y la barra de tareas lo muestran.
- `--manifest` incrusta un manifiesto de aplicación (`RT_MANIFEST` 1). Debe ser un manifiesto válido: Windows se niega a iniciar un programa con uno mal formado. Los programas compilados con `--subsystem windows` y sin manifiesto reciben uno predeterminado: `asInvoker`, compatibilidad con Windows 10/11 y reconocimiento de DPI por monitor.
- `--version-info` lee un objeto JSON con cualquiera de `FileVersion`, `ProductVersion` (`"major.minor.build.revision"`, partes 0–65535), `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName` y `Comments`, que se muestran en Propiedades → Detalles del archivo (`RT_VERSION` 1, idioma 0409, página de códigos 04B0).

```json
{ "FileVersion": "1.0.0.0", "ProductName": "Museum", "FileDescription": "Paintings on the desktop", "CompanyName": "Oleg" }
```

Las mismas opciones están disponibles en `compile()` como `icon` (bytes), `manifest` (cadena) y `versionInfo` (objeto). Requieren `--target win32-x64`.
