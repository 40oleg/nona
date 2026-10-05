# Prise en main

## Prérequis

- Pour exécuter le compilateur : Node.js 26 ou plus récent et npm, sous Windows ou Linux.
- Cibles : Windows 10/11 x64 (`win32-x64`, par défaut) et Linux x86-64 (`linux-x64`).

## Compiler le compilateur

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
```

Le point d’entrée du compilateur est `dist/cli.js` ; les exemples de ce site le lancent avec `node dist/cli.js`. Le paquet déclare aussi une commande `nona` : `npm link` dans le dépôt l’ajoute à votre `PATH`.

## Votre premier programme

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
node dist/cli.js build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux]
node dist/cli.js build hello.js -o build/hello --target linux-x64
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

Le compilateur est un compilateur croisé : sous Windows il peut produire des exécutables Linux, et sous Linux des exécutables Windows. `--target` choisit le format de sortie ; la valeur par défaut est `win32-x64`. Les sorties Linux sont écrites avec le mode `0755`.

## Modules

Une entrée `.mjs`, ou toute entrée compilée avec `--module`, est un module ES. Les imports relatifs (`./util.mjs`, `../lib/x.mjs`) sont résolus à côté du fichier qui importe et compilés dans le même exécutable. Les modules intégrés utilisent le préfixe `nona:` (`nona:ffi`, `nona:win32`, `nona:fs`, `nona:process`), et `node:fs` et `node:process` sont des alias des sous-ensembles de Nona ; voir [Modules intégrés](/fr/reference/modules).

## Un programme Windows sans console

```sh
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` démarre le programme sans fenêtre de console et intègre un manifeste par défaut ; `--icon` et `--version-info` ajoutent des ressources affichées par l’Explorateur. Voir [Exécutables Windows](/fr/reference/windows-executables) et l’[exemple Museum](/fr/examples/museum).

## Dépannage

Les erreurs de compilation s’affichent sous la forme `file:line:column CODE: message` et le compilateur se termine avec le code 1 :

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- Une syntaxe non prise en charge est rejetée à la compilation au lieu d’échouer à l’exécution.
- `E_FFI_TARGET` signifie qu’une déclaration de DLL a été compilée pour `linux-x64` (ou un appel système pour `win32-x64`).
- Une `EvalError` à l’exécution signifie que `eval` ou `Function` a reçu un texte source inconnu à la compilation.

La [référence de la ligne de commande](/fr/reference/cli) liste toutes les options et erreurs.

## Plateformes natives

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — Plateformes natives](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.
