---
layout: home

hero:
    name: Nona
    text: De JavaScript para executáveis nativos
    tagline: Um compilador ahead-of-time que transforma JavaScript ES2020 em pequenos executáveis independentes para Windows, Linux, macOS, FreeBSD e OpenBSD. Sem interpretador embutido e sem toolchain de C.
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
      details: Um hello world compilado inicia em cerca de 2 ms e atinge no máximo 11 MB de memória, em um arquivo de cerca de 2 MB. O Node.js leva 28 ms e usa 45 MB; um executável Node SEA tem 124 MB.
      link: /pt/guide/performance
    - title: Oito alvos a partir de qualquer host
      details: Windows, Linux e macOS em x64 e ARM64, FreeBSD e OpenBSD em x64. Compile de forma cruzada com --target; todo executável é independente.
      link: /reference/native-platforms
    - title: A linguagem ES2020
      details: Classes, geradores, funções async, desestruturação, encadeamento opcional, BigInt, chamadas de cauda próprias e módulos ES com ciclos e live bindings, com exceções documentadas.
      link: /pt/guide/language-support
    - title: Pacotes npm
      details: Os pacotes de node_modules são resolvidos em tempo de compilação e compilados no executável, junto com os módulos do Node.js de que costumam precisar.
      link: /reference/npm
    - title: APIs do host no estilo Node.js
      details: Timers e um loop de eventos, process, fs, path, Buffer, streams, events, URL e servidores e clientes HTTP e TCP.
      link: /pt/reference/modules
    - title: Um runtime nativo
      details: Um coletor de lixo mark-and-sweep preciso, strings UTF-16, exceções de verdade, um RangeError capturável em caso de estouro de pilha e um compilador auto-hospedado.
      link: /pt/guide/how-it-works
    - title: FFI e programas gráficos do Windows
      details: Chame qualquer função exportada de uma DLL com declarações em tempo de compilação e crie programas sem janela de console, com ícone, manifesto e informações de versão.
      link: /pt/reference/ffi
---

## Exemplo rápido

<<< ../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux e macOS]
nona build hello.js -o build/hello
./build/hello
```

```sh [Compilação cruzada]
nona build hello.js -o build/hello --target linux-arm64
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

A versão atual é a **v0.32.1**; o Nona é experimental. Ele não é um substituto direto do Node.js e não passou por auditoria de segurança.

- **Conformidade.** Na última auditoria completa (v0.8.0), a suíte Test262 fixada passou em 22436/22492 testes de language, 15868/15933 de built-ins, 268/268 de Atomics e 996/1016 de Annex B no Windows x64. Cada falha restante está classificada na [página de status](/pt/guide/status).
- **Velocidade.** Inicialização, tamanho do executável e memória são os pontos fortes do Nona. A computação dentro de um programa não tem JIT: vai de equivalente ao V8 em laços simples a várias ou dezenas de vezes mais lenta em chamadas, alocação e programas reais de longa duração. [Desempenho](/pt/guide/performance) traz as medições e os pontos lentos conhecidos.
- **Limites.** `eval` e `Function` exigem código-fonte conhecido em tempo de compilação, e só existem as APIs do Node.js que o Nona implementa. Veja [Compatibilidade e limitações](/pt/guide/compatibility).
