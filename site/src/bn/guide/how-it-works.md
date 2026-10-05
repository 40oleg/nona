# কীভাবে কাজ করে

## পাইপলাইন

```text
JavaScript source (script or module graph)
      │
      ▼
 lexer → parser → early errors and scope binding → compile-time eval/Function
                                                         │
                                                         ▼
                                     IR lowering → x86-64 code generation
                                                         │
                                                         ▼
                       runtime (native code + JS preludes) → PE32+ or ELF64 linker
```

সবকিছু কম্পাইলার প্রসেসের ভেতরেই চলে; কোনো বাহ্যিক অ্যাসেম্বলার, লিঙ্কার বা C কম্পাইলার নেই। ফলাফল একটি ফাইল, যাতে প্রোগ্রামের মেশিন কোড এবং Nona-র রানটাইম থাকে।

## ফ্রন্টএন্ড

[`src/frontend`](https://github.com/40oleg/nona/tree/main/src/frontend) সোর্স টেক্সটকে একটি বাউন্ড প্রোগ্রামে রূপান্তর করে:

- `lexer.ts`, `parser.ts` ও `ast.ts` সিনট্যাক্স ট্রি তৈরি করে; অসমর্থিত সিনট্যাক্স একটি কম্পাইল ত্রুটি।
- `binder.ts` ও `declarations.ts` early error প্রয়োগ করে, প্রতিটি আইডেন্টিফায়ারকে একটি স্কোপে (গ্লোবাল, মডিউল, ফাংশন, ব্লক, `with` অবজেক্ট) রিজলভ করে এবং ঠিক করে কোন বাইন্ডিং ক্লোজারে থাকবে।
- `modules.ts` মডিউল গ্রাফ লোড করে: স্ট্যাটিক ইমপোর্ট, লিটারাল স্পেসিফায়ারসহ `import()`, সাইকেল ও এক্সপোর্ট রিজলিউশন। `builtin-modules.ts` ও `fs-module.ts` `nona:*` ও `node:*` মডিউল সরবরাহ করে।
- `eval-aot.ts` ও `dynamic-functions.ts` সেই `eval` ও `Function` কল কম্পাইল করে, যাদের সোর্স টেক্সট কম্পাইলের সময় জানা।

## ইন্টারমিডিয়েট রিপ্রেজেন্টেশন

[`src/ir`](https://github.com/40oleg/nona/tree/main/src/ir) বাউন্ড প্রোগ্রামকে ব্লক, অপারেশন ও টার্মিনেটরের একটি রেজিস্টার-সদৃশ IR-এ নামিয়ে আনে (`lower.ts`, `model.ts`) এবং liveness গণনা করে (`liveness.ts`), যাতে গার্বেজ কালেক্টর প্রতিটি safepoint-এ কেবল জীবিত মানগুলো দেখে।

## কোড জেনারেশন

[`src/backend/x64`](https://github.com/40oleg/nona/tree/main/src/backend/x64)-এ আছে একটি x86-64 ইনস্ট্রাকশন এনকোডার ও অ্যাসেম্বলার এবং কোড জেনারেটর, যা IR অপারেশনগুলোকে রানটাইমে কল ও ইনলাইন fast path-এ রূপান্তর করে। তৈরি কোড ও রানটাইম উভয় টার্গেটেই Win64 কলিং কনভেনশন মেনে চলে।

## রানটাইম

প্রতিটি এক্সিকিউটেবলে [`src/runtime`](https://github.com/40oleg/nona/tree/main/src/runtime)-এর রানটাইম থাকে:

- **মান (value)** হলো 16-বাইটের ট্যাগযুক্ত জোড়া: undefined, null, বুলিয়ান, binary64 সংখ্যা, UTF-16 স্ট্রিং, অবজেক্ট, symbol ও BigInt।
- **অবজেক্ট** তাদের প্রপার্টি যোগ করার ক্রমে রাখে; 32 বা তার বেশি প্রপার্টিসহ অবজেক্ট একটি হ্যাশ ইনডেক্স পায়।
- বিল্ট-ইনের **নেটিভ কোড** একটি ছোট বিল্ডার (`RuntimeBuilder`) দিয়ে x86-64 হিসেবে তৈরি হয়।
- **JavaScript প্রিলিউড** (`*-source.ts`) লাইব্রেরির কিছু অংশ JavaScript-এ বাস্তবায়ন করে এবং প্রতিটি এক্সিকিউটেবলে কম্পাইল হয়: RegExp ইঞ্জিন, Promise ও async ড্রাইভার, Proxy ও Reflect হেল্পার, টাইমার ও ইভেন্ট লুপ, `process`, `TextEncoder`/`TextDecoder` এবং Annex B বিল্ট-ইন।

### গার্বেজ কালেক্টর

কালেক্টরটি নির্ভুল ও non-moving: স্পষ্ট রুটের (গ্লোবাল, safepoint-এ জীবিত স্ট্যাক স্লট, রানটাইম রুট স্কোপ) ওপর mark-and-sweep। জেনারেটর ও async ফাংশনের coroutine স্ট্যাক (প্রতিটি 1 MiB) কালেকশন থ্রেশহোল্ডে গণনা হয়। Linux-এ হিপ ব্লক আসে 1 MiB অ্যারিনা থেকে কেটে নেওয়া সাইজ ক্লাস থেকে। অভ্যন্তরীণ মেমরি চুক্তির বর্ণনা আছে [`docs/runtime-memory.md`](https://github.com/40oleg/nona/blob/main/docs/runtime-memory.md)-এ (রুশ ভাষায়)।

### এক্সেপশন, coroutine ও ইভেন্ট লুপ

- এক্সেপশন আসল unwind ডেটা দিয়ে নেটিভ ফ্রেম গুটিয়ে আনে; স্ট্যাক ওভারফ্লো একটি ধরা যায় এমন `RangeError` ছোড়ে।
- জেনারেটর ও async ফাংশন নিজস্ব স্ট্যাকে চলে এবং `yield` ও `await`-এ কনটেক্সট বদলায়।
- টপ-লেভেল প্রোগ্রামের পরে এন্ট্রি ইভেন্ট লুপ চালায়: এটি Promise জব খালি করে, CPU ব্যবহার না করে পরবর্তী টাইমারের জন্য অপেক্ষা করে এবং কিছু বাকি না থাকলে বের হয়ে যায় ([বিস্তারিত](/bn/reference/host-apis))।

## লিঙ্কিং

- **PE32+** ([`src/backend/pe`](https://github.com/40oleg/nona/tree/main/src/backend/pe)): সেকশন, ইমপোর্ট টেবিল (রানটাইমের জন্য KERNEL32, সঙ্গে FFI দিয়ে ঘোষিত DLL), base relocation, unwind ডেটা এবং রিসোর্স (আইকন, ম্যানিফেস্ট, ভার্সন তথ্য)।
- **ELF64** ([`src/backend/elf`](https://github.com/40oleg/nona/tree/main/src/backend/elf), [`src/backend/linux`](https://github.com/40oleg/nona/tree/main/src/backend/linux)): রানটাইম যে প্রতিটি KERNEL32 ফাংশন ব্যবহার করে, তার জন্য একই কলিং কনভেনশনসহ একটি Linux সিস্টেম-কল শিম আছে, তাই রানটাইম কোড দুই টার্গেটের মধ্যে ভাগ করা যায়।

## FFI

`define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)')` কলটি কম্পাইলের সময় রিজলভ হয়: ডিক্লারেশনটি PE ইমপোর্ট টেবিলের একটি এন্ট্রি এবং একটি নেটিভ থাঙ্ক হয়ে যায়, যা JavaScript মান রূপান্তর করে, Win64 ABI মেনে চলে এবং `GetLastError` সংরক্ষণ করে। Linux-এ `define('syscall', '1', …)` একটি সরাসরি সিস্টেম কল ঘোষণা করে। দেখুন [নেটিভ ফাংশন (FFI)](/bn/reference/ffi)।

## রিপোজিটরির গঠন

```text
src/frontend       lexer, parser, early errors, scope binding, compile-time eval/Function
src/ir             intermediate representation, lowering and liveness
src/backend/x64    x86-64 encoding and code generation
src/backend/pe     PE32+ linker: imports, relocations, unwind data, resources
src/backend/elf    ELF64 linker; src/backend/linux: system-call shims
src/runtime        native runtime and JavaScript preludes emitted into every executable
tests              unit, integration, native-execution and compatibility tests
examples           sample programs
site               this documentation site
```

## নেটিভ প্ল্যাটফর্ম

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — নেটিভ প্ল্যাটফর্ম](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.
