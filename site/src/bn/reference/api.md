# compile() API

কমান্ড লাইন হলো `src/compiler.ts`-এর `compile()`-এর ওপর একটি পাতলা আবরণ। প্যাকেজটি npm-এ প্রকাশিত নয়; `npm run build`-এর পরে মডিউলটি আপনার ক্লোনে `dist/src/compiler.js`।

## উদাহরণ

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

একটি সোর্স টেক্সট কম্পাইল করে এবং `CompileResult` ফেরত দেয়। এটি কোনো ফাইল লেখে না।

### `CompileOptions`

| অপশন | টাইপ | বিবরণ |
| --- | --- | --- |
| `fileName` | `string` | ডায়াগনস্টিকে ব্যবহৃত নাম; মডিউলের ক্ষেত্রে এটি সেই পাথও, যার সাপেক্ষে আপেক্ষিক ইমপোর্ট রিজলভ হয়। আবশ্যক। |
| `target` | `'win32-x64' \| 'linux-x64'` | আউটপুট ফরম্যাট। আবশ্যক। |
| `module` | `boolean` | ES মডিউল হিসেবে কম্পাইল করে। |
| `subsystem` | `'console' \| 'windows'` | PE সাবসিস্টেম (কেবল `win32-x64`)। |
| `icon` | `Uint8Array` | একটি `.ico` ফাইলের বিষয়বস্তু (কেবল `win32-x64`)। |
| `manifest` | `string` | অ্যাপ্লিকেশন ম্যানিফেস্ট XML (কেবল `win32-x64`)। |
| `versionInfo` | `VersionInfo` | ভার্সন তথ্যের ফিল্ড (কেবল `win32-x64`)। |
| `moduleHost` | `ModuleHost` | কাস্টম মডিউল রিজলিউশন (নিচে দেখুন)। |
| `unhandledRejections` | `'throw' \| 'ignore'` | আনহ্যান্ডেলড Promise rejection প্রোগ্রামকে ব্যর্থ করবে কি না (ডিফল্ট `'throw'`)। |
| `scriptPrelude`, `realms`, `agents` | — | Test262 হার্নেস যে অপশনগুলো ব্যবহার করে। |

### `CompileResult`

```ts
type CompileResult =
  | { ok: true; image: Uint8Array; imports: string[] }   // imports: "DLL!function" of a PE image
  | { ok: false; diagnostics: Diagnostic[] };            // { code, message, file, span }
```

`span.start` ও `span.end` হলো সোর্সে UTF-16 অফসেট।

## `ModuleHost`

```ts
interface ModuleHost {
  resolve(specifier: string, referrer: string): string | undefined;
  read(path: string): string | undefined;
  candidates?(referrer: string): string[];
}
```

পাথগুলো হোস্টের বেছে নেওয়া ক্যানোনিক্যাল, `/` দিয়ে আলাদা করা স্ট্রিং। ডিফল্ট হোস্ট আপেক্ষিক স্পেসিফায়ারকে রেফারকারী ফাইলের পাশে রিজলভ করে এবং ডিস্ক থেকে ফাইল পড়ে। `candidates` সেই মডিউলগুলোর তালিকা দেয়, যাদের নাম একটি computed `import()` নিতে পারে, যাতে সেগুলো কম্পাইলে অন্তর্ভুক্ত হয়। বিল্ট-ইন `nona:*` ও `node:*` মডিউল হোস্টকে জিজ্ঞাসা করার আগেই রিজলভ হয়।


## Native target availability

Windows/Linux x64 and ARM64, Intel macOS and FreeBSD/OpenBSD x64 targets are available. Apple Silicon startup is not enabled. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
