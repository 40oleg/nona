# Performances : Nona face à Node.js, Deno et Bun

::: info Traduction
Cette page est une traduction de la page anglaise [Performance](/guide/performance), générée à partir de [`PERFORMANCE.md`](https://github.com/40oleg/nona/blob/main/PERFORMANCE.md). La version anglaise fait foi et peut être plus récente. `node bench/run.mjs` reproduit les mesures.
:::

Mesuré le 2026-10-01 avec Nona `v0.7.0` (commit `b31c4d6`). Les scripts se trouvent dans [`bench/`](https://github.com/40oleg/nona/blob/main/bench/) ; `node bench/run.mjs` reproduit tous les tableaux ci-dessous.

## Résumé

Nona l’emporte sur tout ce qui se passe avant et autour du programme : un hello world compilé démarre en **1,8 ms** (Bun 4,5, Deno 15, Node 28), l’exécutable pèse **7 Mo** (81 à 124 Mo pour `bun --compile`, `deno compile` et Node SEA) et son RSS culmine à **11 Mo** là où Node en demande 45.

À l’intérieur du programme, la tendance s’inverse. Le calcul ordinaire — appels de fonctions, fermetures, classes, tableaux typés, allocation — est **20 à 100 fois plus lent** qu’avec V8/JavaScriptCore, ce qui correspond à l’écart attendu entre un compilateur AOT sans caches en ligne ni retour d’information sur les types et un JIT. Plusieurs opérations de base ne sont pas seulement plus lentes, mais **superlinéaires en fonction de la taille des données**, et c’est ce qui fait échouer les vrais programmes au lieu de simplement les ralentir :

| Opération | Nona à 10k | Nona à 100k | Croissance | Node à 100k |
| --- | --- | --- | --- | --- |
| `Map.set` × N | 0.83 s | 92.7 s | ×111 (quadratique) | 14 ms |
| `Set.add` + `Set.has` × N | 1.7 s | 182 s | ×107 (quadratique) | 12 ms |
| `sort()` de N nombres | 1.3 s | 20.4 s | ×16 (quadratique) | 39 ms |
| Chaîne de Promise de N `.then` | 363 s | > 10 min | ×145 de 1k à 10k | 7 ms |
| `JSON.stringify`, N objets | 1.4 s, 1.7 GB RSS | > 10 min | — | 1.6 ms |
| `s += "abc" + i` × N | 0.88 s (10k) | — | ×20 de 2k à 10k | 0.3 ms |
| `readFileSync(..., "utf8")` | 0.37 s (1 MB) | 25 s (10 MB) | ×68 pour ×10 | 25 ms |

L’auteur documente la cause profonde du premier groupe : le stockage des propriétés, des éléments et des `Map` repose sur un parcours linéaire (issue #36). Les chaînes sont des tampons UTF-16 immuables copiés à chaque concaténation, et `Array.prototype.join`, `JSON.stringify` et la file de tâches des Promise reposent sur ces deux primitives.

## Environnement et méthode

| Participant | Version | Commande |
| --- | --- | --- |
| Nona | 0.7.0 | `node dist/cli.js build x.js -o x --target linux-x64`, puis `./x` |
| Node.js | 22.22.0 | `node x.js` |
| Deno | 2.9.6 | `deno run -A x.js` |
| Bun | 1.4.2 | `bun x.js` |

Linux x86-64, Intel Xeon 2,10 GHz, 2 vCPU, 7 Go de RAM (bac à sable dans le cloud). Les quatre exécutent le même fichier source. Chaque script chronomètre ses phases avec `performance.now()` et les affiche en JSON ; le temps total et le RSS maximal proviennent du harnais. Les chiffres sont des médianes de 5 exécutions (runtimes) ou de 3 à 5 exécutions (Nona) ; la variation de Nona d’une exécution à l’autre est inférieure à 5 %. Chaque script lit `SCALE` dans l’environnement, si bien que « N = 100k » signifie `SCALE=0.1` du 1M nominal. Le démarrage est mesuré avec `hyperfine` (30 exécutions, 5 de chauffe). Nona ne compile que de l’ES2020 avec un sous-ensemble synchrone de `fs` et sans npm ; les scripts restent donc dans ce sous-ensemble (`import fs from "node:fs"` au lieu de `require`).

Lorsque Nona n’a pas terminé une taille en 10 minutes, la cellule l’indique ; les colonnes des autres runtimes pour cette taille restent de vraies mesures.

## 1–4. Démarrage, taille de l’exécutable, temps de compilation, mémoire

| Mode d’exécution du programme | Démarrage, hello world (ms, médiane de 30) | Exécutable (Mo) | Compiler hello world en exe (s) | RSS maximal, hello world (Mo) |
| --- | --- | --- | --- | --- |
| Nona, ELF compilé | **1.8** | **7.3** | 2.7 | **11.5** |
| Bun, `bun build --compile` | 3.2 | 81.3 | **0.25** | 14.5 |
| Bun, `bun x.js` | 4.5 | 79.5 (le runtime lui-même) | — | 13.1 |
| Deno, `deno compile` | 12.1 | 104.3 | 0.70 | 33.0 |
| Deno, `deno run x.js` | 15.0 | 95.6 (le runtime lui-même) | — | 28.3 |
| Node, SEA via postject | 24.9 | 123.5 | 7.7 | 58.3 |
| Node, `node x.js` | 27.6 | 123.4 (le runtime lui-même) | — | 45.5 |

Le temps de compilation de Nona dépend à peine du programme (2,7 s pour hello world, 3,0 s pour le test matrice/BigInt) : l’essentiel est consacré à compiler le runtime et les préludes JavaScript qui entrent dans chaque exécutable.

RSS maximal sous charge, scripts en taille réelle (Mo) :

| Script | Node | Deno | Bun | Nona |
| --- | --- | --- | --- | --- |
| 09 — 5M objets à courte durée de vie | 53 | 44 | 29 | **11** |
| 13 — `Float64Array` 10M | 204 | 198 | 181 | 157 |
| 15 — classes, 1M `new Square` | 129 | 124 | 77 | 777 |
| 14 — appels, 1M fermetures | 188 | 214 | 120 | 1 993 |
| 11 — JSON, 3k objets (échelle N = 10k) | 74 | 63 | 48 | 1 732 |

Le ramasse-miettes mark-and-sweep garde minuscules les charges qui ne produisent que des déchets, mais toute charge qui conserve un million de fermetures ou d’objets vivants, ou qui construit des chaînes, gonfle bien au-delà des runtimes à JIT.

## 5–7. Tableaux, objets et Map/Set, chaînes et RegExp

N = 100 000, médiane, ms :

| Opération | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- |
| `push` × N | 5.2 | 6.0 | 3.4 | 192 | ×37 |
| `Array.from({length: N})` | 5.1 | 4.9 | 3.1 | 183 | ×36 |
| `new Array(N)` + remplissage | 1.9 | 1.3 | 1.5 | 276 | ×143 |
| Somme avec une boucle `for` | 1.5 | 1.9 | 0.6 | 27 | ×18 |
| `map` → `filter` → `reduce` | 4.4 | 4.2 | 4.0 | 119 | ×27 |
| `sort` de N nombres avec comparateur | 39 | 40 | 31 | 20 400 | ×523 |
| Créer N objets `{id, x, y, name}` | 14.1 | 11.9 | 9.7 | 468 | ×33 |
| Lire 3 propriétés × N | 6.8 | 7.4 | 1.2 | 62 | ×9 |
| `Map.set` × N | 13.8 | 14.4 | 18.4 | 92 700 | ×6 700 |
| `Map.get` × N | 5.1 | 5.3 | 5.1 | 90 700 | ×18 000 |
| `Set.add` + `Set.has` × N | 12.2 | 9.7 | 15.2 | 182 500 | ×15 000 |

Au N = 1M nominal, Node/Deno/Bun exécutent tout le script de tableaux en 0,4 à 0,9 s et le script d’objets en 0,5 à 0,6 s. Nona a trié 1M nombres en 278 s lors d’une première exécution ; le script d’objets complet ne s’est pas terminé en 10 minutes.

Les chaînes sont mesurées à N = 10 000, car à 100 000 le binaire Nona a été tué par le noyau après 30 s à 6 Go de RSS : `Array.prototype.join` sur 20k morceaux construit des chaînes intermédiaires et sa mémoire croît de façon quadratique (4k morceaux → 450 Mo). `s += …` est quadratique en temps (2k itérations → 43 ms, 10k → 881 ms) ; le moteur RegExp est linéaire mais consacre environ 0,5 ms par caractère.

| Opération (N = 10 000) | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- |
| `s += "abc" + i` × 2 000 | 0.29 | 0.49 | 0.89 | 45 | ×156 |
| `split("1")` + `join("-")` | 0.12 | 0.14 | 0.29 | 56 | ×470 |
| `indexOf` dans une boucle | 0.02 | 0.02 | 0.02 | 0.06 | ×3 |
| `/abc(\d{3})-/g.exec` dans une boucle | 0.06 | 0.07 | 0.10 | 794 | ×13 000 |

À un N aussi petit, les chiffres de Node/Deno/Bun relèvent surtout de la chauffe du JIT ; les rapports de ce tableau sont donc plutôt sous-estimés que surestimés.

## 8–10. Calcul numérique, pression sur le GC, async

| Opération | Taille | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- | --- |
| `fib(32)` récursif | — | 23 | 24.5 | 18.3 | 568 | ×25 |
| Produit de matrices 200×200, tableaux imbriqués | — | 30 | 35.6 | 36.6 | 25 700 | ×857 |
| Factorielle BigInt 30! | 30 | 0.17 | 0.11 | 0.22 | 0.25 | ×1.5 |
| Factorielle BigInt 300! | 300 | 0.20 | 0.28 | 0.37 | 2 340 | ×11 700 |
| Factorielle BigInt 3000! | 3000 | 3.8 | 3.1 | 3.8 | > 10 min | — |
| 500k `{a, b: [..], c: {..}}` à courte durée de vie | 500k | 19.7 | 15.6 | 27.2 | 1 840 | ×93 |
| 5M objets à courte durée de vie | 5M | 94.6 | 98.1 | 156 | 20 100 | ×213 |
| Chaîne de Promise, `.then` × 10 000 | 10k | 6.8 | 4.1 | 2.9 | 363 000 | ×53 000 |
| `setTimeout(fn, 0)` × 100, séquentiel | 100 | 117 | 221 | 114 | 123 | ×1.0 |

Le `fib(32)` récursif est le meilleur résultat de calcul de Nona (×25), à peu près le niveau d’un interpréteur sans JIT. Le produit de matrices lit `A[i][k]` 8 millions de fois via le stockage linéaire des éléments. La multiplication BigInt se dégrade avec la taille des opérandes : 30! égale Node, 300! prend 2,3 s, 3000! ne s’est pas terminé.

La chaîne de Promise est la deuxième falaise après les collections : 1 000 `.then` prennent 2,6 s, 4 000 prennent 40 s et 10 000 prennent 363 s — pire que quadratique, ce qui concorde avec une file de tâches reparcourue depuis le début à chaque tâche. Les minuteurs se comportent bien : `setTimeout(fn, 0)` coûte environ 1,2 ms partout, car tous les runtimes ramènent le délai à 1 ms minimum.

## 11–13. JSON, E/S de fichiers, tableaux typés

| Opération | Taille | Node | Deno | Bun | Nona | Nona / Node |
| --- | --- | --- | --- | --- | --- | --- |
| `JSON.stringify` | 3 000 objets, 280 KB | 1.6 | 1.1 | 1.1 | 1 400 | ×900 |
| `JSON.parse` | 280 KB | 3.8 | 2.1 | 3.7 | 173 | ×45 |
| `appendFileSync` × 10 | 10 MB | 5.9 | 12.0 | 3.3 | 4 530 | ×770 |
| `readFileSync(path, "utf8")` | 10 MB | 25.2 | 26.8 | 6.0 | 25 200 | ×1 000 |
| `Float64Array` : remplissage, somme, map | 1M | 21.1 | 17.1 | 16.2 | 360 | ×17 |
| `Float64Array` : remplissage, somme, map | 10M | 159 | 132 | 115 | 3 240 | ×20 |

Les tableaux typés sont le seul test de données où Nona reste dans le même ordre de grandeur et passe linéairement à l’échelle. JSON et les fichiers se heurtent à la même construction quadratique de chaînes : `JSON.stringify` de 3 000 objets prend 1,4 s et 1,7 Go ; le scénario complet à 300k objets / 30 Mo et le fichier de 100 Mo ne se sont pas terminés en 10 minutes, là où Node, Deno et Bun prennent 0,1 à 0,7 s.

## 14–15. Appels de fonctions, fermetures, classes

| Opération | N = 100k | | | | | N = 1M | |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | Node | Deno | Bun | Nona | Nona / Node | Node | Nona |
| Appel `add(a, b)` × 10N | 5.3 | 7.6 | 6.1 | 375 | ×71 | 10.9 | 3 590 |
| Créer et appeler N fermetures | 21.3 | 18.1 | 20.6 | 872 | ×41 | 256 | 12 000 |
| `call` + `apply` × 4N | 9.1 | 10.8 | 5.2 | 656 | ×72 | 32.6 | 12 000 |
| Méthode via une chaîne d’héritage × 5N | 5.3 | 3.7 | 5.8 | 354 | ×67 | 7.6 | 3 710 |
| Appel polymorphe, 3 classes × 5N | 5.5 | 8.6 | 15.5 | 532 | ×96 | 21.5 | 5 830 |
| `new Square(i)` × N | 14.9 | 9.0 | 13.7 | 774 | ×52 | 112 | 10 560 |

Ces opérations passent linéairement à l’échelle ; l’écart représente donc ici le coût pur d’un appel sans JIT : V8 et JavaScriptCore intègrent `add(s, i)` en ligne et mettent en cache la recherche de méthode au point d’appel, tandis que Nona emprunte à chaque fois le chemin générique avec une recherche dans la chaîne de prototypes. `apply` avec un nouveau tableau à chaque appel est l’exception qui croît plus vite que linéairement (×72 à 100k, ×369 à 1M), tout comme `new` avec un million d’instances vivantes (777 Mo de RSS).

## Où passe le temps

En regroupant les rapports par rapport à Node selon leur cause :

1. **Stockage linéaire des propriétés/éléments/Map** (issue #36) : `Map`/`Set` ×7 000–18 000, `sort` ×523, produit de matrices ×857, `new Array(N)` ×143. Corriger les structures de données ramène ces cas au ~×30 du code environnant.
2. **Copie de chaînes** : concaténation ×156, `join` ×470 avec une mémoire quadratique, `JSON.stringify` ×900, `readFileSync` utf8 ×1 000, `appendFileSync` ×770. Une représentation en rope ou en builder, ainsi qu’un transcodage UTF-8/UTF-16 en bloc, règlent tout cela d’un coup.
3. **File de tâches des Promise** ×53 000 et **multiplication BigInt** ×11 700 à 300 chiffres : deux problèmes algorithmiques, indépendants de la génération de code.
4. **VM RegExp** ×13 000 : un interpréteur de bytecode écrit en JavaScript et lui-même compilé par Nona, qui paie donc le surcoût d’appel ×30 à chaque instruction.
5. **Absence de JIT** : appels ×70, fermetures ×41, classes ×50–100, allocation ×93–213, `fib` ×25, tableaux typés ×17–20, parcours de tableaux ×18–37. Les réponses habituelles dans un contexte AOT sont les caches en ligne, l’accès aux propriétés fondé sur les formes (shapes) et l’arithmétique sur des nombres non boxés.
