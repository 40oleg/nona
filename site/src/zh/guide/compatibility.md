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

| 领域                           | Nona                                                                                                   | Node.js                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `process.argv`                 | `[execPath, ...arguments]`：`argv[1]` 是第一个参数                                                     | `[node, script, ...arguments]`                     |
| `process`                      | 通用元数据、环境变量修改、时钟/tick、标准 I/O、生命周期/警告、CPU/资源以及原生进程控制（全部八个目标） | 信号处理器、IPC、V8 堆报告、完整的异步流和终端控制 |
| 定时器 id                      | 数字                                                                                                   | `Timeout` 对象                                     |
| `readFileSync(path)`           | 返回 `Uint8Array`（不带编码时）                                                                        | 返回 `Buffer`                                      |
| 编码                           | 仅 `utf8`（fs）；仅 UTF-8、UTF-16LE、Latin-1、ASCII、hex、base64/base64url（Buffer）                   | 多种                                               |
| Windows 上的错误消息           | 包含原样传入的路径                                                                                     | 包含绝对路径                                       |
| 模块                           | `nona:*`、[内置模块](/zh/reference/modules)中列出的 `node:*` 模块，以及在构建时解析的文件和 npm 包     | 全部 `node:*` 模块和 npm 包，在运行时解析          |
| `require`                      | CommonJS 模块，说明符须为构建时已知的字面量（[npm 包](/reference/npm)）                                | 运行时的任意说明符                                 |
| 没有标准输出时的 `console.log` | 输出被丢弃                                                                                             | 输出被丢弃或抛出错误                               |

## 性能

- 数组、对象和 `Map`/`Set` 使用密集存储和哈希存储，并带有形状（shape）和内联缓存，但调用、闭包和内存分配仍比 V8 慢数倍；[性能](/zh/guide/performance)列出了慢的地方。
- RegExp 引擎是用 JavaScript 编写的回溯虚拟机。不含反向引用和环视、回溯过多的模式（未使用 `u` 标志时）改由线性时间引擎完成匹配。
- 在 Windows 上，定时器按系统时钟节拍唤醒（通常为 15.6 ms）。
- 没有 JIT：代码只在事先编译一次，没有基于性能剖析的优化。

## 链接的运行时部件

每个可执行文件都包含运行时，但其中较大的可选部件只有在程序可能用到时才会被链接。编译器根据它编译的每个源文件的文本来判断：程序本身、它的模块以及编译期的 `eval`/`Function` 源码：

| 部件                              | 大小      | 当源码包含以下内容时链接                                                                                          |
| --------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| RegExp 引擎                       | 约 1 MB   | RegExp 字面量，或名称 `RegExp`、`match`、`matchAll`、`search`（作为标识符、属性名，或出现在字符串或模板字面量中） |
| `\p{…}`/`\P{…}` 的 Unicode 属性表 | 约 2 MB   | RegExp 字面量或字符串中的 `\p{` 或 `\P{`，或上述名称之一（模式可能在运行时构造）                                  |
| Unicode 规范化表                  | 约 0.7 MB | 名称 `normalize` 或 `localeCompare`                                                                               |

带字符串参数的 `split`、`replace` 和 `replaceAll` 不需要 RegExp 引擎。

只安装全局对象或方法的 JavaScript 内置库（合计约 0.7 MB）以同样的方式链接，即当源码中包含它们的名称时：

