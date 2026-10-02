# Windows 可执行文件

::: info 翻译说明
本页译自英文页面 [Windows executables](/reference/windows-executables)，其内容来自 [`docs/windows-executables.md`](https://github.com/40oleg/nona/blob/main/docs/windows-executables.md)。英文版为准，且可能更新。
:::

## 子系统

`nona build app.js -o app.exe --subsystem windows` 把 PE 映像标记为图形界面程序（可选头中的 Subsystem 为 2）。这样 Windows 启动它时不会打开控制台窗口，适合后台程序和托盘工具。默认是 `--subsystem console`（3）。该选项需要 `--target win32-x64`。

图形界面程序仍会把 `console.log` 的输出写入它继承的标准输出句柄（例如父进程建立的管道）。如果没有标准输出——没有控制台、句柄已关闭或分离，或者写入失败——输出会被丢弃，程序继续运行；早期版本在这种情况下会以退出码 1 终止。

## 资源

```text
nona build app.js -o app.exe --icon app.ico --manifest app.manifest --version-info version.json
```

- `--icon` 嵌入 `.ico` 文件中的所有图像（`RT_ICON` 1…n 和 `RT_GROUP_ICON` 1）；资源管理器和任务栏会显示它。
- `--manifest` 嵌入应用程序清单（`RT_MANIFEST` 1）。清单必须有效：Windows 会拒绝启动清单格式错误的程序。用 `--subsystem windows` 构建且没有清单的程序会获得一个默认清单：`asInvoker`、Windows 10/11 兼容性以及按显示器的 DPI 感知。
- `--version-info` 读取一个 JSON 对象，其中可以包含 `FileVersion`、`ProductVersion`（`"major.minor.build.revision"`，各部分为 0–65535）、`ProductName`、`FileDescription`、`CompanyName`、`LegalCopyright`、`OriginalFilename`、`InternalName` 和 `Comments`，显示在文件的“属性 → 详细信息”中（`RT_VERSION` 1，语言 0409，代码页 04B0）。

```json
{ "FileVersion": "1.0.0.0", "ProductName": "Museum", "FileDescription": "Paintings on the desktop", "CompanyName": "Oleg" }
```

在 `compile()` 中，同样的选项以 `icon`（字节）、`manifest`（字符串）和 `versionInfo`（对象）的形式提供。它们需要 `--target win32-x64`。
