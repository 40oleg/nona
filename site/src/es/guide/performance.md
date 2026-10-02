# Rendimiento: Nona frente a Node.js, Deno y Bun

::: info Traducción
Esta página es una traducción de la página en inglés [Performance](/guide/performance), generada a partir de [`PERFORMANCE.md`](https://github.com/40oleg/nona/blob/main/PERFORMANCE.md). La versión en inglés es la de referencia y puede ser más reciente. `node bench/run.mjs` reproduce las mediciones.
:::

Medido el 2026-10-01 con Nona `v0.7.0` (commit `b31c4d6`). Los scripts están en [`bench/`](https://github.com/40oleg/nona/blob/main/bench/); `node bench/run.mjs` reproduce todas las tablas de abajo.

## Resumen

Nona gana en todo lo que ocurre antes y alrededor del programa: un hello world compilado arranca en **1,8 ms** (Bun 4,5, Deno 15, Node 28), el ejecutable ocupa **7 MB** (81–124 MB con `bun --compile`, `deno compile` y Node SEA) y su RSS máximo es de **11 MB**, donde Node necesita 45 MB.

Dentro del programa la situación se invierte. El cómputo corriente —llamadas a funciones, clausuras, clases, typed arrays, asignación de memoria— es **de 20 a 100 veces más lento** que en V8/JavaScriptCore, que es la diferencia esperable entre un compilador AOT sin cachés en línea ni retroalimentación de tipos y un JIT. Varias operaciones básicas no solo son más lentas, sino **superlineales respecto al tamaño de los datos**, y eso es lo que hace que los programas reales fallen en lugar de simplemente ir más despacio:

| Operación | Nona con 10k | Nona con 100k | Crecimiento | Node con 100k |
| --- | --- | --- | --- | --- |
| `Map.set` × N | 0.83 s | 92.7 s | ×111 (cuadrático) | 14 ms |
| `Set.add` + `Set.has` × N | 1.7 s | 182 s | ×107 (cuadrático) | 12 ms |
| `sort()` de N números | 1.3 s | 20.4 s | ×16 (cuadrático) | 39 ms |
| Cadena de Promise de N `.then` | 363 s | > 10 min | ×145 de 1k a 10k | 7 ms |
| `JSON.stringify`, N objetos | 1.4 s, 1.7 GB RSS | > 10 min | — | 1.6 ms |
| `s += "abc" + i` × N | 0.88 s (10k) | — | ×20 de 2k a 10k | 0.3 ms |
| `readFileSync(..., "utf8")` | 0.37 s (1 MB) | 25 s (10 MB) | ×68 por ×10 | 25 ms |

El autor documenta la causa raíz del primer grupo: el almacenamiento de propiedades, elementos y `Map` es una búsqueda lineal (issue #36). Las cadenas son búferes UTF-16 inmutables que se copian en cada concatenación, y `Array.prototype.join`, `JSON.stringify` y la cola de tareas de Promise se construyen sobre esas dos primitivas.

## Entorno y método

| Participante | Versión | Comando |
| --- | --- | --- |
| Nona | 0.7.0 | `node dist/cli.js build x.js -o x --target linux-x64`, después `./x` |
| Node.js | 22.22.0 | `node x.js` |
| Deno | 2.9.6 | `deno run -A x.js` |
| Bun | 1.4.2 | `bun x.js` |

Linux x86-64, Intel Xeon a 2,10 GHz, 2 vCPU, 7 GB de RAM (sandbox en la nube). Los cuatro ejecutan el mismo archivo fuente. Cada script mide sus fases con `performance.now()` y las imprime como JSON; el tiempo total y el RSS máximo los obtiene el arnés. Las cifras son medianas de 5 ejecuciones (runtimes) o de 3–5 ejecuciones (Nona); la variación de Nona entre ejecuciones es inferior al 5 %. Cada script lee `SCALE` del entorno, así que «N = 100k» significa `SCALE=0.1` del 1M nominal. El arranque se mide con `hyperfine` (30 ejecuciones, 5 de calentamiento). Nona solo compila ES2020 con un subconjunto síncrono de `fs` y sin npm, por lo que los scripts se mantienen dentro de ese subconjunto (`import fs from "node:fs"` en lugar de `require`).

Cuando Nona no terminó un tamaño en 10 minutos, la celda lo indica; las columnas de los demás runtimes para ese tamaño siguen siendo mediciones reales.

## 1–4. Arranque, tamaño del ejecutable, tiempo de compilación, memoria

| Cómo se ejecuta el programa | Arranque, hello world (ms, mediana de 30) | Ejecutable (MB) | Compilar hello world a un exe (s) | RSS máximo, hello world (MB) |
| --- | --- | --- | --- | --- |
| Nona, ELF compilado | **1.8** | **7.3** | 2.7 | **11.5** |
| Bun, `bun build --compile` | 3.2 | 81.3 | **0.25** | 14.5 |
| Bun, `bun x.js` | 4.5 | 79.5 (el propio runtime) | — | 13.1 |
| Deno, `deno compile` | 12.1 | 104.3 | 0.70 | 33.0 |
| Deno, `deno run x.js` | 15.0 | 95.6 (el propio runtime) | — | 28.3 |
| Node, SEA mediante postject | 24.9 | 123.5 | 7.7 | 58.3 |
| Node, `node x.js` | 27.6 | 123.4 (el propio runtime) | — | 45.5 |

El tiempo de compilación de Nona apenas depende del programa (2,7 s para hello world, 3,0 s para la prueba de matrices/BigInt): la mayor parte se va en compilar el runtime y los preludios de JavaScript que entran en cada ejecutable.

RSS máximo bajo carga, scripts a tamaño completo (MB):

| Script | Node | Deno | Bun | Nona |
| --- | --- | --- | --- | --- |
| 09 — 5M objetos de vida corta | 53 | 44 | 29 | **11** |
| 13 — `Float64Array` 10M | 204 | 198 | 181 | 157 |
| 15 — clases, 1M `new Square` | 129 | 124 | 77 | 777 |
| 14 — llamadas, 1M clausuras | 188 | 214 | 120 | 1 993 |
| 11 — JSON, 3k objetos (escala N = 10k) | 74 | 63 | 48 | 1 732 |

El recolector mark-and-sweep mantiene diminutas las cargas que solo generan basura, pero cualquier carga que mantenga un millón de clausuras u objetos vivos, o que construya cadenas, se infla mucho más que en los runtimes con JIT.

## 5–7. Arrays, objetos y Map/Set, cadenas y RegExp

N = 100 000, mediana, ms:

| Operación | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- |
| `push` × N | 5.2 | 6.0 | 3.4 | 192 | ×37 |
| `Array.from({length: N})` | 5.1 | 4.9 | 3.1 | 183 | ×36 |
| `new Array(N)` + relleno | 1.9 | 1.3 | 1.5 | 276 | ×143 |
| Suma con un bucle `for` | 1.5 | 1.9 | 0.6 | 27 | ×18 |
| `map` → `filter` → `reduce` | 4.4 | 4.2 | 4.0 | 119 | ×27 |
| `sort` de N números con comparador | 39 | 40 | 31 | 20 400 | ×523 |
| Crear N objetos `{id, x, y, name}` | 14.1 | 11.9 | 9.7 | 468 | ×33 |
| Leer 3 propiedades × N | 6.8 | 7.4 | 1.2 | 62 | ×9 |
| `Map.set` × N | 13.8 | 14.4 | 18.4 | 92 700 | ×6 700 |
| `Map.get` × N | 5.1 | 5.3 | 5.1 | 90 700 | ×18 000 |
| `Set.add` + `Set.has` × N | 12.2 | 9.7 | 15.2 | 182 500 | ×15 000 |

Con el N = 1M nominal, Node/Deno/Bun ejecutan todo el script de arrays en 0,4–0,9 s y el de objetos en 0,5–0,6 s. Nona ordenó 1M números en 278 s en una primera ejecución; el script de objetos completo no terminó en 10 minutos.

Las cadenas se miden con N = 10 000 porque con 100 000 el kernel mató el binario de Nona tras 30 s con 6 GB de RSS: `Array.prototype.join` sobre 20k partes construye cadenas intermedias y su memoria crece cuadráticamente (4k partes → 450 MB). `s += …` es cuadrático en tiempo (2k iteraciones → 43 ms, 10k → 881 ms); el motor de RegExp es lineal, pero gasta unos 0,5 ms por carácter.

| Operación (N = 10 000) | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- |
| `s += "abc" + i` × 2 000 | 0.29 | 0.49 | 0.89 | 45 | ×156 |
| `split("1")` + `join("-")` | 0.12 | 0.14 | 0.29 | 56 | ×470 |
| `indexOf` en un bucle | 0.02 | 0.02 | 0.02 | 0.06 | ×3 |
| `/abc(\d{3})-/g.exec` en un bucle | 0.06 | 0.07 | 0.10 | 794 | ×13 000 |

Con un N tan pequeño, las cifras de Node/Deno/Bun son sobre todo calentamiento del JIT, así que los cocientes de esta tabla, en todo caso, se quedan cortos.

## 8–10. Cálculo numérico, presión sobre el GC, async

| Operación | Tamaño | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- | --- |
| `fib(32)` recursivo | — | 23 | 24.5 | 18.3 | 568 | ×25 |
| Multiplicación de matrices 200×200, arrays anidados | — | 30 | 35.6 | 36.6 | 25 700 | ×857 |
| Factorial BigInt 30! | 30 | 0.17 | 0.11 | 0.22 | 0.25 | ×1.5 |
| Factorial BigInt 300! | 300 | 0.20 | 0.28 | 0.37 | 2 340 | ×11 700 |
| Factorial BigInt 3000! | 3000 | 3.8 | 3.1 | 3.8 | > 10 min | — |
| 500k `{a, b: [..], c: {..}}` de vida corta | 500k | 19.7 | 15.6 | 27.2 | 1 840 | ×93 |
| 5M objetos de vida corta | 5M | 94.6 | 98.1 | 156 | 20 100 | ×213 |
| Cadena de Promise, `.then` × 10 000 | 10k | 6.8 | 4.1 | 2.9 | 363 000 | ×53 000 |
| `setTimeout(fn, 0)` × 100, secuencial | 100 | 117 | 221 | 114 | 123 | ×1.0 |

El `fib(32)` recursivo es el mejor resultado de cómputo de Nona (×25), más o menos donde queda un intérprete sin JIT. La multiplicación de matrices lee `A[i][k]` 8 millones de veces a través del almacenamiento lineal de elementos. La multiplicación de BigInt se degrada con el tamaño de los operandos: 30! iguala a Node, 300! tarda 2,3 s y 3000! no terminó.

La cadena de Promise es el segundo precipicio después de las colecciones: 1 000 `.then` tardan 2,6 s, 4 000 tardan 40 s y 10 000 tardan 363 s; es peor que cuadrático, coherente con que la cola de tareas se recorra desde el principio en cada tarea. Los temporizadores van bien: `setTimeout(fn, 0)` cuesta alrededor de 1,2 ms en todos, porque todos los runtimes limitan el retardo a 1 ms como mínimo.

## 11–13. JSON, E/S de archivos, typed arrays

| Operación | Tamaño | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- | --- |
| `JSON.stringify` | 3 000 objetos, 280 KB | 1.6 | 1.1 | 1.1 | 1 400 | ×900 |
| `JSON.parse` | 280 KB | 3.8 | 2.1 | 3.7 | 173 | ×45 |
| `appendFileSync` × 10 | 10 MB | 5.9 | 12.0 | 3.3 | 4 530 | ×770 |
| `readFileSync(path, "utf8")` | 10 MB | 25.2 | 26.8 | 6.0 | 25 200 | ×1 000 |
| `Float64Array`: relleno, suma, map | 1M | 21.1 | 17.1 | 16.2 | 360 | ×17 |
| `Float64Array`: relleno, suma, map | 10M | 159 | 132 | 115 | 3 240 | ×20 |

Los typed arrays son la única prueba de datos en la que Nona se mantiene dentro de un orden de magnitud y escala linealmente. JSON y los archivos chocan con la misma construcción cuadrática de cadenas: `JSON.stringify` de 3 000 objetos tarda 1,4 s y usa 1,7 GB; el escenario completo de 300k objetos / 30 MB y el archivo de 100 MB no terminaron en 10 minutos, mientras que Node, Deno y Bun tardan 0,1–0,7 s.

## 14–15. Llamadas a funciones, clausuras, clases

| Operación | N = 100k | | | | | N = 1M | |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | Node | Deno | Bun | Nona | Nona / Node | Node | Nona |
| Llamar a `add(a, b)` × 10N | 5.3 | 7.6 | 6.1 | 375 | ×71 | 10.9 | 3 590 |
| Crear y llamar N clausuras | 21.3 | 18.1 | 20.6 | 872 | ×41 | 256 | 12 000 |
| `call` + `apply` × 4N | 9.1 | 10.8 | 5.2 | 656 | ×72 | 32.6 | 12 000 |
| Método a través de una cadena de herencia × 5N | 5.3 | 3.7 | 5.8 | 354 | ×67 | 7.6 | 3 710 |
| Llamada polimórfica, 3 clases × 5N | 5.5 | 8.6 | 15.5 | 532 | ×96 | 21.5 | 5 830 |
| `new Square(i)` × N | 14.9 | 9.0 | 13.7 | 774 | ×52 | 112 | 10 560 |

Estas operaciones escalan linealmente, así que aquí la diferencia es el coste puro de una llamada sin JIT: V8 y JavaScriptCore insertan en línea `add(s, i)` y cachean la búsqueda del método en el punto de llamada, mientras que Nona toma cada vez la ruta genérica con una búsqueda en la cadena de prototipos. `apply` con un array nuevo en cada llamada es la excepción que crece más rápido que lineal (×72 con 100k, ×369 con 1M), igual que `new` con un millón de instancias vivas (777 MB de RSS).

## Adónde va el tiempo

Agrupando los cocientes frente a Node por su causa:

1. **Almacenamiento lineal de propiedades/elementos/Map** (issue #36): `Map`/`Set` ×7 000–18 000, `sort` ×523, multiplicación de matrices ×857, `new Array(N)` ×143. Arreglar las estructuras de datos convierte estos casos en el ~×30 del código que los rodea.
2. **Copia de cadenas**: concatenación ×156, `join` ×470 con memoria cuadrática, `JSON.stringify` ×900, `readFileSync` utf8 ×1 000, `appendFileSync` ×770. Una representación tipo rope o builder, junto con la transcodificación masiva UTF-8/UTF-16, resuelve todo esto a la vez.
3. **Cola de tareas de Promise** ×53 000 y **multiplicación de BigInt** ×11 700 con 300 dígitos: ambos son problemas algorítmicos, independientes de la generación de código.
4. **VM de RegExp** ×13 000: un intérprete de bytecode escrito en JavaScript y compilado a su vez por Nona, por lo que paga el sobrecoste de llamada ×30 por instrucción.
5. **Sin JIT**: llamadas ×70, clausuras ×41, clases ×50–100, asignación de memoria ×93–213, `fib` ×25, typed arrays ×17–20, recorrido de arrays ×18–37. Las respuestas habituales en un contexto AOT son las cachés en línea, el acceso a propiedades basado en shapes y la aritmética con números sin boxing.
