# O que é o Nona

O Nona é um compilador ahead-of-time (AOT) para JavaScript. Ele lê um script ou um grafo de módulos ES, verifica o código, o converte para sua própria representação intermediária, gera código de máquina x86-64 ou AArch64 e liga uma saída PE32+, ELF64 ou Mach-O64.

O compilador é escrito em TypeScript. Ele roda no Node.js ou como o executável nativo `nona` publicado, que o Nona construiu a partir do código-fonte do próprio compilador. Os programas que ele produz não precisam de nenhum dos dois: não contêm interpretador, nem V8, nem bytecode. Um executável do Windows importa apenas `KERNEL32.dll` (mais as DLLs que o programa chama via [FFI](/pt/reference/ffi)); um executável do Linux faz chamadas de sistema diretamente e não usa libc.

## O que você ganha

- **A linguagem ES2020.** Classes e `super`, geradores, funções async e geradores async, `for await`, desestruturação, spread, encadeamento opcional, `??`, BigInt, Symbols, iteradores, chamadas de cauda próprias, `with` no modo não estrito e a semântica de compatibilidade web do Annex B.
- **Módulos ES.** `import`/`export` estáticos, ciclos e live bindings, `import.meta` e `import()` dinâmico de módulos conhecidos em tempo de compilação. Entradas `.mjs` são compiladas como módulos.
- **A biblioteca padrão do ES2020.** Object, Function, Array, String, Number, Math, Date, JSON, RegExp (grupos nomeados, lookbehind, flags `s` e `u`, escapes de propriedades Unicode), Map, Set, WeakMap, WeakSet, ArrayBuffer, DataView e todos os typed arrays, SharedArrayBuffer e Atomics, Proxy e Reflect, e Promise com fila de jobs.
- **`eval` e `Function` com código-fonte conhecido em tempo de compilação.** Um literal de string, uma concatenação de literais ou uma variável que só recebe essas constantes é compilado antecipadamente com a semântica completa de `eval` direto e indireto.
- **Um runtime nativo.** Um coletor de lixo mark-and-sweep preciso e que não move objetos, strings UTF-16, exceções de verdade e um `RangeError` capturável em caso de estouro de pilha.
- **APIs do host no estilo Node.js** para programas reais: um [loop de eventos com timers](/pt/reference/host-apis), [`process`](/pt/reference/process), [`node:fs`](/pt/reference/fs), `path`, `Buffer`, streams, events, `URL`, [HTTP e TCP](/reference/network) e [chamadas a funções nativas](/pt/reference/ffi) com declarações `nona:win32` prontas. [Módulos embutidos](/pt/reference/modules) lista todos.
- **Oito alvos.** Windows, Linux e macOS em x64 e ARM64, FreeBSD e OpenBSD em x64, compilados de forma cruzada a partir de qualquer host ([Plataformas nativas](/reference/native-platforms)).
- **Pacotes npm.** Os pacotes em `node_modules` são resolvidos em tempo de compilação e compilados no executável ([pacotes npm](/reference/npm)).
- **Inicialização rápida e pouco consumo.** Um hello world compilado inicia em cerca de 2 ms, atinge no máximo 11 MB de memória e é um arquivo de cerca de 2 MB (até 7 MB quando um programa alcança todas as partes opcionais do runtime): não há runtime para inicializar nem JIT para aquecer ([Desempenho](/pt/guide/performance)).
- **Executáveis do Windows** sem janela de console, com ícone, manifesto e informações de versão ([Executáveis do Windows](/pt/reference/windows-executables)).

## O que o Nona não é

- **Não é um substituto do Node.js.** Pacotes npm são compilados no programa quando ele é gerado ([pacotes npm](/reference/npm)), mas só as [APIs do Node.js que o Nona implementa](/pt/reference/modules) estão disponíveis, e pacotes que precisam de outras (`zlib`, `child_process`), de `Intl` ou de addons nativos não funcionam. As APIs do navegador também não estão disponíveis.
- **Não é uma implementação completa do ES2020.** O Nona implementa o ES2020 com exceções documentadas; veja [Suporte à linguagem](/pt/guide/language-support) e [Compatibilidade e limitações](/pt/guide/compatibility).
- **Não gera código em tempo de execução.** `eval` e `Function` precisam de código-fonte conhecido em tempo de compilação; strings calculadas em tempo de execução lançam `EvalError`.
- **Não é tão rápido quanto o V8 em computação.** Sem JIT, chamadas, closures e alocação são de várias a dezenas de vezes mais lentas que no V8, e cadeias longas de Promise e a correspondência de RegExp são os pontos mais lentos ([Desempenho](/pt/guide/performance)).
- **Não é idêntico em todas as plataformas.** As APIs de sistema de arquivos e de rede, o FFI e alguns recursos de `process` variam conforme o alvo; veja [Plataformas nativas](/reference/native-platforms).

## Segurança

O Nona não passou por auditoria de segurança. Não compile código-fonte não confiável e não trate os executáveis gerados como sandbox: eles rodam com as mesmas permissões de qualquer outro programa nativo, e o FFI pode chamar qualquer DLL.

## Próximos passos

- [Primeiros passos](/pt/guide/getting-started) — instale o compilador e compile seu primeiro programa.
- [Como funciona](/pt/guide/how-it-works) — o pipeline, o runtime e os linkers.
- [Exemplos](/pt/examples/) — de um hello world a um trocador de papel de parede.
- [Suporte à linguagem](/pt/guide/language-support) e [Compatibilidade e limitações](/pt/guide/compatibility) — o que funciona e o que não funciona.
- [Linha de comando](/pt/reference/cli) e [Módulos embutidos](/pt/reference/modules) — a referência.
