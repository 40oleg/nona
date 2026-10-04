# API de l’hôte

::: info Traduction
Cette page est une traduction de la page anglaise [Host APIs](/reference/host-apis), générée à partir de [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md). La version anglaise fait foi et peut être plus récente.
:::

Les programmes Nona s’exécutent sans Node.js. Les API de l’hôte ci-dessous sont implémentées par le runtime natif et par de petits préludes JavaScript compilés dans chaque exécutable.

## Minuteurs et boucle d’événements

Objets globaux : `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask(callback)` et `performance.now()`.

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


## Native target availability

Windows/Linux x64 and ARM64, Intel macOS and FreeBSD/OpenBSD x64 targets are available. Apple Silicon startup is not enabled. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
