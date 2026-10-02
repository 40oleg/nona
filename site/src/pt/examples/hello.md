# Olá, timers

O menor programa que usa o loop de eventos.

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

## O que acontece

1. O código de nível superior roda: imprime a saudação, enfileira uma microtask e inicia um timer de intervalo.
2. Quando o código de nível superior termina, o loop de eventos esvazia primeiro a fila de jobs de Promise, então a microtask roda antes de qualquer timer.
3. O loop espera até o prazo do próximo timer sem usar a CPU, executa o callback e esvazia a fila de jobs de novo.
4. Depois do terceiro tick, o callback cancela o intervalo. Sem timers nem jobs restantes, o programa sai com status 0.

A ordem segue as mesmas regras do Node.js: código síncrono, depois microtasks, depois timers por prazo e ordem de registro. Veja [Timers e o loop de eventos](/pt/reference/host-apis).
