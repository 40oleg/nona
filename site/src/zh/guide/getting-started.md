# 快速开始

## 环境要求

- 运行编译器：Windows 或 Linux 上的 Node.js 26 或更新版本以及 npm。
- 目标平台：Windows 10/11 x64（`win32-x64`，默认）和 Linux x86-64（`linux-x64`）。

## 构建编译器

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
```

编译器的入口是 `dist/cli.js`；本站的示例都以 `node dist/cli.js` 的方式运行它。该包还声明了 `nona` 命令：在仓库中执行 `npm link` 即可把它加入 `PATH`。

## 第一个程序

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
node dist/cli.js build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux]
node dist/cli.js build hello.js -o build/hello --target linux-x64
./build/hello
```

:::

```text
Hello, from Nona!
a microtask runs before any timer
tick 1
tick 2
tick 3
done; at least 30 ms passed: true
```

当没有剩余的定时器和 Promise 任务时，程序结束。可执行文件可以独立运行：把它复制到没有安装 Node.js 的机器上，它照样能工作。

## 目标平台与交叉编译

这个编译器是交叉编译器：在 Windows 上可以生成 Linux 可执行文件，在 Linux 上也可以生成 Windows 可执行文件。`--target` 选择输出格式，默认是 `win32-x64`。Linux 输出文件的权限为 `0755`。

## 模块

`.mjs` 输入，或任何使用 `--module` 编译的输入，都是 ES 模块。相对导入（`./util.mjs`、`../lib/x.mjs`）相对于导入它的文件解析，并编译进同一个可执行文件。内置模块使用 `nona:` 前缀（`nona:ffi`、`nona:win32`、`nona:fs`、`nona:process`），`node:fs` 和 `node:process` 是 Nona 子集的别名；参见[内置模块](/zh/reference/modules)。

## 没有控制台的 Windows 程序

```sh
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` 让程序启动时不显示控制台窗口，并嵌入默认清单；`--icon` 和 `--version-info` 添加资源管理器会显示的资源。参见 [Windows 可执行文件](/zh/reference/windows-executables)和 [Museum 示例](/zh/examples/museum)。

## 故障排查

编译错误以 `file:line:column CODE: message` 的格式输出，编译器以状态码 1 退出：

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- 不支持的语法会在编译时被拒绝，而不是在运行时失败。
- `E_FFI_TARGET` 表示为 `linux-x64` 编译了 DLL 声明（或为 `win32-x64` 编译了系统调用声明）。
- 运行时出现 `EvalError` 表示 `eval` 或 `Function` 收到了编译时未知的源码。

[命令行参考](/zh/reference/cli)列出了所有选项和错误。

## 原生平台

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — 原生平台](/reference/native-platforms). `darwin-arm64`: not enabled yet.
