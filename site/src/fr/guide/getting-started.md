# Prise en main

## Installation

Téléchargez l’archive correspondant à votre système depuis la [dernière version](https://github.com/40oleg/nona/releases/latest), extrayez-la et lancez `nona --help` (`./nona --help` sous Linux, macOS et BSD). L’archive contient l’exécutable, la licence et un fichier de version ; le compilateur est un programme natif qui n’a pas besoin de Node.js. Chaque version fournit aussi `SHA256SUMS`.

| OS                          | Archive                                        | Nom de cible                 |
| --------------------------- | ---------------------------------------------- | ---------------------------- |
| Windows x64 / ARM64         | `nona-win32-x64.zip`, `nona-win32-arm64.zip`   | `win32-x64`, `win32-arm64`   |
| Linux x64 / ARM64           | `nona-linux-x64.zip`, `nona-linux-arm64.zip`   | `linux-x64`, `linux-arm64`   |
| macOS Intel / Apple Silicon | `nona-darwin-x64.zip`, `nona-darwin-arm64.zip` | `darwin-x64`, `darwin-arm64` |
| FreeBSD / OpenBSD x64       | `nona-freebsd-x64.zip`, `nona-openbsd-x64.zip` | `freebsd-x64`, `openbsd-x64` |

Sur les systèmes POSIX, lancez `chmod +x nona` si l’outil d’archivage perd la permission d’exécution. Pour essayer Nona sans rien installer, utilisez le [bac à sable](/playground).

### Compiler depuis les sources

Il vous faut Node.js 26 ou plus récent et npm, sur n’importe quel hôte qui exécute Node.js 26.

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
node dist/cli.js --help
```

Le point d’entrée du compilateur est `dist/cli.js`. `npm link` dans le dépôt ajoute une commande `nona` à votre `PATH`. Le reste de ce site écrit `nona` ; depuis un clone, lancez plutôt `node dist/cli.js`.

## Votre premier programme

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux et macOS]
nona build hello.js -o build/hello
./build/hello
```

:::

```text
Hello, from Nona!
a microtask runs before any timer
tick 1
tick 2
tick 3
done; at least 30 ms passed: true
```

Le programme se termine lorsqu’il ne reste ni minuteur ni tâche de Promise. L’exécutable fonctionne seul : copiez-le sur une machine sans Node.js, il marche toujours.

## Cibles et compilation croisée

Le compilateur est un compilateur croisé : n’importe quel hôte peut produire des exécutables pour chacune des huit [plateformes natives](/reference/native-platforms). `--target` choisit le format de sortie et le CPU ; sans lui, la cible est l’OS et le CPU de l’hôte.

```sh
nona build hello.js -o build/hello --target linux-arm64
nona build hello.js -o build/hello.exe --target win32-x64
```

Un exécutable compilé en croisé ne fonctionne que sur l’OS et le CPU correspondants. Les sorties Linux, BSD et macOS sont écrites avec le mode `0755`.

## Modules

Une entrée `.mjs`, ou toute entrée compilée avec `--module`, est un module ES. Les imports relatifs (`./util.mjs`, `../lib/x.mjs`) sont résolus à côté du fichier qui importe et compilés dans le même exécutable. Une entrée CommonJS est compilée avec tout ce qu’elle `require`.

Les modules intégrés utilisent le préfixe `nona:` (`nona:ffi`, `nona:win32`, `nona:fs`, `nona:process`) ; de nombreux noms Node.js (`node:fs`, `node:path`, `node:http`, …) sont aussi disponibles. Voir [Modules intégrés](/fr/reference/modules).

## Paquets npm

Installez les paquets avec npm comme d’habitude, puis compilez : Nona résout `node_modules` à la compilation et compile les paquets dans l’exécutable. `nona build <répertoire du paquet>` compile la commande `"bin"` ou le module `"main"` du paquet. Voir [paquets npm](/reference/npm).

## Un programme Windows sans console

```sh
nona build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` démarre le programme sans fenêtre de console et intègre un manifeste par défaut ; `--icon` et `--version-info` ajoutent des ressources affichées par l’Explorateur. Voir [Exécutables Windows](/fr/reference/windows-executables) et l’[exemple Museum](/fr/examples/museum).

## Dépannage

Les erreurs de compilation s’affichent sous la forme `file:line:column CODE: message` et le compilateur se termine avec le code 1 :

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- Une syntaxe non prise en charge est rejetée à la compilation au lieu d’échouer à l’exécution.
- `E_FFI_TARGET` signifie qu’une déclaration de DLL a été compilée pour une cible non Windows (ou un appel système pour `win32-x64`).
- `E_HOST_MODULE` signifie qu’un module intégré n’est pas disponible pour la cible.
- Une `EvalError` à l’exécution signifie que `eval` ou `Function` a reçu un texte source inconnu à la compilation.

La [référence de la ligne de commande](/fr/reference/cli) liste toutes les options et erreurs.

## Étapes suivantes

- [Exemples](/fr/examples/) — des programmes complets avec explications.
- [Prise en charge du langage](/fr/guide/language-support) et [Compatibilité et limites](/fr/guide/compatibility) — à quoi s’attendre.
- [Modules intégrés](/fr/reference/modules) — les API de l’hôte.
