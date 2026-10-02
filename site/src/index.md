---
layout: home

hero:
  name: Nona
  text: JavaScript to native executables
  tagline: An ahead-of-time compiler that turns ES2020 JavaScript into standalone Windows and Linux x64 executables. No embedded interpreter, no C toolchain.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: What is Nona
      link: /guide/what-is-nona
    - theme: alt
      text: GitHub
      link: https://github.com/40oleg/nona

features:
  - title: Starts in 2 ms
    details: A compiled hello world starts in 1.8 ms and peaks at 11 MB of memory, in a 7 MB executable. Node.js takes 28 ms and 45 MB; a Node SEA executable is 124 MB.
    link: /guide/performance
  - title: The ES2020 language
    details: Classes, generators, async functions, destructuring, optional chaining, BigInt, proper tail calls and ES modules with cycles and live bindings — with documented exceptions.
    link: /guide/language-support
  - title: A native runtime
    details: A precise mark-and-sweep garbage collector, UTF-16 strings, real exceptions and a catchable RangeError on stack overflow, linked into every executable.
    link: /guide/how-it-works
  - title: Host APIs
    details: An event loop with timers, a global process, synchronous node:fs, TextEncoder and TextDecoder.
    link: /reference/host-apis
  - title: FFI and nona:win32
    details: Call any DLL export on Windows with compile-time declarations; ready-made user32, kernel32 and advapi32 bindings.
    link: /reference/ffi
  - title: Windows GUI executables
    details: Programs without a console window, with an icon, an application manifest and version information.
    link: /reference/windows-executables
---

## Quick example

<<< ../samples/hello.js

::: code-group

```sh [Windows]
node dist/cli.js build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux]
node dist/cli.js build hello.js -o build/hello --target linux-x64
./build/hello
```

:::

```text
Hello, from Nona!
a microtask runs before any timer
tick 1
tick 2
tick 3
done; at least 30 ms passed: true
```

The executable contains the program's machine code and Nona's runtime. It does not need Node.js: a Windows executable imports only `KERNEL32.dll`, and a Linux executable makes system calls directly without libc.

## Status

The current release is **v0.7.0**. The pinned Test262 suite (ES2020 features) passes 17298/17337 language, 15491/15559 built-in, 268/268 Atomics and 996/1016 Annex B tests on Windows x64; every remaining failure is classified on the [status page](/guide/status). Startup, executable size and memory are Nona's strengths; computation inside a program is 20–100× slower than V8 and some operations (`Map`, `sort`, string building, long Promise chains) are still super-linear, see [Performance](/guide/performance). Nona is experimental: it is not a drop-in replacement for Node.js and has not had a security audit.
