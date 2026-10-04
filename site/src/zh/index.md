---
layout: home

hero:
  name: Nona
  text: 把 JavaScript 编译成原生可执行文件
  tagline: 一个提前（ahead-of-time）编译器，把 ES2020 JavaScript 编译成独立的 Windows 和 Linux x64 可执行文件。没有内嵌解释器，也不需要 C 工具链。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: 在浏览器中试用
      link: /playground
    - theme: alt
      text: 什么是 Nona
      link: /zh/guide/what-is-nona
    - theme: alt
      text: GitHub
      link: https://github.com/40oleg/nona

features:
  - title: 2 毫秒启动
    details: 编译后的 hello world 启动只需 1.8 ms，内存峰值 11 MB，可执行文件 3 MB。Node.js 需要 28 ms 和 45 MB；Node SEA 可执行文件有 124 MB。
    link: /zh/guide/performance
  - title: ES2020 语言
    details: 类、生成器、异步函数、解构、可选链、BigInt、尾调用优化，以及支持循环依赖和实时绑定的 ES 模块——例外情况均有文档说明。
    link: /zh/guide/language-support
  - title: 原生运行时
    details: 精确的标记-清除垃圾回收器、UTF-16 字符串、真正的异常，以及栈溢出时可捕获的 RangeError，链接进每个可执行文件。
    link: /zh/guide/how-it-works
  - title: 宿主 API
    details: 带定时器的事件循环、全局 process、同步的 node:fs、TextEncoder 和 TextDecoder。
    link: /zh/reference/host-apis
  - title: FFI 与 nona:win32
    details: 通过编译期声明调用 Windows 上任意 DLL 的导出函数；内置现成的 user32、kernel32 和 advapi32 绑定。
    link: /zh/reference/ffi
  - title: Windows 图形界面程序
    details: 没有控制台窗口的程序，带图标、应用程序清单和版本信息。
    link: /zh/reference/windows-executables
---

## 快速示例

<<< ../../samples/hello.js

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

可执行文件包含程序的机器码和 Nona 的运行时。它不需要 Node.js：Windows 可执行文件只导入 `KERNEL32.dll`，Linux 可执行文件不经过 libc，直接进行系统调用。

## 状态

当前版本是 **v0.8.0**。在 Windows x64 上，固定版本的 Test262 测试集（ES2020 特性）通过了 22436/22492 个 language 测试、15868/15933 个 built-ins 测试、268/268 个 Atomics 测试和 996/1016 个 Annex B 测试；剩余的每个失败都已在[状态页面](/zh/guide/status)中分类。启动速度、可执行文件大小和内存占用是 Nona 的强项；程序内部的计算比 V8 慢 20–100 倍，部分操作（`Map`、`sort`、字符串拼接、长 Promise 链）仍然是超线性的，参见[性能](/zh/guide/performance)。Nona 仍处于实验阶段：它不能直接替代 Node.js，也没有经过安全审计。
