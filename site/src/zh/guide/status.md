# 状态与路线图

## 当前版本

**v0.8.0**——参见[更新日志](/changelog)（英文）。Nona 仍处于实验阶段：它没有经过安全审计，也不能直接替代 Node.js。

## Test262 审计

Windows x64 上固定版本 Test262 的完整运行（`scripts/test262-audit.ps1 -Unit`，ES2020 及更早的特性）：

| 目录 | 通过 / 适用 | 剩余失败 |
| --- | --- | --- |
| `language/` | **22436 / 22492**（跳过 26 个） | 44 个 `eval`，1 个新语义，11 个其他 |
| `built-ins/` | **15868 / 15933** | 16 个 `eval`，12 个新语义，37 个其他 |
| `built-ins/Atomics`（代理） | **268 / 268** | — |
| `annexB/` | **996 / 1016**（跳过 8 个） | 20 个 `eval` |

分类由 `scripts/test262-summary.mjs` 完成：“`eval`”类测试以 Nona 在编译时无法得知的源码调用 `eval` 或 `$262.evalScript`；“新语义”类测试在旧的或缺失的特性标签下检查更新版本中的行为（`v` 标志、数字分隔符、`Promise.any` 等）。单元测试集在 CI 中于 Windows 和 Linux 上运行，编译并执行真实的 PE 和 ELF 文件，其中很多在 GC 压力模式下运行。审计的运行方法见 [Test262](/zh/reference/test262) 页面。

## 剩余失败

Windows 上所有“其他”类失败都已分类：

- `built-ins/Function`（25 个）：函数源码在运行时来自对象的 `toString`——属于 `eval` 例外。
- `AsyncFunction`、`AsyncGeneratorFunction` 和 `GeneratorFunction` 的 `is-a-constructor`（4 个）：Test262 测试框架在运行时构造源码。
- 其他 realm（7 个）：来自另一个 realm 的默认原型（[#7](https://github.com/40oleg/nona/issues/7)）。
- 不可扩展对象上的私有类字段（2 个）：没有新特性标签的 ES2022 私有字段。

## 待办工作

- [#11](https://github.com/40oleg/nona/issues/11)——源码在运行时计算的 `eval` 和 `Function`。
- [#7](https://github.com/40oleg/nona/issues/7)——前导代码构造器从其他 realm 获取默认原型。
- [#13](https://github.com/40oleg/nona/issues/13)、[#36](https://github.com/40oleg/nona/issues/36)——稠密数组元素以及 `Map`/`Set` 的哈希表。

完整列表见 [GitHub](https://github.com/40oleg/nona/issues)。

## 详细报告

- [0.17–0.20 的 ES2020 状态](https://github.com/40oleg/nona/blob/main/docs/v0.17-v0.20-status.md)（俄文）
- [v0.6 状态](https://github.com/40oleg/nona/blob/main/docs/v0.6-status.md)（英文）
- [路线图：参考 V8 的计划与目标架构（英文）](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [0.4–0.20 版本路线图](https://github.com/40oleg/nona/blob/main/docs/release-roadmap-0.4-0.20.md)（俄文）
