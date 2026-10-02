# Hello，定时器

使用事件循环的最小程序。

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

## 发生了什么

1. 顶层代码运行：打印问候语，排入一个微任务，并启动一个间隔定时器。
2. 顶层代码结束后，事件循环先清空 Promise 任务队列，所以微任务在任何定时器之前运行。
3. 循环在不占用 CPU 的情况下等待下一个定时器到期，执行回调，然后再次清空任务队列。
4. 第三次 tick 之后，回调清除了间隔定时器。没有剩余的定时器和任务后，程序以状态码 0 退出。

执行顺序与 Node.js 的规则相同：先同步代码，再微任务，然后按到期时间和注册顺序执行定时器。参见[定时器与事件循环](/zh/reference/host-apis)。
