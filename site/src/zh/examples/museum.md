# Museum：壁纸切换器 <Badge type="warning" text="仅限 Windows" />

::: warning 仅限 Windows
此示例通过 `nona:win32` 调用 Windows 函数，只能为 `win32-x64` 编译。
:::

Museum 是一个后台程序，每隔几分钟就把桌面壁纸换成另一幅画作。它运行时没有控制台窗口，两次切换之间不占用 CPU，只允许运行一个实例，还可以把自己注册为随 Windows 启动。整个程序是一个约 80 行的模块。

## 第 1 步：参数

```js
const folder = process.argv[1];
const minutes = Number(process.argv[2] ?? 30);
const install = process.argv.includes('--install');
```

`process.argv[0]` 是可执行文件，`process.argv[1]` 是第一个参数。图形界面程序没有控制台，所以错误用 `MessageBoxW` 显示：

```js
function fail(message) {
  MessageBoxW(null, message, 'Museum', MB_OK | MB_ICONERROR);
  process.exit(1);
}
```

## 第 2 步：图片

`node:fs` 中的 `readdirSync` 列出文件夹内容。没有 `node:path`，所以用 `\` 手动拼接路径。

```js
const pictures = readdirSync(folder)
  .filter(name => /\.(jpe?g|png|bmp)$/i.test(name))
  .sort()
  .map(name => folder.replace(/[\\/]+$/, '') + '\\' + name);
```

## 第 3 步：单实例

命名互斥体在创建它的进程存续期间一直存在。如果它已经存在，说明另一个 Museum 正在运行。

```js
CreateMutexW(null, false, 'Local\\NonaMuseum');
if (lastError() === ERROR_ALREADY_EXISTS) process.exit(0);
```

`lastError()` 返回在上一次 FFI 调用后立即捕获的 `GetLastError()`。

## 第 4 步：设置壁纸

```js
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, picture, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)
```

`wstr` 参数把 JavaScript 字符串转换成以 NUL 结尾的临时 UTF-16 副本，因此包含任意字符的路径都能正常工作。`SPIF_UPDATEINIFILE` 让壁纸在注销后仍然保留，`SPIF_SENDCHANGE` 通知其他程序。

## 第 5 步：轮换

```js
showNext();
setInterval(showNext, minutes * 60 * 1000);
```

尚未结束的间隔定时器会让进程保持运行。两次 tick 之间，事件循环在内核中休眠，因此程序等待时不占用 CPU。

## 第 6 步：构建图形界面程序

<<< ../../../samples/museum.version.json

```sh
node dist/cli.js build museum.mjs -o build/museum.exe --subsystem windows --icon museum.ico --version-info museum.version.json
```

- `--subsystem windows` 让程序启动时不显示控制台窗口，并嵌入默认清单（asInvoker、Windows 10/11、按显示器的 DPI 感知）。
- `--icon` 嵌入资源管理器和任务栏显示的图标。
- `--version-info` 填写“属性 → 详细信息”。

运行时传入文件夹和以分钟为单位的间隔：

```powershell
.\build\museum.exe "C:\Users\me\Pictures\Paintings" 30
```

## 第 7 步：随 Windows 启动（可选）

使用 `--install` 时，Museum 把自己的命令行写入 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`。`RegCreateKeyExW` 把打开的键写入一个 8 字节缓冲区，再由 `readHandle` 读取；`wideString` 为 `RegSetValueExW` 生成 UTF-16 数据。

```js
const key = new Uint8Array(8);
RegCreateKeyExW(HKEY_CURRENT_USER, runKey, 0, null, 0, KEY_WRITE, null, key, null);
const command = wideString(`"${process.execPath}" "${folder}" ${minutes}`);
RegSetValueExW(readHandle(key), 'NonaMuseum', 0, REG_SZ, command, command.byteLength);
```

要撤销，删除该键中的 `NonaMuseum` 值即可（例如用 `RegDeleteValueW`，或在注册表编辑器中操作）。

## 完整源码

<<< ../../../samples/museum.win32.mjs{js}

## 另请参阅

- [原生函数（FFI）](/zh/reference/ffi)和 [`nona:win32` 导出列表](/zh/reference/modules#nona-win32)
- [Windows 可执行文件](/zh/reference/windows-executables)
- [定时器与事件循环](/zh/reference/host-apis)
