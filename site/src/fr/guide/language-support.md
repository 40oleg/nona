# Prise en charge du langage

Nona cible la 11ᵉ édition d’ECMA-262 (ES2020) avec des exceptions documentées. Cette page résume ce qui est pris en charge dans **v0.7.0** ; les chiffres proviennent de la révision figée de Test262 décrite sur la page [Test262](/fr/reference/test262).

**Pris en charge** signifie implémenté et couvert par des tests unitaires et par Test262, dans les limites indiquées dans la colonne Remarques. La matrice détaillée par fonctionnalité, avec les noms des tests, se trouve dans [`docs/language-support.md`](https://github.com/40oleg/nona/blob/main/docs/language-support.md) (en russe).

## Langage

| Domaine | État | Remarques |
| --- | --- | --- |
| Grammaire lexicale et littéraux | Pris en charge | Littéraux décimaux, hexadécimaux, binaires, octaux et BigInt, échappements Unicode dans les identifiants et les chaînes, gabarits de chaînes. Octaux hérités et commentaires de type HTML de l’Annex B dans les scripts non stricts. Les séparateurs numériques (ES2021) sont rejetés. |
| `var`, `let`, `const`, TDZ | Pris en charge | Hissage, portée de bloc, liaisons par itération, conflits de déclarations en tant qu’erreurs précoces. |
| Fonctions | Pris en charge | Déclarations et expressions, fermetures, `arguments` (mappé et non mappé), paramètres par défaut et rest, paramètres déstructurés, `this`, `new.target`, `Function.prototype.toString` avec le texte source exact. |
| Fonctions fléchées | Pris en charge | `this`, `arguments`, `new.target` et `super` lexicaux ; fonctions fléchées `async`. |
| Classes | Pris en charge | Déclarations et expressions, constructeurs, méthodes et accesseurs d’instance et statiques, noms calculés, héritage y compris des objets intégrés et `extends null`, `super()` et `super.x`. Les champs de classe et les noms privés (ES2022) ne sont pas pris en charge. |
| Déstructuration, spread | Pris en charge | Déclarations, affectations, paramètres, cibles de `for-in`/`for-of` ; spread dans les tableaux, les objets, les appels et `new`. |
| Itérateurs et générateurs | Pris en charge | Le protocole d’itération, `for-of`, fonctions et méthodes génératrices, `yield*`, `return`/`throw`. |
| Fonctions async | Pris en charge | Fonctions, fonctions fléchées et méthodes async, `await`, générateurs async et `for await`, avec l’ordre des tâches d’ES2020. |
| Opérateurs | Pris en charge | Dont `**`, le chaînage optionnel, `??`, `delete`, `in`, `instanceof` avec `Symbol.hasInstance`, l’arithmétique et les comparaisons BigInt. |
| Flot de contrôle | Pris en charge | Toutes les instructions, étiquettes, `try`/`catch`/`finally` avec valeurs de complétion, `switch`, `debugger` (sans effet). |
| Mode strict | Pris en charge | Prologues de directives, `this` strict, erreurs précoces et restrictions à l’exécution. |
| `with` | Pris en charge | Uniquement dans les scripts non stricts, avec `Symbol.unscopables`. |
| Appels terminaux propres | Pris en charge | En code strict. |
| Modules | Pris en charge | `import`/`export` sous toutes leurs formes, cycles, liaisons vivantes, objets espace de noms, `import.meta`, `import()` de modules connus à la compilation. Le `await` de premier niveau (ES2022) n’est pas pris en charge. |
| `eval`, `Function` | Partiel | Un source connu à la compilation est compilé à l’avance avec la sémantique complète de `eval` direct et indirect ; un source calculé à l’exécution lève `EvalError`. Voir [Compatibilité](/fr/guide/compatibility#eval-and-function). |
| Annex B | Pris en charge | Sémantique de compatibilité web pour les fonctions dans les blocs, `__proto__`, syntaxe RegExp héritée, `escape`/`unescape`, méthodes HTML de String, etc. |

## Objets intégrés

| Domaine | État | Remarques |
| --- | --- | --- |
| Object, Function, Boolean, Symbol, Error | Pris en charge | Y compris les descripteurs de propriétés, les opérations d’intégrité et les symboles globaux et well-known. |
| Number, Math, fonctions URI | Pris en charge | Formatage des nombres aller-retour le plus court, `toFixed`/`toExponential`/`toPrecision`, toutes les fonctions `Math` d’ES2020. |
| String | Pris en charge | Méthodes d’ES2020, normalisation Unicode, `localeCompare` sans données de locale ECMA-402. |
| RegExp | Pris en charge | Groupes nommés, lookbehind, drapeaux `s`, `u`, `y` et `g`, échappements de propriétés Unicode, `matchAll`. Le moteur est une VM à retour arrière écrite sous forme de prélude ; il est plus lent que celui de V8. |
| Array | Pris en charge | Toutes les méthodes d’ES2020, species, trous et très grandes longueurs. |
| Date, JSON | Pris en charge | Analyse et formatage des dates en UTC et en heure locale, `JSON.parse` avec reviver, `JSON.stringify` avec replacer et indentation. |
| Map, Set, WeakMap, WeakSet | Pris en charge | Sémantique d’éphémérons pour les collections faibles. |
| ArrayBuffer, DataView, tableaux typés | Pris en charge | Les 11 types de tableaux typés, y compris les tableaux BigInt, le détachement, species. |
| SharedArrayBuffer, Atomics | Pris en charge | Y compris `Atomics.wait`/`notify` avec des agents travailleurs (utilisés par Test262). |
| Proxy, Reflect | Pris en charge | Tous les pièges et invariants. |
| Promise | Pris en charge | `all`, `allSettled`, `race`, `finally`, thenables et signalement des rejets non gérés. |
| `globalThis`, `console.log` | Pris en charge | `console.log` écrit de l’UTF-8 sur la sortie standard. |

## Au-delà d’ES2020

Les fonctionnalités des éditions ultérieures ne sont pas prises en charge : champs de classe et noms privés, blocs statiques, `Promise.any`, `WeakRef` et `FinalizationRegistry`, opérateurs d’affectation logique, séparateurs numériques, le drapeau RegExp `v`, `await` de premier niveau et `Array.prototype.at`. Quelques ajouts ultérieurs à la bibliothèque, comme `String.prototype.replaceAll`, sont disponibles. Lorsque la révision figée de Test262 vérifie déjà une sémantique plus récente pour des fonctionnalités d’ES2020, Nona suit Test262 ; la page [Test262](/fr/reference/test262#semantics-newer-than-es2020-in-the-pinned-test262) liste ces cas.

Les API de l’hôte qui ne font pas partie d’ECMAScript — minuteurs, `process`, `node:fs`, `TextEncoder`/`TextDecoder` et FFI — sont décrites dans la [Référence](/fr/reference/modules).

## Résultats Test262

Exécution complète de Test262 figé sous Windows x64 (fonctionnalités d’ES2020 et antérieures) :

| Répertoire | Réussis / applicables | Échecs restants |
| --- | --- | --- |
| `language/` | 17298 / 17337 | 30 `eval`, 6 sémantique plus récente, 3 autres |
| `built-ins/` | 15491 / 15559 | 16 `eval`, 14 sémantique plus récente, 38 autres |
| `built-ins/Atomics` (agents) | 268 / 268 | — |
| `annexB/` | 996 / 1016 | 20 `eval` |

Les échecs « `eval` » utilisent un texte source calculé à l’exécution, `$262.evalScript` ou d’autres realms ; les tests de « sémantique plus récente » vérifient un comportement issu d’éditions ultérieures sous une étiquette de fonctionnalité ancienne ou absente. La [page d’état](/fr/guide/status) liste les échecs restants.
