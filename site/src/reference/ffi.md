---
editLink: false
---

<!--@include: ../../generated/ffi.md-->

::: info Source
This page is generated from [`docs/ffi.md`](https://github.com/40oleg/nona/edit/main/docs/ffi.md) in the repository. Edit it there.
:::


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
