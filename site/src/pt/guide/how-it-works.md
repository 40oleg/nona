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
                       runtime (native code + JS preludes) → PE32+/ELF64/Mach-O64 linker
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

Antes da geração de código, a IR de cada função passa por otimizações que preservam exatamente a semântica de JavaScript: dobramento e propagação de constantes com remoção de desvios de condição conhecida, remoção de verificações da zona morta temporal, propagação de cópias e remoção de código morto, substituição escalar de literais de objeto e array que não escapam, inferência do tipo Number e chamadas diretas a funções conhecidas ([arquitetura](https://github.com/40oleg/nona/blob/main/docs/architecture.md#ir-optimization)).

## Geração de código

[`src/backend/x64`](https://github.com/40oleg/nona/tree/main/src/backend/x64) contém um codificador de instruções e um assembler x86-64, além do gerador de código, que transforma as operações da IR em chamadas ao runtime e caminhos rápidos inline; [`src/backend/arm64`](https://github.com/40oleg/nona/tree/main/src/backend/arm64) faz o mesmo para AArch64. O código gerado usa uma convenção de chamada lógica compartilhada; pontes do SO a convertem para a ABI nativa de cada plataforma.

## Runtime

Cada executável contém o runtime de [`src/runtime`](https://github.com/40oleg/nona/tree/main/src/runtime):

- **Valores** são pares etiquetados de 16 bytes: undefined, null, booleanos, números binary64, strings UTF-16, objetos, símbolos e BigInts.
- **Objetos** criados por literais e construtores compartilham _shapes_ (classes ocultas): suas propriedades ficam em slots de 16 bytes descritos pela shape, e os caches inline do código gerado os leem e escrevem após uma única comparação de shape. O que uma shape não consegue descrever (acessores, exclusão, outros atributos, chaves símbolo) transforma o objeto em uma lista ordenada de propriedades, que ganha um índice hash quando cresce.
- O **código nativo** dos objetos embutidos é emitido como x86-64 por um pequeno construtor (`RuntimeBuilder`).
- Os **prelúdios em JavaScript** (`src/lib/runtime/*.js`) implementam partes da biblioteca em JavaScript e são compilados em cada executável: o motor de RegExp, os drivers de Promise e async, os auxiliares de Proxy e Reflect, timers e o loop de eventos, `process`, `TextEncoder`/`TextDecoder` e os objetos embutidos do Annex B.

### Instruções vetoriais (SIMD)

As rotinas mais usadas do runtime trabalham com 16 bytes por vez usando instruções vetoriais de 128 bits: SSE2 em x86-64 e NEON em ARM64. Toda CPU dessas arquiteturas as possui, então os executáveis não verificam a CPU e rodam em qualquer máquina; AVX não é usado ([#253](https://github.com/40oleg/nona/issues/253)).

- **Strings:** igualdade e ordem de duas strings, `indexOf`, `includes`, `lastIndexOf`, `split` e `replaceAll` (busca vetorial da primeira unidade do padrão) e cópias de unidades de código.
- **Arrays tipados:** `fill`, `copyWithin`, `slice`, `set`, `indexOf`, `lastIndexOf` e `includes` movem ou comparam blocos de memória.
- **Arrays:** `shift` e `splice` movem os slots de elementos 64 bytes por passo ([#262](https://github.com/40oleg/nona/issues/262)).
- **RegExp:** um padrão cujas correspondências só podem começar por uma de até oito unidades de código salta até elas com uma varredura vetorial antes de cada tentativa ([#258](https://github.com/40oleg/nona/issues/258)).
- **Memória:** novos blocos do heap são zerados com escritas de 16 bytes.

Para onde vão as instruções de programas reais e quais rotinas os vetores aceleram está medido em [`docs/simd.md`](https://github.com/40oleg/nona/blob/main/docs/simd.md) (em inglês).

### Coletor de lixo

O coletor é preciso e não move objetos: mark-and-sweep sobre raízes explícitas (globais, slots de pilha vivos nos safepoints, escopos raiz do runtime). As pilhas de corrotinas de geradores e funções async (1 MiB cada) contam para o limite de coleta. No Linux, os blocos do heap vêm de classes de tamanho recortadas de arenas de 1 MiB. O contrato interno de memória está descrito em [`docs/runtime-memory.md`](https://github.com/40oleg/nona/blob/main/docs/runtime-memory.md) (em russo).

### Exceções, corrotinas e o loop de eventos

- As exceções desempilham frames nativos usando dados de unwind reais; um estouro de pilha lança um `RangeError` capturável.
- Geradores e funções async rodam em pilhas próprias e trocam de contexto em `yield` e `await`.
- Depois do programa de nível superior, o ponto de entrada executa o loop de eventos: ele esvazia os jobs de Promise, espera o próximo timer sem usar a CPU e sai quando não resta nada ([detalhes](/pt/reference/host-apis)).

## Linkagem

- **PE32+** ([`src/backend/pe`](https://github.com/40oleg/nona/tree/main/src/backend/pe)): seções, a tabela de importação (KERNEL32 para o runtime, mais as DLLs declaradas com FFI), relocações de base, dados de unwind e recursos (ícone, manifesto, informações de versão).
- **ELF64** ([`src/backend/elf`](https://github.com/40oleg/nona/tree/main/src/backend/elf), [`src/backend/linux`](https://github.com/40oleg/nona/tree/main/src/backend/linux), [`src/backend/bsd`](https://github.com/40oleg/nona/tree/main/src/backend/bsd)): cada função do KERNEL32 usada pelo runtime tem um shim de chamada de sistema com a mesma convenção de chamada, de modo que o código do runtime é compartilhado entre os alvos. Linux e BSDs fazem chamadas ao kernel diretamente, sem libc.
- **Mach-O64** ([`src/backend/macho`](https://github.com/40oleg/nona/tree/main/src/backend/macho), [`src/backend/darwin`](https://github.com/40oleg/nona/tree/main/src/backend/darwin)): os executáveis do macOS Intel também usam chamadas diretas ao kernel; os executáveis do Apple Silicon carregam a `libSystem.B.dylib` do sistema via dyld para a inicialização e os serviços do SO.

O mesmo runtime atende os oito alvos; [Plataformas nativas](/reference/native-platforms) lista o que é verificado onde.

## Autohospedagem

O compilador compila a si mesmo. O `nona` publicado é um executável nativo construído pelo Nona, sem Node.js dentro; no Windows e no Linux x64 ele se reconstrói em um segundo estágio idêntico byte a byte. O [guia de bootstrap](https://github.com/40oleg/nona/blob/main/docs/self-hosting.md) descreve o procedimento e suas verificações.

## FFI

Uma chamada `define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)')` é resolvida em tempo de compilação: a declaração vira uma entrada na tabela de importação PE e um thunk nativo que converte valores JavaScript, segue a ABI Win64 e captura `GetLastError`. No Linux, `define('syscall', '1', …)` declara uma chamada de sistema direta. Veja [Funções nativas (FFI)](/pt/reference/ffi).

## Estrutura do repositório

```text
src/frontend       lexer, parser, early errors, scope binding, compile-time eval/Function
src/ir             intermediate representation, lowering and liveness
src/backend/x64    x86-64 encoding and code generation
src/backend/arm64  AArch64 encoding and code generation
src/backend/pe     PE32+ linker: imports, relocations, unwind data, resources
src/backend/elf    ELF64 linker; src/backend/linux, bsd: system-call shims
src/backend/macho  Mach-O64 linker; src/backend/darwin: macOS services
src/runtime        native runtime and JavaScript preludes emitted into every executable
tests              unit, integration, native-execution and compatibility tests
examples           sample programs
site               this documentation site
```

## Formal verification prototype

[Lean proofs](https://github.com/40oleg/nona/blob/main/docs/formal-verification.md) cover selected slot move rules and a modeled straight-line dead-move optimizer. Run `npm run check:proofs` with Lean/elan installed. The production compiler, CFG analysis and native runtime are outside the current formal guarantee.
