# 宿主 API

::: info 翻译说明
本页译自英文页面 [Host APIs](/reference/host-apis)，其内容来自 [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md)。英文版为准，且可能更新。
:::

Nona 程序在没有 Node.js 的情况下运行。下面的宿主 API 由原生运行时和编译进每个可执行文件的小型 JavaScript 前导代码实现。

## 定时器与事件循环

全局函数：`setTimeout(callback, delay, ...args)`、`setInterval`、`clearTimeout`、`clearInterval`、`queueMicrotask(callback)` 和 `performance.now()`。

- 顶层程序执行完后，入口会运行事件循环：先清空 Promise 任务队列，然后反复等待最近的定时器到期，执行其回调，再次清空任务队列。没有剩余定时器时，进程退出。
- 定时器先按到期时间排序，再按注册顺序排序。延迟的处理与 Node.js 一致：用 `ToNumber` 转换，`NaN`、小于 1 或大于 2^31-1 的值都变为 1。
- 定时器 id 是数字（Node.js 返回 `Timeout` 对象）。`clearTimeout` 和 `clearInterval` 接受任何 id；未知的 id 会被忽略。
- 等待在 Windows 上使用 `Sleep`，在 Linux 上使用 `nanosleep`，因此空闲的程序不占用 CPU。在 Windows 上，精度取决于系统定时器节拍（通常为 15.6 ms）。
- `performance.now()` 使用单调时钟（`QueryPerformanceCounter`、`clock_gettime(CLOCK_MONOTONIC)`），从程序启动开始以毫秒计数。
- 定时器回调中未捕获的异常会让进程以退出码 1 终止，与顶层程序中未捕获的异常一样。
- Test262 宿主创建的 realm 不会安装自己的定时器。

## 长时间运行的程序

- 回收器会把已提交的协程栈（每个运行中的异步函数或生成器 1 MiB，`rt.generatorStackBytes`）计入阈值，因此被遗弃的协程——它们的栈只能由清除阶段释放——会像普通垃圾一样触发回收。
- `tests/stability.test.ts` 检查：定时器触发次数增加十倍（每个节拍都有 Promise 任务和垃圾）不会提高内存峰值；数千个被遗弃的协程会被释放；等待两秒定时器的程序几乎不占用 CPU。
- 已知限制：属性、元素和 Map 的存储是线性的（#36），因此拥有数百个存活定时器或大对象的程序会变慢；在 Linux 上，每个堆块都是一个单独的内存映射（#37）。
