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

| ক্ষেত্র                                  | Nona                                                                                                                                                | Node.js                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `process.argv`                           | `[execPath, ...arguments]`: `argv[1]` হলো প্রথম আর্গুমেন্ট                                                                                          | `[node, script, ...arguments]`                                                 |
| `process`                                | Common metadata, environment mutation, clocks/ticks, standard I/O, lifecycle/warnings, CPU/resources and native process control (all eight targets) | Signal handlers, IPC, V8 heap reports, full async streams and terminal control |
| টাইমার id                                | Number                                                                                                                                              | `Timeout` অবজেক্ট                                                              |
| `readFileSync(path)`                     | `Uint8Array` ফেরত দেয়                                                                                                                              | `Buffer` ফেরত দেয়                                                             |
| এনকোডিং                                  | কেবল `utf8` (fs); UTF-8, UTF-16LE, Latin-1, ASCII, hex, base64/base64url (Buffer)                                                                   | অনেক                                                                           |
| Windows-এ ত্রুটির বার্তা                 | যেভাবে দেওয়া হয়েছে সেভাবেই পাথ থাকে                                                                                                               | পরম (absolute) পাথ থাকে                                                        |
| মডিউল                                    | `nona:*`, [বিল্ট-ইন মডিউল](/bn/reference/modules)-এ তালিকাভুক্ত `node:*` মডিউল, এবং বিল্ডের সময় রিজলভ হওয়া ফাইল ও npm প্যাকেজ                     | `node:*`-এর সবকিছু এবং npm প্যাকেজ, রানটাইমে রিজলভ হয়                         |
| `require`                                | CommonJS মডিউল, বিল্ডের সময় জানা লিটারাল স্পেসিফায়ার সহ ([npm প্যাকেজ](/reference/npm))                                                           | রানটাইমে যেকোনো স্পেসিফায়ার                                                   |
| স্ট্যান্ডার্ড আউটপুট ছাড়া `console.log` | আউটপুট বাদ দেওয়া হয়                                                                                                                               | আউটপুট বাদ দেওয়া হয় বা ত্রুটি ওঠে                                            |

## পারফরম্যান্স

- অ্যারে, অবজেক্ট ও `Map`/`Set` shape ও ইনলাইন ক্যাশসহ dense ও hashed স্টোরেজ ব্যবহার করে, কিন্তু কল, ক্লোজার ও মেমরি বরাদ্দ এখনও V8-এর চেয়ে কয়েক গুণ ধীর; ধীর জায়গাগুলো [পারফরম্যান্স](/bn/guide/performance) পৃষ্ঠায় আছে।
- RegExp ইঞ্জিনটি JavaScript-এ লেখা একটি ব্যাকট্র্যাকিং VM। ব্যাকরেফারেন্স ও লুকঅ্যারাউন্ড ছাড়া কোনো প্যাটার্ন অতিরিক্ত ব্যাকট্র্যাক করলে (`u` ফ্ল্যাগ ছাড়া) একটি লিনিয়ার-টাইম ইঞ্জিন তা শেষ করে।
- Windows-এ টাইমার সিস্টেম টিকে জাগে (সাধারণত 15.6 ms)।
- কোনো JIT নেই: কোড একবার, আগেভাগে, profile-guided অপ্টিমাইজেশন ছাড়া কম্পাইল হয়।

## লিঙ্ক করা রানটাইম অংশ

প্রতিটি এক্সিকিউটেবলে রানটাইম থাকে, কিন্তু এর বড় ঐচ্ছিক অংশগুলো কেবল তখনই লিঙ্ক হয় যখন প্রোগ্রাম সেগুলোর কাছে পৌঁছাতে পারে। কম্পাইলার কম্পাইল করা প্রতিটি সোর্সের টেক্সট দেখে সিদ্ধান্ত নেয় — প্রোগ্রাম, তার মডিউল এবং কম্পাইল-টাইম `eval`/`Function` সোর্স:

