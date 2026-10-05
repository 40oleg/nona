# compile() API

कमांड लाइन `src/compiler.ts` के `compile()` के ऊपर एक पतली परत है। पैकेज npm पर प्रकाशित नहीं है; `npm run build` के बाद यह मॉड्यूल आपके क्लोन में `dist/src/compiler.js` होता है।

## उदाहरण

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

एक सोर्स टेक्स्ट कंपाइल करता है और `CompileResult` लौटाता है। यह फ़ाइलें नहीं लिखता।

### `CompileOptions`

| विकल्प | टाइप | विवरण |
| --- | --- | --- |
| `fileName` | `string` | डायग्नोस्टिक्स में उपयोग होने वाला नाम; मॉड्यूल के लिए यह वह पाथ भी है जिसके सापेक्ष रिलेटिव इम्पोर्ट रिज़ॉल्व होते हैं। अनिवार्य। |
| `target` | `Target` | OS and CPU from the [native platform matrix](/reference/native-platforms). Required. |
| `module` | `boolean` | ES मॉड्यूल के रूप में कंपाइल करें। |
| `subsystem` | `'console' \| 'windows'` | PE सबसिस्टम (केवल `win32-x64`)। |
| `icon` | `Uint8Array` | `.ico` फ़ाइल की सामग्री (केवल `win32-x64`)। |
| `manifest` | `string` | एप्लिकेशन मैनिफ़ेस्ट XML (केवल `win32-x64`)। |
| `versionInfo` | `VersionInfo` | वर्ज़न जानकारी के फ़ील्ड (केवल `win32-x64`)। |
| `moduleHost` | `ModuleHost` | कस्टम मॉड्यूल रिज़ॉल्यूशन (नीचे देखें)। |
| `unhandledRejections` | `'throw' \| 'ignore'` | क्या अनहैंडल्ड Promise rejection प्रोग्राम को विफल करता है (डिफ़ॉल्ट `'throw'`)। |
| `scriptPrelude`, `realms`, `agents` | — | Test262 हार्नेस द्वारा उपयोग किए जाने वाले विकल्प। |

### `CompileResult`

```ts
type CompileResult =
  | { ok: true; image: Uint8Array; imports: string[] }   // imports: "DLL!function" of a PE image
  | { ok: false; diagnostics: Diagnostic[] };            // { code, message, file, span }
```

`span.start` और `span.end` सोर्स में UTF-16 ऑफ़सेट हैं।

## `ModuleHost`

```ts
interface ModuleHost {
  resolve(specifier: string, referrer: string): string | undefined;
  read(path: string): string | undefined;
  candidates?(referrer: string): string[];
}
```

पाथ होस्ट द्वारा चुनी गई कैनोनिकल, `/` से अलग की गई स्ट्रिंग होते हैं। डिफ़ॉल्ट होस्ट रिलेटिव स्पेसिफ़ायर को संदर्भित करने वाली फ़ाइल के पास रिज़ॉल्व करता है और फ़ाइलें डिस्क से पढ़ता है। `candidates` उन मॉड्यूलों की सूची देता है जिनका नाम कोई computed `import()` ले सकता है, ताकि वे कंपाइल में शामिल हो जाएँ। बिल्ट-इन `nona:*` और `node:*` मॉड्यूल होस्ट से पूछने से पहले ही रिज़ॉल्व हो जाते हैं।


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
