# Soporte del lenguaje

Nona apunta a la 11.ª edición de ECMA-262 (ES2020) con excepciones documentadas. Esta página resume qué está soportado en **v0.8.0**; las cifras provienen de la revisión fijada de Test262 descrita en la página de [Test262](/es/reference/test262).

**Soportado** significa implementado y cubierto por pruebas unitarias y Test262 dentro de los límites indicados en la columna Notas. La matriz detallada por característica, con los nombres de las pruebas, se mantiene en [`docs/language-support.md`](https://github.com/40oleg/nona/blob/main/docs/language-support.md) (en ruso).

## Lenguaje

| Área | Estado | Notas |
| --- | --- | --- |
| Gramática léxica y literales | Soportado | Literales decimales, hexadecimales, binarios, octales y BigInt, escapes Unicode en identificadores y cadenas, plantillas literales. Octales heredados y comentarios de tipo HTML del Annex B en scripts no estrictos. Los separadores numéricos (ES2021) se rechazan. |
| `var`, `let`, `const`, TDZ | Soportado | Hoisting, ámbito de bloque, enlaces por iteración, conflictos de declaración como errores tempranos. |
| Funciones | Soportado | Declaraciones y expresiones, clausuras, `arguments` (mapeado y no mapeado), parámetros por defecto y rest, parámetros desestructurados, `this`, `new.target`, `Function.prototype.toString` con el texto fuente exacto. |
| Funciones flecha | Soportado | `this`, `arguments`, `new.target` y `super` léxicos; flechas `async`. |
| Clases | Soportado | Declaraciones y expresiones, constructores, métodos y accesores de instancia y estáticos, nombres calculados, herencia (incluidos objetos integrados y `extends null`), `super()` y `super.x`. Los campos de clase y los nombres privados (ES2022) no están soportados. |
| Desestructuración, spread | Soportado | Declaraciones, asignaciones, parámetros, destinos de `for-in`/`for-of`; spread en arrays, objetos, llamadas y `new`. |
| Iteradores y generadores | Soportado | El protocolo de iteración, `for-of`, funciones y métodos generadores, `yield*`, `return`/`throw`. |
| Funciones async | Soportado | Funciones, flechas y métodos async, `await`, generadores async y `for await`, con el orden de tareas de ES2020. |
| Operadores | Soportado | Incluidos `**`, encadenamiento opcional, `??`, `delete`, `in`, `instanceof` con `Symbol.hasInstance`, aritmética y comparaciones de BigInt. |
| Control de flujo | Soportado | Todas las sentencias, etiquetas, `try`/`catch`/`finally` con valores de finalización, `switch`, `debugger` (no hace nada). |
| Modo estricto | Soportado | Prólogos de directivas, `this` estricto, errores tempranos y restricciones en tiempo de ejecución. |
| `with` | Soportado | Solo en scripts no estrictos, con `Symbol.unscopables`. |
| Llamadas de cola propias | Soportado | En código estricto. |
| Módulos | Soportado | `import`/`export` en todas sus formas, ciclos, enlaces vivos, objetos namespace, `import.meta`, `import()` de módulos conocidos en tiempo de compilación. El `await` de nivel superior (ES2022) no está soportado. |
| `eval`, `Function` | Parcial | El código conocido en tiempo de compilación se compila de antemano con la semántica completa de `eval` directo e indirecto; el código calculado en tiempo de ejecución lanza `EvalError`. Consulta [Compatibilidad](/es/guide/compatibility#eval-and-function). |
| Annex B | Soportado | Semántica de compatibilidad web para funciones en bloques, `__proto__`, sintaxis heredada de RegExp, `escape`/`unescape`, métodos HTML de String y más. |

## Objetos integrados

| Área | Estado | Notas |
| --- | --- | --- |
| Object, Function, Boolean, Symbol, Error | Soportado | Incluidos los descriptores de propiedad, las operaciones de integridad y los símbolos globales y well-known. |
| Number, Math, funciones URI | Soportado | Formato numérico de ida y vuelta más corto, `toFixed`/`toExponential`/`toPrecision`, todas las funciones de `Math` de ES2020. |
| String | Soportado | Métodos de ES2020, normalización Unicode, `localeCompare` sin datos de configuración regional de ECMA-402. |
| RegExp | Soportado | Grupos con nombre, lookbehind, flags `s`, `u`, `y` y `g`, escapes de propiedades Unicode, `matchAll`. El motor es una VM con backtracking escrita como preludio; es más lento que el de V8. |
| Array | Soportado | Todos los métodos de ES2020, species, huecos y longitudes muy grandes. |
| Date, JSON | Soportado | Análisis y formato de fechas en UTC y hora local, `JSON.parse` con reviver, `JSON.stringify` con replacer e indentación. |
| Map, Set, WeakMap, WeakSet | Soportado | Semántica de efímeros para las colecciones débiles. |
| ArrayBuffer, DataView, typed arrays | Soportado | Los 11 tipos de typed array, incluidos los arrays BigInt, desvinculación (detach), species. |
| SharedArrayBuffer, Atomics | Soportado | Incluido `Atomics.wait`/`notify` con agentes trabajadores (usados por Test262). |
| Proxy, Reflect | Soportado | Todas las trampas e invariantes. |
| Promise | Soportado | `all`, `allSettled`, `race`, `finally`, thenables y notificación de rechazos no gestionados. |
| `globalThis`, `console.log` | Soportado | `console.log` escribe UTF-8 en la salida estándar. |

## Más allá de ES2020

Las características de ediciones posteriores no están soportadas: campos de clase y nombres privados, bloques estáticos, `Promise.any`, `WeakRef` y `FinalizationRegistry`, operadores de asignación lógica, separadores numéricos, el flag `v` de RegExp, `await` de nivel superior y `Array.prototype.at`. Algunas incorporaciones posteriores a la biblioteca, como `String.prototype.replaceAll`, sí están disponibles. Cuando la revisión fijada de Test262 ya comprueba semántica más reciente para características de ES2020, Nona sigue a Test262; la página de [Test262](/es/reference/test262#semantics-newer-than-es2020-in-the-pinned-test262) enumera esos casos.

Las APIs del host que no forman parte de ECMAScript —temporizadores, `process`, `node:fs`, `TextEncoder`/`TextDecoder` y FFI— se describen en la [Referencia](/es/reference/modules).

## Resultados de Test262

Ejecución completa de Test262 fijado en Windows x64 (características de ES2020 y anteriores):

| Directorio | Superadas / aplicables | Fallos restantes |
| --- | --- | --- |
| `language/` | 22436 / 22492 | 44 `eval`, 1 semántica más reciente, 11 otros |
| `built-ins/` | 15868 / 15933 | 16 `eval`, 12 semántica más reciente, 37 otros |
| `built-ins/Atomics` (agentes) | 268 / 268 | — |
| `annexB/` | 996 / 1016 | 20 `eval` |

Los fallos de tipo «`eval`» usan código fuente calculado en tiempo de ejecución, `$262.evalScript` u otros realms; las pruebas de «semántica más reciente» comprueban comportamiento de ediciones posteriores bajo una etiqueta de característica antigua o ausente. La [página de estado](/es/guide/status) enumera los fallos restantes.

Script functions can shadow built-in and host global names such as `escape`, `unescape`, `process`, timers and `TextEncoder`/`TextDecoder`. Runtime initialization completes first; declarations install writable, enumerable, nonconfigurable global properties.
