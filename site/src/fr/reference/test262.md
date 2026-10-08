# Référence Test262

::: info Traduction
Cette page est une traduction de la page anglaise [Test262 baseline](/reference/test262), générée à partir de [`docs/test262.md`](https://github.com/40oleg/nona/blob/main/docs/test262.md). La version anglaise fait foi et peut être plus récente.
:::

Le lanceur utilise la révision amont de Test262 `7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd`. Il n’intègre volontairement pas de copie de Test262 dans ce dépôt. Sous Windows x64 :

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/tc39/test262.git work/test262
git -C work/test262 sparse-checkout set harness test/language/expressions/coalesce test/language/expressions/arrow-function test/language/expressions/array test/language/expressions/call test/language/expressions/new test/language/expressions/template-literal test/language/rest-parameters test/language/statements/function test/language/statements/for-in test/language/statements/for-of test/built-ins/Symbol test/built-ins/Array/prototype/includes test/built-ins/Array/prototype/pop test/built-ins/Math/pow test/built-ins/Math/min test/built-ins/Math/max test/built-ins/Math/abs test/built-ins/Math/sign test/built-ins/Math/sqrt test/built-ins/Math/trunc test/built-ins/Math/floor test/built-ins/Math/ceil test/built-ins/Math/round test/built-ins/String/prototype/includes test/built-ins/Number/isFinite test/built-ins/Number/isInteger test/built-ins/Number/isNaN test/built-ins/Number/isSafeInteger
git -C work/test262 rev-parse HEAD
git -C work/test262 sparse-checkout add test/built-ins/Math/imul test/built-ins/Math/clz32
npm ci
npm run test262:smoke
node scripts/test262-smoke.mjs language/expressions/coalesce
```

Le même lanceur fonctionne aussi sous Linux x64 : il compile alors des images ELF `linux-x64` au lieu de fichiers PE et réessaie en cas de course transitoire `ETXTBSY` lors de l’exec, que les threads de travail peuvent provoquer sous Linux. Définissez `TEST262_DELETE_BINARIES=1` pour supprimer chaque image de test compilée après son exécution ; sinon, les gros catalogues laissent plusieurs gigaoctets dans `work/test262-smoke`.

Le checkout doit être à la révision figée. Si le HEAD amont a avancé, faites un fetch/checkout de ce commit précis avant de lancer. `TEST262_ROOT` choisit un autre checkout et `TEST262_REPORT` un autre chemin pour le rapport JSON. `TEST262_JOBS` exécute jusqu’à huit threads de travail en parallèle (un par défaut) et préserve l’ordre du rapport. Par exemple, définissez `TEST262_JOBS=4` avant d’exécuter un gros catalogue. `TEST262_PATH_FILTER` inclut les chemins correspondants ; `TEST262_EXCLUDE_PATH_FILTER` les omet. Ce sont deux filtres de sous-chaîne littérale. La commande sans argument exécute le manifeste relu `tests/test262-smoke.json` ; un argument désignant un répertoire relatif exécute tous les fichiers `.js` de ce groupe Test262. Les rapports distinguent les échecs de compilation, les échecs à l’exécution et les tests ignorés.

## Audits complets

`scripts/test262-audit.ps1` (Windows) et `scripts/test262-audit.sh` (Linux) exécutent chaque répertoire Test262 de `language/`, `annexB/` et `built-ins/` avec `TEST262_EXCLUDE_FEATURES=post-es2020`, avec un rapport par répertoire dans `work/test262-audit` (reprise possible). `-Dirs 'a,b' -Tag r1` (PowerShell) ou `TAG=r1 scripts/test262-audit.sh <out> a b` réexécute les répertoires choisis dans un sous-répertoire dont les résultats remplacent ceux de l’exécution complète. Pour résumer et classer :

```
node scripts/test262-summary.mjs work/test262-audit --others work/others.txt
node scripts/test262-summary.mjs work/test262-audit --compare work/previous-audit
```

Le résumé classe chaque échec comme `eval` (le test utilise eval ; puisque les sources d’eval sont compilés à l’avance, il s’agit surtout de sources calculés à l’exécution, de `$262.evalScript` ou d’autres realms), `post` (sémantique postérieure à ES2020 sous une étiquette de fonctionnalité ancienne ou absente) ou `other`, et liste les fichiers `other` (`--evals <file>` liste ceux de type eval). `TEST262_FILE_LIST=<file>` restreint une exécution de `scripts/test262-smoke.mjs <group>` aux chemins listés, par exemple pour relancer une telle liste. Un checkout sans métadonnées git (par exemple copié sur une autre machine) est accepté si `work/test262/.nona-test262-revision` contient le hash du commit figé ; les tests de terminateurs de ligne lisent alors directement les fichiers.

## Sémantique postérieure à ES2020 dans le Test262 figé {#semantics-newer-than-es2020-in-the-pinned-test262}

Le Test262 figé (2026) vérifie parfois un comportement introduit après ES2020 sans étiquette de fonctionnalité post-ES2020. Politique (issue #17) : lorsqu’une édition ultérieure n’a fait que supprimer une bizarrerie observable d’ES2020 dont les programmes ne dépendent pas, Nona suit le Test262 figé ; tout le reste reste en ES2020 et est classé `post` par `scripts/test262-summary.mjs` ou listé comme écart connu. Cas où Test262 est suivi :

- `[[Set]]`, `[[GetOwnProperty]]` et `[[DefineOwnProperty]]` des TypedArray (ES2021/ES2022) : la valeur est d’abord convertie ; ensuite, un index invalide ou un tampon détaché ignore l’écriture et signale un succès ; un tampon détaché n’a pas d’éléments propres ; avec un Receiver autre que le TypedArray, un index invalide n’a aucun effet et un index valide donne un OrdinarySet sur le Receiver.
- `String.prototype.{replace,split,match,matchAll,search}` ne recherchent pas de méthodes à clé Symbol sur les arguments primitifs (ES2025).
- Les cibles d’affectation de l’Annex B sous forme d’expression d’appel lèvent ReferenceError à l’exécution en code non strict et sont des erreurs précoces en code strict (réalité du web en ES2022).

Maintenus en ES2020 (échecs classés `post`) : champs de classe et méthodes privées, séparateurs numériques, affectation logique, `Promise.any`/`AggregateError`, `Error.prototype.stack`/`cause`, drapeau RegExp `v` et indices de correspondance, await de premier niveau et les autres fonctionnalités de `postEs2020Features`. Les écarts connus restants sont listés par catalogue dans `docs/history/pr5-es2020-remaining-work.md` et dans l’état de la version.

Fonctionnalités du lanceur ajoutées pour le jalon ES2020 (2026-09) :

- `TEST262_TARGET=linux-x64` (par défaut sous Linux) lie des images ELF ; les tests de modules (`flags: [module]`) sont compilés comme un graphe de modules avec le harnais en prélude de script classique ; les tests négatifs de résolution de modules attendent une erreur de compilation.
- `TEST262_EXCLUDE_FEATURES=post-es2020` se développe en la liste des étiquettes de fonctionnalités introduites après ES2020 (voir `postEs2020Features` dans le script), plus `error-stack-accessor` et l’extension non standard `caller`.
- `$262.createRealm` est compilé lorsque le test le mentionne (jusqu’à trois realms) ; les programmes `$262.agent` sont extraits de gabarits statiques (les compteurs de boucle, les constantes de premier niveau et `$262.agent.timeouts` sont repliés) et compilés dans l’image sous forme de threads agents. Les tests `CanBlockIsFalse` sont ignorés, car l’agent principal peut bloquer.
- Les spécificateurs `import()` calculés peuvent charger les fichiers `_FIXTURE.js` du test nommés dans son source (`ModuleHost.candidates`).
- Une exception du compilateur est signalée comme échec de ce fichier (`phase: compiler-crash`) au lieu d’interrompre l’exécution.

Il s’agit d’un **adaptateur de référence**, pas du harnais Test262 complet : les tests raw et les tests négatifs à l’exécution sont pour l’instant ignorés avec une raison. Les tests négatifs d’analyse réussissent lorsque Nona rejette le source avec un diagnostic du compilateur ; l’adaptateur ne vérifie pas encore l’équivalence du type de diagnostic. Il exécute les tests de script positifs avec le harnais standard `sta.js`/`assert.js` et les `includes` déclarés. Avant toute revendication de conformité, l’adaptateur doit prendre en charge tous les modes de métadonnées applicables et les deux variantes stricte et non stricte, puis exécuter tous les groupes applicables. Pendant cette phase, les tests natifs ordinaires du dépôt restent le principal garde-fou contre les régressions. Exécutez les tests et l’oracle avec Node 26, comme l’exige `package.json` ; Node 22 diffère sur des métadonnées de fonctions observables et peut échouer lorsqu’un test scelle son objet global.

Le manifeste smoke positif à l’exécution du 2026-09-26 inclut des cas de paramètres par défaut et de spread ; ses chiffres actuels sont consignés dans le journal de développement. Des groupes raw plus larges à la révision figée donnent 72 pass / 26 fail pour `built-ins/Symbol`, 85 pass / 34 fail pour `language/statements/for-in` et 142 pass / 607 fail / 2 skip pour `language/statements/for-of`. Ces groupes incluent des cas hors du sous-ensemble implémenté et des cas ajoutés après ES2020 ; les chiffres raw sont diagnostiques et ne sont pas des pourcentages de conformité à ES2020. `built-ins/Array/prototype/includes` donne 26 pass / 4 fail / 0 skip ; les cas en échec utilisent Proxy ou des ArrayBuffer redimensionnables. `built-ins/Math/pow` donne 28 pass / 0 fail / 0 skip après l’ajout des constantes Math d’ES2020. `built-ins/Math/min` et `built-ins/Math/max` donnent chacun 10 pass / 0 fail / 0 skip, y compris la conversion de chaque argument et l’ordre des zéros signés. `built-ins/String/prototype/includes` donne 25 pass / 2 fail / 0 skip ; les cas en échec contiennent des littéraux RegExp, pas encore pris en charge. `built-ins/String/prototype/padStart` et `padEnd` donnent chacun 13 pass / 0 fail / 0 skip, y compris l’ordre de conversion et les vérifications de descripteurs. `built-ins/String/prototype/indexOf` donne 44 pass / 3 fail / 0 skip ; les cas restants dépendent de `eval` ou de BigInt. `built-ins/String/prototype/lastIndexOf` donne 25 pass / 0 fail / 0 skip. `built-ins/String/fromCharCode` donne 16 pass / 1 fail / 0 skip ; le cas restant nécessite BigInt. `built-ins/Array/prototype/indexOf` donne 193 pass / 8 fail / 0 skip, et `lastIndexOf` 189 pass / 9 fail / 0 skip après l’ajout de `isNaN` global. Les cas restants utilisent Date, RegExp, JSON, Proxy, des tampons/tableaux typés redimensionnables ou `eval`. `isFinite` global donne 15 pass / 0 fail / 0 skip. `isNaN` global donne 14 pass / 1 fail / 0 skip ; le cas restant utilise `Array.prototype.forEach` dans le corps du harnais de test. `built-ins/Array/prototype/pop` donne 23 pass / 0 fail / 0 skip après l’ajout des constantes Number d’ES2020. Les quatre groupes `Number.isFinite/isInteger/isNaN/isSafeInteger` donnent respectivement 8/9/7/10 pass, sans échec ni test ignoré. `language/rest-parameters` donne 11 pass / 0 fail / 0 skip après les paramètres déstructurés et les méthodes de classe. Après la prise en charge des paramètres par défaut, `language/expressions/arrow-function` donne 147 pass / 196 fail / 0 skip ; les 9 cas `dflt-params` de ce groupe réussissent. Avec le spread dans les littéraux de tableaux et d’objets, `language/expressions/array` donne 50 pass / 2 fail / 0 skip. Les deux cas restants nécessitent des générateurs. Avec le spread dans les appels et les constructions, `language/expressions/call` donne 72 pass / 20 fail / 0 skip et `language/expressions/new` 54 pass / 5 fail / 0 skip. Parmi les cas `spread-*`, seuls deux par groupe ne compilent pas, car ils nécessitent des générateurs. Les autres échecs des groupes concernent d’autres fonctionnalités non prises en charge, dont `eval`. Les groupes `Math.abs/sign/sqrt/trunc/floor/ceil/round` réussissent respectivement 8/5/10/12/11/11/11 tests, sans échec ni test ignoré. Les groupes `Math.imul` et `Math.clz32` réussissent respectivement 5/5 et 10/10. Après les motifs de liaison de tableaux et d’objets, les trois groupes de déclarations `language/statements/variable/dstr`, `let/dstr` et `const/dstr` réussissent respectivement 79/97, 77/93 et 77/93 cas. Chaque cas restant ne compile pas, car il utilise des générateurs ou des classes. Ce sont des groupes Test262 choisis, pas un pourcentage de conformité à ES2020. `language/destructuring/binding/syntax` donne 12 pass / 2 fail ; les deux cas restants nécessitent la syntaxe des générateurs et d’async. `language/expressions/assignment/dstr` donne 323 pass / 45 échecs de compilation / 0 échec à l’exécution ; ces échecs de compilation nécessitent des générateurs ou des classes. Les groupes de classes choisis `language/statements/class/method` et `method-static` réussissent chacun 20/20. `language/statements/class/definition` donne 46 pass / 17 échecs de compilation / 2 skips ; les cas restants nécessitent une syntaxe hors du sous-ensemble de classes actuel, dont les générateurs et les méthodes async.

Le 2026-09-25, le groupe `language/expressions/coalesce` a donné 21 pass, 3 fail, 0 skip. Un échec nécessite le type `Symbol`, alors absent ; deux exercent les appels terminaux propres en code strict et débordent la pile native. Quatre cas négatifs d’analyse ont réussi grâce au rejet par le compilateur. Ce sont des capacités manquantes suivies, et non la preuve que `??` serait cassé en général.

Le 2026-09-26, les groupes figés complets `built-ins/parseInt` et `built-ins/parseFloat` ont réussi 55/55 et 54/54. La première exécution complète de `built-ins/Array` a donné 2632 pass, 360 fail, 90 skip sur 3082 ; les 90 tests ignorés sont des tests de `Array.fromAsync` (une API postérieure à ES2020) ; elle a révélé un bogue de complétion d’itérateur et cinq dépassements de délai sur des tableaux creux, corrigés depuis. La nouvelle exécution complète d’Array donne 2640 pass, 352 fail, 90 skip. Chaque échec restant a un prérequis consigné dans [la liste des reports de v0.4](https://github.com/40oleg/nona/blob/main/docs/history/v0.4-array-deferred.json) : 150 cas d’API postérieures à ES2020, 72 cas de tampons redimensionnables et 130 autres dépendances futures ou l’exception `eval` documentée. Le manifeste positif réussit 100/100.

Après v0.4.0, le groupe complet `built-ins/String/fromCodePoint` réussit 11/11. Un cas est conservé dans le manifeste smoke figé ; à ce stade, le manifeste réussissait 101/101.

Le groupe complet `built-ins/String/raw` réussit 30/30. Son cas de gabarit étiqueté est inclus dans le manifeste smoke positif figé. Le manifeste mis à jour réussit 102/102 ; les exemples compatibles sous Windows et Linux réussissent chacun 54/54.

Le groupe complet `built-ins/String/prototype/concat` réussit 22/22. Un cas est inclus dans le manifeste smoke positif. Le manifeste mis à jour réussit 103/103 ; les exemples compatibles sous Windows et Linux réussissent chacun 55/55.

Le groupe `built-ins/String/prototype/toUpperCase` donne 24 pass / 2 fail / 0 skip. Les deux échecs nécessitent `RegExp` et `eval` direct, tous deux suivis en dehors de v0.5. Le cas des correspondances de casse spéciales d’Unicode figure dans le manifeste smoke positif, désormais à 104/104. Les exemples compatibles sous Windows et Linux réussissent chacun 56/56.

Le groupe `built-ins/String/prototype/toLowerCase` donne 28 pass / 2 fail / 0 skip. Ses deux échecs nécessitent eux aussi `RegExp` et `eval` direct. La correspondance conditionnelle du sigma final, y compris les caractères `Case_Ignorable`, réussit. Le manifeste smoke positif est à 105/105 ; les exemples compatibles à 57/57 sous Windows et Linux.

Le groupe complet `built-ins/Number/prototype/toFixed` donne 15 pass / 1 fail / 0 skip. Le cas en échec utilise BigInt, prévu pour v0.8. Le cas d’exactitude figure dans le manifeste smoke positif, désormais à 106/106 ; les exemples compatibles réussissent 58/58 sous Windows et Linux.

Les groupes complets `built-ins/Number/prototype/toExponential` et `built-ins/Number/prototype/toPrecision` réussissent 15/15 et 17/17. Leurs cas de valeurs ordinaires figurent dans le manifeste smoke positif, désormais à 108/108. Les exemples compatibles réussissent 59/59 sous Windows et Linux.

Une première exécution complète de `built-ins/Math`, avant l’ajout de la trigonométrie, donnait 176 pass / 151 fail sur 327. La plupart des échecs concernent des fonctions transcendantes d’ES2020 manquantes ; `f16round` et `sumPrecise` sont des API ultérieures. Les groupes complets `Math.sin`, `Math.cos` et `Math.tan` réussissent désormais 8/8, 9/9 et 9/9. Le smoke positif est à 111/111 ; les exemples compatibles réussissent 60/60 sous Windows et Linux.

Les groupes complets `Math.log`, `Math.log2` et `Math.log10` réussissent 9/9, 5/5 et 5/5. Le smoke positif est à 114/114 ; les exemples compatibles réussissent 61/61 sous Windows et Linux.

Les groupes complets `Math.exp` et `Math.expm1` réussissent 9/9 et 5/5. Le smoke positif est à 116/116 ; les exemples compatibles réussissent 62/62 sous Windows et Linux.

Les groupes complets `Math.atan` et `Math.atan2` réussissent 7/7 et 11/11. Le smoke positif est à 118/118 ; les exemples compatibles réussissent 63/63 sous Windows et Linux.

Le groupe complet `Math.log1p` réussit 5/5. Le smoke positif est à 119/119 ; les exemples compatibles réussissent 64/64 sous Windows et Linux.

Le groupe complet `Math.cbrt` réussit 5/5. Le smoke positif est à 120/120 ; les exemples compatibles réussissent 65/65 sous Windows et Linux.

Les groupes complets `Math.asin` et `Math.acos` réussissent 9/9 et 8/8. Le smoke positif est à 122/122 ; les exemples compatibles réussissent 66/66 sous Windows et Linux.

Les groupes complets `encodeURI` et `encodeURIComponent` réussissent chacun 31/31. Le smoke positif est à 124/124 ; les exemples compatibles réussissent 67/67 sous Windows et Linux.

Les groupes complets `decodeURI` et `decodeURIComponent` réussissent 55/55 et 56/56. Le smoke positif est à 126/126 ; les exemples compatibles réussissent 68/68 sous Windows et Linux.

Le groupe complet `Math.atanh` réussit 5/5. Le smoke positif est à 127/127 ; les exemples compatibles réussissent 69/69 sous Windows et Linux. L’exécution complète des tests natifs après le travail sur les URI a donné 1632 réussites, 27 tests ignorés et aucun échec.

Les groupes complets `Math.asinh` et `Math.acosh` réussissent 5/5 et 7/7. Le smoke positif est à 129/129 ; les exemples compatibles réussissent 70/70 sous Windows et Linux.

Les groupes complets `Math.sinh`, `Math.cosh` et `Math.tanh` réussissent chacun 5/5. Le smoke positif est à 132/132 ; les exemples compatibles réussissent 71/71 sous Windows et Linux.

Une exécution complète de `built-ins/Math` donne désormais 312 réussites et 15 échecs sur 327. Les 15 échecs concernent `Math.f16round` et `Math.sumPrecise`, postérieurs à ES2020. Cela ne mesure pas la précision des fonctions transcendantes pour des entrées finies arbitraires. La réduction des grands angles pour `sin`, `cos` et `tan` a été ajoutée après cette exécution et vérifiée face à Node.js 26 sur l’ensemble des exposants binaires.

`String.prototype.toLocaleLowerCase` et `toLocaleUpperCase` réussissent 26/28 et 24/26. Les quatre tests restants nécessitent RegExp ou eval. Le smoke positif est à 134/134 ; les exemples compatibles réussissent 72/72 sous Windows et Linux. Les correspondances propres à une locale au-delà de la correspondance Unicode par défaut restent à évaluer.

`String.prototype.split` réussit 86/120 cas Test262. Les 34 restants nécessitent RegExp, BigInt ou eval. Les séparateurs chaîne, les limites, les séparateurs primitifs et les hooks `Symbol.split` personnalisés sont vérifiés. Le smoke positif est à 137/137 ; les exemples compatibles réussissent 73/73 sous Windows et Linux.

`Math.sin`, `Math.cos` et `Math.tan` pour les grands angles utilisent désormais une table de `2/pi` en virgule fixe sur 1152 bits. Les tests natifs réussissent 48/48, dont 80 valeurs finies déterministes sur les exposants 63 à 1022. Les exemples compatibles réussissent 74/74 sous Windows et Linux.

`String.prototype.replace` réussit 24/55 cas Test262. Les 31 restants nécessitent RegExp, BigInt ou la construction dynamique de fonctions. La recherche de chaînes, le remplacement fonctionnel, les motifs de remplacement et `Symbol.replace` personnalisé sont couverts. Le smoke positif est à 140/140 ; les exemples compatibles réussissent 75/75 sous Windows et Linux.