| অংশ                                             | আকার          | সোর্সে যা থাকলে লিঙ্ক হয়                                                                                                                       |
| ----------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| RegExp ইঞ্জিন                                   | প্রায় 1 MB   | একটি RegExp লিটারাল, অথবা `RegExp`, `match`, `matchAll` বা `search` নাম (আইডেন্টিফায়ার, প্রপার্টির নাম, বা স্ট্রিং ও টেমপ্লেট লিটারালের ভেতরে) |
| `\p{…}`/`\P{…}`-এর জন্য Unicode প্রপার্টি টেবিল | প্রায় 2 MB   | একটি RegExp লিটারাল বা স্ট্রিংয়ে `\p{` বা `\P{`, অথবা উপরের নামগুলোর একটি (প্যাটার্ন রানটাইমে তৈরি হতে পারে)                                   |
| Unicode নরমালাইজেশন টেবিল                       | প্রায় 0.7 MB | `normalize` বা `localeCompare` নাম                                                                                                              |

স্ট্রিং আর্গুমেন্টসহ `split`, `replace` ও `replaceAll`-এর জন্য RegExp ইঞ্জিন লাগে না।

JavaScript-এ লেখা বিল্ট-ইন লাইব্রেরি, যারা কেবল গ্লোবাল বা মেথড ইনস্টল করে (মোট প্রায় 0.7 MB), সোর্সে তাদের কোনো নাম থাকলে একইভাবে লিঙ্ক হয়:

