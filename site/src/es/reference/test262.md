# Línea base de Test262

::: info Traducción
Esta página es una traducción de la página en inglés [Test262 baseline](/reference/test262), generada a partir de [`docs/test262.md`](https://github.com/40oleg/nona/blob/main/docs/test262.md). La versión en inglés es la de referencia y puede ser más reciente.
:::

El runner usa la revisión de Test262 del repositorio original `7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd`. Intencionadamente no incluye una copia de Test262 en este repositorio. En Windows x64:

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/tc39/test262.git work/test262
git -C work/test262 sparse-checkout set harness test/language/expressions/coalesce test/language/expressions/arrow-function test/language/expressions/array test/language/expressions/call test/language/expressions/new test/language/expressions/template-literal test/language/rest-parameters test/language/statements/function test/language/statements/for-in test/language/statements/for-of test/built-ins/Symbol test/built-ins/Array/prototype/includes test/built-ins/Array/prototype/pop test/built-ins/Math/pow test/built-ins/Math/min test/built-ins/Math/max test/built-ins/Math/abs test/built-ins/Math/sign test/built-ins/Math/sqrt test/built-ins/Math/trunc test/built-ins/Math/floor test/built-ins/Math/ceil test/built-ins/Math/round test/built-ins/String/prototype/includes test/built-ins/Number/isFinite test/built-ins/Number/isInteger test/built-ins/Number/isNaN test/built-ins/Number/isSafeInteger
git -C work/test262 rev-parse HEAD
git -C work/test262 sparse-checkout add test/built-ins/Math/imul test/built-ins/Math/clz32
npm ci
npm run test262:smoke
node scripts/test262-smoke.mjs language/expressions/coalesce
```

El mismo runner también funciona en Linux x64: en ese caso compila imágenes ELF `linux-x64` en lugar de archivos PE y reintenta la condición de carrera transitoria `ETXTBSY` al hacer exec que los hilos trabajadores pueden provocar en Linux. Define `TEST262_DELETE_BINARIES=1` para borrar cada imagen de prueba compilada después de ejecutarla; de lo contrario, los catálogos grandes dejan varios gigabytes en `work/test262-smoke`.

El checkout debe estar en la revisión fijada. Si el HEAD del repositorio original ha avanzado, haz fetch/checkout de ese commit exacto antes de ejecutar. `TEST262_ROOT` selecciona otro checkout y `TEST262_REPORT` otra ruta para el informe JSON. `TEST262_JOBS` ejecuta hasta ocho hilos trabajadores en paralelo (el valor predeterminado es uno) y conserva el orden del informe. Por ejemplo, define `TEST262_JOBS=4` antes de ejecutar un catálogo grande. `TEST262_PATH_FILTER` incluye las rutas que coinciden; `TEST262_EXCLUDE_PATH_FILTER` las omite. Ambos son filtros de subcadena literal. El comando sin argumentos ejecuta el manifiesto revisado de `tests/test262-smoke.json`; un argumento con un directorio relativo ejecuta todos los archivos `.js` bajo ese grupo de Test262. Los informes distinguen fallos de compilación, fallos en tiempo de ejecución y pruebas omitidas.

## Auditorías completas

`scripts/test262-audit.ps1` (Windows) y `scripts/test262-audit.sh` (Linux) ejecutan cada directorio de Test262 bajo `language/`, `annexB/` y `built-ins/` con `TEST262_EXCLUDE_FEATURES=post-es2020`, con un informe por directorio en `work/test262-audit` (reanudable). `-Dirs 'a,b' -Tag r1` (PowerShell) o `TAG=r1 scripts/test262-audit.sh <out> a b` vuelve a ejecutar los directorios seleccionados en un subdirectorio cuyos resultados prevalecen sobre la ejecución completa. Para resumir y clasificar:

```
node scripts/test262-summary.mjs work/test262-audit --others work/others.txt
node scripts/test262-summary.mjs work/test262-audit --compare work/previous-audit
```

El resumen clasifica cada fallo como `eval` (la prueba usa eval; con fuentes de eval en tiempo de compilación, se trata sobre todo de fuentes en tiempo de ejecución, `$262.evalScript` u otros realms), `post` (semántica posterior a ES2020 bajo una etiqueta de característica antigua o ausente) u `other`, y enumera los archivos `other` (`--evals <file>` enumera los de eval). `TEST262_FILE_LIST=<file>` restringe una ejecución de `scripts/test262-smoke.mjs <group>` a las rutas enumeradas, por ejemplo para volver a ejecutar esa lista. Un checkout sin metadatos de git (por ejemplo, uno copiado a otra máquina) se acepta si `work/test262/.nona-test262-revision` contiene el hash del commit fijado; las pruebas de terminadores de línea leen entonces los archivos directamente.

## Semántica posterior a ES2020 en el Test262 fijado {#semantics-newer-than-es2020-in-the-pinned-test262}

El Test262 fijado (2026) a veces comprueba comportamiento introducido después de ES2020 sin una etiqueta de característica posterior a ES2020. Política (issue #17): cuando una edición posterior solo eliminó una peculiaridad observable de ES2020 de la que los programas no dependen, Nona sigue al Test262 fijado; todo lo demás se queda en ES2020 y `scripts/test262-summary.mjs` lo clasifica como `post` o se enumera como desviación conocida. Casos en los que se sigue a Test262:

- `[[Set]]`, `[[GetOwnProperty]]` y `[[DefineOwnProperty]]` de TypedArray (ES2021/ES2022): primero se convierte el valor; después, un índice no válido o un búfer desvinculado ignoran la escritura e informan de éxito; un búfer desvinculado no tiene elementos propios; con un Receiver distinto del TypedArray, un índice no válido no tiene efecto y uno válido equivale a OrdinarySet sobre el Receiver.
- `String.prototype.{replace,split,match,matchAll,search}` no buscan métodos con clave Symbol en argumentos primitivos (ES2025).
- Los destinos de asignación del Annex B en forma de expresión de llamada lanzan ReferenceError en tiempo de ejecución en código no estricto y son errores tempranos en código estricto (realidad web de ES2022).

Se mantiene ES2020 (los fallos se clasifican como `post`): campos de clase y métodos privados, separadores numéricos, asignación lógica, `Promise.any`/`AggregateError`, `Error.prototype.stack`/`cause`, flag `v` de RegExp e índices de coincidencia, await de nivel superior y las demás características de `postEs2020Features`. Las desviaciones conocidas restantes se enumeran por catálogo en `docs/history/pr5-es2020-remaining-work.md` y en el estado de la versión.

Funciones del runner añadidas para el hito de ES2020 (2026-09):

- `TEST262_TARGET=linux-x64` (predeterminado en Linux) enlaza imágenes ELF; las pruebas de módulos (`flags: [module]`) se compilan como un grafo de módulos con el arnés como preludio de script clásico; las pruebas negativas de resolución de módulos esperan un error de compilación.
- `TEST262_EXCLUDE_FEATURES=post-es2020` se expande a la lista de etiquetas de características introducidas después de ES2020 (ver `postEs2020Features` en el script), más `error-stack-accessor` y la extensión no estándar `caller`.
- `$262.createRealm` se compila cuando la prueba lo menciona (hasta tres realms); los programas de `$262.agent` se extraen de plantillas estáticas (se pliegan los contadores de bucle, las constantes de nivel superior y `$262.agent.timeouts`) y se compilan en la imagen como hilos agente. Las pruebas `CanBlockIsFalse` se omiten porque el agente principal puede bloquearse.
- Los especificadores calculados de `import()` pueden cargar los archivos `_FIXTURE.js` de la prueba nombrados en su código fuente (`ModuleHost.candidates`).
- Una excepción del compilador se registra como fallo de ese archivo (`phase: compiler-crash`) en lugar de detener la ejecución.

Esto es un **adaptador de línea base**, no el arnés completo de Test262: las pruebas raw y las negativas en tiempo de ejecución se omiten por ahora indicando el motivo. Las pruebas negativas de análisis pasan cuando Nona rechaza el código con un diagnóstico del compilador; el adaptador todavía no comprueba la equivalencia del tipo de diagnóstico. Ejecuta las pruebas positivas de script con el arnés estándar `sta.js`/`assert.js` y los `includes` declarados. Antes de afirmar conformidad, el adaptador debe soportar todos los modos de metadatos aplicables y ambas variantes, estricta y no estricta, y después ejecutar todos los grupos aplicables. Durante esta fase, las pruebas nativas ordinarias del repositorio siguen siendo la principal barrera contra regresiones. Ejecuta las pruebas y el oráculo con Node 26, como exige `package.json`; Node 22 difiere en metadatos de funciones observables y puede fallar cuando una prueba sella su objeto global.

El manifiesto smoke positivo de tiempo de ejecución del 2026-09-26 incluye casos de parámetros por defecto y spread; sus recuentos actuales están registrados en el registro de desarrollo. Grupos raw más amplios en la revisión fijada dan 72 pass / 26 fail en `built-ins/Symbol`, 85 pass / 34 fail en `language/statements/for-in` y 142 pass / 607 fail / 2 skip en `language/statements/for-of`. Estos grupos incluyen casos fuera del subconjunto implementado y casos añadidos después de ES2020; los recuentos raw son diagnósticos, no porcentajes de conformidad con ES2020. `built-ins/Array/prototype/includes` da 26 pass / 4 fail / 0 skip; los casos que fallan usan Proxy o ArrayBuffers redimensionables. `built-ins/Math/pow` da 28 pass / 0 fail / 0 skip tras añadir las constantes de Math de ES2020. `built-ins/Math/min` y `built-ins/Math/max` dan cada uno 10 pass / 0 fail / 0 skip, incluida la conversión de cada argumento y el orden de los ceros con signo. `built-ins/String/prototype/includes` da 25 pass / 2 fail / 0 skip; los casos que fallan contienen literales RegExp, que aún no están soportados. `built-ins/String/prototype/padStart` y `padEnd` dan cada uno 13 pass / 0 fail / 0 skip, incluido el orden de conversión y las comprobaciones de descriptores. `built-ins/String/prototype/indexOf` da 44 pass / 3 fail / 0 skip; los casos restantes dependen de `eval` o BigInt. `built-ins/String/prototype/lastIndexOf` da 25 pass / 0 fail / 0 skip. `built-ins/String/fromCharCode` da 16 pass / 1 fail / 0 skip; el caso restante requiere BigInt. `built-ins/Array/prototype/indexOf` da 193 pass / 8 fail / 0 skip, y `lastIndexOf` 189 pass / 9 fail / 0 skip tras añadir el `isNaN` global. Los casos restantes usan Date, RegExp, JSON, Proxy, búferes/typed arrays redimensionables o `eval`. El `isFinite` global da 15 pass / 0 fail / 0 skip. El `isNaN` global da 14 pass / 1 fail / 0 skip; el caso restante usa `Array.prototype.forEach` en el cuerpo del arnés de la prueba. `built-ins/Array/prototype/pop` da 23 pass / 0 fail / 0 skip tras añadir las constantes de Number de ES2020. Los cuatro grupos `Number.isFinite/isInteger/isNaN/isSafeInteger` dan 8/9/7/10 pass respectivamente, sin fallos ni omisiones. `language/rest-parameters` da 11 pass / 0 fail / 0 skip tras los parámetros desestructurados y los métodos de clase. Tras el soporte de parámetros por defecto, `language/expressions/arrow-function` da 147 pass / 196 fail / 0 skip; pasan los 9 casos `dflt-params` de ese grupo. Con spread en literales de array y de objeto, `language/expressions/array` da 50 pass / 2 fail / 0 skip. Los dos casos restantes requieren generadores. Con spread en llamadas y construcción, `language/expressions/call` da 72 pass / 20 fail / 0 skip y `language/expressions/new` da 54 pass / 5 fail / 0 skip. Entre los casos `spread-*`, solo dos de cada grupo no compilan porque requieren generadores. Los demás fallos del grupo tienen que ver con otras características no soportadas, incluido `eval`. Los grupos `Math.abs/sign/sqrt/trunc/floor/ceil/round` pasan 8/5/10/12/11/11/11 pruebas respectivamente, sin fallos ni omisiones. Los grupos `Math.imul` y `Math.clz32` pasan 5/5 y 10/10 respectivamente. Tras los patrones de enlace de arrays y objetos, los tres grupos de declaraciones `language/statements/variable/dstr`, `let/dstr` y `const/dstr` pasan 79/97, 77/93 y 77/93 casos respectivamente. Cada caso restante no compila porque usa generadores o clases. Son grupos seleccionados de Test262, no un porcentaje de conformidad con ES2020. `language/destructuring/binding/syntax` da 12 pass / 2 fail; ambos casos restantes requieren sintaxis de generadores y async. `language/expressions/assignment/dstr` da 323 pass / 45 fallos de compilación / 0 fallos en tiempo de ejecución; esos fallos de compilación requieren generadores o clases. Los grupos de clases seleccionados `language/statements/class/method` y `method-static` pasan 20/20 cada uno. `language/statements/class/definition` da 46 pass / 17 fallos de compilación / 2 skips; los casos restantes requieren sintaxis fuera del subconjunto de clases actual, incluidos generadores y métodos async.

El 2026-09-25 el grupo `language/expressions/coalesce` dio 21 pass, 3 fail, 0 skip. Un fallo requiere el tipo `Symbol`, que faltaba; dos ejercitan llamadas de cola propias en código estricto y desbordan la pila nativa. Cuatro casos negativos de análisis pasaron gracias al rechazo del compilador. Son capacidades ausentes con seguimiento, no una prueba de que `??` esté roto en general.

El 2026-09-26 los grupos completos fijados `built-ins/parseInt` y `built-ins/parseFloat` pasaron 55/55 y 54/54. La primera ejecución completa de `built-ins/Array` dio 2632 pass, 360 fail y 90 skip de 3082; las 90 omisiones son pruebas de `Array.fromAsync` (una API posterior a ES2020); reveló un error de finalización de iteradores y cinco timeouts con arrays dispersos, que ya se han corregido. La repetición de la ejecución completa de Array da 2640 pass, 352 fail y 90 skip. Cada fallo restante tiene un requisito previo registrado en [la lista de aplazamientos de v0.4](https://github.com/40oleg/nona/blob/main/docs/history/v0.4-array-deferred.json): 150 casos de APIs posteriores a ES2020, 72 casos de búferes redimensionables y 130 otras dependencias futuras o la excepción documentada de `eval`. El manifiesto positivo pasa 100/100.

Después de v0.4.0, el grupo completo `built-ins/String/fromCodePoint` pasa 11/11. Un caso se conserva en el manifiesto smoke fijado; en ese punto el manifiesto pasaba 101/101.

El grupo completo `built-ins/String/raw` pasa 30/30. Su caso de plantilla etiquetada está incluido en el manifiesto smoke positivo fijado. El manifiesto actualizado pasa 102/102; los ejemplos compatibles en Windows y Linux pasan 54/54 cada uno.

El grupo completo `built-ins/String/prototype/concat` pasa 22/22. Un caso está incluido en el manifiesto smoke positivo. El manifiesto actualizado pasa 103/103; los ejemplos compatibles en Windows y Linux pasan 55/55 cada uno.

El grupo `built-ins/String/prototype/toUpperCase` da 24 pass / 2 fail / 0 skip. Los dos fallos requieren `RegExp` y `eval` directo, ambos con seguimiento fuera de v0.5. El caso de mayúsculas especiales de Unicode está en el manifiesto smoke positivo, ahora 104/104. Los ejemplos compatibles en Windows y Linux pasan 56/56 cada uno.

El grupo `built-ins/String/prototype/toLowerCase` da 28 pass / 2 fail / 0 skip. Sus dos fallos también requieren `RegExp` y `eval` directo. Pasa la correspondencia condicional de la sigma final, incluidos los caracteres `Case_Ignorable`. El manifiesto smoke positivo está en 105/105; los ejemplos compatibles, en 57/57 en Windows y Linux.

El grupo completo `built-ins/Number/prototype/toFixed` da 15 pass / 1 fail / 0 skip. El caso que falla usa BigInt, previsto para v0.8. El caso de exactitud está en el manifiesto smoke positivo, ahora 106/106; los ejemplos compatibles pasan 58/58 en Windows y Linux.

Los grupos completos `built-ins/Number/prototype/toExponential` y `built-ins/Number/prototype/toPrecision` pasan 15/15 y 17/17. Sus casos con valores ordinarios están en el manifiesto smoke positivo, ahora 108/108. Los ejemplos compatibles pasan 59/59 en Windows y Linux.

Una primera ejecución completa de `built-ins/Math`, antes de añadir la trigonometría, dio 176 pass / 151 fail de 327. La mayoría de los fallos son funciones trascendentes de ES2020 que faltaban; `f16round` y `sumPrecise` son APIs posteriores. Los grupos completos `Math.sin`, `Math.cos` y `Math.tan` pasan ahora 8/8, 9/9 y 9/9. El smoke positivo está en 111/111; los ejemplos compatibles pasan 60/60 en Windows y Linux.

Los grupos completos `Math.log`, `Math.log2` y `Math.log10` pasan 9/9, 5/5 y 5/5. El smoke positivo está en 114/114; los ejemplos compatibles pasan 61/61 en Windows y Linux.

Los grupos completos `Math.exp` y `Math.expm1` pasan 9/9 y 5/5. El smoke positivo está en 116/116; los ejemplos compatibles pasan 62/62 en Windows y Linux.

Los grupos completos `Math.atan` y `Math.atan2` pasan 7/7 y 11/11. El smoke positivo está en 118/118; los ejemplos compatibles pasan 63/63 en Windows y Linux.

El grupo completo `Math.log1p` pasa 5/5. El smoke positivo está en 119/119; los ejemplos compatibles pasan 64/64 en Windows y Linux.

El grupo completo `Math.cbrt` pasa 5/5. El smoke positivo está en 120/120; los ejemplos compatibles pasan 65/65 en Windows y Linux.

Los grupos completos `Math.asin` y `Math.acos` pasan 9/9 y 8/8. El smoke positivo está en 122/122; los ejemplos compatibles pasan 66/66 en Windows y Linux.

Los grupos completos `encodeURI` y `encodeURIComponent` pasan 31/31 cada uno. El smoke positivo está en 124/124; los ejemplos compatibles pasan 67/67 en Windows y Linux.

Los grupos completos `decodeURI` y `decodeURIComponent` pasan 55/55 y 56/56. El smoke positivo está en 126/126; los ejemplos compatibles pasan 68/68 en Windows y Linux.

El grupo completo `Math.atanh` pasa 5/5. El smoke positivo está en 127/127; los ejemplos compatibles pasan 69/69 en Windows y Linux. La ejecución completa de las pruebas nativas tras el trabajo con URI dio 1632 superadas, 27 omitidas y ningún fallo.

Los grupos completos `Math.asinh` y `Math.acosh` pasan 5/5 y 7/7. El smoke positivo está en 129/129; los ejemplos compatibles pasan 70/70 en Windows y Linux.

Los grupos completos `Math.sinh`, `Math.cosh` y `Math.tanh` pasan 5/5 cada uno. El smoke positivo está en 132/132; los ejemplos compatibles pasan 71/71 en Windows y Linux.

Una ejecución completa de `built-ins/Math` da ahora 312 superadas y 15 fallos de 327. Los 15 fallos afectan a `Math.f16round` y `Math.sumPrecise`, posteriores a ES2020. Esto no mide la precisión de las funciones trascendentes para entradas finitas arbitrarias. La reducción de ángulos grandes para `sin`, `cos` y `tan` se añadió después de esta ejecución y se verificó frente a Node.js 26 en todos los exponentes binarios.

`String.prototype.toLocaleLowerCase` y `toLocaleUpperCase` pasan 26/28 y 24/26. Las cuatro pruebas restantes requieren RegExp o eval. El smoke positivo está en 134/134; los ejemplos compatibles pasan 72/72 en Windows y Linux. Queda por evaluar las correspondencias específicas de configuración regional más allá de la correspondencia Unicode predeterminada.

`String.prototype.split` pasa 86/120 casos de Test262. Los 34 restantes requieren RegExp, BigInt o eval. Se comprueban los separadores de cadena, los límites, los separadores primitivos y los hooks `Symbol.split` personalizados. El smoke positivo está en 137/137; los ejemplos compatibles pasan 73/73 en Windows y Linux.

`Math.sin`, `Math.cos` y `Math.tan` para ángulos grandes usan ahora una tabla de `2/pi` en coma fija de 1152 bits. Las pruebas nativas pasan 48/48, incluidos 80 valores finitos deterministas en los exponentes 63–1022. Los ejemplos compatibles pasan 74/74 en Windows y Linux.

`String.prototype.replace` pasa 24/55 casos de Test262. Los 31 restantes requieren RegExp, BigInt o construcción dinámica de funciones. Están cubiertos la búsqueda de cadenas, el reemplazo funcional, los patrones de reemplazo y `Symbol.replace` personalizado. El smoke positivo está en 140/140; los ejemplos compatibles pasan 75/75 en Windows y Linux.
