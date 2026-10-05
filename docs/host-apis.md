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

## Buffer and binary data

The global `Buffer` and the `node:buffer`, `buffer` and `nona:buffer` ES modules use the same constructor on every native target. Buffer storage is a native `Uint8Array`: indexing, iteration, ArrayBuffer views and inherited typed-array methods work without an interpreter or external libraries.

`Buffer.from` copies strings, buffers, arrays, array-like objects and JSON buffer records. An ArrayBuffer or SharedArrayBuffer argument shares its backing store. `slice` and `subarray` return Buffer views that share storage; `Buffer.from(buffer)` makes a copy.

Supported encodings are UTF-8 (`utf8`, `utf-8`), UTF-16 little endian (`utf16le`, `utf-16le`, `ucs2`, `ucs-2`), Latin-1 (`latin1`, `binary`), ASCII, hex, base64 and base64url. UTF-8 decoding preserves a BOM and replaces malformed input; UTF-8/UTF-16 writes do not store incomplete characters. Hex decoding stops at the first invalid byte pair; base64 accepts whitespace and the URL-safe alphabet.

The API includes `alloc`, `allocUnsafe`, `allocUnsafeSlow`, `byteLength`, `isBuffer`, `isEncoding`, `compare`, `concat`, `copyBytesFrom`, `poolSize`; instance conversion, JSON, inspection, equality, comparison, overlapping copy, fill, write, shared slices, swap16/32/64, includes/indexOf/lastIndexOf; signed/unsigned integer reads and writes in both byte orders (fixed widths and one through six bytes), float/double access, 64-bit BigInt access, and Uint spelling aliases. Searches accept the Node 26 exclusive `end` bound. Aligned unsafe allocations accept powers of two through 2 ** 30 and align the actual native backing address.

The module also exports `isAscii`, `isUtf8`, `atob`, `btoa`, `transcode` (UTF-8, UTF-16LE, ASCII and Latin-1), `INSPECT_MAX_BYTES`, `kMaxLength`, `kStringMaxLength` and `constants`. `SlowBuffer` is retained as a legacy compatibility export. The default export is the shared module API object.

Global and module `Blob` and `File` constructors provide immutable copied data, `size`, `type`, `slice`, Promise-returning `text`/`arrayBuffer`/`bytes`, and File `name`/`lastModified` metadata. Blob string parts normalize unpaired surrogates; `endings: 'native'` uses CRLF on Windows and LF elsewhere. Returned bytes and ArrayBuffers are independent copies.

### Buffer module limitations

- Allocations are independent and zero-filled, including unsafe allocations. `poolSize` is present but no shared slab pool is used. Nona's backing-store and reported maximum lengths are 2 ** 31 - 1 bytes, smaller than Node's platform-specific maxima.
- `Blob.stream()` and `Blob.textStream()` throw `ERR_NOT_IMPLEMENTED` because Web Streams are not yet implemented.
- `URL.createObjectURL` and `URL.revokeObjectURL` are unavailable. `resolveObjectURL` returns undefined for unregistered URLs; there is no object URL registry.
- CommonJS `require('buffer')` is unavailable; use ES imports. Buffer error classes and codes are covered by oracle tests, but diagnostic wording and base64 DOMException prototypes may differ from Node.
- `node:fs` continues to return Uint8Array data. Convert it with `Buffer.from(bytes)` when Buffer methods are needed.

See the [Node 26 Buffer reference](https://nodejs.org/docs/latest-v26.x/api/buffer.html) for the shared API contract and [the runnable Buffer sample](../site/samples/buffer.mjs).
