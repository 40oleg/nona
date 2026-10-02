# Test262 বেসলাইন

::: info অনুবাদ
এই পৃষ্ঠাটি ইংরেজি পৃষ্ঠা [Test262 baseline](/reference/test262)-এর অনুবাদ, যা [`docs/test262.md`](https://github.com/40oleg/nona/blob/main/docs/test262.md) থেকে তৈরি। ইংরেজি সংস্করণটিই প্রামাণিক এবং সেটি আরও নতুন হতে পারে।
:::

রানারটি আপস্ট্রিম Test262-এর রিভিশন `7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd` ব্যবহার করে। Test262 ইচ্ছাকৃতভাবে এই রিপোজিটরিতে অন্তর্ভুক্ত (vendor) করা হয়নি। Windows x64-এ:

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/tc39/test262.git work/test262
git -C work/test262 sparse-checkout set harness test/language/expressions/coalesce test/language/expressions/arrow-function test/language/expressions/array test/language/expressions/call test/language/expressions/new test/language/expressions/template-literal test/language/rest-parameters test/language/statements/function test/language/statements/for-in test/language/statements/for-of test/built-ins/Symbol test/built-ins/Array/prototype/includes test/built-ins/Array/prototype/pop test/built-ins/Math/pow test/built-ins/Math/min test/built-ins/Math/max test/built-ins/Math/abs test/built-ins/Math/sign test/built-ins/Math/sqrt test/built-ins/Math/trunc test/built-ins/Math/floor test/built-ins/Math/ceil test/built-ins/Math/round test/built-ins/String/prototype/includes test/built-ins/Number/isFinite test/built-ins/Number/isInteger test/built-ins/Number/isNaN test/built-ins/Number/isSafeInteger
git -C work/test262 rev-parse HEAD
git -C work/test262 sparse-checkout add test/built-ins/Math/imul test/built-ins/Math/clz32
npm ci
npm run test262:smoke
node scripts/test262-smoke.mjs language/expressions/coalesce
```

একই রানার Linux x64-এও কাজ করে: তখন এটি PE ফাইলের বদলে `linux-x64` ELF ইমেজ কম্পাইল করে এবং Linux-এ worker thread-এর কারণে হতে পারে এমন ক্ষণস্থায়ী `ETXTBSY` exec রেস পুনরায় চেষ্টা করে। প্রতিটি কম্পাইল করা টেস্ট ইমেজ চলার পরে মুছে ফেলতে `TEST262_DELETE_BINARIES=1` সেট করুন; নইলে বড় ক্যাটালগ `work/test262-smoke`-এ কয়েক গিগাবাইট রেখে যায়।

চেকআউটটি পিন করা রিভিশনে থাকতে হবে। আপস্ট্রিম HEAD এগিয়ে গেলে চালানোর আগে ঠিক সেই কমিটটি fetch/checkout করুন। `TEST262_ROOT` একটি ভিন্ন চেকআউট বেছে নেয় এবং `TEST262_REPORT` JSON রিপোর্টের ভিন্ন পাথ। `TEST262_JOBS` সর্বোচ্চ আটটি worker thread সমান্তরালে চালায় (ডিফল্ট একটি) এবং রিপোর্টের ক্রম বজায় রাখে। উদাহরণস্বরূপ, বড় ক্যাটালগ রানের আগে `TEST262_JOBS=4` সেট করুন। `TEST262_PATH_FILTER` মিলে যাওয়া পাথ অন্তর্ভুক্ত করে; `TEST262_EXCLUDE_PATH_FILTER` মিলে যাওয়া পাথ বাদ দেয়। দুটোই আক্ষরিক সাবস্ট্রিং ফিল্টার। আর্গুমেন্ট ছাড়া কমান্ডটি `tests/test262-smoke.json`-এর পর্যালোচিত ম্যানিফেস্ট চালায়; একটি আপেক্ষিক ডিরেক্টরি আর্গুমেন্ট সেই Test262 গ্রুপের নিচের প্রতিটি `.js` ফাইল চালায়। রিপোর্টে কম্পাইল ব্যর্থতা, রানটাইম ব্যর্থতা ও বাদ পড়া (skip) আলাদা করে দেখানো হয়।

## পূর্ণ নিরীক্ষা

`scripts/test262-audit.ps1` (Windows) ও `scripts/test262-audit.sh` (Linux) `language/`, `annexB/` ও `built-ins/`-এর নিচের প্রতিটি Test262 ডিরেক্টরি `TEST262_EXCLUDE_FEATURES=post-es2020` দিয়ে চালায়, `work/test262-audit`-এ প্রতিটি ডিরেক্টরির জন্য একটি রিপোর্ট (থামার পরে আবার চালু করা যায়)। `-Dirs 'a,b' -Tag r1` (PowerShell) অথবা `TAG=r1 scripts/test262-audit.sh <out> a b` বাছাই করা ডিরেক্টরিগুলো একটি সাব-ডিরেক্টরিতে আবার চালায়, যার ফলাফল পূর্ণ রানের ফলাফলকে প্রতিস্থাপন করে। সারসংক্ষেপ ও শ্রেণিবিভাগ:

```
node scripts/test262-summary.mjs work/test262-audit --others work/others.txt
node scripts/test262-summary.mjs work/test262-audit --compare work/previous-audit
```

সারসংক্ষেপ প্রতিটি ব্যর্থতাকে `eval` (টেস্টটি eval ব্যবহার করে; কম্পাইল-টাইম eval সোর্সসহ এগুলো বেশিরভাগই রানটাইম সোর্স, `$262.evalScript` বা অন্য realm), `post` (পুরোনো বা অনুপস্থিত ফিচার ট্যাগের অধীনে ES2020-এর পরের সিমান্টিক্স) অথবা `other` হিসেবে শ্রেণিবদ্ধ করে, এবং `other` ফাইলগুলোর তালিকা দেয় (`--evals <file>` eval-এর ফাইলগুলোর তালিকা দেয়)। `TEST262_FILE_LIST=<file>` `scripts/test262-smoke.mjs <group>`-এর রানকে তালিকাভুক্ত পাথে সীমিত করে, যেমন এমন একটি তালিকা আবার চালাতে। git মেটাডেটা ছাড়া একটি চেকআউট (যেমন অন্য মেশিনে কপি করা) গ্রহণযোগ্য, যদি `work/test262/.nona-test262-revision`-এ পিন করা কমিট হ্যাশ থাকে; তখন line terminator টেস্টগুলো ফাইল সরাসরি পড়ে।

## পিন করা Test262-এ ES2020-এর চেয়ে নতুন সিমান্টিক্স {#semantics-newer-than-es2020-in-the-pinned-test262}

পিন করা Test262 (2026) কখনও কখনও post-ES2020 ফিচার ট্যাগ ছাড়াই ES2020-এর পরে আসা আচরণ যাচাই করে। নীতি (issue #17): যেখানে পরবর্তী সংস্করণ কেবল ES2020-এর এমন কোনো দৃশ্যমান অদ্ভুত আচরণ সরিয়েছে যার ওপর প্রোগ্রাম নির্ভর করে না, সেখানে Nona পিন করা Test262 অনুসরণ করে; বাকি সবকিছু ES2020-তেই থাকে এবং `scripts/test262-summary.mjs` সেগুলোকে `post` হিসেবে শ্রেণিবদ্ধ করে বা জানা বিচ্যুতি হিসেবে তালিকাভুক্ত করা হয়। Test262 অনুসরণ:

- TypedArray `[[Set]]`, `[[GetOwnProperty]]` ও `[[DefineOwnProperty]]` (ES2021/ES2022): মানটি প্রথমে রূপান্তরিত হয়; তারপর একটি অবৈধ ইনডেক্স বা detached বাফার লেখাটি উপেক্ষা করে এবং সাফল্য জানায়; detached বাফারের নিজস্ব কোনো উপাদান থাকে না; TypedArray ছাড়া অন্য Receiver হলে অবৈধ ইনডেক্সের কোনো প্রভাব নেই, আর বৈধ ইনডেক্স Receiver-এর ওপর OrdinarySet।
- `String.prototype.{replace,split,match,matchAll,search}` প্রিমিটিভ আর্গুমেন্টে Symbol-কী মেথড খোঁজে না (ES2025)।
- Annex B-র call-expression অ্যাসাইনমেন্ট টার্গেট sloppy কোডে রানটাইমে ReferenceError ছোড়ে এবং strict কোডে early error (ES2022 web reality)।

ES2020-তে রাখা হয়েছে (ব্যর্থতা `post` হিসেবে শ্রেণিবদ্ধ): class fields ও private methods, numeric separators, logical assignment, `Promise.any`/`AggregateError`, `Error.prototype.stack`/`cause`, RegExp-এর `v` ফ্ল্যাগ ও match indices, top-level await, এবং `postEs2020Features`-এর অন্যান্য ফিচার। বাকি জানা বিচ্যুতিগুলো প্রতিটি ক্যাটালগের জন্য `docs/pr5-es2020-remaining-work.md`-এ এবং রিলিজ অবস্থায় তালিকাভুক্ত।

ES2020 গেটের জন্য রানারে যোগ করা ফিচার (2026-09):

- `TEST262_TARGET=linux-x64` (Linux-এ ডিফল্ট) ELF ইমেজ লিঙ্ক করে; মডিউল টেস্ট (`flags: [module]`) একটি মডিউল গ্রাফ হিসেবে কম্পাইল হয়, যেখানে হার্নেস একটি ক্লাসিক স্ক্রিপ্ট প্রিলিউড; রিজলিউশন-নেগেটিভ মডিউল টেস্ট একটি কম্পাইল ত্রুটি প্রত্যাশা করে।
- `TEST262_EXCLUDE_FEATURES=post-es2020` ES2020-এর পরে আসা ফিচার ট্যাগের তালিকায় প্রসারিত হয় (স্ক্রিপ্টে `postEs2020Features` দেখুন), সঙ্গে `error-stack-accessor` ও অ-মানক `caller` এক্সটেনশন।
- টেস্টে উল্লেখ থাকলে `$262.createRealm` কম্পাইল করা হয় (সর্বোচ্চ তিনটি realm); `$262.agent` প্রোগ্রাম স্ট্যাটিক টেমপ্লেট থেকে বের করা হয় (লুপ কাউন্টার, টপ-লেভেল কনস্ট্যান্ট ও `$262.agent.timeouts` ফোল্ড করা হয়) এবং ইমেজে agent thread হিসেবে কম্পাইল হয়। `CanBlockIsFalse` টেস্টগুলো বাদ দেওয়া হয়, কারণ মূল agent ব্লক করতে পারে।
- Computed `import()` স্পেসিফায়ার টেস্টের সোর্সে নাম থাকা `_FIXTURE.js` ফাইলগুলো লোড করতে পারে (`ModuleHost.candidates`)।
- কম্পাইলারের এক্সেপশন রান থামানোর বদলে সেই ফাইলের ব্যর্থতা (`phase: compiler-crash`) হিসেবে রিপোর্ট হয়।

এটি একটি **বেসলাইন অ্যাডাপ্টার**, পূর্ণ Test262 হার্নেস নয়: raw ও রানটাইম-নেগেটিভ টেস্টগুলো বর্তমানে কারণসহ বাদ দেওয়া হয়। পার্স-নেগেটিভ টেস্ট পাস করে যখন Nona একটি কম্পাইলার ডায়াগনস্টিক দিয়ে সোর্স প্রত্যাখ্যান করে; অ্যাডাপ্টার এখনও ডায়াগনস্টিক টাইপের সমতুল্যতা যাচাই করে না। এটি পজিটিভ স্ক্রিপ্ট টেস্টগুলো মানক `sta.js`/`assert.js` হার্নেস ও ঘোষিত `includes` দিয়ে চালায়। মানানসইতার (conformance) দাবি করার আগে অ্যাডাপ্টারকে সব প্রযোজ্য মেটাডেটা মোড এবং strict/sloppy দুটো ভ্যারিয়েন্টই সমর্থন করতে হবে, তারপর সব প্রযোজ্য গ্রুপ চালাতে হবে। এই পর্যায়ে রিপোজিটরির সাধারণ নেটিভ টেস্টগুলোই প্রধান রিগ্রেশন গেট। `package.json`-এর চাহিদা অনুযায়ী টেস্ট ও oracle Node 26 দিয়ে চালান; Node 22 ফাংশন মেটাডেটায় দৃশ্যমানভাবে ভিন্ন এবং কোনো টেস্ট তার গ্লোবাল অবজেক্ট seal করলে ব্যর্থ হতে পারে।

2026-09-26-এর পজিটিভ রানটাইম স্মোক ম্যানিফেস্টে ডিফল্ট প্যারামিটার ও spread-এর ক্ষেত্র অন্তর্ভুক্ত; এর বর্তমান সংখ্যাগুলো ডেভেলপমেন্ট লগে লেখা আছে। পিন করা রিভিশনে বিস্তৃত raw গ্রুপগুলোতে `built-ins/Symbol`-এর জন্য 72 পাস / 26 ফেল, `language/statements/for-in`-এর জন্য 85 পাস / 34 ফেল, এবং `language/statements/for-of`-এর জন্য 142 পাস / 607 ফেল / 2 বাদ। এই গ্রুপগুলোতে বাস্তবায়িত সাবসেটের বাইরের ক্ষেত্র এবং ES2020-এর পরে যোগ হওয়া ক্ষেত্র আছে; raw সংখ্যাগুলো নির্ণয়ের জন্য, ES2020 মানানসইতার শতাংশ নয়। `built-ins/Array/prototype/includes`-এ 26 পাস / 4 ফেল / 0 বাদ; ব্যর্থ ক্ষেত্রগুলো Proxy বা resizable ArrayBuffer ব্যবহার করে। ES2020 Math কনস্ট্যান্ট যোগ করার পরে `built-ins/Math/pow`-এ 28 পাস / 0 ফেল / 0 বাদ। `built-ins/Math/min` ও `built-ins/Math/max`-এর প্রতিটিতে 10 পাস / 0 ফেল / 0 বাদ, যার মধ্যে প্রতিটি আর্গুমেন্টের রূপান্তর ও signed zero-র ক্রম অন্তর্ভুক্ত। `built-ins/String/prototype/includes`-এ 25 পাস / 2 ফেল / 0 বাদ; ব্যর্থ ক্ষেত্রগুলোতে RegExp লিটারাল আছে, যা এখনও সমর্থিত নয়। `built-ins/String/prototype/padStart` ও `padEnd`-এর প্রতিটিতে 13 পাস / 0 ফেল / 0 বাদ, রূপান্তরের ক্রম ও ডেসক্রিপ্টর যাচাইসহ। `built-ins/String/prototype/indexOf`-এ 44 পাস / 3 ফেল / 0 বাদ; বাকি ক্ষেত্রগুলো `eval` বা BigInt-এর ওপর নির্ভরশীল। `built-ins/String/prototype/lastIndexOf`-এ 25 পাস / 0 ফেল / 0 বাদ। `built-ins/String/fromCharCode`-এ 16 পাস / 1 ফেল / 0 বাদ; বাকি ক্ষেত্রটির BigInt লাগে। গ্লোবাল `isNaN` যোগ করার পরে `built-ins/Array/prototype/indexOf`-এ 193 পাস / 8 ফেল / 0 বাদ, এবং `lastIndexOf`-এ 189 পাস / 9 ফেল / 0 বাদ। বাকি ক্ষেত্রগুলো Date, RegExp, JSON, Proxy, resizable buffers/typed arrays বা `eval` ব্যবহার করে। গ্লোবাল `isFinite`-এ 15 পাস / 0 ফেল / 0 বাদ। গ্লোবাল `isNaN`-এ 14 পাস / 1 ফেল / 0 বাদ; বাকি ক্ষেত্রটি তার টেস্ট হার্নেসের বডিতে `Array.prototype.forEach` ব্যবহার করে। ES2020 Number কনস্ট্যান্ট যোগ করার পরে `built-ins/Array/prototype/pop`-এ 23 পাস / 0 ফেল / 0 বাদ। চারটি `Number.isFinite/isInteger/isNaN/isSafeInteger` গ্রুপ যথাক্রমে 8/9/7/10 পাস করে, কোনো ব্যর্থতা বা বাদ ছাড়া। ডিস্ট্রাকচারিং প্যারামিটার ও ক্লাস মেথডের পরে `language/rest-parameters`-এ 11 পাস / 0 ফেল / 0 বাদ। ডিফল্ট প্যারামিটার সমর্থনের পরে `language/expressions/arrow-function`-এ 147 পাস / 196 ফেল / 0 বাদ; সেই গ্রুপের সব 9টি `dflt-params` ক্ষেত্র পাস করে। অ্যারে ও অবজেক্ট লিটারাল spread-সহ `language/expressions/array`-এ 50 পাস / 2 ফেল / 0 বাদ। বাকি দুটি ক্ষেত্রের জেনারেটর লাগে। কল ও কনস্ট্রাকশন spread-সহ `language/expressions/call`-এ 72 পাস / 20 ফেল / 0 বাদ এবং `language/expressions/new`-এ 54 পাস / 5 ফেল / 0 বাদ। `spread-*` ক্ষেত্রগুলোর মধ্যে প্রতিটি গ্রুপে কেবল দুটি কম্পাইল হয় না, কারণ সেগুলোর জেনারেটর লাগে। গ্রুপগুলোর অন্যান্য ব্যর্থতা `eval`-সহ অসম্পর্কিত অসমর্থিত ফিচারের সঙ্গে যুক্ত। `Math.abs/sign/sqrt/trunc/floor/ceil/round` গ্রুপগুলো যথাক্রমে 8/5/10/12/11/11/11 টেস্ট পাস করে, কোনো ব্যর্থতা বা বাদ ছাড়া। `Math.imul` ও `Math.clz32` গ্রুপ যথাক্রমে 5/5 ও 10/10 পাস করে। অ্যারে ও অবজেক্ট বাইন্ডিং প্যাটার্নের পরে তিনটি ডিক্লারেশন গ্রুপ `language/statements/variable/dstr`, `let/dstr` ও `const/dstr` যথাক্রমে 79/97, 77/93 ও 77/93 ক্ষেত্র পাস করে। বাকি প্রতিটি ক্ষেত্র কম্পাইল হয় না, কারণ সেটি জেনারেটর বা ক্লাস ব্যবহার করে। এগুলো বাছাই করা Test262 গ্রুপ, ES2020 মানানসইতার শতাংশ নয়। `language/destructuring/binding/syntax`-এ 12 পাস / 2 ফেল; বাকি দুটি ক্ষেত্রেরই জেনারেটর ও async সিনট্যাক্স লাগে। `language/expressions/assignment/dstr`-এ 323 পাস / 45 কম্পাইল ব্যর্থতা / 0 রানটাইম ব্যর্থতা; সেই কম্পাইল ব্যর্থতাগুলোর জেনারেটর বা ক্লাস লাগে। বাছাই করা ক্লাস গ্রুপ `language/statements/class/method` ও `method-static`-এর প্রতিটি 20/20 পাস করে। `language/statements/class/definition`-এ 46 পাস / 17 কম্পাইল ব্যর্থতা / 2 বাদ; বাকি ক্ষেত্রগুলোর বর্তমান ক্লাস সাবসেটের বাইরের সিনট্যাক্স লাগে, যার মধ্যে জেনারেটর ও async মেথড আছে।

2026-09-25-এ `language/expressions/coalesce` গ্রুপ 21 পাস, 3 ফেল, 0 বাদ দিয়েছে। একটি ব্যর্থতার অনুপস্থিত `Symbol` টাইপ লাগে; দুটি strict কোডে proper tail calls পরীক্ষা করে এবং নেটিভ স্ট্যাক ওভারফ্লো করে। চারটি পার্স-নেগেটিভ ক্ষেত্র কম্পাইলারের প্রত্যাখ্যানের মাধ্যমে পাস করেছে। এগুলো ট্র্যাক করা অনুপস্থিত সক্ষমতা, `??` নিজে সাধারণভাবে ভাঙা — এর প্রমাণ নয়।

2026-09-26-এ পিন করা সম্পূর্ণ `built-ins/parseInt` ও `built-ins/parseFloat` গ্রুপ 55/55 ও 54/54 পাস করেছে। প্রথম পূর্ণ `built-ins/Array` রানে 3082-এর মধ্যে 2632 পাস, 360 ফেল, 90 বাদ ছিল; সব 90টি বাদ হলো `Array.fromAsync` টেস্ট (ES2020-এর পরের একটি API); এটি একটি iterator completion বাগ এবং পাঁচটি sparse-array টাইমআউট উন্মোচন করেছিল, যা পরে ঠিক করা হয়েছে। পুনরাবৃত্ত পূর্ণ Array রানে 2640 পাস, 352 ফেল, 90 বাদ। বাকি প্রতিটি ব্যর্থতার একটি লিপিবদ্ধ পূর্বশর্ত আছে [v0.4-এর স্থগিত তালিকায়](https://github.com/40oleg/nona/blob/main/docs/v0.4-array-deferred.json): ES2020-এর পরের API-র 150টি ক্ষেত্র, resizable-buffer-এর 72টি ক্ষেত্র, এবং অন্যান্য ভবিষ্যৎ নির্ভরতা বা নথিভুক্ত `eval` ব্যতিক্রমের 130টি ক্ষেত্র। পজিটিভ ম্যানিফেস্ট 100/100 পাস করে।

v0.4.0-এর পরে সম্পূর্ণ `built-ins/String/fromCodePoint` গ্রুপ 11/11 পাস করে। একটি ক্ষেত্র পিন করা স্মোক ম্যানিফেস্টে রাখা হয়েছে; সেই চেকপয়েন্টে ম্যানিফেস্ট 101/101 পাস করেছিল।

সম্পূর্ণ `built-ins/String/raw` গ্রুপ 30/30 পাস করে। এর tagged-template ক্ষেত্রটি পিন করা পজিটিভ স্মোক ম্যানিফেস্টে অন্তর্ভুক্ত। হালনাগাদ ম্যানিফেস্ট 102/102 পাস করে; Windows ও Linux-এর সামঞ্জস্যপূর্ণ উদাহরণ প্রতিটি 54/54 পাস করে।

সম্পূর্ণ `built-ins/String/prototype/concat` গ্রুপ 22/22 পাস করে। একটি ক্ষেত্র পজিটিভ স্মোক ম্যানিফেস্টে অন্তর্ভুক্ত। হালনাগাদ ম্যানিফেস্ট 103/103 পাস করে; Windows ও Linux-এর সামঞ্জস্যপূর্ণ উদাহরণ প্রতিটি 55/55 পাস করে।

`built-ins/String/prototype/toUpperCase` গ্রুপে 24 পাস / 2 ফেল / 0 বাদ। দুটি ব্যর্থতারই `RegExp` ও direct `eval` লাগে, যা দুটোই v0.5-এর বাইরে ট্র্যাক করা হয়। Unicode special-casing ক্ষেত্রটি পজিটিভ স্মোক ম্যানিফেস্টে আছে, যা এখন 104/104। Windows ও Linux-এর সামঞ্জস্যপূর্ণ উদাহরণ প্রতিটি 56/56 পাস করে।

`built-ins/String/prototype/toLowerCase` গ্রুপে 28 পাস / 2 ফেল / 0 বাদ। এর দুটি ব্যর্থতারও `RegExp` ও direct `eval` লাগে। `Case_Ignorable` অক্ষরসহ Final Sigma-র শর্তসাপেক্ষ ম্যাপিং পাস করে। পজিটিভ স্মোক ম্যানিফেস্ট 105/105; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 57/57।

সম্পূর্ণ `built-ins/Number/prototype/toFixed` গ্রুপে 15 পাস / 1 ফেল / 0 বাদ। ব্যর্থ ক্ষেত্রটি BigInt ব্যবহার করে, যা v0.8-এর জন্য নির্ধারিত। নির্ভুলতার ক্ষেত্রটি পজিটিভ স্মোক ম্যানিফেস্টে আছে, যা এখন 106/106; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 58/58 পাস করে।

সম্পূর্ণ `built-ins/Number/prototype/toExponential` ও `built-ins/Number/prototype/toPrecision` গ্রুপ 15/15 ও 17/17 পাস করে। এদের সাধারণ-মানের ক্ষেত্রগুলো পজিটিভ স্মোক ম্যানিফেস্টে আছে, যা এখন 108/108। সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 59/59 পাস করে।

ত্রিকোণমিতিক ফাংশন যোগ করার আগের প্রথম পূর্ণ `built-ins/Math` রানে 327-এর মধ্যে 176 পাস / 151 ফেল ছিল। বেশিরভাগ ব্যর্থতা অনুপস্থিত ES2020 transcendental ফাংশন; `f16round` ও `sumPrecise` পরবর্তী API। সম্পূর্ণ `Math.sin`, `Math.cos` ও `Math.tan` গ্রুপ এখন 8/8, 9/9 ও 9/9 পাস করে। পজিটিভ স্মোক 111/111; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 60/60 পাস করে।

সম্পূর্ণ `Math.log`, `Math.log2` ও `Math.log10` গ্রুপ 9/9, 5/5 ও 5/5 পাস করে। পজিটিভ স্মোক 114/114; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 61/61 পাস করে।

সম্পূর্ণ `Math.exp` ও `Math.expm1` গ্রুপ 9/9 ও 5/5 পাস করে। পজিটিভ স্মোক 116/116; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 62/62 পাস করে।

সম্পূর্ণ `Math.atan` ও `Math.atan2` গ্রুপ 7/7 ও 11/11 পাস করে। পজিটিভ স্মোক 118/118; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 63/63 পাস করে।

সম্পূর্ণ `Math.log1p` গ্রুপ 5/5 পাস করে। পজিটিভ স্মোক 119/119; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 64/64 পাস করে।

সম্পূর্ণ `Math.cbrt` গ্রুপ 5/5 পাস করে। পজিটিভ স্মোক 120/120; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 65/65 পাস করে।

সম্পূর্ণ `Math.asin` ও `Math.acos` গ্রুপ 9/9 ও 8/8 পাস করে। পজিটিভ স্মোক 122/122; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 66/66 পাস করে।

সম্পূর্ণ `encodeURI` ও `encodeURIComponent` গ্রুপ প্রতিটি 31/31 পাস করে। পজিটিভ স্মোক 124/124; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 67/67 পাস করে।

সম্পূর্ণ `decodeURI` ও `decodeURIComponent` গ্রুপ 55/55 ও 56/56 পাস করে। পজিটিভ স্মোক 126/126; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 68/68 পাস করে।

সম্পূর্ণ `Math.atanh` গ্রুপ 5/5 পাস করে। পজিটিভ স্মোক 127/127; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 69/69 পাস করে। URI-র কাজের পরে পূর্ণ নেটিভ টেস্ট রানে 1632 পাস, 27 বাদ এবং শূন্য ব্যর্থতা ছিল।

সম্পূর্ণ `Math.asinh` ও `Math.acosh` গ্রুপ 5/5 ও 7/7 পাস করে। পজিটিভ স্মোক 129/129; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 70/70 পাস করে।

সম্পূর্ণ `Math.sinh`, `Math.cosh` ও `Math.tanh` গ্রুপ প্রতিটি 5/5 পাস করে। পজিটিভ স্মোক 132/132; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 71/71 পাস করে।

একটি পূর্ণ `built-ins/Math` রানে এখন 327-এর মধ্যে 312 পাস ও 15 ফেল। সব 15টি ব্যর্থতা `Math.f16round` ও `Math.sumPrecise` সংক্রান্ত, যা ES2020-এর পরের। এটি যেকোনো সসীম (finite) ইনপুটের জন্য transcendental নির্ভুলতা পরিমাপ করে না। `sin`, `cos` ও `tan`-এর জন্য বড় কোণের রিডাকশন এই রানের পরে যোগ করা হয়েছে এবং binary exponent জুড়ে Node.js 26-এর সঙ্গে যাচাই করা হয়েছে।

`String.prototype.toLocaleLowerCase` ও `toLocaleUpperCase` 26/28 ও 24/26 পাস করে। বাকি চারটি টেস্টের RegExp বা eval লাগে। পজিটিভ স্মোক 134/134; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 72/72 পাস করে। ডিফল্ট Unicode ম্যাপিংয়ের বাইরে লোকেল-নির্দিষ্ট ম্যাপিং এখনও মূল্যায়ন করা বাকি।

`String.prototype.split` 120টির মধ্যে 86টি Test262 ক্ষেত্র পাস করে। বাকি 34টির RegExp, BigInt বা eval লাগে। কেবল-স্ট্রিং সেপারেটর, limit, প্রিমিটিভ সেপারেটর এবং কাস্টম `Symbol.split` hook যাচাই করা হয়েছে। পজিটিভ স্মোক 137/137; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 73/73 পাস করে।

বড় কোণের `Math.sin`, `Math.cos` ও `Math.tan` এখন `2/pi`-এর একটি 1152-বিট fixed-point টেবিল ব্যবহার করে। নেটিভ টেস্ট 48/48 পাস করে, যার মধ্যে exponent 63–1022 জুড়ে 80টি নির্ধারিত সসীম মান আছে। সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 74/74 পাস করে।

`String.prototype.replace` 55টির মধ্যে 24টি Test262 ক্ষেত্র পাস করে। বাকি 31টির RegExp, BigInt বা ডায়নামিক ফাংশন নির্মাণ লাগে। স্ট্রিং অনুসন্ধান, ফাংশনাল প্রতিস্থাপন, প্রতিস্থাপন প্যাটার্ন এবং কাস্টম `Symbol.replace` কভার করা হয়েছে। পজিটিভ স্মোক 140/140; সামঞ্জস্যপূর্ণ উদাহরণ Windows ও Linux-এ 75/75 পাস করে।
