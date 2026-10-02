# Подсчёт слов: fs и process

Небольшая утилита командной строки, которая считает слова в текстовых файлах, печатает отчёт и записывает его в `word-count.txt`. Она собирается для обеих целей из одного исходника.

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

Если файл `a.txt` содержит `Hello world, hello Nona!` и `Привет мир 😀`, а `b.txt` — `one two two`:

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

Код выхода равен 1, потому что одного файла не нашлось; 2 — если аргументов нет; 0 — в остальных случаях.

## Примечания

- **Аргументы.** `process.argv[0]` — исполняемый файл, а `process.argv[1]` — первый аргумент; в отличие от Node.js, пути к скрипту здесь нет. См. [process](/ru/reference/process).
- **Код выхода.** `process.exitCode` задаёт код, с которым программа завершится обычным образом; `process.exit(2)` завершает её сразу.
- **Файлы.** `readFileSync(path, 'utf8')` возвращает строку, `writeFileSync` пишет UTF-8; ошибки несут коды Node.js, например `ENOENT`. См. [Файловую систему](/ru/reference/fs).
- **Текст.** Флаг `u` и `\p{L}` находят буквы любой письменности; `TextEncoder` считает байты UTF-8.
