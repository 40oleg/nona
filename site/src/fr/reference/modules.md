# Modules intégrés et objets globaux

Les programmes Nona s’exécutent sans Node.js. Les API de l’hôte ci-dessous font partie du compilateur : le runtime natif et de petits préludes JavaScript sont compilés dans chaque exécutable, et les modules intégrés le sont lorsqu’un programme les importe.

## Vue d’ensemble

| API | Nature | Cibles | Référence |
| --- | --- | --- | --- |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask`, `performance.now()` | globaux | les deux | [Minuteurs et boucle d’événements](/fr/reference/host-apis) |
| `process` | global | les deux | [process](/fr/reference/process) |
| `TextEncoder`, `TextDecoder` | globaux | les deux | [Système de fichiers et encodage du texte](/fr/reference/fs#textencoder-and-textdecoder) |
| `console.log` | global | les deux | écrit de l’UTF-8 sur la sortie standard |
| `nona:process`, `node:process` | modules | les deux | [process](/fr/reference/process) |
| `nona:fs`, `node:fs` | modules | les deux | [Système de fichiers et encodage du texte](/fr/reference/fs) |
| `nona:http`, `node:http`, `nona:net`, `node:net` | modules | les deux | [Réseau (en anglais)](/reference/network) |
| `node:events`, `node:buffer`, `node:string_decoder` | modules | les deux | [Modules de support Node.js (en anglais)](/reference/network#supporting-modules) |
| `nona:ffi` | module | Windows (DLL), Linux (appels système) | [Fonctions natives (FFI)](/fr/reference/ffi) |
| `nona:win32` | module | Windows | ci-dessous et [FFI](/fr/reference/ffi#nona-win32) |

## Règles

- Les objets globaux sont disponibles dans les scripts et les modules.
- Les modules intégrés peuvent être importés depuis du code de module (`.mjs` ou `--module`) et, depuis des scripts, avec un `import()` littéral. Les déclarations FFI (`define`) doivent se trouver dans du code de module.
- Parmi les modules `node:` figurent `node:fs`, `node:process`, `node:http`, `node:net`, `node:events`, `node:buffer` et `node:string_decoder` ; ce sont des implémentations Nona de sous-ensembles de Node.js, pas le code de Node.js. `node:path` et `require` ne sont pas disponibles ; le `Buffer` global existe dès que `node:buffer`, `node:net` ou `node:http` est importé.
- `nona:win32` et les déclarations de DLL ne compilent que pour `win32-x64` ; les déclarations d’appels système, que pour `linux-x64`.

## `nona:win32` {#nona-win32}

Des déclarations prêtes à l’emploi construites sur [`nona:ffi`](/fr/reference/ffi). Chaque fonction est un thunk natif : les arguments sont convertis comme décrit pour les [types de signature](/fr/reference/ffi#signatures).

### user32

| Export | Signature |
| --- | --- |
| `MessageBoxW` | `i32(ptr hwnd, wstr text, wstr caption, u32 type)` |
| `GetSystemMetrics` | `i32(i32 index)` |
| `SystemParametersInfoW` | `bool(u32 action, u32 param, wstr value, u32 flags)` — pour les paramètres chaîne comme `SPI_SETDESKWALLPAPER` |
| `SystemParametersInfoBufferW` | `bool(u32 action, u32 param, buf value, u32 flags)` — pour les paramètres tampon comme `SPI_GETDESKWALLPAPER` |

### kernel32

| Export | Signature |
| --- | --- |
| `CreateMutexW` | `ptr(ptr attributes, bool initialOwner, wstr name)` |
| `ReleaseMutex` | `bool(ptr mutex)` |
| `CloseHandle` | `bool(ptr handle)` |
| `GetModuleFileNameW` | `u32(ptr module, buf path, u32 size)` |
| `GetCurrentProcessId` | `u32()` |

### advapi32

| Export | Signature |
| --- | --- |
| `RegCreateKeyExW` | `i32(ptr key, wstr subKey, u32 reserved, ptr class, u32 options, u32 access, ptr security, buf result, buf disposition)` |
| `RegOpenKeyExW` | `i32(ptr key, wstr subKey, u32 options, u32 access, buf result)` |
| `RegSetValueExW` | `i32(ptr key, wstr name, u32 reserved, u32 type, buf data, u32 size)` |
| `RegQueryValueExW` | `i32(ptr key, wstr name, ptr reserved, buf type, buf data, buf size)` |
| `RegDeleteValueW` | `i32(ptr key, wstr name)` |
| `RegDeleteKeyW` | `i32(ptr key, wstr subKey)` |
| `RegCloseKey` | `i32(ptr key)` |

### Constantes

| Export | Valeur |
| --- | --- |
| `HKEY_CLASSES_ROOT`, `HKEY_CURRENT_USER`, `HKEY_LOCAL_MACHINE` | clés de registre prédéfinies (sous forme de handles étendus en signe) |
| `KEY_READ`, `KEY_WRITE`, `KEY_ALL_ACCESS` | `0x20019`, `0x20006`, `0xF003F` |
| `REG_SZ`, `REG_DWORD` | `1`, `4` |
| `ERROR_SUCCESS`, `ERROR_FILE_NOT_FOUND`, `ERROR_ALREADY_EXISTS` | `0`, `2`, `183` |
| `SPI_GETDESKWALLPAPER`, `SPI_SETDESKWALLPAPER` | `0x73`, `0x14` |
| `SPIF_UPDATEINIFILE`, `SPIF_SENDCHANGE` | `1`, `2` |
| `MB_OK`, `MB_ICONERROR`, `MB_ICONINFORMATION` | `0`, `0x10`, `0x40` |
| `MAX_PATH` | `260` |

### Utilitaires

| Export | Description |
| --- | --- |
| `lastError()` | `GetLastError()` capturé juste après le dernier appel FFI (réexporté depuis `nona:ffi`). |
| `wideString(text)` | Un `Uint16Array` terminé par NUL pour les paramètres `buf` qui attendent une chaîne UTF-16. |
| `fromWideString(buffer)` | Décode un tampon UTF-16 terminé par NUL. |
| `readHandle(buffer)` | Lit un handle (par exemple un `HKEY`) qu’une fonction a écrit dans un tampon de 8 octets. |

Pour les fonctions absentes de cette liste, déclarez-les vous-même avec `define` de [`nona:ffi`](/fr/reference/ffi).
