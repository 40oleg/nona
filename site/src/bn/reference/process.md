# Process API

::: info অনুবাদ
এই পৃষ্ঠাটি ইংরেজি পৃষ্ঠা [Process API](/reference/process)-এর অনুবাদ, যা [`docs/process.md`](https://github.com/40oleg/nona/blob/main/docs/process.md) থেকে তৈরি। ইংরেজি সংস্করণটিই প্রামাণিক এবং সেটি আরও নতুন হতে পারে।
:::

`process` একটি গ্লোবাল অবজেক্ট (Node.js-এর মতো), যা `node:process` ও `nona:process`-এর ডিফল্ট এক্সপোর্ট হিসেবেও পাওয়া যায়; এই মডিউলগুলো অতিরিক্তভাবে `argv`, `env`, `platform`, `arch`, `pid`, `execPath`, `exit` ও `cwd` এক্সপোর্ট করে।

| সদস্য | টীকা |
| --- | --- |
| `argv` | `[execPath, ...arguments]`। কোনো স্ক্রিপ্ট পাথ নেই: `argv[1]` হলো প্রথম আর্গুমেন্ট (Node.js সেখানে স্ক্রিপ্টের পাথ রাখে)। Windows-এ কমান্ড লাইন `CommandLineToArgvW`-এর নিয়মে ভাগ করা হয়। |
| `env` | প্রথম অ্যাক্সেসের সময়ের এনভায়রনমেন্টের স্ন্যাপশটসহ একটি সাধারণ অবজেক্ট। পরিবর্তনগুলো অপারেটিং সিস্টেমে পৌঁছায় না। Windows-এ লুকানো `=C:`-ধরনের এন্ট্রি বাদ দেওয়া হয়। |
| `exit(code?)` | `code` দিয়ে, অথবা `process.exitCode` (ডিফল্ট 0) দিয়ে তৎক্ষণাৎ বন্ধ করে। |
| `exitCode` | প্রোগ্রাম স্বাভাবিকভাবে শেষ হলে এক্সিট স্ট্যাটাস হিসেবে ব্যবহৃত হয়। |
| `execPath` | চলমান এক্সিকিউটেবলের পরম পাথ। |
| `cwd()` | বর্তমান কার্যকরী ডিরেক্টরি। |
| `platform`, `arch`, `pid` | `'win32'` অথবা `'linux'`, `'x64'`, প্রসেস id। |

`process` প্রথম অ্যাক্সেসে অলসভাবে (lazily) তৈরি হয়, তাই যে প্রোগ্রাম এটি ব্যবহার করে না, স্টার্টআপে তাকে কোনো মূল্য দিতে হয় না। Node.js-এর বিপরীতে এটি EventEmitter নয় এবং এতে `stdout`/`stdin` স্ট্রিম, `nextTick`, `hrtime` বা `memoryUsage` নেই।

ইমপ্লিমেন্টেশন: প্রতিটি ইমেজে উভয় টার্গেটের হোস্ট ফাংশন থাকে, যাতে একটি তৈরি প্রোগ্রাম PE ও ELF দুভাবেই লিঙ্ক করা যায়; প্রতিটি লিঙ্কার অন্য টার্গেটের ইমপোর্টকে একটি স্টাবের সঙ্গে বাঁধে, যা 0 ফেরত দেয়। Windows `GetCommandLineW`, `GetEnvironmentStringsW`, `GetModuleFileNameW` ও `GetCurrentDirectoryW` পড়ে সেই FFI থাঙ্কের মাধ্যমে, যা কম্পাইলার তার নিজের প্রিলিউডের জন্য স্থাপন করে; Linux `/proc/self/cmdline`, `/proc/self/environ` ও `/proc/self/exe` পড়ে এবং `getcwd`/`exit_group` সরাসরি কল করে।
