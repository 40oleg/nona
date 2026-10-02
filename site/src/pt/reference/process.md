# API de process

::: info Tradução
Esta página é uma tradução da página em inglês [Process API](/reference/process), gerada a partir de [`docs/process.md`](https://github.com/40oleg/nona/blob/main/docs/process.md). A versão em inglês é a de referência e pode ser mais recente.
:::

`process` é um objeto global (como no Node.js), também disponível como exportação padrão de `node:process` e `nona:process`, que além disso exportam `argv`, `env`, `platform`, `arch`, `pid`, `execPath`, `exit` e `cwd`.

| Membro | Observações |
| --- | --- |
| `argv` | `[execPath, ...arguments]`. Não há caminho de script: `argv[1]` é o primeiro argumento (o Node.js coloca ali o caminho do script). No Windows, a linha de comando é dividida pelas regras de `CommandLineToArgvW`. |
| `env` | Um objeto simples com um retrato do ambiente no primeiro acesso. As alterações não são repassadas ao sistema operacional. No Windows, as entradas ocultas do tipo `=C:` são ignoradas. |
| `exit(code?)` | Encerra imediatamente com `code`, ou com `process.exitCode` (padrão 0). |
| `exitCode` | Usado como status de saída quando o programa termina normalmente. |
| `execPath` | Caminho absoluto do executável em execução. |
| `cwd()` | Diretório de trabalho atual. |
| `platform`, `arch`, `pid` | `'win32'` ou `'linux'`, `'x64'`, o id do processo. |

`process` é construído sob demanda no primeiro acesso, então programas que não o usam não pagam nada na inicialização. Diferentemente do Node.js, ele não é um EventEmitter e não tem os streams `stdout`/`stdin`, `nextTick`, `hrtime` nem `memoryUsage`.

Implementação: cada imagem contém as funções do host dos dois alvos, de modo que o mesmo programa gerado pode ser ligado como PE e como ELF; cada linker associa as importações do outro alvo a um stub que retorna 0. No Windows, `GetCommandLineW`, `GetEnvironmentStringsW`, `GetModuleFileNameW` e `GetCurrentDirectoryW` são lidos por thunks FFI que o compilador instala para o seu próprio prelúdio; no Linux, são lidos `/proc/self/cmdline`, `/proc/self/environ` e `/proc/self/exe`, e `getcwd`/`exit_group` são chamados diretamente.
