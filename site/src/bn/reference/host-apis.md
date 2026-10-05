# হোস্ট API

::: info অনুবাদ
এই পৃষ্ঠাটি ইংরেজি পৃষ্ঠা [Host APIs](/reference/host-apis)-এর অনুবাদ, যা [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md) থেকে তৈরি। ইংরেজি সংস্করণটিই প্রামাণিক এবং সেটি আরও নতুন হতে পারে।
:::

Nona প্রোগ্রাম Node.js ছাড়াই চলে। নিচের হোস্ট API-গুলো বাস্তবায়ন করে নেটিভ রানটাইম এবং ছোট JavaScript প্রিলিউড, যা প্রতিটি এক্সিকিউটেবলে কম্পাইল হয়।

## টাইমার ও ইভেন্ট লুপ

গ্লোবাল: `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask(callback)` ও `performance.now()`।

- টপ-লেভেল প্রোগ্রামের পরে এন্ট্রি একটি ইভেন্ট লুপ চালায়: এটি Promise জব কিউ খালি করে, তারপর বারবার নিকটতম টাইমারের সময়সীমার জন্য অপেক্ষা করে, সেই কলব্যাক চালায় এবং আবার জব কিউ খালি করে। কোনো টাইমার বাকি না থাকলে প্রসেস বের হয়ে যায়।
- টাইমারগুলো সময়সীমা অনুযায়ী, তারপর নিবন্ধনের ক্রম অনুযায়ী সাজানো হয়। বিলম্ব (delay) Node.js অনুসরণ করে: এটি `ToNumber` দিয়ে রূপান্তরিত হয়, এবং যে মান `NaN`, 1-এর কম বা 2^31-1-এর বেশি, সেগুলো 1 হয়ে যায়।
- টাইমার id হলো Number (Node.js `Timeout` অবজেক্ট ফেরত দেয়)। `clearTimeout` ও `clearInterval` যেকোনো id গ্রহণ করে; অজানা id উপেক্ষা করা হয়।
- অপেক্ষা Windows-এ `Sleep` এবং Linux-এ `nanosleep` ব্যবহার করে, তাই নিষ্ক্রিয় প্রোগ্রাম CPU ব্যবহার করে না। Windows-এ রেজোলিউশন হলো সিস্টেম টাইমার টিক (সাধারণত 15.6 ms)।
- `performance.now()` মনোটোনিক ঘড়ি (`QueryPerformanceCounter`, `clock_gettime(CLOCK_MONOTONIC)`) ব্যবহার করে এবং প্রোগ্রাম শুরু থেকে মিলিসেকেন্ড গোনে।
- টাইমার কলব্যাকে না-ধরা এক্সেপশন প্রসেসকে এক্সিট কোড 1 দিয়ে বন্ধ করে, ঠিক টপ-লেভেল প্রোগ্রামে না-ধরা এক্সেপশনের মতো।
- Test262 হোস্টের তৈরি realm নিজস্ব টাইমার স্থাপন করে না।

## দীর্ঘ সময় চলা প্রোগ্রাম

- কালেক্টর কমিট করা coroutine স্ট্যাক (প্রতিটি চলমান async ফাংশন বা জেনারেটরের জন্য 1 MiB, `rt.generatorStackBytes`) তার থ্রেশহোল্ডে গণনা করে, তাই পরিত্যক্ত coroutine, যাদের স্ট্যাক কেবল sweep-ই মুক্ত করে, সাধারণ আবর্জনার মতোই কালেকশন চালু করে।
- `tests/stability.test.ts` যাচাই করে যে দশ গুণ বেশি টাইমার ফায়ারিং (প্রতিটি টিকে promise জব ও আবর্জনাসহ) সর্বোচ্চ মেমরি বাড়ায় না, হাজার হাজার পরিত্যক্ত coroutine মুক্ত হয়, এবং দুই সেকেন্ডের টাইমারের জন্য অপেক্ষারত প্রোগ্রাম প্রায় কোনো CPU ব্যবহার করে না।
- জানা সীমাবদ্ধতা: প্রপার্টি, এলিমেন্ট ও Map স্টোরেজ রৈখিক (#36), তাই শত শত জীবিত টাইমার বা বড় অবজেক্টসহ প্রোগ্রাম ধীর হয়ে যায়; Linux-এ প্রতিটি হিপ ব্লক একটি আলাদা মেমরি ম্যাপিং (#37)।


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.

## Events

`node:events`, `events` and `nona:events` share one built-in module. The default
export is `EventEmitter`; listener ordering, once/prepend listeners, removal,
introspection, meta events, error monitoring and rejection capture are supported.
Promise `once` and async-iterator `on` include cleanup, close events, externally
supplied abort signals and emitter watermarks. Listener/max-listener helpers and
disposable `addAbortListener` subscriptions are also available.

Nona does not supply EventTarget, AbortController, async hooks or process warning
reporting. See the [English events reference](/reference/host-apis#events) for the
complete supported API and limitations.
