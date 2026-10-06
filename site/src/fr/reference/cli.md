# Ligne de commande

## Synopsis

```text
Nona 0.9.0 — JavaScript subset to native executables
Usage: nona build <input.js> -o <output> [--target win32-x64|linux-x64|linux-arm64|win32-arm64|darwin-x64|darwin-arm64|freebsd-x64|openbsd-x64] [--module]
       [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
       [--version-info version.json]
       (.mjs inputs are compiled as modules)
       nona --help | --version
```

Depuis un clone du dépôt, lancez `node dist/cli.js …` ; après `npm link`, la même commande est disponible sous le nom `nona`.

## Options

| Option | Valeur | Description |
| --- | --- | --- |
| `-o` | chemin | Fichier de sortie. Obligatoire. Les répertoires manquants sont créés. |
| `--target` | [Native platforms](/reference/native-platforms) | PE32+, ELF64 or Mach-O64; default: host OS and CPU. |
| `--module` | — | Compile l’entrée comme un module ES. Les entrées se terminant par `.mjs` sont automatiquement des modules. |
| `--subsystem` | `console` (par défaut), `windows` | Programme graphique Windows sans fenêtre de console. `win32-x64` uniquement. Un programme graphique sans `--manifest` reçoit un manifeste par défaut. |
| `--icon` | fichier `.ico` | Intègre toutes les images du fichier d’icône. `win32-x64` uniquement. |
| `--manifest` | fichier XML | Intègre un manifeste d’application. Il doit être valide : Windows refuse de démarrer un programme dont le manifeste est mal formé. `win32-x64` uniquement. |
| `--version-info` | fichier JSON | Intègre des informations de version (`FileVersion`, `ProductVersion`, `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName`, `Comments`). `win32-x64` uniquement. |
| `--help` | — | Affiche le synopsis. |
| `--version` | — | Affiche la version du compilateur. |

Chaque option ne peut apparaître qu’une fois. Voir [Exécutables Windows](/fr/reference/windows-executables) pour les formats des ressources.

## Entrée et sortie

- L’entrée est un unique fichier source UTF-8. Une entrée de type module entraîne les modules qu’elle importe ; les modules intégrés `nona:*` et `node:*` font partie du compilateur.
- La sortie est écrite dans un fichier temporaire voisin puis renommée à sa place, si bien qu’une compilation ratée ne laisse jamais d’exécutable à moitié écrit et conserve le précédent.
- Le compilateur refuse d’écraser son entrée, y compris via un lien physique ou symbolique.
- Les sorties Linux reçoivent le mode `0755`.

## Cache du runtime

Le runtime et les préludes compilés sont identiques pour tous les programmes qui lient les mêmes parties, et leur génération représente l'essentiel d'une compilation. La ligne de commande les conserve dans un répertoire de cache : les compilations suivantes sont environ trois fois plus rapides (un hello world sous Linux : 1,1 s, puis 0,33 s). Le résultat est identique avec ou sans cache. Les entrées appartiennent à une seule version du compilateur et sont ignorées après une mise à jour.

| Variable | Effet |
| --- | --- |
| `NONA_CACHE_DIR` | Répertoire du cache. Par défaut : `%LOCALAPPDATA%\nona\cache` sous Windows, `~/Library/Caches/nona` sous macOS, `$XDG_CACHE_HOME/nona` ou `~/.cache/nona` ailleurs. |
| `NONA_CACHE=0` | Ne pas lire ni écrire le cache. |

## Diagnostics et codes de sortie

Le code de sortie vaut `0` en cas de succès et `1` pour toute erreur. Les erreurs du source s’affichent ainsi :

```text
<file>:<line>:<column> <CODE>: <message>
```

| Code | Signification |
| --- | --- |
| `E_LEX`, `E_SYNTAX` | Le source ne peut pas être découpé en jetons ou analysé, ou utilise une syntaxe non prise en charge. |
| `E_BIND` | Une erreur précoce détectée lors de la résolution des noms (déclarations en double, cibles d’affectation invalides, …). |
| `E_MODULE` | Un module ne peut pas être résolu, lu ou lié, ou des exports entrent en conflit. |
| `E_FFI_STATIC` | Un appel `define()` de `nona:ffi` ne comporte pas trois littéraux de chaîne ou a une signature invalide. |
| `E_FFI_TARGET` | Une déclaration de DLL compilée pour `linux-x64`, ou une déclaration d’appel système compilée pour `win32-x64`. |
| `E_RESOURCE` | Une icône ou des informations de version invalides, ou des ressources demandées pour `linux-x64`. |
| `E_TARGET` | Une cible ou un sous-système non pris en charge. |

Les erreurs d’arguments s’affichent sous la forme `nona: <message>`, par exemple `Unknown option: --foo`, `Duplicate option: -o`, `Missing value for --target`, `Output is required (-o <output>)`, `Unsupported target: arm64`, `Unsupported subsystem: native` ou `--subsystem requires --target win32-x64`.

## Exemples

::: code-group

```sh [Programme console]
node dist/cli.js build app.js -o build/app.exe
```

```sh [Programme graphique avec ressources]
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

```sh [Linux]
node dist/cli.js build app.js -o build/app --target linux-x64
```

:::


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.

La compilation du compilateur natif par lui-même est en cours de validation dans [#143](https://github.com/40oleg/nona/issues/143). La CLI de développement nécessite encore Node.js ; le prototype de bootstrap ne remplace pas encore la CLI distribuée.
