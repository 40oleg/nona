# API compile()

A linha de comando é uma camada fina sobre `compile()` de `src/compiler.ts`. O pacote não está publicado no npm; depois de `npm run build`, o módulo fica em `dist/src/compiler.js` no seu clone.

## Exemplo

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

Compila um texto-fonte e retorna `CompileResult`. Não grava arquivos.

### `CompileOptions`

| Opção | Tipo | Descrição |
| --- | --- | --- |
| `fileName` | `string` | Nome usado nos diagnósticos; para módulos, também o caminho em relação ao qual as importações relativas são resolvidas. Obrigatória. |
| `target` | `'win32-x64' \| 'linux-x64'` | Formato de saída. Obrigatória. |
| `module` | `boolean` | Compilar como módulo ES. |
| `subsystem` | `'console' \| 'windows'` | Subsistema PE (apenas `win32-x64`). |
| `icon` | `Uint8Array` | Conteúdo de um arquivo `.ico` (apenas `win32-x64`). |
| `manifest` | `string` | XML do manifesto de aplicativo (apenas `win32-x64`). |
| `versionInfo` | `VersionInfo` | Campos de informações de versão (apenas `win32-x64`). |
| `moduleHost` | `ModuleHost` | Resolução de módulos personalizada (veja abaixo). |
| `unhandledRejections` | `'throw' \| 'ignore'` | Se uma rejeição de Promise não tratada faz o programa falhar (padrão `'throw'`). |
| `scriptPrelude`, `realms`, `agents` | — | Opções usadas pelo harness do Test262. |

### `CompileResult`

```ts
type CompileResult =
  | { ok: true; image: Uint8Array; imports: string[] }   // imports: "DLL!function" of a PE image
  | { ok: false; diagnostics: Diagnostic[] };            // { code, message, file, span }
```

`span.start` e `span.end` são deslocamentos UTF-16 no código-fonte.

## `ModuleHost`

```ts
interface ModuleHost {
  resolve(specifier: string, referrer: string): string | undefined;
  read(path: string): string | undefined;
  candidates?(referrer: string): string[];
}
```

Os caminhos são strings canônicas separadas por `/`, escolhidas pelo host. O host padrão resolve especificadores relativos ao lado do arquivo que os referencia e lê os arquivos do disco. `candidates` lista os módulos que um `import()` calculado pode nomear, para que sejam compilados no programa. Os módulos embutidos `nona:*` e `node:*` são resolvidos antes de o host ser consultado.
