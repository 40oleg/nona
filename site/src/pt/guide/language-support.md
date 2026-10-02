# Suporte à linguagem

O Nona tem como alvo a 11ª edição do ECMA-262 (ES2020), com exceções documentadas. Esta página resume o que é suportado na **v0.7.0**; os números vêm da revisão fixada do Test262 descrita na página [Test262](/pt/reference/test262).

**Suportado** significa implementado e coberto por testes unitários e pelo Test262 dentro dos limites indicados na coluna Observações. A matriz detalhada por recurso, com os nomes dos testes, fica em [`docs/language-support.md`](https://github.com/40oleg/nona/blob/main/docs/language-support.md) (em russo).

## Linguagem

| Área | Status | Observações |
| --- | --- | --- |
| Gramática léxica e literais | Suportado | Literais decimais, hexadecimais, binários, octais e BigInt, escapes Unicode em identificadores e strings, template literals. Octais legados e comentários estilo HTML do Annex B em scripts não estritos. Separadores numéricos (ES2021) são rejeitados. |
| `var`, `let`, `const`, TDZ | Suportado | Hoisting, escopo de bloco, bindings por iteração, conflitos de declaração como early errors. |
| Funções | Suportado | Declarações e expressões, closures, `arguments` (mapeado e não mapeado), parâmetros padrão e rest, parâmetros desestruturados, `this`, `new.target`, `Function.prototype.toString` com o texto-fonte exato. |
| Arrow functions | Suportado | `this`, `arguments`, `new.target` e `super` léxicos; arrows `async`. |
| Classes | Suportado | Declarações e expressões, construtores, métodos e acessores de instância e estáticos, nomes computados, herança (inclusive de objetos embutidos e `extends null`), `super()` e `super.x`. Campos de classe e nomes privados (ES2022) não são suportados. |
| Desestruturação, spread | Suportado | Declarações, atribuições, parâmetros, alvos de `for-in`/`for-of`; spread em arrays, objetos, chamadas e `new`. |
| Iteradores e geradores | Suportado | O protocolo de iteração, `for-of`, funções e métodos geradores, `yield*`, `return`/`throw`. |
| Funções async | Suportado | Funções, arrows e métodos async, `await`, geradores async e `for await`, com a ordem de jobs do ES2020. |
| Operadores | Suportado | Inclusive `**`, encadeamento opcional, `??`, `delete`, `in`, `instanceof` com `Symbol.hasInstance`, aritmética e comparações de BigInt. |
| Controle de fluxo | Suportado | Todas as instruções, rótulos, `try`/`catch`/`finally` com valores de conclusão, `switch`, `debugger` (sem efeito). |
| Modo estrito | Suportado | Prólogos de diretivas, `this` estrito, early errors e restrições em tempo de execução. |
| `with` | Suportado | Apenas em scripts não estritos, com `Symbol.unscopables`. |
| Chamadas de cauda próprias | Suportado | Em código estrito. |
| Módulos | Suportado | `import`/`export` em todas as formas, ciclos, live bindings, objetos namespace, `import.meta`, `import()` de módulos conhecidos em tempo de compilação. `await` no nível superior (ES2022) não é suportado. |
| `eval`, `Function` | Parcial | Código conhecido em tempo de compilação é compilado antecipadamente com a semântica completa de `eval` direto e indireto; código calculado em tempo de execução lança `EvalError`. Veja [Compatibilidade](/pt/guide/compatibility#eval-and-function). |
| Annex B | Suportado | Semântica de compatibilidade web para funções em blocos, `__proto__`, sintaxe legada de RegExp, `escape`/`unescape`, métodos HTML de String e mais. |

## Objetos embutidos

| Área | Status | Observações |
| --- | --- | --- |
| Object, Function, Boolean, Symbol, Error | Suportado | Inclusive descritores de propriedade, operações de integridade e os símbolos globais e well-known. |
| Number, Math, funções de URI | Suportado | Formatação numérica de ida e volta mais curta, `toFixed`/`toExponential`/`toPrecision`, todas as funções de `Math` do ES2020. |
| String | Suportado | Métodos do ES2020, normalização Unicode, `localeCompare` sem dados de localidade do ECMA-402. |
| RegExp | Suportado | Grupos nomeados, lookbehind, flags `s`, `u`, `y` e `g`, escapes de propriedades Unicode, `matchAll`. O motor é uma VM com backtracking escrita como prelúdio; é mais lento que o do V8. |
| Array | Suportado | Todos os métodos do ES2020, species, buracos e comprimentos muito grandes. |
| Date, JSON | Suportado | Parsing e formatação de datas em UTC e no horário local, `JSON.parse` com reviver, `JSON.stringify` com replacer e indentação. |
| Map, Set, WeakMap, WeakSet | Suportado | Semântica de efêmeros para coleções fracas. |
| ArrayBuffer, DataView, typed arrays | Suportado | Os 11 tipos de typed array, incluindo arrays BigInt, desanexação (detach), species. |
| SharedArrayBuffer, Atomics | Suportado | Inclusive `Atomics.wait`/`notify` com agentes trabalhadores (usados pelo Test262). |
| Proxy, Reflect | Suportado | Todas as traps e invariantes. |
| Promise | Suportado | `all`, `allSettled`, `race`, `finally`, thenables e relato de rejeições não tratadas. |
| `globalThis`, `console.log` | Suportado | `console.log` escreve UTF-8 na saída padrão. |

## Além do ES2020

Recursos de edições posteriores não são suportados: campos de classe e nomes privados, blocos estáticos, `Promise.any`, `WeakRef` e `FinalizationRegistry`, operadores de atribuição lógica, separadores numéricos, a flag `v` de RegExp, `await` no nível superior e `Array.prototype.at`. Algumas adições posteriores à biblioteca, como `String.prototype.replaceAll`, estão disponíveis. Quando a revisão fixada do Test262 já verifica semântica mais nova para recursos do ES2020, o Nona segue o Test262; a página [Test262](/pt/reference/test262#semantics-newer-than-es2020-in-the-pinned-test262) lista esses casos.

As APIs do host que não fazem parte do ECMAScript — timers, `process`, `node:fs`, `TextEncoder`/`TextDecoder` e FFI — estão descritas na [Referência](/pt/reference/modules).

## Resultados do Test262

Execução completa do Test262 fixado no Windows x64 (recursos do ES2020 e anteriores):

| Diretório | Aprovados / aplicáveis | Falhas restantes |
| --- | --- | --- |
| `language/` | 17298 / 17337 | 30 `eval`, 6 semântica mais nova, 3 outras |
| `built-ins/` | 15491 / 15559 | 16 `eval`, 14 semântica mais nova, 38 outras |
| `built-ins/Atomics` (agentes) | 268 / 268 | — |
| `annexB/` | 996 / 1016 | 20 `eval` |

Falhas do tipo "`eval`" usam código-fonte calculado em tempo de execução, `$262.evalScript` ou outros realms; os testes de "semântica mais nova" verificam comportamento de edições posteriores sob uma tag de recurso antiga ou ausente. A [página de status](/pt/guide/status) lista as falhas restantes.
