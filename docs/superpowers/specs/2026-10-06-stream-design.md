# Streams and process standard I/O

## Goal and constraints

Issue #141 requires real Node-compatible process dependencies: the process object and streams share the original EventEmitter constructor, and byte input uses the actual Buffer constructor even without explicit imports. Implement the documented `node:stream` API, `node:stream/promises` and `node:stream/consumers` using original JavaScript compiled by Nona. No Node implementation, interpreter, polyfill, C toolchain or bundled native dependency is permitted. Preserve exactly two prelude globals and lazy process initialization. Native execution is confined to CI; local verification uses source evaluation and in-memory compilation/linking.

## Shared objects and compiler integration

Move Nona's existing Events algorithms into a shared private prelude after its PR is integrated. Thin ESM providers export the same constructor, symbols, helpers and mutable settings. Store the stream constructors and exports in `__nonaRegexpVm.streamModule`; provider defaults and `getBuiltinModule` return those actual objects. Buffer already exposes its shared constructor and module object.

Select optional prelude dependencies to a fixed point. Process depends on Events, Buffer and Stream; Stream depends on Events, Buffer and the process scheduler. The dependency cycle is declarative: initialization installs constructors and captures helpers without evaluating the public process getter. Render preludes in a stable order and include the final selected set in existing cache fingerprints. A private `enqueueNextTick(callback, args)` installed outside process `build()` feeds its existing guarded queue, preserving tick ordering without environment construction.

## Stream state and data flow

Readable and Writable maintain separate private state, byte or object counts, queues and one terminal error. Readable supports demand-driven `_read`, `push`, EOF, `read`, `unshift`, flowing and paused modes, encoding across chunk boundaries, pipe/unpipe and asynchronous iteration. Writable serializes `_write`/`_writev`, corking, callbacks, `_final`, finish and drain. A completion guard handles synchronous sink callbacks before deciding remaining queue pressure. Default byte high-water marks are 16384 on Windows and 65536 elsewhere; object mode defaults to 16.

Duplex combines both states with half-open policy. Transform serializes `_transform`, handles optional output and `_flush`, and defers pending write completion when its readable side is saturated. PassThrough returns the same chunk through Transform. Stream is the legacy EventEmitter-derived base. Captured intrinsics protect internal state from later prototype mutation; public subclass hooks remain overridable.

Each pipe destination owns its drain wait and listener cleanup. Destruction invokes `_destroy` once, resolves pending callbacks, disconnects pipes and emits error/close in the observed order. Construction, finalization, cancellation and duplicate callbacks have explicit state transitions. `finished` and `pipeline` share a terminal observer with cleanup, premature-close detection, abort propagation and first-error identity. Promise variants wrap that same operation.

## Additional interfaces

Implement Readable iterable factories, iterator disposal, operators, compose, Duplex factories, duplexPair, status queries, abort attachment and high-water-mark controls. Web adapters accept standard readers/writers and produce streams with the actual available Web prototypes; they must not claim to supply unrelated networking APIs. Consumers accept Node streams, Web streams and iterables and return actual Buffer, Uint8Array, ArrayBuffer, Blob, text or parsed JSON. Incremental decoding preserves split multibyte input.

Process standard output/error use Writable instances with the existing native write adapter and descriptor policies. Standard input uses Readable with native readiness/read hooks, reference policy and Buffer chunks. The process author owns this connection and native OS behavior; the stream implementation owns queue and lifecycle semantics.

## Acceptance and evidence

Use only official Node 26 API documentation and black-box Node 26 behavior. Inventory every documented export and operator with concrete cases. Compare deterministic state and event sequences, including error identity, synchronous/asynchronous completion, pressure, partial reads, cancellation, malformed arguments and mutated intrinsics. Separate classic and module entry timing fixtures. Compile GC-stress probes for all eight matching targets, then require native CI and the Windows full check. Preserve existing execution limits. Update user docs, all affected site locales and runnable samples only with behavior supported by that evidence.
