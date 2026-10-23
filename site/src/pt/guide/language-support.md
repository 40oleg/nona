# Suporte Г  linguagem

O Nona tem como alvo a 11ВЄ ediГ§ГЈo do ECMA-262 (ES2020), com exceГ§Гµes documentadas. Esta pГЎgina resume o que Г© suportado na **v0.25.0**. Os nГєmeros do Test262 vГЄm da Гєltima auditoria completa (v0.8.0) da revisГЈo fixada descrita na pГЎgina [Test262](/pt/reference/test262).

**Suportado** significa implementado e coberto por testes unitГЎrios e pelo Test262 dentro dos limites indicados na coluna ObservaГ§Гµes. A matriz detalhada por recurso, com os nomes dos testes, fica em [`docs/language-support.md`](https://github.com/40oleg/nona/blob/main/docs/language-support.md) (em russo).

## Linguagem

| ГЃrea                        | Status    | ObservaГ§Гµes                                                                                                                                                                                                                                                                                                        |
| --------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GramГЎtica lГ©xica e literais | Suportado | Literais decimais, hexadecimais, binГЎrios, octais e BigInt, escapes Unicode em identificadores e strings, template literals. Octais legados e comentГЎrios estilo HTML do Annex B em scripts nГЈo estritos.                                                                                                          |
| `var`, `let`, `const`, TDZ  | Suportado | Hoisting, escopo de bloco, bindings por iteraГ§ГЈo, conflitos de declaraГ§ГЈo como early errors.                                                                                                                                                                                                                       |
| FunГ§Гµes                     | Suportado | DeclaraГ§Гµes e expressГµes, closures, `arguments` (mapeado e nГЈo mapeado), parГўmetros padrГЈo e rest, parГўmetros desestruturados, `this`, `new.target`, `Function.prototype.toString` com o texto-fonte exato.                                                                                                        |
| Arrow functions             | Suportado | `this`, `arguments`, `new.target` e `super` lГ©xicos; arrows `async`.                                                                                                                                                                                                                                               |
| Classes                     | Suportado | DeclaraГ§Гµes e expressГµes, construtores, mГ©todos e acessores de instГўncia e estГЎticos, nomes computados, heranГ§a (inclusive de objetos embutidos e `extends null`), `super()` e `super.x`. Elementos de classe do ES2022: campos pГєblicos e privados, mГ©todos e acessores privados, blocos estГЎticos e `#x in obj`. |
| DesestruturaГ§ГЈo, spread     | Suportado | DeclaraГ§Гµes, atribuiГ§Гµes, parГўmetros, alvos de `for-in`/`for-of`; spread em arrays, objetos, chamadas e `new`.                                                                                                                                                                                                     |
| Iteradores e geradores      | Suportado | O protocolo de iteraГ§ГЈo, `for-of`, funГ§Гµes e mГ©todos geradores, `yield*`, `return`/`throw` e os auxiliares de iteradores do ES2025 (`Iterator`, `Iterator.from`, `map`, `filter`, `take`, `drop`, `flatMap`, `reduce`, `toArray`, `forEach`, `some`, `every`, `find`).                                             |
| FunГ§Гµes async               | Suportado | FunГ§Гµes, arrows e mГ©todos async, `await`, geradores async e `for await`, com a ordem de jobs do ES2020.                                                                                                                                                                                                            |
| Operadores                  | Suportado | Inclusive `**`, encadeamento opcional, `??`, `delete`, `in`, `instanceof` com `Symbol.hasInstance`, aritmГ©tica e comparaГ§Гµes de BigInt.                                                                                                                                                                            |
| Controle de fluxo           | Suportado | Todas as instruГ§Гµes, rГіtulos, `try`/`catch`/`finally` com valores de conclusГЈo, `switch`, `debugger` (sem efeito).                                                                                                                                                                                                 |
| Modo estrito                | Suportado | PrГіlogos de diretivas, `this` estrito, early errors e restriГ§Гµes em tempo de execuГ§ГЈo.                                                                                                                                                                                                                             |
| `with`                      | Suportado | Apenas em scripts nГЈo estritos, com `Symbol.unscopables`.                                                                                                                                                                                                                                                          |
| Chamadas de cauda prГіprias  | Suportado | Em cГіdigo estrito.                                                                                                                                                                                                                                                                                                 |
| MГіdulos                     | Suportado | `import`/`export` em todas as formas, ciclos, live bindings, objetos namespace, `import.meta`, `import()` de mГіdulos conhecidos em tempo de compilaГ§ГЈo. `await` no nГ­vel superior (ES2022) funciona em mГіdulos ES e `import()` espera por ele; scripts e arquivos CommonJS continuam a rejeitГЎ-lo.                 |
| `eval`, `Function`          | Parcial   | CГіdigo conhecido em tempo de compilaГ§ГЈo Г© compilado antecipadamente com a semГўntica completa de `eval` direto e indireto; cГіdigo calculado em tempo de execuГ§ГЈo lanГ§a `EvalError`. Veja [Compatibilidade](/pt/guide/compatibility#eval-and-function).                                                              |
| Annex B                     | Suportado | SemГўntica de compatibilidade web para funГ§Гµes em blocos, `__proto__`, sintaxe legada de RegExp, `escape`/`unescape`, mГ©todos HTML de String e mais.                                                                                                                                                                |

## Objetos embutidos

| ГЃrea                                     | Status    | ObservaГ§Гµes                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Object, Function, Boolean, Symbol, Error | Suportado | Inclusive descritores de propriedade, operaГ§Гµes de integridade e os sГ­mbolos globais e well-known.                                                                                                                                                                                                        |
| Number, Math, funГ§Гµes de URI             | Suportado | FormataГ§ГЈo numГ©rica de ida e volta mais curta, `toFixed`/`toExponential`/`toPrecision`, todas as funГ§Гµes de `Math` do ES2020.                                                                                                                                                                             |
| String                                   | Suportado | MГ©todos do ES2020, normalizaГ§ГЈo Unicode, `localeCompare` sem dados de localidade do ECMA-402.                                                                                                                                                                                                             |
| RegExp                                   | Suportado | Grupos nomeados (o mesmo nome pode se repetir em alternativas diferentes, ES2025), lookbehind, flags `s`, `u`, `v`, `y` e `g`, escapes de propriedades Unicode, `matchAll`, modificadores de padrГЈo `(?i:вЂ¦)` (ES2025). O motor Г© uma VM com backtracking escrita como prelГєdio; Г© mais lento que o do V8. |
| Array                                    | Suportado | Todos os mГ©todos do ES2020, species, buracos e comprimentos muito grandes.                                                                                                                                                                                                                                |
| Date, JSON                               | Suportado | Parsing e formataГ§ГЈo de datas em UTC e no horГЎrio local, `JSON.parse` com reviver, `JSON.stringify` com replacer e indentaГ§ГЈo.                                                                                                                                                                            |
| Map, Set, WeakMap, WeakSet               | Suportado | SemГўntica de efГЄmeros para coleГ§Гµes fracas.                                                                                                                                                                                                                                                               |
| ArrayBuffer, DataView, typed arrays      | Suportado | Os 11 tipos de typed array, incluindo arrays BigInt, desanexaГ§ГЈo (detach), species, ArrayBuffer redimensionГЎvel e transferГ­vel, SharedArrayBuffer expansГ­vel, typed arrays e DataViews que acompanham o comprimento.                                                                                      |
| SharedArrayBuffer, Atomics               | Suportado | Inclusive `Atomics.wait`/`notify` com agentes trabalhadores (usados pelo Test262).                                                                                                                                                                                                                        |
| Proxy, Reflect                           | Suportado | Todas as traps e invariantes.                                                                                                                                                                                                                                                                             |
| Promise                                  | Suportado | `all`, `allSettled`, `race`, `withResolvers`, `finally`, thenables e relato de rejeiГ§Гµes nГЈo tratadas.                                                                                                                                                                                                    |
| `globalThis`, `console.log`              | Suportado | `console.log` escreve UTF-8 na saГ­da padrГЈo. `console.info` e `console.debug` fazem o mesmo; `console.error` e `console.warn` escrevem na saГ­da de erro padrГЈo.                                                                                                                                           |

## AlГ©m do ES2020

A maioria dos recursos de ediГ§Гµes posteriores nГЈo Г© suportada. AdiГ§Гµes suportadas:

- ES2021: separadores numГ©ricos, atribuiГ§ГЈo lГіgica (`&&=`, `||=`, `??=`), `Promise.any` e `AggregateError`, `String.prototype.replaceAll`, `WeakRef`, `FinalizationRegistry`, `Promise.try` (ES2025).
- ES2022: campos de classe, mГ©todos e acessores privados, blocos estГЎticos, `#x in obj`, `.at()`, `Object.hasOwn`, `cause` em Error e a flag `d` de RegExp com Г­ndices de correspondГЄncia.
- ES2022: `await` no nГ­vel superior em mГіdulos ES, com a ordem de avaliaГ§ГЈo de mГіdulos async, ciclos e propagaГ§ГЈo de rejeiГ§ГЈo.
- ES2023: `findLast` e `findLastIndex`, e os mГ©todos de cГіpia de `Array` `toSorted`, `toReversed`, `toSpliced` e `with` (e as variantes de `%TypedArray%` de `toSorted`, `toReversed` e `with`).
- ES2024: `String.prototype.isWellFormed` e `toWellFormed`.
- ES2024: a flag `v` de RegExp (`unicodeSets`): operaГ§Гµes `--` e `&&` entre classes, classes aninhadas, `q{...}` e propriedades de strings como `p{RGI_Emoji}`.
- ES2024: `Object.groupBy` e `Map.groupBy`.
- ES2024: ArrayBuffer redimensionГЎvel e `transfer`, SharedArrayBuffer expansГ­vel, typed arrays e DataViews que acompanham o comprimento.
- ES2025: `RegExp.escape`.
- ES2025: grupos de captura nomeados repetidos em alternativas diferentes de um padrГЈo.
- ES2025: `Float16Array`, `Math.f16round`, `DataView.prototype.getFloat16` e `setFloat16` (conversГЈo por software com arredondamento para o par mais prГіximo).

Quando a revisГЈo fixada do Test262 jГЎ verifica semГўntica mais nova para recursos do ES2020, o Nona segue o Test262; a pГЎgina [Test262](/pt/reference/test262#semantics-newer-than-es2020-in-the-pinned-test262) lista esses casos.

As APIs do host que nГЈo fazem parte do ECMAScript вЂ” timers, `process`, `node:fs`, `TextEncoder`/`TextDecoder` e FFI вЂ” estГЈo descritas na [ReferГЄncia](/pt/reference/modules).

## Resultados do Test262

Гљltima execuГ§ГЈo completa do Test262 fixado, no Windows x64 para a v0.8.0 (recursos do ES2020 e anteriores, mais os posteriores suportados):

| DiretГіrio                     | Aprovados / aplicГЎveis | Falhas restantes                             |
| ----------------------------- | ---------------------- | -------------------------------------------- |
| `language/`                   | 22436 / 22492          | 44 `eval`, 1 semГўntica mais nova, 11 outras  |
| `built-ins/`                  | 15868 / 15933          | 16 `eval`, 12 semГўntica mais nova, 37 outras |
| `built-ins/Atomics` (agentes) | 268 / 268              | вЂ”                                            |
| `annexB/`                     | 996 / 1016             | 20 `eval`                                    |

Falhas do tipo "`eval`" usam cГіdigo-fonte calculado em tempo de execuГ§ГЈo, `$262.evalScript` ou outros realms; os testes de "semГўntica mais nova" verificam comportamento de ediГ§Гµes posteriores sob uma tag de recurso antiga ou ausente. A [pГЎgina de status](/pt/guide/status) lista as falhas restantes.

FunГ§Гµes de script podem sombrear nomes globais embutidos e do host, como `escape`, `unescape`, `process`, timers e `TextEncoder`/`TextDecoder`. A inicializaГ§ГЈo do runtime termina primeiro; as declaraГ§Гµes instalam propriedades globais gravГЎveis, enumerГЎveis e nГЈo configurГЎveis.
