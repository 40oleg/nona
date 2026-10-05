# واجهة compile()

سطر الأوامر غلاف رقيق حول `compile()` من `src/compiler.ts`. الحزمة غير منشورة على npm؛ وبعد `npm run build` تجد الوحدة في `dist/src/compiler.js` داخل نسختك المستنسخة.

## مثال

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

تترجم نصًا مصدريًا واحدًا وتعيد `CompileResult`. ولا تكتب أي ملفات.

### `CompileOptions`

| الخيار | النوع | الوصف |
| --- | --- | --- |
| `fileName` | `string` | الاسم المستخدم في التشخيصات؛ وللوحدات هو أيضًا المسار الذي تُحَلّ الاستيرادات النسبية بالنسبة إليه. إلزامي. |
| `target` | `Target` | OS and CPU from the [native platform matrix](/reference/native-platforms). Required. |
| `module` | `boolean` | الترجمة كوحدة ES. |
| `subsystem` | `'console' \| 'windows'` | النظام الفرعي لـ PE ‏(`win32-x64` فقط). |
| `icon` | `Uint8Array` | محتوى ملف `.ico` ‏(`win32-x64` فقط). |
| `manifest` | `string` | نص XML لبيان التطبيق (`win32-x64` فقط). |
| `versionInfo` | `VersionInfo` | حقول معلومات الإصدار (`win32-x64` فقط). |
| `moduleHost` | `ModuleHost` | حلّ مخصص للوحدات (انظر أدناه). |
| `unhandledRejections` | `'throw' \| 'ignore'` | هل يُفشل رفض Promise غير المعالَج البرنامج (الافتراضي `'throw'`). |
| `scriptPrelude` و`realms` و`agents` | — | خيارات يستخدمها إطار اختبارات Test262. |

### `CompileResult`

```ts
type CompileResult =
  | { ok: true; image: Uint8Array; imports: string[] }   // imports: "DLL!function" of a PE image
  | { ok: false; diagnostics: Diagnostic[] };            // { code, message, file, span }
```

‏`span.start` و`span.end` إزاحتان بوحدات UTF-16 داخل المصدر.

## `ModuleHost`

```ts
interface ModuleHost {
  resolve(specifier: string, referrer: string): string | undefined;
  read(path: string): string | undefined;
  candidates?(referrer: string): string[];
}
```

المسارات سلاسل قانونية مفصولة بـ `/` يختارها المضيف. يحلّ المضيف الافتراضي المحدِّدات النسبية بجوار الملف المرجعي ويقرأ الملفات من القرص. ويسرد `candidates` الوحدات التي قد يسمّيها `import()` محسوب، كي تُترجَم ضمن البرنامج. وتُحَلّ الوحدات المدمجة `nona:*` و`node:*` قبل سؤال المضيف.


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
