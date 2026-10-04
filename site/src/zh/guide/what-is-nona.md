# 什么是 Nona

Nona 是一个 JavaScript 提前（ahead-of-time，AOT）编译器。它读取一个脚本或一组 ES 模块，进行检查，降级为自己的中间表示，生成 x86-64 机器码，并链接成一个独立的可执行文件：Windows 上是 PE32+ 映像，Linux 上是 ELF64 映像。

编译器用 TypeScript 编写，运行在 Node.js 上。但它生成的程序并不依赖 Node.js：其中没有解释器、没有 V8，也没有字节码。Windows 可执行文件只导入 `KERNEL32.dll`（以及程序通过 [FFI](/zh/reference/ffi) 调用的 DLL）；Linux 可执行文件直接进行系统调用，不使用 libc。

## 你能得到什么

- **ES2020 语言。** 类和 `super`、生成器、异步函数和异步生成器、`for await`、解构、展开语法、可选链、`??`、BigInt、Symbol、迭代器、尾调用优化、非严格模式下的 `with`，以及 Annex B 的 Web 兼容语义。
- **ES 模块。** 静态 `import`/`export`、循环依赖和实时绑定、`import.meta`，以及对编译时已知模块的动态 `import()`。`.mjs` 输入按模块编译。
- **ES2020 标准库。** Object、Function、Array、String、Number、Math、Date、JSON、RegExp（命名分组、后行断言、`s` 和 `u` 标志、Unicode 属性转义）、Map、Set、WeakMap、WeakSet、ArrayBuffer、DataView 和所有类型化数组、SharedArrayBuffer 和 Atomics、Proxy 和 Reflect，以及带任务队列的 Promise。
- **源码在编译时已知的 `eval` 和 `Function`。** 字符串字面量、字面量的拼接，或只被赋值为此类常量的变量，会被提前编译，并完整支持直接和间接 `eval` 的语义。
- **原生运行时。** 精确、不移动对象的标记-清除垃圾回收器、UTF-16 字符串、真正的异常，以及栈溢出时可捕获的 `RangeError`。
- **面向真实程序的宿主 API：** [带定时器的事件循环](/zh/reference/host-apis)、全局 [`process`](/zh/reference/process)、带 `TextEncoder`/`TextDecoder` 的同步 [`node:fs`](/zh/reference/fs)，以及带有现成 `nona:win32` 声明的[原生函数调用](/zh/reference/ffi)。
- **启动快、占用小。** 编译后的 hello world 启动约 2 ms，内存峰值 11 MB，文件大小 3 MB：没有需要启动的运行时，也没有需要预热的 JIT（[性能](/zh/guide/performance)）。
- **Windows 可执行文件**：没有控制台窗口，带图标、清单和版本信息（[Windows 可执行文件](/zh/reference/windows-executables)）。

## Nona 不是什么

- **不是 Node.js 的替代品。** 没有 `require`、没有 npm 包，除了 [`fs` 和 `process` 子集](/zh/reference/modules)之外也没有 Node.js API。浏览器 API 同样不可用。
- **不是完整的 ES2020 实现。** Nona 实现了 ES2020，例外情况均有文档说明；参见[语言支持](/zh/guide/language-support)和[兼容性与限制](/zh/guide/compatibility)。
- **不支持运行时代码生成。** `eval` 和 `Function` 需要在编译时已知的源码；运行时计算出的字符串会抛出 `EvalError`。
- **计算速度还不快。** 没有 JIT 时，函数调用、属性访问和内存分配比 V8 慢 20–100 倍，而 `Map`/`Set`、`sort`、字符串拼接和长 Promise 链的耗时仍随数据规模超线性增长（[性能](/zh/guide/performance)）。
- **不支持 x86-64 以外的平台。** 目标平台是 Windows 10/11 x64 和 Linux x86-64。

## 安全

Nona 没有经过安全审计。不要编译不可信的源代码，也不要把生成的可执行文件当作沙箱：它们和其他原生程序拥有相同的权限，而且 FFI 可以调用任意 DLL。

## 下一步

- [快速开始](/zh/guide/getting-started)——构建编译器和你的第一个程序。
- [工作原理](/zh/guide/how-it-works)——编译流水线、运行时和链接器。
- [示例](/zh/examples/)——从 hello world 到壁纸切换器。

## 原生平台

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — 原生平台](/reference/native-platforms). `darwin-arm64`: not enabled yet.
