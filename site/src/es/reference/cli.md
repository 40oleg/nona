# LГ­nea de comandos

## Sinopsis

```text
Nona 0.25.0 вЂ” JavaScript subset to native executables
Usage: nona build <input.js|package directory> -o <output> [--target win32-x64|linux-x64|linux-arm64|win32-arm64|darwin-x64|darwin-arm64|freebsd-x64|openbsd-x64] [--module]
       [--conditions name]... [--full-runtime] [--link part,...] [--print-link]
       [--call-stats] [--coverage dir] [--print-asm]
       [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
       [--version-info version.json]
       (.mjs inputs are compiled as modules)
       nona --help | --version
```

El ejecutable `nona` publicado acepta estos argumentos. Desde un clon del repositorio, ejecuta `node dist/cli.js вЂ¦`; despuГ©s de `npm link`, el mismo comando estГЎ disponible como `nona`.

## Opciones

| OpciГіn               | Valor                                              | DescripciГіn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `-o`                 | ruta                                               | Archivo de salida. Obligatoria salvo que se indique `--print-asm`. Los directorios que falten se crean.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--target`           | [Plataformas nativas](/reference/native-platforms) | PE32+, ELF64 o Mach-O64; por defecto, el SO y la CPU del host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--module`           | вЂ”                                                  | Compila la entrada como un mГіdulo ES. Las entradas que terminan en `.mjs` son mГіdulos automГЎticamente.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--conditions`, `-C` | nombre                                             | AГ±ade una condiciГіn de `exports`/`imports` de package.json, que se prueba antes que las propias de Nona (`nona`, `node`, `import` o `require`, `default`); tambiГ©n vale `--conditions=name`. Puede repetirse. Consulta [paquetes npm](/reference/npm#resolution).                                                                                                                                                                                                                                                                                                                                                                    |
| `--full-runtime`     | вЂ”                                                  | Enlaza todo el runtime. Por defecto, el motor de RegExp, sus tablas de propiedades Unicode y las tablas de normalizaciГіn Unicode solo se enlazan cuando el programa puede alcanzarlos; consulta [Partes del runtime enlazadas](/es/guide/compatibility#linked-runtime-parts).                                                                                                                                                                                                                                                                                                                                                        |
| `--call-stats`       | вЂ”                                                  | Cuenta cada llamada que hacen el programa y su runtime, por destino, e imprime los recuentos en stderr cuando el programa termina o falla, de mayor a menor frecuencia (`recuento  destino` por lГ­nea). Las llamadas a declaraciones de funciГіn conocidas en tiempo de compilaciГіn se cuentan bajo su etiqueta de cГіdigo (`js.fn.N`); las demГЎs llamadas de JavaScript pasan por `rt.invoke` y se cuentan allГ­. El ejecutable es mГЎs grande y mГЎs lento; Гєsalo para encontrar las funciones del runtime en las que un programa gasta sus llamadas. `process.exit()` omite el informe.                                                |
| `--coverage`         | directorio                                         | Cuenta las llamadas de cada funciГіn del programa y, cuando este termina o un error de ejecuciГіn lo termina, las escribe en `<directorio>/coverage-<pid>-<n>-0.json` con el formato que produce `NODE_V8_COVERAGE`, de modo que `c8 report --temp-directory <directorio>` las convierte en un informe. La cobertura es por funciГіn (como el modo best-effort de V8): el rango de cГіdigo fuente de cada funciГіn con su nГєmero de llamadas. El directorio debe existir. Los nombres de mГ©todo pueden estar vacГ­os, y el cГіdigo de las cadenas de `eval` en tiempo de compilaciГіn se informa con desplazamientos dentro de esas cadenas. |
| `--print-asm`        | вЂ”                                                  | Imprime en stdout el ensamblador x86-64 generado para las funciones propias del programa (no el runtime ni sus preludios): la etiqueta de cada funciГіn y luego una lГ­nea por instrucciГіn con su desplazamiento en la funciГіn, sus bytes codificados y su texto en sintaxis Intel, y las etiquetas internas de la funciГіn en lГ­neas propias. Los destinos de llamadas y saltos son nombres de sГ­mbolo; sus desplazamientos aparecen como bytes cero hasta que se enlaza el ejecutable. Sin `-o` no se escribe nada mГЎs. Solo destinos x86-64.                                                                                         |
| `--link`             | partes, separadas por comas                        | Enlaza ademГЎs estas partes opcionales (por ejemplo `--link proxy,regexp`), para un programa que solo llega a ellas mediante nombres construidos en tiempo de ejecuciГіn. MГЎs barato que `--full-runtime`; `--print-link` muestra los nombres de las partes.                                                                                                                                                                                                                                                                                                                                                                           |
| `--print-link`       | вЂ”                                                  | Imprime las partes opcionales del runtime enlazadas y el motivo de cada una: el nombre del cГіdigo fuente que la seleccionГі, `--link` o la parte que la necesita. Entonces se puede omitir `-o`.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--subsystem`        | `console` (predeterminado), `windows`              | Programa grГЎfico de Windows sin ventana de consola. Solo `win32-x64`. Un programa grГЎfico sin `--manifest` recibe un manifiesto predeterminado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--icon`             | archivo `.ico`                                     | Incrusta todas las imГЎgenes del archivo de icono. Solo `win32-x64`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--manifest`         | archivo XML                                        | Incrusta un manifiesto de aplicaciГіn. Debe ser vГЎlido: Windows se niega a iniciar un programa con un manifiesto mal formado. Solo `win32-x64`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--version-info`     | archivo JSON                                       | Incrusta informaciГіn de versiГіn (`FileVersion`, `ProductVersion`, `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName`, `Comments`). Solo `win32-x64`.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--help`             | вЂ”                                                  | Muestra la sinopsis.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--version`          | вЂ”                                                  | Muestra la versiГіn del compilador.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Cada opciГіn, salvo `--conditions`, puede aparecer una sola vez. Consulta [Ejecutables de Windows](/es/reference/windows-executables) para los formatos de los recursos.

## Entrada y salida

- La entrada es un Гєnico archivo fuente en UTF-8. Una entrada de tipo mГіdulo arrastra los mГіdulos que importa, y una entrada CommonJS los mГіdulos que carga con `require`, incluidos los paquetes npm de `node_modules` ([paquetes npm](/reference/npm)); los mГіdulos integrados `nona:*` y `node:*` forman parte del compilador.
- La entrada puede ser un directorio de paquete: Nona compila el archivo que indica el campo `"bin"` de su `package.json` (el Гєnico comando, o el que lleva el nombre del paquete); si no lo hay, su `"main"` o `index.js`.
- La salida se escribe en un archivo temporal junto a ella y luego se renombra, de modo que una compilaciГіn fallida nunca deja un ejecutable a medio escribir y conserva el anterior.
- El compilador se niega a sobrescribir su propia entrada, tambiГ©n a travГ©s de un enlace duro o simbГіlico.
- Las salidas de Linux, BSD y Darwin reciben el modo `0755`.

## CachГ© del runtime

El runtime y los preludios compilados son iguales para todos los programas que enlazan las mismas partes, y generarlos ocupa la mayor parte de una compilaciГіn. La lГ­nea de comandos los guarda en un directorio de cachГ©, asГ­ que las compilaciones siguientes son unas tres veces mГЎs rГЎpidas (un hello world en Linux: 1,1 s y luego 0,33 s). La salida es idГ©ntica con o sin cachГ©. Las entradas pertenecen a una sola versiГіn del compilador y se ignoran tras una actualizaciГіn.

| Variable         | Efecto                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NONA_CACHE_DIR` | Directorio de cachГ©. Por defecto: `%LOCALAPPDATA%\nona\cache` en Windows, `~/Library/Caches/nona` en macOS y `$XDG_CACHE_HOME/nona` o `~/.cache/nona` en los demГЎs sistemas. |
| `NONA_CACHE=0`   | No leer ni escribir la cachГ©.                                                                                                                                                |

