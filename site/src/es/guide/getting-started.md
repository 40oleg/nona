# Primeros pasos

## Instalación

Descarga el archivo para tu sistema desde la [última versión](https://github.com/40oleg/nona/releases/latest), extráelo y ejecuta `nona --help` (`./nona --help` en Linux, macOS y BSD). El archivo contiene el ejecutable (`nona.exe` en Windows, `nona` en los demás sistemas), `LICENSE`, `VERSION`, `README.txt` y `THIRD_PARTY_NOTICES.md`; el compilador es un programa nativo que no necesita Node.js. Cada versión también incluye `SHA256SUMS`. En los nombres de archivo siguientes, `<version>` indica la versión publicada.

Al distribuir un programa generado, incluye junto al ejecutable los archivos `LICENSE` y `THIRD_PARTY_NOTICES.md` del archivo del compilador. El runtime compartido incluye el formato de números en bases distintas de diez y el cálculo de raíces cúbicas cubiertos por estos [avisos](https://github.com/40oleg/nona/blob/main/THIRD_PARTY_NOTICES.md); los ejecutables ARM64 también usan las funciones de logaritmo y exponencial implementadas en software.

| SO                          | Archivo                                                                  | Nombre del destino           |
| --------------------------- | ------------------------------------------------------------------------ | ---------------------------- |
| Windows x64 / ARM64         | `nona-<version>-win32-x64.zip`, `nona-<version>-win32-arm64.zip`         | `win32-x64`, `win32-arm64`   |
| Linux x64 / ARM64           | `nona-<version>-linux-x64.tar.gz`, `nona-<version>-linux-arm64.tar.gz`   | `linux-x64`, `linux-arm64`   |
| macOS Intel / Apple Silicon | `nona-<version>-darwin-x64.tar.gz`, `nona-<version>-darwin-arm64.tar.gz` | `darwin-x64`, `darwin-arm64` |
| FreeBSD / OpenBSD x64       | `nona-<version>-freebsd-x64.tar.gz`, `nona-<version>-openbsd-x64.tar.gz` | `freebsd-x64`, `openbsd-x64` |

En sistemas POSIX ejecuta `chmod +x nona` si la herramienta de extracción pierde el permiso. Para probar Nona sin instalar nada, usa el [playground](/playground).

### Compilar desde el código fuente

Necesitas Node.js 26 o posterior y npm, en cualquier host que ejecute Node.js 26.

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
node dist/cli.js --help
```

El punto de entrada del compilador es `dist/cli.js`. `npm link` en el repositorio añade un comando `nona` a tu `PATH`. El resto de este sitio escribe `nona`; desde un clon, ejecuta `node dist/cli.js` en su lugar.

## Tu primer programa

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux y macOS]
nona build hello.js -o build/hello
./build/hello
```

:::

```text
Hello, from Nona!
a microtask runs before any timer
tick 1
tick 2
tick 3
done; at least 30 ms passed: true
```

El programa termina cuando no quedan temporizadores ni tareas de Promise. El ejecutable funciona por sí solo: cópialo a una máquina sin Node.js y seguirá funcionando.

## Destinos y compilación cruzada

El compilador es un compilador cruzado: cualquier host puede producir ejecutables para cualquiera de las ocho [plataformas nativas](/reference/native-platforms). `--target` selecciona el formato de salida y la CPU; sin él, el destino es el SO y la CPU del host.

```sh
nona build hello.js -o build/hello --target linux-arm64
nona build hello.js -o build/hello.exe --target win32-x64
```

Un ejecutable compilado de forma cruzada solo se ejecuta en el SO y la CPU correspondientes. Las salidas de Linux, BSD y macOS se escriben con modo `0755`.

## Módulos

Una entrada `.mjs`, o cualquier entrada compilada con `--module`, es un módulo ES. Las importaciones relativas (`./util.mjs`, `../lib/x.mjs`) se resuelven junto al archivo que importa y se compilan en el mismo ejecutable. Una entrada CommonJS se compila junto con todo lo que carga con `require`.

Los módulos integrados usan el prefijo `nona:` (`nona:ffi`, `nona:win32`, `nona:fs`, `nona:process`); muchos nombres de Node.js (`node:fs`, `node:path`, `node:http`, …) también están disponibles. Consulta [Módulos integrados](/es/reference/modules).

## Paquetes npm

Instala los paquetes con npm como de costumbre y compila: Nona resuelve `node_modules` al construir y compila los paquetes dentro del ejecutable. `nona build <directorio del paquete>` construye el comando `"bin"` o el módulo `"main"` del paquete. Consulta [paquetes npm](/reference/npm).

## Un programa de Windows sin consola

```sh
nona build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` inicia el programa sin ventana de consola e incrusta un manifiesto predeterminado; `--icon` y `--version-info` añaden recursos que muestra el Explorador. Consulta [Ejecutables de Windows](/es/reference/windows-executables) y el [ejemplo Museum](/es/examples/museum).

## Solución de problemas

Los errores de compilación se muestran como `file:line:column CODE: message` y el compilador termina con estado 1:

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- La sintaxis no soportada se rechaza en tiempo de compilación en lugar de fallar en tiempo de ejecución.
- `E_FFI_TARGET` significa que se compiló una declaración de DLL para un destino que no es Windows (o una llamada al sistema para `win32-x64`).
- `E_HOST_MODULE` significa que un módulo integrado no está disponible para el destino.
- Un `EvalError` en tiempo de ejecución significa que `eval` o `Function` recibió código fuente que no se conocía en tiempo de compilación.

La [referencia de la línea de comandos](/es/reference/cli) enumera todas las opciones y errores.

## Siguientes pasos

- [Ejemplos](/es/examples/): programas completos con explicaciones.
- [Soporte del lenguaje](/es/guide/language-support) y [Compatibilidad y limitaciones](/es/guide/compatibility): qué esperar.
- [Módulos integrados](/es/reference/modules): las APIs del host.
