# 单词计数：fs 与 process

一个小型命令行工具：统计文本文件中的单词，打印报告并把它写入 `word-count.txt`。它可以用同一份源码为两个目标平台构建。

<<< ../../../samples/word-count.mjs{js}

::: code-group

```sh [Windows]
node dist/cli.js build word-count.mjs -o build/word-count.exe
.\build\word-count.exe notes.txt README.md
```

```sh [Linux]
node dist/cli.js build word-count.mjs -o build/word-count --target linux-x64
./build/word-count notes.txt README.md
```

:::

假设文件 `a.txt` 包含 `Hello world, hello Nona!` 和 `Привет мир 😀`，`b.txt` 包含 `one two two`：

```text
$ word-count a.txt b.txt missing.txt
missing.txt: not found
a.txt: 6 words, 50 bytes
b.txt: 3 words, 12 bytes
total: 9 words, 7 distinct
  hello: 2
  two: 2
  nona: 1
  one: 1
  world: 1
```

由于有一个文件缺失，退出状态为 1；没有参数时为 2；其他情况为 0。

## 说明

- **参数。** `process.argv[0]` 是可执行文件，`process.argv[1]` 是第一个参数——与 Node.js 不同，这里没有脚本路径。参见 [process](/zh/reference/process)。
- **退出状态。** `process.exitCode` 设置程序正常结束时使用的状态；`process.exit(2)` 会立即结束程序。
- **文件。** `readFileSync(path, 'utf8')` 返回字符串，`writeFileSync` 写入 UTF-8；错误带有 Node.js 的错误码，例如 `ENOENT`。参见[文件系统](/zh/reference/fs)。
- **文本。** `u` 标志和 `\p{L}` 匹配任何文字系统中的字母；`TextEncoder` 用于统计 UTF-8 字节数。
