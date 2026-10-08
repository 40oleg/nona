# Test262 基线

::: info 翻译说明
本页译自英文页面 [Test262 baseline](/reference/test262)，其内容来自 [`docs/test262.md`](https://github.com/40oleg/nona/blob/main/docs/test262.md)。英文版为准，且可能更新。
:::

运行器使用上游 Test262 的版本 `7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd`。它有意不把 Test262 纳入本仓库。在 Windows x64 上：

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/tc39/test262.git work/test262
git -C work/test262 sparse-checkout set harness test/language/expressions/coalesce test/language/expressions/arrow-function test/language/expressions/array test/language/expressions/call test/language/expressions/new test/language/expressions/template-literal test/language/rest-parameters test/language/statements/function test/language/statements/for-in test/language/statements/for-of test/built-ins/Symbol test/built-ins/Array/prototype/includes test/built-ins/Array/prototype/pop test/built-ins/Math/pow test/built-ins/Math/min test/built-ins/Math/max test/built-ins/Math/abs test/built-ins/Math/sign test/built-ins/Math/sqrt test/built-ins/Math/trunc test/built-ins/Math/floor test/built-ins/Math/ceil test/built-ins/Math/round test/built-ins/String/prototype/includes test/built-ins/Number/isFinite test/built-ins/Number/isInteger test/built-ins/Number/isNaN test/built-ins/Number/isSafeInteger
git -C work/test262 rev-parse HEAD
git -C work/test262 sparse-checkout add test/built-ins/Math/imul test/built-ins/Math/clz32
npm ci
npm run test262:smoke
node scripts/test262-smoke.mjs language/expressions/coalesce
```

同一个运行器也可以在 Linux x64 上工作：此时它编译 `linux-x64` ELF 映像而不是 PE 文件，并会重试 Linux 上工作线程可能引起的短暂 `ETXTBSY` exec 竞争。设置 `TEST262_DELETE_BINARIES=1` 可以在每个编译出的测试映像运行后将其删除；否则大型目录会在 `work/test262-smoke` 中留下数 GB 的文件。

检出必须位于固定的版本。如果上游 HEAD 已经前进，请在运行前 fetch/checkout 那个确切的提交。`TEST262_ROOT` 选择另一个检出，`TEST262_REPORT` 选择另一个 JSON 报告路径。`TEST262_JOBS` 最多并行运行八个工作线程（默认一个），并保持报告顺序。例如，在运行大型目录之前设置 `TEST262_JOBS=4`。`TEST262_PATH_FILTER` 包含匹配的路径；`TEST262_EXCLUDE_PATH_FILTER` 排除匹配的路径。两者都是字面子串过滤器。不带参数的命令运行经过审核的清单 `tests/test262-smoke.json`；以相对目录为参数时，会运行该 Test262 分组下的所有 `.js` 文件。报告区分编译失败、运行时失败和跳过。

## 完整审计

`scripts/test262-audit.ps1`（Windows）和 `scripts/test262-audit.sh`（Linux）以 `TEST262_EXCLUDE_FEATURES=post-es2020` 运行 `language/`、`annexB/` 和 `built-ins/` 下的每个 Test262 目录，每个目录在 `work/test262-audit` 中生成一份报告（可断点续跑）。`-Dirs 'a,b' -Tag r1`（PowerShell）或 `TAG=r1 scripts/test262-audit.sh <out> a b` 把选定目录重新运行到一个子目录中，其结果会覆盖完整运行的结果。汇总和分类：

```
node scripts/test262-summary.mjs work/test262-audit --others work/others.txt
node scripts/test262-summary.mjs work/test262-audit --compare work/previous-audit
```

汇总把每个失败归类为 `eval`（测试使用 eval；由于支持编译时 eval 源码，这些大多是运行时源码、`$262.evalScript` 或其他 realm）、`post`（在旧的或缺失的特性标签下的 ES2020 之后语义）或 `other`，并列出 `other` 文件（`--evals <file>` 列出 eval 类文件）。`TEST262_FILE_LIST=<file>` 把 `scripts/test262-smoke.mjs <group>` 的运行限制在列出的路径上，例如用于重新运行这样的列表。没有 git 元数据的检出（例如复制到另一台机器上的检出）只要 `work/test262/.nona-test262-revision` 包含固定提交的哈希值即可被接受；此时行终止符测试会直接读取文件。

## 固定版本 Test262 中比 ES2020 更新的语义 {#semantics-newer-than-es2020-in-the-pinned-test262}

固定版本的 Test262（2026）有时会断言 ES2020 之后引入的行为，却没有 ES2020 之后的特性标签。策略（issue #17）：如果更新的版本只是去掉了程序不依赖的、可观察的 ES2020 怪异行为，Nona 遵循固定版本的 Test262；其他一切保持 ES2020 行为，并由 `scripts/test262-summary.mjs` 归类为 `post`，或列为已知偏差。遵循 Test262 的情况：

- TypedArray 的 `[[Set]]`、`[[GetOwnProperty]]` 和 `[[DefineOwnProperty]]`（ES2021/ES2022）：先转换值；随后若索引无效或缓冲区已分离，则忽略写入并报告成功；已分离的缓冲区没有自有元素；当 Receiver 不是该 TypedArray 时，无效索引不产生任何效果，有效索引则对 Receiver 执行 OrdinarySet。
- `String.prototype.{replace,split,match,matchAll,search}` 不会在原始值参数上查找以 Symbol 为键的方法（ES2025）。
- Annex B 中以调用表达式作为赋值目标时，在非严格代码中于运行时抛出 ReferenceError，在严格代码中是早期错误（ES2022 的 Web 现实）。

保持 ES2020 行为（失败归类为 `post`）：类字段和私有方法、数字分隔符、逻辑赋值、`Promise.any`/`AggregateError`、`Error.prototype.stack`/`cause`、RegExp 的 `v` 标志和匹配索引、顶层 await，以及 `postEs2020Features` 中的其他特性。剩余的已知偏差按目录列在 `docs/history/pr5-es2020-remaining-work.md` 和版本状态中。

为 ES2020 关卡添加的运行器功能（2026-09）：

- `TEST262_TARGET=linux-x64`（Linux 上的默认值）链接 ELF 映像；模块测试（`flags: [module]`）编译为模块图，测试框架作为经典脚本前导代码；解析失败的负向模块测试期望出现编译错误。
- `TEST262_EXCLUDE_FEATURES=post-es2020` 展开为 ES2020 之后引入的特性标签列表（见脚本中的 `postEs2020Features`），外加 `error-stack-accessor` 和非标准的 `caller` 扩展。
- 当测试提到 `$262.createRealm` 时会把它编译进去（最多三个 realm）；`$262.agent` 程序从静态模板中提取（循环计数器、顶层常量和 `$262.agent.timeouts` 会被折叠），并作为代理线程编译进映像。`CanBlockIsFalse` 测试会被跳过，因为主代理可以阻塞。
- 计算形式的 `import()` 说明符可以加载测试源码中提到的 `_FIXTURE.js` 文件（`ModuleHost.candidates`）。
- 编译器异常会被报告为该文件的失败（`phase: compiler-crash`），而不会中止整个运行。

这是一个**基线适配器**，而不是完整的 Test262 测试框架：原始（raw）测试和运行时负向测试目前会被跳过并注明原因。当 Nona 以编译器诊断拒绝源码时，解析负向测试即通过；适配器尚未检查诊断类型是否等价。它使用标准的 `sta.js`/`assert.js` 测试框架和声明的 `includes` 运行正向脚本测试。在声称符合规范之前，适配器必须支持所有适用的元数据模式以及严格/非严格两种变体，然后运行所有适用的分组。在这一阶段，仓库中常规的原生测试仍是主要的回归关卡。请按 `package.json` 的要求用 Node 26 运行测试和对照；Node 22 在可观察的函数元数据上有所不同，当测试冻结（seal）其全局对象时可能失败。

2026-09-26 的正向运行时冒烟清单包含默认参数和展开语法的用例；其当前计数记录在开发日志中。在固定版本上，更大范围的原始分组结果为：`built-ins/Symbol` 72 pass / 26 fail，`language/statements/for-in` 85 pass / 34 fail，`language/statements/for-of` 142 pass / 607 fail / 2 skip。这些分组包含已实现子集之外的用例以及 ES2020 之后添加的用例；原始计数仅供诊断，不是 ES2020 符合率。`built-ins/Array/prototype/includes` 为 26 pass / 4 fail / 0 skip；失败的用例使用了 Proxy 或可调整大小的 ArrayBuffer。添加 ES2020 的 Math 常量后，`built-ins/Math/pow` 为 28 pass / 0 fail / 0 skip。`built-ins/Math/min` 和 `built-ins/Math/max` 各为 10 pass / 0 fail / 0 skip，包括对每个参数的转换和带符号零的排序。`built-ins/String/prototype/includes` 为 25 pass / 2 fail / 0 skip；失败的用例包含尚不支持的 RegExp 字面量。`built-ins/String/prototype/padStart` 和 `padEnd` 各为 13 pass / 0 fail / 0 skip，包括转换顺序和描述符检查。`built-ins/String/prototype/indexOf` 为 44 pass / 3 fail / 0 skip；剩余用例依赖 `eval` 或 BigInt。`built-ins/String/prototype/lastIndexOf` 为 25 pass / 0 fail / 0 skip。`built-ins/String/fromCharCode` 为 16 pass / 1 fail / 0 skip；剩余用例需要 BigInt。添加全局 `isNaN` 后，`built-ins/Array/prototype/indexOf` 为 193 pass / 8 fail / 0 skip，`lastIndexOf` 为 189 pass / 9 fail / 0 skip。剩余用例使用了 Date、RegExp、JSON、Proxy、可调整大小的缓冲区/类型化数组或 `eval`。全局 `isFinite` 为 15 pass / 0 fail / 0 skip。全局 `isNaN` 为 14 pass / 1 fail / 0 skip；剩余用例在其测试框架代码中使用了 `Array.prototype.forEach`。添加 ES2020 的 Number 常量后，`built-ins/Array/prototype/pop` 为 23 pass / 0 fail / 0 skip。`Number.isFinite/isInteger/isNaN/isSafeInteger` 四个分组分别通过 8/9/7/10 个，没有失败或跳过。支持解构参数和类方法后，`language/rest-parameters` 为 11 pass / 0 fail / 0 skip。支持默认参数后，`language/expressions/arrow-function` 为 147 pass / 196 fail / 0 skip；该分组中的 9 个 `dflt-params` 用例全部通过。支持数组和对象字面量展开后，`language/expressions/array` 为 50 pass / 2 fail / 0 skip。剩下的两个用例需要生成器。支持调用和构造中的展开后，`language/expressions/call` 为 72 pass / 20 fail / 0 skip，`language/expressions/new` 为 54 pass / 5 fail / 0 skip。在 `spread-*` 用例中，每个分组只有两个因需要生成器而无法编译。分组中的其他失败涉及与此无关的不支持特性，包括 `eval`。`Math.abs/sign/sqrt/trunc/floor/ceil/round` 分组分别通过 8/5/10/12/11/11/11 个测试，没有失败或跳过。`Math.imul` 和 `Math.clz32` 分组分别通过 5/5 和 10/10。支持数组和对象绑定模式后，三个声明分组 `language/statements/variable/dstr`、`let/dstr` 和 `const/dstr` 分别通过 79/97、77/93 和 77/93 个用例。剩余的每个用例都因使用生成器或类而无法编译。这些是选定的 Test262 分组，不是 ES2020 符合率。`language/destructuring/binding/syntax` 为 12 pass / 2 fail；剩下的两个用例都需要生成器和 async 语法。`language/expressions/assignment/dstr` 为 323 pass / 45 个编译失败 / 0 个运行时失败；这些编译失败需要生成器或类。选定的类分组 `language/statements/class/method` 和 `method-static` 各通过 20/20。`language/statements/class/definition` 为 46 pass / 17 个编译失败 / 2 skip；剩余用例需要当前类子集之外的语法，包括生成器和 async 方法。

2026-09-25，`language/expressions/coalesce` 分组的结果为 21 pass、3 fail、0 skip。一个失败需要尚未实现的 `Symbol` 类型；两个在严格代码中测试尾调用并导致原生栈溢出。四个解析负向用例因编译器拒绝而通过。这些是已跟踪的缺失能力，并不说明 `??` 本身普遍有问题。

2026-09-26，完整的固定版本 `built-ins/parseInt` 和 `built-ins/parseFloat` 分组分别通过 55/55 和 54/54。最初完整运行 `built-ins/Array` 的结果是 3082 个中 2632 pass、360 fail、90 skip；全部 90 个跳过都是 `Array.fromAsync` 测试（ES2020 之后的 API）；这次运行暴露了一个迭代器完成相关的缺陷和五个稀疏数组超时，均已修复。重复的完整 Array 运行为 2640 pass、352 fail、90 skip。每个剩余失败的前置条件都记录在 [v0.4 延期列表](https://github.com/40oleg/nona/blob/main/docs/history/v0.4-array-deferred.json)中：150 个 ES2020 之后的 API 用例、72 个可调整大小缓冲区用例，以及 130 个其他未来依赖或已记录的 `eval` 例外。正向清单通过 100/100。

v0.4.0 之后，完整的 `built-ins/String/fromCodePoint` 分组通过 11/11。其中一个用例保留在固定的冒烟清单中；在那个检查点，清单通过 101/101。

完整的 `built-ins/String/raw` 分组通过 30/30。其带标签模板的用例被纳入固定的正向冒烟清单。更新后的清单通过 102/102；Windows 和 Linux 上的兼容示例各通过 54/54。

完整的 `built-ins/String/prototype/concat` 分组通过 22/22。其中一个用例被纳入正向冒烟清单。更新后的清单通过 103/103；Windows 和 Linux 上的兼容示例各通过 55/55。

`built-ins/String/prototype/toUpperCase` 分组为 24 pass / 2 fail / 0 skip。两个失败需要 `RegExp` 和直接 `eval`，两者都在 v0.5 之外跟踪。Unicode 特殊大小写用例在正向冒烟清单中，现为 104/104。Windows 和 Linux 上的兼容示例各通过 56/56。

`built-ins/String/prototype/toLowerCase` 分组为 28 pass / 2 fail / 0 skip。它的两个失败同样需要 `RegExp` 和直接 `eval`。包括 `Case_Ignorable` 字符在内的词尾 Sigma 条件映射通过。正向冒烟清单为 105/105；兼容示例在 Windows 和 Linux 上为 57/57。

完整的 `built-ins/Number/prototype/toFixed` 分组为 15 pass / 1 fail / 0 skip。失败的用例使用 BigInt，计划在 v0.8 中实现。精确性用例在正向冒烟清单中，现为 106/106；兼容示例在 Windows 和 Linux 上通过 58/58。

完整的 `built-ins/Number/prototype/toExponential` 和 `built-ins/Number/prototype/toPrecision` 分组分别通过 15/15 和 17/17。它们的常规值用例在正向冒烟清单中，现为 108/108。兼容示例在 Windows 和 Linux 上通过 59/59。

在添加三角函数之前，最初完整运行 `built-ins/Math` 的结果是 327 个中 176 pass / 151 fail。大多数失败是缺少 ES2020 的超越函数；`f16round` 和 `sumPrecise` 是更晚的 API。完整的 `Math.sin`、`Math.cos` 和 `Math.tan` 分组现在分别通过 8/8、9/9 和 9/9。正向冒烟为 111/111；兼容示例在 Windows 和 Linux 上通过 60/60。

完整的 `Math.log`、`Math.log2` 和 `Math.log10` 分组分别通过 9/9、5/5 和 5/5。正向冒烟为 114/114；兼容示例在 Windows 和 Linux 上通过 61/61。

完整的 `Math.exp` 和 `Math.expm1` 分组分别通过 9/9 和 5/5。正向冒烟为 116/116；兼容示例在 Windows 和 Linux 上通过 62/62。

完整的 `Math.atan` 和 `Math.atan2` 分组分别通过 7/7 和 11/11。正向冒烟为 118/118；兼容示例在 Windows 和 Linux 上通过 63/63。

完整的 `Math.log1p` 分组通过 5/5。正向冒烟为 119/119；兼容示例在 Windows 和 Linux 上通过 64/64。

完整的 `Math.cbrt` 分组通过 5/5。正向冒烟为 120/120；兼容示例在 Windows 和 Linux 上通过 65/65。

完整的 `Math.asin` 和 `Math.acos` 分组分别通过 9/9 和 8/8。正向冒烟为 122/122；兼容示例在 Windows 和 Linux 上通过 66/66。

完整的 `encodeURI` 和 `encodeURIComponent` 分组各通过 31/31。正向冒烟为 124/124；兼容示例在 Windows 和 Linux 上通过 67/67。

完整的 `decodeURI` 和 `decodeURIComponent` 分组分别通过 55/55 和 56/56。正向冒烟为 126/126；兼容示例在 Windows 和 Linux 上通过 68/68。

完整的 `Math.atanh` 分组通过 5/5。正向冒烟为 127/127；兼容示例在 Windows 和 Linux 上通过 69/69。完成 URI 相关工作后，完整的原生测试运行结果为 1632 个通过、27 个跳过、零个失败。

完整的 `Math.asinh` 和 `Math.acosh` 分组分别通过 5/5 和 7/7。正向冒烟为 129/129；兼容示例在 Windows 和 Linux 上通过 70/70。

完整的 `Math.sinh`、`Math.cosh` 和 `Math.tanh` 分组各通过 5/5。正向冒烟为 132/132；兼容示例在 Windows 和 Linux 上通过 71/71。

完整的 `built-ins/Math` 运行现在为 327 个中 312 个通过、15 个失败。全部 15 个失败都涉及 `Math.f16round` 和 `Math.sumPrecise`，它们晚于 ES2020。这次运行并不衡量超越函数在任意有限输入上的精度。`sin`、`cos` 和 `tan` 的大角度归约是在这次运行之后添加的，并已在所有二进制指数范围内与 Node.js 26 对照验证。

`String.prototype.toLocaleLowerCase` 和 `toLocaleUpperCase` 分别通过 26/28 和 24/26。剩下的四个测试需要 RegExp 或 eval。正向冒烟为 134/134；兼容示例在 Windows 和 Linux 上通过 72/72。超出默认 Unicode 映射的区域特定映射仍有待评估。

`String.prototype.split` 通过 86/120 个 Test262 用例。剩下的 34 个需要 RegExp、BigInt 或 eval。字符串分隔符、限制数量、原始值分隔符和自定义 `Symbol.split` 钩子都已检查。正向冒烟为 137/137；兼容示例在 Windows 和 Linux 上通过 73/73。

大角度的 `Math.sin`、`Math.cos` 和 `Math.tan` 现在使用 1152 位定点的 `2/pi` 表。原生测试通过 48/48，其中包括指数 63–1022 范围内的 80 个确定性有限值。兼容示例在 Windows 和 Linux 上通过 74/74。

`String.prototype.replace` 通过 24/55 个 Test262 用例。剩下的 31 个需要 RegExp、BigInt 或动态函数构造。字符串搜索、函数式替换、替换模式和自定义 `Symbol.replace` 都已覆盖。正向冒烟为 140/140；兼容示例在 Windows 和 Linux 上通过 75/75。
