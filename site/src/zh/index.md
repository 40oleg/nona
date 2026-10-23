---
layout: home

hero:
    name: Nona
    text: 把 JavaScript 编译成原生可执行文件
    tagline: 一个提前（ahead-of-time）编译器，把 ES2020 JavaScript 编译成小巧的独立可执行文件，支持 Windows、Linux、macOS、FreeBSD 和 OpenBSD。没有内嵌解释器，也不需要 C 工具链。
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
      details: 编译后的 hello world 启动约需 2 ms，内存峰值 11 MB，可执行文件约 2 MB。Node.js 需要 28 ms 和 45 MB；Node SEA 可执行文件有 124 MB。
      link: /zh/guide/performance
    - title: 任意主机编译八个目标平台
      details: Windows、Linux 和 macOS 的 x64 与 ARM64，以及 FreeBSD 和 OpenBSD 的 x64。用 --target 交叉编译；每个可执行文件都是自包含的。
      link: /reference/native-platforms
    - title: ES2020 语言
      details: 类、生成器、异步函数、解构、可选链、BigInt、尾调用优化，以及支持循环依赖和实时绑定的 ES 模块，例外情况均有文档说明。
      link: /zh/guide/language-support
    - title: npm 包
      details: node_modules 中的包在构建时解析，并与它们常用的 Node.js 模块一起编译进可执行文件。
      link: /reference/npm
    - title: 类 Node.js 的宿主 API
      details: 定时器与事件循环、process、fs、path、Buffer、流、事件、URL，以及 HTTP 和 TCP 服务器与客户端。
      link: /zh/reference/modules
    - title: 原生运行时
      details: 精确的标记-清除垃圾回收器、UTF-16 字符串、真正的异常、栈溢出时可捕获的 RangeError，以及自举的编译器。
      link: /zh/guide/how-it-works
    - title: FFI 与 Windows 图形界面程序
      details: 通过编译期声明调用任意 DLL 的导出函数，并可构建没有控制台窗口、带图标、清单和版本信息的程序。
      link: /zh/reference/ffi
---

## 快速示例

<<< ../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux and macOS]
nona build hello.js -o build/hello
./build/hello
```

```sh [Cross-compile]
nona build hello.js -o build/hello --target linux-arm64
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

当前版本是 **v0.26.0**；Nona 仍处于实验阶段。它不能直接替代 Node.js，也没有经过安全审计。

- **一致性。** 在最近一次完整审计（v0.8.0）中，固定版本的 Test262 测试集在 Windows x64 上通过了 22436/22492 个 language 测试、15868/15933 个 built-ins 测试、268/268 个 Atomics 测试和 996/1016 个 Annex B 测试。剩余的每个失败都已在[状态页面](/zh/guide/status)中分类。
- **速度。** 启动速度、可执行文件大小和内存占用是 Nona 的强项。程序内部的计算没有 JIT：在简单循环上与 V8 相当，在调用、内存分配和长时间运行的真实程序上则慢数倍到数十倍。[性能](/zh/guide/performance)给出了测量结果和已知的慢点。
- **限制。** `eval` 和 `Function` 需要在编译时已知的源码，并且只有 Nona 实现的 Node.js API 可用。参见[兼容性与限制](/zh/guide/compatibility)。
