# সামঞ্জস্য ও সীমাবদ্ধতা

## পরিধি

Nona স্ক্রিপ্ট ও ES মডিউলের জন্য ECMA-262-এর 11তম সংস্করণের (জুন 2020) নির্ধারক (normative) ভাষা ও বিল্ট-ইনকে লক্ষ্য করে। ECMA-402 আন্তর্জাতিকীকরণ, ব্রাউজার API ও Node.js API আলাদা স্পেসিফিকেশন; Nona কেবল [রেফারেন্সে](/bn/reference/modules) তালিকাভুক্ত হোস্ট API সরবরাহ করে। সম্পূর্ণতার চুক্তি রাখা আছে [`docs/es2020-contract.md`](https://github.com/40oleg/nona/blob/main/docs/es2020-contract.md)-এ।

একটি রিলিজকে বর্ণনা করা হয় «নথিভুক্ত ব্যতিক্রমসহ ES2020» হিসেবে, কখনোই পুরোপুরি মানানসই (fully conformant) ES2020 হিসেবে নয়।

## `eval` ও `Function` {#eval-and-function}

Nona আগেভাগে (ahead of time) কম্পাইল করে, তাই `eval` ও ডায়নামিক ফাংশন কনস্ট্রাক্টরগুলোর সোর্স টেক্সট কম্পাইলের সময়েই দরকার:

- **আগেভাগে কম্পাইল হয়:** একটি স্ট্রিং লিটারাল, লিটারালের সংযুক্তি, অথবা এমন একটি ভেরিয়েবল যাতে কেবল এ ধরনের কনস্ট্যান্টই অ্যাসাইন করা হয় (মানটি রানটাইমে তুলনা করা হয়)। Direct `eval` কলারের স্কোপ, `this`, `arguments`, `new.target` ও `super` দেখতে পায়; indirect রূপগুলো (`(0, eval)(…)`, `globalThis.eval(…)`, `eval?.(…)`) গ্লোবাল স্কোপে চলে। `Function`, `GeneratorFunction`, `AsyncFunction` ও `AsyncGeneratorFunction` কল, যাদের সব আর্গুমেন্ট লিটারাল, CreateDynamicFunction সিমান্টিক্সসহ কম্পাইল হয়।
- **সমর্থিত নয়:** রানটাইমে গণনা করা সোর্স, `eval`-এ spread আর্গুমেন্ট এবং `$262.evalScript`। এগুলো ছোড়ে:

```text
EvalError: Nona compiles ahead of time: eval and Function need source text known at compile time
```

রানটাইম সোর্স [#11](https://github.com/40oleg/nona/issues/11)-এ ট্র্যাক করা হচ্ছে।

## Node.js-এর সঙ্গে পার্থক্য

| ক্ষেত্র | Nona | Node.js |
| --- | --- | --- |
| `process.argv` | `[execPath, ...arguments]`: `argv[1]` হলো প্রথম আর্গুমেন্ট | `[node, script, ...arguments]` |
| `process` | Common metadata, environment mutation, clocks/ticks, standard I/O, lifecycle/warnings, CPU/resources and native process control (all eight targets) | Signal handlers, IPC, V8 heap reports, full async streams and terminal control |
| টাইমার id | Number | `Timeout` অবজেক্ট |
| `readFileSync(path)` | `Uint8Array` ফেরত দেয় | `Buffer` ফেরত দেয় |
| এনকোডিং | কেবল `utf8` (fs); UTF-8, UTF-16LE, Latin-1, ASCII, hex, base64/base64url (Buffer) | অনেক |
| Windows-এ ত্রুটির বার্তা | যেভাবে দেওয়া হয়েছে সেভাবেই পাথ থাকে | পরম (absolute) পাথ থাকে |
| মডিউল | `nona:*`, `node:fs`, `node:path`, `node:process`, `node:buffer` ও আপেক্ষিক ফাইল | `node:*`-এর সবকিছু এবং npm প্যাকেজ |
| `require` | উপলব্ধ নয় | উপলব্ধ |
| স্ট্যান্ডার্ড আউটপুট ছাড়া `console.log` | আউটপুট বাদ দেওয়া হয় | আউটপুট বাদ দেওয়া হয় বা ত্রুটি ওঠে |

## পারফরম্যান্স

- অ্যারে ও `Map`/`Set` তাদের উপাদান লিঙ্কড কাঠামোয় রাখে; খুব বড় কালেকশন V8-এর চেয়ে ধীর ([#13](https://github.com/40oleg/nona/issues/13), [#36](https://github.com/40oleg/nona/issues/36))।
- RegExp ইঞ্জিনটি JavaScript-এ লেখা একটি ব্যাকট্র্যাকিং VM। ব্যাকরেফারেন্স ও লুকঅ্যারাউন্ড ছাড়া কোনো প্যাটার্ন অতিরিক্ত ব্যাকট্র্যাক করলে (`u` ফ্ল্যাগ ছাড়া) একটি লিনিয়ার-টাইম ইঞ্জিন তা শেষ করে।
- Windows-এ টাইমার সিস্টেম টিকে জাগে (সাধারণত 15.6 ms)।
- কোনো JIT নেই: কোড একবার, আগেভাগে, profile-guided অপ্টিমাইজেশন ছাড়া কম্পাইল হয়।

## Realm

Test262-এর জন্য `$262.createRealm` সমর্থিত। JavaScript প্রিলিউডে বাস্তবায়িত কিছু কনস্ট্রাক্টর অন্য realm থেকে `new.target` দিয়ে কল করা হলে এখনও ভুল realm থেকে ডিফল্ট প্রোটোটাইপ নেয় ([#7](https://github.com/40oleg/nona/issues/7))।

## প্ল্যাটফর্ম

- টার্গেট: কেবল Windows 10/11 x64 ও Linux x86-64।
- Windows এক্সিকিউটেবল কেবল `KERNEL32.dll`, `KERNELBASE.dll` এবং FFI দিয়ে ঘোষিত DLL ইমপোর্ট করে; Linux এক্সিকিউটেবল স্ট্যাটিক এবং সরাসরি সিস্টেম কল ব্যবহার করে।
- DLL-এ FFI কেবল Windows-এ; সরাসরি সিস্টেম কল কেবল Linux-এ।

## নেটিভ প্ল্যাটফর্ম

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — নেটিভ প্ল্যাটফর্ম](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.

## Buffer

Global `Buffer`, `Blob` and `File`, and `node:buffer` / `buffer` / `nona:buffer` imports are available on every native target. Buffer supports standard byte encodings, shared slices, copying, searching and numeric access. Blob/File support immutable data and metadata. Blob byte/text streams and object URL registration/resolution are available; see [the API contract and limitations](/reference/host-apis#buffer-and-binary-data).
