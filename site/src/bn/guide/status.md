# অবস্থা ও রোডম্যাপ

## বর্তমান রিলিজ

**v0.15.0** — দেখুন [চেঞ্জলগ](/changelog) (ইংরেজিতে)। Nona পরীক্ষামূলক: এর কোনো নিরাপত্তা নিরীক্ষা হয়নি এবং এটি Node.js-এর সরাসরি বিকল্প নয়।

## Test262 নিরীক্ষা

পিন করা Test262-এর সর্বশেষ পূর্ণ নিরীক্ষা, Windows x64-এ v0.8.0-এর জন্য (`scripts/test262-audit.ps1 -Unit`, ES2020 ও তার আগের ফিচার, সঙ্গে সমর্থিত পরবর্তী ফিচার, যেমন ES2022 ক্লাস এলিমেন্ট):

| ডিরেক্টরি                    | পাস / প্রযোজ্য               | বাকি ব্যর্থতা                               |
| ---------------------------- | ---------------------------- | ------------------------------------------- |
| `language/`                  | **22436 / 22492** (26টি বাদ) | 44 `eval`, 1 নতুন সিমান্টিক্স, 11 অন্যান্য  |
| `built-ins/`                 | **15868 / 15933**            | 16 `eval`, 12 নতুন সিমান্টিক্স, 37 অন্যান্য |
| `built-ins/Atomics` (agents) | **268 / 268**                | —                                           |
| `annexB/`                    | **996 / 1016** (8টি বাদ)     | 20 `eval`                                   |

শ্রেণিবিভাগটি আসে `scripts/test262-summary.mjs` থেকে: «`eval`» টেস্টগুলো এমন সোর্স টেক্সট দিয়ে `eval` বা `$262.evalScript` কল করে, যা Nona কম্পাইলের সময় জানতে পারে না; «নতুন সিমান্টিক্স» টেস্টগুলো পুরোনো বা অনুপস্থিত ফিচার ট্যাগের অধীনে পরবর্তী সংস্করণের আচরণ (`v` ফ্ল্যাগ, numeric separators, `Promise.any`, …) যাচাই করে। ইউনিট স্যুট CI-তে Windows ও Linux-এ চলে এবং আসল PE ও ELF ফাইল কম্পাইল করে চালায়, যার অনেকগুলো GC স্ট্রেসের অধীনে। নিরীক্ষা কীভাবে চালাতে হয় তা [Test262](/bn/reference/test262) পৃষ্ঠায় বর্ণিত।

## অ্যারে কপি-ভিত্তিক পদ্ধতি

অডিটের পরে পিন করা Test262 সংস্করণে যাচাই (Windows x64, [#308](https://github.com/40oleg/nona/issues/308)): `built-ins/Array/prototype/{toSorted,toReversed,toSpliced,with}` ও `Symbol.unscopables` ৯৪/৯৪ পাস করে, কোনো অবশিষ্ট ব্যর্থতা নেই। `%TypedArray%` সংস্করণ প্রয়োগ করা হয়নি; দেখুন [Test262 বেসলাইন](https://github.com/40oleg/nona/blob/main/docs/test262.md) (ইংরেজিতে)।

## বাকি ব্যর্থতা

এগুলো v0.8.0 নিরীক্ষার ব্যর্থতা; পরবর্তী রিলিজগুলোতে পূর্ণ রান আর পুনরাবৃত্তি করা হয়নি। Windows-এ সব «অন্যান্য» ব্যর্থতা শ্রেণিবদ্ধ করা হয়েছে:

- `built-ins/Function` (26): ফাংশনের সোর্স রানটাইমে অবজেক্টের `toString` থেকে আসে — `eval` ব্যতিক্রম।
- `AsyncFunction`, `AsyncGeneratorFunction` ও `GeneratorFunction`-এর জন্য `is-a-constructor` (4): Test262 হার্নেস রানটাইমে সোর্স টেক্সট তৈরি করে।
- অন্য realm (8): অন্য realm থেকে ডিফল্ট প্রোটোটাইপ ([#7](https://github.com/40oleg/nona/issues/7), নিরীক্ষার পরে বন্ধ হয়েছে)।
- `Function`-এর মাধ্যমে তৈরি ক্লাস, অন্য realm-এও (10, `language/expressions/class`): রানটাইমে তৈরি সোর্স টেক্সট। একই টেস্ট `eval` উপনামের মাধ্যমে চালালে সেগুলো `eval` ব্যর্থতা হিসেবে গণ্য হয়।

v0.8.0 নিরীক্ষায় সাতটি ক্র্যাশও পাওয়া গিয়েছিল (`Math`-এ উপাদানসহ `Array.prototype.indexOf`, typed array-এর উত্তরাধিকারসূত্রে পাওয়া ও নিজস্ব কী), যা dense elements-এর সঙ্গে এসেছিল; সেগুলো [#119](https://github.com/40oleg/nona/issues/119)-এ ঠিক করা হয়েছে, এবং সংশোধনের পরে `built-ins/Array` ও `built-ins/TypedArrayConstructors` পুনরায় চালালে (উপরে অন্তর্ভুক্ত) সেগুলো পাস করে।

## চলমান কাজ

ভাষা ও লাইব্রেরির ঘাটতি:

- [#11](https://github.com/40oleg/nona/issues/11) — রানটাইমে গণনা করা সোর্সসহ `eval` ও `Function`।
- [#44](https://github.com/40oleg/nona/issues/44) — Promise reaction: আলাদা promise ধরন এবং প্রতিটি `then`-এর জন্য একটি রেকর্ড।

পারফরম্যান্স, [রোডম্যাপের](https://github.com/40oleg/nona/blob/main/docs/roadmap.md) মূল ধারা:

- কল ও মেমরি বরাদ্দ: [#47](https://github.com/40oleg/nona/issues/47) (কল ওভারহেড), [#48](https://github.com/40oleg/nona/issues/48) (স্বল্পায়ু অবজেক্ট), [#235](https://github.com/40oleg/nona/issues/235) (ইনলাইনিং), [#236](https://github.com/40oleg/nona/issues/236) (scalar replacement)।
- তৈরি কোড: [#237](https://github.com/40oleg/nona/issues/237)–[#242](https://github.com/40oleg/nona/issues/242) (অপশনাল চেইনিং, `%`, সরাসরি কল, typed array লুপ, `switch` jump table, dead-zone যাচাই)।
- লাইব্রেরি: [#155](https://github.com/40oleg/nona/issues/155) (`JSON.stringify`), [#258](https://github.com/40oleg/nona/issues/258) (RegExp শুরুর স্ক্যান), [#262](https://github.com/40oleg/nona/issues/262) (বড় অ্যারেতে `shift` ও `splice`)।

পূর্ণ তালিকা আছে [GitHub-এ](https://github.com/40oleg/nona/issues)।

## বিস্তারিত রিপোর্ট

- [0.17–0.20-এর ES2020 অবস্থা](https://github.com/40oleg/nona/blob/main/docs/status.md) (রুশ ভাষায়)
- [রিলিজ ইতিহাস](/changelog) এবং [ডেভেলপমেন্ট লগ](https://github.com/40oleg/nona/blob/main/docs/history/development-log.md) (রুশ ভাষায়)
- [রোডম্যাপ: V8-অনুপ্রাণিত পরিকল্পনা ও লক্ষ্য আর্কিটেকচার (ইংরেজিতে)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [রিলিজ রোডম্যাপ 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/history/release-roadmap-0.4-0.20.md) (রুশ ভাষায়)
