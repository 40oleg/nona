# API compile()

Командная строка — тонкая обёртка над `compile()` из `src/compiler.ts`. Пакет не опубликован в npm; после `npm run build` модуль находится в вашем клоне по пути `dist/src/compiler.js`.

## Пример

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

Компилирует один исходный текст и возвращает `CompileResult`. Файлы не записывает.

### `CompileOptions`

| Параметр | Тип | Описание |
| --- | --- | --- |
| `fileName` | `string` | Имя для диагностики; для модулей — также путь, относительно которого разрешаются относительные импорты. Обязателен. |
| `target` | `'win32-x64' \| 'linux-x64'` | Формат результата. Обязателен. |
| `module` | `boolean` | Компилировать как ES-модуль. |
| `subsystem` | `'console' \| 'windows'` | Подсистема PE (только `win32-x64`). |
| `icon` | `Uint8Array` | Содержимое файла `.ico` (только `win32-x64`). |
| `manifest` | `string` | XML манифеста приложения (только `win32-x64`). |
| `versionInfo` | `VersionInfo` | Поля сведений о версии (только `win32-x64`). |
| `moduleHost` | `ModuleHost` | Собственное разрешение модулей (см. ниже). |
| `unhandledRejections` | `'throw' \| 'ignore'` | Завершает ли необработанный отказ Promise программу с ошибкой (по умолчанию `'throw'`). |
| `scriptPrelude`, `realms`, `agents` | — | Параметры, которые использует обвязка Test262. |

### `CompileResult`

```ts
type CompileResult =
  | { ok: true; image: Uint8Array; imports: string[] }   // imports: "DLL!function" of a PE image
  | { ok: false; diagnostics: Diagnostic[] };            // { code, message, file, span }
```

`span.start` и `span.end` — смещения в исходнике в единицах UTF-16.

## `ModuleHost`

```ts
interface ModuleHost {
  resolve(specifier: string, referrer: string): string | undefined;
  read(path: string): string | undefined;
  candidates?(referrer: string): string[];
}
```

Пути — канонические строки с разделителем `/`, которые выбирает хост. Хост по умолчанию разрешает относительные спецификаторы относительно импортирующего файла и читает файлы с диска. `candidates` перечисляет модули, которые может назвать вычисляемый `import()`, чтобы они были скомпилированы в программу. Встроенные модули `nona:*` и `node:*` разрешаются раньше, чем запрос попадает к хосту.
