# শব্দ গণনা: fs ও process

একটি ছোট কমান্ড-লাইন টুল, যা টেক্সট ফাইলে শব্দ গোনে, একটি রিপোর্ট প্রিন্ট করে এবং সেটি `word-count.txt`-এ লেখে। এটি একই সোর্স থেকে উভয় টার্গেটের জন্য বিল্ড হয়।

<<< ../../../samples/word-count.mjs{js}

::: code-group

```sh [Windows]
node dist/cli.js build word-count.mjs -o build/word-count.exe
.\build\word-count.exe notes.txt README.md
```

```sh [Linux]
node dist/cli.js build word-count.mjs -o build/word-count --target linux-x64
./build/word-count notes.txt README.md
```

:::

যদি `a.txt` ফাইলে থাকে `Hello world, hello Nona!` ও `Привет мир 😀`, এবং `b.txt`-এ থাকে `one two two`:

```text
$ word-count a.txt b.txt missing.txt
missing.txt: not found
a.txt: 6 words, 50 bytes
b.txt: 3 words, 12 bytes
total: 9 words, 7 distinct
  hello: 2
  two: 2
  nona: 1
  one: 1
  world: 1
```

এক্সিট স্ট্যাটাস 1, কারণ একটি ফাইল অনুপস্থিত ছিল; আর্গুমেন্ট ছাড়া 2, আর অন্য ক্ষেত্রে 0।

## টীকা

- **আর্গুমেন্ট।** `process.argv[0]` হলো এক্সিকিউটেবল এবং `process.argv[1]` প্রথম আর্গুমেন্ট — Node.js-এর মতো এখানে কোনো স্ক্রিপ্ট পাথ নেই। দেখুন [process](/bn/reference/process)।
- **এক্সিট স্ট্যাটাস।** `process.exitCode` সেই স্ট্যাটাস নির্ধারণ করে যা প্রোগ্রাম স্বাভাবিকভাবে শেষ হলে ব্যবহৃত হয়; `process.exit(2)` প্রোগ্রামটি তৎক্ষণাৎ শেষ করে।
- **ফাইল।** `readFileSync(path, 'utf8')` একটি স্ট্রিং ফেরত দেয়, `writeFileSync` UTF-8 লেখে; ত্রুটিগুলোতে `ENOENT`-এর মতো Node.js কোড থাকে। দেখুন [ফাইল সিস্টেম](/bn/reference/fs)।
- **টেক্সট।** `u` ফ্ল্যাগ ও `\p{L}` যেকোনো লিপির অক্ষরের সঙ্গে মেলে; `TextEncoder` UTF-8 বাইট গোনে।
