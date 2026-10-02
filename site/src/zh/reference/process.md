# process API

::: info 翻译说明
本页译自英文页面 [Process API](/reference/process)，其内容来自 [`docs/process.md`](https://github.com/40oleg/nona/blob/main/docs/process.md)。英文版为准，且可能更新。
:::

`process` 是一个全局对象（与 Node.js 相同），也可以作为 `node:process` 和 `nona:process` 的默认导出使用；这两个模块还额外导出 `argv`、`env`、`platform`、`arch`、`pid`、`execPath`、`exit` 和 `cwd`。

| 成员 | 说明 |
| --- | --- |
| `argv` | `[execPath, ...arguments]`。没有脚本路径：`argv[1]` 是第一个参数（Node.js 在这里放的是脚本路径）。在 Windows 上，命令行按 `CommandLineToArgvW` 的规则拆分。 |
| `env` | 一个普通对象，保存首次访问时环境变量的快照。修改不会传递给操作系统。在 Windows 上，会跳过隐藏的 `=C:` 形式的条目。 |
| `exit(code?)` | 立即以 `code` 终止，或以 `process.exitCode`（默认 0）终止。 |
| `exitCode` | 程序正常结束时用作退出状态。 |
| `execPath` | 正在运行的可执行文件的绝对路径。 |
| `cwd()` | 当前工作目录。 |
| `platform`、`arch`、`pid` | `'win32'` 或 `'linux'`、`'x64'`、进程 id。 |

`process` 在首次访问时才惰性构建，因此不使用它的程序在启动时没有任何开销。与 Node.js 不同，它不是 EventEmitter，也没有 `stdout`/`stdin` 流、`nextTick`、`hrtime` 或 `memoryUsage`。

实现：每个映像都包含两个目标平台的宿主函数，因此同一个生成的程序既可以链接为 PE，也可以链接为 ELF；每个链接器都把另一目标平台的导入绑定到一个返回 0 的桩函数上。Windows 通过编译器为自身前导代码安装的 FFI 转换桩读取 `GetCommandLineW`、`GetEnvironmentStringsW`、`GetModuleFileNameW` 和 `GetCurrentDirectoryW`；Linux 读取 `/proc/self/cmdline`、`/proc/self/environ` 和 `/proc/self/exe`，并直接调用 `getcwd`/`exit_group`。
