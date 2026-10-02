---
layout: home

hero:
  name: Nona
  text: De JavaScript para executáveis nativos
  tagline: Um compilador ahead-of-time que transforma JavaScript ES2020 em executáveis independentes para Windows e Linux x64. Sem interpretador embutido e sem toolchain de C.
  actions:
    - theme: brand
      text: Começar
      link: /pt/guide/getting-started
    - theme: alt
      text: Experimente no navegador
      link: /playground
    - theme: alt
      text: O que é o Nona
      link: /pt/guide/what-is-nona
    - theme: alt
      text: GitHub
      link: https://github.com/40oleg/nona

features:
  - title: Inicia em 2 ms
    details: Um hello world compilado inicia em 1,8 ms e atinge no máximo 11 MB de memória, em um executável de 7 MB. O Node.js leva 28 ms e usa 45 MB; um executável Node SEA tem 124 MB.
    link: /pt/guide/performance
  - title: A linguagem ES2020
    details: Classes, geradores, funções async, desestruturação, encadeamento opcional, BigInt, chamadas de cauda próprias e módulos ES com ciclos e live bindings — com exceções documentadas.
    link: /pt/guide/language-support
  - title: Um runtime nativo
    details: Um coletor de lixo mark-and-sweep preciso, strings UTF-16, exceções de verdade e um RangeError capturável em caso de estouro de pilha, ligados a cada executável.
    link: /pt/guide/how-it-works
  - title: APIs do host
    details: Um loop de eventos com timers, um process global, node:fs síncrono, TextEncoder e TextDecoder.
    link: /pt/reference/host-apis
  - title: FFI e nona:win32
    details: Chame qualquer função exportada de uma DLL no Windows com declarações em tempo de compilação; bindings prontos para user32, kernel32 e advapi32.
    link: /pt/reference/ffi
  - title: Executáveis gráficos do Windows
    details: Programas sem janela de console, com ícone, manifesto de aplicativo e informações de versão.
    link: /pt/reference/windows-executables
---

## Exemplo rápido

<<< ../../samples/hello.js

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

O executável contém o código de máquina do programa e o runtime do Nona. Ele não precisa do Node.js: um executável do Windows importa apenas `KERNEL32.dll`, e um executável do Linux faz chamadas de sistema diretamente, sem libc.

## Status

A versão atual é a **v0.7.0**. A suíte Test262 fixada (recursos do ES2020) passa em 17298/17337 testes de language, 15491/15559 de built-ins, 268/268 de Atomics e 996/1016 de Annex B no Windows x64; cada falha restante está classificada na [página de status](/pt/guide/status). Inicialização, tamanho do executável e memória são os pontos fortes do Nona; a computação dentro de um programa é de 20 a 100 vezes mais lenta que no V8, e algumas operações (`Map`, `sort`, construção de strings, cadeias longas de Promise) ainda são superlineares; veja [Desempenho](/pt/guide/performance). O Nona é experimental: não é um substituto direto do Node.js e não passou por auditoria de segurança.
