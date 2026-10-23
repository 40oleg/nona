---
layout: home

hero:
    name: Nona
    text: De JavaScript a ejecutables nativos
    tagline: Un compilador ahead-of-time que convierte JavaScript ES2020 en pequeГ±os ejecutables autГіnomos para Windows, Linux, macOS, FreeBSD y OpenBSD. Sin intГ©rprete embebido y sin toolchain de C.
    actions:
        - theme: brand
          text: Empezar
          link: /es/guide/getting-started
        - theme: alt
          text: PruГ©balo en el navegador
          link: /playground
        - theme: alt
          text: QuГ© es Nona
          link: /es/guide/what-is-nona
        - theme: alt
          text: GitHub
          link: https://github.com/40oleg/nona

features:
    - title: Arranca en 2 ms
      details: Un hello world compilado arranca en unos 2 ms y alcanza como mГЎximo 11 MB de memoria, en un archivo de unos 2 MB. Node.js tarda 28 ms y usa 45 MB; un ejecutable Node SEA ocupa 124 MB.
      link: /es/guide/performance
    - title: Ocho destinos desde cualquier host
      details: Windows, Linux y macOS en x64 y ARM64, FreeBSD y OpenBSD en x64. Compila de forma cruzada con --target; cada ejecutable es autГіnomo.
      link: /reference/native-platforms
    - title: El lenguaje ES2020
      details: Clases, generadores, funciones async, desestructuraciГіn, encadenamiento opcional, BigInt, llamadas de cola propias y mГіdulos ES con ciclos y enlaces vivos, con excepciones documentadas.
      link: /es/guide/language-support
    - title: Paquetes npm
      details: Los paquetes de node_modules se resuelven al construir y se compilan dentro del ejecutable, junto con los mГіdulos de Node.js que suelen necesitar.
      link: /reference/npm
    - title: APIs del host al estilo Node.js
      details: Temporizadores y un bucle de eventos, process, fs, path, Buffer, streams, events, URL, y servidores y clientes HTTP y TCP.
      link: /es/reference/modules
    - title: Un runtime nativo
      details: Un recolector de basura mark-and-sweep preciso, cadenas UTF-16, excepciones reales, un RangeError capturable ante un desbordamiento de pila y un compilador autoalojado.
      link: /es/guide/how-it-works
    - title: FFI y programas grГЎficos de Windows
      details: Llama a cualquier funciГіn exportada de una DLL en Windows y a cualquier funciГіn de biblioteca compartida en Linux y macOS con declaraciones en tiempo de compilaciГіn, y crea programas de Windows sin ventana de consola, con icono, manifiesto e informaciГіn de versiГіn.
      link: /es/reference/ffi
---

## Ejemplo rГЎpido

<<< ../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux y macOS]
nona build hello.js -o build/hello
./build/hello
```

```sh [CompilaciГіn cruzada]
nona build hello.js -o build/hello --target linux-arm64
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

El ejecutable contiene el cГіdigo mГЎquina del programa y el runtime de Nona. No necesita Node.js: un ejecutable de Windows solo importa `KERNEL32.dll`, y uno de Linux hace llamadas al sistema directamente, sin libc.

## Estado

La versiГіn actual es **v0.25.0**; Nona es experimental. No sustituye directamente a Node.js y no ha pasado una auditorГ­a de seguridad.

- **Conformidad.** En la Гєltima auditorГ­a completa (v0.8.0), la suite Test262 fijada pasГі 22436/22492 pruebas de language, 15868/15933 de built-ins, 268/268 de Atomics y 996/1016 de Annex B en Windows x64. Cada fallo restante estГЎ clasificado en la [pГЎgina de estado](/es/guide/status).
- **Velocidad.** El arranque, el tamaГ±o del ejecutable y la memoria son los puntos fuertes de Nona. El cГіmputo dentro de un programa no tiene JIT: va desde el nivel de V8 en bucles simples hasta varias veces o decenas de veces mГЎs lento en llamadas, asignaciГіn de memoria y programas reales de larga duraciГіn. [Rendimiento](/es/guide/performance) incluye las mediciones y los puntos lentos conocidos.
- **LГ­mites.** `eval` y `Function` necesitan cГіdigo fuente conocido en tiempo de compilaciГіn, y solo existen las APIs de Node.js que implementa Nona. Consulta [Compatibilidad y limitaciones](/es/guide/compatibility).
