# Host APIs

Nona programs run without Node.js. The host APIs below are implemented by the
native runtime and small JavaScript preludes compiled into every executable.

See [native platforms](native-platforms.md) for the OS/CPU capability matrix. Optional `process` and filesystem adapters currently require Windows or Linux; timers, clocks and the shared runtime are available on every enabled target.

Script functions can shadow built-in and host global names such as `escape`, `unescape`, `process`, timers and `TextEncoder`/`TextDecoder`. Runtime initialization completes first; declarations install writable, enumerable, nonconfigurable global properties.

## Timers and the event loop

Globals: `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`,
`clearInterval`, `queueMicrotask(callback)` and `performance.now()`.

- After the top-level program the entry runs an event loop: it drains the
  Promise job queue, then repeatedly waits for the nearest timer deadline, runs
  that callback and drains the job queue again. The process exits when no
  timers remain.
- Timers are ordered by deadline, then by registration order. The delay follows
  Node.js: it is converted with `ToNumber`, and values that are `NaN`, below 1 or
  above 2^31-1 become 1.
- Timer ids are Numbers (Node.js returns `Timeout` objects). `clearTimeout` and
  `clearInterval` accept any id; unknown ids are ignored.
- Waiting uses `Sleep` on Windows and `nanosleep` on Linux, so an idle program
  does not use the CPU. On Windows the resolution is the system timer tick
  (typically 15.6 ms).
- `performance.now()` uses the monotonic clock (`QueryPerformanceCounter`,
  `clock_gettime(CLOCK_MONOTONIC)`) and counts milliseconds from program start.
- An uncaught exception in a timer callback terminates the process with exit
  code 1, like an uncaught exception in the top-level program.
- Realms created by the Test262 host do not install their own timers.

## Long-running programs

- The collector counts committed coroutine stacks (1 MiB per running async
  function or generator, `rt.generatorStackBytes`) towards its threshold, so
  abandoned coroutines, whose stacks only the sweep releases, trigger
  collections like ordinary garbage.
- `tests/stability.test.ts` checks that ten times more timer firings (with
  promise jobs and garbage in every tick) do not raise peak memory, that
  thousands of abandoned coroutines are released, and that a program waiting
  for a two-second timer uses almost no CPU.
- Known limits: property, element and Map storage is linear (#36), so programs
  with hundreds of live timers or large objects slow down; on Linux every heap
  block is a separate memory mapping (#37).

## Events

`node:events`, `events` and `nona:events` resolve to the same built-in module.
The default export and named `EventEmitter` export are the same constructor.

- Listener registration: `on`/`addListener`, `once`, `prependListener` and
  `prependOnceListener`. Dispatch is synchronous, preserves registration order,
  binds `this` to the emitter and snapshots listeners before calling them.
- Listener removal: `off`/`removeListener` removes the most recently registered
  matching listener; `removeAllListeners` supports one event or every event.
  `newListener` and `removeListener` notifications expose original once listeners.
- Introspection: `listeners`, `rawListeners`, `listenerCount` (including its
  optional listener filter), `eventNames`, `getMaxListeners`, `setMaxListeners`.
  Event names support strings, symbols and other property keys.
- Error dispatch: unhandled `error` events throw; `errorMonitor` observers run
  first. `captureRejections`, constructor options and `captureRejectionSymbol`
  support rejected listener promises and custom rejection handlers.
- Module helpers: `listenerCount`, `getEventListeners`, `getMaxListeners`,
  `setMaxListeners`, Promise-based `once`, and async-iterator `on`. The iterator
  supports buffered events, pending requests, error cleanup, `close` events,
  cancellation, and high/low watermarks for emitters with `pause`/`resume`.
- `EventEmitter.defaultMaxListeners` and `EventEmitter.captureRejections` are
  writable; named exports track their current values.

`once` and `on` accept externally supplied signals with `aborted`, `reason`,
`addEventListener` and `removeEventListener`. `addAbortListener` returns a
subscription disposable under `Symbol.dispose`. The `Symbol.dispose` and
`Symbol.asyncDispose` globals use the distinct symbol identities from Node.js 26.

Nona supplies `Event`, `CustomEvent`, `EventTarget`, `AbortController`,
`AbortSignal` and `DOMException` globals. Event targets support listener objects,
capture matching, once listeners, signal removal, cancellation and dispatch
mutation. `AbortSignal.abort`, `timeout`, `any` and `throwIfAborted` are supported.
`addAbortListener` subscriptions on Nona signals survive `stopImmediatePropagation`.
The cancellation subscriptions used by `once` and `on` have the same protection.
`AbortSignal.any` follows actual source cancellation; synthetic `abort` events do
not cancel composed signals. Replacing `onabort` retains its original listener slot.
`NodeEventTarget` additionally supplies emitter-style registration, single-argument
`emit`, event names, listener counts, removal and limits. Target listeners are
unique by callback and capture flag. Introspection and max-listener module helpers
accept both emitters and targets. Uncaught target listener failures are queued as
uncaught asynchronous errors.

`EventEmitterAsyncResource` runs listeners in its construction context and exposes
`asyncId`, `triggerAsyncId`, `asyncResource` and `emitDestroy`. The independent
`node:async_hooks` / `nona:async_hooks` module provides `AsyncResource`,
`AsyncLocalStorage`, `executionAsyncId`, `triggerAsyncId`,
`executionAsyncResource` and `createHook`. Manual resources support scope entry,
binding, explicit destruction and init/before/after/destroy notifications. Local
storage supports run, enterWith, exit, disable, bind and snapshot; contexts are
captured when Promise reactions, await continuations, timers and microtasks are
registered.

Boundaries: hooks describe explicitly created resources; native Promise and timer
resource creation, Promise resolution hooks, GC-triggered destruction and Node's
async resource type catalog are not emitted. Timer callbacks preserve captured
context IDs rather than creating Node timer IDs. `AbortSignal.timeout` uses Nona's
referenced timer and may keep the event loop alive until expiry. Event dispatch
has no DOM hierarchy. Diagnostic wording, private storage and async ID numbers
are implementation details. Listener-limit warnings use `process.emitWarning`
where the process adapter supports it. See the
[Node events reference](https://nodejs.org/api/events.html).

Native CI executes shared cancellation and async-context probes with allocation
stress on all eight targets, including the BSD guests. The Node host jobs also
run the EventEmitter and EventTarget oracle suites; see
[native verification](native-platforms.md#verification) for the coverage.
