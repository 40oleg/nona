# État et feuille de route

## Version actuelle

**v0.20.0** — voir le [journal des modifications](/changelog) (en anglais). Nona est expérimental : il n’a fait l’objet d’aucun audit de sécurité et ne remplace pas Node.js tel quel.

## Audit Test262

Dernier audit complet de Test262 figé, sous Windows x64 pour v0.8.0 (`scripts/test262-audit.ps1 -Unit`, fonctionnalités d’ES2020 et antérieures, plus les ajouts ultérieurs pris en charge comme les éléments de classe d’ES2022) :

| Répertoire                   | Réussis / applicables          | Échecs restants                                  |
| ---------------------------- | ------------------------------ | ------------------------------------------------ |
| `language/`                  | **22436 / 22492** (26 ignorés) | 44 `eval`, 1 sémantique plus récente, 11 autres  |
| `built-ins/`                 | **15868 / 15933**              | 16 `eval`, 12 sémantique plus récente, 37 autres |
| `built-ins/Atomics` (agents) | **268 / 268**                  | —                                                |
| `annexB/`                    | **996 / 1016** (8 ignorés)     | 20 `eval`                                        |

La classification provient de `scripts/test262-summary.mjs` : les tests « `eval` » appellent `eval` ou `$262.evalScript` avec un texte source que Nona ne peut pas connaître à la compilation ; les tests de « sémantique plus récente » vérifient un comportement issu d’éditions ultérieures (le drapeau `v`, les séparateurs numériques, `Promise.any`, …) sous une étiquette de fonctionnalité ancienne ou absente. La suite unitaire s’exécute sous Windows et Linux en CI et compile et exécute de vrais fichiers PE et ELF, souvent sous stress du ramasse-miettes. La façon de lancer les audits est décrite sur la page [Test262](/fr/reference/test262).

## Méthodes de copie de tableaux

Vérifié après l'audit sur la révision Test262 épinglée (Windows x64, [#308](https://github.com/40oleg/nona/issues/308)) : les répertoires `built-ins/Array/prototype/{toSorted,toReversed,toSpliced,with}` et `Symbol.unscopables` passent 94 sur 94, sans échec restant. Les variantes `%TypedArray%` ne sont pas implémentées ; voir la [base Test262](https://github.com/40oleg/nona/blob/main/docs/test262.md) (en anglais).

## Échecs restants

Ce sont les échecs de l’audit v0.8.0 ; les versions suivantes n’ont pas refait l’exécution complète. Tous les échecs « autres » sous Windows sont classés :

- `built-ins/Function` (26) : le source de la fonction provient de `toString` d’objets à l’exécution — l’exception `eval`.
- `is-a-constructor` pour `AsyncFunction`, `AsyncGeneratorFunction` et `GeneratorFunction`, ainsi que le test `prototype` des fonctions fléchées async (4) : le harnais Test262 construit le texte source à l’exécution.
- Autres realms (8) : prototypes par défaut issus d’un autre realm ([#7](https://github.com/40oleg/nona/issues/7), fermée après l’audit).
- Classes créées via `Function`, y compris dans un autre realm (10, `language/expressions/class`) : texte source construit à l’exécution. Les mêmes tests via un alias de `eval` comptent comme des échecs `eval`.

L’audit de v0.8.0 a aussi relevé sept plantages (`Array.prototype.indexOf` sur `Math` avec un élément, clés héritées et propres des tableaux typés) introduits avec les éléments denses ; ils sont corrigés dans [#119](https://github.com/40oleg/nona/issues/119), et la réexécution de `built-ins/Array` et `built-ins/TypedArrayConstructors` après la correction (incluse ci-dessus) les passe.

## Travaux en cours

Lacunes du langage et de la bibliothèque :

- [#11](https://github.com/40oleg/nona/issues/11) — `eval` et `Function` avec un source calculé à l’exécution.
- [#44](https://github.com/40oleg/nona/issues/44) — réactions des Promise : un genre de promesse dédié et un enregistrement par `then`.

Performances, l’axe principal de la [feuille de route](https://github.com/40oleg/nona/blob/main/docs/roadmap.md) :

- Appels et allocation : [#47](https://github.com/40oleg/nona/issues/47) (coût des appels), [#48](https://github.com/40oleg/nona/issues/48) (objets de courte durée), [#235](https://github.com/40oleg/nona/issues/235) (inlining), [#236](https://github.com/40oleg/nona/issues/236) (remplacement scalaire).
- Code généré : [#237](https://github.com/40oleg/nona/issues/237)–[#242](https://github.com/40oleg/nona/issues/242) (chaînage optionnel, `%`, appels directs, boucles sur tableaux typés, tables de saut pour `switch`, vérifications de zone morte).
- Bibliothèque : [#155](https://github.com/40oleg/nona/issues/155) (`JSON.stringify`), [#258](https://github.com/40oleg/nona/issues/258) (balayage de départ de RegExp), [#262](https://github.com/40oleg/nona/issues/262) (`shift` et `splice` sur de grands tableaux).

La liste complète se trouve sur [GitHub](https://github.com/40oleg/nona/issues).

## Rapports détaillés

- [État d’ES2020 pour 0.17–0.20](https://github.com/40oleg/nona/blob/main/docs/status.md) (en russe)
- [Historique des versions](/changelog) et [journal de développement](https://github.com/40oleg/nona/blob/main/docs/history/development-log.md) (en russe)
- [Feuille de route : plan inspiré de V8 et architectures cibles (en anglais)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [Feuille de route des versions 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/history/release-roadmap-0.4-0.20.md) (en russe)
