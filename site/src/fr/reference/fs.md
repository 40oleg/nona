# Système de fichiers (`nona:fs`, `node:fs`)

::: info Traduction
Cette page est une traduction de la page anglaise [File system](/reference/fs), générée à partir de [`docs/fs.md`](https://github.com/40oleg/nona/blob/main/docs/fs.md). La version anglaise fait foi et peut être plus récente.
:::

Un sous-ensemble synchrone du module `fs` de Node.js est intégré. Les deux spécificateurs mènent à la même implémentation ; `import fs from 'node:fs'` et les imports nommés fonctionnent.

| Fonction | Remarques |
| --- | --- |
| `readFileSync(path, options?)` | Sans encodage, renvoie un `Uint8Array` (Node.js renvoie un `Buffer`) ; avec `'utf8'`, renvoie une chaîne. |
| `writeFileSync(path, data, options?)` | `data` : chaîne (UTF-8), tableau typé, DataView ou ArrayBuffer. `{flag: 'a'}` ajoute à la fin. |
| `appendFileSync(path, data)` | |
| `existsSync(path)` | |
| `statSync(path, options?)` | `isFile()`, `isDirectory()`, `isSymbolicLink()`, `size`, `mtimeMs`, `mtime`, `mode` ; `{throwIfNoEntry: false}`. |
| `readdirSync(path)` | Noms sans `.` ni `..`, dans l’ordre du système de fichiers. `withFileTypes` n’est pas pris en charge. |
| `mkdirSync(path, {recursive}?)` | Avec `recursive`, renvoie le premier répertoire créé. |
| `rmdirSync`, `unlinkSync`, `renameSync`, `copyFileSync(src, dest, mode?)` | `constants.COPYFILE_EXCL` est pris en charge. |

Les chemins sont des chaînes (ou des `Uint8Array` en UTF-8). Seul l’encodage `utf8` est pris en charge. Les erreurs sont des objets `Error` avec les codes de Node.js (`ENOENT`, `EEXIST`, `EISDIR`, `ENOTDIR`, `ENOTEMPTY`, `EACCES`, `EPERM`, …), `syscall` et `path`, et le même format de message que Node.js (sous Windows, Node.js affiche le chemin absolu dans les messages ; Nona affiche le chemin tel que fourni).

Implémentation : sous Windows, le module appelle KERNEL32 (`CreateFileW`, `ReadFile`, `FindFirstFileW`, …) via [`nona:ffi`](/fr/reference/ffi) ; sous Linux, il utilise des appels système bruts déclarés avec `define('syscall', number, signature)`. Seules les fonctions de la plateforme ciblée sont liées.

## TextEncoder et TextDecoder {#textencoder-and-textdecoder}

`TextEncoder` et `TextDecoder` sont globaux et implémentent l’UTF-8 conformément au standard WHATWG Encoding : `encode(string)`, `decode(bufferSource)`, les options `fatal` et `ignoreBOM`, et le remplacement par U+FFFD des séquences invalides et des surrogates isolés. Les autres encodages lèvent `RangeError`.
