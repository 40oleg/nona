# Nona architecture

How the compiler and the runtime fit together. The numbers in the layout tables are asserted against the source by `tests/architecture-doc.test.ts`, so this page fails CI when a layout changes and is not updated. Older, per-release descriptions are in [`history/`](history/README.md); the current status is in [`status.md`](status.md) and the plan in [`roadmap.md`](roadmap.md).

## Overview

Nona compiles ES2020 JavaScript ahead of time into a native executable. There is no interpreter, no JIT and no libc: the executable contains the program, the runtime and the JavaScript parts of the built-ins, and talks to the operating system with direct system calls (Linux, macOS, FreeBSD, OpenBSD) or with imports from system DLLs (Windows).

| Target | OS | Architecture | Format |
| --- | --- | --- | --- |
| `win32-x64`, `win32-arm64` | Windows | x64, ARM64 | PE |
| `linux-x64`, `linux-arm64` | Linux | x64, ARM64 | ELF |
| `darwin-x64`, `darwin-arm64` | macOS | x64, ARM64 | Mach-O |
| `freebsd-x64`, `openbsd-x64` | FreeBSD, OpenBSD | x64 | ELF |

The target table is `src/target.ts`. `compile()` in `src/compiler.ts` is the single entry point used by the CLI (`src/cli.ts`), the tests, the playground and the self-hosted compiler.

```
source text
  -> lex           src/frontend/lexer.ts      tokens; records which runtime parts the source can reach
  -> parse         src/frontend/parser.ts     AST (src/frontend/ast.ts)
  -> eval/Function src/frontend/eval-aot.ts, dynamic-functions.ts   literal sources compiled in
  -> bind          src/frontend/binder.ts     scopes, modules, early errors
  -> lower         src/ir/lower.ts            ModuleIR (src/ir/model.ts), liveness and number inference
  -> generate      src/backend/x64/codegen.ts machine code for the whole image (program + runtime + preludes)
  -> link          src/backend/{pe,linux,darwin,bsd}/   PE, ELF or Mach-O file
```

