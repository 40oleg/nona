# शब्द गणना: fs और process

एक छोटा कमांड-लाइन टूल जो टेक्स्ट फ़ाइलों में शब्द गिनता है, एक रिपोर्ट छापता है और उसे `word-count.txt` में लिखता है। यह एक ही सोर्स से दोनों टार्गेट के लिए बनता है।

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

अगर फ़ाइल `a.txt` में `Hello world, hello Nona!` और `Привет мир 😀` है, और `b.txt` में `one two two` है:

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

Exit स्टेटस 1 है क्योंकि एक फ़ाइल नहीं मिली; बिना आर्ग्युमेंट के 2, और बाकी मामलों में 0।

## टिप्पणियाँ

- **आर्ग्युमेंट।** `process.argv[0]` एक्ज़ीक्यूटेबल है और `process.argv[1]` पहला आर्ग्युमेंट — Node.js के विपरीत, यहाँ स्क्रिप्ट का पाथ नहीं होता। देखें [process](/hi/reference/process)।
- **Exit स्टेटस।** `process.exitCode` वह स्टेटस सेट करता है जो प्रोग्राम के सामान्य रूप से ख़त्म होने पर उपयोग होता है; `process.exit(2)` उसे तुरंत ख़त्म कर देता है।
- **फ़ाइलें।** `readFileSync(path, 'utf8')` एक स्ट्रिंग लौटाता है, `writeFileSync` UTF-8 लिखता है; त्रुटियों में `ENOENT` जैसे Node.js कोड होते हैं। देखें [फ़ाइल सिस्टम](/hi/reference/fs)।
- **टेक्स्ट।** `u` फ़्लैग और `\p{L}` किसी भी लिपि के अक्षरों से मेल खाते हैं; `TextEncoder` UTF-8 बाइट गिनता है।
