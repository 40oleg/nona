# Como funciona

## Pipeline

```text
JavaScript source (script or module graph)
      │
      ▼
 lexer → parser → early errors and scope binding → compile-time eval/Function
                                                         │
                                                         ▼
                                     IR lowering → x86-64 code generation
                                                         │
                                                         ▼
                       runtime (native code + JS preludes) → PE32+ or ELF64 linker
```

Tudo roda dentro do processo do compilador; não há assembler, linker ou compilador de C externo. O resultado é um único arquivo que contém o código de máquina do programa e o runtime do Nona.

## Frontend

[`src/frontend`](https://github.com/40oleg/nona/tree/main/src/frontend) transforma o texto-fonte em um programa vinculado:

- `lexer.ts`, `parser.ts` e `ast.ts` produzem a árvore sintática; sintaxe não suportada é um erro de compilação.
- `binder.ts` e `declarations.ts` aplicam os erros antecipados (early errors), resolvem cada identificador para um escopo (global, de módulo, de função, de bloco, objeto `with`) e decidem quais bindings vivem em closures.
- `modules.ts` carrega o grafo de módulos: importações estáticas, `import()` com especificadores literais, ciclos e resolução de exportações. `builtin-modules.ts` e `fs-module.ts` fornecem os módulos `nona:*` e `node:*`.
- `eval-aot.ts` e `dynamic-functions.ts` compilam chamadas a `eval` e `Function` cujo texto-fonte é conhecido em tempo de compilação.

## Representação intermediária

[`src/ir`](https://github.com/40oleg/nona/tree/main/src/ir) converte o programa vinculado em uma IR baseada em registradores, formada por blocos, operações e terminadores (`lower.ts`, `model.ts`), e calcula a vivacidade (`liveness.ts`) para que o coletor de lixo veja apenas valores vivos em cada safepoint.

## Geração de código

[`src/backend/x64`](https://github.com/40oleg/nona/tree/main/src/backend/x64) contém um codificador de instruções e um assembler x86-64, além do gerador de código, que transforma as operações da IR em chamadas ao runtime e caminhos rápidos inline. O código gerado e o runtime seguem a convenção de chamada Win64 nos dois alvos.

## Runtime

Cada executável contém o runtime de [`src/runtime`](https://github.com/40oleg/nona/tree/main/src/runtime):

- **Valores** são pares etiquetados de 16 bytes: undefined, null, booleanos, números binary64, strings UTF-16, objetos, símbolos e BigInts.
- **Objetos** guardam suas propriedades na ordem de inserção; objetos com 32 ou mais propriedades ganham um índice hash.
- O **código nativo** dos objetos embutidos é emitido como x86-64 por um pequeno construtor (`RuntimeBuilder`).
- Os **prelúdios em JavaScript** (`*-source.ts`) implementam partes da biblioteca em JavaScript e são compilados em cada executável: o motor de RegExp, os drivers de Promise e async, os auxiliares de Proxy e Reflect, timers e o loop de eventos, `process`, `TextEncoder`/`TextDecoder` e os objetos embutidos do Annex B.

### Coletor de lixo

O coletor é preciso e não move objetos: mark-and-sweep sobre raízes explícitas (globais, slots de pilha vivos nos safepoints, escopos raiz do runtime). As pilhas de corrotinas de geradores e funções async (1 MiB cada) contam para o limite de coleta. No Linux, os blocos do heap vêm de classes de tamanho recortadas de arenas de 1 MiB. O contrato interno de memória está descrito em [`docs/runtime-memory.md`](https://github.com/40oleg/nona/blob/main/docs/runtime-memory.md) (em russo).

### Exceções, corrotinas e o loop de eventos

- As exceções desempilham frames nativos usando dados de unwind reais; um estouro de pilha lança um `RangeError` capturável.
- Geradores e funções async rodam em pilhas próprias e trocam de contexto em `yield` e `await`.
- Depois do programa de nível superior, o ponto de entrada executa o loop de eventos: ele esvazia os jobs de Promise, espera o próximo timer sem usar a CPU e sai quando não resta nada ([detalhes](/pt/reference/host-apis)).

## Linkagem

- **PE32+** ([`src/backend/pe`](https://github.com/40oleg/nona/tree/main/src/backend/pe)): seções, a tabela de importação (KERNEL32 para o runtime, mais as DLLs declaradas com FFI), relocações de base, dados de unwind e recursos (ícone, manifesto, informações de versão).
- **ELF64** ([`src/backend/elf`](https://github.com/40oleg/nona/tree/main/src/backend/elf), [`src/backend/linux`](https://github.com/40oleg/nona/tree/main/src/backend/linux)): cada função do KERNEL32 usada pelo runtime tem um shim de chamada de sistema do Linux com a mesma convenção de chamada, de modo que o código do runtime é compartilhado entre os alvos.

## FFI

Uma chamada `define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)')` é resolvida em tempo de compilação: a declaração vira uma entrada na tabela de importação PE e um thunk nativo que converte valores JavaScript, segue a ABI Win64 e captura `GetLastError`. No Linux, `define('syscall', '1', …)` declara uma chamada de sistema direta. Veja [Funções nativas (FFI)](/pt/reference/ffi).

## Estrutura do repositório

```text
src/frontend       lexer, parser, early errors, scope binding, compile-time eval/Function
src/ir             intermediate representation, lowering and liveness
src/backend/x64    x86-64 encoding and code generation
src/backend/pe     PE32+ linker: imports, relocations, unwind data, resources
src/backend/elf    ELF64 linker; src/backend/linux: system-call shims
src/runtime        native runtime and JavaScript preludes emitted into every executable
tests              unit, integration, native-execution and compatibility tests
examples           sample programs
site               this documentation site
```

## Plataformas nativas

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — Plataformas nativas](/reference/native-platforms). `darwin-arm64`: not enabled yet.
