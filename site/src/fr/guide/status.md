# État et feuille de route

## Version actuelle

**v0.8.0** — voir le [journal des modifications](/changelog) (en anglais). Nona est expérimental : il n’a fait l’objet d’aucun audit de sécurité et ne remplace pas Node.js tel quel.

## Audit Test262

Test262 figé complet sous Windows x64 (`scripts/test262-audit.ps1 -Unit`, fonctionnalités d’ES2020 et antérieures) :

| Répertoire | Réussis / applicables | Échecs restants |
| --- | --- | --- |
| `language/` | **22436 / 22492** (26 ignorés) | 44 `eval`, 1 sémantique plus récente, 11 autres |
| `built-ins/` | **15868 / 15933** | 16 `eval`, 12 sémantique plus récente, 37 autres |
| `built-ins/Atomics` (agents) | **268 / 268** | — |
| `annexB/` | **996 / 1016** (8 ignorés) | 20 `eval` |

La classification provient de `scripts/test262-summary.mjs` : les tests « `eval` » appellent `eval` ou `$262.evalScript` avec un texte source que Nona ne peut pas connaître à la compilation ; les tests de « sémantique plus récente » vérifient un comportement issu d’éditions ultérieures (le drapeau `v`, les séparateurs numériques, `Promise.any`, …) sous une étiquette de fonctionnalité ancienne ou absente. La suite unitaire s’exécute sous Windows et Linux en CI et compile et exécute de vrais fichiers PE et ELF, souvent sous stress du ramasse-miettes. La façon de lancer les audits est décrite sur la page [Test262](/fr/reference/test262).

## Échecs restants

Tous les échecs « autres » sous Windows sont classés :

- `built-ins/Function` (25) : le source de la fonction provient de `toString` d’objets à l’exécution — l’exception `eval`.
- `is-a-constructor` pour `AsyncFunction`, `AsyncGeneratorFunction` et `GeneratorFunction` (4) : le harnais Test262 construit le texte source à l’exécution.
- Autres realms (7) : prototypes par défaut issus d’un autre realm ([#7](https://github.com/40oleg/nona/issues/7)).
- Champs de classe privés sur des objets non extensibles (2) : champs privés ES2022 sans étiquette de fonctionnalité récente.

## Travaux en cours

- [#11](https://github.com/40oleg/nona/issues/11) — `eval` et `Function` avec un source calculé à l’exécution.
- [#7](https://github.com/40oleg/nona/issues/7) — prototypes par défaut issus d’autres realms pour les constructeurs des préludes.
- [#13](https://github.com/40oleg/nona/issues/13), [#36](https://github.com/40oleg/nona/issues/36) — éléments de tableaux denses et tables de hachage pour `Map`/`Set`.

La liste complète se trouve sur [GitHub](https://github.com/40oleg/nona/issues).

## Rapports détaillés

- [État d’ES2020 pour 0.17–0.20](https://github.com/40oleg/nona/blob/main/docs/v0.17-v0.20-status.md) (en russe)
- [État de v0.6](https://github.com/40oleg/nona/blob/main/docs/v0.6-status.md) (en anglais)
- [Feuille de route : plan inspiré de V8 et architectures cibles (en anglais)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [Feuille de route des versions 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/release-roadmap-0.4-0.20.md) (en russe)
