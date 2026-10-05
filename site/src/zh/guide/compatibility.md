# 兼容性与限制

## 范围

Nona 面向规范性的 ECMA-262 第 11 版（2020 年 6 月）的语言和内置对象，适用于脚本和 ES 模块。ECMA-402 国际化、浏览器 API 和 Node.js API 属于其他规范；Nona 只提供[参考](/zh/reference/modules)中列出的宿主 API。完成度约定记录在 [`docs/es2020-contract.md`](https://github.com/40oleg/nona/blob/main/docs/es2020-contract.md) 中。

每个版本都被描述为“ES2020，例外情况均有文档说明”，从不声称完全符合 ES2020。

## `eval` 和 `Function` {#eval-and-function}

Nona 是提前编译的，因此 `eval` 和动态函数构造器需要在编译时拿到源码：

- **提前编译：** 字符串字面量、字面量的拼接，或只被赋值为此类常量的变量（运行时会比较其值）。直接 `eval` 能看到调用方的作用域、`this`、`arguments`、`new.target` 和 `super`；间接形式（`(0, eval)(…)`、`globalThis.eval(…)`、`eval?.(…)`）在全局作用域中运行。所有参数都是字面量的 `Function`、`GeneratorFunction`、`AsyncFunction` 和 `AsyncGeneratorFunction` 调用会按 CreateDynamicFunction 语义编译。
- **不支持：** 运行时计算出的源码、传给 `eval` 的展开参数以及 `$262.evalScript`。它们会抛出：

```text
EvalError: Nona compiles ahead of time: eval and Function need source text known at compile time
```

运行时源码的支持在 [#11](https://github.com/40oleg/nona/issues/11) 中跟踪。

## 与 Node.js 的差异

| 领域 | Nona | Node.js |
| --- | --- | --- |
| `process.argv` | `[execPath, ...arguments]`：`argv[1]` 是第一个参数 | `[node, script, ...arguments]` |
| `process` | `argv`、`env`、`exit`、`exitCode`、`execPath`、`cwd`、`platform`、`arch`、`pid` | 带有流、`nextTick`、`hrtime` 等的 EventEmitter |
| 定时器 id | 数字 | `Timeout` 对象 |
| `readFileSync(path)` | 返回 `Uint8Array` | 返回 `Buffer` |
| 编码 | 仅 `utf8` | 多种 |
| Windows 上的错误消息 | 包含原样传入的路径 | 包含绝对路径 |
| 模块 | `nona:*`、`node:fs`、`node:process` 和相对路径文件 | 全部 `node:*` 模块和 npm 包 |
| `require`、`Buffer`、`node:path` | 不可用 | 可用 |
| 没有标准输出时的 `console.log` | 输出被丢弃 | 输出被丢弃或抛出错误 |

## 性能

- 数组和 `Map`/`Set` 把元素存放在链式结构中；超大集合比 V8 慢（[#13](https://github.com/40oleg/nona/issues/13)、[#36](https://github.com/40oleg/nona/issues/36)）。
- RegExp 引擎是用 JavaScript 编写的回溯虚拟机。不含反向引用和环视、回溯过多的模式（未使用 `u` 标志时）改由线性时间引擎完成匹配。
- 在 Windows 上，定时器按系统时钟节拍唤醒（通常为 15.6 ms）。
- 没有 JIT：代码只在事先编译一次，没有基于性能剖析的优化。

## Realm

`$262.createRealm` 为 Test262 提供支持。用 JavaScript 前导代码实现的部分构造器，在以另一个 realm 的 `new.target` 调用时，仍会从错误的 realm 获取默认原型（[#7](https://github.com/40oleg/nona/issues/7)）。

## 平台

- 目标平台：仅 Windows 10/11 x64 和 Linux x86-64。
- Windows 可执行文件只导入 `KERNEL32.dll`、`KERNELBASE.dll` 和通过 FFI 声明的 DLL；Linux 可执行文件是静态的，直接使用系统调用。
- 调用 DLL 的 FFI 仅限 Windows；原始系统调用仅限 Linux。

## 原生平台

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — 原生平台](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.
