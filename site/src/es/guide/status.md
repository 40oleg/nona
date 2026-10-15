# Estado y hoja de ruta

## Versión actual

**v0.12.0**: consulta el [registro de cambios](/changelog) (en inglés). Nona es experimental: no ha pasado una auditoría de seguridad y no sustituye directamente a Node.js.

## Auditoría de Test262

La última auditoría completa de Test262 fijado, en Windows x64 para v0.8.0 (`scripts/test262-audit.ps1 -Unit`, características de ES2020 y anteriores más las posteriores soportadas, como los elementos de clase de ES2022):

| Directorio                    | Superadas / aplicables          | Fallos restantes                               |
| ----------------------------- | ------------------------------- | ---------------------------------------------- |
| `language/`                   | **22436 / 22492** (26 omitidas) | 44 `eval`, 1 semántica más reciente, 11 otros  |
| `built-ins/`                  | **15868 / 15933**               | 16 `eval`, 12 semántica más reciente, 37 otros |
| `built-ins/Atomics` (agentes) | **268 / 268**                   | —                                              |
| `annexB/`                     | **996 / 1016** (8 omitidas)     | 20 `eval`                                      |

La clasificación la hace `scripts/test262-summary.mjs`: las pruebas «`eval`» llaman a `eval` o `$262.evalScript` con código fuente que Nona no puede conocer en tiempo de compilación; las pruebas de «semántica más reciente» comprueban comportamiento de ediciones posteriores (el flag `v`, separadores numéricos, `Promise.any`, …) bajo una etiqueta de característica antigua o ausente. La suite unitaria se ejecuta en Windows y Linux en CI y compila y ejecuta archivos PE y ELF reales, muchos bajo estrés del GC. Cómo ejecutar las auditorías se describe en la página de [Test262](/es/reference/test262).

## Métodos de copia de arrays

Comprobado después de la auditoría con la revisión fijada de Test262 (Windows x64, [#308](https://github.com/40oleg/nona/issues/308)): los directorios `built-ins/Array/prototype/{toSorted,toReversed,toSpliced,with}` y `Symbol.unscopables` pasan 94 de 94, sin fallos pendientes. Las variantes de `%TypedArray%` no están implementadas; véase la [base de Test262](https://github.com/40oleg/nona/blob/main/docs/test262.md) (en inglés).

## Fallos restantes

Estos son los fallos de la auditoría de v0.8.0; las versiones posteriores no han repetido la ejecución completa. Todos los fallos «otros» en Windows están clasificados:

- `built-ins/Function` (26): el código de la función proviene de `toString` de objetos en tiempo de ejecución, es decir, la excepción de `eval`.
- `is-a-constructor` para `AsyncFunction`, `AsyncGeneratorFunction` y `GeneratorFunction`, y la prueba de `prototype` de las flechas async (4): el arnés de Test262 construye el código fuente en tiempo de ejecución.
- Otros realms (8): prototipos por defecto de otro realm ([#7](https://github.com/40oleg/nona/issues/7), cerrado después de la auditoría).
- Clases creadas mediante `Function`, también en otro realm (10, `language/expressions/class`): código fuente construido en tiempo de ejecución. Las mismas pruebas mediante un alias de `eval` cuentan como fallos de `eval`.

La auditoría de v0.8.0 también encontró siete fallos graves (`Array.prototype.indexOf` sobre `Math` con un elemento, claves heredadas y propias de typed arrays) introducidos con los elementos densos; se corrigieron en [#119](https://github.com/40oleg/nona/issues/119), y la nueva ejecución de `built-ins/Array` y `built-ins/TypedArrayConstructors` tras la corrección (incluida arriba) los supera.

## Trabajo pendiente

Carencias del lenguaje y de la biblioteca:

- [#11](https://github.com/40oleg/nona/issues/11): `eval` y `Function` con código calculado en tiempo de ejecución.
- [#44](https://github.com/40oleg/nona/issues/44): reacciones de Promise, con un tipo de promesa propio y un registro por cada `then`.

Rendimiento, la línea principal de la [hoja de ruta](https://github.com/40oleg/nona/blob/main/docs/roadmap.md):

- Llamadas y asignación de memoria: [#47](https://github.com/40oleg/nona/issues/47) (coste de las llamadas), [#48](https://github.com/40oleg/nona/issues/48) (objetos de vida corta), [#235](https://github.com/40oleg/nona/issues/235) (inlining), [#236](https://github.com/40oleg/nona/issues/236) (reemplazo escalar).
- Código generado: [#237](https://github.com/40oleg/nona/issues/237)–[#242](https://github.com/40oleg/nona/issues/242) (encadenamiento opcional, `%`, llamadas directas, bucles sobre typed arrays, tablas de saltos de `switch`, comprobaciones de zona muerta).
- Biblioteca: [#155](https://github.com/40oleg/nona/issues/155) (`JSON.stringify`), [#258](https://github.com/40oleg/nona/issues/258) (búsqueda del inicio en RegExp), [#262](https://github.com/40oleg/nona/issues/262) (`shift` y `splice` en arrays grandes).

La lista completa está en [GitHub](https://github.com/40oleg/nona/issues).

## Informes detallados

- [Estado de ES2020 para 0.17–0.20](https://github.com/40oleg/nona/blob/main/docs/status.md) (en ruso)
- [Historial de versiones](/changelog) y el [registro de desarrollo](https://github.com/40oleg/nona/blob/main/docs/history/development-log.md) (en ruso)
- [Hoja de ruta: plan inspirado en V8 y arquitecturas objetivo (en inglés)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [Hoja de ruta de versiones 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/history/release-roadmap-0.4-0.20.md) (en ruso)
