# Hello, timers

The smallest program that uses the event loop.

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

## What happens

1. The top-level code runs: it prints the greeting, queues a microtask and starts an interval timer.
2. When the top-level code finishes, the event loop drains the Promise job queue first, so the microtask runs before any timer.
3. The loop waits until the next timer deadline without using the CPU, runs the callback and drains the job queue again.
4. After the third tick the callback clears the interval. With no timers and no jobs left, the program exits with status 0.

The same rules as in Node.js apply to ordering: synchronous code, then microtasks, then timers by deadline and registration order. See [Timers and the event loop](/reference/host-apis).
