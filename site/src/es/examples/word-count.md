# Conteo de palabras: fs y process

Una pequeña herramienta de línea de comandos que cuenta las palabras de archivos de texto, imprime un informe y lo escribe en `word-count.txt`. Se compila para ambos destinos a partir del mismo código fuente.

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

Con un archivo `a.txt` que contiene `Hello world, hello Nona!` y `Привет мир 😀`, y un `b.txt` que contiene `one two two`:

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

El estado de salida es 1 porque faltaba un archivo, 2 si no hay argumentos y 0 en los demás casos.

## Notas

- **Argumentos.** `process.argv[0]` es el ejecutable y `process.argv[1]` el primer argumento; a diferencia de Node.js, no hay ruta de script. Consulta [process](/es/reference/process).
- **Estado de salida.** `process.exitCode` fija el estado que se usa cuando el programa termina con normalidad; `process.exit(2)` lo termina en el acto.
- **Archivos.** `readFileSync(path, 'utf8')` devuelve una cadena y `writeFileSync` escribe UTF-8; los errores llevan códigos de Node.js como `ENOENT`. Consulta [Sistema de archivos](/es/reference/fs).
- **Texto.** El flag `u` y `\p{L}` reconocen letras de cualquier sistema de escritura; `TextEncoder` cuenta los bytes UTF-8.
