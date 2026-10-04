# 语言支持

Nona 以 ECMA-262 第 11 版（ES2020）为目标，例外情况均有文档说明。本页概述 **v0.8.0** 支持的内容；数据来自 [Test262](/zh/reference/test262) 页面所述的固定 Test262 版本。

**支持**表示已实现，并在“说明”列所述的范围内由单元测试和 Test262 覆盖。带测试名称的详细特性矩阵见 [`docs/language-support.md`](https://github.com/40oleg/nona/blob/main/docs/language-support.md)（俄文）。

## 语言

| 领域 | 状态 | 说明 |
| --- | --- | --- |
| 词法语法和字面量 | 支持 | 十进制、十六进制、二进制、八进制和 BigInt 字面量，标识符和字符串中的 Unicode 转义，模板字面量。非严格脚本中的 Annex B 旧式八进制和类 HTML 注释。数字分隔符（ES2021）会被拒绝。 |
| `var`、`let`、`const`、TDZ | 支持 | 提升、块级作用域、每次迭代的独立绑定，声明冲突作为早期错误。 |
| 函数 | 支持 | 声明和表达式、闭包、`arguments`（映射和非映射）、默认参数和剩余参数、解构参数、`this`、`new.target`、返回精确源码的 `Function.prototype.toString`。 |
| 箭头函数 | 支持 | 词法 `this`、`arguments`、`new.target` 和 `super`；`async` 箭头函数。 |
| 类 | 支持 | 声明和表达式、构造函数、实例和静态方法及访问器、计算属性名、继承（包括继承内置对象和 `extends null`）、`super()` 和 `super.x`。不支持类字段和私有名称（ES2022）。 |
| 解构、展开 | 支持 | 声明、赋值、参数、`for-in`/`for-of` 目标；数组、对象、调用和 `new` 中的展开。 |
| 迭代器和生成器 | 支持 | 迭代器协议、`for-of`、生成器函数和方法、`yield*`、`return`/`throw`。 |
| 异步函数 | 支持 | 异步函数、箭头函数和方法、`await`、异步生成器和 `for await`，任务顺序符合 ES2020。 |
| 运算符 | 支持 | 包括 `**`、可选链、`??`、`delete`、`in`、带 `Symbol.hasInstance` 的 `instanceof`、BigInt 算术和比较。 |
| 控制流 | 支持 | 所有语句、标签、带完成值的 `try`/`catch`/`finally`、`switch`、`debugger`（空操作）。 |
| 严格模式 | 支持 | 指令序言、严格模式的 `this`、早期错误和运行时限制。 |
| `with` | 支持 | 仅限非严格脚本，支持 `Symbol.unscopables`。 |
| 尾调用优化 | 支持 | 在严格模式代码中。 |
| 模块 | 支持 | 各种形式的 `import`/`export`、循环依赖、实时绑定、命名空间对象、`import.meta`、对编译时已知模块的 `import()`。不支持顶层 `await`（ES2022）。 |
| `eval`、`Function` | 部分支持 | 编译时已知的源码会被提前编译，并完整支持直接和间接 `eval` 的语义；运行时计算出的源码会抛出 `EvalError`。参见[兼容性](/zh/guide/compatibility#eval-and-function)。 |
| Annex B | 支持 | 块内函数、`__proto__`、旧式 RegExp 语法、`escape`/`unescape`、String 的 HTML 方法等 Web 兼容语义。 |

## 内置对象

| 领域 | 状态 | 说明 |
| --- | --- | --- |
| Object、Function、Boolean、Symbol、Error | 支持 | 包括属性描述符、完整性操作以及全局和知名（well-known）Symbol。 |
| Number、Math、URI 函数 | 支持 | 最短往返数字格式化、`toFixed`/`toExponential`/`toPrecision`、ES2020 的全部 `Math` 函数。 |
| String | 支持 | ES2020 方法、Unicode 规范化、不带 ECMA-402 区域数据的 `localeCompare`。 |
| RegExp | 支持 | 命名分组、后行断言、`s`、`u`、`y` 和 `g` 标志、Unicode 属性转义、`matchAll`。引擎是以前导代码形式编写的回溯虚拟机，比 V8 慢。 |
| Array | 支持 | ES2020 的全部方法、species、空位和超大长度。 |
| Date、JSON | 支持 | UTC 和本地时间的日期解析与格式化、带 reviver 的 `JSON.parse`、带 replacer 和缩进的 `JSON.stringify`。 |
| Map、Set、WeakMap、WeakSet | 支持 | 弱集合采用 ephemeron 语义。 |
| ArrayBuffer、DataView、类型化数组 | 支持 | 全部 11 种类型化数组（包括 BigInt 数组）、分离（detach）、species。 |
| SharedArrayBuffer、Atomics | 支持 | 包括配合工作线程代理（agent）使用的 `Atomics.wait`/`notify`（供 Test262 使用）。 |
| Proxy、Reflect | 支持 | 所有陷阱和不变式。 |
| Promise | 支持 | `all`、`allSettled`、`race`、`finally`、thenable 以及未处理拒绝的报告。 |
| `globalThis`、`console.log` | 支持 | `console.log` 以 UTF-8 写入标准输出。 |

## ES2020 之后的特性

不支持更新版本中的特性：类字段和私有名称、静态块、`Promise.any`、`WeakRef` 和 `FinalizationRegistry`、逻辑赋值运算符、数字分隔符、RegExp 的 `v` 标志、顶层 `await` 以及 `Array.prototype.at`。少数后来加入的库函数可用，例如 `String.prototype.replaceAll`。当固定的 Test262 版本已经对 ES2020 特性检查更新的语义时，Nona 遵循 Test262；[Test262](/zh/reference/test262#semantics-newer-than-es2020-in-the-pinned-test262) 页面列出了这些情况。

不属于 ECMAScript 的宿主 API——定时器、`process`、`node:fs`、`TextEncoder`/`TextDecoder` 和 FFI——在[参考](/zh/reference/modules)中说明。

## Test262 结果

Windows x64 上固定版本 Test262 的完整运行结果（ES2020 及更早的特性）：

| 目录 | 通过 / 适用 | 剩余失败 |
| --- | --- | --- |
| `language/` | 22436 / 22492 | 44 个 `eval`，1 个新语义，11 个其他 |
| `built-ins/` | 15868 / 15933 | 16 个 `eval`，12 个新语义，37 个其他 |
| `built-ins/Atomics`（代理） | 268 / 268 | — |
| `annexB/` | 996 / 1016 | 20 个 `eval` |

“`eval`”类失败使用运行时计算出的源码、`$262.evalScript` 或其他 realm；“新语义”类测试在旧的或缺失的特性标签下检查更新版本中的行为。[状态页面](/zh/guide/status)列出了剩余的失败。
