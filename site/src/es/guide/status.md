# Estado y hoja de ruta

## VersiГіn actual

**v0.25.0**: consulta el [registro de cambios](/changelog) (en inglГ©s). Nona es experimental: no ha pasado una auditorГ­a de seguridad y no sustituye directamente a Node.js.

## AuditorГ­a de Test262

La Гєltima auditorГ­a completa de Test262 fijado, en Windows x64 para v0.8.0 (`scripts/test262-audit.ps1 -Unit`, caracterГ­sticas de ES2020 y anteriores mГЎs las posteriores soportadas, como los elementos de clase de ES2022):

| Directorio                    | Superadas / aplicables          | Fallos restantes                               |
| ----------------------------- | ------------------------------- | ---------------------------------------------- |
| `language/`                   | **22436 / 22492** (26 omitidas) | 44 `eval`, 1 semГЎntica mГЎs reciente, 11 otros  |
| `built-ins/`                  | **15868 / 15933**               | 16 `eval`, 12 semГЎntica mГЎs reciente, 37 otros |
| `built-ins/Atomics` (agentes) | **268 / 268**                   | вЂ”                                              |
| `annexB/`                     | **996 / 1016** (8 omitidas)     | 20 `eval`                                      |

La clasificaciГіn la hace `scripts/test262-summary.mjs`: las pruebas В«`eval`В» llaman a `eval` o `$262.evalScript` con cГіdigo fuente que Nona no puede conocer en tiempo de compilaciГіn; las pruebas de В«semГЎntica mГЎs recienteВ» comprueban comportamiento de ediciones posteriores (el flag `v`, separadores numГ©ricos, `Promise.any`, вЂ¦) bajo una etiqueta de caracterГ­stica antigua o ausente. La suite unitaria se ejecuta en Windows y Linux en CI y compila y ejecuta archivos PE y ELF reales, muchos bajo estrГ©s del GC. CГіmo ejecutar las auditorГ­as se describe en la pГЎgina de [Test262](/es/reference/test262).

## MГ©todos de copia de arrays

Comprobado despuГ©s de la auditorГ­a con la revisiГіn fijada de Test262 (Windows x64, [#308](https://github.com/40oleg/nona/issues/308)): los directorios `built-ins/Array/prototype/{toSorted,toReversed,toSpliced,with}` y `Symbol.unscopables` pasan 94 de 94, sin fallos pendientes. Las variantes de `%TypedArray%` no estГЎn implementadas; vГ©ase la [base de Test262](https://github.com/40oleg/nona/blob/main/docs/test262.md) (en inglГ©s).

## Fallos restantes

Estos son los fallos de la auditorГ­a de v0.8.0; las versiones posteriores no han repetido la ejecuciГіn completa. Todos los fallos В«otrosВ» en Windows estГЎn clasificados:

- `built-ins/Function` (26): el cГіdigo de la funciГіn proviene de `toString` de objetos en tiempo de ejecuciГіn, es decir, la excepciГіn de `eval`.
- `is-a-constructor` para `AsyncFunction`, `AsyncGeneratorFunction` y `GeneratorFunction`, y la prueba de `prototype` de las flechas async (4): el arnГ©s de Test262 construye el cГіdigo fuente en tiempo de ejecuciГіn.
- Otros realms (8): prototipos por defecto de otro realm ([#7](https://github.com/40oleg/nona/issues/7), cerrado despuГ©s de la auditorГ­a).
- Clases creadas mediante `Function`, tambiГ©n en otro realm (10, `language/expressions/class`): cГіdigo fuente construido en tiempo de ejecuciГіn. Las mismas pruebas mediante un alias de `eval` cuentan como fallos de `eval`.

La auditorГ­a de v0.8.0 tambiГ©n encontrГі siete fallos graves (`Array.prototype.indexOf` sobre `Math` con un elemento, claves heredadas y propias de typed arrays) introducidos con los elementos densos; se corrigieron en [#119](https://github.com/40oleg/nona/issues/119), y la nueva ejecuciГіn de `built-ins/Array` y `built-ins/TypedArrayConstructors` tras la correcciГіn (incluida arriba) los supera.

## Trabajo pendiente

Carencias del lenguaje y de la biblioteca:

- [#44](https://github.com/40oleg/nona/issues/44): reacciones de Promise, con un tipo de promesa propio y un registro por cada `then`.

Rendimiento, la lГ­nea principal de la [hoja de ruta](https://github.com/40oleg/nona/blob/main/docs/roadmap.md):

- Llamadas y asignaciГіn de memoria: [#47](https://github.com/40oleg/nona/issues/47) (coste de las llamadas), [#48](https://github.com/40oleg/nona/issues/48) (objetos de vida corta), [#235](https://github.com/40oleg/nona/issues/235) (inlining), [#236](https://github.com/40oleg/nona/issues/236) (reemplazo escalar).
- CГіdigo generado: [#237](https://github.com/40oleg/nona/issues/237)вЂ“[#242](https://github.com/40oleg/nona/issues/242) (encadenamiento opcional, `%`, llamadas directas, bucles sobre typed arrays, tablas de saltos de `switch`, comprobaciones de zona muerta).
- Biblioteca: [#155](https://github.com/40oleg/nona/issues/155) (`JSON.stringify`), [#258](https://github.com/40oleg/nona/issues/258) (bГєsqueda del inicio en RegExp), [#262](https://github.com/40oleg/nona/issues/262) (`shift` y `splice` en arrays grandes).

La lista completa estГЎ en [GitHub](https://github.com/40oleg/nona/issues).

## Informes detallados

- [Estado de ES2020 para 0.17вЂ“0.20](https://github.com/40oleg/nona/blob/main/docs/status.md) (en ruso)
- [Historial de versiones](/changelog) y el [registro de desarrollo](https://github.com/40oleg/nona/blob/main/docs/history/development-log.md) (en ruso)
- [Hoja de ruta: plan inspirado en V8 y arquitecturas objetivo (en inglГ©s)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [Hoja de ruta de versiones 0.4вЂ“0.20](https://github.com/40oleg/nona/blob/main/docs/history/release-roadmap-0.4-0.20.md) (en ruso)
