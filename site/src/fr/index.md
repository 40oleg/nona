---
layout: home

hero:
  name: Nona
  text: Du JavaScript aux exécutables natifs
  tagline: Un compilateur ahead-of-time qui transforme du JavaScript ES2020 en exécutables autonomes pour Windows et Linux x64. Sans interpréteur embarqué, sans chaîne de compilation C.
  actions:
    - theme: brand
      text: Commencer
      link: /fr/guide/getting-started
    - theme: alt
      text: Essayer dans le navigateur
      link: /playground
    - theme: alt
      text: Qu’est-ce que Nona
      link: /fr/guide/what-is-nona
    - theme: alt
      text: GitHub
      link: https://github.com/40oleg/nona

features:
  - title: Démarrage en 2 ms
    details: Un hello world compilé démarre en 1,8 ms et culmine à 11 Mo de mémoire, dans un exécutable de 3 Mo. Node.js met 28 ms et utilise 45 Mo ; un exécutable Node SEA pèse 124 Mo.
    link: /fr/guide/performance
  - title: Le langage ES2020
    details: Classes, générateurs, fonctions async, déstructuration, chaînage optionnel, BigInt, appels terminaux et modules ES avec cycles et liaisons vivantes — avec des exceptions documentées.
    link: /fr/guide/language-support
  - title: Un runtime natif
    details: Un ramasse-miettes mark-and-sweep précis, des chaînes UTF-16, de vraies exceptions et une RangeError interceptable en cas de débordement de pile, liés dans chaque exécutable.
    link: /fr/guide/how-it-works
  - title: API de l’hôte
    details: Une boucle d’événements avec minuteurs, un process global, node:fs synchrone, TextEncoder et TextDecoder.
    link: /fr/reference/host-apis
  - title: FFI et nona:win32
    details: Appelez n’importe quelle fonction exportée d’une DLL sous Windows grâce à des déclarations résolues à la compilation ; des liaisons prêtes à l’emploi pour user32, kernel32 et advapi32.
    link: /fr/reference/ffi
  - title: Exécutables graphiques Windows
    details: Des programmes sans fenêtre de console, avec icône, manifeste d’application et informations de version.
    link: /fr/reference/windows-executables
---

## Exemple rapide

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

L’exécutable contient le code machine du programme et le runtime de Nona. Il n’a pas besoin de Node.js : un exécutable Windows n’importe que `KERNEL32.dll`, et un exécutable Linux effectue directement des appels système, sans libc.

## État du projet

La version actuelle est **v0.8.0**. La suite Test262 figée (fonctionnalités ES2020) réussit 22436/22492 tests language, 15868/15933 tests built-ins, 268/268 tests Atomics et 996/1016 tests Annex B sous Windows x64 ; chaque échec restant est classé sur la [page d’état](/fr/guide/status). Le démarrage, la taille de l’exécutable et la mémoire sont les points forts de Nona ; le calcul à l’intérieur d’un programme est 20 à 100 fois plus lent qu’avec V8, et certaines opérations (`Map`, `sort`, construction de chaînes, longues chaînes de Promise) restent superlinéaires, voir [Performances](/fr/guide/performance). Nona est expérimental : il ne remplace pas Node.js tel quel et n’a fait l’objet d’aucun audit de sécurité.
