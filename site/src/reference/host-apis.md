---
editLink: false
---

<!--@include: ../../generated/host-apis.md-->

::: info Source
This page is generated from [`docs/host-apis.md`](https://github.com/40oleg/nona/edit/main/docs/host-apis.md) in the repository. Edit it there.
:::


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.

Event globals (`Event`, `CustomEvent`, `EventTarget`, `AbortController`,
`AbortSignal`) and `NodeEventTarget` are supported, including cancellation,
protected abort subscriptions and target introspection. `EventEmitterAsyncResource`
and `node:async_hooks` / `nona:async_hooks` provide explicit resources, hooks and
local context storage. Promise, await, timer and microtask callbacks preserve
captured context. Native resource hooks and automatic GC destruction are outside
this API; see the English reference for the precise boundaries.