## DiagnГіsticos y cГіdigos de salida

El estado de salida es `0` si todo va bien y `1` ante cualquier error. Los errores en el cГіdigo fuente se muestran asГ­:

```text
<file>:<line>:<column> <CODE>: <message>
```

| CГіdigo              | Significado                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E_LEX`, `E_SYNTAX` | El cГіdigo fuente no se puede tokenizar ni analizar, o usa sintaxis no soportada.                                                                                                                            |
| `E_BIND`            | Un error temprano detectado al resolver nombres (declaraciones duplicadas, destinos de asignaciГіn no vГЎlidos, вЂ¦).                                                                                           |
| `E_MODULE`          | Un mГіdulo no se puede resolver, leer o enlazar, o hay exportaciones en conflicto.                                                                                                                           |
| `E_FFI_STATIC`      | Una llamada a `define()` de `nona:ffi` no consta de tres literales de cadena o tiene una firma no vГЎlida.                                                                                                   |
| `E_FFI_TARGET`      | Una declaraciГіn de DLL para un destino que no es Windows, o una declaraciГіn de llamada al sistema para Windows.                                                                                             |
| `E_RESOURCE`        | Un icono o una informaciГіn de versiГіn no vГЎlidos, o recursos solicitados para un destino distinto de `win32-x64`.                                                                                           |
| `E_TARGET`          | Un destino o subsistema no soportado.                                                                                                                                                                       |
| `E_OPTION`          | Una opciГіn de compilaciГіn no vГЎlida, como un nombre de parte desconocido en `--link`.                                                                                                                       |
| `E_HOST_MODULE`     | Un mГіdulo integrado (como `node:fs`) no estГЎ disponible para el destino.                                                                                                                                    |
| `E_INTERNAL`        | Un error del compilador, no del programa: fallГі una comprobaciГіn interna en la fase que indica el mensaje (`parse`, `bind`, `lower`, `codegen`, `link`, вЂ¦). RepГіrtelo junto con el programa que lo provoca. |

Los errores de argumentos se muestran como `nona: <message>`, por ejemplo `Unknown option: --foo`, `Duplicate option: -o`, `Missing value for --target`, `Output is required (-o <output>)`, `Unsupported target: arm64`, `Unsupported subsystem: native` o `--subsystem requires --target win32-x64`.

## Ejemplos

::: code-group

```sh [Programa de consola]
nona build app.js -o build/app.exe
```

```sh [Programa grГЎfico con recursos]
nona build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

```sh [Linux]
nona build app.js -o build/app --target linux-x64
```

:::

## El compilador nativo

Cada [versiГіn](https://github.com/40oleg/nona/releases/latest) incluye `nona` como ejecutable nativo para cada una de las ocho [plataformas nativas](/reference/native-platforms). Lo construyГі el propio Nona, no necesita Node.js y acepta las mismas opciones que `node dist/cli.js`. Un clon del repositorio ejecuta en su lugar el compilador de TypeScript sobre Node.js 26. La [guГ­a de bootstrap y validaciГіn](https://github.com/40oleg/nona/blob/main/docs/self-hosting.md) describe cГіmo el compilador nativo se reconstruye a sГ­ mismo.

Las declaraciones FFI de DLL solo compilan para destinos Windows; las declaraciones de llamadas directas al sistema usan los nГєmeros de kernel del destino Linux, Darwin o BSD elegido (consulta [FFI](/es/reference/ffi)).
