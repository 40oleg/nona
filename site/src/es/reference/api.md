# API compile()

La línea de comandos es una capa fina sobre `compile()` de `src/compiler.ts`. El paquete no está publicado en npm; después de `npm run build`, el módulo es `dist/src/compiler.js` en tu clon.

## Ejemplo

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

Compila un texto fuente y devuelve `CompileResult`. No escribe archivos.

### `CompileOptions`

| Opción | Tipo | Descripción |
| --- | --- | --- |
| `fileName` | `string` | Nombre usado en los diagnósticos; en los módulos, también la ruta respecto a la cual se resuelven las importaciones relativas. Obligatoria. |
| `target` | `Target` | OS and CPU from the [native platform matrix](/reference/native-platforms). Required. |
| `module` | `boolean` | Compilar como módulo ES. |
| `subsystem` | `'console' \| 'windows'` | Subsistema PE (solo `win32-x64`). |
| `icon` | `Uint8Array` | Contenido de un archivo `.ico` (solo `win32-x64`). |
| `manifest` | `string` | XML del manifiesto de aplicación (solo `win32-x64`). |
| `versionInfo` | `VersionInfo` | Campos de información de versión (solo `win32-x64`). |
| `moduleHost` | `ModuleHost` | Resolución de módulos personalizada (ver más abajo). |
| `unhandledRejections` | `'throw' \| 'ignore'` | Si un rechazo de Promise no gestionado hace fallar el programa (predeterminado `'throw'`). |
| `scriptPrelude`, `realms`, `agents` | — | Opciones que usa el arnés de Test262. |

### `CompileResult`

```ts
type CompileResult =
  | { ok: true; image: Uint8Array; imports: string[] }   // imports: "DLL!function" of a PE image
  | { ok: false; diagnostics: Diagnostic[] };            // { code, message, file, span }
```

`span.start` y `span.end` son desplazamientos UTF-16 dentro del código fuente.

## `ModuleHost`

```ts
interface ModuleHost {
  resolve(specifier: string, referrer: string): string | undefined;
  read(path: string): string | undefined;
  candidates?(referrer: string): string[];
}
```

Las rutas son cadenas canónicas separadas por `/` que elige el host. El host predeterminado resuelve los especificadores relativos junto al archivo que los referencia y lee los archivos del disco. `candidates` enumera los módulos que puede nombrar un `import()` calculado, para que se compilen dentro del programa. Los módulos integrados `nona:*` y `node:*` se resuelven antes de consultar al host.


## Native target availability

Windows/Linux x64 and ARM64, Intel macOS and FreeBSD/OpenBSD x64 targets are available. Apple Silicon startup is not enabled. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
