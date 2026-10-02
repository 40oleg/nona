# Qu’est-ce que Nona

Nona est un compilateur ahead-of-time (AOT) pour JavaScript. Il lit un script ou un graphe de modules ES, le vérifie, le traduit dans sa propre représentation intermédiaire, génère du code machine x86-64 et lie un exécutable autonome : une image PE32+ pour Windows ou une image ELF64 pour Linux.

Le compilateur est écrit en TypeScript et s’exécute sur Node.js. Les programmes qu’il produit, non : ils ne contiennent ni interpréteur, ni V8, ni bytecode. Un exécutable Windows n’importe que `KERNEL32.dll` (plus les DLL qu’un programme appelle via [FFI](/fr/reference/ffi)) ; un exécutable Linux effectue directement des appels système et n’utilise pas la libc.

## Ce que vous obtenez

- **Le langage ES2020.** Classes et `super`, générateurs, fonctions async et générateurs async, `for await`, déstructuration, spread, chaînage optionnel, `??`, BigInt, Symbols, itérateurs, appels terminaux propres, `with` en mode non strict et la sémantique de compatibilité web de l’Annex B.
- **Les modules ES.** `import`/`export` statiques, cycles et liaisons vivantes, `import.meta` et `import()` dynamique de modules connus à la compilation. Les entrées `.mjs` sont compilées comme des modules.
- **La bibliothèque standard ES2020.** Object, Function, Array, String, Number, Math, Date, JSON, RegExp (groupes nommés, lookbehind, drapeaux `s` et `u`, échappements de propriétés Unicode), Map, Set, WeakMap, WeakSet, ArrayBuffer, DataView et tous les tableaux typés, SharedArrayBuffer et Atomics, Proxy et Reflect, et Promise avec une file de tâches.
- **`eval` et `Function` avec un source connu à la compilation.** Un littéral de chaîne, une concaténation de littéraux ou une variable qui ne reçoit que de telles constantes est compilé à l’avance avec la sémantique complète de `eval` direct et indirect.
- **Un runtime natif.** Un ramasse-miettes mark-and-sweep précis et non déplaçant, des chaînes UTF-16, de vraies exceptions et une `RangeError` interceptable en cas de débordement de pile.
- **Des API de l’hôte** pour de vrais programmes : une [boucle d’événements avec minuteurs](/fr/reference/host-apis), un [`process`](/fr/reference/process) global, [`node:fs`](/fr/reference/fs) synchrone avec `TextEncoder`/`TextDecoder`, et des [appels de fonctions natives](/fr/reference/ffi) avec des déclarations `nona:win32` prêtes à l’emploi.
- **Un démarrage rapide et une faible empreinte.** Un hello world compilé démarre en 2 ms environ, culmine à 11 Mo de mémoire et pèse 3 Mo : pas de runtime à initialiser ni de JIT à chauffer ([Performances](/fr/guide/performance)).
- **Des exécutables Windows** sans fenêtre de console, avec icône, manifeste et informations de version ([Exécutables Windows](/fr/reference/windows-executables)).

## Ce que Nona n’est pas

- **Pas un remplaçant de Node.js.** Il n’y a ni `require`, ni paquets npm, ni API Node.js au-delà des [sous-ensembles `fs` et `process`](/fr/reference/modules). Les API du navigateur ne sont pas disponibles non plus.
- **Pas une implémentation complète d’ES2020.** Nona implémente ES2020 avec des exceptions documentées ; voir [Prise en charge du langage](/fr/guide/language-support) et [Compatibilité et limites](/fr/guide/compatibility).
- **Pas de génération de code à l’exécution.** `eval` et `Function` exigent un texte source connu à la compilation ; les chaînes calculées à l’exécution lèvent `EvalError`.
- **Pas encore rapide en calcul.** Sans JIT, les appels, l’accès aux propriétés et l’allocation sont 20 à 100 fois plus lents qu’avec V8, et `Map`/`Set`, `sort`, la construction de chaînes et les longues chaînes de Promise restent superlinéaires en fonction de la taille des données ([Performances](/fr/guide/performance)).
- **Pas portable au-delà de x86-64.** Les cibles sont Windows 10/11 x64 et Linux x86-64.

## Sécurité

Nona n’a fait l’objet d’aucun audit de sécurité. Ne compilez pas de code source non fiable et ne considérez pas les exécutables générés comme un bac à sable : ils s’exécutent avec les mêmes droits que n’importe quel autre programme natif, et FFI peut appeler n’importe quelle DLL.

## Pour aller plus loin

- [Prise en main](/fr/guide/getting-started) — compilez le compilateur et votre premier programme.
- [Fonctionnement](/fr/guide/how-it-works) — la chaîne de compilation, le runtime et les éditeurs de liens.
- [Exemples](/fr/examples/) — d’un hello world à un changeur de fond d’écran.
