# O que é o Nona

O Nona é um compilador ahead-of-time (AOT) para JavaScript. Ele lê um script ou um grafo de módulos ES, verifica o código, o converte para sua própria representação intermediária, gera código de máquina x86-64 e liga um executável independente: uma imagem PE32+ para Windows ou uma imagem ELF64 para Linux.

O compilador é escrito em TypeScript e roda no Node.js. Os programas que ele produz, não: eles não contêm interpretador, nem V8, nem bytecode. Um executável do Windows importa apenas `KERNEL32.dll` (mais as DLLs que o programa chama via [FFI](/pt/reference/ffi)); um executável do Linux faz chamadas de sistema diretamente e não usa libc.

## O que você ganha

- **A linguagem ES2020.** Classes e `super`, geradores, funções async e geradores async, `for await`, desestruturação, spread, encadeamento opcional, `??`, BigInt, Symbols, iteradores, chamadas de cauda próprias, `with` no modo não estrito e a semântica de compatibilidade web do Annex B.
- **Módulos ES.** `import`/`export` estáticos, ciclos e live bindings, `import.meta` e `import()` dinâmico de módulos conhecidos em tempo de compilação. Entradas `.mjs` são compiladas como módulos.
- **A biblioteca padrão do ES2020.** Object, Function, Array, String, Number, Math, Date, JSON, RegExp (grupos nomeados, lookbehind, flags `s` e `u`, escapes de propriedades Unicode), Map, Set, WeakMap, WeakSet, ArrayBuffer, DataView e todos os typed arrays, SharedArrayBuffer e Atomics, Proxy e Reflect, e Promise com fila de jobs.
- **`eval` e `Function` com código-fonte conhecido em tempo de compilação.** Um literal de string, uma concatenação de literais ou uma variável que só recebe essas constantes é compilado antecipadamente com a semântica completa de `eval` direto e indireto.
- **Um runtime nativo.** Um coletor de lixo mark-and-sweep preciso e que não move objetos, strings UTF-16, exceções de verdade e um `RangeError` capturável em caso de estouro de pilha.
- **APIs do host** para programas reais: um [loop de eventos com timers](/pt/reference/host-apis), um [`process`](/pt/reference/process) global, [`node:fs`](/pt/reference/fs) síncrono com `TextEncoder`/`TextDecoder` e [chamadas a funções nativas](/pt/reference/ffi) com declarações `nona:win32` prontas.
- **Inicialização rápida e pouco consumo.** Um hello world compilado inicia em cerca de 2 ms, atinge no máximo 11 MB de memória e é um arquivo de 3 MB: não há runtime para inicializar nem JIT para aquecer ([Desempenho](/pt/guide/performance)).
- **Executáveis do Windows** sem janela de console, com ícone, manifesto e informações de versão ([Executáveis do Windows](/pt/reference/windows-executables)).

## O que o Nona não é

- **Não é um substituto do Node.js.** Não há `require`, nem pacotes npm, nem APIs do Node.js além dos [subconjuntos de `fs` e `process`](/pt/reference/modules). As APIs do navegador também não estão disponíveis.
- **Não é uma implementação completa do ES2020.** O Nona implementa o ES2020 com exceções documentadas; veja [Suporte à linguagem](/pt/guide/language-support) e [Compatibilidade e limitações](/pt/guide/compatibility).
- **Não gera código em tempo de execução.** `eval` e `Function` precisam de código-fonte conhecido em tempo de compilação; strings calculadas em tempo de execução lançam `EvalError`.
- **Ainda não é rápido em computação.** Sem JIT, chamadas, acesso a propriedades e alocação são de 20 a 100 vezes mais lentos que no V8, e `Map`/`Set`, `sort`, construção de strings e cadeias longas de Promise ainda são superlineares em relação ao tamanho dos dados ([Desempenho](/pt/guide/performance)).
- **Não é portável além do x86-64.** Os alvos são Windows 10/11 x64 e Linux x86-64.

## Segurança

O Nona não passou por auditoria de segurança. Não compile código-fonte não confiável e não trate os executáveis gerados como sandbox: eles rodam com as mesmas permissões de qualquer outro programa nativo, e o FFI pode chamar qualquer DLL.

## Próximos passos

- [Primeiros passos](/pt/guide/getting-started) — compile o compilador e seu primeiro programa.
- [Como funciona](/pt/guide/how-it-works) — o pipeline, o runtime e os linkers.
- [Exemplos](/pt/examples/) — de um hello world a um trocador de papel de parede.

## Plataformas nativas

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — Plataformas nativas](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.
