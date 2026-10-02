# Comptage de mots : fs et process

Un petit outil en ligne de commande qui compte les mots de fichiers texte, affiche un rapport et l’écrit dans `word-count.txt`. Il se compile pour les deux cibles à partir du même source.

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

Avec un fichier `a.txt` contenant `Hello world, hello Nona!` et `Привет мир 😀`, et un fichier `b.txt` contenant `one two two` :

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

Le code de sortie vaut 1 parce qu’un fichier manquait, 2 sans argument et 0 sinon.

## Remarques

- **Arguments.** `process.argv[0]` est l’exécutable et `process.argv[1]` le premier argument — contrairement à Node.js, il n’y a pas de chemin de script. Voir [process](/fr/reference/process).
- **Code de sortie.** `process.exitCode` fixe le code utilisé lorsque le programme se termine normalement ; `process.exit(2)` le termine immédiatement.
- **Fichiers.** `readFileSync(path, 'utf8')` renvoie une chaîne, `writeFileSync` écrit de l’UTF-8 ; les erreurs portent des codes Node.js comme `ENOENT`. Voir [Système de fichiers](/fr/reference/fs).
- **Texte.** Le drapeau `u` et `\p{L}` reconnaissent les lettres de n’importe quelle écriture ; `TextEncoder` compte les octets UTF-8.
