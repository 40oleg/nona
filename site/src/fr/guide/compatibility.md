# Compatibilité et limites

## Périmètre

Nona cible le langage et les objets intégrés de la 11ᵉ édition normative d’ECMA-262 (juin 2020), pour les scripts et les modules ES. L’internationalisation ECMA-402, les API du navigateur et celles de Node.js sont des spécifications distinctes ; Nona ne fournit que les API de l’hôte listées dans la [Référence](/fr/reference/modules). Le contrat de complétude est tenu dans [`docs/es2020-contract.md`](https://github.com/40oleg/nona/blob/main/docs/es2020-contract.md).

Une version est décrite comme « ES2020 avec des exceptions documentées », jamais comme pleinement conforme à ES2020.

## `eval` et `Function` {#eval-and-function}

Nona compile à l’avance ; `eval` et les constructeurs dynamiques de fonctions ont donc besoin de leur texte source à la compilation :

- **Compilé à l’avance :** un littéral de chaîne, une concaténation de littéraux ou une variable à laquelle on n’affecte que de telles constantes (la valeur est comparée à l’exécution). Un `eval` direct voit la portée de l’appelant, `this`, `arguments`, `new.target` et `super` ; les formes indirectes (`(0, eval)(…)`, `globalThis.eval(…)`, `eval?.(…)`) s’exécutent dans la portée globale. Les appels à `Function`, `GeneratorFunction`, `AsyncFunction` et `AsyncGeneratorFunction` dont tous les arguments sont des littéraux sont compilés avec la sémantique de CreateDynamicFunction.
- **Non pris en charge :** un source calculé à l’exécution, des arguments spread passés à `eval` et `$262.evalScript`. Ils lèvent :

```text
EvalError: Nona compiles ahead of time: eval and Function need source text known at compile time
```

Les sources calculés à l’exécution sont suivis dans [#11](https://github.com/40oleg/nona/issues/11).

## Différences avec Node.js

| Domaine                            | Nona                                                                                                                                                                               | Node.js                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `process.argv`                     | `[execPath, ...arguments]` : `argv[1]` est le premier argument                                                                                                                     | `[node, script, ...arguments]`                                                                       |
| `process`                          | Métadonnées courantes, modification de l’environnement, horloges/ticks, E/S standard, cycle de vie/avertissements, CPU/ressources et contrôle natif du processus (les huit cibles) | Gestionnaires de signaux, IPC, rapports du tas V8, flux asynchrones complets et contrôle du terminal |
| Identifiants de minuteurs          | Nombres                                                                                                                                                                            | Objets `Timeout`                                                                                     |
| `readFileSync(path)`               | Renvoie un `Uint8Array` (sans encodage)                                                                                                                                            | Renvoie un `Buffer`                                                                                  |
| Encodages                          | `utf8` (fs); UTF-8, UTF-16LE, Latin-1, ASCII, hex, base64/base64url (Buffer) uniquement                                                                                            | Nombreux                                                                                             |
| Messages d’erreur sous Windows     | Contiennent le chemin tel que fourni                                                                                                                                               | Contiennent le chemin absolu                                                                         |
| Modules                            | `nona:*`, les modules `node:*` listés dans [Modules intégrés](/fr/reference/modules), fichiers et paquets npm résolus à la compilation                                             | Tout `node:*` et les paquets npm, résolus à l’exécution                                              |
| `require`                          | Modules CommonJS, avec des spécificateurs littéraux connus à la compilation ([paquets npm](/reference/npm))                                                                        | N’importe quel spécificateur à l’exécution                                                           |
| `console.log` sans sortie standard | La sortie est ignorée                                                                                                                                                              | La sortie est ignorée ou une erreur est levée                                                        |

## Performances

- Les tableaux, les objets et `Map`/`Set` utilisent un stockage dense et haché avec des shapes et des caches en ligne, mais les appels, les fermetures et l’allocation restent plusieurs fois plus lents qu’avec V8 ; la page [Performances](/fr/guide/performance) liste les points lents.
- Le moteur RegExp est une VM à retour arrière écrite en JavaScript. Un motif sans références arrière ni assertions avant/arrière qui revient trop souvent en arrière (sans le drapeau `u`) est terminé par un moteur en temps linéaire.
- Sous Windows, les minuteurs se réveillent au rythme du tick système (en général 15,6 ms).
- Il n’y a pas de JIT : le code est compilé une seule fois, à l’avance, sans optimisation guidée par profil.

## Parties du runtime liées

Chaque exécutable contient le runtime, mais ses grandes parties optionnelles ne sont liées que si le programme peut les atteindre. Le compilateur en décide d’après le texte de chaque source qu’il compile — le programme, ses modules et les sources de `eval`/`Function` connues à la compilation :

| Partie                                            | Taille         | Liée lorsqu’une source contient                                                                                                                          |
| ------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moteur RegExp                                     | environ 1 Mo   | un littéral RegExp, ou le nom `RegExp`, `match`, `matchAll` ou `search` (comme identifiant, nom de propriété ou dans une chaîne ou un gabarit de chaîne) |
| Tables de propriétés Unicode pour `\p{…}`/`\P{…}` | environ 2 Mo   | `\p{` ou `\P{` dans un littéral RegExp ou une chaîne, ou l’un des noms ci-dessus (un motif peut être construit à l’exécution)                            |
| Tables de normalisation Unicode                   | environ 0,7 Mo | le nom `normalize` ou `localeCompare`                                                                                                                    |

`split`, `replace` et `replaceAll` avec des arguments de type chaîne n’ont pas besoin du moteur RegExp.

Les bibliothèques intégrées écrites en JavaScript qui ne font qu’installer des globales ou des méthodes (environ 0,7 Mo au total) sont liées de la même manière, lorsqu’une source contient l’un de leurs noms :

| Partie                                                                                                                                                          | Noms                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Proxy`                                                                                                                                                         | `Proxy`                                                                                                                                       |
| `TextEncoder`, `TextDecoder`                                                                                                                                    | `TextEncoder`, `TextDecoder` (aussi liés avec `process`)                                                                                      |
| `process`                                                                                                                                                       | `process`                                                                                                                                     |
| Minuteurs, boucle d’événements, `queueMicrotask` et `performance`                                                                                               | `setTimeout`, `setInterval`, `setImmediate`, `clearTimeout`, `clearInterval`, `clearImmediate`, `queueMicrotask`, `performance`, `globalThis` |
| `.at()`, `findLast`, `findLastIndex`, `Object.hasOwn`, `AggregateError`, `Promise.any`                                                                          | `at`, `findLast`, `findLastIndex`, `hasOwn`, `AggregateError`, `any`, `unscopables`                                                           |
| Iterator helpers (`Iterator`, `Iterator.from`, `map`, `take`, `drop`, `flatMap`, `toArray`, …)                                                                  | `Iterator`, `toArray`, `take`, `drop`, `flatMap`                                                                                              |
| `escape`, `unescape`, `substr`, `setYear`, `toGMTString`, `RegExp.prototype.compile` de l’Annex B et les méthodes HTML des chaînes (`anchor`, `big`, `link`, …) | les mêmes noms                                                                                                                                |
| `Array.prototype.sort` par fusion stable                                                                                                                        | `sort`                                                                                                                                        |
| `Object.freeze`, `seal`, `isFrozen`, `isSealed` via les pièges de Proxy (sinon versions natives pour les objets ordinaires)                                     | les mêmes noms                                                                                                                                |
| `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`                                                                                  | les mêmes noms                                                                                                                                |
| Méthodes de données binaires de `ArrayBuffer`, `SharedArrayBuffer`, `DataView` et des tableaux typés (`slice`, `subarray`, `sort`, …)                           | les noms de leurs constructeurs, `Atomics`, `TypedArray` (aussi avec `process`, `Buffer` et `TextEncoder`)                                    |
| Méthodes du protocole RegExp et String (`Symbol.replace`, `String.prototype.match`, `matchAll`, `search`, `replaceAll`, …)                                      | avec le moteur RegExp, ou `replaceAll`                                                                                                        |

Un programme qui appelle `Object.getOwnPropertyNames`, `Object.getOwnPropertyDescriptors` ou `Reflect.ownKeys` les lie toutes, puisqu’il pourrait énumérer les objets intégrés ([#84](https://github.com/40oleg/nona/issues/84)). Un hello world pèse environ 1,1 Mo ; avec toutes les parties, 7 Mo.

Les helpers dont seule une certaine syntaxe a besoin sont liés quand le programme compilé les appelle, pas par nom : instructions `with`, `eval` littéral, champs de classe et noms privés, et modules ES avec `import()` et `import.meta` ([#278](https://github.com/40oleg/nona/issues/278)).

Un programme peut tout de même atteindre une partie omise par un nom calculé à l’exécution, par exemple `globalThis['Reg' + 'Exp']`. Pour le moteur RegExp et les tables Unicode, un tel appel lève une `Error` dont le message nomme la partie manquante ; une globale ou une méthode omise est simplement absente. Compilez avec `--full-runtime` (ou l’option `fullRuntime` de [`compile()`](/fr/reference/api)) pour tout lier ([#62](https://github.com/40oleg/nona/issues/62)). `--link partie,...` ajoute des parties isolées, et `--print-link` montre ce qui est lié et quel nom a sélectionné chaque partie ([#182](https://github.com/40oleg/nona/issues/182)).

## Realms

`$262.createRealm` est pris en charge pour Test262. Les fonctions, classes et le code eval créés à partir d’une source littérale par `Function`, `eval` ou les constructeurs de fonctions dynamiques d’un autre realm s’exécutent dans ce realm, et les prototypes par défaut ainsi que les erreurs des constructeurs proviennent du realm que désigne ECMA-262 ([#7](https://github.com/40oleg/nona/issues/7), [#176](https://github.com/40oleg/nona/issues/176)).

## Plateformes

- `process` et `node:fs` sont disponibles sur les huit cibles ; HTTP et TCP (`node:http`, `node:net`) sous Windows et Linux.
- Les exécutables Windows utilisent des DLL du système (dont NTDLL pour les métadonnées du processus parent) et les imports FFI déclarés ; les exécutables POSIX utilisent les services natifs de l’OS.
- Les appels de DLL par FFI exigent Windows ; les appels système bruts utilisent les numéros du noyau de la cible Linux, Darwin ou BSD choisie. Détails : [Plateformes natives](/reference/native-platforms).

## Buffer

Les globales `Buffer`, `Blob` et `File`, ainsi que les imports `node:buffer` / `buffer` / `nona:buffer`, sont disponibles sur toutes les cibles natives. Buffer prend en charge les encodages d’octets standard, les tranches partagées, la copie, la recherche et l’accès numérique. Blob/File prennent en charge les données immuables et les métadonnées. Les flux d’octets/de texte de Blob et l’enregistrement/la résolution d’URL d’objet sont disponibles ; voir [le contrat d’API et ses limites](/reference/host-apis#buffer-and-binary-data).
