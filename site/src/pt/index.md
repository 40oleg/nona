---
layout: home

hero:
    name: Nona
    text: De JavaScript para executГЎveis nativos
    tagline: Um compilador ahead-of-time que transforma JavaScript ES2020 em pequenos executГЎveis independentes para Windows, Linux, macOS, FreeBSD e OpenBSD. Sem interpretador embutido e sem toolchain de C.
    actions:
        - theme: brand
          text: ComeГ§ar
          link: /pt/guide/getting-started
        - theme: alt
          text: Experimente no navegador
          link: /playground
        - theme: alt
          text: O que Г© o Nona
          link: /pt/guide/what-is-nona
        - theme: alt
          text: GitHub
          link: https://github.com/40oleg/nona

features:
    - title: Inicia em 2 ms
      details: Um hello world compilado inicia em cerca de 2 ms e atinge no mГЎximo 11 MB de memГіria, em um arquivo de cerca de 2 MB. O Node.js leva 28 ms e usa 45 MB; um executГЎvel Node SEA tem 124 MB.
      link: /pt/guide/performance
    - title: Oito alvos a partir de qualquer host
      details: Windows, Linux e macOS em x64 e ARM64, FreeBSD e OpenBSD em x64. Compile de forma cruzada com --target; todo executГЎvel Г© independente.
      link: /reference/native-platforms
    - title: A linguagem ES2020
      details: Classes, geradores, funГ§Гµes async, desestruturaГ§ГЈo, encadeamento opcional, BigInt, chamadas de cauda prГіprias e mГіdulos ES com ciclos e live bindings, com exceГ§Гµes documentadas.
      link: /pt/guide/language-support
    - title: Pacotes npm
      details: Os pacotes de node_modules sГЈo resolvidos em tempo de compilaГ§ГЈo e compilados no executГЎvel, junto com os mГіdulos do Node.js de que costumam precisar.
      link: /reference/npm
    - title: APIs do host no estilo Node.js
      details: Timers e um loop de eventos, process, fs, path, Buffer, streams, events, URL e servidores e clientes HTTP e TCP.
      link: /pt/reference/modules
    - title: Um runtime nativo
      details: Um coletor de lixo mark-and-sweep preciso, strings UTF-16, exceГ§Гµes de verdade, um RangeError capturГЎvel em caso de estouro de pilha e um compilador auto-hospedado.
      link: /pt/guide/how-it-works
    - title: FFI e programas grГЎficos do Windows
      details: Chame qualquer funГ§ГЈo exportada de uma DLL com declaraГ§Гµes em tempo de compilaГ§ГЈo e crie programas sem janela de console, com Г­cone, manifesto e informaГ§Гµes de versГЈo.
      link: /pt/reference/ffi
---

## Exemplo rГЎpido

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

```sh [CompilaГ§ГЈo cruzada]
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

O executГЎvel contГ©m o cГіdigo de mГЎquina do programa e o runtime do Nona. Ele nГЈo precisa do Node.js: um executГЎvel do Windows importa apenas `KERNEL32.dll`, e um executГЎvel do Linux faz chamadas de sistema diretamente, sem libc.

## Status

A versГЈo atual Г© a **v0.25.0**; o Nona Г© experimental. Ele nГЈo Г© um substituto direto do Node.js e nГЈo passou por auditoria de seguranГ§a.

- **Conformidade.** Na Гєltima auditoria completa (v0.8.0), a suГ­te Test262 fixada passou em 22436/22492 testes de language, 15868/15933 de built-ins, 268/268 de Atomics e 996/1016 de Annex B no Windows x64. Cada falha restante estГЎ classificada na [pГЎgina de status](/pt/guide/status).
- **Velocidade.** InicializaГ§ГЈo, tamanho do executГЎvel e memГіria sГЈo os pontos fortes do Nona. A computaГ§ГЈo dentro de um programa nГЈo tem JIT: vai de equivalente ao V8 em laГ§os simples a vГЎrias ou dezenas de vezes mais lenta em chamadas, alocaГ§ГЈo e programas reais de longa duraГ§ГЈo. [Desempenho](/pt/guide/performance) traz as mediГ§Гµes e os pontos lentos conhecidos.
- **Limites.** `eval` e `Function` exigem cГіdigo-fonte conhecido em tempo de compilaГ§ГЈo, e sГі existem as APIs do Node.js que o Nona implementa. Veja [Compatibilidade e limitaГ§Гµes](/pt/guide/compatibility).
