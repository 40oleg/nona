# Compatibilidade e limitações

## Escopo

O Nona tem como alvo a linguagem e os objetos embutidos da 11ª edição normativa do ECMA-262 (junho de 2020), para scripts e módulos ES. A internacionalização ECMA-402, as APIs do navegador e as APIs do Node.js são especificações separadas; o Nona fornece apenas as APIs do host listadas na [Referência](/pt/reference/modules). O contrato de completude é mantido em [`docs/es2020-contract.md`](https://github.com/40oleg/nona/blob/main/docs/es2020-contract.md).

Uma versão é descrita como "ES2020 com exceções documentadas", nunca como totalmente conforme ao ES2020.

## `eval` e `Function` {#eval-and-function}

O Nona compila antecipadamente, então `eval` e os construtores dinâmicos de funções precisam do texto-fonte em tempo de compilação:

- **Compilado antecipadamente:** um literal de string, uma concatenação de literais ou uma variável à qual só se atribuem essas constantes (o valor é comparado em tempo de execução). O `eval` direto enxerga o escopo de quem chama, `this`, `arguments`, `new.target` e `super`; as formas indiretas (`(0, eval)(…)`, `globalThis.eval(…)`, `eval?.(…)`) rodam no escopo global. Chamadas a `Function`, `GeneratorFunction`, `AsyncFunction` e `AsyncGeneratorFunction` cujos argumentos são todos literais são compiladas com a semântica de CreateDynamicFunction.
- **Não suportado:** código calculado em tempo de execução, argumentos spread para `eval` e `$262.evalScript`. Esses casos lançam:

```text
EvalError: Nona compiles ahead of time: eval and Function need source text known at compile time
```

O suporte a código em tempo de execução é acompanhado em [#11](https://github.com/40oleg/nona/issues/11).

## Diferenças em relação ao Node.js

| Área | Nona | Node.js |
| --- | --- | --- |
| `process.argv` | `[execPath, ...arguments]`: `argv[1]` é o primeiro argumento | `[node, script, ...arguments]` |
| `process` | `argv`, `env`, `exit`, `exitCode`, `execPath`, `cwd`, `platform`, `arch`, `pid` | Um EventEmitter com streams, `nextTick`, `hrtime`, … |
| Ids de timers | Números | Objetos `Timeout` |
| `readFileSync(path)` | Retorna um `Uint8Array` | Retorna um `Buffer` |
| Codificações | Apenas `utf8` (fs); UTF-8, UTF-16LE, Latin-1, ASCII, hex, base64/base64url (Buffer) | Muitas |
| Mensagens de erro no Windows | Contêm o caminho como foi passado | Contêm o caminho absoluto |
| Módulos | `nona:*`, `node:fs`, `node:path`, `node:process`, `node:buffer` e arquivos relativos | Todo o `node:*` e pacotes npm |
| `require` | Não disponíveis | Disponíveis |
| `console.log` sem saída padrão | A saída é descartada | A saída é descartada ou um erro é lançado |

## Desempenho

- Arrays e `Map`/`Set` guardam seus elementos em estruturas encadeadas; coleções muito grandes são mais lentas que no V8 ([#13](https://github.com/40oleg/nona/issues/13), [#36](https://github.com/40oleg/nona/issues/36)).
- O motor de RegExp é uma VM com backtracking escrita em JavaScript. Um padrão sem referências inversas nem lookarounds que retrocede em excesso (sem a flag `u`) é concluído por um motor de tempo linear.
- No Windows, os timers acordam no tick do sistema (normalmente 15,6 ms).
- Não há JIT: o código é compilado uma única vez, antecipadamente, sem otimização guiada por perfil.

## Realms

`$262.createRealm` é suportado para o Test262. Alguns construtores implementados em prelúdios JavaScript ainda pegam os protótipos padrão do realm errado quando chamados com um `new.target` de outro realm ([#7](https://github.com/40oleg/nona/issues/7)).

## Plataformas

- Alvos: apenas Windows 10/11 x64 e Linux x86-64.
- Executáveis do Windows importam apenas `KERNEL32.dll`, `KERNELBASE.dll` e as DLLs declaradas via FFI; executáveis do Linux são estáticos e usam chamadas de sistema diretamente.
- FFI para DLLs existe apenas no Windows; chamadas de sistema diretas, apenas no Linux.

## Plataformas nativas

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — Plataformas nativas](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.

## Buffer

Global `Buffer`, `Blob` and `File`, and `node:buffer` / `buffer` / `nona:buffer` imports are available on every native target. Buffer supports standard byte encodings, shared slices, copying, searching and numeric access. Blob/File support immutable data and metadata. Blob byte/text streams and object URL registration/resolution are available; see [the API contract and limitations](/reference/host-apis#buffer-and-binary-data).
