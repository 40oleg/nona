# Línea de comandos

## Sinopsis

```text
Nona 0.7.0 — JavaScript subset to native Windows/Linux x64
Usage: nona build <input.js> -o <output> [--target win32-x64|linux-x64] [--module]
       [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
       [--version-info version.json]
       (.mjs inputs are compiled as modules)
       nona --help | --version
```

Desde un clon del repositorio, ejecuta `node dist/cli.js …`; después de `npm link`, el mismo comando está disponible como `nona`.

## Opciones

| Opción | Valor | Descripción |
| --- | --- | --- |
| `-o` | ruta | Archivo de salida. Obligatoria. Los directorios que falten se crean. |
| `--target` | `win32-x64` (predeterminado), `linux-x64` | Formato de salida: PE32+ para Windows o ELF64 para Linux. |
| `--module` | — | Compila la entrada como un módulo ES. Las entradas que terminan en `.mjs` son módulos automáticamente. |
| `--subsystem` | `console` (predeterminado), `windows` | Programa gráfico de Windows sin ventana de consola. Solo `win32-x64`. Un programa gráfico sin `--manifest` recibe un manifiesto predeterminado. |
| `--icon` | archivo `.ico` | Incrusta todas las imágenes del archivo de icono. Solo `win32-x64`. |
| `--manifest` | archivo XML | Incrusta un manifiesto de aplicación. Debe ser válido: Windows se niega a iniciar un programa con un manifiesto mal formado. Solo `win32-x64`. |
| `--version-info` | archivo JSON | Incrusta información de versión (`FileVersion`, `ProductVersion`, `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName`, `Comments`). Solo `win32-x64`. |
| `--help` | — | Muestra la sinopsis. |
| `--version` | — | Muestra la versión del compilador. |

Cada opción puede aparecer una sola vez. Consulta [Ejecutables de Windows](/es/reference/windows-executables) para los formatos de los recursos.

## Entrada y salida

- La entrada es un único archivo fuente en UTF-8. Una entrada de tipo módulo arrastra los módulos que importa; los módulos integrados `nona:*` y `node:*` forman parte del compilador.
- La salida se escribe en un archivo temporal junto a ella y luego se renombra, de modo que una compilación fallida nunca deja un ejecutable a medio escribir y conserva el anterior.
- El compilador se niega a sobrescribir su propia entrada, también a través de un enlace duro o simbólico.
- Las salidas de Linux reciben el modo `0755`.

## Caché del runtime

El runtime y los preludios compilados son iguales para todos los programas que enlazan las mismas partes, y generarlos ocupa la mayor parte de una compilación. La línea de comandos los guarda en un directorio de caché, así que las compilaciones siguientes son unas tres veces más rápidas (un hello world en Linux: 1,1 s y luego 0,33 s). La salida es idéntica con o sin caché. Las entradas pertenecen a una sola versión del compilador y se ignoran tras una actualización.

| Variable | Efecto |
| --- | --- |
| `NONA_CACHE_DIR` | Directorio de caché. Por defecto: `%LOCALAPPDATA%\nona\cache` en Windows, `~/Library/Caches/nona` en macOS y `$XDG_CACHE_HOME/nona` o `~/.cache/nona` en los demás sistemas. |
| `NONA_CACHE=0` | No leer ni escribir la caché. |

## Diagnósticos y códigos de salida

El estado de salida es `0` si todo va bien y `1` ante cualquier error. Los errores en el código fuente se muestran así:

```text
<file>:<line>:<column> <CODE>: <message>
```

| Código | Significado |
| --- | --- |
| `E_LEX`, `E_SYNTAX` | El código fuente no se puede tokenizar ni analizar, o usa sintaxis no soportada. |
| `E_BIND` | Un error temprano detectado al resolver nombres (declaraciones duplicadas, destinos de asignación no válidos, …). |
| `E_MODULE` | Un módulo no se puede resolver, leer o enlazar, o hay exportaciones en conflicto. |
| `E_FFI_STATIC` | Una llamada a `define()` de `nona:ffi` no consta de tres literales de cadena o tiene una firma no válida. |
| `E_FFI_TARGET` | Una declaración de DLL compilada para `linux-x64`, o una declaración de llamada al sistema compilada para `win32-x64`. |
| `E_RESOURCE` | Un icono o una información de versión no válidos, o recursos solicitados para `linux-x64`. |
| `E_TARGET` | Un destino o subsistema no soportado. |

Los errores de argumentos se muestran como `nona: <message>`, por ejemplo `Unknown option: --foo`, `Duplicate option: -o`, `Missing value for --target`, `Output is required (-o <output>)`, `Unsupported target: arm64`, `Unsupported subsystem: native` o `--subsystem requires --target win32-x64`.

## Ejemplos

::: code-group

```sh [Programa de consola]
node dist/cli.js build app.js -o build/app.exe
```

```sh [Programa gráfico con recursos]
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

```sh [Linux]
node dist/cli.js build app.js -o build/app --target linux-x64
```

:::
