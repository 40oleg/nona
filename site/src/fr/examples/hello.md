# Bonjour, minuteurs

Le plus petit programme qui utilise la boucle d’événements.

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

## Ce qui se passe

1. Le code de premier niveau s’exécute : il affiche le message d’accueil, met une microtâche en file et démarre un minuteur périodique.
2. Lorsque le code de premier niveau se termine, la boucle d’événements vide d’abord la file des tâches de Promise ; la microtâche s’exécute donc avant tout minuteur.
3. La boucle attend l’échéance du minuteur suivant sans consommer de CPU, exécute le callback et vide de nouveau la file des tâches.
4. Après le troisième tick, le callback annule l’intervalle. Sans minuteur ni tâche restants, le programme se termine avec le code 0.

L’ordre suit les mêmes règles que Node.js : code synchrone, puis microtâches, puis minuteurs par échéance et ordre d’enregistrement. Voir [Minuteurs et boucle d’événements](/fr/reference/host-apis).
