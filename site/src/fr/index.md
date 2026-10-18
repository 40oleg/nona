---
layout: home

hero:
    name: Nona
    text: Du JavaScript aux exécutables natifs
    tagline: Un compilateur ahead-of-time qui transforme du JavaScript ES2020 en petits exécutables autonomes pour Windows, Linux, macOS, FreeBSD et OpenBSD. Sans interpréteur embarqué, sans chaîne de compilation C.
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
      details: Un hello world compilé démarre en 2 ms environ et culmine à 11 Mo de mémoire, dans un fichier d’environ 2 Mo. Node.js met 28 ms et utilise 45 Mo ; un exécutable Node SEA pèse 124 Mo.
      link: /fr/guide/performance
    - title: Huit cibles depuis n’importe quel hôte
      details: Windows, Linux et macOS sur x64 et ARM64, FreeBSD et OpenBSD sur x64. Compilation croisée avec --target ; chaque exécutable est autonome.
      link: /reference/native-platforms
    - title: Le langage ES2020
      details: Classes, générateurs, fonctions async, déstructuration, chaînage optionnel, BigInt, appels terminaux et modules ES avec cycles et liaisons vivantes, avec des exceptions documentées.
      link: /fr/guide/language-support
    - title: Paquets npm
      details: Les paquets de node_modules sont résolus à la compilation et compilés dans l’exécutable, avec les modules Node.js dont ils ont couramment besoin.
      link: /reference/npm
    - title: API de l’hôte à la Node.js
      details: Minuteurs et boucle d’événements, process, fs, path, Buffer, flux, événements, URL, ainsi que serveurs et clients HTTP et TCP.
      link: /fr/reference/modules
    - title: Un runtime natif
      details: Un ramasse-miettes mark-and-sweep précis, des chaînes UTF-16, de vraies exceptions, une RangeError interceptable en cas de débordement de pile et un compilateur auto-hébergé.
      link: /fr/guide/how-it-works
    - title: FFI et programmes graphiques Windows
      details: Appelez n’importe quelle fonction exportée d’une DLL grâce à des déclarations résolues à la compilation, et créez des programmes sans fenêtre de console, avec icône, manifeste et informations de version.
      link: /fr/reference/ffi
---

## Exemple rapide

<<< ../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux et macOS]
nona build hello.js -o build/hello
./build/hello
```

```sh [Compilation croisée]
nona build hello.js -o build/hello --target linux-arm64
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

La version actuelle est **v0.18.0** ; Nona est expérimental. Il ne remplace pas Node.js tel quel et n’a fait l’objet d’aucun audit de sécurité.

- **Conformité.** Lors du dernier audit complet (v0.8.0), la suite Test262 figée a réussi 22436/22492 tests language, 15868/15933 tests built-ins, 268/268 tests Atomics et 996/1016 tests Annex B sous Windows x64. Chaque échec restant est classé sur la [page d’état](/fr/guide/status).
- **Vitesse.** Le démarrage, la taille de l’exécutable et la mémoire sont les points forts de Nona. Le calcul à l’intérieur d’un programme n’a pas de JIT : d’un niveau comparable à V8 sur de simples boucles, il est de plusieurs fois à plusieurs dizaines de fois plus lent sur les appels, l’allocation et les programmes réels de longue durée. [Performances](/fr/guide/performance) donne les mesures et les points lents connus.
- **Limites.** `eval` et `Function` exigent un texte source connu à la compilation, et seules existent les API Node.js que Nona implémente. Voir [Compatibilité et limites](/fr/guide/compatibility).
