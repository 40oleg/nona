# Modules intégrés et objets globaux

L’[audit de complétude](/reference/completeness-audit) (en anglais) présente les limites des API, des tests limités de paquets sur Windows x64, des comparaisons, les risques et une feuille de route priorisée. La revue indépendante reste à faire.

Les programmes Nona s’exécutent sans Node.js. Les API de l’hôte ci-dessous font partie du compilateur : le runtime natif et de petits préludes JavaScript sont compilés dans chaque exécutable, et les modules intégrés le sont lorsqu’un programme les importe.

## Vue d’ensemble

| API                                                                                                                                                                                                                                                                                               | Nature             | Cibles                                   | Référence                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `setImmediate`/`clearImmediate`, `queueMicrotask`, `performance.now()`                                                                                                                                                              | globaux            | les huit cibles natives                  | [Minuteurs et boucle d’événements](/fr/reference/host-apis)                                                                                                        |
| `process`                                                                                                                                                                                                                                                                                         | global             | les huit cibles natives                  | [process](/fr/reference/process)                                                                                                                                   |
| `TextEncoder`, `TextDecoder`                                                                                                                                                                                                                                                                      | globaux            | les huit                                 | [Système de fichiers et encodage du texte](/fr/reference/fs#textencoder-and-textdecoder)                                                                           |
| `console.log`                                                                                                                                                                                                                                                                                     | global             | les huit                                 | écrit de l’UTF-8 sur la sortie standard                                                                                                                            |
| `console.error`, `console.warn`                                                                                                                                                                                                                                                                   | global             | les huit                                 | écrit de l’UTF-8 sur la sortie d’erreur standard (`console.info`, `console.debug` : sortie standard)                                                               |
| `nona:process`, `node:process`                                                                                                                                                                                                                                                                    | modules            | les huit cibles natives                  | [process](/fr/reference/process)                                                                                                                                   |
| `node:stream`, `stream`, `nona:stream`, `node:stream/promises`, `node:stream/consumers`                                                                                                                                                                                                           | modules            | les huit cibles natives                  | [Streams and standard I/O](/fr/reference/process)                                                                                                                  |
| `node:zlib`, `zlib`, `nona:zlib`                                                                                                                                                                                                                                                                  | modules            | les huit cibles natives                  | [zlib](/reference/host-apis#zlib)                                                                                                                                  |
| `nona:fs`, `node:fs`, `node:fs/promises`                                                                                                                                                                                                                                                          | modules            | les huit                                 | [Système de fichiers et encodage du texte](/fr/reference/fs)                                                                                                       |
| `node:async_hooks`, `nona:async_hooks`                                                                                                                                                                                                                                                            | modules            | les huit                                 | Ressources asynchrones manuelles, hooks et stockage de contexte local ; les hooks de ressources natives et la destruction par le ramasse-miettes ne sont pas émis. |
| `node:events`, `events`, `nona:events`                                                                                                                                                                                                                                                            | modules            | les huit                                 | [EventEmitter and asynchronous event helpers](/fr/reference/host-apis#events)                                                                                      |
| `node:path`, `path`, `node:path/posix`, `node:path/win32`                                                                                                                                                                                                                                         | modules            | les huit                                 | [Paths](/fr/reference/host-apis#paths-nodepath)                                                                                                                    |
| `nona:http`, `node:http`, `node:https`, `nona:net`, `node:net`, `node:string_decoder`                                                                                                                                                                                                             | modules            | Windows, Linux                           | [Réseau (en anglais)](/reference/network)                                                                                                                          |
| `node:child_process`, `child_process`, `nona:child_process`                                                                                                                                                                                                                                       | modules            | Windows, Linux                           | [Processus enfants](/fr/reference/host-apis#child-processes)                                                                                                       |
| `URL`, `URLSearchParams`, `node:url`, `url`                                                                                                                                                                                                                                                       | globaux et module  | les huit                                 | [URL](/fr/reference/host-apis#url)                                                                                                                                 |
| `node:os`, `node:tty`, `node:util`, `node:util/types`, `node:assert`, `node:assert/strict`, `node:crypto`, `node:querystring`, `node:timers`, `node:timers/promises`, `node:perf_hooks`, `node:module`, `node:worker_threads`, `node:tls`, `node:http2`, `node:zlib` (et leurs noms sans préfixe) | modules            | les huit                                 | [Modules de support Node.js](/fr/reference/host-apis#nodejs-support-modules)                                                                                       |
| `node:buffer`, `buffer`, `nona:buffer`, `Buffer`, `Blob`, `File`                                                                                                                                                                                                                                  | globaux et modules | les huit                                 | [Buffer et données binaires (en anglais)](/reference/host-apis#buffer-and-binary-data)                                                                             |
| `nona:ffi`                                                                                                                                                                                                                                                                                        | module             | Windows (DLL), les huit (appels système) | [Fonctions natives (FFI)](/fr/reference/ffi)                                                                                                                       |
| `nona:win32`                                                                                                                                                                                                                                                                                      | module             | Windows                                  | ci-dessous et [FFI](/fr/reference/ffi#nona-win32)                                                                                                                  |

## Règles

- Les objets globaux sont disponibles dans les scripts et les modules.
- Les modules intégrés peuvent être importés depuis du code de module (`.mjs` ou `--module`), chargés avec `require` depuis des modules CommonJS (`require('fs')`, `require('node:fs')`) et, depuis des scripts, avec un `import()` littéral. Les déclarations FFI (`define`) doivent se trouver dans du code de module.
- Modules Node pris en charge : `node:fs`, `node:process`, `node:path` (alias `path`), `node:events` (alias `events`/`nona:events`), `node:async_hooks` (alias `nona:async_hooks`), ainsi que `node:stream`, `node:stream/promises`, `node:stream/consumers`, `node:zlib`, `node:buffer` (alias `buffer`/`nona:buffer`). Les globaux `Buffer`, `Blob`, `File`, `URL`, `URLSearchParams` et `crypto` sont disponibles. `node:http`, `node:net` et `node:string_decoder` sont disponibles pour le réseau, et `node:os`, `node:tty`, `node:util`, `node:url`, `node:assert`, `node:crypto`, `node:querystring`, `node:timers`, `node:perf_hooks`, `node:module`, `node:worker_threads` et `node:https`, `node:tls`, `node:http2` pour les [paquets npm](/reference/npm).
- `nona:win32` et les déclarations de DLL exigent Windows x64 ou ARM64 ; les déclarations d’appels système utilisent le noyau Linux, Darwin ou BSD choisi.

## `nona:win32` {#nona-win32}

Des déclarations prêtes à l’emploi construites sur [`nona:ffi`](/fr/reference/ffi). Chaque fonction est un thunk natif : les arguments sont convertis comme décrit pour les [types de signature](/fr/reference/ffi#signatures).

### user32

| Export                        | Signature                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `MessageBoxW`                 | `i32(ptr hwnd, wstr text, wstr caption, u32 type)`                                                             |
| `GetSystemMetrics`            | `i32(i32 index)`                                                                                               |
| `SystemParametersInfoW`       | `bool(u32 action, u32 param, wstr value, u32 flags)` — pour les paramètres chaîne comme `SPI_SETDESKWALLPAPER` |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)` — pour les paramètres tampon comme `SPI_GETDESKWALLPAPER`  |

### kernel32

| Export                | Signature                                           |
| --------------------- | --------------------------------------------------- |
| `CreateMutexW`        | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex`        | `bool(ptr mutex)`                                   |
| `CloseHandle`         | `bool(ptr handle)`                                  |
| `GetModuleFileNameW`  | `u32(ptr module, buf path, u32 size)`               |
| `GetCurrentProcessId` | `u32()`                                             |

### advapi32

| Export             | Signature                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `RegCreateKeyExW`  | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW`    | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)`                                                         |
| `RegSetValueExW`   | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)`                                                    |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)`                                                    |
| `RegDeleteValueW`  | `i32(ptr key, wstr name)`                                                                                                |
| `RegDeleteKeyW`    | `i32(ptr key, wstr subKey)`                                                                                              |
| `RegCloseKey`      | `i32(ptr key)`                                                                                                           |

### Constantes

| Export                                                          | Valeur                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------- |
| `HKEY_CLASSES_ROOT`, `HKEY_CURRENT_USER`, `HKEY_LOCAL_MACHINE`  | clés de registre prédéfinies (sous forme de handles étendus en signe) |
| `KEY_READ`, `KEY_WRITE`, `KEY_ALL_ACCESS`                       | `0x20019`, `0x20006`, `0xF003F`                                       |
| `REG_SZ`, `REG_DWORD`                                           | `1`, `4`                                                              |
| `ERROR_SUCCESS`, `ERROR_FILE_NOT_FOUND`, `ERROR_ALREADY_EXISTS` | `0`, `2`, `183`                                                       |
| `SPI_GETDESKWALLPAPER`, `SPI_SETDESKWALLPAPER`                  | `0x73`, `0x14`                                                        |
| `SPIF_UPDATEINIFILE`, `SPIF_SENDCHANGE`                         | `1`, `2`                                                              |
| `MB_OK`, `MB_ICONERROR`, `MB_ICONINFORMATION`                   | `0`, `0x10`, `0x40`                                                   |
| `MAX_PATH`                                                      | `260`                                                                 |

### Utilitaires

| Export                   | Description                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `lastError()`            | `GetLastError()` capturé juste après le dernier appel FFI (réexporté depuis `nona:ffi`).    |
| `wideString(text)`       | Un `Uint16Array` terminé par NUL pour les paramètres `buf` qui attendent une chaîne UTF-16. |
| `fromWideString(buffer)` | Décode un tampon UTF-16 terminé par NUL.                                                    |
| `readHandle(buffer)`     | Lit un handle (par exemple un `HKEY`) qu’une fonction a écrit dans un tampon de 8 octets.   |

Pour les fonctions absentes de cette liste, déclarez-les vous-même avec `define` de [`nona:ffi`](/fr/reference/ffi).

## `node:buffer`, `buffer`, `nona:buffer`

Les alias exportent les constructeurs globaux `Buffer`, `Blob` et `File`, des validateurs d’octets, des utilitaires base64, le transcodage, les réglages d’inspection et des constantes. Les flux d’octets et de texte de Blob, les lecteurs BYOB ainsi que l’enregistrement et la résolution des URL d’objet sont disponibles. L’analyse générale des URL est assurée par le [`URL`](/fr/reference/host-apis#url) global ; la construction arbitraire de Web Streams reste une API de dépendance distincte. Voir [données binaires (en anglais)](/reference/host-apis#buffer-and-binary-data) et l’[exemple exécutable](https://github.com/40oleg/nona/blob/main/site/samples/buffer.mjs).
