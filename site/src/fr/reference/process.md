# API process

::: info Traduction
Cette page est une traduction de la page anglaise [Process API](/reference/process), générée à partir de [`docs/process.md`](https://github.com/40oleg/nona/blob/main/docs/process.md). La version anglaise fait foi et peut être plus récente.
:::

`process` est un objet global (comme dans Node.js), également disponible comme export par défaut de `node:process` et `nona:process`, qui exportent en outre `argv`, `env`, `platform`, `arch`, `pid`, `execPath`, `exit` et `cwd`.

| Membre | Remarques |
| --- | --- |
| `argv` | `[execPath, ...arguments]`. Il n’y a pas de chemin de script : `argv[1]` est le premier argument (Node.js y place le chemin du script). Sous Windows, la ligne de commande est découpée selon les règles de `CommandLineToArgvW`. |
| `env` | Un objet simple contenant un instantané de l’environnement au premier accès. Les modifications ne sont pas transmises au système d’exploitation. Sous Windows, les entrées cachées de la forme `=C:` sont ignorées. |
| `exit(code?)` | Termine immédiatement avec `code`, ou avec `process.exitCode` (0 par défaut). |
| `exitCode` | Utilisé comme code de sortie lorsque le programme se termine normalement. |
| `execPath` | Chemin absolu de l’exécutable en cours. |
| `cwd()` | Répertoire de travail courant. |
| `platform`, `arch`, `pid` | `'win32'` ou `'linux'`, `'x64'`, l’identifiant du processus. |

`process` est construit paresseusement au premier accès ; les programmes qui ne l’utilisent pas ne paient donc rien au démarrage. Contrairement à Node.js, ce n’est pas un EventEmitter et il n’a ni flux `stdout`/`stdin`, ni `nextTick`, `hrtime` ou `memoryUsage`.

Implémentation : chaque image contient les fonctions hôtes des deux cibles, de sorte qu’un même programme généré peut être lié en PE comme en ELF ; chaque éditeur de liens raccorde les imports de l’autre cible à un stub qui renvoie 0. Sous Windows, `GetCommandLineW`, `GetEnvironmentStringsW`, `GetModuleFileNameW` et `GetCurrentDirectoryW` sont lus via des thunks FFI que le compilateur installe pour son propre prélude ; sous Linux, `/proc/self/cmdline`, `/proc/self/environ` et `/proc/self/exe` sont lus et `getcwd`/`exit_group` sont appelés directement.
