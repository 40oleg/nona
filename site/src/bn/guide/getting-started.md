# শুরু করা

## প্রয়োজনীয়তা

- কম্পাইলার চালাতে: Windows বা Linux-এ Node.js 26 বা নতুনতর এবং npm।
- টার্গেট: Windows 10/11 x64 (`win32-x64`, ডিফল্ট) এবং Linux x86-64 (`linux-x64`)।

## কম্পাইলার বিল্ড করুন

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
```

কম্পাইলারের এন্ট্রি পয়েন্ট হলো `dist/cli.js`; এই সাইটের উদাহরণগুলো একে `node dist/cli.js` হিসেবে চালায়। প্যাকেজটি একটি `nona` কমান্ডও ঘোষণা করে: রিপোজিটরিতে `npm link` চালালে সেটি আপনার `PATH`-এ যুক্ত হয়।

## আপনার প্রথম প্রোগ্রাম

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
node dist/cli.js build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux]
node dist/cli.js build hello.js -o build/hello --target linux-x64
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

কম্পাইলারটি একটি ক্রস-কম্পাইলার: Windows-এ এটি Linux এক্সিকিউটেবল তৈরি করতে পারে, আর Linux-এ Windows এক্সিকিউটেবল। `--target` আউটপুট ফরম্যাট বেছে নেয়; ডিফল্ট হলো `win32-x64`। Linux আউটপুট `0755` মোডে লেখা হয়।

## মডিউল

একটি `.mjs` ইনপুট, অথবা `--module` দিয়ে কম্পাইল করা যেকোনো ইনপুট, একটি ES মডিউল। আপেক্ষিক ইমপোর্ট (`./util.mjs`, `../lib/x.mjs`) ইমপোর্টকারী ফাইলের পাশ থেকে রিজলভ হয় এবং একই এক্সিকিউটেবলে কম্পাইল হয়। বিল্ট-ইন মডিউল `nona:` প্রিফিক্স ব্যবহার করে (`nona:ffi`, `nona:win32`, `nona:fs`, `nona:process`), আর `node:fs` ও `node:process` হলো Nona সাবসেটের উপনাম (alias); দেখুন [বিল্ট-ইন মডিউল](/bn/reference/modules)।

## কনসোল ছাড়া Windows প্রোগ্রাম

```sh
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` প্রোগ্রামটিকে কনসোল উইন্ডো ছাড়া চালু করে এবং একটি ডিফল্ট ম্যানিফেস্ট যুক্ত করে; `--icon` ও `--version-info` এমন রিসোর্স যোগ করে যা Explorer দেখায়। দেখুন [Windows এক্সিকিউটেবল](/bn/reference/windows-executables) এবং [Museum উদাহরণ](/bn/examples/museum)।

## সমস্যা সমাধান

কম্পাইল ত্রুটি `file:line:column CODE: message` আকারে প্রিন্ট হয় এবং কম্পাইলার স্ট্যাটাস 1 দিয়ে বের হয়:

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- অসমর্থিত সিনট্যাক্স রানটাইমে ব্যর্থ হওয়ার বদলে কম্পাইলের সময়েই প্রত্যাখ্যাত হয়।
- `E_FFI_TARGET` মানে একটি DLL ডিক্লারেশন `linux-x64`-এর জন্য কম্পাইল হয়েছে (অথবা একটি সিস্টেম কল `win32-x64`-এর জন্য)।
- রানটাইমে `EvalError` মানে `eval` বা `Function` এমন সোর্স টেক্সট পেয়েছে যা কম্পাইলের সময় জানা ছিল না।

[কমান্ড লাইন রেফারেন্সে](/bn/reference/cli) প্রতিটি অপশন ও ত্রুটির তালিকা আছে।

## নেটিভ প্ল্যাটফর্ম

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — নেটিভ প্ল্যাটফর্ম](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.
