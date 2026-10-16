---
layout: home

hero:
    name: Nona
    text: JavaScript to native executables
    tagline: An ahead-of-time compiler that turns ES2020 JavaScript into small standalone executables for Windows, Linux, macOS, FreeBSD and OpenBSD. No embedded interpreter, no C toolchain.
    actions:
        - theme: brand
          text: Get started
          link: /guide/getting-started
        - theme: alt
          text: Try it in the browser
          link: /playground
        - theme: alt
          text: What is Nona
          link: /guide/what-is-nona
        - theme: alt
          text: GitHub
          link: https://github.com/40oleg/nona

features:
    - title: Starts in 2 ms
      details: A compiled hello world starts in about 2 ms and peaks at 11 MB of memory, in a file of about 2 MB. Node.js takes 28 ms and 45 MB; a Node SEA executable is 124 MB.
      link: /guide/performance
    - title: Eight targets from any host
      details: Windows, Linux and macOS on x64 and ARM64, FreeBSD and OpenBSD on x64. Cross-compile with --target; every executable is self-contained.
      link: /reference/native-platforms
    - title: The ES2020 language
      details: Classes, generators, async functions, destructuring, optional chaining, BigInt, proper tail calls and ES modules with cycles and live bindings, with documented exceptions.
      link: /guide/language-support
    - title: npm packages
      details: Packages from node_modules are resolved at build time and compiled into the executable, together with the Node.js modules they commonly need.
      link: /reference/npm
    - title: Node.js-style host APIs
      details: Timers and an event loop, process, fs, path, Buffer, streams, events, URL, and HTTP and TCP servers and clients.
      link: /reference/modules
    - title: A native runtime
      details: A precise mark-and-sweep garbage collector, UTF-16 strings, real exceptions, a catchable RangeError on stack overflow and a self-hosted compiler.
      link: /guide/how-it-works
    - title: FFI and Windows GUI programs
      details: Call any DLL export with compile-time declarations, and build programs without a console window, with an icon, a manifest and version information.
      link: /reference/ffi
---

## Quick example

<<< ../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux and macOS]
nona build hello.js -o build/hello
./build/hello
```

```sh [Cross-compile]
nona build hello.js -o build/hello --target linux-arm64
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

The current release is **v0.14.0**; Nona is experimental. It is not a drop-in replacement for Node.js and has not had a security audit.

- **Conformance.** In the last full audit (v0.8.0) the pinned Test262 suite passed 22436/22492 language, 15868/15933 built-in, 268/268 Atomics and 996/1016 Annex B tests on Windows x64. Every remaining failure is classified on the [status page](/guide/status).
- **Speed.** Startup, executable size and memory are Nona's strengths. Computation inside a program has no JIT: from on par with V8 on simple loops to several times or tens of times slower on calls, allocation and long-running real programs. [Performance](/guide/performance) has the measurements and the known slow spots.
- **Limits.** `eval` and `Function` need source text known at compile time, and only the Node.js APIs Nona implements exist. See [Compatibility and limitations](/guide/compatibility).
