# Estado y hoja de ruta

## Versión actual

**v0.7.0**: consulta el [registro de cambios](/changelog) (en inglés). Nona es experimental: no ha pasado una auditoría de seguridad y no sustituye directamente a Node.js.

## Auditoría de Test262

Test262 fijado completo en Windows x64 (`scripts/test262-audit.ps1 -Unit`, características de ES2020 y anteriores):

| Directorio | Superadas / aplicables | Fallos restantes |
| --- | --- | --- |
| `language/` | **17298 / 17337** (26 omitidas) | 30 `eval`, 6 semántica más reciente, 3 otros |
| `built-ins/` | **15491 / 15559** | 16 `eval`, 14 semántica más reciente, 38 otros |
| `built-ins/Atomics` (agentes) | **268 / 268** | — |
| `annexB/` | **996 / 1016** (8 omitidas) | 20 `eval` |

La clasificación la hace `scripts/test262-summary.mjs`: las pruebas «`eval`» llaman a `eval` o `$262.evalScript` con código fuente que Nona no puede conocer en tiempo de compilación; las pruebas de «semántica más reciente» comprueban comportamiento de ediciones posteriores (el flag `v`, separadores numéricos, `Promise.any`, …) bajo una etiqueta de característica antigua o ausente. La suite unitaria se ejecuta en Windows y Linux en CI y compila y ejecuta archivos PE y ELF reales, muchos bajo estrés del GC. Cómo ejecutar las auditorías se describe en la página de [Test262](/es/reference/test262).

## Fallos restantes

Todos los fallos «otros» en Windows están clasificados:

- `built-ins/Function` (25): el código de la función proviene de `toString` de objetos en tiempo de ejecución, es decir, la excepción de `eval`.
- `is-a-constructor` para `AsyncFunction`, `AsyncGeneratorFunction` y `GeneratorFunction` (4): el arnés de Test262 construye el código fuente en tiempo de ejecución.
- Otros realms (7): prototipos por defecto de otro realm ([#7](https://github.com/40oleg/nona/issues/7)).
- Campos privados de clase en objetos no extensibles (2): campos privados de ES2022 sin etiqueta de característica más reciente.

## Trabajo pendiente

- [#11](https://github.com/40oleg/nona/issues/11): `eval` y `Function` con código calculado en tiempo de ejecución.
- [#7](https://github.com/40oleg/nona/issues/7): prototipos por defecto de otros realms para los constructores de los preludios.
- [#13](https://github.com/40oleg/nona/issues/13), [#36](https://github.com/40oleg/nona/issues/36): elementos densos de arrays y tablas hash para `Map`/`Set`.

La lista completa está en [GitHub](https://github.com/40oleg/nona/issues).

## Informes detallados

- [Estado de ES2020 para 0.17–0.20](https://github.com/40oleg/nona/blob/main/docs/v0.17-v0.20-status.md) (en ruso)
- [Estado de v0.6](https://github.com/40oleg/nona/blob/main/docs/v0.6-status.md) (en inglés)
- [Hoja de ruta: plan inspirado en V8 y arquitecturas objetivo (en inglés)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [Hoja de ruta de versiones 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/release-roadmap-0.4-0.20.md) (en ruso)
