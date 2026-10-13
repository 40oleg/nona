# API de l’hôte

::: info Traduction
Cette page est une traduction de la page anglaise [Host APIs](/reference/host-apis), générée à partir de [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md). La version anglaise fait foi et peut être plus récente.
:::

Les programmes Nona s’exécutent sans Node.js. Les API de l’hôte ci-dessous sont implémentées par le runtime natif et par de petits préludes JavaScript compilés dans chaque exécutable.

## Paths (`node:path`)

`node:path` / `path` implements Node.js 26 path utilities on all eight native targets.
Use `posix`, `win32`, or explicit flavor modules (`node:path/posix`,
`node:path/win32`, `path/posix`, `path/win32`). Functions: `normalize`, `join`,
`resolve`, `relative`, `parse`, `format`, `basename`, `dirname`, `extname`,
`isAbsolute`, `toNamespacedPath`, `matchesGlob`; properties: `sep`, `delimiter`.
The target selects the default flavor; resolution reads the executable's runtime
current directory. Working-directory information is read on demand; importing
Path does not initialize the full process object. [Full reference](https://github.com/40oleg/nona/blob/main/docs/path.md).

## Minuteurs et boucle d’événements

Objets globaux : `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`, `clearInterval`, `setImmediate(callback, ...args)`, `clearImmediate`, `queueMicrotask(callback)` et `performance.now()`.

- Après le programme de premier niveau, le point d’entrée exécute une boucle d’événements : elle vide la file des tâches de Promise, puis attend à plusieurs reprises l’échéance du minuteur le plus proche, exécute son callback et vide de nouveau la file. Le processus se termine lorsqu’il ne reste plus de minuteurs.
- Les minuteurs sont ordonnés par échéance, puis par ordre d’enregistrement. Le délai suit Node.js : il est converti avec `ToNumber`, et les valeurs `NaN`, inférieures à 1 ou supérieures à 2^31-1 deviennent 1.
- Les identifiants de minuteurs sont des nombres (Node.js renvoie des objets `Timeout`). `clearTimeout` et `clearInterval` acceptent n’importe quel identifiant ; les identifiants inconnus sont ignorés.
- L’attente utilise `Sleep` sous Windows et `nanosleep` sous Linux ; un programme inactif ne consomme donc pas de CPU. Sous Windows, la résolution est celle du tick du minuteur système (en général 15,6 ms).
- `performance.now()` utilise l’horloge monotone (`QueryPerformanceCounter`, `clock_gettime(CLOCK_MONOTONIC)`) et compte les millisecondes depuis le démarrage du programme.
- Une exception non interceptée dans le callback d’un minuteur termine le processus avec le code de sortie 1, comme une exception non interceptée dans le programme de premier niveau.
- Les realms créés par l’hôte Test262 n’installent pas leurs propres minuteurs.

## Programmes de longue durée

- Le ramasse-miettes compte les piles de coroutines engagées (1 Mio par fonction async ou générateur en cours, `rt.generatorStackBytes`) dans son seuil ; les coroutines abandonnées, dont seules les piles sont libérées par le balayage, déclenchent donc des collectes comme des déchets ordinaires.
- `tests/stability.test.ts` vérifie que dix fois plus de déclenchements de minuteurs (avec des tâches de Promise et des déchets à chaque tick) n’augmentent pas le pic de mémoire, que des milliers de coroutines abandonnées sont libérées et qu’un programme qui attend un minuteur de deux secondes ne consomme presque pas de CPU.
- Limites connues : le stockage des propriétés, des éléments et des Map est linéaire (#36), si bien que les programmes avec des centaines de minuteurs vivants ou de gros objets ralentissent ; sous Linux, chaque bloc du tas est un mappage mémoire distinct (#37).

## Événements

`node:events`, `events` et `nona:events` partagent un même module intégré, dont l’export par défaut est `EventEmitter`. Consultez la [référence anglaise des événements](/reference/host-apis#events) pour l’API complète prise en charge et ses limites.

## URL {#url}

Les globaux `URL` et `URLSearchParams` (également exportés par `node:url`) suivent le [URL Standard](https://url.spec.whatwg.org/) : schémas spéciaux (`http`, `https`, `ws`, `wss`, `ftp`, `file`) avec leurs ports par défaut, barres obliques inverses et segments à points, références relatives par rapport à une base, autres schémas avec une autorité ou un chemin opaque (`mailto:`, `data:`, `blob:`), ensembles standard de codage en pourcentage, nombres IPv4 dans n’importe quelle notation et adresses IPv6. Chaque composant peut être lu et modifié ; `searchParams` reste synchronisé avec `search`. `URL.canParse` et `URL.parse` sont fournis. Les hôtes sont mis en minuscules mais ne sont pas convertis avec IDNA : une URL dont l’hôte n’est pas ASCII lève `ERR_INVALID_URL`. L’analyseur n’est lié au programme que si ses sources mentionnent `URL` ou `URLSearchParams`. Ses méthodes et accesseurs sont installés sur `URL.prototype` et `URLSearchParams.prototype` lors de la création du premier objet URL ou de paramètres de recherche (ou de l’appel de `URL.canParse`), ce qui garde petit le tas des programmes qui n’analysent jamais d’URL.

## Modules de support Node.js {#nodejs-support-modules}

Ces modules existent surtout pour les [paquets npm](/reference/npm), qui les chargent au démarrage. Chacun est disponible sous `node:<name>` et `<name>`.

- `node:os` : `EOL`, `devNull`, `platform`, `arch`, `machine`, `type`, `endianness`, `homedir` (`HOME`, ou `USERPROFILE` sous Windows), `tmpdir` (`TMPDIR`/`TMP`/`TEMP`), `hostname` (`HOSTNAME`/`COMPUTERNAME` ou `localhost`), `userInfo`, `uptime`, `freemem`, `totalmem` et `constants.signals`/`priority`. `release` et `version` sont des chaînes vides, `cpus()` et `networkInterfaces()` sont vides, `loadavg()` renvoie des zéros et `availableParallelism()` renvoie 1.
- `node:tty` : `isatty(fd)` indique si l’entrée standard, la sortie standard ou la sortie d’erreur est un terminal ; `ReadStream` et `WriteStream` sont des classes minimales pour la détection de fonctionnalités.
- `node:util` : `format` et `formatWithOptions` (`%s %d %i %f %j %o %O %c %%`), `inspect` (avec `inspect.custom`, `depth`, `breakLength`, `maxArrayLength`, `customInspect`), `inherits`, `promisify` (avec `promisify.custom`), `callbackify`, `deprecate` (avertit une fois par code), `debuglog` (`NODE_DEBUG`), `isDeepStrictEqual`, `types`, `styleText`, `stripVTControlCharacters`, `TextEncoder`/`TextDecoder` et les anciens prédicats `is*`. `inspect` approche la mise en forme de Node.js : objets, tableaux, Maps, Sets, tableaux typés, fonctions, classes, erreurs, dates, valeurs encapsulées, accesseurs et références circulaires sont affichés, mais les couleurs, `showHidden`, `sorted` et le regroupement en colonnes des longs tableaux de Node.js ne sont pas reproduits exactement. `node:util/types` est `util.types`.
- `node:url` : `URL`, `URLSearchParams`, `fileURLToPath`, `pathToFileURL` (lettres de lecteur et hôtes UNC sous Windows), `urlToHttpOptions`, `domainToASCII`/`domainToUnicode` (ASCII uniquement) et les anciens `parse`, `format` et `resolve`.
- `node:assert` et `node:assert/strict` : `ok`, `equal`, `notEqual`, `strictEqual`, `notStrictEqual`, `deepEqual`, `deepStrictEqual` et leurs négations, `throws`, `doesNotThrow`, `rejects`, `doesNotReject`, `match`, `doesNotMatch`, `ifError`, `fail` et `AssertionError` (`code` `ERR_ASSERTION`). Les messages d’échec sont plus courts que les diffs de Node.js.
- `node:crypto` : `randomBytes`, `randomFill`/`randomFillSync`, `randomUUID` (version 4), `randomInt`, `getRandomValues` et `webcrypto.getRandomValues` lisent la source aléatoire du système d’exploitation (`BCryptGenRandom` sous Windows, `/dev/urandom` ailleurs). S’y ajoutent `createHash` (`md5`, `sha1`, `sha256`, `sha384`, `sha512`, avec `update`, `digest` dans n’importe quel encodage Buffer et `copy`), `createHmac`, `hash`, `getHashes` et `timingSafeEqual`. Les chiffrements, clés, signatures, la dérivation de clés et `crypto.subtle` ne sont pas fournis, et il n’y a pas de `crypto` global.
- `node:querystring` : `parse`/`decode`, `stringify`/`encode`, `escape`, `unescape`.
- `node:timers` : les fonctions de minuterie globales. `node:timers/promises` : `setTimeout`, `setImmediate` (tous deux avec un `AbortSignal`), `setInterval` comme itérateur asynchrone, et `scheduler.wait`/`yield`.
- `node:perf_hooks` : `performance` ; `PerformanceObserver` et `monitorEventLoopDelay` n’observent rien.
- `node:module` : `builtinModules` et `isBuiltin`. `createRequire` lève `ERR_NONA_UNSUPPORTED` : les modules sont résolus à la compilation du programme.
- `node:worker_threads` : `isMainThread` vaut `true`, `parentPort` et `workerData` valent `null` ; `Worker` lève `ERR_NONA_UNSUPPORTED`.
- `node:child_process` : toutes les fonctions et `ChildProcess` lèvent `ERR_NONA_UNSUPPORTED`. Le module existe pour que les paquets qui se contentent de le mentionner se chargent.
