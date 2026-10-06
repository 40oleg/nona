# Museum : changeur de fond d’écran <Badge type="warning" text="Windows uniquement" />

::: warning Windows uniquement
Cet exemple appelle des fonctions Windows via `nona:win32` et ne compile que pour `win32-x64`.
:::

Museum est un programme d’arrière-plan qui affiche un tableau différent en fond d’écran toutes les quelques minutes. Il s’exécute sans fenêtre de console, ne consomme pas de CPU entre deux changements, ne démarre qu’en un seul exemplaire et peut s’inscrire pour démarrer avec Windows. Tout le programme tient dans un module d’environ 80 lignes.

## Étape 1 : les arguments

```js
const folder = process.argv[1];
const minutes = Number(process.argv[2] ?? 30);
const install = process.argv.includes('--install');
```

`process.argv[0]` est l’exécutable et `process.argv[1]` le premier argument. Un programme graphique n’a pas de console ; les erreurs sont donc affichées avec `MessageBoxW` :

```js
function fail(message) {
  MessageBoxW(null, message, 'Museum', MB_OK | MB_ICONERROR);
  process.exit(1);
}
```

## Étape 2 : les images

`readdirSync` from `node:fs` lists the folder. This sample joins paths with `\\`; `node:path` is also available.

```js
const pictures = readdirSync(folder)
  .filter(name => /\.(jpe?g|png|bmp)$/i.test(name))
  .sort()
  .map(name => folder.replace(/[\\/]+$/, '') + '\\' + name);
```

## Étape 3 : une seule instance

Un mutex nommé existe tant que vit le processus qui l’a créé. S’il existe déjà, un autre Museum est en cours d’exécution.

```js
CreateMutexW(null, false, 'Local\\NonaMuseum');
if (lastError() === ERROR_ALREADY_EXISTS) process.exit(0);
```

`lastError()` renvoie `GetLastError()` capturé juste après l’appel FFI précédent.

## Étape 4 : définir le fond d’écran

```js
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, picture, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)
```

Le paramètre `wstr` transforme la chaîne JavaScript en copie UTF-16 temporaire terminée par NUL ; les chemins contenant n’importe quel caractère fonctionnent donc. `SPIF_UPDATEINIFILE` conserve le fond d’écran après la déconnexion et `SPIF_SENDCHANGE` prévient les autres programmes.

## Étape 5 : la rotation

```js
showNext();
setInterval(showNext, minutes * 60 * 1000);
```

Un intervalle en attente maintient le processus en vie. Entre deux ticks, la boucle d’événements dort dans le noyau ; le programme ne consomme donc pas de CPU pendant l’attente.

## Étape 6 : compiler un programme graphique

<<< ../../../samples/museum.version.json

```sh
node dist/cli.js build museum.mjs -o build/museum.exe --subsystem windows --icon museum.ico --version-info museum.version.json
```

- `--subsystem windows` démarre le programme sans fenêtre de console et intègre un manifeste par défaut (asInvoker, Windows 10/11, prise en charge du DPI par moniteur).
- `--icon` intègre l’icône affichée par l’Explorateur et la barre des tâches.
- `--version-info` remplit Propriétés → Détails.

Lancez-le avec un dossier et un intervalle en minutes :

```powershell
.\build\museum.exe "C:\Users\me\Pictures\Paintings" 30
```

## Étape 7 : démarrer avec Windows (facultatif)

Avec `--install`, Museum écrit sa ligne de commande dans `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. `RegCreateKeyExW` écrit la clé ouverte dans un tampon de 8 octets, que lit `readHandle` ; `wideString` produit les données UTF-16 pour `RegSetValueExW`.

```js
const key = new Uint8Array(8);
RegCreateKeyExW(HKEY_CURRENT_USER, runKey, 0, null, 0, KEY_WRITE, null, key, null);
const command = wideString(`"${process.execPath}" "${folder}" ${minutes}`);
RegSetValueExW(readHandle(key), 'NonaMuseum', 0, REG_SZ, command, command.byteLength);
```

Pour annuler, supprimez la valeur `NonaMuseum` de cette clé (par exemple avec `RegDeleteValueW` ou dans l’Éditeur du Registre).

## Source complet

<<< ../../../samples/museum.win32.mjs{js}

## Voir aussi

- [Fonctions natives (FFI)](/fr/reference/ffi) et la [liste des exports de `nona:win32`](/fr/reference/modules#nona-win32)
- [Exécutables Windows](/fr/reference/windows-executables)
- [Minuteurs et boucle d’événements](/fr/reference/host-apis)
