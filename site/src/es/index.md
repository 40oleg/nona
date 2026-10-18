---
layout: home

hero:
    name: Nona
    text: De JavaScript a ejecutables nativos
    tagline: Un compilador ahead-of-time que convierte JavaScript ES2020 en pequeños ejecutables autónomos para Windows, Linux, macOS, FreeBSD y OpenBSD. Sin intérprete embebido y sin toolchain de C.
    actions:
        - theme: brand
          text: Empezar
          link: /es/guide/getting-started
        - theme: alt
          text: Pruébalo en el navegador
          link: /playground
        - theme: alt
          text: Qué es Nona
          link: /es/guide/what-is-nona
        - theme: alt
          text: GitHub
          link: https://github.com/40oleg/nona

features:
    - title: Arranca en 2 ms
      details: Un hello world compilado arranca en unos 2 ms y alcanza como máximo 11 MB de memoria, en un archivo de unos 2 MB. Node.js tarda 28 ms y usa 45 MB; un ejecutable Node SEA ocupa 124 MB.
      link: /es/guide/performance
    - title: Ocho destinos desde cualquier host
      details: Windows, Linux y macOS en x64 y ARM64, FreeBSD y OpenBSD en x64. Compila de forma cruzada con --target; cada ejecutable es autónomo.
      link: /reference/native-platforms
    - title: El lenguaje ES2020
      details: Clases, generadores, funciones async, desestructuración, encadenamiento opcional, BigInt, llamadas de cola propias y módulos ES con ciclos y enlaces vivos, con excepciones documentadas.
      link: /es/guide/language-support
    - title: Paquetes npm
      details: Los paquetes de node_modules se resuelven al construir y se compilan dentro del ejecutable, junto con los módulos de Node.js que suelen necesitar.
      link: /reference/npm
    - title: APIs del host al estilo Node.js
      details: Temporizadores y un bucle de eventos, process, fs, path, Buffer, streams, events, URL, y servidores y clientes HTTP y TCP.
      link: /es/reference/modules
    - title: Un runtime nativo
      details: Un recolector de basura mark-and-sweep preciso, cadenas UTF-16, excepciones reales, un RangeError capturable ante un desbordamiento de pila y un compilador autoalojado.
      link: /es/guide/how-it-works
    - title: FFI y programas gráficos de Windows
      details: Llama a cualquier función exportada de una DLL en Windows y a cualquier función de biblioteca compartida en Linux y macOS con declaraciones en tiempo de compilación, y crea programas de Windows sin ventana de consola, con icono, manifiesto e información de versión.
      link: /es/reference/ffi
---

## Ejemplo rápido

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

```sh [Compilación cruzada]
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

El ejecutable contiene el código máquina del programa y el runtime de Nona. No necesita Node.js: un ejecutable de Windows solo importa `KERNEL32.dll`, y uno de Linux hace llamadas al sistema directamente, sin libc.

## Estado

La versión actual es **v0.17.0**; Nona es experimental. No sustituye directamente a Node.js y no ha pasado una auditoría de seguridad.

- **Conformidad.** En la última auditoría completa (v0.8.0), la suite Test262 fijada pasó 22436/22492 pruebas de language, 15868/15933 de built-ins, 268/268 de Atomics y 996/1016 de Annex B en Windows x64. Cada fallo restante está clasificado en la [página de estado](/es/guide/status).
- **Velocidad.** El arranque, el tamaño del ejecutable y la memoria son los puntos fuertes de Nona. El cómputo dentro de un programa no tiene JIT: va desde el nivel de V8 en bucles simples hasta varias veces o decenas de veces más lento en llamadas, asignación de memoria y programas reales de larga duración. [Rendimiento](/es/guide/performance) incluye las mediciones y los puntos lentos conocidos.
- **Límites.** `eval` y `Function` necesitan código fuente conocido en tiempo de compilación, y solo existen las APIs de Node.js que implementa Nona. Consulta [Compatibilidad y limitaciones](/es/guide/compatibility).
