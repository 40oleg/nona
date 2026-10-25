# Linha de comando

## Sinopse

```text
Nona 0.29.0 — JavaScript subset to native executables
Usage: nona build <input.js|package directory> -o <output> [--target win32-x64|linux-x64|linux-arm64|win32-arm64|darwin-x64|darwin-arm64|freebsd-x64|openbsd-x64] [--module]
       [--conditions name]... [--full-runtime] [--link part,...] [--print-link]
       [--call-stats] [--coverage dir] [--print-asm]
       [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
       [--version-info version.json]
       (.mjs inputs are compiled as modules)
       nona --help | --version
```

O executável `nona` publicado aceita estes argumentos. Em um clone do repositório, execute `node dist/cli.js …`; depois de `npm link`, o mesmo comando fica disponível como `nona`.

## Opções

| Opção                | Valor                                              | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-o`                 | caminho                                            | Arquivo de saída. Obrigatória. Diretórios ausentes são criados.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--target`           | [Plataformas nativas](/reference/native-platforms) | PE32+, ELF64 ou Mach-O64; padrão: o SO e a CPU do host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--module`           | —                                                  | Compila a entrada como módulo ES. Entradas terminadas em `.mjs` são módulos automaticamente.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--conditions`, `-C` | nome                                               | Adiciona uma condição de `exports`/`imports` do package.json, testada antes das condições do próprio Nona (`nona`, `node`, `import` ou `require`, `default`); `--conditions=name` também funciona. Pode ser repetida. Veja [pacotes npm](/reference/npm#resolution).                                                                                                                                                                                                                                                                                                                         |
| `--full-runtime`     | —                                                  | Liga o runtime inteiro. Por padrão, o motor de RegExp, suas tabelas de propriedades Unicode e as tabelas de normalização Unicode só são ligados quando o programa pode alcançá-los; veja [Partes do runtime ligadas](/pt/guide/compatibility#linked-runtime-parts).                                                                                                                                                                                                                                                                                                                          |
| `--call-stats`       | —                                                  | Conta cada chamada feita pelo programa e pelo seu runtime, por destino, e imprime as contagens no stderr quando o programa termina ou falha, da mais frequente para a menos frequente (`count  target` por linha). As chamadas a declarações de função conhecidas em tempo de compilação são contadas sob o rótulo de código (`js.fn.N`); as demais chamadas JavaScript passam por `rt.invoke` e são contadas ali. O executável fica maior e mais lento; use-o para descobrir em quais funções do runtime um programa gasta suas chamadas. `process.exit()` pula o relatório.                |
| `--coverage`         | diretório                                          | Conta as chamadas de cada função do programa e, quando ele termina ou um erro de execução o encerra, grava-as em `<directory>/coverage-<pid>-<n>-0.json` no formato produzido por `NODE_V8_COVERAGE`, de modo que `c8 report --temp-directory <directory>` as transforme em um relatório. A cobertura é por função (como o modo best-effort do V8): o intervalo de código de cada função com sua contagem de chamadas. O diretório precisa existir. Os nomes de métodos podem estar vazios, e o código de strings `eval` em tempo de compilação é relatado com deslocamentos nessas strings. |
| `--print-asm`        | —                                                  | Imprime no stdout o assembly x86-64 gerado para as funções do próprio programa (não o runtime nem seus prelúdios): o rótulo de cada função e uma linha por instrução com seu deslocamento, seus bytes codificados e seu texto em sintaxe Intel. Com esta opção, `-o` pode ser omitido. Apenas alvos x86-64.                                                                                                                                                                                                                                                                                  |
| `--link`             | partes, separadas por vírgulas                     | Liga também estas partes opcionais (por exemplo `--link proxy,regexp`), para um programa que só as alcança por nomes construídos em tempo de execução. Mais barato que `--full-runtime`; `--print-link` mostra os nomes das partes.                                                                                                                                                                                                                                                                                                                                                          |
| `--print-link`       | —                                                  | Imprime as partes opcionais do runtime ligadas e o motivo de cada uma: o nome no código-fonte que a selecionou, `--link` ou a parte que precisa dela. Então `-o` pode ser omitido.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--subsystem`        | `console` (padrão), `windows`                      | Programa gráfico do Windows sem janela de console. Apenas `win32-x64`. Um programa gráfico sem `--manifest` recebe um manifesto padrão.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--icon`             | arquivo `.ico`                                     | Incorpora todas as imagens do arquivo de ícone. Apenas `win32-x64`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--manifest`         | arquivo XML                                        | Incorpora um manifesto de aplicativo. Ele precisa ser válido: o Windows se recusa a iniciar um programa com manifesto malformado. Apenas `win32-x64`.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--version-info`     | arquivo JSON                                       | Incorpora informações de versão (`FileVersion`, `ProductVersion`, `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName`, `Comments`). Apenas `win32-x64`.                                                                                                                                                                                                                                                                                                                                                                                    |
| `--help`             | —                                                  | Exibe a sinopse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--version`          | —                                                  | Exibe a versão do compilador.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Cada opção, exceto `--conditions`, pode aparecer uma única vez. Veja [Executáveis do Windows](/pt/reference/windows-executables) para os formatos dos recursos.

## Entrada e saída

- A entrada é um único arquivo-fonte em UTF-8. Uma entrada do tipo módulo traz junto os módulos que importa, e uma entrada CommonJS os módulos que carrega com `require`, incluindo pacotes npm de `node_modules` ([pacotes npm](/reference/npm)); os módulos embutidos `nona:*` e `node:*` fazem parte do compilador.
- A entrada pode ser um diretório de pacote: o Nona compila o arquivo indicado pelo campo `"bin"` do seu `package.json` (o único comando, ou o que tem o nome do pacote); caso contrário, o seu `"main"` ou `index.js`.
- A saída é gravada em um arquivo temporário ao lado e depois renomeada para o lugar certo, de modo que um build com falha nunca deixa um executável pela metade e preserva o anterior.
- O compilador se recusa a sobrescrever sua própria entrada, inclusive por meio de um link físico ou simbólico.
- As saídas para Linux recebem modo `0755`.

## Cache do runtime

O runtime e os prelúdios compilados são iguais para todos os programas que ligam as mesmas partes, e gerá-los ocupa a maior parte de uma compilação. A linha de comando os guarda em um diretório de cache, então as compilações seguintes ficam cerca de três vezes mais rápidas (um hello world no Linux: 1,1 s e depois 0,33 s). A saída é idêntica com ou sem cache. As entradas pertencem a uma única versão do compilador e são ignoradas após uma atualização.

| Variável         | Efeito                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NONA_CACHE_DIR` | Diretório do cache. Padrão: `%LOCALAPPDATA%\nona\cache` no Windows, `~/Library/Caches/nona` no macOS e `$XDG_CACHE_HOME/nona` ou `~/.cache/nona` nos demais. |
| `NONA_CACHE=0`   | Não ler nem gravar o cache.                                                                                                                                  |

## Diagnósticos e códigos de saída

O status de saída é `0` em caso de sucesso e `1` em qualquer erro. Erros no código-fonte são exibidos assim:

```text
<file>:<line>:<column> <CODE>: <message>
```

| Código              | Significado                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E_LEX`, `E_SYNTAX` | O código-fonte não pode ser tokenizado ou analisado, ou usa sintaxe não suportada.                                                                                                                        |
| `E_BIND`            | Um early error encontrado ao resolver nomes (declarações duplicadas, alvos de atribuição inválidos, …).                                                                                                   |
| `E_MODULE`          | Um módulo não pode ser resolvido, lido ou vinculado, ou há conflito entre exportações.                                                                                                                    |
| `E_FFI_STATIC`      | Uma chamada a `define()` de `nona:ffi` não tem três literais de string ou tem uma assinatura inválida.                                                                                                    |
| `E_FFI_TARGET`      | Uma declaração de DLL compilada para `linux-x64`, ou uma declaração de chamada de sistema compilada para `win32-x64`.                                                                                     |
| `E_RESOURCE`        | Um ícone ou informações de versão inválidos, ou recursos solicitados para `linux-x64`.                                                                                                                    |
| `E_TARGET`          | Um alvo ou subsistema não suportado.                                                                                                                                                                      |
| `E_OPTION`          | Uma opção de compilação inválida, como um nome de parte desconhecido em `--link`.                                                                                                                         |
| `E_HOST_MODULE`     | Um módulo embutido (como `node:fs`) não está disponível para o destino.                                                                                                                                   |
| `E_INTERNAL`        | Um bug do compilador, não um erro do programa: uma verificação interna falhou na fase indicada na mensagem (`parse`, `bind`, `lower`, `codegen`, `link`, …). Relate-o junto com o programa que o provoca. |

Erros de argumentos são exibidos como `nona: <message>`, por exemplo `Unknown option: --foo`, `Duplicate option: -o`, `Missing value for --target`, `Output is required (-o <output>)`, `Unsupported target: arm64`, `Unsupported subsystem: native` ou `--subsystem requires --target win32-x64`.

## Exemplos

::: code-group

```sh [Programa de console]
nona build app.js -o build/app.exe
```

```sh [Programa gráfico com recursos]
nona build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

```sh [Linux]
nona build app.js -o build/app --target linux-x64
```

:::

## O compilador nativo

Cada [versão](https://github.com/40oleg/nona/releases/latest) traz o `nona` como executável nativo para cada uma das oito [plataformas nativas](/reference/native-platforms). Ele foi construído pelo próprio Nona, não precisa do Node.js e aceita as mesmas opções que `node dist/cli.js`. Um clone do repositório executa o compilador TypeScript no Node.js 26. O [guia de bootstrap e validação](https://github.com/40oleg/nona/blob/main/docs/self-hosting.md) descreve como o compilador nativo se reconstrói.

As declarações FFI de DLL só compilam para alvos Windows; as declarações de chamada de sistema diretas usam os números de chamada do kernel do alvo Linux, Darwin ou BSD selecionado (veja [FFI](/pt/reference/ffi)).
