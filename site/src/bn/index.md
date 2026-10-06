---
layout: home

hero:
  name: Nona
  text: JavaScript থেকে নেটিভ এক্সিকিউটেবল
  tagline: একটি ahead-of-time কম্পাইলার, যা ES2020 JavaScript-কে Windows ও Linux x64-এর স্বতন্ত্র এক্সিকিউটেবলে রূপান্তর করে। কোনো এমবেডেড ইন্টারপ্রেটার নেই, কোনো C টুলচেইন নেই। Windows/Linux ARM64, macOS Intel, FreeBSD/OpenBSD x64.
  actions:
    - theme: brand
      text: শুরু করুন
      link: /bn/guide/getting-started
    - theme: alt
      text: ব্রাউজারে চেষ্টা করুন
      link: /playground
    - theme: alt
      text: Nona কী
      link: /bn/guide/what-is-nona
    - theme: alt
      text: GitHub
      link: https://github.com/40oleg/nona

features:
  - title: 2 ms-এ চালু
    details: কম্পাইল করা hello world 1.8 ms-এ চালু হয় এবং সর্বোচ্চ 11 MB মেমরি নেয়, আর এক্সিকিউটেবলটির আকার 3 MB। Node.js-এর লাগে 28 ms ও 45 MB; একটি Node SEA এক্সিকিউটেবল 124 MB।
    link: /bn/guide/performance
  - title: ES2020 ভাষা
    details: ক্লাস, জেনারেটর, async ফাংশন, ডিস্ট্রাকচারিং, অপশনাল চেইনিং, BigInt, প্রপার টেইল কল এবং সাইকেল ও লাইভ বাইন্ডিংসহ ES মডিউল — নথিভুক্ত ব্যতিক্রমসহ।
    link: /bn/guide/language-support
  - title: নেটিভ রানটাইম
    details: একটি নির্ভুল mark-and-sweep গার্বেজ কালেক্টর, UTF-16 স্ট্রিং, আসল এক্সেপশন এবং স্ট্যাক ওভারফ্লোতে ধরা যায় এমন RangeError — সবই প্রতিটি এক্সিকিউটেবলে লিঙ্ক করা।
    link: /bn/guide/how-it-works
  - title: হোস্ট API
    details: টাইমারসহ একটি ইভেন্ট লুপ, গ্লোবাল process, সিঙ্ক্রোনাস node:fs, TextEncoder ও TextDecoder।
    link: /bn/reference/host-apis
  - title: FFI ও nona:win32
    details: কম্পাইল-টাইম ডিক্লারেশন দিয়ে Windows-এ যেকোনো DLL এক্সপোর্ট কল করুন; user32, kernel32 ও advapi32-এর জন্য তৈরি বাইন্ডিং।
    link: /bn/reference/ffi
  - title: Windows GUI এক্সিকিউটেবল
    details: কনসোল উইন্ডো ছাড়া প্রোগ্রাম, আইকন, অ্যাপ্লিকেশন ম্যানিফেস্ট ও ভার্সন তথ্যসহ।
    link: /bn/reference/windows-executables
---

## দ্রুত উদাহরণ

<<< ../../samples/hello.js

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

এক্সিকিউটেবলে থাকে প্রোগ্রামের মেশিন কোড এবং Nona-র রানটাইম। এর Node.js লাগে না: Windows এক্সিকিউটেবল শুধু `KERNEL32.dll` ইমপোর্ট করে, আর Linux এক্সিকিউটেবল libc ছাড়াই সরাসরি সিস্টেম কল করে।

## অবস্থা

বর্তমান রিলিজ **v0.9.0**। পিন করা Test262 স্যুট (ES2020 ফিচার) Windows x64-এ 22436/22492 language, 15868/15933 built-in, 268/268 Atomics এবং 996/1016 Annex B টেস্ট পাস করে; বাকি প্রতিটি ব্যর্থতা [অবস্থা পৃষ্ঠায়](/bn/guide/status) শ্রেণিবদ্ধ করা আছে। স্টার্টআপ, এক্সিকিউটেবলের আকার ও মেমরি Nona-র শক্তি; প্রোগ্রামের ভেতরের গণনা V8-এর চেয়ে 20–100× ধীর, এবং কিছু অপারেশন (`Map`, `sort`, স্ট্রিং তৈরি, লম্বা Promise চেইন) এখনও super-linear — দেখুন [পারফরম্যান্স](/bn/guide/performance)। Nona পরীক্ষামূলক: এটি Node.js-এর সরাসরি বিকল্প নয় এবং এর কোনো নিরাপত্তা নিরীক্ষা (security audit) হয়নি।
