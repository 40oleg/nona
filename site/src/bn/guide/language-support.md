# ভাষা সমর্থন

Nona নথিভুক্ত ব্যতিক্রমসহ ECMA-262-এর 11তম সংস্করণ (ES2020)-কে লক্ষ্য করে। এই পৃষ্ঠায় **v0.8.0** অনুযায়ী কী সমর্থিত তার সারসংক্ষেপ আছে; সংখ্যাগুলো এসেছে [Test262](/bn/reference/test262) পৃষ্ঠায় বর্ণিত পিন করা Test262 রিভিশন থেকে।

**সমর্থিত** মানে বাস্তবায়িত এবং «টীকা» কলামের সীমার মধ্যে ইউনিট টেস্ট ও Test262 দিয়ে যাচাই করা। টেস্টের নামসহ প্রতিটি ফিচারের বিস্তারিত ম্যাট্রিক্স রাখা আছে [`docs/language-support.md`](https://github.com/40oleg/nona/blob/main/docs/language-support.md)-এ (রুশ ভাষায়)।

## ভাষা

| ক্ষেত্র | অবস্থা | টীকা |
| --- | --- | --- |
| লেক্সিক্যাল ব্যাকরণ ও লিটারাল | সমর্থিত | দশমিক, হেক্স, বাইনারি, অক্টাল ও BigInt লিটারাল, আইডেন্টিফায়ার ও স্ট্রিংয়ে Unicode escape, টেমপ্লেট লিটারাল। sloppy স্ক্রিপ্টে Annex B-র পুরোনো অক্টাল ও HTML-সদৃশ মন্তব্য। Numeric separators (ES2021) প্রত্যাখ্যাত হয়। |
| `var`, `let`, `const`, TDZ | সমর্থিত | হোয়েস্টিং, ব্লক স্কোপ, প্রতি-ইটারেশন বাইন্ডিং, early error হিসেবে ডিক্লারেশনের সংঘাত। |
| ফাংশন | সমর্থিত | ডিক্লারেশন ও এক্সপ্রেশন, ক্লোজার, `arguments` (mapped ও unmapped), ডিফল্ট ও rest প্যারামিটার, ডিস্ট্রাকচারিং প্যারামিটার, `this`, `new.target`, হুবহু সোর্স টেক্সটসহ `Function.prototype.toString`। |
| অ্যারো ফাংশন | সমর্থিত | লেক্সিক্যাল `this`, `arguments`, `new.target` ও `super`; `async` অ্যারো। |
| ক্লাস | সমর্থিত | ডিক্লারেশন ও এক্সপ্রেশন, কনস্ট্রাক্টর, ইনস্ট্যান্স ও স্ট্যাটিক মেথড এবং অ্যাক্সেসর, computed নাম, বিল্ট-ইন ও `extends null`-সহ ইনহেরিট্যান্স, `super()` ও `super.x`। Class fields ও private names (ES2022) সমর্থিত নয়। |
| ডিস্ট্রাকচারিং, spread | সমর্থিত | ডিক্লারেশন, অ্যাসাইনমেন্ট, প্যারামিটার, `for-in`/`for-of` টার্গেট; অ্যারে, অবজেক্ট, কল ও `new` spread। |
| ইটারেটর ও জেনারেটর | সমর্থিত | ইটারেটর প্রোটোকল, `for-of`, জেনারেটর ফাংশন ও মেথড, `yield*`, `return`/`throw`। |
| async ফাংশন | সমর্থিত | async ফাংশন, অ্যারো ও মেথড, `await`, async জেনারেটর ও `for await`, ES2020-এর জব ক্রমসহ। |
| অপারেটর | সমর্থিত | `**`, অপশনাল চেইনিং, `??`, `delete`, `in`, `Symbol.hasInstance`-সহ `instanceof`, BigInt অঙ্ক ও তুলনাসহ। |
| নিয়ন্ত্রণ প্রবাহ | সমর্থিত | সব স্টেটমেন্ট, লেবেল, completion value-সহ `try`/`catch`/`finally`, `switch`, `debugger` (কিছু করে না)। |
| Strict মোড | সমর্থিত | Directive prologue, strict `this`, early error ও রানটাইম সীমাবদ্ধতা। |
| `with` | সমর্থিত | কেবল sloppy স্ক্রিপ্টে, `Symbol.unscopables`-সহ। |
| প্রপার টেইল কল | সমর্থিত | strict কোডে। |
| মডিউল | সমর্থিত | সব রূপের `import`/`export`, সাইকেল, লাইভ বাইন্ডিং, namespace অবজেক্ট, `import.meta`, কম্পাইলের সময় জানা মডিউলের `import()`। টপ-লেভেল `await` (ES2022) সমর্থিত নয়। |
| `eval`, `Function` | আংশিক | কম্পাইলের সময় জানা সোর্স পূর্ণ direct ও indirect `eval` সিমান্টিক্সসহ আগেভাগে কম্পাইল হয়; রানটাইমে গণনা করা সোর্স `EvalError` ছোড়ে। দেখুন [সামঞ্জস্য](/bn/guide/compatibility#eval-and-function)। |
| Annex B | সমর্থিত | ব্লকের ভেতরের ফাংশন, `__proto__`, পুরোনো RegExp সিনট্যাক্স, `escape`/`unescape`, String-এর HTML মেথড ইত্যাদির ওয়েব-সামঞ্জস্য সিমান্টিক্স। |

## বিল্ট-ইন

| ক্ষেত্র | অবস্থা | টীকা |
| --- | --- | --- |
| Object, Function, Boolean, Symbol, Error | সমর্থিত | প্রপার্টি ডেসক্রিপ্টর, integrity অপারেশন এবং গ্লোবাল ও well-known symbol-সহ। |
| Number, Math, URI ফাংশন | সমর্থিত | সবচেয়ে ছোট round-trip সংখ্যা ফরম্যাটিং, `toFixed`/`toExponential`/`toPrecision`, ES2020-এর সব `Math` ফাংশন। |
| String | সমর্থিত | ES2020 মেথড, Unicode নরমালাইজেশন, ECMA-402 লোকেল ডেটা ছাড়া `localeCompare`। |
| RegExp | সমর্থিত | Named groups, lookbehind, `s`, `u`, `y` ও `g` ফ্ল্যাগ, Unicode property escapes, `matchAll`। ইঞ্জিনটি প্রিলিউড হিসেবে লেখা একটি ব্যাকট্র্যাকিং VM; এটি V8-এর চেয়ে ধীর। |
| Array | সমর্থিত | ES2020-এর সব মেথড, species, ফাঁকা স্থান (holes) ও খুব বড় দৈর্ঘ্য। |
| Date, JSON | সমর্থিত | UTC ও স্থানীয় সময়ে Date পার্সিং ও ফরম্যাটিং, reviver-সহ `JSON.parse`, replacer ও ইনডেন্টেশনসহ `JSON.stringify`। |
| Map, Set, WeakMap, WeakSet | সমর্থিত | weak কালেকশনের জন্য ephemeron সিমান্টিক্স। |
| ArrayBuffer, DataView, typed array | সমর্থিত | BigInt অ্যারেসহ সব 11টি typed array টাইপ, detachment, species। |
| SharedArrayBuffer, Atomics | সমর্থিত | worker agent-সহ `Atomics.wait`/`notify` (Test262 ব্যবহার করে)। |
| Proxy, Reflect | সমর্থিত | সব trap ও invariant। |
| Promise | সমর্থিত | `all`, `allSettled`, `race`, `finally`, thenable এবং আনহ্যান্ডেলড rejection রিপোর্টিং। |
| `globalThis`, `console.log` | সমর্থিত | `console.log` স্ট্যান্ডার্ড আউটপুটে UTF-8 লেখে। |

## ES2020-এর পরে

পরবর্তী সংস্করণের ফিচার সমর্থিত নয়: class fields ও private names, static blocks, `Promise.any`, `WeakRef` ও `FinalizationRegistry`, logical assignment অপারেটর, numeric separators, RegExp-এর `v` ফ্ল্যাগ, টপ-লেভেল `await` এবং `Array.prototype.at`। পরবর্তী লাইব্রেরির কয়েকটি সংযোজন, যেমন `String.prototype.replaceAll`, উপলব্ধ। যেখানে পিন করা Test262 রিভিশন ইতিমধ্যে ES2020 ফিচারের জন্য নতুন সিমান্টিক্স যাচাই করে, সেখানে Nona Test262 অনুসরণ করে; [Test262](/bn/reference/test262#semantics-newer-than-es2020-in-the-pinned-test262) পৃষ্ঠায় এই ক্ষেত্রগুলোর তালিকা আছে।

ECMAScript-এর অংশ নয় এমন হোস্ট API — টাইমার, `process`, `node:fs`, `TextEncoder`/`TextDecoder` ও FFI — [রেফারেন্সে](/bn/reference/modules) বর্ণিত।

## Test262 ফলাফল

Windows x64-এ পিন করা Test262-এর পূর্ণ রান (ES2020 ও তার আগের ফিচার):

| ডিরেক্টরি | পাস / প্রযোজ্য | বাকি ব্যর্থতা |
| --- | --- | --- |
| `language/` | 22436 / 22492 | 44 `eval`, 1 নতুন সিমান্টিক্স, 11 অন্যান্য |
| `built-ins/` | 15868 / 15933 | 16 `eval`, 12 নতুন সিমান্টিক্স, 37 অন্যান্য |
| `built-ins/Atomics` (agents) | 268 / 268 | — |
| `annexB/` | 996 / 1016 | 20 `eval` |

«`eval`» ব্যর্থতাগুলো রানটাইমে গণনা করা সোর্স টেক্সট, `$262.evalScript` বা অন্য realm ব্যবহার করে; «নতুন সিমান্টিক্স» টেস্টগুলো পুরোনো বা অনুপস্থিত ফিচার ট্যাগের অধীনে পরবর্তী সংস্করণের আচরণ যাচাই করে। [অবস্থা পৃষ্ঠায়](/bn/guide/status) বাকি ব্যর্থতাগুলোর তালিকা আছে।

Script functions can shadow built-in and host global names such as `escape`, `unescape`, `process`, timers and `TextEncoder`/`TextDecoder`. Runtime initialization completes first; declarations install writable, enumerable, nonconfigurable global properties.
