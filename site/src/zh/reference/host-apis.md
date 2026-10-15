# 宿主 API

::: info 翻译说明
本页译自英文页面 [Host APIs](/reference/host-apis)，其内容来自 [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md)。英文版为准，且可能更新。
:::

Nona 程序在没有 Node.js 的情况下运行。下面的宿主 API 由原生运行时和编译进每个可执行文件的小型 JavaScript 前导代码实现。

## Paths (`node:path`)

`node:path` / `path` implements Node.js 26 path utilities on all eight native targets.
Use `posix`, `win32`, or explicit flavor modules (`node:path/posix`,
`node:path/win32`, `path/posix`, `path/win32`). Functions: `normalize`, `join`,
`resolve`, `relative`, `parse`, `format`, `basename`, `dirname`, `extname`,
`isAbsolute`, `toNamespacedPath`, `matchesGlob`; properties: `sep`, `delimiter`.
The target selects the default flavor; resolution reads the executable's runtime
current directory. Working-directory information is read on demand; importing
Path does not initialize the full process object. [Full reference](https://github.com/40oleg/nona/blob/main/docs/path.md).

## 定时器与事件循环

全局函数：`setTimeout(callback, delay, ...args)`、`setInterval`、`clearTimeout`、`clearInterval`、`setImmediate(callback, ...args)`, `clearImmediate`, `queueMicrotask(callback)` 和 `performance.now()`。

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

## Events

`node:events`, `events` and `nona:events` share one built-in module. The default
export is `EventEmitter`; listener ordering, once/prepend listeners, removal,
introspection, meta events, error monitoring and rejection capture are supported.
Promise `once` and async-iterator `on` include cleanup, close events, externally
supplied abort signals and emitter watermarks. Listener/max-listener helpers and
disposable `addAbortListener` subscriptions under `Symbol.dispose` are also available.
`Symbol.dispose` and `Symbol.asyncDispose` have the distinct symbol identities used by Node.js 26.

See the [English events reference](/reference/host-apis#events) for the
complete supported API and limitations.

## URL {#url}

全局 `URL` 和 `URLSearchParams`（`node:url` 也导出它们）遵循 [URL 标准](https://url.spec.whatwg.org/)：带默认端口的特殊协议（`http`、`https`、`ws`、`wss`、`ftp`、`file`），反斜杠和点路径段，相对于基准 URL 的相对引用，带 authority 或不透明路径的其他协议（`mailto:`、`data:`、`blob:`），标准的百分号编码集，任意写法的 IPv4 数字以及 IPv6 地址。每个组成部分都可以读取和设置；`searchParams` 与 `search` 保持同步。提供 `URL.canParse` 和 `URL.parse`。主机名会转为小写，但不做 IDNA 转换：主机含非 ASCII 字符的 URL 会抛出 `ERR_INVALID_URL`。只有当程序源码中提到 `URL` 或 `URLSearchParams` 时，解析器才会被链接进程序。 `URL.prototype` 和 `URLSearchParams.prototype` 上的方法和访问器在创建第一个 URL 或查询参数对象（或调用 `URL.canParse`）时才安装，这样从不解析 URL 的程序堆保持较小。

## Node.js 支持模块 {#nodejs-support-modules}

这些模块主要为 [npm 包](/reference/npm)而提供，这些包会在启动时加载它们。每个模块都可以通过 `node:<name>` 和 `<name>` 使用。

- `node:os`：`EOL`、`devNull`、`platform`、`arch`、`machine`、`type`、`endianness`、`homedir`（`HOME`，Windows 上为 `USERPROFILE`）、`tmpdir`（`TMPDIR`/`TMP`/`TEMP`）、`hostname`（`HOSTNAME`/`COMPUTERNAME` 或 `localhost`）、`userInfo`、`uptime`、`freemem`、`totalmem` 以及 `constants.signals`/`priority`。`release` 和 `version` 为空字符串，`cpus()` 和 `networkInterfaces()` 为空，`loadavg()` 全为零，`availableParallelism()` 为 1。
- `node:tty`：`isatty(fd)` 报告标准输入、标准输出或标准错误是否为终端；`ReadStream` 和 `WriteStream` 是用于特性检测的最小类。
- `node:util`：`format` 和 `formatWithOptions`（`%s %d %i %f %j %o %O %c %%`）、`inspect`（支持 `inspect.custom`、`depth`、`breakLength`、`maxArrayLength`、`customInspect`）、`inherits`、`promisify`（支持 `promisify.custom`）、`callbackify`、`deprecate`（每个代码只警告一次）、`debuglog`（`NODE_DEBUG`）、`isDeepStrictEqual`、`types`、`styleText`、`stripVTControlCharacters`、`TextEncoder`/`TextDecoder` 以及旧式的 `is*` 判断函数。`inspect` 近似 Node.js 的排版：会显示对象、数组、Map、Set、类型化数组、函数、类、错误、日期、包装值、getter 和循环引用，但颜色、`showHidden`、`sorted` 以及 Node.js 将长数组分列显示的方式不会被精确再现。`node:util/types` 即 `util.types`。
- `node:url`：`URL`、`URLSearchParams`、`fileURLToPath`、`pathToFileURL`（在 Windows 上支持盘符和 UNC 主机）、`urlToHttpOptions`、`domainToASCII`/`domainToUnicode`（仅 ASCII），以及旧式的 `parse`、`format` 和 `resolve`。
- `node:assert` 和 `node:assert/strict`：`ok`、`equal`、`notEqual`、`strictEqual`、`notStrictEqual`、`deepEqual`、`deepStrictEqual` 及其否定形式，`throws`、`doesNotThrow`、`rejects`、`doesNotReject`、`match`、`doesNotMatch`、`ifError`、`fail` 和 `AssertionError`（`code` 为 `ERR_ASSERTION`）。失败消息比 Node.js 的差异输出更简短。
- `node:crypto`：`randomBytes`、`randomFill`/`randomFillSync`、`randomUUID`（版本 4）、`randomInt`、`getRandomValues` 和 `webcrypto.getRandomValues` 读取操作系统的随机源（Windows 上为 `BCryptGenRandom`，其他系统为 `/dev/urandom`）。还提供 `createHash`（`md5`、`sha1`、`sha256`、`sha384`、`sha512`，支持 `update`、任意 Buffer 编码的 `digest` 和 `copy`）、`createHmac`、`hash`、`getHashes` 和 `timingSafeEqual`。`hkdf` 和 `hkdfSync` 计算 HKDF（RFC 5869）。不提供加密算法、密钥、签名、其他密钥派生和 `crypto.subtle`，也没有全局 `crypto`。
- `node:querystring`：`parse`/`decode`、`stringify`/`encode`、`escape`、`unescape`。
- `node:timers`：全局定时器函数。`node:timers/promises`：`setTimeout`、`setImmediate`（均支持 `AbortSignal`）、作为异步迭代器的 `setInterval`，以及 `scheduler.wait`/`yield`。
- `node:perf_hooks`：`performance`；`PerformanceObserver` 和 `monitorEventLoopDelay` 不观察任何内容。
- `node:module`：`builtinModules` 和 `isBuiltin`。`createRequire` 抛出 `ERR_NONA_UNSUPPORTED`：模块在构建程序时解析。
- `node:worker_threads`：`isMainThread` 为 `true`，`parentPort` 和 `workerData` 为 `null`；`Worker` 抛出 `ERR_NONA_UNSUPPORTED`。
- `node:child_process`：所有函数和 `ChildProcess` 都抛出 `ERR_NONA_UNSUPPORTED`。该模块的存在只是为了让仅提及它的包能够加载。
