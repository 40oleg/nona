# Host APIs

The process adapter provides native signal delivery and independently registered
diagnostic reports. Reports contain Nona allocator, OS resource and network
snapshots; fatal output uses static native storage. See [process](process.md).

Process thread CPU accounting uses real Windows thread times, Linux/BSD
RUSAGE_THREAD or Darwin Mach thread_info. POSIX process.execve replaces the
current image through the native kernel syscall using original owned argv/envp
vectors. Windows exposes the function and throws
`ERR_FEATURE_UNAVAILABLE_ON_PLATFORM` before argument validation, matching
Node.js 26. Native probes verify self-reexecution and PID identity.

POSIX process credentials accept numeric IDs and names. Darwin resolves names
through OS libSystem account services and uses native initgroups. Linux/BSD
resolve local /etc/passwd and /etc/group using original scanners and pass actual
IDs to native credential syscalls; remote NSS/LDAP/NIS resolution is absent.

Process memory reporting queries current native resident memory on every target.
Its allocation-free private adapter walks Nona's actual allocator mappings and
buffer owners; the public Node-compatible fields describe Nona allocation
semantics as detailed in [process](process.md), without inventing V8 counters.

Process environment mutation publishes an original owned native UTF-8 envp
vector for native execution adapters. Windows also updates kernel32 environment
state; Darwin updates the authorized OS libSystem environment. Linux/BSD do not
pretend to offer a kernel setenv operation or modify unrelated library state.

Nona programs run without Node.js. The host APIs below are implemented by the
native runtime and small JavaScript preludes compiled into every executable.

See [native platforms](native-platforms.md) for the OS/CPU capability matrix. The [process adapter](process.md), timers, clocks and the shared runtime are available on every enabled target. The optional filesystem adapter requires Windows or Linux.

Process standard streams use native descriptors without external libraries:
UTF-8/byte writes are synchronous, and flowing stdin is polled by the event loop.
The process adapter also provides lifecycle/warning events, OS CPU/resource
queries and native process control; see its documented compatibility boundaries.
Native process file reads support dotenv loading on every target independently
of the optional filesystem module. POSIX numeric credential operations and
native memory availability/limits use the selected OS's actual ABI.

Script functions can shadow built-in and host global names such as `escape`, `unescape`, `process`, timers and `TextEncoder`/`TextDecoder`. Runtime initialization completes first; declarations install writable, enumerable, nonconfigurable global properties.

## Internationalization (`Intl`)

Nona has its own `Intl` for the `en`/`en-US` locale (`NumberFormat`, `DateTimeFormat`, `Collator`, `PluralRules`, `getCanonicalLocales`, `supportedLocalesOf`) and `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString` and `localeCompare` delegate to it. Other locales fall back to `en-US`; the time zone is UTC. It is linked only when a program names one of these. See [intl](intl.md).

## Paths (`node:path`)

`node:path` and `path` provide Node.js 26 path manipulation without filesystem
access. Import the default object or named functions from ES modules. `posix`
and `win32` expose both flavors on every native target; `node:path/posix`,
`node:path/win32`, `path/posix` and `path/win32` expose a particular flavor.

The API includes `normalize`, `join`, `resolve`, `relative`, `parse`, `format`,
`basename`, `dirname`, `extname`, `isAbsolute`, `toNamespacedPath`, `matchesGlob`,
`sep` and `delimiter`. The target operating system selects the default flavor.
`resolve` and `relative` read the executable's current directory at runtime.
Path reads only the requested working-directory information and does not
initialize the full process object when imported.
See [paths](path.md) for examples and compatibility boundaries.

## Timers and the event loop

Globals: `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`,
`clearInterval`, `setImmediate(callback, ...args)`, `clearImmediate`,
`queueMicrotask(callback)` and `performance.now()`.

