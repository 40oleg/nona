# Word count: fs and process

A small command-line tool that counts words in text files, prints a report and writes it to `word-count.txt`. It builds for both targets from the same source.

<<< ../../samples/word-count.mjs{js}

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

With a file `a.txt` containing `Hello world, hello Nona!` and `Привет мир 😀`, and `b.txt` containing `one two two`:

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

The exit status is 1 because a file was missing, 2 without arguments, and 0 otherwise.

## Notes

- **Arguments.** `process.argv[0]` is the executable and `process.argv[1]` the first argument — unlike Node.js, there is no script path. See [process](/reference/process).
- **Exit status.** `process.exitCode` sets the status used when the program ends normally; `process.exit(2)` ends it at once.
- **Files.** `readFileSync(path, 'utf8')` returns a string, `writeFileSync` writes UTF-8; errors carry Node.js codes such as `ENOENT`. See [File system](/reference/fs).
- **Text.** The `u` flag and `\p{L}` match letters in any script; `TextEncoder` counts UTF-8 bytes.
