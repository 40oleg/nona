# API хоста

::: info Перевод
Это перевод английской страницы [Host APIs](/reference/host-apis), созданной из [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md). Английская версия — основная и может быть новее.
:::

Программы Nona работают без Node.js. Перечисленные ниже API хоста реализованы нативным runtime и небольшими JavaScript-прелюдиями, которые компилируются в каждый исполняемый файл.

## Paths (`node:path`)

`node:path` / `path` implements Node.js 26 path utilities on all eight native targets.
Use `posix`, `win32`, or explicit flavor modules (`node:path/posix`,
`node:path/win32`, `path/posix`, `path/win32`). Functions: `normalize`, `join`,
`resolve`, `relative`, `parse`, `format`, `basename`, `dirname`, `extname`,
`isAbsolute`, `toNamespacedPath`, `matchesGlob`; properties: `sep`, `delimiter`.
The target selects the default flavor; resolution reads the executable's runtime
current directory. Working-directory information is read on demand; importing
Path does not initialize the full process object. [Full reference](https://github.com/40oleg/nona/blob/main/docs/path.md).

## Таймеры и цикл событий

Глобальные функции: `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`, `clearInterval`, `setImmediate(callback, ...args)`, `clearImmediate`, `queueMicrotask(callback)` и `performance.now()`.

- После программы верхнего уровня точка входа запускает цикл событий: он выполняет очередь заданий Promise, затем раз за разом ждёт ближайшего срока таймера, вызывает его callback и снова выполняет очередь заданий. Процесс завершается, когда таймеров не осталось.
- Таймеры упорядочены по сроку, затем по порядку регистрации. Задержка обрабатывается как в Node.js: она преобразуется через `ToNumber`, а значения `NaN`, меньше 1 или больше 2^31-1 становятся равны 1.
- Идентификаторы таймеров — числа (Node.js возвращает объекты `Timeout`). `clearTimeout` и `clearInterval` принимают любой идентификатор; неизвестные игнорируются.
- Ожидание использует `Sleep` на Windows и `nanosleep` на Linux, поэтому простаивающая программа не нагружает CPU. На Windows разрешение равно тику системного таймера (обычно 15,6 мс).
- `performance.now()` использует монотонные часы (`QueryPerformanceCounter`, `clock_gettime(CLOCK_MONOTONIC)`) и отсчитывает миллисекунды от запуска программы.
- Неперехваченное исключение в callback таймера завершает процесс с кодом 1, как и неперехваченное исключение в программе верхнего уровня.
- Realms, созданные хостом Test262, не устанавливают собственных таймеров.

## Долго работающие программы

- Сборщик учитывает выделенные стеки сопрограмм (1 МиБ на каждую работающую async-функцию или генератор, `rt.generatorStackBytes`) в своём пороге, поэтому брошенные сопрограммы, стеки которых освобождает только sweep, запускают сборку так же, как обычный мусор.
- `tests/stability.test.ts` проверяет, что в десять раз большее число срабатываний таймеров (с заданиями Promise и мусором на каждом тике) не увеличивает пиковое потребление памяти, что тысячи брошенных сопрограмм освобождаются и что программа, ждущая двухсекундного таймера, почти не тратит CPU.
- Известные ограничения: хранилище свойств, элементов и Map линейное (#36), поэтому программы с сотнями живых таймеров или большими объектами замедляются; на Linux каждый блок кучи — отдельное отображение памяти (#37).

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

Глобальные `URL` и `URLSearchParams` (их также экспортирует `node:url`) следуют [стандарту URL](https://url.spec.whatwg.org/): специальные схемы (`http`, `https`, `ws`, `wss`, `ftp`, `file`) с портами по умолчанию, обратные слеши и сегменты с точками, относительные ссылки относительно базового URL, другие схемы с authority или непрозрачным путём (`mailto:`, `data:`, `blob:`), стандартные наборы процентного кодирования, числа IPv4 в любой записи и адреса IPv6. Каждый компонент можно читать и изменять; `searchParams` синхронизирован с `search`. Есть `URL.canParse` и `URL.parse`. Хосты приводятся к нижнему регистру, но не преобразуются через IDNA: URL с не-ASCII хостом выбрасывает `ERR_INVALID_URL`. Парсер компонуется в программу, только если в её исходниках упоминается `URL` или `URLSearchParams`. Методы и аксессоры появляются в `URL.prototype` и `URLSearchParams.prototype`, когда создаётся первый объект URL или параметров поиска (или вызывается `URL.canParse`): так куча программ, которые не разбирают URL, остаётся маленькой.

## Вспомогательные модули Node.js {#nodejs-support-modules}

Эти модули нужны в основном [пакетам npm](/reference/npm), которые загружают их при запуске. Каждый доступен как `node:<name>` и `<name>`.

- `node:os`: `EOL`, `devNull`, `platform`, `arch`, `machine`, `type`, `endianness`, `homedir` (`HOME` или `USERPROFILE` на Windows), `tmpdir` (`TMPDIR`/`TMP`/`TEMP`), `hostname` (`HOSTNAME`/`COMPUTERNAME` или `localhost`), `userInfo`, `uptime`, `freemem`, `totalmem` и `constants.signals`/`priority`. `release` и `version` — пустые строки, `cpus()` и `networkInterfaces()` пусты, `loadavg()` возвращает нули, а `availableParallelism()` — 1.
- `node:tty`: `isatty(fd)` сообщает, является ли терминалом стандартный ввод, вывод или поток ошибок; `ReadStream` и `WriteStream` — минимальные классы для проверки возможностей.
- `node:util`: `format` и `formatWithOptions` (`%s %d %i %f %j %o %O %c %%`), `inspect` (с `inspect.custom`, `depth`, `breakLength`, `maxArrayLength`, `customInspect`), `inherits`, `promisify` (с `promisify.custom`), `callbackify`, `deprecate` (предупреждает один раз для каждого кода), `debuglog` (`NODE_DEBUG`), `isDeepStrictEqual`, `types`, `styleText`, `stripVTControlCharacters`, `TextEncoder`/`TextDecoder` и устаревшие предикаты `is*`. `inspect` приближённо воспроизводит раскладку Node.js: показываются объекты, массивы, Map, Set, типизированные массивы, функции, классы, ошибки, даты, объекты-обёртки, геттеры и циклические ссылки, но цвета, `showHidden`, `sorted` и группировка длинных массивов в столбцы, как в Node.js, воспроизводятся неточно. `node:util/types` — это `util.types`.
- `node:url`: `URL`, `URLSearchParams`, `fileURLToPath`, `pathToFileURL` (буквы дисков и UNC-хосты на Windows), `urlToHttpOptions`, `domainToASCII`/`domainToUnicode` (только ASCII) и устаревшие `parse`, `format` и `resolve`.
- `node:assert` и `node:assert/strict`: `ok`, `equal`, `notEqual`, `strictEqual`, `notStrictEqual`, `deepEqual`, `deepStrictEqual` и их отрицания, `throws`, `doesNotThrow`, `rejects`, `doesNotReject`, `match`, `doesNotMatch`, `ifError`, `fail` и `AssertionError` (`code` `ERR_ASSERTION`). Сообщения о сбоях короче, чем diff в Node.js.
- `node:crypto`: `randomBytes`, `randomFill`/`randomFillSync`, `randomUUID` (версия 4), `randomInt`, `getRandomValues` и `webcrypto.getRandomValues` читают источник случайных данных операционной системы (`BCryptGenRandom` на Windows, `/dev/urandom` на остальных системах). Также есть `createHash` (`md5`, `sha1`, `sha256`, `sha384`, `sha512`, с `update`, `digest` в любой кодировке Buffer и `copy`), `createHmac`, `hash`, `getHashes` и `timingSafeEqual`. Шифров, ключей, подписей, формирования ключей и `crypto.subtle` нет, глобального `crypto` тоже нет.
- `node:querystring`: `parse`/`decode`, `stringify`/`encode`, `escape`, `unescape`.
- `node:timers`: глобальные функции таймеров. `node:timers/promises`: `setTimeout`, `setImmediate` (оба с `AbortSignal`), `setInterval` как асинхронный итератор и `scheduler.wait`/`yield`.
- `node:perf_hooks`: `performance`; `PerformanceObserver` и `monitorEventLoopDelay` ничего не наблюдают.
- `node:module`: `builtinModules` и `isBuiltin`. `createRequire` выбрасывает `ERR_NONA_UNSUPPORTED`: модули разрешаются при сборке программы.
- `node:worker_threads`: `isMainThread` равно `true`, `parentPort` и `workerData` равны `null`; `Worker` выбрасывает `ERR_NONA_UNSUPPORTED`.
- `node:child_process`: `spawn`, `exec`, `execFile`, их синхронные варианты и `ChildProcess` запускают другие программы в Windows и Linux (x64); `fork`, IPC и остальные платформы выбрасывают `ERR_NONA_UNSUPPORTED`. Подробности: [Child processes](/reference/host-apis#child-processes).