| 部件                                                                                                                                                 | 名称                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Proxy`                                                                                                                                              | `Proxy`                                                                                                                                       |
| `TextEncoder`、`TextDecoder`                                                                                                                         | `TextEncoder`、`TextDecoder`（与 `process` 一起时也会链接）                                                                                   |
| `process`                                                                                                                                            | `process`                                                                                                                                     |
| 定时器、事件循环、`queueMicrotask` 和 `performance`                                                                                                  | `setTimeout`、`setInterval`、`setImmediate`、`clearTimeout`、`clearInterval`、`clearImmediate`、`queueMicrotask`、`performance`、`globalThis` |
| `.at()`、`findLast`、`findLastIndex`、`Object.hasOwn`、`AggregateError`、`Promise.any`                                                               | `at`、`findLast`、`findLastIndex`、`hasOwn`、`AggregateError`、`any`、`unscopables`                                                           |
| Annex B 的 `escape`、`unescape`、`substr`、`setYear`、`toGMTString`、`RegExp.prototype.compile` 以及字符串的 HTML 方法（`anchor`、`big`、`link` 等） | 同名                                                                                                                                          |
| 稳定的归并排序 `Array.prototype.sort`                                                                                                                | `sort`                                                                                                                                        |
| 通过 Proxy 陷阱实现的 `Object.freeze`、`seal`、`isFrozen`、`isSealed`（对普通对象则使用原生版本）                                                    | 同名                                                                                                                                          |
| `__defineGetter__`、`__defineSetter__`、`__lookupGetter__`、`__lookupSetter__`                                                                       | 同名                                                                                                                                          |
| `ArrayBuffer`、`SharedArrayBuffer`、`DataView` 和类型化数组的二进制数据方法（`slice`、`subarray`、`sort` 等）                                        | 它们的构造器名称、`Atomics`、`TypedArray`（也随 `process`、`Buffer` 和 `TextEncoder` 链接）                                                   |
| RegExp 与 String 协议方法（`Symbol.replace`、`String.prototype.match`、`matchAll`、`search`、`replaceAll` 等）                                       | 随 RegExp 引擎链接，或出现 `replaceAll` 时                                                                                                    |

调用 `Object.getOwnPropertyNames`、`Object.getOwnPropertyDescriptors` 或 `Reflect.ownKeys` 的程序会链接所有这些部件，因为它可能列出内置对象（[#84](https://github.com/40oleg/nona/issues/84)）。hello world 约为 1.1 MB；链接全部部件时为 7 MB。

只有部分语法需要的辅助函数在编译后的程序调用它们时链接，而不是按名称：`with` 语句、字面量 `eval`、类字段与私有名称，以及带 `import()` 和 `import.meta` 的 ES 模块（[#278](https://github.com/40oleg/nona/issues/278)）。

程序仍可能通过运行时计算出的名称（例如 `globalThis['Reg' + 'Exp']`）访问被省略的部件。对于 RegExp 引擎和 Unicode 表，这样的调用会抛出 `Error`，其消息指出缺少的部件；被省略的全局对象或方法则直接不存在。使用 `--full-runtime`（或 [`compile()`](/reference/api) 的 `fullRuntime` 选项）编译即可链接所有部件（[#62](https://github.com/40oleg/nona/issues/62)）。 使用 `--link 部件,...` 可单独添加部件，`--print-link` 会列出已链接的内容以及选中每个部件的名称（[#182](https://github.com/40oleg/nona/issues/182)）。

## Realms

`$262.createRealm` 为 Test262 提供支持。通过另一个 realm 的 `Function`、`eval` 或动态函数构造器以字面量源码创建的函数、类和 eval 代码在该 realm 中运行，默认原型和构造器错误来自 ECMA-262 所规定的 realm（[#7](https://github.com/40oleg/nona/issues/7), [#176](https://github.com/40oleg/nona/issues/176)）。

## 平台

- `process` 和 `node:fs` 在全部八个目标上可用；HTTP 和 TCP（`node:http`、`node:net`）在 Windows 和 Linux 上可用。
- Windows 可执行文件使用操作系统 DLL（包括用于获取父进程元数据的 NTDLL）和已声明的 FFI 导入；POSIX 可执行文件使用原生操作系统服务。
- 调用 DLL 的 FFI 仅限 Windows；原始系统调用使用所选 Linux、Darwin 或 BSD 目标的内核调用号。详见：[原生平台](/reference/native-platforms)。

## Buffer

全局 `Buffer`、`Blob` 和 `File`，以及 `node:buffer` / `buffer` / `nona:buffer` 的导入，在每个原生目标上都可用。Buffer 支持标准字节编码、共享切片、复制、搜索和数值读写。Blob/File 支持不可变数据和元数据。Blob 的字节流和文本流以及对象 URL 的注册均可用；参见[API 约定与限制](/reference/host-apis#buffer-and-binary-data)。
