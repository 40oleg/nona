# Compatibilidade e limitações

## Escopo

O Nona tem como alvo a linguagem e os objetos embutidos da 11ª edição normativa do ECMA-262 (junho de 2020), para scripts e módulos ES. A internacionalização ECMA-402, as APIs do navegador e as APIs do Node.js são especificações separadas; o Nona fornece apenas as APIs do host listadas na [Referência](/pt/reference/modules). O contrato de completude é mantido em [`docs/es2020-contract.md`](https://github.com/40oleg/nona/blob/main/docs/es2020-contract.md). O `Intl` próprio do Nona (ECMA-402) só conhece a localidade `en`/`en-US`; as demais recaem nela e o fuso horário é UTC.

Uma versão é descrita como "ES2020 com exceções documentadas", nunca como totalmente conforme ao ES2020.

## `eval` e `Function` {#eval-and-function}

O Nona compila antecipadamente, então `eval` e os construtores dinâmicos de funções precisam do texto-fonte em tempo de compilação:

- **Compilado antecipadamente:** um literal de string, uma concatenação de literais ou uma variável à qual só se atribuem essas constantes (o valor é comparado em tempo de execução). O `eval` direto enxerga o escopo de quem chama, `this`, `arguments`, `new.target` e `super`; as formas indiretas (`(0, eval)(…)`, `globalThis.eval(…)`, `eval?.(…)`) rodam no escopo global. Chamadas a `Function`, `GeneratorFunction`, `AsyncFunction` e `AsyncGeneratorFunction` cujos argumentos são todos literais são compiladas com a semântica de CreateDynamicFunction.
- **Não suportado:** código calculado em tempo de execução, argumentos spread para `eval` e `$262.evalScript`. Esses casos lançam:

```text
EvalError: Nona compiles ahead of time: eval and Function need source text known at compile time
```

É uma exceção permanente e documentada ([#11](https://github.com/40oleg/nona/issues/11), [contrato ES2020](https://github.com/40oleg/nona/blob/main/docs/es2020-contract.md)): os executáveis gerados não contêm interpretador nem compilador.

## Diferenças em relação ao Node.js

| Área                           | Nona                                                                                                                                                    | Node.js                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `process.argv`                 | `[execPath, ...arguments]`: `argv[1]` é o primeiro argumento                                                                                            | `[node, script, ...arguments]`                                                                          |
| `process`                      | Metadados comuns, alteração do ambiente, relógios/ticks, E/S padrão, ciclo de vida/avisos, CPU/recursos e controle nativo de processos (nos oito alvos) | Handlers de sinais, IPC, relatórios de heap do V8, streams assíncronos completos e controle de terminal |
| Ids de timers                  | Números                                                                                                                                                 | Objetos `Timeout`                                                                                       |
| `readFileSync(path)`           | Retorna um `Uint8Array` (sem uma codificação)                                                                                                           | Retorna um `Buffer`                                                                                     |
| Codificações                   | Apenas `utf8` (fs); UTF-8, UTF-16LE, Latin-1, ASCII, hex, base64/base64url (Buffer)                                                                     | Muitas                                                                                                  |
| Mensagens de erro no Windows   | Contêm o caminho como foi passado                                                                                                                       | Contêm o caminho absoluto                                                                               |
| Módulos                        | `nona:*`, os módulos `node:*` listados em [Módulos embutidos](/pt/reference/modules), arquivos e pacotes npm resolvidos na compilação                   | Todo o `node:*` e pacotes npm, resolvidos em tempo de execução                                          |
| `require`                      | Módulos CommonJS, com especificadores literais conhecidos na compilação ([pacotes npm](/reference/npm))                                                 | Qualquer especificador em tempo de execução                                                             |
| `console.log` sem saída padrão | A saída é descartada                                                                                                                                    | A saída é descartada ou um erro é lançado                                                               |

## Desempenho

- Arrays, objetos e `Map`/`Set` usam armazenamento denso e com hash, com shapes e caches inline, mas chamadas, closures e alocação ainda são várias vezes mais lentas que no V8; [Desempenho](/pt/guide/performance) lista os pontos lentos.
- O motor de RegExp é uma VM com backtracking escrita em JavaScript. Um padrão sem referências inversas nem lookarounds que retrocede em excesso (sem a flag `u`) é concluído por um motor de tempo linear.
- No Windows, os timers acordam no tick do sistema (normalmente 15,6 ms).
- Não há JIT: o código é compilado uma única vez, antecipadamente, sem otimização guiada por perfil.

## Partes do runtime ligadas {#linked-runtime-parts}

Todo executável contém o runtime, mas suas partes opcionais grandes só são ligadas quando o programa pode alcançá-las. O compilador decide a partir do texto de cada fonte que compila: o programa, seus módulos e as fontes de `eval`/`Function` em tempo de compilação:

| Parte                                                | Tamanho         | Ligada quando uma fonte contém                                                                                                                                   |
| ---------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motor de RegExp                                      | cerca de 1 MB   | um literal RegExp, ou o nome `RegExp`, `match`, `matchAll` ou `search` (como identificador livre, nome de propriedade ou string usada como chave de propriedade) |
| Tabelas de propriedades Unicode para `\p{…}`/`\P{…}` | cerca de 2 MB   | `\p{` ou `\P{` em um literal RegExp ou em uma string, junto com o motor (um padrão pode ser montado em tempo de execução)                                        |
| Tabelas de normalização Unicode                      | cerca de 0,7 MB | o nome `normalize` ou `localeCompare`                                                                                                                            |

Um nome seleciona uma parte quando é um identificador livre (uma variável local, parâmetro ou import com esse nome não seleciona nada), um nome de propriedade (`s.normalize()`) ou uma string em posição de chave (`s["normalize"]`, `"x" in o`, `Reflect.get(o, "x")`, um especificador de módulo). Uma string comum como `console.log("normalize")` ou uma variável local chamada `small` não seleciona nada. Se o programa lê propriedades com chaves que o compilador não pode conhecer (`o[name]`), toda string exatamente igual a um nome também conta. Dentro de `with` e em funções com `eval` direto não estrito, todo identificador conta. Um nome de propriedade seleciona sua parte seja qual for o receptor, e o código dos módulos embutidos importados conta como o seu. Chaves montadas em tempo de execução (`"nor" + "malize"`) são invisíveis: use `--link` ou `--full-runtime` ([#438](https://github.com/40oleg/nona/issues/438)).

`split`, `replace` e `replaceAll` com argumentos de string não precisam do motor de RegExp.

As bibliotecas embutidas escritas em JavaScript que apenas instalam globais ou métodos (cerca de 0,7 MB no total) são ligadas da mesma forma, quando uma fonte contém um de seus nomes:

| Parte                                                                                                                                                                  | Nomes                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Proxy`                                                                                                                                                                | `Proxy`                                                                                                                                       |
| `TextEncoder`, `TextDecoder`                                                                                                                                           | `TextEncoder`, `TextDecoder` (também ligados com `process`)                                                                                   |
| `process`                                                                                                                                                              | `process`                                                                                                                                     |
| Timers, o loop de eventos, `queueMicrotask` e `performance`                                                                                                            | `setTimeout`, `setInterval`, `setImmediate`, `clearTimeout`, `clearInterval`, `clearImmediate`, `queueMicrotask`, `performance`, `globalThis` |
| `.at()`, `findLast`, `findLastIndex`, `Object.hasOwn`, `Object.groupBy`, `Map.groupBy`, `AggregateError`, `Promise.any`, `toSorted`, `toReversed`, `toSpliced`, `with` | `at`, `findLast`, `findLastIndex`, `hasOwn`, `groupBy`, `AggregateError`, `any`, `unscopables`                                                |
| `String.prototype.isWellFormed` e `toWellFormed`                                                                                                                       | `isWellFormed`, `toWellFormed`                                                                                                                |
| Iterator helpers (`Iterator`, `Iterator.from`, `map`, `take`, `drop`, `flatMap`, `toArray`, …)                                                                         | `Iterator`, `toArray`, `take`, `drop`, `flatMap`                                                                                              |
| `escape`, `unescape`, `substr`, `setYear`, `toGMTString`, `RegExp.prototype.compile` do Annex B e os métodos HTML de strings (`anchor`, `big`, `link`, …)              | os mesmos nomes                                                                                                                               |
| `Array.prototype.sort` estável por merge                                                                                                                               | `sort`                                                                                                                                        |
| Intl (somente en/en-US, [docs/intl.md](https://github.com/40oleg/nona/blob/main/docs/intl.md))                                                                         | `Intl`, `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString`, `localeCompare`                                                         |
| `Object.freeze`, `seal`, `isFrozen`, `isSealed` por meio de traps de Proxy (caso contrário, versões nativas para objetos comuns)                                       | os mesmos nomes                                                                                                                               |
| `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`                                                                                         | os mesmos nomes                                                                                                                               |
| Métodos de dados binários de `ArrayBuffer`, `SharedArrayBuffer`, `DataView` e dos arrays tipados (`slice`, `subarray`, `sort`, …)                                      | os nomes dos seus construtores, `Atomics`, `TypedArray` (também com `process`, `Buffer` e `TextEncoder`)                                      |
| Métodos do protocolo RegExp e String (`Symbol.replace`, `String.prototype.match`, `matchAll`, `search`, `replaceAll`, …)                                               | com o motor de RegExp, ou `replaceAll`                                                                                                        |

Um programa que chama `Object.getOwnPropertyNames`, `Object.getOwnPropertyDescriptors` ou `Reflect.ownKeys` liga todas elas, pois poderia listar os objetos embutidos ([#84](https://github.com/40oleg/nona/issues/84)). Um hello world tem cerca de 1,1 MB; com todas as partes, 7 MB.

Helpers que só certa sintaxe precisa são ligados quando o programa compilado os chama, não por nome: instruções `with`, `eval` literal, campos de classe e nomes privados, e módulos ES com `import()` e `import.meta` ([#278](https://github.com/40oleg/nona/issues/278)).

Um programa ainda pode alcançar uma parte omitida por meio de um nome calculado em tempo de execução, por exemplo `globalThis['Reg' + 'Exp']`. Para o motor de RegExp e as tabelas Unicode, essa chamada lança um `Error` cuja mensagem nomeia a parte ausente; uma global ou um método omitido simplesmente não existe. Compile com `--full-runtime` (ou a opção `fullRuntime` de [`compile()`](/pt/reference/api)) para ligar tudo ([#62](https://github.com/40oleg/nona/issues/62)). Com `--link parte,...` adicionam-se partes isoladas, e `--print-link` mostra o que foi ligado e qual nome selecionou cada parte ([#182](https://github.com/40oleg/nona/issues/182)).

Os imports nomeados de módulos embutidos são podados antes de escolher as partes: `import { existsSync } from "node:fs"` mantém só o código de `fs` que `existsSync` alcança, e por isso não liga o motor RegExp, as tabelas Unicode nem os temporizadores (1.808.896 bytes em vez de 5.017.088 em win32-x64). Um import de namespace ou padrão, `import()`, `require` e `process.getBuiltinModule` mantêm o módulo inteiro ([projeto e limites](https://github.com/40oleg/nona/blob/main/docs/builtin-module-pruning.md), [#440](https://github.com/40oleg/nona/issues/440)).

## Realms

`$262.createRealm` é suportado para o Test262. Funções, classes e código eval criados com código-fonte literal por meio de `Function`, `eval` ou dos construtores de funções dinâmicas de outro realm são executados nesse realm, e os protótipos padrão e os erros dos construtores vêm do realm indicado pela ECMA-262 ([#7](https://github.com/40oleg/nona/issues/7), [#176](https://github.com/40oleg/nona/issues/176)).

## Plataformas

- `process` e `node:fs` estão disponíveis nos oito alvos; HTTP e TCP (`node:http`, `node:net`) no Windows e no Linux.
- Os executáveis do Windows usam DLLs do SO (incluindo a NTDLL para metadados do processo pai) e as importações FFI declaradas; os executáveis POSIX usam serviços nativos do SO.
- As chamadas FFI a DLLs exigem o Windows; as chamadas de sistema diretas usam os números de chamada do kernel do alvo Linux, Darwin ou BSD selecionado. Detalhes: [Plataformas nativas](/reference/native-platforms).

## Buffer

`Buffer`, `Blob` e `File` globais, e as importações `node:buffer` / `buffer` / `nona:buffer`, estão disponíveis em todos os alvos nativos. O Buffer suporta as codificações de bytes padrão, fatias compartilhadas, cópia, busca e acesso numérico. Blob/File suportam dados imutáveis e metadados. Há streams de bytes/texto de Blob e registro/resolução de URLs de objeto; veja [o contrato da API e as limitações](/reference/host-apis#buffer-and-binary-data).
