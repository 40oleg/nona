# Fonctionnement

## Chaîne de compilation

```text
JavaScript source (script or module graph)
      │
      ▼
 lexer → parser → early errors and scope binding → compile-time eval/Function
                                                         │
                                                         ▼
                                     IR lowering → x86-64 code generation
                                                         │
                                                         ▼
                       runtime (native code + JS preludes) → PE32+/ELF64/Mach-O64 linker
```

Tout se déroule dans le processus du compilateur ; il n’y a ni assembleur, ni éditeur de liens, ni compilateur C externe. Le résultat est un fichier unique qui contient le code machine du programme et le runtime de Nona.

## Frontend

[`src/frontend`](https://github.com/40oleg/nona/tree/main/src/frontend) transforme le texte source en programme lié :

- `lexer.ts`, `parser.ts` et `ast.ts` produisent l’arbre syntaxique ; une syntaxe non prise en charge est une erreur de compilation.
- `binder.ts` et `declarations.ts` appliquent les erreurs précoces, résolvent chaque identifiant vers une portée (globale, module, fonction, bloc, objet `with`) et décident quelles liaisons vivent dans des fermetures.
- `modules.ts` charge le graphe de modules : imports statiques, `import()` avec spécificateurs littéraux, cycles et résolution des exports. `builtin-modules.ts` et `fs-module.ts` fournissent les modules `nona:*` et `node:*`.
- `eval-aot.ts` et `dynamic-functions.ts` compilent les appels à `eval` et `Function` dont le texte source est connu à la compilation.

## Représentation intermédiaire

[`src/ir`](https://github.com/40oleg/nona/tree/main/src/ir) abaisse le programme lié vers une IR de type registres composée de blocs, d’opérations et de terminateurs (`lower.ts`, `model.ts`) et calcule la vivacité (`liveness.ts`) pour que le ramasse-miettes ne voie que les valeurs vivantes à chaque point sûr (safepoint).

## Génération de code

[`src/backend/x64`](https://github.com/40oleg/nona/tree/main/src/backend/x64) contient un encodeur d’instructions et un assembleur x86-64 ainsi que le générateur de code, qui transforme les opérations de l’IR en appels au runtime et en chemins rapides en ligne. Le code généré et le runtime suivent la convention d’appel Win64 sur les deux cibles.

## Runtime

Chaque exécutable contient le runtime de [`src/runtime`](https://github.com/40oleg/nona/tree/main/src/runtime) :

- Les **valeurs** sont des paires étiquetées de 16 octets : undefined, null, booléens, nombres binary64, chaînes UTF-16, objets, symboles et BigInt.
- Les **objets** créés par des littéraux et des constructeurs partagent des *shapes* (classes cachées) : leurs propriétés vivent dans des emplacements de 16 octets décrits par la shape, et les caches en ligne du code généré les lisent et les écrivent après une seule comparaison de shape. Ce qu’une shape ne peut pas décrire (accesseurs, suppression, autres attributs, clés symboles) transforme l’objet en une liste ordonnée de propriétés, qui reçoit un index de hachage quand elle s’allonge.
- Le **code natif** des objets intégrés est émis en x86-64 par un petit constructeur (`RuntimeBuilder`).
- Les **préludes JavaScript** (`*-source.ts`) implémentent une partie de la bibliothèque en JavaScript et sont compilés dans chaque exécutable : le moteur RegExp, les pilotes de Promise et d’async, les utilitaires Proxy et Reflect, les minuteurs et la boucle d’événements, `process`, `TextEncoder`/`TextDecoder` et les objets intégrés de l’Annex B.

### Ramasse-miettes

Le ramasse-miettes est précis et non déplaçant : mark-and-sweep sur des racines explicites (variables globales, emplacements de pile vivants aux points sûrs, portées racines du runtime). Les piles de coroutines des générateurs et des fonctions async (1 Mio chacune) comptent dans le seuil de collecte. Sous Linux, les blocs du tas proviennent de classes de taille découpées dans des arènes de 1 Mio. Le contrat mémoire interne est décrit dans [`docs/runtime-memory.md`](https://github.com/40oleg/nona/blob/main/docs/runtime-memory.md) (en russe).

### Exceptions, coroutines et boucle d’événements

- Les exceptions déroulent les cadres natifs à l’aide de vraies données de déroulement ; un débordement de pile lève une `RangeError` interceptable.
- Les générateurs et les fonctions async s’exécutent sur leurs propres piles et changent de contexte sur `yield` et `await`.
- Après le programme de premier niveau, le point d’entrée exécute la boucle d’événements : il vide les tâches de Promise, attend le prochain minuteur sans consommer de CPU et se termine quand il ne reste plus rien ([détails](/fr/reference/host-apis)).

## Édition de liens

- **PE32+** ([`src/backend/pe`](https://github.com/40oleg/nona/tree/main/src/backend/pe)) : sections, table d’import (KERNEL32 pour le runtime, plus les DLL déclarées via FFI), relocalisations de base, données de déroulement et ressources (icône, manifeste, informations de version).
- **ELF64** ([`src/backend/elf`](https://github.com/40oleg/nona/tree/main/src/backend/elf), [`src/backend/linux`](https://github.com/40oleg/nona/tree/main/src/backend/linux)) : chaque fonction KERNEL32 utilisée par le runtime dispose d’une cale (shim) d’appel système Linux avec la même convention d’appel, si bien que le code du runtime est partagé entre les cibles.

## FFI

Un appel `define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)')` est résolu à la compilation : la déclaration devient une entrée de la table d’import PE et un thunk natif qui convertit les valeurs JavaScript, respecte l’ABI Win64 et capture `GetLastError`. Sous Linux, `define('syscall', '1', …)` déclare un appel système brut. Voir [Fonctions natives (FFI)](/fr/reference/ffi).

## Organisation du dépôt

```text
src/frontend       lexer, parser, early errors, scope binding, compile-time eval/Function
src/ir             intermediate representation, lowering and liveness
src/backend/x64    x86-64 encoding and code generation
src/backend/pe     PE32+ linker: imports, relocations, unwind data, resources
src/backend/elf    ELF64 linker; src/backend/linux: system-call shims
src/runtime        native runtime and JavaScript preludes emitted into every executable
tests              unit, integration, native-execution and compatibility tests
examples           sample programs
site               this documentation site
```

## Plateformes natives

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — Plateformes natives](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.