| অংশ                                                                                                                                                 | নাম                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Proxy`                                                                                                                                             | `Proxy`                                                                                                                                       |
| `TextEncoder`, `TextDecoder`                                                                                                                        | `TextEncoder`, `TextDecoder` (`process`-এর সঙ্গেও লিঙ্ক হয়)                                                                                  |
| `process`                                                                                                                                           | `process`                                                                                                                                     |
| টাইমার, ইভেন্ট লুপ, `queueMicrotask` ও `performance`                                                                                                | `setTimeout`, `setInterval`, `setImmediate`, `clearTimeout`, `clearInterval`, `clearImmediate`, `queueMicrotask`, `performance`, `globalThis` |
| `.at()`, `findLast`, `findLastIndex`, `Object.hasOwn`, `AggregateError`, `Promise.any`, `toSorted`, `toReversed`, `toSpliced`, `with`               | `at`, `findLast`, `findLastIndex`, `hasOwn`, `AggregateError`, `any`, `unscopables`                                                           |
| Annex B `escape`, `unescape`, `substr`, `setYear`, `toGMTString`, `RegExp.prototype.compile` এবং স্ট্রিংয়ের HTML মেথড (`anchor`, `big`, `link`, …) | একই নামগুলো                                                                                                                                   |
| স্থিতিশীল merge `Array.prototype.sort`                                                                                                              | `sort`                                                                                                                                        |
| Proxy ট্র্যাপের মাধ্যমে `Object.freeze`, `seal`, `isFrozen`, `isSealed` (সাধারণ অবজেক্টের জন্য নেটিভ সংস্করণ)                                       | একই নামগুলো                                                                                                                                   |
| `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`                                                                      | একই নামগুলো                                                                                                                                   |
| `ArrayBuffer`, `SharedArrayBuffer`, `DataView` ও typed array-এর বাইনারি ডেটা মেথড (`slice`, `subarray`, `sort`, …)                                  | তাদের কনস্ট্রাক্টরের নাম, `Atomics`, `TypedArray` (`process`, `Buffer` ও `TextEncoder`-এর সঙ্গেও লিঙ্ক হয়)                                   |
| RegExp ও String প্রোটোকল মেথড (`Symbol.replace`, `String.prototype.match`, `matchAll`, `search`, `replaceAll`, …)                                   | RegExp ইঞ্জিনের সঙ্গে, অথবা `replaceAll`                                                                                                      |

যে প্রোগ্রাম `Object.getOwnPropertyNames`, `Object.getOwnPropertyDescriptors` বা `Reflect.ownKeys` কল করে, সে এগুলোর সবই লিঙ্ক করে, কারণ সে বিল্ট-ইনগুলোর তালিকা পেতে পারে ([#84](https://github.com/40oleg/nona/issues/84))। একটি hello world প্রায় 1.1 MB; সব অংশসহ এটি 7 MB।

শুধু কিছু সিনট্যাক্সের দরকারি হেল্পার নাম দেখে নয়, কম্পাইল করা প্রোগ্রাম সেগুলো কল করলে লিঙ্ক হয়: `with` স্টেটমেন্ট, লিটারাল `eval`, ক্লাস ফিল্ড ও প্রাইভেট নাম, এবং `import()` ও `import.meta` সহ ES মডিউল ([#278](https://github.com/40oleg/nona/issues/278))।

রানটাইমে গণনা করা নামের মাধ্যমে, যেমন `globalThis['Reg' + 'Exp']`, প্রোগ্রাম তবুও বাদ পড়া অংশে পৌঁছাতে পারে। RegExp ইঞ্জিন ও Unicode টেবিলের ক্ষেত্রে এমন কল একটি `Error` ছোড়ে, যার বার্তায় অনুপস্থিত অংশের নাম থাকে; বাদ পড়া গ্লোবাল বা মেথড কেবল অনুপস্থিত থাকে। সবকিছু লিঙ্ক করতে `--full-runtime` (অথবা [`compile()`](/bn/reference/api)-এর `fullRuntime` অপশন) দিয়ে কম্পাইল করুন ([#62](https://github.com/40oleg/nona/issues/62))। `--link অংশ,...` দিয়ে আলাদা অংশ যোগ করা যায়, আর `--print-link` দেখায় কী লিঙ্ক হয়েছে এবং কোন নাম প্রতিটি অংশ বেছে নিয়েছে ([#182](https://github.com/40oleg/nona/issues/182))।

## Realm

Test262-এর জন্য `$262.createRealm` সমর্থিত। অন্য realm-এর `Function`, `eval` বা ডায়নামিক ফাংশন কনস্ট্রাক্টর দিয়ে লিটারাল সোর্স থেকে তৈরি ফাংশন, ক্লাস ও eval কোড সেই realm-এই চলে, আর ডিফল্ট প্রোটোটাইপ ও কনস্ট্রাক্টরের ত্রুটি ECMA-262 যে realm নির্ধারণ করে সেখান থেকেই আসে ([#7](https://github.com/40oleg/nona/issues/7), [#176](https://github.com/40oleg/nona/issues/176))।

## প্ল্যাটফর্ম

- `process` ও `node:fs` আটটি টার্গেটেই উপলব্ধ; HTTP ও TCP (`node:http`, `node:net`) Windows ও Linux-এ।
- Windows এক্সিকিউটেবল OS DLL (প্যারেন্ট প্রসেসের মেটাডেটার জন্য NTDLL সহ) এবং ঘোষিত FFI ইমপোর্ট ব্যবহার করে; POSIX এক্সিকিউটেবল নেটিভ OS সেবা ব্যবহার করে।
- DLL-এ FFI কল Windows-এ দরকার; সরাসরি সিস্টেম কল নির্বাচিত Linux, Darwin বা BSD টার্গেটের কার্নেল নম্বর ব্যবহার করে। বিস্তারিত: [নেটিভ প্ল্যাটফর্ম](/reference/native-platforms)।

## Buffer

গ্লোবাল `Buffer`, `Blob` ও `File`, এবং `node:buffer` / `buffer` / `nona:buffer` ইমপোর্ট প্রতিটি নেটিভ টার্গেটে উপলব্ধ। Buffer স্ট্যান্ডার্ড বাইট এনকোডিং, শেয়ার্ড স্লাইস, কপি, অনুসন্ধান ও সংখ্যাভিত্তিক অ্যাক্সেস সমর্থন করে। Blob/File অপরিবর্তনীয় ডেটা ও মেটাডেটা সমর্থন করে। Blob বাইট/টেক্সট স্ট্রিম এবং অবজেক্ট URL নিবন্ধন/রিজলভ করা উপলব্ধ; দেখুন [API চুক্তি ও সীমাবদ্ধতা](/bn/reference/host-apis#buffer-and-binary-data)।
