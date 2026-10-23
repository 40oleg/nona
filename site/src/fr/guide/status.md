# Г‰tat et feuille de route

## Version actuelle

**v0.25.0** вЂ” voir le [journal des modifications](/changelog) (en anglais). Nona est expГ©rimental : il nвЂ™a fait lвЂ™objet dвЂ™aucun audit de sГ©curitГ© et ne remplace pas Node.js tel quel.

## Audit Test262

Dernier audit complet de Test262 figГ©, sous Windows x64 pour v0.8.0 (`scripts/test262-audit.ps1 -Unit`, fonctionnalitГ©s dвЂ™ES2020 et antГ©rieures, plus les ajouts ultГ©rieurs pris en charge comme les Г©lГ©ments de classe dвЂ™ES2022) :

| RГ©pertoire                   | RГ©ussis / applicables          | Г‰checs restants                                  |
| ---------------------------- | ------------------------------ | ------------------------------------------------ |
| `language/`                  | **22436 / 22492** (26 ignorГ©s) | 44 `eval`, 1 sГ©mantique plus rГ©cente, 11 autres  |
| `built-ins/`                 | **15868 / 15933**              | 16 `eval`, 12 sГ©mantique plus rГ©cente, 37 autres |
| `built-ins/Atomics` (agents) | **268 / 268**                  | вЂ”                                                |
| `annexB/`                    | **996 / 1016** (8 ignorГ©s)     | 20 `eval`                                        |

La classification provient de `scripts/test262-summary.mjs` : les tests В« `eval` В» appellent `eval` ou `$262.evalScript` avec un texte source que Nona ne peut pas connaГ®tre Г  la compilation ; les tests de В« sГ©mantique plus rГ©cente В» vГ©rifient un comportement issu dвЂ™Г©ditions ultГ©rieures (le drapeau `v`, les sГ©parateurs numГ©riques, `Promise.any`, вЂ¦) sous une Г©tiquette de fonctionnalitГ© ancienne ou absente. La suite unitaire sвЂ™exГ©cute sous Windows et Linux en CI et compile et exГ©cute de vrais fichiers PE et ELF, souvent sous stress du ramasse-miettes. La faГ§on de lancer les audits est dГ©crite sur la page [Test262](/fr/reference/test262).

## MГ©thodes de copie de tableaux

VГ©rifiГ© aprГЁs l'audit sur la rГ©vision Test262 Г©pinglГ©e (Windows x64, [#308](https://github.com/40oleg/nona/issues/308)) : les rГ©pertoires `built-ins/Array/prototype/{toSorted,toReversed,toSpliced,with}` et `Symbol.unscopables` passent 94 sur 94, sans Г©chec restant. Les variantes `%TypedArray%` ne sont pas implГ©mentГ©es ; voir la [base Test262](https://github.com/40oleg/nona/blob/main/docs/test262.md) (en anglais).

## Г‰checs restants

Ce sont les Г©checs de lвЂ™audit v0.8.0 ; les versions suivantes nвЂ™ont pas refait lвЂ™exГ©cution complГЁte. Tous les Г©checs В« autres В» sous Windows sont classГ©s :

- `built-ins/Function` (26) : le source de la fonction provient de `toString` dвЂ™objets Г  lвЂ™exГ©cution вЂ” lвЂ™exception `eval`.
- `is-a-constructor` pour `AsyncFunction`, `AsyncGeneratorFunction` et `GeneratorFunction`, ainsi que le test `prototype` des fonctions flГ©chГ©es async (4) : le harnais Test262 construit le texte source Г  lвЂ™exГ©cution.
- Autres realms (8) : prototypes par dГ©faut issus dвЂ™un autre realm ([#7](https://github.com/40oleg/nona/issues/7), fermГ©e aprГЁs lвЂ™audit).
- Classes crГ©Г©es via `Function`, y compris dans un autre realm (10, `language/expressions/class`) : texte source construit Г  lвЂ™exГ©cution. Les mГЄmes tests via un alias de `eval` comptent comme des Г©checs `eval`.

LвЂ™audit de v0.8.0 a aussi relevГ© sept plantages (`Array.prototype.indexOf` sur `Math` avec un Г©lГ©ment, clГ©s hГ©ritГ©es et propres des tableaux typГ©s) introduits avec les Г©lГ©ments denses ; ils sont corrigГ©s dans [#119](https://github.com/40oleg/nona/issues/119), et la rГ©exГ©cution de `built-ins/Array` et `built-ins/TypedArrayConstructors` aprГЁs la correction (incluse ci-dessus) les passe.

## Travaux en cours

Lacunes du langage et de la bibliothГЁque :

- [#44](https://github.com/40oleg/nona/issues/44) вЂ” rГ©actions des Promise : un genre de promesse dГ©diГ© et un enregistrement par `then`.

Performances, lвЂ™axe principal de la [feuille de route](https://github.com/40oleg/nona/blob/main/docs/roadmap.md) :

- Appels et allocation : [#47](https://github.com/40oleg/nona/issues/47) (coГ»t des appels), [#48](https://github.com/40oleg/nona/issues/48) (objets de courte durГ©e), [#235](https://github.com/40oleg/nona/issues/235) (inlining), [#236](https://github.com/40oleg/nona/issues/236) (remplacement scalaire).
- Code gГ©nГ©rГ© : [#237](https://github.com/40oleg/nona/issues/237)вЂ“[#242](https://github.com/40oleg/nona/issues/242) (chaГ®nage optionnel, `%`, appels directs, boucles sur tableaux typГ©s, tables de saut pour `switch`, vГ©rifications de zone morte).
- BibliothГЁque : [#155](https://github.com/40oleg/nona/issues/155) (`JSON.stringify`), [#258](https://github.com/40oleg/nona/issues/258) (balayage de dГ©part de RegExp), [#262](https://github.com/40oleg/nona/issues/262) (`shift` et `splice` sur de grands tableaux).

La liste complГЁte se trouve sur [GitHub](https://github.com/40oleg/nona/issues).

## Rapports dГ©taillГ©s

- [Г‰tat dвЂ™ES2020 pour 0.17вЂ“0.20](https://github.com/40oleg/nona/blob/main/docs/status.md) (en russe)
- [Historique des versions](/changelog) et [journal de dГ©veloppement](https://github.com/40oleg/nona/blob/main/docs/history/development-log.md) (en russe)
- [Feuille de route : plan inspirГ© de V8 et architectures cibles (en anglais)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [Feuille de route des versions 0.4вЂ“0.20](https://github.com/40oleg/nona/blob/main/docs/history/release-roadmap-0.4-0.20.md) (en russe)
