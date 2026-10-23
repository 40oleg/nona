---
layout: home

hero:
    name: Nona
    text: Du JavaScript aux exГ©cutables natifs
    tagline: Un compilateur ahead-of-time qui transforme du JavaScript ES2020 en petits exГ©cutables autonomes pour Windows, Linux, macOS, FreeBSD et OpenBSD. Sans interprГ©teur embarquГ©, sans chaГ®ne de compilation C.
    actions:
        - theme: brand
          text: Commencer
          link: /fr/guide/getting-started
        - theme: alt
          text: Essayer dans le navigateur
          link: /playground
        - theme: alt
          text: QuвЂ™est-ce que Nona
          link: /fr/guide/what-is-nona
        - theme: alt
          text: GitHub
          link: https://github.com/40oleg/nona

features:
    - title: DГ©marrage en 2 ms
      details: Un hello world compilГ© dГ©marre en 2 ms environ et culmine Г  11 Mo de mГ©moire, dans un fichier dвЂ™environ 2 Mo. Node.js met 28 ms et utilise 45 Mo ; un exГ©cutable Node SEA pГЁse 124 Mo.
      link: /fr/guide/performance
    - title: Huit cibles depuis nвЂ™importe quel hГґte
      details: Windows, Linux et macOS sur x64 et ARM64, FreeBSD et OpenBSD sur x64. Compilation croisГ©e avec --target ; chaque exГ©cutable est autonome.
      link: /reference/native-platforms
    - title: Le langage ES2020
      details: Classes, gГ©nГ©rateurs, fonctions async, dГ©structuration, chaГ®nage optionnel, BigInt, appels terminaux et modules ES avec cycles et liaisons vivantes, avec des exceptions documentГ©es.
      link: /fr/guide/language-support
    - title: Paquets npm
      details: Les paquets de node_modules sont rГ©solus Г  la compilation et compilГ©s dans lвЂ™exГ©cutable, avec les modules Node.js dont ils ont couramment besoin.
      link: /reference/npm
    - title: API de lвЂ™hГґte Г  la Node.js
      details: Minuteurs et boucle dвЂ™Г©vГ©nements, process, fs, path, Buffer, flux, Г©vГ©nements, URL, ainsi que serveurs et clients HTTP et TCP.
      link: /fr/reference/modules
    - title: Un runtime natif
      details: Un ramasse-miettes mark-and-sweep prГ©cis, des chaГ®nes UTF-16, de vraies exceptions, une RangeError interceptable en cas de dГ©bordement de pile et un compilateur auto-hГ©bergГ©.
      link: /fr/guide/how-it-works
    - title: FFI et programmes graphiques Windows
      details: Appelez nвЂ™importe quelle fonction exportГ©e dвЂ™une DLL grГўce Г  des dГ©clarations rГ©solues Г  la compilation, et crГ©ez des programmes sans fenГЄtre de console, avec icГґne, manifeste et informations de version.
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

```sh [Compilation croisГ©e]
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

LвЂ™exГ©cutable contient le code machine du programme et le runtime de Nona. Il nвЂ™a pas besoin de Node.js : un exГ©cutable Windows nвЂ™importe que `KERNEL32.dll`, et un exГ©cutable Linux effectue directement des appels systГЁme, sans libc.

## Г‰tat du projet

La version actuelle est **v0.25.0** ; Nona est expГ©rimental. Il ne remplace pas Node.js tel quel et nвЂ™a fait lвЂ™objet dвЂ™aucun audit de sГ©curitГ©.

- **ConformitГ©.** Lors du dernier audit complet (v0.8.0), la suite Test262 figГ©e a rГ©ussi 22436/22492 tests language, 15868/15933 tests built-ins, 268/268 tests Atomics et 996/1016 tests Annex B sous Windows x64. Chaque Г©chec restant est classГ© sur la [page dвЂ™Г©tat](/fr/guide/status).
- **Vitesse.** Le dГ©marrage, la taille de lвЂ™exГ©cutable et la mГ©moire sont les points forts de Nona. Le calcul Г  lвЂ™intГ©rieur dвЂ™un programme nвЂ™a pas de JIT : dвЂ™un niveau comparable Г  V8 sur de simples boucles, il est de plusieurs fois Г  plusieurs dizaines de fois plus lent sur les appels, lвЂ™allocation et les programmes rГ©els de longue durГ©e. [Performances](/fr/guide/performance) donne les mesures et les points lents connus.
- **Limites.** `eval` et `Function` exigent un texte source connu Г  la compilation, et seules existent les API Node.js que Nona implГ©mente. Voir [CompatibilitГ© et limites](/fr/guide/compatibility).
