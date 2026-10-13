# Nona architecture

How the compiler and the runtime fit together. The numbers in the layout tables are asserted against the source by `tests/architecture-doc.test.ts`, so this page fails CI when a layout changes and is not updated. Older, per-release descriptions are in [`history/`](history/README.md); the current status is in [`status.md`](status.md) and the plan in [`roadmap.md`](roadmap.md).

## Overview

Nona compiles ES2020 JavaScript ahead of time into a native executable. There is no interpreter, no JIT and no libc: the executable contains the program, the runtime and the JavaScript parts of the built-ins, and talks to the operating system with direct system calls (Linux, macOS, FreeBSD, OpenBSD) or with imports from system DLLs (Windows).

| Target                       | OS               | Architecture | Format |
| ---------------------------- | ---------------- | ------------ | ------ |
| `win32-x64`, `win32-arm64`   | Windows          | x64, ARM64   | PE     |
| `linux-x64`, `linux-arm64`   | Linux            | x64, ARM64   | ELF    |
| `darwin-x64`, `darwin-arm64` | macOS            | x64, ARM64   | Mach-O |
| `freebsd-x64`, `openbsd-x64` | FreeBSD, OpenBSD | x64          | ELF    |

The target table is `src/target.ts`. `compile()` in `src/compiler.ts` is the single entry point used by the CLI (`src/cli.ts`), the tests, the playground and the self-hosted compiler.

```
source text
  -> lex           src/frontend/lexer.ts      tokens; records which runtime parts the source can reach
  -> parse         src/frontend/parser.ts     AST (src/frontend/ast.ts)
  -> eval/Function src/frontend/eval-aot.ts, dynamic-functions.ts   literal sources compiled in
  -> bind          src/frontend/binder.ts     scopes, modules, early errors
  -> lower         src/ir/lower.ts            ModuleIR (src/ir/model.ts), liveness and number inference
  -> generate      src/backend/x64/codegen.ts machine code for the whole image (program + runtime + preludes; operations.ts per function)
  -> link          src/backend/{pe,linux,darwin,bsd}/   PE, ELF or Mach-O file
```