- Immediates run in registration order after the current timer phase, draining
  microtasks between callbacks. An immediate registered by an immediate waits
  for the next iteration. Handles provide `ref()`, `unref()`, `hasRef()` and
  `[Symbol.dispose]()`, including the `process.ref()`/`process.unref()` protocol.
  An unreferenced immediate does not keep the process alive. Cancelled and
  completed handles cannot be reactivated.

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
- While sockets or servers from [`node:net`/`node:http`](network.md) are open,
  the loop waits for socket readiness (`poll` on Linux, `WSAPoll` on Windows)
  with the nearest timer deadline as the limit, and runs the ready sockets'
  callbacks, draining the job queue after each. The process exits when no
  timers and no referenced sockets or servers remain.
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
  As in Node.js, `once` and `prependOnceListener` register their wrapper
  through `this.on` and `this.prependListener`, so subclass overrides see it.
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

Captured bind, snapshot and resource contexts retain their original stores after
later `enterWith` or `disable` calls, and restore the caller's context on return.
Registration reuses immutable context records rather than copying a Map for
every Promise reaction; scope changes create a new record and store map.
Promise reactions, timers and microtasks retain the record directly and restore
the calling context after success or failure, without creating extra callback wrappers.
Callbacks already in their captured context bypass redundant scope calls.
If a callback changes its store, the calling context is still restored.

