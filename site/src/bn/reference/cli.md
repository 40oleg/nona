# কমান্ড লাইন

## সারসংক্ষেপ

```text
Nona 0.8.0 — JavaScript subset to native executables
Usage: nona build <input.js> -o <output> [--target win32-x64|linux-x64|linux-arm64|win32-arm64|darwin-x64|freebsd-x64|openbsd-x64] [--module]
       [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
       [--version-info version.json]
       (.mjs inputs are compiled as modules)
       nona --help | --version
```

রিপোজিটরির একটি ক্লোন থেকে `node dist/cli.js …` চালান; `npm link`-এর পরে একই কমান্ড `nona` হিসেবে পাওয়া যায়।

## অপশন

| অপশন | মান | বিবরণ |
| --- | --- | --- |
| `-o` | পাথ | আউটপুট ফাইল। আবশ্যক। অনুপস্থিত ডিরেক্টরি তৈরি করা হয়। |
| `--target` | [Native platforms](/reference/native-platforms) | PE32+, ELF64 or Mach-O64; default: host OS and CPU. |
| `--module` | — | ইনপুটকে ES মডিউল হিসেবে কম্পাইল করে। `.mjs`-এ শেষ হওয়া ইনপুট স্বয়ংক্রিয়ভাবে মডিউল। |
| `--subsystem` | `console` (ডিফল্ট), `windows` | কনসোল উইন্ডো ছাড়া Windows GUI প্রোগ্রাম। কেবল `win32-x64`। `--manifest` ছাড়া একটি GUI প্রোগ্রাম একটি ডিফল্ট ম্যানিফেস্ট পায়। |
| `--icon` | `.ico` ফাইল | আইকন ফাইলের প্রতিটি ছবি যুক্ত করে। কেবল `win32-x64`। |
| `--manifest` | XML ফাইল | একটি অ্যাপ্লিকেশন ম্যানিফেস্ট যুক্ত করে। এটি বৈধ হতে হবে: ত্রুটিপূর্ণ ম্যানিফেস্টসহ প্রোগ্রাম Windows চালু করতে অস্বীকার করে। কেবল `win32-x64`। |
| `--version-info` | JSON ফাইল | ভার্সন তথ্য যুক্ত করে (`FileVersion`, `ProductVersion`, `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName`, `Comments`)। কেবল `win32-x64`। |
| `--help` | — | সারসংক্ষেপ প্রিন্ট করে। |
| `--version` | — | কম্পাইলারের ভার্সন প্রিন্ট করে। |

প্রতিটি অপশন একবারই আসতে পারে। রিসোর্সের ফরম্যাটের জন্য দেখুন [Windows এক্সিকিউটেবল](/bn/reference/windows-executables)।

## ইনপুট ও আউটপুট

- ইনপুট হলো একটি UTF-8 সোর্স ফাইল। একটি মডিউল ইনপুট তার ইমপোর্ট করা মডিউলগুলো টেনে আনে; বিল্ট-ইন `nona:*` ও `node:*` মডিউল কম্পাইলারেরই অংশ।
- আউটপুট প্রথমে তার পাশে একটি অস্থায়ী ফাইলে লেখা হয় এবং তারপর নাম বদলে যথাস্থানে রাখা হয়, তাই ব্যর্থ বিল্ড কখনও অর্ধেক লেখা এক্সিকিউটেবল রেখে যায় না এবং আগেরটি অক্ষত রাখে।
- কম্পাইলার তার ইনপুট ওভাররাইট করতে অস্বীকার করে, হার্ড লিঙ্ক বা সিম্বলিক লিঙ্কের মাধ্যমেও।
- Linux আউটপুট `0755` মোড পায়।

## রানটাইম ক্যাশ

একই অংশ লিঙ্ক করা প্রতিটি প্রোগ্রামের জন্য কম্পাইল করা রানটাইম ও প্রিলিউড একই থাকে, আর সেগুলো তৈরি করতেই বিল্ডের বেশিরভাগ সময় লাগে। কমান্ড লাইন সেগুলো একটি ক্যাশ ডিরেক্টরিতে রাখে, তাই পরের বিল্ডগুলো প্রায় তিন গুণ দ্রুত হয় (Linux-এ hello world: 1.1 s, তারপর 0.33 s)। ক্যাশ থাকুক বা না থাকুক আউটপুট একই। এন্ট্রিগুলো একটি নির্দিষ্ট কম্পাইলার বিল্ডের, আপডেটের পরে সেগুলো উপেক্ষা করা হয়।

| ভেরিয়েবল | প্রভাব |
| --- | --- |
| `NONA_CACHE_DIR` | ক্যাশ ডিরেক্টরি। ডিফল্ট: Windows-এ `%LOCALAPPDATA%\nona\cache`, macOS-এ `~/Library/Caches/nona`, অন্যত্র `$XDG_CACHE_HOME/nona` বা `~/.cache/nona`। |
| `NONA_CACHE=0` | ক্যাশ পড়বে না, লিখবেও না। |

## ডায়াগনস্টিক ও এক্সিট কোড

সফল হলে এক্সিট স্ট্যাটাস `0`, যেকোনো ত্রুটিতে `1`। সোর্সের ত্রুটি এভাবে প্রিন্ট হয়:

```text
<file>:<line>:<column> <CODE>: <message>
```

| কোড | অর্থ |
| --- | --- |
| `E_LEX`, `E_SYNTAX` | সোর্স টোকেনাইজ বা পার্স করা যায় না, অথবা অসমর্থিত সিনট্যাক্স ব্যবহার করে। |
| `E_BIND` | নাম রিজলভ করার সময় পাওয়া একটি early error (ডুপ্লিকেট ডিক্লারেশন, অবৈধ অ্যাসাইনমেন্ট টার্গেট, …)। |
| `E_MODULE` | একটি মডিউল রিজলভ, পড়া বা লিঙ্ক করা যায় না, অথবা এক্সপোর্টে সংঘাত আছে। |
| `E_FFI_STATIC` | `nona:ffi`-এর একটি `define()` কল তিনটি স্ট্রিং লিটারাল নয় বা এর সিগনেচার অবৈধ। |
| `E_FFI_TARGET` | একটি DLL ডিক্লারেশন `linux-x64`-এর জন্য, অথবা একটি সিস্টেম কল ডিক্লারেশন `win32-x64`-এর জন্য কম্পাইল হয়েছে। |
| `E_RESOURCE` | অবৈধ আইকন বা ভার্সন তথ্য, অথবা `linux-x64`-এর জন্য রিসোর্স চাওয়া হয়েছে। |
| `E_TARGET` | অসমর্থিত টার্গেট বা সাবসিস্টেম। |

আর্গুমেন্টের ত্রুটি `nona: <message>` হিসেবে প্রিন্ট হয়, যেমন `Unknown option: --foo`, `Duplicate option: -o`, `Missing value for --target`, `Output is required (-o <output>)`, `Unsupported target: arm64`, `Unsupported subsystem: native` অথবা `--subsystem requires --target win32-x64`।

## উদাহরণ

::: code-group

```sh [কনসোল প্রোগ্রাম]
node dist/cli.js build app.js -o build/app.exe
```

```sh [রিসোর্সসহ GUI প্রোগ্রাম]
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

```sh [Linux]
node dist/cli.js build app.js -o build/app --target linux-x64
```

:::


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
