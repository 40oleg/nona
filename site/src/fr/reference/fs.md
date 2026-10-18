# Système de fichiers (`nona:fs`, `node:fs`)

::: info Traduction
Cette page est une traduction de la page anglaise [File system](/reference/fs), générée à partir de [`docs/fs.md`](https://github.com/40oleg/nona/blob/main/docs/fs.md). La version anglaise fait foi et peut être plus récente.
:::

Un sous-ensemble synchrone du module `fs` de Node.js est intégré, avec par-dessus des formes à callback et à promesse des fonctions courantes. Les deux spécificateurs mènent à la même implémentation ; `import fs from 'node:fs'`, les imports nommés et `require('fs')` fonctionnent.

| Fonction                                                                  | Remarques                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readFileSync(path, options?)`                                            | Sans encodage, renvoie un `Uint8Array` (Node.js renvoie un `Buffer`) ; avec `'utf8'`, renvoie une chaîne.                                                                                                                                   |
| `writeFileSync(path, data, options?)`                                     | `data` : chaîne (UTF-8), tableau typé, DataView ou ArrayBuffer. `{flag: 'a'}` ajoute à la fin. `flag`: `w` / `a` / `wx`; POSIX `mode`.                                                                                                      |
| `appendFileSync(path, data)`                                              |                                                                                                                                                                                                                                             |
| `existsSync(path)`                                                        |                                                                                                                                                                                                                                             |
| `accessSync(path, mode?)`                                                 | Lève `ENOENT` si le chemin n’existe pas ; les bits de permission ne sont pas vérifiés.                                                                                                                                                      |
| `statSync(path, options?)`                                                | `isFile()`, `isDirectory()`, `isSymbolicLink()`, `isBlockDevice()`, `isCharacterDevice()`, `isFIFO()`, `isSocket()`, `size`, `mtimeMs`, `mtime`, `mode` ; `{throwIfNoEntry: false}`. `dev`, `ino`; `{bigint: true}` → BigInt `dev` / `ino`. |
| `lstatSync(path, options?)`                                               | Comme `statSync`, mais pour le lien lui-même et non sa cible ; `{throwIfNoEntry: false}`. Sous Windows, les liens symboliques et les jonctions sont des liens.                                                                              |
| `readlinkSync(path)`                                                      | Cible d’un lien symbolique (ou d’une jonction Windows) telle qu’elle est stockée ; `EINVAL` pour les autres fichiers.                                                                                                                       |
| `realpathSync(path)`, `realpathSync.native(path)`                         | Chemin absolu canonique après résolution des liens symboliques.                                                                                                                                                                             |
| `readdirSync(path, options?)`                                             | Noms sans `.` ni `..` ; `{withFileTypes: true}` renvoie des objets `fs.Dirent` avec `name`, `parentPath`, `path` et les méthodes `is*()` de `Stats`.                                                                                        |
| `mkdirSync(path, {recursive}?)`                                           | Avec `recursive`, renvoie le premier répertoire créé.                                                                                                                                                                                       |
| `rmSync(path, {recursive, force}?)`                                       | Supprime un fichier, ou une arborescence avec `recursive` ; `force` ignore un chemin absent.                                                                                                                                                |
| `rmdirSync`, `unlinkSync`, `renameSync`, `copyFileSync(src, dest, mode?)` | `constants.COPYFILE_EXCL` est pris en charge.                                                                                                                                                                                               |

Les chemins sont des chaînes (ou des `Uint8Array` en UTF-8). Seul l’encodage `utf8` est pris en charge. Les erreurs sont des objets `Error` avec les codes de Node.js (`ENOENT`, `EEXIST`, `EISDIR`, `ENOTDIR`, `ENOTEMPTY`, `EACCES`, `EPERM`, …), `syscall` et `path`, et le même format de message que Node.js (sous Windows, Node.js affiche le chemin absolu dans les messages ; Nona affiche le chemin tel que fourni).

Implémentation : sous Windows, le module appelle KERNEL32 (`CreateFileW`, `ReadFile`, `FindFirstFileW`, …) via [`nona:ffi`](/fr/reference/ffi) ; sous Linux, il utilise des appels système bruts déclarés avec `define('syscall', number, signature)`. Seules les fonctions de la plateforme ciblée sont liées.

## Callbacks et promesses

`readFile`, `writeFile`, `appendFile`, `access`, `stat`, `lstat`, `readlink`, `realpath` (avec `realpath.native`), `readdir`, `mkdir`, `rm`, `rmdir`, `unlink`, `rename`, `copyFile` et `exists` acceptent un callback à la manière de Node.js (`(error, result)` ; `exists` ne transmet qu’un booléen). Les mêmes fonctions sans `exists` renvoient des promesses depuis `fs.promises` et depuis le module `node:fs/promises` (`fs/promises`, `nona:fs/promises`), qui est le même objet que `fs.promises`. Les deux formes exécutent l’opération synchrone à l’appel et se contentent de différer le callback à un tick ultérieur ou de résoudre la promesse : elles ne font pas se chevaucher le travail sur le système de fichiers avec d’autre code.

## TextEncoder et TextDecoder {#textencoder-and-textdecoder}

`TextEncoder` et `TextDecoder` sont globaux et implémentent l’UTF-8 conformément au standard WHATWG Encoding : `encode(string)`, `decode(bufferSource)`, les options `fatal` et `ignoreBOM`, et le remplacement par U+FFFD des séquences invalides et des surrogates isolés. Les autres encodages lèvent `RangeError`.

Disponible sur Windows, Linux et macOS (x64 et ARM64), FreeBSD et OpenBSD (x64).
