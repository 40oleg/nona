# Linha de comando

## Sinopse

```text
Nona 0.8.0 — JavaScript subset to native executables
Usage: nona build <input.js> -o <output> [--target win32-x64|linux-x64|linux-arm64|win32-arm64|darwin-x64|freebsd-x64|openbsd-x64] [--module]
       [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
       [--version-info version.json]
       (.mjs inputs are compiled as modules)
       nona --help | --version
```

Em um clone do repositório, execute `node dist/cli.js …`; depois de `npm link`, o mesmo comando fica disponível como `nona`.

## Opções

| Opção | Valor | Descrição |
| --- | --- | --- |
| `-o` | caminho | Arquivo de saída. Obrigatória. Diretórios ausentes são criados. |
| `--target` | [Native platforms](/reference/native-platforms) | PE32+, ELF64 or Mach-O64; default: host OS and CPU. |
| `--module` | — | Compila a entrada como módulo ES. Entradas terminadas em `.mjs` são módulos automaticamente. |
| `--subsystem` | `console` (padrão), `windows` | Programa gráfico do Windows sem janela de console. Apenas `win32-x64`. Um programa gráfico sem `--manifest` recebe um manifesto padrão. |
| `--icon` | arquivo `.ico` | Incorpora todas as imagens do arquivo de ícone. Apenas `win32-x64`. |
| `--manifest` | arquivo XML | Incorpora um manifesto de aplicativo. Ele precisa ser válido: o Windows se recusa a iniciar um programa com manifesto malformado. Apenas `win32-x64`. |
| `--version-info` | arquivo JSON | Incorpora informações de versão (`FileVersion`, `ProductVersion`, `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName`, `Comments`). Apenas `win32-x64`. |
| `--help` | — | Exibe a sinopse. |
| `--version` | — | Exibe a versão do compilador. |

Cada opção pode aparecer uma única vez. Veja [Executáveis do Windows](/pt/reference/windows-executables) para os formatos dos recursos.

## Entrada e saída

- A entrada é um único arquivo-fonte em UTF-8. Uma entrada do tipo módulo traz junto os módulos que importa; os módulos embutidos `nona:*` e `node:*` fazem parte do compilador.
- A saída é gravada em um arquivo temporário ao lado e depois renomeada para o lugar certo, de modo que um build com falha nunca deixa um executável pela metade e preserva o anterior.
- O compilador se recusa a sobrescrever sua própria entrada, inclusive por meio de um link físico ou simbólico.
- As saídas para Linux recebem modo `0755`.

## Cache do runtime

O runtime e os prelúdios compilados são iguais para todos os programas que ligam as mesmas partes, e gerá-los ocupa a maior parte de uma compilação. A linha de comando os guarda em um diretório de cache, então as compilações seguintes ficam cerca de três vezes mais rápidas (um hello world no Linux: 1,1 s e depois 0,33 s). A saída é idêntica com ou sem cache. As entradas pertencem a uma única versão do compilador e são ignoradas após uma atualização.

| Variável | Efeito |
| --- | --- |
| `NONA_CACHE_DIR` | Diretório do cache. Padrão: `%LOCALAPPDATA%\nona\cache` no Windows, `~/Library/Caches/nona` no macOS e `$XDG_CACHE_HOME/nona` ou `~/.cache/nona` nos demais. |
| `NONA_CACHE=0` | Não ler nem gravar o cache. |

## Diagnósticos e códigos de saída

O status de saída é `0` em caso de sucesso e `1` em qualquer erro. Erros no código-fonte são exibidos assim:

```text
<file>:<line>:<column> <CODE>: <message>
```

| Código | Significado |
| --- | --- |
| `E_LEX`, `E_SYNTAX` | O código-fonte não pode ser tokenizado ou analisado, ou usa sintaxe não suportada. |
| `E_BIND` | Um early error encontrado ao resolver nomes (declarações duplicadas, alvos de atribuição inválidos, …). |
| `E_MODULE` | Um módulo não pode ser resolvido, lido ou vinculado, ou há conflito entre exportações. |
| `E_FFI_STATIC` | Uma chamada a `define()` de `nona:ffi` não tem três literais de string ou tem uma assinatura inválida. |
| `E_FFI_TARGET` | Uma declaração de DLL compilada para `linux-x64`, ou uma declaração de chamada de sistema compilada para `win32-x64`. |
| `E_RESOURCE` | Um ícone ou informações de versão inválidos, ou recursos solicitados para `linux-x64`. |
| `E_TARGET` | Um alvo ou subsistema não suportado. |

Erros de argumentos são exibidos como `nona: <message>`, por exemplo `Unknown option: --foo`, `Duplicate option: -o`, `Missing value for --target`, `Output is required (-o <output>)`, `Unsupported target: arm64`, `Unsupported subsystem: native` ou `--subsystem requires --target win32-x64`.

## Exemplos

::: code-group

```sh [Programa de console]
node dist/cli.js build app.js -o build/app.exe
```

```sh [Programa gráfico com recursos]
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

```sh [Linux]
node dist/cli.js build app.js -o build/app --target linux-x64
```

:::


## Native target availability

Windows/Linux x64 and ARM64, Intel macOS and FreeBSD/OpenBSD x64 targets are available. Apple Silicon startup is not enabled. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
