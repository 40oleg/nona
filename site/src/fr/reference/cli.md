# Ligne de commande

## Synopsis

```text
Nona 0.25.0 вЂ” JavaScript subset to native executables
Usage: nona build <input.js|package directory> -o <output> [--target win32-x64|linux-x64|linux-arm64|win32-arm64|darwin-x64|darwin-arm64|freebsd-x64|openbsd-x64] [--module]
       [--conditions name]... [--full-runtime] [--link part,...] [--print-link]
       [--call-stats] [--coverage dir] [--print-asm]
       [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
       [--version-info version.json]
       (.mjs inputs are compiled as modules)
       nona --help | --version
```

LвЂ™exГ©cutable `nona` publiГ© accepte ces arguments. Depuis un clone du dГ©pГґt, lancez `node dist/cli.js вЂ¦` ; aprГЁs `npm link`, la mГЄme commande est disponible sous le nom `nona`.

## Options

| Option               | Valeur                                          | Description                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `-o`                 | chemin                                          | Fichier de sortie. Obligatoire. Les rГ©pertoires manquants sont crГ©Г©s.                                                                                                                                                                                                                                                          |
| `--target`           | [Native platforms](/reference/native-platforms) | PE32+, ELF64 or Mach-O64; default: host OS and CPU.                                                                                                                                                                                                                                                                            |
| `--module`           | вЂ”                                               | Compile lвЂ™entrГ©e comme un module ES. Les entrГ©es se terminant par `.mjs` sont automatiquement des modules.                                                                                                                                                                                                                     |
| `--conditions`, `-C` | nom                                             | Ajoute une condition `exports`/`imports` de package.json, essayГ©e avant celles de Nona (`nona`, `node`, `import` ou `require`, `default`) ; `--conditions=name` fonctionne aussi. Peut ГЄtre rГ©pГ©tГ©e. Voir [paquets npm](/reference/npm#resolution).                                                                            |
| `--print-asm`        | вЂ”                                               | Affiche sur stdout lвЂ™assembleur x86-64 gГ©nГ©rГ© pour les fonctions du programme lui-mГЄme (ni le runtime ni ses prГ©ludes) : lвЂ™Г©tiquette de chaque fonction, puis une ligne par instruction avec son dГ©calage, ses octets encodГ©s et son texte en syntaxe Intel. Avec cette option, `-o` peut ГЄtre omis. Cibles x86-64 uniquement. |
| `--link`             | parties, sГ©parГ©es par des virgules              | Lie aussi ces parties optionnelles (par exemple `--link proxy,regexp`), pour un programme qui ne les atteint que par des noms construits Г  lвЂ™exГ©cution. Moins coГ»teux que `--full-runtime` ; `--print-link` affiche les noms des parties.                                                                                      |
| `--print-link`       | вЂ”                                               | Affiche les parties optionnelles du runtime liГ©es et la raison de chacune : le nom du code source qui lвЂ™a sГ©lectionnГ©e, `--link` ou la partie qui en a besoin. `-o` peut alors ГЄtre omis.                                                                                                                                      |
| `--subsystem`        | `console` (par dГ©faut), `windows`               | Programme graphique Windows sans fenГЄtre de console. `win32-x64` uniquement. Un programme graphique sans `--manifest` reГ§oit un manifeste par dГ©faut.                                                                                                                                                                          |
| `--icon`             | fichier `.ico`                                  | IntГЁgre toutes les images du fichier dвЂ™icГґne. `win32-x64` uniquement.                                                                                                                                                                                                                                                          |
| `--manifest`         | fichier XML                                     | IntГЁgre un manifeste dвЂ™application. Il doit ГЄtre valide : Windows refuse de dГ©marrer un programme dont le manifeste est mal formГ©. `win32-x64` uniquement.                                                                                                                                                                     |
| `--version-info`     | fichier JSON                                    | IntГЁgre des informations de version (`FileVersion`, `ProductVersion`, `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName`, `Comments`). `win32-x64` uniquement.                                                                                                              |
| `--help`             | вЂ”                                               | Affiche le synopsis.                                                                                                                                                                                                                                                                                                           |
| `--version`          | вЂ”                                               | Affiche la version du compilateur.                                                                                                                                                                                                                                                                                             |

Chaque option, sauf `--conditions`, ne peut apparaГ®tre quвЂ™une fois. Voir [ExГ©cutables Windows](/fr/reference/windows-executables) pour les formats des ressources.

## EntrГ©e et sortie

- LвЂ™entrГ©e est un unique fichier source UTF-8. Une entrГ©e de type module entraГ®ne les modules quвЂ™elle importe, et une entrГ©e CommonJS ceux quвЂ™elle charge avec `require`, y compris les paquets npm de `node_modules` ([paquets npm](/reference/npm)) ; les modules intГ©grГ©s `nona:*` et `node:*` font partie du compilateur.
- LвЂ™entrГ©e peut ГЄtre un rГ©pertoire de paquet : Nona compile le fichier que dГ©signe le champ `"bin"` de son `package.json` (lвЂ™unique commande, ou celle qui porte le nom du paquet), sinon son `"main"` ou `index.js`.
- La sortie est Г©crite dans un fichier temporaire voisin puis renommГ©e Г  sa place, si bien quвЂ™une compilation ratГ©e ne laisse jamais dвЂ™exГ©cutable Г  moitiГ© Г©crit et conserve le prГ©cГ©dent.
- Le compilateur refuse dвЂ™Г©craser son entrГ©e, y compris via un lien physique ou symbolique.
- Les sorties Linux reГ§oivent le mode `0755`.

## Cache du runtime

Le runtime et les prГ©ludes compilГ©s sont identiques pour tous les programmes qui lient les mГЄmes parties, et leur gГ©nГ©ration reprГ©sente l'essentiel d'une compilation. La ligne de commande les conserve dans un rГ©pertoire de cache : les compilations suivantes sont environ trois fois plus rapides (un hello world sous Linux : 1,1 s, puis 0,33 s). Le rГ©sultat est identique avec ou sans cache. Les entrГ©es appartiennent Г  une seule version du compilateur et sont ignorГ©es aprГЁs une mise Г  jour.

| Variable         | Effet                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NONA_CACHE_DIR` | RГ©pertoire du cache. Par dГ©faut : `%LOCALAPPDATA%\nona\cache` sous Windows, `~/Library/Caches/nona` sous macOS, `$XDG_CACHE_HOME/nona` ou `~/.cache/nona` ailleurs. |
| `NONA_CACHE=0`   | Ne pas lire ni Г©crire le cache.                                                                                                                                     |

## Diagnostics et codes de sortie

Le code de sortie vaut `0` en cas de succГЁs et `1` pour toute erreur. Les erreurs du source sвЂ™affichent ainsi :

```text
<file>:<line>:<column> <CODE>: <message>
```

| Code                | Signification                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `E_LEX`, `E_SYNTAX` | Le source ne peut pas ГЄtre dГ©coupГ© en jetons ou analysГ©, ou utilise une syntaxe non prise en charge.                                                                                                                           |
| `E_BIND`            | Une erreur prГ©coce dГ©tectГ©e lors de la rГ©solution des noms (dГ©clarations en double, cibles dвЂ™affectation invalides, вЂ¦).                                                                                                        |
| `E_MODULE`          | Un module ne peut pas ГЄtre rГ©solu, lu ou liГ©, ou des exports entrent en conflit.                                                                                                                                               |
| `E_FFI_STATIC`      | Un appel `define()` de `nona:ffi` ne comporte pas trois littГ©raux de chaГ®ne ou a une signature invalide.                                                                                                                       |
| `E_FFI_TARGET`      | Une dГ©claration de DLL compilГ©e pour `linux-x64`, ou une dГ©claration dвЂ™appel systГЁme compilГ©e pour `win32-x64`.                                                                                                                |
| `E_RESOURCE`        | Une icГґne ou des informations de version invalides, ou des ressources demandГ©es pour `linux-x64`.                                                                                                                              |
| `E_TARGET`          | Une cible ou un sous-systГЁme non pris en charge.                                                                                                                                                                               |
| `E_OPTION`          | Une option de compilation invalide, par exemple un nom de partie inconnu dans `--link`.                                                                                                                                        |
| `E_HOST_MODULE`     | Un module intГ©grГ© (comme `node:fs`) n'est pas disponible pour la cible.                                                                                                                                                        |
| `E_INTERNAL`        | Un bogue du compilateur, pas une erreur du programme : une vГ©rification interne a Г©chouГ© dans la phase nommГ©e par le message (`parse`, `bind`, `lower`, `codegen`, `link`, вЂ¦). Signalez-le avec le programme qui le dГ©clenche. |

Les erreurs dвЂ™arguments sвЂ™affichent sous la forme `nona: <message>`, par exemple `Unknown option: --foo`, `Duplicate option: -o`, `Missing value for --target`, `Output is required (-o <output>)`, `Unsupported target: arm64`, `Unsupported subsystem: native` ou `--subsystem requires --target win32-x64`.

## Exemples

::: code-group

```sh [Programme console]
nona build app.js -o build/app.exe
```

```sh [Programme graphique avec ressources]
nona build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

```sh [Linux]
nona build app.js -o build/app --target linux-x64
```

:::

## Le compilateur natif

Chaque [version](https://github.com/40oleg/nona/releases/latest) fournit `nona` sous forme dвЂ™exГ©cutable natif pour chacune des huit [plateformes natives](/reference/native-platforms). Il a Г©tГ© construit par Nona lui-mГЄme, nвЂ™a pas besoin de Node.js et accepte les mГЄmes options que `node dist/cli.js`. Un clone du dГ©pГґt exГ©cute Г  la place le compilateur TypeScript sur Node.js 26. Le [guide dвЂ™amorГ§age et de validation](https://github.com/40oleg/nona/blob/main/docs/self-hosting.md) dГ©crit comment le compilateur natif se reconstruit lui-mГЄme.

Les dГ©clarations FFI de DLL ne se compilent que pour les cibles Windows ; les dГ©clarations dвЂ™appels systГЁme bruts utilisent les numГ©ros du noyau de la cible Linux, Darwin ou BSD choisie (voir [FFI](/reference/ffi)).
