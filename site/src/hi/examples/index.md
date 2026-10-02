# उदाहरण

## चरण-दर-चरण उदाहरण

| उदाहरण | क्या दिखाता है | टार्गेट |
| --- | --- | --- |
| [Hello, टाइमर](/hi/examples/hello) | फ़ंक्शन, टेम्पलेट लिटरल, माइक्रोटास्क और टाइमर | Windows, Linux |
| [Museum: वॉलपेपर बदलने वाला](/hi/examples/museum) | `nona:win32`, टाइमर, `node:fs`, `process`, रिसोर्स वाला GUI एक्ज़ीक्यूटेबल | Windows |
| [मैट्रिक्स कैलकुलेटर](/hi/examples/matrix-calculator) | ऐरे और एक्सेप्शन के साथ सामान्य ES2020 कोड | Windows, Linux |
| [शब्द गणना](/hi/examples/word-count) | `node:fs`, `process.argv`, `process.exitCode`, `Map`, Unicode RegExp | Windows, Linux |

## रिपॉज़िटरी के उदाहरण

[`examples`](https://github.com/40oleg/nona/tree/main/examples) डायरेक्टरी में छोटे प्रोग्राम हैं (`factorial.js`, `fibonacci.js`, `loops.js`, `strings.js`, `modern-expressions-demo.js`)। [`examples/compat`](https://github.com/40oleg/nona/tree/main/examples/compat) में 80 से अधिक प्रोग्राम हैं, जिन्हें `npm run compare` कंपाइल करके Node.js के आउटपुट से जाँचता है — भाषा या लाइब्रेरी के हर क्षेत्र के लिए एक।

## कोई भी उदाहरण बनाना

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

इस साइट के सैंपल [`site/samples`](https://github.com/40oleg/nona/tree/main/site/samples) में रहते हैं; CI उनमें से हर एक को उसके टार्गेट के लिए कंपाइल करता है।
