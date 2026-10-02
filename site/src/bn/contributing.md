# অবদান রাখা

## ডেভেলপমেন্ট সেটআপ

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run check            # build and run the unit suite
npm run compare          # compile examples/compat and compare with Node.js
npm run compare:linux    # the same for linux-x64
npm run test262:smoke    # a quick pinned Test262 subset
```

টেস্ট স্যুট আসল এক্সিকিউটেবল কম্পাইল করে চালায়: PE টেস্ট Windows-এ এবং ELF টেস্ট Linux-এ চলে, অনেকগুলো GC স্ট্রেসের অধীনে। CI (`.github/workflows/check.yml`) পূর্ণ স্যুট ও Test262 গ্রুপগুলো Windows-এ Node.js 26 দিয়ে চালায়, আর নেটিভ টেস্টগুলো Linux-এ। পূর্ণ Test262 নিরীক্ষার বর্ণনা আছে [Test262](/bn/reference/test262) পৃষ্ঠায়।

## কাজের ধারা

- প্রতিটি পরিবর্তন শুরু হয় একটি GitHub issue থেকে, যাতে থাকে প্রেরণা, একটি প্রস্তাব এবং গ্রহণযোগ্যতার মানদণ্ড (acceptance criteria)।
- একটি issue — একটি ব্রাঞ্চ (`issue-<number>-<short-slug>`) — একটি pull request, যার বিবরণে থাকে `Closes #N`, ডিজাইন, কীভাবে টেস্ট করা হয়েছে এবং জানা সীমাবদ্ধতা।
- `main`-কে সবুজ রাখুন: `check` workflow পাস করলেই কেবল একটি pull request মার্জ হয়।
- Issue, pull request, কমিট বার্তা, কোড মন্তব্য ও ডকুমেন্টেশন ইংরেজিতে লেখা হয়।

## টেস্ট

টেস্টগুলো থাকে `tests/*.test.ts`-এ। Node.js oracle (`runOracle`)-সহ `runOnHost` ব্যবহার করাই ভালো: তখন একই টেস্ট উভয় টার্গেটে, GC স্ট্রেসের অধীনে চলে এবং প্রোগ্রামের আউটপুট Node.js-এর সঙ্গে তুলনা করে।

## কোড কনভেনশন

- কম্পাইলারটি TypeScript-এ (`src/`)। রানটাইম কোড `RuntimeBuilder` (`src/runtime/*.ts`)-এর মাধ্যমে x86-64 হিসেবে তৈরি হয় অথবা JavaScript প্রিলিউড (`src/runtime/*-source.ts`) হিসেবে লেখা হয়, যা প্রতিটি এক্সিকিউটেবলে কম্পাইল হয়।
- প্রিলিউড টপ-লেভেল `var` বাইন্ডিং যোগ করতে পারবে না; কোডকে একটি IIFE-তে মুড়ে দিন।
- নেটিভ রানটাইম ফাংশন Win64 ABI মেনে চলে (shadow space, কলের সময় 16-বাইট অ্যালাইনমেন্ট, callee-saved রেজিস্টার)। যে ফাংশন মেমরি বরাদ্দ করতে পারে এমন কলের পার জুড়ে মান ধরে রাখে, সেটি `rootedFn` ব্যবহার করে।
- প্রতিটি নতুন KERNEL32 ইমপোর্টের জন্য `src/backend/linux/shims.ts`-এ একটি Linux সিস্টেম-কল শিম দরকার।
- তৈরি এক্সিকিউটেবল বাহ্যিক নির্ভরতা থেকে মুক্ত থাকে: কোনো libc নেই, কোনো C টুলচেইন নেই, সঙ্গে দেওয়া কোনো DLL নেই।

## ডকুমেন্টেশন

যখন কোনো ফিচার প্রোগ্রামের কাছে দৃশ্যমান আচরণ বদলায়, তখন হালনাগাদ করুন:

- `README.md` ও `README.ru.md`;
- `docs/`-এর রেফারেন্স নথি (`host-apis.md`, `process.md`, `fs.md`, `ffi.md`, `windows-executables.md`, `test262.md`) — সাইট এই ফাইলগুলো স্বয়ংক্রিয়ভাবে অন্তর্ভুক্ত করে;
- `site/src/`-এর সেই সাইট পৃষ্ঠাগুলো যা ফিচারটি বর্ণনা করে, যেমন [ভাষা সমর্থন](/bn/guide/language-support) বা [কমান্ড লাইন](/bn/reference/cli) পৃষ্ঠা;
- `CHANGELOG.md`-এ `## Unreleased`-এর নিচে, issue-এর লিঙ্কসহ।

## ডকুমেন্টেশন সাইট

সাইটটি `site/` থেকে [VitePress](https://vitepress.dev) দিয়ে বিল্ড হয়:

```sh
npm run build              # the compiler, needed to check the samples
cd site
npm ci
npm run dev                # local server with live reload
npm run build              # production build; fails on broken internal links
npm run check:samples      # compiles every program in site/samples
```

চালানো যায় এমন উদাহরণগুলো হলো `site/samples/`-এর ফাইল, যা `<<<` দিয়ে অন্তর্ভুক্ত করা হয়; নামে `.win32.` বা `.linux.` থাকলে নমুনাটি সেই টার্গেটে সীমিত থাকে। নতুন পৃষ্ঠা কীভাবে যোগ করতে হয় তা `site/README.md`-এ ব্যাখ্যা করা আছে। সাইটটি `.github/workflows/pages.yml` দ্বারা `main` থেকে GitHub Pages-এ প্রকাশিত হয়।

সাইটটি কয়েকটি ভাষায় অনূদিত। ইংরেজি পৃষ্ঠাগুলোই উৎস; অনুবাদগুলো থাকে `site/src/<locale>/`-এ। কোনো ইংরেজি পৃষ্ঠা বদলালে অনুবাদগুলো হালনাগাদ করুন, অথবা অন্তত নিশ্চিত করুন যে সেগুলো ইংরেজি পৃষ্ঠার সঙ্গে সাংঘর্ষিক নয়।

## স্বয়ংক্রিয় অবদানকারী

এজেন্টদের নিয়ম — `blocked` লেবেল দিয়ে issue দাবি করা, কমিটের লেখকত্ব এবং pull request-এর চেকলিস্ট — আছে [`AGENTS.md`](https://github.com/40oleg/nona/blob/main/AGENTS.md)-এ।
