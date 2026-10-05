# Primeiros passos

## Requisitos

- Para executar o compilador: Node.js 26 ou mais recente e npm, no Windows ou no Linux.
- Alvos: Windows 10/11 x64 (`win32-x64`, o padrão) e Linux x86-64 (`linux-x64`).

## Compilar o compilador

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
```

O ponto de entrada do compilador é `dist/cli.js`; os exemplos deste site o executam como `node dist/cli.js`. O pacote também declara um comando `nona`: `npm link` no repositório o coloca no seu `PATH`.

## Seu primeiro programa

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
node dist/cli.js build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux]
node dist/cli.js build hello.js -o build/hello --target linux-x64
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

O compilador é um compilador cruzado: no Windows ele pode gerar executáveis para Linux e no Linux pode gerar executáveis para Windows. `--target` seleciona o formato de saída; o padrão é `win32-x64`. As saídas para Linux são gravadas com modo `0755`.

## Módulos

Uma entrada `.mjs`, ou qualquer entrada compilada com `--module`, é um módulo ES. Importações relativas (`./util.mjs`, `../lib/x.mjs`) são resolvidas ao lado do arquivo que importa e compiladas no mesmo executável. Os módulos embutidos usam o prefixo `nona:` (`nona:ffi`, `nona:win32`, `nona:fs`, `nona:process`), e `node:fs` e `node:process` são aliases dos subconjuntos do Nona; veja [Módulos embutidos](/pt/reference/modules).

## Um programa do Windows sem console

```sh
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` inicia o programa sem janela de console e incorpora um manifesto padrão; `--icon` e `--version-info` adicionam recursos exibidos pelo Explorer. Veja [Executáveis do Windows](/pt/reference/windows-executables) e o [exemplo Museum](/pt/examples/museum).

## Solução de problemas

Erros de compilação são exibidos como `file:line:column CODE: message` e o compilador sai com status 1:

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- Sintaxe não suportada é rejeitada em tempo de compilação em vez de falhar em tempo de execução.
- `E_FFI_TARGET` significa que uma declaração de DLL foi compilada para `linux-x64` (ou uma chamada de sistema para `win32-x64`).
- `EvalError` em tempo de execução significa que `eval` ou `Function` recebeu código-fonte que não era conhecido em tempo de compilação.

A [referência da linha de comando](/pt/reference/cli) lista todas as opções e erros.

## Plataformas nativas

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — Plataformas nativas](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.
