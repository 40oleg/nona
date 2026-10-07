# অবস্থা ও রোডম্যাপ

## বর্তমান রিলিজ

**v0.10.0** — দেখুন [চেঞ্জলগ](/changelog) (ইংরেজিতে)। Nona পরীক্ষামূলক: এর কোনো নিরাপত্তা নিরীক্ষা হয়নি এবং এটি Node.js-এর সরাসরি বিকল্প নয়।

## Test262 নিরীক্ষা

Windows x64-এ পিন করা পূর্ণ Test262 (`scripts/test262-audit.ps1 -Unit`, ES2020 ও তার আগের ফিচার):

| ডিরেক্টরি | পাস / প্রযোজ্য | বাকি ব্যর্থতা |
| --- | --- | --- |
| `language/` | **22436 / 22492** (26টি বাদ) | 44 `eval`, 1 নতুন সিমান্টিক্স, 11 অন্যান্য |
| `built-ins/` | **15868 / 15933** | 16 `eval`, 12 নতুন সিমান্টিক্স, 37 অন্যান্য |
| `built-ins/Atomics` (agents) | **268 / 268** | — |
| `annexB/` | **996 / 1016** (8টি বাদ) | 20 `eval` |

শ্রেণিবিভাগটি আসে `scripts/test262-summary.mjs` থেকে: «`eval`» টেস্টগুলো এমন সোর্স টেক্সট দিয়ে `eval` বা `$262.evalScript` কল করে, যা Nona কম্পাইলের সময় জানতে পারে না; «নতুন সিমান্টিক্স» টেস্টগুলো পুরোনো বা অনুপস্থিত ফিচার ট্যাগের অধীনে পরবর্তী সংস্করণের আচরণ (`v` ফ্ল্যাগ, numeric separators, `Promise.any`, …) যাচাই করে। ইউনিট স্যুট CI-তে Windows ও Linux-এ চলে এবং আসল PE ও ELF ফাইল কম্পাইল করে চালায়, যার অনেকগুলো GC স্ট্রেসের অধীনে। নিরীক্ষা কীভাবে চালাতে হয় তা [Test262](/bn/reference/test262) পৃষ্ঠায় বর্ণিত।

## বাকি ব্যর্থতা

Windows-এ সব «অন্যান্য» ব্যর্থতা শ্রেণিবদ্ধ করা হয়েছে:

- `built-ins/Function` (25): ফাংশনের সোর্স রানটাইমে অবজেক্টের `toString` থেকে আসে — `eval` ব্যতিক্রম।
- `AsyncFunction`, `AsyncGeneratorFunction` ও `GeneratorFunction`-এর জন্য `is-a-constructor` (4): Test262 হার্নেস রানটাইমে সোর্স টেক্সট তৈরি করে।
- অন্য realm (7): অন্য realm থেকে ডিফল্ট প্রোটোটাইপ ([#7](https://github.com/40oleg/nona/issues/7))।
- non-extensible অবজেক্টে private class fields (2): নতুন-ফিচার ট্যাগ ছাড়া ES2022 private fields।

## চলমান কাজ

- [#11](https://github.com/40oleg/nona/issues/11) — রানটাইমে গণনা করা সোর্সসহ `eval` ও `Function`।
- [#7](https://github.com/40oleg/nona/issues/7) — প্রিলিউড কনস্ট্রাক্টরের জন্য অন্য realm থেকে ডিফল্ট প্রোটোটাইপ।
- [#13](https://github.com/40oleg/nona/issues/13), [#36](https://github.com/40oleg/nona/issues/36) — ঘন (dense) অ্যারে উপাদান এবং `Map`/`Set`-এর জন্য হ্যাশ টেবিল।

পূর্ণ তালিকা আছে [GitHub-এ](https://github.com/40oleg/nona/issues)।

## বিস্তারিত রিপোর্ট

- [0.17–0.20-এর ES2020 অবস্থা](https://github.com/40oleg/nona/blob/main/docs/v0.17-v0.20-status.md) (রুশ ভাষায়)
- [v0.6-এর অবস্থা](https://github.com/40oleg/nona/blob/main/docs/v0.6-status.md)
- [রোডম্যাপ: V8-অনুপ্রাণিত পরিকল্পনা ও লক্ষ্য আর্কিটেকচার (ইংরেজিতে)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [রিলিজ রোডম্যাপ 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/release-roadmap-0.4-0.20.md) (রুশ ভাষায়)
