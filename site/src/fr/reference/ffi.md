# Fonctions natives (FFI)

::: info Traduction
Cette page est une traduction de la page anglaise [Native functions (FFI)](/reference/ffi), générée à partir de [`docs/ffi.md`](https://github.com/40oleg/nona/blob/main/docs/ffi.md). La version anglaise fait foi et peut être plus récente.
:::

Les programmes Windows peuvent appeler les fonctions exportées de n’importe quelle DLL via le module intégré `nona:ffi`. Les déclarations sont résolues à la compilation : chaque appel à `define` ajoute une entrée à la table d’import PE, si bien que le programme n’utilise pas `LoadLibrary`/`GetProcAddress`.

```js
import { define, lastError } from 'nona:ffi';

const MessageBoxW = define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)');
MessageBoxW(null, 'Hello from Nona', 'Nona', 0);
```

- La FFI est disponible dans le code de module (`.mjs` ou `--module`). `define` doit être appelé directement, avec trois littéraux de chaîne : le nom de la DLL, le nom de l’export et la signature. Toute autre forme est une erreur de compilation (`E_FFI_STATIC`).
- Les déclarations de DLL sont rejetées pour `--target linux-x64` (`E_FFI_TARGET`).
- Sous Linux, `define('syscall', '<number>', signature)` déclare un appel système brut (au plus six arguments entiers ou `buf` ; le résultat est la valeur brute renvoyée par le noyau, `errno` négatif en cas d’échec). Les déclarations d’appels système sont rejetées pour `win32-x64`.
- `lastError()` renvoie `GetLastError()` capturé immédiatement après le dernier appel FFI.
- Si une DLL ou un export manque, le chargeur de Windows refuse de démarrer le programme.

## Signatures {#signatures}

`result(param, param, ...)`, par exemple `bool(u32,u32,wstr,u32)`.

| Type | Paramètre | Résultat |
| --- | --- | --- |
| `i8 i16 i32 i64 u8 u16 u32 u64` | Number (tronqué vers zéro) ou Boolean | Number |
| `ptr` | Number, Boolean, `null`/`undefined` (NULL) | Number |
| `bool` | comme `i32` | Boolean (`BOOL` Win32, non nul vaut `true`) |
| `f32 f64` | Number | Number |
| `wstr` | String → copie temporaire UTF-16 terminée par NUL ; `null`/`undefined` → NULL | — |
| `str` | String → copie temporaire UTF-8 terminée par NUL ; `null`/`undefined` → NULL | — |
| `buf` | ArrayBuffer, SharedArrayBuffer, tableau typé ou DataView → pointeur vers ses octets (au décalage de la vue) ; `null`/`undefined` → NULL | — |
| `void` | — | `undefined` |

Les arguments d’autres types lèvent `TypeError`, de même que les arguments manquants (sauf pour les types pointeur, où `undefined` signifie NULL) et les tampons détachés. La fonction appelée peut écrire dans la mémoire `buf` ; c’est ainsi que sont renvoyés les paramètres de sortie : passez un `Uint16Array` pour un tampon de chaîne UTF-16 ou un `Uint8Array(8)` pour un handle. Les copies temporaires de chaînes sont libérées après l’appel ; la fonction appelée ne doit pas conserver le pointeur. Les callbacks (`cb(...)`) et les types de paramètres de sortie sont réservés à une version ultérieure.

## `nona:win32` {#nona-win32}

Un ensemble choisi de déclarations et d’utilitaires construits sur `nona:ffi` :

- user32 : `MessageBoxW`, `GetSystemMetrics`, `SystemParametersInfoW` (paramètre chaîne), `SystemParametersInfoBufferW` (paramètre tampon) ;
- kernel32 : `CreateMutexW`, `ReleaseMutex`, `CloseHandle`, `GetModuleFileNameW`, `GetCurrentProcessId` ;
- advapi32 : `RegCreateKeyExW`, `RegOpenKeyExW`, `RegSetValueExW`, `RegQueryValueExW`, `RegDeleteValueW`, `RegDeleteKeyW`, `RegCloseKey` ;
- des constantes comme `HKEY_CURRENT_USER`, `KEY_ALL_ACCESS`, `REG_SZ`, `SPI_SETDESKWALLPAPER`, `SPIF_UPDATEINIFILE`, `ERROR_ALREADY_EXISTS` ;
- les utilitaires `wideString(text)` (`Uint16Array` terminé par NUL), `fromWideString(buffer)` et `readHandle(buffer)` ; `lastError` est réexporté.

```js
import { SystemParametersInfoW, SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE } from 'nona:win32';
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, 'C:\\Pictures\\painting.jpg', SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
```


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
