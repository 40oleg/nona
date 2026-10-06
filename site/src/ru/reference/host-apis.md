# API хоста

::: info Перевод
Это перевод английской страницы [Host APIs](/reference/host-apis), созданной из [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md). Английская версия — основная и может быть новее.
:::

Программы Nona работают без Node.js. Перечисленные ниже API хоста реализованы нативным runtime и небольшими JavaScript-прелюдиями, которые компилируются в каждый исполняемый файл.

## Таймеры и цикл событий

Глобальные функции: `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask(callback)` и `performance.now()`.

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


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.

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

Event globals (`Event`, `CustomEvent`, `EventTarget`, `AbortController`,
`AbortSignal`) and `NodeEventTarget` are supported, including cancellation,
protected abort subscriptions and target introspection. `EventEmitterAsyncResource`
and `node:async_hooks` / `nona:async_hooks` provide explicit resources, hooks and
local context storage. Promise, await, timer and microtask callbacks preserve
captured context. Saved bind, snapshot and resource stores survive later scope changes; registration reuses immutable contexts without copying a Map per reaction. Native resource hooks and automatic GC destruction are outside
this API; see the English reference for the precise boundaries.


AbortSignal.timeout uses an unreferenced cancellation timer. The signal and its listeners do not keep a process alive; it can fire while ordinary timers keep the event loop active.
