# শুরু করা

## ইনস্টল

আপনার সিস্টেমের আর্কাইভটি [সর্বশেষ রিলিজ](https://github.com/40oleg/nona/releases/latest) থেকে ডাউনলোড করুন, এক্সট্র্যাক্ট করুন এবং `nona --help` চালান (Linux, macOS ও BSD-তে `./nona --help`)। আর্কাইভে থাকে এক্সিকিউটেবল (Windows-এ `nona.exe`, অন্য সিস্টেমে `nona`), `LICENSE`, `VERSION`, `README.txt` ও `THIRD_PARTY_NOTICES.md`; কম্পাইলারটি একটি নেটিভ প্রোগ্রাম, যার Node.js লাগে না। প্রতিটি রিলিজে `SHA256SUMS`-ও দেওয়া থাকে। নিচের আর্কাইভের নামগুলিতে `<version>` রিলিজের ভার্সন বোঝায়।

তৈরি করা প্রোগ্রাম বিতরণের সময় কম্পাইলারের আর্কাইভ থেকে `LICENSE` ও `THIRD_PARTY_NOTICES.md` ফাইল দুটি এক্সিকিউটেবলের সঙ্গে দিন। শেয়ার করা রানটাইমে এই [বিজ্ঞপ্তিগুলির](https://github.com/40oleg/nona/blob/main/THIRD_PARTY_NOTICES.md) আওতায় থাকা অদশমিক সংখ্যা ফরম্যাটিং ও ঘনমূল সমর্থন রয়েছে; ARM64 আউটপুট সফটওয়্যারে বাস্তবায়িত লগারিদম ও সূচকীয় ফাংশনও ব্যবহার করে।

| OS                          | আর্কাইভ                                                                  | টার্গেটের নাম                |
| --------------------------- | ------------------------------------------------------------------------ | ---------------------------- |
| Windows x64 / ARM64         | `nona-<version>-win32-x64.zip`, `nona-<version>-win32-arm64.zip`         | `win32-x64`, `win32-arm64`   |
| Linux x64 / ARM64           | `nona-<version>-linux-x64.tar.gz`, `nona-<version>-linux-arm64.tar.gz`   | `linux-x64`, `linux-arm64`   |
| macOS Intel / Apple Silicon | `nona-<version>-darwin-x64.tar.gz`, `nona-<version>-darwin-arm64.tar.gz` | `darwin-x64`, `darwin-arm64` |
| FreeBSD / OpenBSD x64       | `nona-<version>-freebsd-x64.tar.gz`, `nona-<version>-openbsd-x64.tar.gz` | `freebsd-x64`, `openbsd-x64` |

আর্কাইভ টুল অনুমতি বাদ দিলে POSIX সিস্টেমে `chmod +x nona` চালান। কিছু ইনস্টল না করেই Nona চেষ্টা করতে [প্লেগ্রাউন্ড](/playground) ব্যবহার করুন।

### সোর্স থেকে বিল্ড

আপনার Node.js 26 বা নতুনতর এবং npm লাগবে, Node.js 26 চালায় এমন যেকোনো হোস্টে।

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
node dist/cli.js --help
```

কম্পাইলারের এন্ট্রি পয়েন্ট হলো `dist/cli.js`। রিপোজিটরিতে `npm link` চালালে আপনার `PATH`-এ একটি `nona` কমান্ড যুক্ত হয়। এই সাইটের বাকি অংশে `nona` লেখা আছে; ক্লোন থেকে এর বদলে `node dist/cli.js` চালান।

## আপনার প্রথম প্রোগ্রাম

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux and macOS]
nona build hello.js -o build/hello
./build/hello
```

:::

```text
Hello, from Nona!
a microtask runs before any timer
tick 1
tick 2
tick 3
done; at least 30 ms passed: true
```

যখন আর কোনো টাইমার বা Promise জব বাকি থাকে না, প্রোগ্রাম শেষ হয়। এক্সিকিউটেবলটি নিজে নিজেই চলে: Node.js নেই এমন কোনো মেশিনে কপি করুন, তবুও এটি কাজ করবে।

## টার্গেট ও ক্রস-কম্পাইলেশন

কম্পাইলারটি একটি ক্রস-কম্পাইলার: যেকোনো হোস্ট আটটি [নেটিভ প্ল্যাটফর্মের](/reference/native-platforms) যেকোনোটির জন্য এক্সিকিউটেবল তৈরি করতে পারে। `--target` আউটপুট ফরম্যাট ও CPU বেছে নেয়; এটি না দিলে টার্গেট হয় হোস্টের OS ও CPU।

```sh
nona build hello.js -o build/hello --target linux-arm64
nona build hello.js -o build/hello.exe --target win32-x64
```

ক্রস-কম্পাইল করা এক্সিকিউটেবল কেবল মিলে যাওয়া OS ও CPU-তে চলে। Linux, BSD ও macOS আউটপুট `0755` মোডে লেখা হয়।

## মডিউল

একটি `.mjs` ইনপুট, অথবা `--module` দিয়ে কম্পাইল করা যেকোনো ইনপুট, একটি ES মডিউল। আপেক্ষিক ইমপোর্ট (`./util.mjs`, `../lib/x.mjs`) ইমপোর্টকারী ফাইলের পাশ থেকে রিজলভ হয় এবং একই এক্সিকিউটেবলে কম্পাইল হয়। একটি CommonJS ইনপুট তার `require` করা সবকিছুসহ একসঙ্গে কম্পাইল হয়।

বিল্ট-ইন মডিউল `nona:` প্রিফিক্স ব্যবহার করে (`nona:ffi`, `nona:win32`, `nona:fs`, `nona:process`); Node.js-এর অনেক নামও (`node:fs`, `node:path`, `node:http`, …) পাওয়া যায়। দেখুন [বিল্ট-ইন মডিউল](/bn/reference/modules)।

## npm প্যাকেজ

npm দিয়ে যথারীতি প্যাকেজ ইনস্টল করে বিল্ড করুন: Nona বিল্টের সময় `node_modules` রিজলভ করে এবং প্যাকেজগুলো এক্সিকিউটেবলে কম্পাইল করে। `nona build <package directory>` প্যাকেজটির `"bin"` কমান্ড বা `"main"` মডিউল বিল্ড করে। দেখুন [npm প্যাকেজ](/reference/npm)।

## কনসোল ছাড়া Windows প্রোগ্রাম

```sh
nona build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` প্রোগ্রামটিকে কনসোল উইন্ডো ছাড়া চালু করে এবং একটি ডিফল্ট ম্যানিফেস্ট যুক্ত করে; `--icon` ও `--version-info` এমন রিসোর্স যোগ করে যা Explorer দেখায়। দেখুন [Windows এক্সিকিউটেবল](/bn/reference/windows-executables) এবং [Museum উদাহরণ](/bn/examples/museum)।

## সমস্যা সমাধান

কম্পাইল ত্রুটি `file:line:column CODE: message` আকারে প্রিন্ট হয় এবং কম্পাইলার স্ট্যাটাস 1 দিয়ে বের হয়:

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- অসমর্থিত সিনট্যাক্স রানটাইমে ব্যর্থ হওয়ার বদলে কম্পাইলের সময়েই প্রত্যাখ্যাত হয়।
- `E_FFI_TARGET` মানে একটি DLL ডিক্লারেশন Windows-বহির্ভূত টার্গেটের জন্য কম্পাইল হয়েছে (অথবা একটি সিস্টেম কল `win32-x64`-এর জন্য)।
- `E_HOST_MODULE` মানে একটি বিল্ট-ইন মডিউল ওই টার্গেটে উপলব্ধ নয়।
- রানটাইমে `EvalError` মানে `eval` বা `Function` এমন সোর্স টেক্সট পেয়েছে যা কম্পাইলের সময় জানা ছিল না।

[কমান্ড লাইন রেফারেন্সে](/bn/reference/cli) প্রতিটি অপশন ও ত্রুটির তালিকা আছে।

## পরবর্তী ধাপ

- [উদাহরণ](/bn/examples/) — ব্যাখ্যাসহ সম্পূর্ণ প্রোগ্রাম।
- [ভাষা সমর্থন](/bn/guide/language-support) এবং [সামঞ্জস্য ও সীমাবদ্ধতা](/bn/guide/compatibility) — কী আশা করবেন।
- [বিল্ট-ইন মডিউল](/bn/reference/modules) — হোস্ট API।
