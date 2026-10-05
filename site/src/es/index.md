---
layout: home

hero:
  name: Nona
  text: De JavaScript a ejecutables nativos
  tagline: Un compilador ahead-of-time que convierte JavaScript ES2020 en ejecutables autónomos para Windows y Linux x64. Sin intérprete embebido y sin toolchain de C. Windows/Linux ARM64, macOS Intel, FreeBSD/OpenBSD x64.
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
    details: Un hello world compilado arranca en 1,8 ms y alcanza como máximo 11 MB de memoria, en un ejecutable de 3 MB. Node.js tarda 28 ms y usa 45 MB; un ejecutable Node SEA ocupa 124 MB.
    link: /es/guide/performance
  - title: El lenguaje ES2020
    details: Clases, generadores, funciones async, desestructuración, encadenamiento opcional, BigInt, llamadas de cola propias y módulos ES con ciclos y enlaces vivos, con excepciones documentadas.
    link: /es/guide/language-support
  - title: Un runtime nativo
    details: Un recolector de basura mark-and-sweep preciso, cadenas UTF-16, excepciones reales y un RangeError capturable ante un desbordamiento de pila, enlazados en cada ejecutable.
    link: /es/guide/how-it-works
  - title: APIs del host
    details: Un bucle de eventos con temporizadores, un process global, node:fs síncrono, TextEncoder y TextDecoder.
    link: /es/reference/host-apis
  - title: FFI y nona:win32
    details: Llama a cualquier función exportada de una DLL en Windows con declaraciones en tiempo de compilación; incluye enlaces listos para user32, kernel32 y advapi32.
    link: /es/reference/ffi
  - title: Ejecutables gráficos de Windows
    details: Programas sin ventana de consola, con icono, manifiesto de aplicación e información de versión.
    link: /es/reference/windows-executables
---

## Ejemplo rápido

<<< ../../samples/hello.js

::: code-group

```sh [Windows]
node dist/cli.js build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux]
node dist/cli.js build hello.js -o build/hello --target linux-x64
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

El ejecutable contiene el código máquina del programa y el runtime de Nona. No necesita Node.js: un ejecutable de Windows solo importa `KERNEL32.dll`, y uno de Linux hace llamadas al sistema directamente, sin libc.

## Estado

La versión actual es **v0.8.0**. La suite Test262 fijada (características de ES2020) pasa 22436/22492 pruebas de language, 15868/15933 de built-ins, 268/268 de Atomics y 996/1016 de Annex B en Windows x64; cada fallo restante está clasificado en la [página de estado](/es/guide/status). El arranque, el tamaño del ejecutable y la memoria son los puntos fuertes de Nona; el cómputo dentro de un programa es de 20 a 100 veces más lento que en V8, y algunas operaciones (`Map`, `sort`, construcción de cadenas, cadenas largas de Promise) siguen siendo superlineales; consulta [Rendimiento](/es/guide/performance). Nona es experimental: no sustituye directamente a Node.js y no ha pasado una auditoría de seguridad.
