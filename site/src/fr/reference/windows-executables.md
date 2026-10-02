# Exécutables Windows

::: info Traduction
Cette page est une traduction de la page anglaise [Windows executables](/reference/windows-executables), générée à partir de [`docs/windows-executables.md`](https://github.com/40oleg/nona/blob/main/docs/windows-executables.md). La version anglaise fait foi et peut être plus récente.
:::

## Sous-système

`nona build app.js -o app.exe --subsystem windows` marque l’image PE comme programme graphique (champ Subsystem 2 de l’en-tête optionnel). Windows le démarre alors sans fenêtre de console, ce qui convient aux programmes d’arrière-plan et aux utilitaires de la zone de notification. La valeur par défaut est `--subsystem console` (3). L’option exige `--target win32-x64`.

Un programme graphique écrit toujours la sortie de `console.log` dans les handles de sortie standard dont il hérite (par exemple des tubes mis en place par le processus parent). Lorsqu’il n’y a pas de sortie standard — pas de console, un handle fermé ou détaché, ou une écriture qui échoue —, la sortie est ignorée et le programme continue ; les versions précédentes se terminaient avec le code de sortie 1.

## Ressources

```text
nona build app.js -o app.exe --icon app.ico --manifest app.manifest --version-info version.json
```

- `--icon` intègre toutes les images d’un fichier `.ico` (`RT_ICON` 1…n et `RT_GROUP_ICON` 1) ; l’Explorateur et la barre des tâches l’affichent.
- `--manifest` intègre un manifeste d’application (`RT_MANIFEST` 1). Il doit être valide : Windows refuse de démarrer un programme dont le manifeste est mal formé. Les programmes compilés avec `--subsystem windows` sans manifeste en reçoivent un par défaut : `asInvoker`, compatibilité Windows 10/11 et prise en charge du DPI par moniteur.
- `--version-info` lit un objet JSON contenant n’importe lesquels des champs `FileVersion`, `ProductVersion` (`"major.minor.build.revision"`, parties de 0 à 65535), `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName` et `Comments`, affichés dans Propriétés → Détails du fichier (`RT_VERSION` 1, langue 0409, page de codes 04B0).

```json
{ "FileVersion": "1.0.0.0", "ProductName": "Museum", "FileDescription": "Paintings on the desktop", "CompanyName": "Oleg" }
```

Les mêmes options sont disponibles dans `compile()` sous les noms `icon` (octets), `manifest` (chaîne) et `versionInfo` (objet). Elles exigent `--target win32-x64`.
