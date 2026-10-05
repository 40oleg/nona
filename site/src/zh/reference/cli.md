# 命令行

## 概要

```text
Nona 0.8.0 — JavaScript subset to native executables
Usage: nona build <input.js> -o <output> [--target win32-x64|linux-x64|linux-arm64|win32-arm64|darwin-x64|freebsd-x64|openbsd-x64] [--module]
       [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
       [--version-info version.json]
       (.mjs inputs are compiled as modules)
       nona --help | --version
```

在仓库的克隆中运行 `node dist/cli.js …`；执行 `npm link` 之后，同样的命令可以用 `nona` 调用。

## 选项

| 选项 | 值 | 说明 |
| --- | --- | --- |
| `-o` | 路径 | 输出文件。必填。缺失的目录会被创建。 |
| `--target` | [Native platforms](/reference/native-platforms) | PE32+, ELF64 or Mach-O64; default: host OS and CPU. |
| `--module` | — | 把输入编译为 ES 模块。以 `.mjs` 结尾的输入自动视为模块。 |
| `--subsystem` | `console`（默认）、`windows` | 没有控制台窗口的 Windows 图形界面程序。仅限 `win32-x64`。没有 `--manifest` 的图形界面程序会获得默认清单。 |
| `--icon` | `.ico` 文件 | 嵌入图标文件中的所有图像。仅限 `win32-x64`。 |
| `--manifest` | XML 文件 | 嵌入应用程序清单。清单必须有效：Windows 会拒绝启动清单格式错误的程序。仅限 `win32-x64`。 |
| `--version-info` | JSON 文件 | 嵌入版本信息（`FileVersion`、`ProductVersion`、`ProductName`、`FileDescription`、`CompanyName`、`LegalCopyright`、`OriginalFilename`、`InternalName`、`Comments`）。仅限 `win32-x64`。 |
| `--help` | — | 打印概要。 |
| `--version` | — | 打印编译器版本。 |

每个选项最多出现一次。资源格式参见 [Windows 可执行文件](/zh/reference/windows-executables)。

## 输入与输出

- 输入是一个 UTF-8 源文件。模块输入会引入它导入的模块；内置的 `nona:*` 和 `node:*` 模块是编译器的一部分。
- 输出先写到旁边的临时文件，再重命名到目标位置，因此构建失败绝不会留下写了一半的可执行文件，并会保留之前的版本。
- 编译器拒绝覆盖自己的输入文件，包括通过硬链接或符号链接的情况。
- Linux 输出文件的权限为 `0755`。

## 运行时缓存

对于链接相同部分的程序，编译后的运行时和前导代码完全相同，而生成它们占构建的大部分时间。命令行把它们保存在缓存目录中，之后的构建快约三倍（Linux 上的 hello world：1.1 秒，之后 0.33 秒）。有无缓存输出完全相同。缓存条目只属于某一个编译器构建，更新后会被忽略。

| 变量 | 作用 |
| --- | --- |
| `NONA_CACHE_DIR` | 缓存目录。默认：Windows 为 `%LOCALAPPDATA%\nona\cache`，macOS 为 `~/Library/Caches/nona`，其他系统为 `$XDG_CACHE_HOME/nona` 或 `~/.cache/nona`。 |
| `NONA_CACHE=0` | 不读取也不写入缓存。 |

## 诊断与退出码

成功时退出状态为 `0`，出现任何错误时为 `1`。源码错误的输出格式为：

```text
<file>:<line>:<column> <CODE>: <message>
```

| 代码 | 含义 |
| --- | --- |
| `E_LEX`、`E_SYNTAX` | 源码无法分词或解析，或使用了不支持的语法。 |
| `E_BIND` | 解析名称时发现的早期错误（重复声明、无效的赋值目标等）。 |
| `E_MODULE` | 模块无法解析、读取或链接，或者导出冲突。 |
| `E_FFI_STATIC` | 来自 `nona:ffi` 的 `define()` 调用不是三个字符串字面量，或签名无效。 |
| `E_FFI_TARGET` | 为 `linux-x64` 编译了 DLL 声明，或为 `win32-x64` 编译了系统调用声明。 |
| `E_RESOURCE` | 图标或版本信息无效，或为 `linux-x64` 请求了资源。 |
| `E_TARGET` | 不支持的目标平台或子系统。 |

参数错误以 `nona: <message>` 的形式输出，例如 `Unknown option: --foo`、`Duplicate option: -o`、`Missing value for --target`、`Output is required (-o <output>)`、`Unsupported target: arm64`、`Unsupported subsystem: native` 或 `--subsystem requires --target win32-x64`。

## 示例

::: code-group

```sh [控制台程序]
node dist/cli.js build app.js -o build/app.exe
```

```sh [带资源的图形界面程序]
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

```sh [Linux]
node dist/cli.js build app.js -o build/app --target linux-x64
```

:::


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
