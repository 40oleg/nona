---
layout: home

hero:
    name: Nona
    text: JavaScript থেকে নেটিভ এক্সিকিউটেবল
    tagline: একটি ahead-of-time কম্পাইলার, যা ES2020 JavaScript-কে Windows, Linux, macOS, FreeBSD ও OpenBSD-এর ছোট স্বতন্ত্র এক্সিকিউটেবলে রূপান্তর করে। কোনো এমবেডেড ইন্টারপ্রেটার নেই, কোনো C টুলচেইন নেই।
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
      details: কম্পাইল করা hello world প্রায় 2 ms-এ চালু হয় এবং সর্বোচ্চ 11 MB মেমরি নেয়, আর ফাইলটির আকার প্রায় 2 MB। Node.js-এর লাগে 28 ms ও 45 MB; একটি Node SEA এক্সিকিউটেবল 124 MB।
      link: /bn/guide/performance
    - title: যেকোনো হোস্ট থেকে আটটি টার্গেট
      details: x64 ও ARM64-এ Windows, Linux ও macOS, এবং x64-এ FreeBSD ও OpenBSD। --target দিয়ে ক্রস-কম্পাইল করুন; প্রতিটি এক্সিকিউটেবল স্বয়ংসম্পূর্ণ।
      link: /reference/native-platforms
    - title: ES2020 ভাষা
      details: ক্লাস, জেনারেটর, async ফাংশন, ডিস্ট্রাকচারিং, অপশনাল চেইনিং, BigInt, প্রপার টেইল কল এবং সাইকেল ও লাইভ বাইন্ডিংসহ ES মডিউল, নথিভুক্ত ব্যতিক্রমসহ।
      link: /bn/guide/language-support
    - title: npm প্যাকেজ
      details: node_modules-এর প্যাকেজ বিল্টের সময় রিজলভ হয় এবং প্রয়োজনীয় Node.js মডিউলসহ এক্সিকিউটেবলে কম্পাইল হয়।
      link: /reference/npm
    - title: Node.js-স্টাইল হোস্ট API
      details: টাইমারসহ ইভেন্ট লুপ, process, fs, path, Buffer, স্ট্রিম, events, URL এবং HTTP ও TCP সার্ভার ও ক্লায়েন্ট।
      link: /bn/reference/modules
    - title: নেটিভ রানটাইম
      details: একটি নির্ভুল mark-and-sweep গার্বেজ কালেক্টর, UTF-16 স্ট্রিং, আসল এক্সেপশন, ধরা যায় এমন RangeError (স্ট্যাক ওভারফ্লোতে) এবং একটি self-hosted কম্পাইলার।
      link: /bn/guide/how-it-works
    - title: FFI ও Windows GUI প্রোগ্রাম
      details: কম্পাইল-টাইম ডিক্লারেশন দিয়ে যেকোনো DLL এক্সপোর্ট কল করুন, এবং কনসোল উইন্ডো ছাড়া, আইকন, ম্যানিফেস্ট ও ভার্সন তথ্যসহ প্রোগ্রাম তৈরি করুন।
      link: /bn/reference/ffi
---

## দ্রুত উদাহরণ

<<< ../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux and macOS]
nona build hello.js -o build/hello
./build/hello
```

```sh [Cross-compile]
nona build hello.js -o build/hello --target linux-arm64
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

বর্তমান রিলিজ **v0.31.0**; Nona পরীক্ষামূলক। এটি Node.js-এর সরাসরি বিকল্প নয় এবং এর কোনো নিরাপত্তা নিরীক্ষা (security audit) হয়নি।

- **কনফর্মেন্স।** সর্বশেষ পূর্ণ নিরীক্ষায় (v0.8.0) পিন করা Test262 স্যুট Windows x64-এ 22436/22492 language, 15868/15933 built-in, 268/268 Atomics এবং 996/1016 Annex B টেস্ট পাস করেছে। বাকি প্রতিটি ব্যর্থতা [অবস্থা পৃষ্ঠায়](/bn/guide/status) শ্রেণিবদ্ধ করা আছে।
- **গতি।** স্টার্টআপ, এক্সিকিউটেবলের আকার ও মেমরি Nona-র শক্তি। প্রোগ্রামের ভেতরের গণনায় JIT নেই: সরল লুপে V8-এর সমান থেকে শুরু করে ফাংশন কল, অ্যালোকেশন ও দীর্ঘক্ষণ চলা বাস্তব প্রোগ্রামে কয়েক গুণ বা কয়েক দশ গুণ ধীর। পরিমাপ ও পরিচিত ধীর জায়গাগুলো [পারফরম্যান্স](/bn/guide/performance) পৃষ্ঠায় আছে।
- **সীমাবদ্ধতা।** `eval` ও `Function`-এর জন্য কম্পাইল-টাইমে জানা সোর্স টেক্সট লাগে, এবং কেবল Nona যে Node.js API বাস্তবায়ন করে সেগুলোই আছে। দেখুন [সামঞ্জস্য ও সীমাবদ্ধতা](/bn/guide/compatibility)।