`eval` and `Function` are compiled ahead of time when their source text is a compile-time constant; other sources throw `EvalError` (a documented exception, issue #11).

## Source layout

| Path | Contents |
| --- | --- |
| `src/frontend/` | Lexer, parser, binder, module graph loading, compile-time `eval`/`Function`, and the JavaScript implementations of the `node:*` modules |
| `src/ir/` | Lowering to the IR, liveness, location assignment, number inference |
| `src/runtime/` | The runtime: native routines emitted with `RuntimeBuilder`, the memory layouts, the GC, and the JavaScript preludes (`*-source.ts`) |
| `src/backend/x64/` | The assembler and the code generator |
| `src/backend/arm64/` | The ARM64 assembler and the Windows ARM64 bridge |
| `src/backend/machine/` | The target context: which assembler a compilation uses |
| `src/backend/{pe,elf,macho}/` | File format writers |
| `src/backend/{linux,darwin,bsd}/` | Operating system adapters: entry code, system-call shims, linking |
| `tests/` | Unit and integration tests; probe programs are in `tests/probes/` |
| `scripts/`, `bench/`, `site/`, `programs/`, `examples/` | Build and audit scripts, benchmarks, the documentation site, the program corpus and examples |

## Values and memory

A `Value` is 16 bytes: a tag and a payload. Numbers are unboxed doubles in the payload; strings and objects are pointers. Only String and Object payloads are GC roots.

| Tag | Value |
| --- | --- |
| `ValueTag.Undefined` | 0 |
| `ValueTag.Null` | 1 |
| `ValueTag.Boolean` | 2 |
| `ValueTag.Number` | 3 |
| `ValueTag.String` | 4 |
| `ValueTag.Object` | 5 |
| `ValueTag.Symbol` | 6 |
| `ValueTag.BigInt` | 7 |
| `ValueTag.Uninitialized` | 255 |

The collector is a precise, non-moving mark and sweep (`src/runtime/gc.ts`). Every heap block starts with a header; the payload follows it.

| Heap header | Offset |
| --- | --- |
| `HeapLayout.next` | 0 |
| `HeapLayout.bytes` | 8 |
| `HeapLayout.kind` | 16 |
| `HeapLayout.marked` | 24 |
| `HeapLayout.greyNext` | 32 |
| `HeapLayout.size` | 40 |

| Block kind | Value |
| --- | --- |
| `HeapKind.raw` | 0 |
| `HeapKind.object` | 1 |
| `HeapKind.property` | 2 |
| `HeapKind.cell` | 3 |
| `HeapKind.environment` | 4 |
| `HeapKind.boundData` | 5 |
| `HeapKind.valueList` | 6 |
| `HeapKind.symbol` | 7 |
| `HeapKind.mapEntry` | 8 |
| `HeapKind.weakEntry` | 9 |

Objects (`src/runtime/object-layout.ts`) keep their own properties as a linked list of property nodes; an optional index, an element table and a key filter speed up lookups, and a constructor's first instances get inline property nodes allocated behind the header (`slots`). Property and element storage is the subject of issues #13, #36 and #114.

| Object payload | Offset |
| --- | --- |
| `ObjectLayout.kind` | 0 |
| `ObjectLayout.properties` | 8 |
| `ObjectLayout.length` | 16 |
| `ObjectLayout.prototype` | 24 |
| `ObjectLayout.stringifying` | 32 |
| `ObjectLayout.flags` | 40 |
| `ObjectLayout.index` | 48 |
| `ObjectLayout.elements` | 56 |
| `ObjectLayout.keys` | 64 |
| `ObjectLayout.slots` | 72 |
| `ObjectLayout.site` | 80 |
| `ObjectLayout.size` | 88 |

| Property node | Offset |
| --- | --- |
| `PropertyLayout.next` | 0 |
| `PropertyLayout.key` | 8 |
| `PropertyLayout.value` | 16 |
| `PropertyLayout.attributes` | 32 |
| `PropertyLayout.getter` | 40 |
| `PropertyLayout.setter` | 56 |
| `PropertyLayout.size` | 72 |

A function object is an object followed by the fields below (`src/runtime/functions.ts`); the offsets are measured from the start of the payload, so they begin at `ObjectLayout.size`.

| Function payload | Offset |
| --- | --- |
| `FunctionLayout.code` | 88 |
| `FunctionLayout.environment` | 96 |
| `FunctionLayout.constructable` | 104 |
| `FunctionLayout.rawThis` | 112 |
| `FunctionLayout.bound` | 120 |
| `FunctionLayout.sourceText` | 128 |
| `FunctionLayout.constructCode` | 136 |
| `FunctionLayout.homeObject` | 144 |
| `FunctionLayout.arrow` | 152 |
| `FunctionLayout.lexicalThis` | 160 |
| `FunctionLayout.lexicalNewTarget` | 176 |
| `FunctionLayout.generator` | 192 |
| `FunctionLayout.realm` | 200 |
| `FunctionLayout.instanceSlots` | 208 |
| `FunctionLayout.size` | 216 |

[`runtime-memory.md`](runtime-memory.md) (Russian) describes the allocation, rooting and exception rules in detail; where its byte numbers differ from the tables above, the tables are right.

## Code generation and calling convention

Runtime routines are written once, against the register set and operations of the x64 `Assembler` (`src/backend/x64/assembler.ts`), with `RuntimeBuilder.fn(name, frameSize, body)` (`src/runtime/abi.ts`). The register names are *logical roles*: `rax`, `rcx`, `rdx`, `rbx`, `rbp`, `rsi`, `rdi`, `r8`-`r15`, `rsp`. A routine that produces a value writes it to the out pointer it receives in `rcx`; the builtin entry convention passes `out`, `argc`, `argv` and `callee`, and native construct entries get the prepared receiver as a fifth argument.

Compiled JavaScript functions (`generate()` in `src/backend/x64/codegen.ts`) keep every local and temporary in a 16-byte stack slot. A function's frame holds a root frame (previous frame, the Value array and the count), the locations of its locals and the `this`, `new.target` and `super` receivers. The collector runs only at safepoints, and every live Value is in a rooted slot at that point. Exceptions use handler records and `rt.throw` unwinds them.

## Machine model

The code generator and the runtime are not duplicated per architecture. `src/backend/machine/context.ts` keeps the active native target (`withNativeTarget`) and `createAssembler(name)` returns an `Arm64Assembler` for ARM64 targets and the x64 `Assembler` otherwise. `Arm64Assembler` is a subclass: it keeps the logical x64 register names and re-encodes each operation as A64, mapping `rax`...`r15` and `rsp` onto `x0`...`x22` and `x28`, and it throws when raw x64 bytes are emitted. Code that emits raw bytes must therefore be guarded by an x64-only branch.

The operating system adapters supply what differs per OS: the entry code, the system-call or DLL-import bridge and the file writer (`pe/writer.ts`, `linux/`, `darwin/`, `bsd/`, `arm64/windows.ts`). The fragment, fixup and program model they share lives in `src/backend/pe/model.ts`. A machine-independent builtins layer is roadmap item 25; the design questions around the logical-x64 model are recorded in #183.

## JavaScript preludes and linking

Large parts of the built-ins are JavaScript: the RegExp engine, Promise machinery, Proxy, Reflect, timers, Buffer, `process`, streams and the `node:*` modules (`src/runtime/*-source.ts`, `src/frontend/*-module.ts`). They are compiled by the same pipeline as the program and share its runtime. They talk to native code through the `__nonaRegexpVm` intrinsic object (see #183).

Optional runtime parts are linked only when the program can reach them. The lexer records every identifier, property name and string literal it sees (`collectSourceUsage`), and `src/runtime/link.ts` maps trigger names to preludes; `--full-runtime` links everything. This is a lexical rule, documented in the site's compatibility guide and tracked in #182. The compiled runtime and prelude image is cached on disk (`BaseImageCache`, `src/cache.ts`), so a build only compiles the program.

## Tests and verification

Tests are in `tests/*.test.ts` and run with `node --test` after `npm run build`. Most of them compile real programs and run the native executables on the host target, comparing the output with Node.js (`tests/helpers/oracle.ts`) and under `gcStress`, which forces a collection at every allocation. Other checks: the pinned Test262 audit ([`test262.md`](test262.md)), the program corpus ([`program-corpus.md`](program-corpus.md)), the byte-identical self-hosting stages ([`self-hosting.md`](self-hosting.md)) and the benchmarks (`bench/README.md`).
