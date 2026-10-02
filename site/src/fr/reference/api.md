# API compile()

La ligne de commande est une fine surcouche de `compile()` de `src/compiler.ts`. Le paquet n’est pas publié sur npm ; après `npm run build`, le module se trouve dans `dist/src/compiler.js` de votre clone.

## Exemple

```js
// build.mjs — run with Node.js from the repository root.
import { writeFileSync } from 'node:fs';
import { compile } from './dist/src/compiler.js';

const source = 'console.log("built with compile()");';
const result = compile(source, { fileName: 'app.js', target: 'linux-x64' });
if (!result.ok) {
  for (const d of result.diagnostics) console.error(`${d.code}: ${d.message}`);
  process.exit(1);
}
writeFileSync('app', result.image, { mode: 0o755 });
```

## `compile(source, options)`

Compile un texte source et renvoie `CompileResult`. N’écrit aucun fichier.

### `CompileOptions`

| Option | Type | Description |
| --- | --- | --- |
| `fileName` | `string` | Nom utilisé dans les diagnostics ; pour les modules, aussi le chemin par rapport auquel les imports relatifs sont résolus. Obligatoire. |
| `target` | `'win32-x64' \| 'linux-x64'` | Format de sortie. Obligatoire. |
| `module` | `boolean` | Compiler comme un module ES. |
| `subsystem` | `'console' \| 'windows'` | Sous-système PE (`win32-x64` uniquement). |
| `icon` | `Uint8Array` | Contenu d’un fichier `.ico` (`win32-x64` uniquement). |
| `manifest` | `string` | XML du manifeste d’application (`win32-x64` uniquement). |
| `versionInfo` | `VersionInfo` | Champs d’informations de version (`win32-x64` uniquement). |
| `moduleHost` | `ModuleHost` | Résolution de modules personnalisée (voir plus bas). |
| `unhandledRejections` | `'throw' \| 'ignore'` | Indique si un rejet de Promise non géré fait échouer le programme (par défaut `'throw'`). |
| `scriptPrelude`, `realms`, `agents` | — | Options utilisées par le harnais Test262. |

### `CompileResult`

```ts
type CompileResult =
  | { ok: true; image: Uint8Array; imports: string[] }   // imports: "DLL!function" of a PE image
  | { ok: false; diagnostics: Diagnostic[] };            // { code, message, file, span }
```

`span.start` et `span.end` sont des positions UTF-16 dans le source.

## `ModuleHost`

```ts
interface ModuleHost {
  resolve(specifier: string, referrer: string): string | undefined;
  read(path: string): string | undefined;
  candidates?(referrer: string): string[];
}
```

Les chemins sont des chaînes canoniques séparées par `/`, choisies par l’hôte. L’hôte par défaut résout les spécificateurs relatifs à côté du fichier qui les référence et lit les fichiers sur le disque. `candidates` liste les modules qu’un `import()` calculé peut désigner, afin qu’ils soient compilés dans le programme. Les modules intégrés `nona:*` et `node:*` sont résolus avant que l’hôte ne soit sollicité.
