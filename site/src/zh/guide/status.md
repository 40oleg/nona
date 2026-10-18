# 状态与路线图

## 当前版本

**v0.18.0**——参见[更新日志](/changelog)（英文）。Nona 仍处于实验阶段：它没有经过安全审计，也不能直接替代 Node.js。

## Test262 审计

最近一次完整的固定版本 Test262 审计，在 Windows x64 上针对 v0.8.0（`scripts/test262-audit.ps1 -Unit`，ES2020 及更早的特性，加上已支持的更新特性，例如 ES2022 类元素）：

| 目录                        | 通过 / 适用                     | 剩余失败                             |
| --------------------------- | ------------------------------- | ------------------------------------ |
| `language/`                 | **22436 / 22492**（跳过 26 个） | 44 个 `eval`，1 个新语义，11 个其他  |
| `built-ins/`                | **15868 / 15933**               | 16 个 `eval`，12 个新语义，37 个其他 |
| `built-ins/Atomics`（代理） | **268 / 268**                   | —                                    |
| `annexB/`                   | **996 / 1016**（跳过 8 个）     | 20 个 `eval`                         |

分类由 `scripts/test262-summary.mjs` 完成：“`eval`”类测试以 Nona 在编译时无法得知的源码调用 `eval` 或 `$262.evalScript`；“新语义”类测试在旧的或缺失的特性标签下检查更新版本中的行为（`v` 标志、数字分隔符、`Promise.any` 等）。单元测试集在 CI 中于 Windows 和 Linux 上运行，编译并执行真实的 PE 和 ELF 文件，其中很多在 GC 压力模式下运行。审计的运行方法见 [Test262](/zh/reference/test262) 页面。

## 复制式数组方法

在审计之后，针对固定版本的 Test262 （Windows x64，[#308](https://github.com/40oleg/nona/issues/308)）进行了检查：`built-ins/Array/prototype/{toSorted,toReversed,toSpliced,with}` 和 `Symbol.unscopables` 通过 94/94，没有剩余失败。未实现 `%TypedArray%` 变体；参见 [Test262 基线](https://github.com/40oleg/nona/blob/main/docs/test262.md)（英文）。

## 剩余失败

以下是 v0.8.0 审计的失败项；之后的版本没有重复完整运行。Windows 上所有“其他”类失败都已分类：

- `built-ins/Function`（26 个）：函数源码在运行时来自对象的 `toString`——属于 `eval` 例外。
- `AsyncFunction`、`AsyncGeneratorFunction` 和 `GeneratorFunction` 的 `is-a-constructor`，以及 async 箭头函数的 `prototype` 测试（4 个）：Test262 测试框架在运行时构造源码。
- 其他 realm（8 个）：来自另一个 realm 的默认原型（[#7](https://github.com/40oleg/nona/issues/7)，已在审计之后关闭）。
- 通过 `Function` 创建的类，包括在另一个 realm 中创建的（10 个，`language/expressions/class`）：源码在运行时构造。通过 `eval` 别名运行的相同测试计为 `eval` 失败。

v0.8.0 的审计还发现了七个崩溃（对带元素的 `Math` 调用 `Array.prototype.indexOf`，以及类型化数组的继承键和自有键），它们是随稠密元素引入的；已在 [#119](https://github.com/40oleg/nona/issues/119) 中修复，修复后重新运行 `built-ins/Array` 和 `built-ins/TypedArrayConstructors`（已计入上表）均已通过。

## 待办工作

语言和库方面的缺口：

- [#11](https://github.com/40oleg/nona/issues/11)——源码在运行时计算的 `eval` 和 `Function`。
- [#44](https://github.com/40oleg/nona/issues/44)——Promise 反应：专用的 promise 类型，以及每个 `then` 对应一条记录。

性能，[路线图](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)的主线：

- 调用与分配：[#47](https://github.com/40oleg/nona/issues/47)（调用开销）、[#48](https://github.com/40oleg/nona/issues/48)（短生命周期对象）、[#235](https://github.com/40oleg/nona/issues/235)（内联）、[#236](https://github.com/40oleg/nona/issues/236)（标量替换）。
- 生成的代码：[#237](https://github.com/40oleg/nona/issues/237)–[#242](https://github.com/40oleg/nona/issues/242)（可选链、`%`、直接调用、类型化数组循环、`switch` 跳转表、暂时性死区检查）。
- 库：[#155](https://github.com/40oleg/nona/issues/155)（`JSON.stringify`）、[#258](https://github.com/40oleg/nona/issues/258)（RegExp 起始位置扫描）、[#262](https://github.com/40oleg/nona/issues/262)（大数组上的 `shift` 和 `splice`）。

完整列表见 [GitHub](https://github.com/40oleg/nona/issues)。

## 详细报告

- [0.17–0.20 的 ES2020 状态](https://github.com/40oleg/nona/blob/main/docs/status.md)（俄文）
- [发布历史](/changelog)和[开发日志](https://github.com/40oleg/nona/blob/main/docs/history/development-log.md)（俄文）
- [路线图：参考 V8 的计划与目标架构（英文）](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [0.4–0.20 版本路线图](https://github.com/40oleg/nona/blob/main/docs/history/release-roadmap-0.4-0.20.md)（俄文）
