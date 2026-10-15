# APIs do host

::: info Tradução
Esta página é uma tradução da página em inglês [Host APIs](/reference/host-apis), gerada a partir de [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md). A versão em inglês é a de referência e pode ser mais recente.
:::

Os programas Nona rodam sem Node.js. As APIs do host abaixo são implementadas pelo runtime nativo e por pequenos prelúdios JavaScript compilados em cada executável.

## Paths (`node:path`)

`node:path` / `path` implements Node.js 26 path utilities on all eight native targets.
Use `posix`, `win32`, or explicit flavor modules (`node:path/posix`,
`node:path/win32`, `path/posix`, `path/win32`). Functions: `normalize`, `join`,
`resolve`, `relative`, `parse`, `format`, `basename`, `dirname`, `extname`,
`isAbsolute`, `toNamespacedPath`, `matchesGlob`; properties: `sep`, `delimiter`.
The target selects the default flavor; resolution reads the executable's runtime
current directory. Working-directory information is read on demand; importing
Path does not initialize the full process object. [Full reference](https://github.com/40oleg/nona/blob/main/docs/path.md).

## Timers e o loop de eventos

Globais: `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`, `clearInterval`, `setImmediate(callback, ...args)`, `clearImmediate`, `queueMicrotask(callback)` e `performance.now()`.

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

## Events

`node:events`, `events` and `nona:events` share one built-in module. The default
export is `EventEmitter`; listener ordering, once/prepend listeners, removal,
introspection, meta events, error monitoring and rejection capture are supported.
Promise `once` and async-iterator `on` include cleanup, close events, externally
supplied abort signals and emitter watermarks. Listener/max-listener helpers and
disposable `addAbortListener` subscriptions under `Symbol.dispose` are also available.
`Symbol.dispose` and `Symbol.asyncDispose` have the distinct symbol identities used by Node.js 26.

See the [English events reference](/reference/host-apis#events) for the
complete supported API and limitations.

## URL {#url}

Os globais `URL` e `URLSearchParams` (também exportados por `node:url`) seguem o [URL Standard](https://url.spec.whatwg.org/): esquemas especiais (`http`, `https`, `ws`, `wss`, `ftp`, `file`) com portas padrão, barras invertidas e segmentos de ponto, referências relativas a uma base, outros esquemas com autoridade ou caminho opaco (`mailto:`, `data:`, `blob:`), os conjuntos padrão de codificação por porcentagem, números IPv4 em qualquer notação e endereços IPv6. Todos os componentes podem ser lidos e alterados; `searchParams` permanece sincronizado com `search`. `URL.canParse` e `URL.parse` estão disponíveis. Hosts são convertidos para minúsculas, mas não com IDNA: uma URL com host não ASCII lança `ERR_INVALID_URL`. O parser só é ligado a um programa quando suas fontes mencionam `URL` ou `URLSearchParams`. Seus métodos e acessores são instalados em `URL.prototype` e `URLSearchParams.prototype` quando o primeiro objeto URL ou de parâmetros de busca é criado (ou `URL.canParse` é chamado), o que mantém pequeno o heap de programas que nunca analisam uma URL.

## Módulos de apoio do Node.js {#nodejs-support-modules}

Estes módulos existem principalmente para [pacotes npm](/reference/npm), que os carregam na inicialização. Cada um está disponível como `node:<name>` e `<name>`.

- `node:os`: `EOL`, `devNull`, `platform`, `arch`, `machine`, `type`, `endianness`, `homedir` (`HOME`, ou `USERPROFILE` no Windows), `tmpdir` (`TMPDIR`/`TMP`/`TEMP`), `hostname` (`HOSTNAME`/`COMPUTERNAME` ou `localhost`), `userInfo`, `uptime`, `freemem`, `totalmem` e `constants.signals`/`priority`. `release` e `version` são strings vazias, `cpus()` e `networkInterfaces()` são vazios, `loadavg()` retorna zeros e `availableParallelism()` retorna 1.
- `node:tty`: `isatty(fd)` informa se a entrada padrão, a saída padrão ou a saída de erro é um terminal; `ReadStream` e `WriteStream` são classes mínimas para detecção de recursos.
- `node:util`: `format` e `formatWithOptions` (`%s %d %i %f %j %o %O %c %%`), `inspect` (com `inspect.custom`, `depth`, `breakLength`, `maxArrayLength`, `customInspect`), `inherits`, `promisify` (com `promisify.custom`), `callbackify`, `deprecate` (avisa uma vez por código), `debuglog` (`NODE_DEBUG`), `isDeepStrictEqual`, `types`, `styleText`, `stripVTControlCharacters`, `TextEncoder`/`TextDecoder` e os predicados legados `is*`. `inspect` se aproxima do layout do Node.js: objetos, arrays, Maps, Sets, typed arrays, funções, classes, erros, datas, valores encapsulados, getters e referências circulares são exibidos, mas cores, `showHidden`, `sorted` e o agrupamento de arrays longos em colunas do Node.js não são reproduzidos exatamente. `node:util/types` é `util.types`.
- `node:url`: `URL`, `URLSearchParams`, `fileURLToPath`, `pathToFileURL` (letras de unidade e hosts UNC no Windows), `urlToHttpOptions`, `domainToASCII`/`domainToUnicode` (apenas ASCII) e os legados `parse`, `format` e `resolve`.
- `node:assert` e `node:assert/strict`: `ok`, `equal`, `notEqual`, `strictEqual`, `notStrictEqual`, `deepEqual`, `deepStrictEqual` e suas negações, `throws`, `doesNotThrow`, `rejects`, `doesNotReject`, `match`, `doesNotMatch`, `ifError`, `fail` e `AssertionError` (`code` `ERR_ASSERTION`). As mensagens de falha são mais curtas que os diffs do Node.js.
- `node:crypto`: `randomBytes`, `randomFill`/`randomFillSync`, `randomUUID` (versão 4), `randomInt`, `getRandomValues` e `webcrypto.getRandomValues` leem a fonte aleatória do sistema operacional (`BCryptGenRandom` no Windows, `/dev/urandom` nos demais). Também `createHash` (`md5`, `sha1`, `sha256`, `sha384`, `sha512`, com `update`, `digest` em qualquer codificação de Buffer e `copy`), `createHmac`, `hash`, `getHashes` e `timingSafeEqual`. Cifras, chaves, assinaturas, derivação de chaves e `crypto.subtle` não são fornecidos. O global `crypto` é `webcrypto` (`getRandomValues` e `randomUUID`); um programa que nomeia `crypto` vincula `node:crypto`, avaliado no primeiro acesso.
- `node:querystring`: `parse`/`decode`, `stringify`/`encode`, `escape`, `unescape`.
- `node:timers`: as funções de timer globais. `node:timers/promises`: `setTimeout`, `setImmediate` (ambos com um `AbortSignal`), `setInterval` como iterador assíncrono e `scheduler.wait`/`yield`.
- `node:perf_hooks`: `performance`; `PerformanceObserver` e `monitorEventLoopDelay` não observam nada.
- `node:module`: `builtinModules` e `isBuiltin`. `createRequire` devolve um `require` que resolve apenas os módulos que o programa contém ao ser compilado; qualquer outro identificador lança `MODULE_NOT_FOUND`.
- `node:worker_threads`: `isMainThread` é `true`, `parentPort` e `workerData` são `null`; `Worker` lança `ERR_NONA_UNSUPPORTED`.
- `node:child_process`: todas as funções e `ChildProcess` lançam `ERR_NONA_UNSUPPORTED`. O módulo existe para que pacotes que apenas o mencionam sejam carregados.
