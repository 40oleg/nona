# 快速开始

## 安装

从[最新发布](https://github.com/40oleg/nona/releases/latest)下载适合你系统的压缩包，解压后运行 `nona --help`（Linux、macOS 和 BSD 上为 `./nona --help`）。压缩包中包含可执行文件、许可证和版本文件；编译器是一个原生程序，不需要 Node.js。每个发布版本还列出了 `SHA256SUMS`。

| 操作系统                    | 压缩包                                         | 目标名称                     |
| --------------------------- | ---------------------------------------------- | ---------------------------- |
| Windows x64 / ARM64         | `nona-win32-x64.zip`, `nona-win32-arm64.zip`   | `win32-x64`, `win32-arm64`   |
| Linux x64 / ARM64           | `nona-linux-x64.zip`, `nona-linux-arm64.zip`   | `linux-x64`, `linux-arm64`   |
| macOS Intel / Apple Silicon | `nona-darwin-x64.zip`, `nona-darwin-arm64.zip` | `darwin-x64`, `darwin-arm64` |
| FreeBSD / OpenBSD x64       | `nona-freebsd-x64.zip`, `nona-openbsd-x64.zip` | `freebsd-x64`, `openbsd-x64` |

在 POSIX 系统上，如果解压工具丢掉了执行权限，请运行 `chmod +x nona`。如果想不安装任何东西就试用 Nona，请使用[在线演练场](/playground)。

### 从源码构建

需要 Node.js 26 或更新版本以及 npm，可在任何能运行 Node.js 26 的主机上构建。

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
node dist/cli.js --help
```

编译器的入口是 `dist/cli.js`。在仓库中执行 `npm link` 即可把 `nona` 命令加入 `PATH`。本站其余部分都写作 `nona`；如果使用克隆的仓库，请改为运行 `node dist/cli.js`。

## 第一个程序

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux and macOS]
nona build hello.js -o build/hello
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

这个编译器是交叉编译器：任何主机都可以为八个[原生平台](/reference/native-platforms)中的任意一个生成可执行文件。`--target` 选择输出格式和 CPU；不指定时，目标就是主机的操作系统和 CPU。

```sh
nona build hello.js -o build/hello --target linux-arm64
nona build hello.js -o build/hello.exe --target win32-x64
```

交叉编译得到的可执行文件只能在匹配的操作系统和 CPU 上运行。Linux、BSD 和 macOS 的输出文件权限为 `0755`。

## 模块

`.mjs` 输入，或任何使用 `--module` 编译的输入，都是 ES 模块。相对导入（`./util.mjs`、`../lib/x.mjs`）相对于导入它的文件解析，并编译进同一个可执行文件。CommonJS 输入会连同它 `require` 的所有内容一起编译。

内置模块使用 `nona:` 前缀（`nona:ffi`、`nona:win32`、`nona:fs`、`nona:process`）；许多 Node.js 名称（`node:fs`、`node:path`、`node:http` 等）也可使用。参见[内置模块](/zh/reference/modules)。

## npm 包

照常用 npm 安装包再构建即可：Nona 在构建时解析 `node_modules`，并把这些包编译进可执行文件。`nona build <package directory>` 会构建该包的 `"bin"` 命令或 `"main"` 模块。参见 [npm 包](/reference/npm)。

## 没有控制台的 Windows 程序

```sh
nona build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` 让程序启动时不显示控制台窗口，并嵌入默认清单；`--icon` 和 `--version-info` 添加资源管理器会显示的资源。参见 [Windows 可执行文件](/zh/reference/windows-executables)和 [Museum 示例](/zh/examples/museum)。

## 故障排查

编译错误以 `file:line:column CODE: message` 的格式输出，编译器以状态码 1 退出：

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- 不支持的语法会在编译时被拒绝，而不是在运行时失败。
- `E_FFI_TARGET` 表示为非 Windows 目标编译了 DLL 声明（或为 `win32-x64` 编译了系统调用声明）。
- `E_HOST_MODULE` 表示内置模块在该目标上不可用。
- 运行时出现 `EvalError` 表示 `eval` 或 `Function` 收到了编译时未知的源码。

[命令行参考](/zh/reference/cli)列出了所有选项和错误。

## 下一步

- [示例](/zh/examples/)——带说明的完整程序。
- [语言支持](/zh/guide/language-support)和[兼容性与限制](/zh/guide/compatibility)——了解可以期待什么。
- [内置模块](/zh/reference/modules)——宿主 API。