`eval` and `Function` are compiled ahead of time when their source text is a compile-time constant; other sources throw `EvalError` (a documented exception, issue #11).

## Source layout

| Path                                                    | Contents                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/frontend/`                                         | Lexer, parser, binder, module graph loading, compile-time `eval`/`Function`, and the JavaScript implementations of the `node:*` modules                                                                                                                                     |
| `src/ir/`                                               | Lowering to the IR (`lower.ts`: expressions and entry points; `lower/`: the shared state and references, classes, calls, patterns and statements, as one class chain), liveness, location assignment and the IR optimization passes (see below)                             |
| `src/runtime/`                                          | The runtime: native routines emitted with `RuntimeBuilder`, the memory layouts, the GC, and the TypeScript side of the JavaScript preludes (`*-source.ts`)                                                                                                                  |
| `src/lib/`                                              | The JavaScript compiled into executables: the runtime preludes (`runtime/*.js`) and the `node:*` module bodies (`modules/*.js`); `scripts/build.mjs` turns them into `src/lib/sources.generated.ts`                                                                         |
| `src/backend/x64/`                                      | The assembler and the code generator: `codegen.ts` assembles the image (runtime, base-image cache, host globals, entry code), `operations.ts` emits each IR function, `preludes.ts` selects and lowers the JavaScript preludes, `base-image.ts` caches the compiled runtime |
| `src/backend/arm64/`                                    | The ARM64 assembler and the Windows ARM64 bridge                                                                                                                                                                                                                            |
| `src/backend/machine/`                                  | The machine model the runtime emits code against: the target context (which assembler a compilation uses), the fragment/fixup/program model (`model.ts`) and the floating-point steps without an SSE2 instruction (`math.ts`)                                               |
| `src/backend/{pe,elf,macho}/`                           | File format writers                                                                                                                                                                                                                                                         |
| `src/backend/{linux,darwin,bsd}/`                       | Operating system adapters: entry code, system-call shims, linking                                                                                                                                                                                                           |
| `src/*.ts`                                              | The compiler driver (`compiler.ts`, `cli.ts`), targets, diagnostics, and data shared by the layers: the optional runtime parts and their triggers (`link.ts`), object model limits (`shape-limits.ts`), the lexer's RegExp literal validator (`regexp-validator.ts`)        |
| `tests/`                                                | Unit and integration tests; probe programs are in `tests/probes/`                                                                                                                                                                                                           |
| `scripts/`, `bench/`, `site/`, `programs/`, `examples/` | Build and audit scripts, benchmarks, the documentation site, the program corpus and examples                                                                                                                                                                                |

Source files stay below 60 KiB and lines below 200 characters (`tests/source-budget.test.ts`); files that were larger when the budget was introduced are listed in `tests/source-budget.json` and may only shrink.

Layer direction: `src/frontend/` and `src/ir/` import nothing from `src/runtime/` or `src/backend/`, `src/runtime/` imports nothing from `src/frontend/`, and value imports form no cycles (`tests/module-boundaries.test.ts`). The backend compiles the JavaScript preludes with the frontend.

## Values and memory

A `Value` is 16 bytes: a tag and a payload. Numbers are unboxed doubles in the payload; strings and objects are pointers. Only String and Object payloads are GC roots.

A string record is its length word followed by UTF-16 code units. A long `+` result is a _rope_ (`src/runtime/strings.ts`): a record of heap kind `HeapKind.rope` whose length word carries bit 62 (`ropeTag`) and which points at its two halves instead of holding units. Ropes are confined to compiled code: a frame slot or a script-level global may hold one and pass it to `+`, a copy, `typeof`, `!` or a `.length` read; before any other operation reads a slot the code generator flattens it in place (`rt.flattenValue`), so the runtime, the preludes and the host only ever see flat records. The flat copy replaces the rope's left half (right becomes 0), so a rope shared by several slots is copied once.

| Tag                      | Value |
| ------------------------ | ----- |
| `ValueTag.Undefined`     | 0     |
| `ValueTag.Null`          | 1     |
| `ValueTag.Boolean`       | 2     |
| `ValueTag.Number`        | 3     |
| `ValueTag.String`        | 4     |
| `ValueTag.Object`        | 5     |
| `ValueTag.Symbol`        | 6     |
| `ValueTag.BigInt`        | 7     |
| `ValueTag.Uninitialized` | 255   |

The collector is a precise, non-moving mark and sweep (`src/runtime/gc.ts`). Every heap block starts with a header; the payload follows it.

| Heap header           | Offset |
| --------------------- | ------ |
| `HeapLayout.next`     | 0      |
| `HeapLayout.bytes`    | 8      |
| `HeapLayout.kind`     | 16     |
| `HeapLayout.marked`   | 24     |
| `HeapLayout.greyNext` | 32     |
| `HeapLayout.size`     | 40     |

| Block kind             | Value |
| ---------------------- | ----- |
| `HeapKind.raw`         | 0     |
| `HeapKind.object`      | 1     |
| `HeapKind.property`    | 2     |
| `HeapKind.cell`        | 3     |
| `HeapKind.environment` | 4     |
| `HeapKind.boundData`   | 5     |
| `HeapKind.valueList`   | 6     |
| `HeapKind.symbol`      | 7     |
| `HeapKind.mapEntry`    | 8     |
| `HeapKind.weakEntry`   | 9     |
| `HeapKind.rope`        | 10    |

Objects (`src/runtime/object-layout.ts`) come in two representations ([`object-model.md`](object-model.md)): plain objects made by literals, ordinary constructors and `JSON.parse` keep their named properties in 16-byte slots described by a shared shape (`shape`; the slots follow the header, the rest are in a value list in `keys`), and every other object keeps a linked list of property nodes with an optional index, an element table and a key filter. Property and element storage is the subject of issues #13, #36 and #114.

| Object payload            | Offset |
| ------------------------- | ------ |
| `ObjectLayout.kind`       | 0      |
| `ObjectLayout.properties` | 8      |
| `ObjectLayout.length`     | 16     |
| `ObjectLayout.prototype`  | 24     |
| `ObjectLayout.shape`      | 32     |
| `ObjectLayout.flags`      | 40     |
| `ObjectLayout.index`      | 48     |
| `ObjectLayout.elements`   | 56     |
| `ObjectLayout.keys`       | 64     |
| `ObjectLayout.size`       | 72     |

| Property node               | Offset |
| --------------------------- | ------ |
| `PropertyLayout.next`       | 0      |
| `PropertyLayout.key`        | 8      |
| `PropertyLayout.value`      | 16     |
| `PropertyLayout.attributes` | 32     |
| `PropertyLayout.getter`     | 40     |
| `PropertyLayout.setter`     | 56     |
| `PropertyLayout.size`       | 72     |

A function object is an object followed by the fields below (`src/runtime/functions.ts`); the offsets are measured from the start of the payload, so they begin at `ObjectLayout.size`.

| Function payload                  | Offset |
| --------------------------------- | ------ |
| `FunctionLayout.code`             | 72     |
| `FunctionLayout.environment`      | 80     |
| `FunctionLayout.constructable`    | 88     |
| `FunctionLayout.rawThis`          | 96     |
| `FunctionLayout.bound`            | 104    |
| `FunctionLayout.sourceText`       | 112    |
| `FunctionLayout.constructCode`    | 120    |
| `FunctionLayout.homeObject`       | 128    |
| `FunctionLayout.arrow`            | 136    |
| `FunctionLayout.lexicalThis`      | 144    |
| `FunctionLayout.lexicalNewTarget` | 160    |
| `FunctionLayout.generator`        | 176    |
| `FunctionLayout.realm`            | 184    |
| `FunctionLayout.instanceShape`    | 192    |
| `FunctionLayout.size`             | 200    |

[`runtime-memory.md`](runtime-memory.md) (Russian) describes the allocation, rooting and exception rules in detail; where its byte numbers differ from the tables above, the tables are right.

## IR optimization

`optimizeFunction()` in `src/ir/lower.ts` runs these passes on every function after lowering, in this order; `annotateDirectCalls()` then runs once over the module. Each pass keeps ECMAScript semantics exactly: it only uses facts that hold on every path, and an operation that could run user code (a conversion of an object, a getter, a Proxy trap) or throw is never assumed to be pure. The catalogue of further transformations and their correctness conditions is [#146](https://github.com/40oleg/nona/issues/146).

| Pass             | File                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dead-zone checks | `initialization.ts` | Drops `checkInitialized` of slots and globals that are definitely initialized (forward must-analysis over the CFG).                                                                                                                                                                                                                                                                                                                                                           |
| Constants        | `constants.ts`      | Forward must-analysis of slots holding a known primitive, over feasible edges only: folds unary and binary operations on known primitives (no BigInt; `**` only to exact integers; Number-to-String only for integers; strings up to 4096 units), turns copies of known slots into constants, turns branches on known conditions into jumps and removes blocks that become unreachable. Skips functions with an `arguments` object and the error slots of exception handlers. |
| Control flow     | `control-flow.ts`   | A branch on `!x` branches on `x` with its targets swapped; an edge to an empty block that only jumps, or that branches on a value whose truthiness the edge already knows (the second test of a short-circuit condition), goes straight to the final target; unreachable blocks are removed and a block is merged into its only predecessor when that predecessor jumps to it (not across exception handlers).                                                                |
| Copies           | `copies.ts`         | Block-local copy forwarding; drops moves and pure operations (`!`, `typeof`, nullish and `typeof` tests, strict equality, operations on proven Numbers) whose result is dead.                                                                                                                                                                                                                                                                                                 |
| Numbers          | `numbers.ts`        | Marks arithmetic and comparisons whose operands are proven Numbers (`numeric`), which the code generator emits without tag checks or runtime fallback. Numbers come from Number constants, operations on Numbers, operators that produce a Number or throw (unary `+` and `>>>` always; `- * / % ** & \| ^ << >>` and `~` with a Number operand, since a BigInt mixed with a Number throws) and the edge of a branch on `typeof x === 'number'` where the test holds.         |
| Moves            | `copies.ts`         | `t = op; x = t` with `t` dead becomes `x = op` for constants and Number operations.                                                                                                                                                                                                                                                                                                                                                                                           |
| Direct calls     | `calls.ts`          | Annotates calls of known function declarations; the code generator checks the callee and calls its code directly.                                                                                                                                                                                                                                                                                                                                                             |

A temporary defined once by a constant has no frame location: the code generator keeps its Value in read-only data. Blocks are emitted in IR order, and a jump or the last conditional jump of a branch to the block emitted next is left out. A strict equality with an `undefined`, `null`, Boolean or Number constant operand is an inline tag test (with `ucomisd` for Numbers) instead of a call to `rt.strictEquals`; when the result only decides the block's branch, the test jumps to the branch targets directly. `switch` cases with such constants benefit the same way.

## Code generation and calling convention

Runtime routines are written once, against the register set and operations of the x64 `Assembler` (`src/backend/x64/assembler.ts`), with `RuntimeBuilder.fn(name, frameSize, body)` (`src/runtime/abi.ts`). The register names are _logical roles_: `rax`, `rcx`, `rdx`, `rbx`, `rbp`, `rsi`, `rdi`, `r8`-`r15`, `rsp`. A routine that produces a value writes it to the out pointer it receives in `rcx`; the builtin entry convention passes `out`, `argc`, `argv` and `callee`, and native construct entries get the prepared receiver as a fifth argument.

Compiled JavaScript functions (`emitFunction()` in `src/backend/x64/operations.ts`, called by `generate()` in `codegen.ts`) keep every local and temporary in a 16-byte stack slot. A function's frame holds a root frame (previous frame, the Value array and the count), the locations of its locals and the `this`, `new.target` and `super` receivers; the layout is fixed (`src/runtime/frame-layout.ts`). A function starts with `lea r10,[descriptor]; call rt.enterFrame`: the shared stub (`src/runtime/prologue.ts`) reads the function's static descriptor (frame size, slot count, parameter count, the number of slots that start as undefined), checks the stack limit, builds the frame below the function's return address, copies the arguments and links the root frame, then returns into the function. Only the parameters and the locations live at the function's entry (a variable read before it is assigned) start as undefined; every other location is written before a stack map lists it. A function with a frame below a page whose only such slots are its (at most four) parameters uses `rt.enterFrame0`…`rt.enterFrame4`, which copy the parameters without a loop when the caller passed them all. The collector runs only at safepoints, and every live Value is in a rooted slot at that point. A safepoint is one byte test: `rt.gcNeeded`, raised by the allocator when the managed bytes reach the threshold and cleared by `rt.collect`. Which slots the collector scans is decided by the function's stack map table (`src/runtime/stack-maps.ts`): for every call the function makes, a bitmap of the locations live at that return address. A JS frame's root record has a negative count; `rt.gcMarkFrame` reads the return address below the record, finds its entry and marks the listed locations plus `this`, `new.target` and the super receiver. Dead slots are therefore never cleared; only a destination that was dead before an operation gets its tag reset, because the runtime may keep its result there across a nested call. Exceptions use handler records and `rt.throw` unwinds them.

Closure creation and general calls are described by static site descriptors (`src/runtime/call-sites.ts`). A function literal is `lea rcx,[dest]; lea rdx,[rip+closure.N]; call rt.newClosure`; the descriptor holds the code address, the kind flags (arrow, generator, async, class constructor, strict, no prototype), the parameter count for `length`, the name, the source text and one entry per captured cell, home object or computed name. A call whose callee is not known at compile time is `lea rcx,[dest]; lea rdx,[rip+site.N]; call rt.invokeSite` (`rt.constructSite` for `new`, `rt.tailCallSite` for a strict tail call); the descriptor names the callee, the receiver, new.target, the argument area and each argument, and the stub copies the arguments and calls `rt.invoke`. An operand entry is a signed 32-bit value: an even one is the RBP displacement of a frame slot, an odd one a rel32 fixup (addend 1) to a constant Value in `.rdata`. The stubs read the creating or calling frame through RBP, which the runtime preserves. The call stubs have no frame: they store the receiver and new.target into the caller's outgoing argument slots and jump to `rt.invoke`, which returns straight to the call site; sites with up to four arguments use a stub for their count (`rt.invokeSite0`…`rt.invokeSite4`). `rt.invoke` runs an ordinary function object (not bound, not a generator, async function or class constructor) from a small frame of its own: an arrow gets its lexical this and new.target, a strict function the receiver as is, a sloppy one an object receiver or its realm's global object; everything else (proxies, bound functions, primitive receivers that need boxing) goes to `rt.invokeGeneral`. `rt.invokeConstruct` calls a compiled constructor's code directly. A `new` site has a record (`NewCacheLayout`) that remembers the constructor and the node of its `prototype` property at the shape epoch, so that `rt.newInstanceCached` creates the instance without looking `prototype` up. Arrows and plain functions have their own closure entries (`rt.newArrowClosure`, `rt.newPlainClosure`). Known direct calls keep their inline fast path and use the same stub for their out-of-line general case.

## Machine model

The code generator and the runtime are not duplicated per architecture. `src/backend/machine/context.ts` keeps the active native target (`withNativeTarget`) and `createAssembler(name)` returns an `Arm64Assembler` for ARM64 targets and the x64 `Assembler` otherwise. `Arm64Assembler` is a subclass: it keeps the logical x64 register names and re-encodes each operation as A64, mapping `rax`...`r15` and `rsp` onto `x0`...`x22` and `x28`, and it throws when raw x64 bytes are emitted. Code that emits raw bytes must therefore be guarded by an x64-only branch.

Vector operations are part of the same model. `vectorEqual32`, `vectorEqual16`, `vectorEqual8`, `vectorOr`, `vectorAnd`, `vectorZero`, `vectorBroadcast16`, `vectorMask`, `bitScanForward` and `bitScanReverse` work on 128-bit registers (`xmm0`...`xmm15`, which are `v0`...`v15` on ARM64) and are defined by their effect: SSE2 on x64 and NEON on ARM64. The one difference is the width of the mask: one bit per byte on x64 and four on ARM64, given by `vectorMaskBitsPerByte` and `vectorMaskAll`. See [simd.md](simd.md).

The runtime (`src/runtime/`) imports from the backend only `src/backend/machine/*` (checked by `tests/module-boundaries.test.ts`). `context.ts` re-exports the assembler classes and operand types (`Assembler`, `Arm64Assembler`, `Reg`, `Xmm`, `Mem`, `Condition`) and chooses the per-machine pieces: `machineMath()` returns the `MachineMath` implementation for the transcendental steps of `Math` (sin, cos, tan, log, atan, atan2, and the exp/expm1/log1p cores) — `x87Math` (`backend/x64/x87-math.ts`, the x87 unit) on x86-64 and `softwareMath` (calls of the `rt.armMath.*` routines of `runtime/numeric/software-math.ts`) on ARM64. New machine-specific code goes behind such an interface instead of an inline `if (arm64)` in the runtime.

The operating system adapters supply what differs per OS: the entry code, the system-call or DLL-import bridge and the file writer (`pe/writer.ts`, `linux/`, `darwin/`, `bsd/`, `arm64/windows.ts`). The fragment, fixup and program model they share (`NamedFragment`, `Fixup`, `NativeProgram`, `UnwindFunction`, …) lives in `src/backend/machine/model.ts`. A machine-independent builtins layer is roadmap item 25; the design questions around the logical-x64 model are recorded in #183.

## JavaScript preludes and linking

Large parts of the built-ins are JavaScript: the RegExp engine, Promise machinery, Proxy, Reflect, timers, Buffer, `process`, streams and the `node:*` modules (`src/lib/runtime/*.js` and `src/lib/modules/*.js`, used by `src/runtime/*-source.ts` and `src/frontend/*-module.ts`). They are compiled by the same pipeline as the program and share its runtime. They talk to native code through the `__nonaRegexpVm` intrinsic object; [intrinsics.md](intrinsics.md) records its contract and the machine-model decision (#183).

Optional runtime parts are linked only when the program can reach them. The lexer records every identifier, property name and string literal it sees (`collectSourceUsage`), and `src/link.ts` maps trigger names to preludes; `--full-runtime` links everything. This is a lexical rule, documented in the site's compatibility guide; [runtime-linking.md](runtime-linking.md) records the decision to keep it (#182), with `--link` and `--print-link`. The compiled runtime and prelude image is cached on disk (`BaseImageCache`, `src/cache.ts`), so a build only compiles the program.

## Tests and verification

Tests are in `tests/*.test.ts` and run with `node --test` after `npm run build`. Most of them compile real programs and run the native executables on the host target, comparing the output with Node.js (`tests/helpers/oracle.ts`) and under `gcStress`, which forces a collection at every allocation. Other checks: the pinned Test262 audit ([`test262.md`](test262.md)), the program corpus ([`program-corpus.md`](program-corpus.md)), the byte-identical self-hosting stages ([`self-hosting.md`](self-hosting.md)) and the benchmarks (`bench/README.md`).
