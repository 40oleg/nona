# 矩阵计算器

[`examples/compat/matrix-calculator.cjs`](https://github.com/40oleg/nona/blob/main/examples/compat/matrix-calculator.cjs) 对两个矩阵做加法、减法和乘法，转置 A，并计算 A 的行列式和逆矩阵。它只使用语言本身和 `console.log`，因此同一个程序既能在 Node.js 下运行，也能作为 Nona 可执行文件运行。

## 构建并运行

::: code-group

```sh [Windows]
node dist/cli.js build examples/compat/matrix-calculator.cjs -o build/matrix-calculator.exe
.\build\matrix-calculator.exe
```

```sh [Linux]
node dist/cli.js build examples/compat/matrix-calculator.cjs -o build/matrix-calculator --target linux-x64
./build/matrix-calculator
```

:::

```text
A:
2  1
1  1
B:
3  4
5  6
Transpose A:
2  1
1  1
A + B:
5  5
6  7
…
```

## 修改输入

编辑源码末尾的矩阵，然后重新构建：

```js
const A = [[2, 1], [1, 1]];
const B = [[3, 4], [5, 6]];
```

每个内层数组是一行。矩阵必须非空、为矩形，并且只包含有限数。加法和减法要求尺寸相同；乘法要求 A 的列数等于 B 的行数；行列式和逆矩阵要求 A 为方阵。一个运算出错不会影响其他运算。

## 数值计算

行列式和逆矩阵在 binary64 下用带部分主元选取的高斯–约当消元法计算。如果主元不大于输入中最大绝对值的 `1e-12` 倍，程序会报告行列式为零且不存在逆矩阵。这是一个数值阈值：它可能会拒绝在精确算术中可逆的病态矩阵。

## 验证

```sh
node scripts/check-matrix-calculator.mjs
```

该脚本编译此示例及一个带断言的变体，运行两个可执行文件，并把标准输出、标准错误和退出码与 Node.js 对比：运算结果、矩形矩阵、行交换、1×1 和 3×3 矩阵、奇异矩阵以及八种无效输入。
