# Primeiros passos

## Instalação

Baixe o arquivo do seu sistema na [versão mais recente](https://github.com/40oleg/nona/releases/latest), extraia-o e execute `nona --help` (`./nona --help` no Linux, macOS e BSD). O arquivo contém o executável (`nona.exe` no Windows, `nona` nos demais sistemas), `LICENSE`, `VERSION`, `README.txt` e `THIRD_PARTY_NOTICES.md`; o compilador é um programa nativo que não precisa do Node.js. Cada versão também lista `SHA256SUMS`. Nos nomes de arquivo abaixo, `<version>` indica a versão publicada.

Ao distribuir um programa gerado, inclua junto ao executável os arquivos `LICENSE` e `THIRD_PARTY_NOTICES.md` do arquivo do compilador. O runtime compartilhado inclui a formatação de números em bases diferentes de dez e o cálculo de raízes cúbicas abrangidos por estes [avisos](https://github.com/40oleg/nona/blob/main/THIRD_PARTY_NOTICES.md); os executáveis ARM64 também usam as funções de logaritmo e exponencial implementadas em software.

| SO                          | Arquivo                                                                  | Nome do alvo                 |
| --------------------------- | ------------------------------------------------------------------------ | ---------------------------- |
| Windows x64 / ARM64         | `nona-<version>-win32-x64.zip`, `nona-<version>-win32-arm64.zip`         | `win32-x64`, `win32-arm64`   |
| Linux x64 / ARM64           | `nona-<version>-linux-x64.tar.gz`, `nona-<version>-linux-arm64.tar.gz`   | `linux-x64`, `linux-arm64`   |
| macOS Intel / Apple Silicon | `nona-<version>-darwin-x64.tar.gz`, `nona-<version>-darwin-arm64.tar.gz` | `darwin-x64`, `darwin-arm64` |
| FreeBSD / OpenBSD x64       | `nona-<version>-freebsd-x64.tar.gz`, `nona-<version>-openbsd-x64.tar.gz` | `freebsd-x64`, `openbsd-x64` |

Em sistemas POSIX, execute `chmod +x nona` se a ferramenta de extração descartar a permissão. Para experimentar o Nona sem instalar nada, use o [playground](/playground).

### Compilar a partir do código-fonte

Você precisa do Node.js 26 ou mais recente e do npm, em qualquer host que execute o Node.js 26.

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
node dist/cli.js --help
```

O ponto de entrada do compilador é `dist/cli.js`. `npm link` no repositório coloca um comando `nona` no seu `PATH`. O restante deste site escreve `nona`; a partir de um clone, execute `node dist/cli.js`.

## Seu primeiro programa

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux e macOS]
nona build hello.js -o build/hello
./build/hello
```

:::

```text
Hello, from Nona!
a microtask runs before any timer
tick 1
tick 2
tick 3
done; at least 30 ms passed: true
```

O programa termina quando não restam timers nem jobs de Promise. O executável funciona sozinho: copie-o para uma máquina sem Node.js e ele continuará funcionando.

## Alvos e compilação cruzada

O compilador é um compilador cruzado: qualquer host pode gerar executáveis para qualquer uma das oito [plataformas nativas](/reference/native-platforms). `--target` seleciona o formato de saída e a CPU; sem ele, o alvo é o SO e a CPU do host.

```sh
nona build hello.js -o build/hello --target linux-arm64
nona build hello.js -o build/hello.exe --target win32-x64
```

Um executável compilado de forma cruzada só roda no SO e na CPU correspondentes. As saídas para Linux, BSD e macOS são gravadas com modo `0755`.

## Módulos

Uma entrada `.mjs`, ou qualquer entrada compilada com `--module`, é um módulo ES. Importações relativas (`./util.mjs`, `../lib/x.mjs`) são resolvidas ao lado do arquivo que importa e compiladas no mesmo executável. Uma entrada CommonJS é compilada junto com tudo o que ela carrega com `require`.

Os módulos embutidos usam o prefixo `nona:` (`nona:ffi`, `nona:win32`, `nona:fs`, `nona:process`); muitos nomes do Node.js (`node:fs`, `node:path`, `node:http`, …) também estão disponíveis. Veja [Módulos embutidos](/pt/reference/modules).

## Pacotes npm

Instale os pacotes com o npm como de costume e compile: o Nona resolve `node_modules` em tempo de compilação e compila os pacotes no executável. `nona build <diretório do pacote>` compila o comando `"bin"` ou o módulo `"main"` do pacote. Veja [pacotes npm](/reference/npm).

## Um programa do Windows sem console

```sh
nona build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` inicia o programa sem janela de console e incorpora um manifesto padrão; `--icon` e `--version-info` adicionam recursos exibidos pelo Explorer. Veja [Executáveis do Windows](/pt/reference/windows-executables) e o [exemplo Museum](/pt/examples/museum).

## Solução de problemas

Erros de compilação são exibidos como `file:line:column CODE: message` e o compilador sai com status 1:

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- Sintaxe não suportada é rejeitada em tempo de compilação em vez de falhar em tempo de execução.
- `E_FFI_TARGET` significa que uma declaração de DLL foi compilada para um alvo que não é Windows (ou uma chamada de sistema para `win32-x64`).
- `E_HOST_MODULE` significa que um módulo embutido não está disponível para o alvo.
- `EvalError` em tempo de execução significa que `eval` ou `Function` recebeu código-fonte que não era conhecido em tempo de compilação.

A [referência da linha de comando](/pt/reference/cli) lista todas as opções e erros.

## Próximos passos

- [Exemplos](/pt/examples/) — programas completos com explicações.
- [Suporte à linguagem](/pt/guide/language-support) e [Compatibilidade e limitações](/pt/guide/compatibility) — o que esperar.
- [Módulos embutidos](/pt/reference/modules) — as APIs do host.
