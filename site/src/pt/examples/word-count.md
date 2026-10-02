# Contagem de palavras: fs e process

Uma pequena ferramenta de linha de comando que conta as palavras de arquivos de texto, imprime um relatório e o grava em `word-count.txt`. Ela compila para os dois alvos a partir do mesmo código-fonte.

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

Com um arquivo `a.txt` contendo `Hello world, hello Nona!` e `Привет мир 😀`, e um `b.txt` contendo `one two two`:

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

O status de saída é 1 porque um arquivo estava faltando, 2 sem argumentos e 0 nos demais casos.

## Observações

- **Argumentos.** `process.argv[0]` é o executável e `process.argv[1]` o primeiro argumento — ao contrário do Node.js, não há caminho de script. Veja [process](/pt/reference/process).
- **Status de saída.** `process.exitCode` define o status usado quando o programa termina normalmente; `process.exit(2)` o encerra na hora.
- **Arquivos.** `readFileSync(path, 'utf8')` retorna uma string, `writeFileSync` grava UTF-8; os erros trazem códigos do Node.js como `ENOENT`. Veja [Sistema de arquivos](/pt/reference/fs).
- **Texto.** A flag `u` e `\p{L}` reconhecem letras de qualquer sistema de escrita; `TextEncoder` conta os bytes UTF-8.
