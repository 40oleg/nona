# 示例

## 详解

| 示例 | 展示内容 | 目标平台 |
| --- | --- | --- |
| [Hello，定时器](/zh/examples/hello) | 函数、模板字面量、微任务和定时器 | Windows、Linux |
| [Museum：壁纸切换器](/zh/examples/museum) | `nona:win32`、定时器、`node:fs`、`process`、带资源的图形界面程序 | Windows |
| [矩阵计算器](/zh/examples/matrix-calculator) | 使用数组和异常的普通 ES2020 代码 | Windows、Linux |
| [单词计数](/zh/examples/word-count) | `node:fs`、`process.argv`、`process.exitCode`、`Map`、Unicode RegExp | Windows、Linux |

## 仓库中的示例

[`examples`](https://github.com/40oleg/nona/tree/main/examples) 目录中有一些小程序（`factorial.js`、`fibonacci.js`、`loops.js`、`strings.js`、`modern-expressions-demo.js`）。[`examples/compat`](https://github.com/40oleg/nona/tree/main/examples/compat) 中有 80 多个程序，每个对应一个语言或库领域，`npm run compare` 会编译它们并与 Node.js 的输出对照检查。

## 构建任意示例

::: code-group

```sh [Windows]
node dist/cli.js build examples/fibonacci.js -o build/fibonacci.exe
.\build\fibonacci.exe
```

```sh [Linux]
node dist/cli.js build examples/fibonacci.js -o build/fibonacci --target linux-x64
./build/fibonacci
```

:::

本站的示例程序位于 [`site/samples`](https://github.com/40oleg/nona/tree/main/site/samples)；CI 会为每个示例的目标平台编译它们。