Boundaries: hooks describe explicitly created resources; native Promise and timer
resource creation, Promise resolution hooks, GC-triggered destruction and Node's
async resource type catalog are not emitted. Timer callbacks preserve captured
context IDs rather than creating Node timer IDs. `AbortSignal.timeout` uses an
unreferenced timer: it can fire while ordinary timers keep the loop active, but
neither the signal nor its abort listeners keep the process alive. Event dispatch
has no DOM hierarchy. Diagnostic wording, private storage and async ID numbers
are implementation details. Listener-limit warnings use `process.emitWarning`
where the process adapter supports it. See the
[Node events reference](https://nodejs.org/api/events.html).

Native CI executes shared cancellation and async-context probes with allocation
stress on all eight targets, including the BSD guests. The Node host jobs also
run the EventEmitter and EventTarget oracle suites; see
[native verification](native-platforms.md#verification) for the coverage.

## Buffer and binary data

The global `Buffer` and the `node:buffer`, `buffer` and `nona:buffer` ES modules use the same constructor on every native target. Buffer storage is a native `Uint8Array`: indexing, iteration, ArrayBuffer views and inherited typed-array methods work without an interpreter or external libraries.

`Buffer.from` copies strings, buffers, arrays, array-like objects and JSON buffer records. An ArrayBuffer or SharedArrayBuffer argument shares its backing store. `slice` and `subarray` return Buffer views that share storage; `Buffer.from(buffer)` makes a copy.

Supported encodings are UTF-8 (`utf8`, `utf-8`), UTF-16 little endian (`utf16le`, `utf-16le`, `ucs2`, `ucs-2`), Latin-1 (`latin1`, `binary`), ASCII, hex, base64 and base64url. UTF-8 decoding preserves a BOM and replaces malformed input; UTF-8/UTF-16 writes do not store incomplete characters. Hex decoding stops at the first invalid byte pair; base64 accepts whitespace and the URL-safe alphabet.

The API includes `alloc`, `allocUnsafe`, `allocUnsafeSlow`, `byteLength`, `isBuffer`, `isEncoding`, `compare`, `concat`, `copyBytesFrom`, `poolSize`; instance conversion, JSON, inspection, equality, comparison, overlapping copy, fill, write, shared slices, swap16/32/64, includes/indexOf/lastIndexOf; signed/unsigned integer reads and writes in both byte orders (fixed widths and one through six bytes), float/double access, 64-bit BigInt access, and Uint spelling aliases. Searches accept the Node 26 exclusive `end` bound. Aligned unsafe allocations accept powers of two through 2 ** 30 and align the actual native backing address.

The module also exports `isAscii`, `isUtf8`, `atob`, `btoa`, `transcode` (UTF-8, UTF-16LE, ASCII and Latin-1), `INSPECT_MAX_BYTES`, `kMaxLength`, `kStringMaxLength` and `constants`. `SlowBuffer` is retained as a legacy compatibility export. The default export is the shared module API object.

Global and module `Blob` and `File` constructors provide immutable copied data, `size`, `type`, `slice`, Promise-returning `text`/`arrayBuffer`/`bytes`, and File `name`/`lastModified` metadata. Blob string parts normalize unpaired surrogates; `endings: 'native'` uses CRLF on Windows and LF elsewhere. Returned bytes and ArrayBuffers are independent copies.

`Blob.stream()` returns a byte `ReadableStream`; `Blob.textStream()` returns a UTF-8 text stream with BOM removal, replacement decoding, and characters retained across part boundaries. Streams support default readers, byte BYOB readers with buffer transfer and minimum reads, `read`, `closed`, reader cancellation/release, locking, stream cancellation, async iteration (`values`), `tee`, `pipeTo` and `pipeThrough`. Each byte chunk is independent of Blob storage. The WritableStream dependency accepts asynchronous underlying sink callbacks, queues writes, and provides writers, close and abort. Piping honors `preventClose`, `preventCancel`, `preventAbort` and an AbortSignal-compatible `signal` (initial or mid-transfer cancellation). The original AbortController supplies native signals; Blob piping protects their cancellation subscriptions against stopImmediatePropagation. External signals can also use the `aborted`/`reason`/`addEventListener`/`removeEventListener` protocol.

`URL.createObjectURL(blob)` registers immutable Blob data under a unique process-local `blob:nodedata:` URL. `resolveObjectURL(url)` returns a fresh Blob wrapper or undefined for an unknown/revoked URL. Query strings and fragments do not change the registry lookup. `URL.revokeObjectURL(url)` releases the registry entry; previously resolved Blobs remain valid. Registered data stays reachable until revocation or process exit.

### URL and Web Streams dependency boundaries

The global `URL` and `URLSearchParams` are described in [URL](#url); `URL.createObjectURL` and `URL.revokeObjectURL` register `blob:nodedata:` object URLs for Blobs. The global ReadableStream and reader prototypes support streams returned by Blob; arbitrary underlying-source construction, configurable queuing strategies and TransformStream construction are not yet provided. These dependency APIs are independently authored and use no external runtime library.

Teeing a cancelled or completed stream preserves its terminal state. A tee branch cancellation waits for the other branch to cancel or consume the source to EOF; branch reasons are combined when cancelling the source. Writable sink initialization rejection and controller errors reject acquired writers' `closed` promises, including writers acquired after the failure.

### Buffer module limitations

- Allocations are independent and zero-filled, including unsafe allocations. `poolSize` is present but no shared slab pool is used. Nona's backing-store and reported maximum lengths are 2 ** 31 - 1 bytes, smaller than Node's platform-specific maxima.
- CommonJS `require('buffer')` is unavailable; use ES imports. Buffer error classes and codes are covered by oracle tests, but diagnostic wording and base64 DOMException prototypes may differ from Node.
- `node:fs` continues to return Uint8Array data. Convert it with `Buffer.from(bytes)` when Buffer methods are needed.

See the [Node 26 Buffer reference](https://nodejs.org/docs/latest-v26.x/api/buffer.html) for the shared API contract and [the runnable Buffer sample](../site/samples/buffer.mjs).

## JSON to UTF-8 bytes

`nona:json` exports `stringifyToBuffer(value, replacer, space)`. It serializes `value` straight into a UTF-8 byte buffer and returns a `Buffer` that is byte-for-byte equal to `Buffer.from(JSON.stringify(value, replacer, space))`, without building the UTF-16 string first. It returns `undefined` where `JSON.stringify` returns `undefined` (a function, a symbol or `undefined`), and throws the same errors: a `TypeError` for a BigInt or a cycle (no partial output), and whatever a `toJSON` method or replacer throws. The replacer, `toJSON`, indentation and property order follow `JSON.stringify`; lone surrogates are written as `\uXXXX` escapes. Use it to write JSON to a file or a socket.

```js
import { stringifyToBuffer } from "nona:json";
import { writeFileSync } from "nona:fs";

writeFileSync(
    "out.json",
    stringifyToBuffer({ ok: true, name: "Nona" }, null, 2),
);
```

`JSON.stringify` itself does not change. The `node:http` server uses the same byte serializer for `res.end(JSON.stringify(value))` and `res.write(JSON.stringify(value))` when `JSON.stringify` is the unmodified intrinsic: the compiler passes the value to the response, which writes the bytes to the socket without the intermediate string, a second UTF-8 encoding or a `byteLength` scan. The observable result is the same as for the plain call.

## Streams

`node:stream`, `stream` and `nona:stream` expose the same original Stream,
Readable, Writable, Duplex, Transform and PassThrough constructors on every
native target. They inherit the canonical EventEmitter used by process.
`node:stream/promises` and `node:stream/consumers` also have bare and nona aliases.
No Node.js source, external interpreter or third-party polyfill is bundled.

Readable queues implement demand, push/unshift/read, object and byte modes,
encoding, flow control, readable/data/end events, pipe/unpipe and backpressure.
Writable queues implement write/end, callbacks, cork/uncork, writev, drain,
final/finish and destruction. Duplex half-open controls and Transform flushing
share these queues. Construction and destruction callbacks retain exact-once
completion; errors and premature closes propagate to observers and pipelines.

The module includes callback and Promise finished/pipeline, compose,
addAbortSignal, high-water-mark configuration, state/brand queries and the
asynchronous iterator/disposal protocol. Readable.from supports synchronous and
asynchronous iterables; iterator cancellation releases the source. Operators
map, filter, flatMap, drop, take, toArray, forEach, some, every, find and reduce
support abort and bounded concurrency where applicable. Consumers provide
buffer, arrayBuffer, text, json and blob.

Readable/Writable/Duplex fromWeb and toWeb retain one reader/writer and propagate
queue pressure, locks, cancellation and terminal errors. Blob streams use their
private original brand bridge. Web adapters returned by stream are supported;
this does not extend the separate global Web Stream constructors to arbitrary
underlying sources. The byte high-water mark defaults to 16 KiB on Windows and
64 KiB on other targets, matching Node 26; object mode defaults to 16 objects.
Native CI runs original pipeline, queue, identity, operator, Web cancellation
and construction/destruction fixtures under GC stress on all eight targets.
The asynchronous-context bridge initializes on the first async-hooks module access. Programs that do not use it allocate no resource/storage maps. Reactions registered before initialization retain root storage when the API is later activated; callback scope changes are restored on success and failure.

See the [runnable Stream sample](../site/samples/stream.mjs).
Blob piping retains its startup Promise constructor. Releasing a reader preserves a pending closed Promise and uses one shared release error; a reader that was already closed receives a new rejected closed Promise. This matches Node 26 identity and avoids redundant cleanup allocations under GC stress.

Stream constructors and process standard I/O are initialized on first use. Reading process metadata does not create stream queues or standard-stream instances; direct standard-I/O access and warning output retain the canonical Stream constructors.

Private Web-stream rejection bookkeeping marks owned Promises handled without constructing discarded species Promises. Piping without an abort signal does not allocate an unused cancellation Promise.

## zlib

`node:zlib`, `zlib` and `nona:zlib` are one module: Nona's own DEFLATE codec
(RFC 1951) with zlib (RFC 1950) and gzip (RFC 1952) framing, Adler-32 and
CRC-32. No zlib library, C code or DLL is bundled. The module exports the
synchronous, callback and stream APIs of Node.js:

- Synchronous: `deflateSync`, `inflateSync`, `gzipSync`, `gunzipSync`,
  `deflateRawSync`, `inflateRawSync` and `unzipSync` take a string, Buffer,
  TypedArray, DataView or ArrayBuffer and return a Buffer. `unzipSync` reads
  either gzip or zlib framing.
- Callback: `deflate`, `inflate`, `gzip`, `gunzip`, `deflateRaw`,
  `inflateRaw` and `unzip` take the same input and call `callback(error,
result)` asynchronously.
- Streams: `createDeflate`, `createInflate`, `createGzip`, `createGunzip`,
  `createDeflateRaw`, `createInflateRaw` and `createUnzip` return Transform
  streams from the [stream module](#streams), and the classes `Deflate`,
  `Inflate`, `Gzip`, `Gunzip`, `DeflateRaw`, `InflateRaw` and `Unzip` are
  exported. They support `pipe`, `pipeline`, `for await`, `flush(kind,
callback)`, `params(level, strategy, callback)`, `reset()`, `close()` and
  `bytesWritten`.
- `crc32(data[, value])` computes CRC-32 of a string or view, continuing from
  `value` when it is given. Adler-32 is used internally and is not exported,
  as in Node.js.

Options, for every function and stream: `chunkSize` (at least 64, default 16384), `windowBits`
(8–15; 0 on inflate reads the window size from the header; gzip rejects 8),
`level` (-1–9), `memLevel` (1–9), `strategy` (`Z_DEFAULT_STRATEGY`,
`Z_FILTERED`, `Z_HUFFMAN_ONLY`, `Z_RLE`, `Z_FIXED`), `dictionary` (for raw
and zlib framing), `flush` and `finishFlush` (`Z_NO_FLUSH` to `Z_BLOCK`),
`maxOutputLength` (inflate raises `ERR_BUFFER_TOO_LARGE` above it) and `info`
(the result is `{ buffer, engine }`). Stream options such as `highWaterMark`
are passed to the stream. Invalid option values raise `ERR_INVALID_ARG_TYPE`
or `ERR_OUT_OF_RANGE` with Node.js's messages.

`constants` has Node.js's names and values for the flush modes, return codes,
levels, strategies, modes and window and memory limits. The `Z_*` names are
also properties of the module, as in Node.js. `codes` maps each return code
to its name and back.

Corrupt or truncated input raises an `Error` with Node.js's message, `errno`
and `code` (`Z_DATA_ERROR`, `Z_BUF_ERROR` or `Z_NEED_DICT`). The same input
produces the same code and message as in Node.js in the tests, which compare
the results with the Node.js oracle; the callback and stream forms emit the
same error, the callback through `callback(error)` and streams through
`'error'`.

Limitations:

- Brotli is not provided: `brotliCompressSync`, `brotliDecompressSync`,
  `brotliCompress`, `brotliDecompress`, `createBrotliCompress` and
  `createBrotliDecompress` throw `ERR_NONA_UNSUPPORTED`. The `BROTLI_*`
  constants exist for compatibility only. Brotli is tracked in a separate
  issue.
- The compressed bytes are valid DEFLATE, zlib and gzip, and the tests check
  that Node.js decodes them, but they are not byte-identical to Node.js's zlib
  output for the same options. Decompressing a stream gives the same bytes
  from either implementation.
- The `http` client does not decompress response bodies, as in Node.js. Pipe
  a `Content-Encoding: gzip` response through `createGunzip()` (or
  `createInflate()` for `deflate`) to decode it.

A [runnable zlib sample](../site/samples/zlib.mjs) compresses and decompresses
data with the sync, callback and stream APIs.

## URL

The global `URL` and `URLSearchParams` (also exported by `node:url`) follow the
[URL Standard](https://url.spec.whatwg.org/): special schemes (`http`, `https`,
`ws`, `wss`, `ftp`, `file`) with default ports, backslashes and dot segments,
relative references against a base, other schemes with an authority or an
opaque path (`mailto:`, `data:`, `blob:`), the standard percent-encoding sets,
IPv4 numbers in any notation and IPv6 addresses. Every component can be read
and set; `searchParams` stays in sync with `search`. `URL.canParse` and
`URL.parse` are provided. Hosts are lowercased but not converted with IDNA:
a URL with a non-ASCII host throws `ERR_INVALID_URL`. The parser is linked
into a program only when its sources mention `URL` or `URLSearchParams`.
Its methods and accessors are installed on `URL.prototype` and
`URLSearchParams.prototype` when the first URL or search parameters object is
created (or `URL.canParse` is called), which keeps the heap of programs that
never parse a URL small.

## Node.js support modules

These modules exist mainly for [npm packages](npm.md), which load them at
startup. Each is available as `node:<name>` and `<name>`.

- `node:os`: `EOL`, `devNull`, `platform`, `arch`, `machine`, `type`,
  `endianness`, `homedir` (`HOME`, or `USERPROFILE` on Windows), `tmpdir`
  (`TMPDIR`/`TMP`/`TEMP`), `hostname` (`HOSTNAME`/`COMPUTERNAME` or
  `localhost`), `userInfo`, `uptime`, `freemem`, `totalmem`, and
  `constants.signals`/`priority`. `release` and `version` are empty strings,
  `cpus()` and `networkInterfaces()` are empty, `loadavg()` is zeros and
  `availableParallelism()` is 1.
- `node:tty`: `isatty(fd)` reports whether standard input, output or error is
  a terminal; `ReadStream` and `WriteStream` are minimal classes for feature
  detection.
- `node:util`: `format` and `formatWithOptions` (`%s %d %i %f %j %o %O %c
%%`), `inspect` (with `inspect.custom`, `depth`, `breakLength`,
  `maxArrayLength`, `customInspect`), `inherits`, `promisify` (with
  `promisify.custom`), `callbackify`, `deprecate` (warns once per code),
  `debuglog` (`NODE_DEBUG`), `isDeepStrictEqual`, `types`, `styleText`,
  `stripVTControlCharacters`, `TextEncoder`/`TextDecoder` and the legacy
  `is*` predicates. `inspect` approximates Node.js's layout: objects, arrays,
  Maps, Sets, typed arrays, functions, classes, errors, dates, boxed values,
  getters and circular references are shown, but colors, `showHidden`,
  `sorted` and Node.js's grouping of long arrays into columns are not
  reproduced exactly. `node:util/types` is `util.types`.
- `node:url`: `URL`, `URLSearchParams`, `fileURLToPath`, `pathToFileURL`
  (Windows drive letters and UNC hosts on Windows), `urlToHttpOptions`,
  `domainToASCII`/`domainToUnicode` (ASCII only), and the legacy `parse`,
  `format` and `resolve`.
- `node:assert` and `node:assert/strict`: `ok`, `equal`, `notEqual`,
  `strictEqual`, `notStrictEqual`, `deepEqual`, `deepStrictEqual` and their
  negations, `throws`, `doesNotThrow`, `rejects`, `doesNotReject`, `match`,
  `doesNotMatch`, `ifError`, `fail` and `AssertionError` (`code`
  `ERR_ASSERTION`). `deepEqual` follows Node.js's loose comparison, including Maps, Sets, Dates, RegExps, boxed primitives, typed arrays and Errors. `assert.strict` and `node:assert/strict` are a separate callable whose `equal`, `notEqual`, `deepEqual` and `notDeepEqual` are the strict functions. Failure messages are shorter than Node.js's diffs.
- `node:crypto`: `randomBytes`, `randomFill`/`randomFillSync`, `randomUUID`
  (version 4), `randomInt`, `getRandomValues` and `webcrypto.getRandomValues`
  read the operating system's random source (`BCryptGenRandom` on Windows,
  `/dev/urandom` elsewhere). `createHash` (`md5`, `sha1`, `sha256`, `sha384`,
  `sha512`, with `update`, `digest` in any Buffer encoding and `copy`),
  `createHmac`, `hash`, `getHashes` and `timingSafeEqual`. `hkdf` and
  `hkdfSync` derive keys with HKDF (RFC 5869) and return an `ArrayBuffer`.
  Ciphers, keys, signatures, other key derivation functions and `crypto.subtle` are not provided. The global
  `crypto` is `webcrypto` (`getRandomValues` and `randomUUID`); a program
  that names `crypto` links `node:crypto`, which is evaluated on first access.
- `node:querystring`: `parse`/`decode`, `stringify`/`encode`, `escape`,
  `unescape`.
- `node:timers`: the global timer functions. `node:timers/promises`:
  `setTimeout`, `setImmediate` (both with an `AbortSignal`), `setInterval` as
  an async iterator, and `scheduler.wait`/`yield`.
- `node:perf_hooks`: `performance`; `PerformanceObserver` and
  `monitorEventLoopDelay` observe nothing.
- `node:module`: `builtinModules` and `isBuiltin`. `createRequire(filename)`
  returns a `require` that resolves only the modules the program contains when
  it is built; any other id throws `MODULE_NOT_FOUND` (see
  [module.createRequire](npm.md#modulecreaterequire)).
- `node:worker_threads`: `isMainThread` is `true`, `parentPort` and
  `workerData` are `null`; `Worker` throws `ERR_NONA_UNSUPPORTED`.
- `node:child_process` (also `child_process` and `nona:child_process`):
  `spawn`, `exec`, `execFile`, `spawnSync`, `execSync`, `execFileSync` and
  `ChildProcess`; `fork` throws `ERR_NONA_UNSUPPORTED`. Details in
  [Child processes](#child-processes) below.
- `node:tls`, `node:http2` and `node:zlib` exist for the same reason: they
  have the Node.js constants (`zlib.constants`, `zlib.codes`,
  `http2.constants`, `tls.DEFAULT_MIN_VERSION`, …), and their functions and
  classes throw `ERR_NONA_UNSUPPORTED`. `node:https` (Linux and Windows) has
  `Agent` and `globalAgent`; its requests throw (see
  [networking](network.md)).
- `Object.prototype.toString.call(process)` is `[object process]`, as in
  Node.js; libraries use it to detect Node.js.

## Child processes

`node:child_process` (issue [#303](https://github.com/40oleg/nona/issues/303))
runs other programs on win32-x64, win32-arm64, linux-x64, linux-arm64,
darwin-x64, darwin-arm64, freebsd-x64 and openbsd-x64. Other targets
link a stub: every function throws `ERR_NONA_UNSUPPORTED`, so that
packages which only mention the module still load.

```js
import { spawn, execFileSync } from "nona:child_process";

const child = spawn("git", ["status", "--short"], { cwd: "." });
child.stdout.on("data", (chunk) => process.stdout.write(chunk));
child.on("close", (code, signal) => console.log("exit", code, signal));
console.log(execFileSync("git", ["--version"], { encoding: "utf8" }));
```

- **Functions.** `spawn`, `exec`, `execFile` (callback `(error, stdout,
stderr)`; `util.promisify` resolves to `{stdout, stderr}`),
  `spawnSync`, `execSync`, `execFileSync`, and the `ChildProcess` class
  (`pid`, `exitCode`, `signalCode`, `killed`, `spawnfile`, `spawnargs`,
  `stdin`, `stdout`, `stderr`, `stdio`, `kill(signal)`, `ref`, `unref`).
- **Options.** `cwd` (a string or `file:` URL), `env` (default
  `process.env`), `argv0`, `stdio` (`'pipe'`, `'inherit'`, `'ignore'`, or an
  array of three of them; `process.stdin`/`stdout`/`stderr` and the numbers
  0, 1, 2 mean `'inherit'`), `shell` (`true` or a path), `detached`,
  `windowsHide`, `windowsVerbatimArguments`, `timeout`, `killSignal`,
  `maxBuffer`, `encoding` and, for the synchronous variants, `input`.
- **Streams.** `child.stdout` and `child.stderr` are `Readable`, `child.stdin`
  is a `Writable` of the [stream module](#streams). The pipe ends are
  non-blocking and watched by the event loop next to sockets and timers, so
  a pending child keeps the program alive and large outputs do not deadlock.
  Synchronous variants write `input` and drain stdout and stderr together.
- **Events**, in order: `spawn` (the process started), then, as the child
  ends, `exit` (`code`, `signal`) and, after its stdio streams ended,
  `close` (`code`, `signal`). A child that cannot start emits `error`
  (`ENOENT`, `EACCES`, …; with `code`, `errno`, `syscall: 'spawn <file>'`,
  `path` and `spawnargs`) and then `close` with the negative errno as the
  exit code, as in Node.js, but no `spawn` and no `exit`. A failed `kill()`
  is an `error` event.
  The synchronous variants return or throw as in Node.js (`error`, `status`,
  `signal`, `stdout`, `stderr`; `execSync` and `execFileSync` throw on a
  non-zero status).
- **Signals.** On Linux `kill(signal)` delivers any signal; `exit` reports
  `signal` for a child killed by one. Windows has no signals: `SIGINT`,
  `SIGQUIT`, `SIGKILL` and `SIGTERM` terminate the process (as in libuv),
  signal 0 only checks that it runs, and a terminated child reports exit code
  1 and no `signal`.

### Platform mechanisms

- **Windows (win32-x64, win32-arm64).** `CreateProcessW` with anonymous pipes
  from `CreatePipe`. The command line is quoted as Node.js does
  (`windowsVerbatimArguments` keeps it as given). `shell: true` runs `%ComSpec%`
  (`cmd.exe`) as `cmd.exe /d /s /c "command"`. Anonymous pipes cannot be waited
  for, so the event loop polls them (`PeekNamedPipe`), waiting on the process
  handles for 1 to 16 ms between polls.
- **Linux (linux-x64, linux-arm64).** Raw system calls, no libc: the parent
  resolves the file against `PATH`, builds `argv` and `envp` in anonymous
  memory, creates `O_CLOEXEC` pipes with `pipe2` and an error pipe, blocks
  signals and calls `fork`. The child only runs system calls on preallocated
  buffers (`dup2`, `chdir`, `execve`); on failure it reports the errno through
  the error pipe, which is how `ENOENT` reaches the parent. Readiness uses
  `poll(2)` on the pipes and a `pidfd` (`pidfd_open`); kernels without pidfd
  fall back to polling `wait4` every 10 ms. `shell: true` runs `/bin/sh -c`.
  Writes to a closed child stdin fail with `EPIPE` instead of raising `SIGPIPE`.
- **macOS (darwin-x64, darwin-arm64).** `posix_spawn` through `libSystem.B.dylib`,
  resolving the file against `PATH`. File actions dup the child's pipe ends,
  open `/dev/null` for `'ignore'`, reset signal dispositions and close unneeded
  descriptors. Readiness uses `poll(2)` on the pipes and `kqueue` with
  `EVFILT_PROC/NOTE_EXIT` for process exit; `kqueue` registration failures
  fall back to polling `waitpid` every 10 ms.
- **BSD (freebsd-x64, openbsd-x64).** Raw system calls like Linux (fork, execve,
  pipe2), with platform-specific syscall numbers and signal handling. Readiness
  uses `poll(2)` on the pipes and `kqueue` with `EVFILT_PROC/NOTE_EXIT` for
  process exit; `kqueue` registration failures fall back to polling `wait4`
  every 10 ms.

### Limitations

- `fork()` and the `'ipc'` stdio (and thus `serialization`, `process.send`)
  throw `ERR_NONA_UNSUPPORTED`; so do `stdio` entries other than `'pipe'`,
  `'inherit'` and `'ignore'` (streams, file descriptors, extra pipes).
- `uid`, `gid` and `signal` (`AbortSignal`) are ignored. `detached` starts
  a new session (Linux and BSD) or a process group without a console (Windows).
  On macOS, `detached` starts a new session.
