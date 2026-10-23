# Linha de comando

## Sinopse

```text
Nona 0.25.0 вЂ” JavaScript subset to native executables
Usage: nona build <input.js|package directory> -o <output> [--target win32-x64|linux-x64|linux-arm64|win32-arm64|darwin-x64|darwin-arm64|freebsd-x64|openbsd-x64] [--module]
       [--conditions name]... [--full-runtime] [--link part,...] [--print-link]
       [--call-stats] [--coverage dir] [--print-asm]
       [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
       [--version-info version.json]
       (.mjs inputs are compiled as modules)
       nona --help | --version
```

O executГЎvel `nona` publicado aceita estes argumentos. Em um clone do repositГіrio, execute `node dist/cli.js вЂ¦`; depois de `npm link`, o mesmo comando fica disponГ­vel como `nona`.

## OpГ§Гµes

| OpГ§ГЈo                | Valor                                              | DescriГ§ГЈo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-o`                 | caminho                                            | Arquivo de saГ­da. ObrigatГіria. DiretГіrios ausentes sГЈo criados.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--target`           | [Plataformas nativas](/reference/native-platforms) | PE32+, ELF64 ou Mach-O64; padrГЈo: o SO e a CPU do host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--module`           | вЂ”                                                  | Compila a entrada como mГіdulo ES. Entradas terminadas em `.mjs` sГЈo mГіdulos automaticamente.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--conditions`, `-C` | nome                                               | Adiciona uma condiГ§ГЈo de `exports`/`imports` do package.json, testada antes das condiГ§Гµes do prГіprio Nona (`nona`, `node`, `import` ou `require`, `default`); `--conditions=name` tambГ©m funciona. Pode ser repetida. Veja [pacotes npm](/reference/npm#resolution).                                                                                                                                                                                                                                                                                                                         |
| `--full-runtime`     | вЂ”                                                  | Liga o runtime inteiro. Por padrГЈo, o motor de RegExp, suas tabelas de propriedades Unicode e as tabelas de normalizaГ§ГЈo Unicode sГі sГЈo ligados quando o programa pode alcanГ§ГЎ-los; veja [Partes do runtime ligadas](/pt/guide/compatibility#linked-runtime-parts).                                                                                                                                                                                                                                                                                                                          |
| `--call-stats`       | вЂ”                                                  | Conta cada chamada feita pelo programa e pelo seu runtime, por destino, e imprime as contagens no stderr quando o programa termina ou falha, da mais frequente para a menos frequente (`count  target` por linha). As chamadas a declaraГ§Гµes de funГ§ГЈo conhecidas em tempo de compilaГ§ГЈo sГЈo contadas sob o rГіtulo de cГіdigo (`js.fn.N`); as demais chamadas JavaScript passam por `rt.invoke` e sГЈo contadas ali. O executГЎvel fica maior e mais lento; use-o para descobrir em quais funГ§Гµes do runtime um programa gasta suas chamadas. `process.exit()` pula o relatГіrio.                |
| `--coverage`         | diretГіrio                                          | Conta as chamadas de cada funГ§ГЈo do programa e, quando ele termina ou um erro de execuГ§ГЈo o encerra, grava-as em `<directory>/coverage-<pid>-<n>-0.json` no formato produzido por `NODE_V8_COVERAGE`, de modo que `c8 report --temp-directory <directory>` as transforme em um relatГіrio. A cobertura Г© por funГ§ГЈo (como o modo best-effort do V8): o intervalo de cГіdigo de cada funГ§ГЈo com sua contagem de chamadas. O diretГіrio precisa existir. Os nomes de mГ©todos podem estar vazios, e o cГіdigo de strings `eval` em tempo de compilaГ§ГЈo Г© relatado com deslocamentos nessas strings. |
| `--print-asm`        | вЂ”                                                  | Imprime no stdout o assembly x86-64 gerado para as funГ§Гµes do prГіprio programa (nГЈo o runtime nem seus prelГєdios): o rГіtulo de cada funГ§ГЈo e uma linha por instruГ§ГЈo com seu deslocamento, seus bytes codificados e seu texto em sintaxe Intel. Com esta opГ§ГЈo, `-o` pode ser omitido. Apenas alvos x86-64.                                                                                                                                                                                                                                                                                  |
| `--link`             | partes, separadas por vГ­rgulas                     | Liga tambГ©m estas partes opcionais (por exemplo `--link proxy,regexp`), para um programa que sГі as alcanГ§a por nomes construГ­dos em tempo de execuГ§ГЈo. Mais barato que `--full-runtime`; `--print-link` mostra os nomes das partes.                                                                                                                                                                                                                                                                                                                                                          |
| `--print-link`       | вЂ”                                                  | Imprime as partes opcionais do runtime ligadas e o motivo de cada uma: o nome no cГіdigo-fonte que a selecionou, `--link` ou a parte que precisa dela. EntГЈo `-o` pode ser omitido.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--subsystem`        | `console` (padrГЈo), `windows`                      | Programa grГЎfico do Windows sem janela de console. Apenas `win32-x64`. Um programa grГЎfico sem `--manifest` recebe um manifesto padrГЈo.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--icon`             | arquivo `.ico`                                     | Incorpora todas as imagens do arquivo de Г­cone. Apenas `win32-x64`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--manifest`         | arquivo XML                                        | Incorpora um manifesto de aplicativo. Ele precisa ser vГЎlido: o Windows se recusa a iniciar um programa com manifesto malformado. Apenas `win32-x64`.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--version-info`     | arquivo JSON                                       | Incorpora informaГ§Гµes de versГЈo (`FileVersion`, `ProductVersion`, `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName`, `Comments`). Apenas `win32-x64`.                                                                                                                                                                                                                                                                                                                                                                                    |
| `--help`             | вЂ”                                                  | Exibe a sinopse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--version`          | вЂ”                                                  | Exibe a versГЈo do compilador.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Cada opГ§ГЈo, exceto `--conditions`, pode aparecer uma Гєnica vez. Veja [ExecutГЎveis do Windows](/pt/reference/windows-executables) para os formatos dos recursos.

## Entrada e saГ­da

- A entrada Г© um Гєnico arquivo-fonte em UTF-8. Uma entrada do tipo mГіdulo traz junto os mГіdulos que importa, e uma entrada CommonJS os mГіdulos que carrega com `require`, incluindo pacotes npm de `node_modules` ([pacotes npm](/reference/npm)); os mГіdulos embutidos `nona:*` e `node:*` fazem parte do compilador.
- A entrada pode ser um diretГіrio de pacote: o Nona compila o arquivo indicado pelo campo `"bin"` do seu `package.json` (o Гєnico comando, ou o que tem o nome do pacote); caso contrГЎrio, o seu `"main"` ou `index.js`.
- A saГ­da Г© gravada em um arquivo temporГЎrio ao lado e depois renomeada para o lugar certo, de modo que um build com falha nunca deixa um executГЎvel pela metade e preserva o anterior.
- O compilador se recusa a sobrescrever sua prГіpria entrada, inclusive por meio de um link fГ­sico ou simbГіlico.
- As saГ­das para Linux recebem modo `0755`.

## Cache do runtime

O runtime e os prelГєdios compilados sГЈo iguais para todos os programas que ligam as mesmas partes, e gerГЎ-los ocupa a maior parte de uma compilaГ§ГЈo. A linha de comando os guarda em um diretГіrio de cache, entГЈo as compilaГ§Гµes seguintes ficam cerca de trГЄs vezes mais rГЎpidas (um hello world no Linux: 1,1 s e depois 0,33 s). A saГ­da Г© idГЄntica com ou sem cache. As entradas pertencem a uma Гєnica versГЈo do compilador e sГЈo ignoradas apГіs uma atualizaГ§ГЈo.

| VariГЎvel         | Efeito                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NONA_CACHE_DIR` | DiretГіrio do cache. PadrГЈo: `%LOCALAPPDATA%\nona\cache` no Windows, `~/Library/Caches/nona` no macOS e `$XDG_CACHE_HOME/nona` ou `~/.cache/nona` nos demais. |
| `NONA_CACHE=0`   | NГЈo ler nem gravar o cache.                                                                                                                                  |

## DiagnГіsticos e cГіdigos de saГ­da

O status de saГ­da Г© `0` em caso de sucesso e `1` em qualquer erro. Erros no cГіdigo-fonte sГЈo exibidos assim:

```text
<file>:<line>:<column> <CODE>: <message>
```

| CГіdigo              | Significado                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E_LEX`, `E_SYNTAX` | O cГіdigo-fonte nГЈo pode ser tokenizado ou analisado, ou usa sintaxe nГЈo suportada.                                                                                                                        |
| `E_BIND`            | Um early error encontrado ao resolver nomes (declaraГ§Гµes duplicadas, alvos de atribuiГ§ГЈo invГЎlidos, вЂ¦).                                                                                                   |
| `E_MODULE`          | Um mГіdulo nГЈo pode ser resolvido, lido ou vinculado, ou hГЎ conflito entre exportaГ§Гµes.                                                                                                                    |
| `E_FFI_STATIC`      | Uma chamada a `define()` de `nona:ffi` nГЈo tem trГЄs literais de string ou tem uma assinatura invГЎlida.                                                                                                    |
| `E_FFI_TARGET`      | Uma declaraГ§ГЈo de DLL compilada para `linux-x64`, ou uma declaraГ§ГЈo de chamada de sistema compilada para `win32-x64`.                                                                                     |
| `E_RESOURCE`        | Um Г­cone ou informaГ§Гµes de versГЈo invГЎlidos, ou recursos solicitados para `linux-x64`.                                                                                                                    |
| `E_TARGET`          | Um alvo ou subsistema nГЈo suportado.                                                                                                                                                                      |
| `E_OPTION`          | Uma opГ§ГЈo de compilaГ§ГЈo invГЎlida, como um nome de parte desconhecido em `--link`.                                                                                                                         |
| `E_HOST_MODULE`     | Um mГіdulo embutido (como `node:fs`) nГЈo estГЎ disponГ­vel para o destino.                                                                                                                                   |
| `E_INTERNAL`        | Um bug do compilador, nГЈo um erro do programa: uma verificaГ§ГЈo interna falhou na fase indicada na mensagem (`parse`, `bind`, `lower`, `codegen`, `link`, вЂ¦). Relate-o junto com o programa que o provoca. |

Erros de argumentos sГЈo exibidos como `nona: <message>`, por exemplo `Unknown option: --foo`, `Duplicate option: -o`, `Missing value for --target`, `Output is required (-o <output>)`, `Unsupported target: arm64`, `Unsupported subsystem: native` ou `--subsystem requires --target win32-x64`.

## Exemplos

::: code-group

```sh [Programa de console]
nona build app.js -o build/app.exe
```

```sh [Programa grГЎfico com recursos]
nona build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

```sh [Linux]
nona build app.js -o build/app --target linux-x64
```

:::

## O compilador nativo

Cada [versГЈo](https://github.com/40oleg/nona/releases/latest) traz o `nona` como executГЎvel nativo para cada uma das oito [plataformas nativas](/reference/native-platforms). Ele foi construГ­do pelo prГіprio Nona, nГЈo precisa do Node.js e aceita as mesmas opГ§Гµes que `node dist/cli.js`. Um clone do repositГіrio executa o compilador TypeScript no Node.js 26. O [guia de bootstrap e validaГ§ГЈo](https://github.com/40oleg/nona/blob/main/docs/self-hosting.md) descreve como o compilador nativo se reconstrГіi.

As declaraГ§Гµes FFI de DLL sГі compilam para alvos Windows; as declaraГ§Гµes de chamada de sistema diretas usam os nГєmeros de chamada do kernel do alvo Linux, Darwin ou BSD selecionado (veja [FFI](/pt/reference/ffi)).
