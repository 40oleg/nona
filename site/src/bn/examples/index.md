# উদাহরণ

## ধাপে ধাপে উদাহরণ

| উদাহরণ | যা দেখায় | টার্গেট |
| --- | --- | --- |
| [Hello, টাইমার](/bn/examples/hello) | ফাংশন, টেমপ্লেট লিটারাল, মাইক্রোটাস্ক ও টাইমার | Windows, Linux |
| [Museum: ওয়ালপেপার পরিবর্তক](/bn/examples/museum) | `nona:win32`, টাইমার, `node:fs`, `process`, রিসোর্সসহ একটি GUI এক্সিকিউটেবল | Windows |
| [ম্যাট্রিক্স ক্যালকুলেটর](/bn/examples/matrix-calculator) | অ্যারে ও এক্সেপশনসহ সাধারণ ES2020 কোড | Windows, Linux |
| [শব্দ গণনা](/bn/examples/word-count) | `node:fs`, `process.argv`, `process.exitCode`, `Map`, Unicode RegExp | Windows, Linux |

## রিপোজিটরির উদাহরণ

[`examples`](https://github.com/40oleg/nona/tree/main/examples) ডিরেক্টরিতে ছোট প্রোগ্রাম আছে (`factorial.js`, `fibonacci.js`, `loops.js`, `strings.js`, `modern-expressions-demo.js`)। [`examples/compat`](https://github.com/40oleg/nona/tree/main/examples/compat)-এ 80টিরও বেশি প্রোগ্রাম আছে — ভাষা বা লাইব্রেরির প্রতিটি ক্ষেত্রের জন্য একটি — যেগুলো `npm run compare` কম্পাইল করে Node.js-এর আউটপুটের সঙ্গে মিলিয়ে দেখে।

## যেকোনো উদাহরণ বিল্ড করা

::: code-group

```sh [Windows]
node dist/cli.js build examples/fibonacci.js -o build/fibonacci.exe
.\build\fibonacci.exe
```

```sh [Linux]
node dist/cli.js build examples/fibonacci.js -o build/fibonacci --target linux-x64
./build/fibonacci
```

:::

এই সাইটের নমুনাগুলো আছে [`site/samples`](https://github.com/40oleg/nona/tree/main/site/samples)-এ; CI তাদের প্রতিটিকে তার টার্গেটের জন্য কম্পাইল করে।
