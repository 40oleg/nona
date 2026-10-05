# APIs do host

::: info Tradução
Esta página é uma tradução da página em inglês [Host APIs](/reference/host-apis), gerada a partir de [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md). A versão em inglês é a de referência e pode ser mais recente.
:::

Os programas Nona rodam sem Node.js. As APIs do host abaixo são implementadas pelo runtime nativo e por pequenos prelúdios JavaScript compilados em cada executável.

## Timers e o loop de eventos

Globais: `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask(callback)` e `performance.now()`.

- Depois do programa de nível superior, o ponto de entrada executa um loop de eventos: ele esvazia a fila de jobs de Promise e depois, repetidamente, espera o prazo do timer mais próximo, executa o callback e esvazia a fila de jobs de novo. O processo termina quando não restam timers.
- Os timers são ordenados por prazo e depois por ordem de registro. O atraso segue o Node.js: é convertido com `ToNumber`, e valores `NaN`, menores que 1 ou maiores que 2^31-1 viram 1.
- Os ids de timers são números (o Node.js retorna objetos `Timeout`). `clearTimeout` e `clearInterval` aceitam qualquer id; ids desconhecidos são ignorados.
- A espera usa `Sleep` no Windows e `nanosleep` no Linux, então um programa ocioso não usa a CPU. No Windows, a resolução é o tick do timer do sistema (normalmente 15,6 ms).
- `performance.now()` usa o relógio monotônico (`QueryPerformanceCounter`, `clock_gettime(CLOCK_MONOTONIC)`) e conta milissegundos desde o início do programa.
- Uma exceção não capturada no callback de um timer encerra o processo com código de saída 1, como uma exceção não capturada no programa de nível superior.
- Realms criados pelo host do Test262 não instalam timers próprios.

## Programas de longa duração

- O coletor conta as pilhas de corrotinas alocadas (1 MiB por função async ou gerador em execução, `rt.generatorStackBytes`) para o seu limite, de modo que corrotinas abandonadas, cujas pilhas só a varredura libera, disparam coletas como lixo comum.
- `tests/stability.test.ts` verifica que dez vezes mais disparos de timer (com jobs de Promise e lixo a cada tick) não aumentam o pico de memória, que milhares de corrotinas abandonadas são liberadas e que um programa esperando um timer de dois segundos quase não usa CPU.
- Limites conhecidos: o armazenamento de propriedades, elementos e Map é linear (#36), então programas com centenas de timers vivos ou objetos grandes ficam mais lentos; no Linux, cada bloco do heap é um mapeamento de memória separado (#37).


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.

## Events

`node:events`, `events` and `nona:events` share one built-in module. The default
export is `EventEmitter`; listener ordering, once/prepend listeners, removal,
introspection, meta events, error monitoring and rejection capture are supported.
Promise `once` and async-iterator `on` include cleanup, close events, externally
supplied abort signals and emitter watermarks. Listener/max-listener helpers and
disposable `addAbortListener` subscriptions are also available.

See the [English events reference](/reference/host-apis#events) for the
complete supported API and limitations.

Event globals (`Event`, `CustomEvent`, `EventTarget`, `AbortController`,
`AbortSignal`) and `NodeEventTarget` are supported, including cancellation,
protected abort subscriptions and target introspection. `EventEmitterAsyncResource`
and `node:async_hooks` / `nona:async_hooks` provide explicit resources, hooks and
local context storage. Promise, await, timer and microtask callbacks preserve
captured context. Native resource hooks and automatic GC destruction are outside
this API; see the English reference for the precise boundaries.
