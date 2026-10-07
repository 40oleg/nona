# 工作原理

## 编译流水线

```text
JavaScript source (script or module graph)
      │
      ▼
 lexer → parser → early errors and scope binding → compile-time eval/Function
                                                         │
                                                         ▼
                                     IR lowering → x86-64 code generation
                                                         │
                                                         ▼
                       runtime (native code + JS preludes) → PE32+/ELF64/Mach-O64 linker
```

所有步骤都在编译器进程内完成，不使用外部汇编器、链接器或 C 编译器。结果是一个文件，包含程序的机器码和 Nona 的运行时。

## 前端

[`src/frontend`](https://github.com/40oleg/nona/tree/main/src/frontend) 把源代码转换成完成绑定的程序：

- `lexer.ts`、`parser.ts` 和 `ast.ts` 生成语法树；不支持的语法是编译错误。
- `binder.ts` 和 `declarations.ts` 检查早期错误，把每个标识符解析到某个作用域（全局、模块、函数、块、`with` 对象），并决定哪些绑定存放在闭包中。
- `modules.ts` 加载模块图：静态导入、字面量说明符的 `import()`、循环依赖和导出解析。`builtin-modules.ts` 和 `fs-module.ts` 提供 `nona:*` 和 `node:*` 模块。
- `eval-aot.ts` 和 `dynamic-functions.ts` 编译源码在编译时已知的 `eval` 和 `Function` 调用。

## 中间表示

[`src/ir`](https://github.com/40oleg/nona/tree/main/src/ir) 把绑定后的程序降级为由基本块、操作和终结指令组成的类寄存器 IR（`lower.ts`、`model.ts`），并计算活跃性（`liveness.ts`），使垃圾回收器在每个安全点只看到活跃的值。

## 代码生成

[`src/backend/x64`](https://github.com/40oleg/nona/tree/main/src/backend/x64) 包含 x86-64 指令编码器、汇编器和代码生成器，后者把 IR 操作翻译成对运行时的调用和内联快速路径。在两个目标平台上，生成的代码和运行时都遵循 Win64 调用约定。

## 运行时

每个可执行文件都包含来自 [`src/runtime`](https://github.com/40oleg/nona/tree/main/src/runtime) 的运行时：

- **值**是 16 字节的带标签对：undefined、null、布尔值、binary64 数字、UTF-16 字符串、对象、Symbol 和 BigInt。
- **对象**按插入顺序保存属性；拥有 32 个及以上属性的对象会建立哈希索引。
- 内置对象的**原生代码**由一个小型构建器（`RuntimeBuilder`）以 x86-64 形式生成。
- **JavaScript 前导代码（prelude）**（`*-source.ts`）用 JavaScript 实现库的一部分，并编译进每个可执行文件：RegExp 引擎、Promise 和 async 驱动、Proxy 和 Reflect 辅助函数、定时器和事件循环、`process`、`TextEncoder`/`TextDecoder` 以及 Annex B 内置对象。

### 垃圾回收器

回收器是精确且不移动对象的：基于显式根（全局变量、安全点处的活跃栈槽、运行时根作用域）进行标记-清除。生成器和异步函数的协程栈（每个 1 MiB）计入回收阈值。在 Linux 上，堆块来自从 1 MiB 区域（arena）中切分出的尺寸类别。内部内存约定见 [`docs/runtime-memory.md`](https://github.com/40oleg/nona/blob/main/docs/runtime-memory.md)（俄文）。

### 异常、协程与事件循环

- 异常依据真实的展开（unwind）数据展开原生栈帧；栈溢出会抛出可捕获的 `RangeError`。
- 生成器和异步函数在各自的栈上运行，并在 `yield` 和 `await` 处切换上下文。
- 顶层程序执行完后，入口会运行事件循环：它清空 Promise 任务，在不占用 CPU 的情况下等待下一个定时器，并在没有剩余工作时退出（[详情](/zh/reference/host-apis)）。

## 链接

- **PE32+**（[`src/backend/pe`](https://github.com/40oleg/nona/tree/main/src/backend/pe)）：节、导入表（运行时所需的 KERNEL32，以及通过 FFI 声明的 DLL）、基址重定位、展开数据和资源（图标、清单、版本信息）。
- **ELF64**（[`src/backend/elf`](https://github.com/40oleg/nona/tree/main/src/backend/elf)、[`src/backend/linux`](https://github.com/40oleg/nona/tree/main/src/backend/linux)）：运行时使用的每个 KERNEL32 函数都有一个调用约定相同的 Linux 系统调用垫片（shim），因此运行时代码在两个目标平台之间共享。

## FFI

`define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)')` 调用在编译时解析：声明会变成 PE 导入表中的一项，以及一个原生转换桩（thunk），它负责转换 JavaScript 值、遵循 Win64 ABI 并捕获 `GetLastError`。在 Linux 上，`define('syscall', '1', …)` 声明一个原始系统调用。参见[原生函数（FFI）](/zh/reference/ffi)。

## 仓库结构

```text
src/frontend       lexer, parser, early errors, scope binding, compile-time eval/Function
src/ir             intermediate representation, lowering and liveness
src/backend/x64    x86-64 encoding and code generation
src/backend/pe     PE32+ linker: imports, relocations, unwind data, resources
src/backend/elf    ELF64 linker; src/backend/linux: system-call shims
src/runtime        native runtime and JavaScript preludes emitted into every executable
tests              unit, integration, native-execution and compatibility tests
examples           sample programs
site               this documentation site
```

## 原生平台

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — 原生平台](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.

## Formal verification prototype

[Lean proofs](https://github.com/40oleg/nona/blob/main/docs/formal-verification.md) cover selected slot move rules and a modeled straight-line dead-move optimizer. Run `npm run check:proofs` with Lean/elan installed. The production compiler, CFG analysis and native runtime are outside the current formal guarantee.
