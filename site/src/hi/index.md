---
layout: home

hero:
  name: Nona
  text: JavaScript से नेटिव एक्ज़ीक्यूटेबल तक
  tagline: एक ahead-of-time कंपाइलर, जो ES2020 JavaScript को Windows और Linux x64 के स्वतंत्र एक्ज़ीक्यूटेबल में बदलता है। न कोई एम्बेडेड इंटरप्रेटर, न C टूलचेन।
  actions:
    - theme: brand
      text: शुरू करें
      link: /hi/guide/getting-started
    - theme: alt
      text: ब्राउज़र में आज़माएँ
      link: /playground
    - theme: alt
      text: Nona क्या है
      link: /hi/guide/what-is-nona
    - theme: alt
      text: GitHub
      link: https://github.com/40oleg/nona

features:
  - title: 2 ms में शुरू
    details: कंपाइल किया गया hello world 1.8 ms में शुरू होता है और अधिकतम 11 MB मेमोरी लेता है, जबकि एक्ज़ीक्यूटेबल 3 MB का है। Node.js को 28 ms और 45 MB लगते हैं; Node SEA एक्ज़ीक्यूटेबल 124 MB का होता है।
    link: /hi/guide/performance
  - title: ES2020 भाषा
    details: क्लास, जनरेटर, async फ़ंक्शन, डीस्ट्रक्चरिंग, ऑप्शनल चेनिंग, BigInt, प्रॉपर टेल कॉल और साइकिल व लाइव बाइंडिंग वाले ES मॉड्यूल — दस्तावेज़ित अपवादों के साथ।
    link: /hi/guide/language-support
  - title: नेटिव रनटाइम
    details: एक सटीक mark-and-sweep गार्बेज कलेक्टर, UTF-16 स्ट्रिंग, असली एक्सेप्शन और स्टैक ओवरफ़्लो पर पकड़ा जा सकने वाला RangeError, हर एक्ज़ीक्यूटेबल में लिंक किए हुए।
    link: /hi/guide/how-it-works
  - title: होस्ट API
    details: टाइमर वाला इवेंट लूप, ग्लोबल process, सिंक्रोनस node:fs, TextEncoder और TextDecoder।
    link: /hi/reference/host-apis
  - title: FFI और nona:win32
    details: कंपाइल-टाइम डिक्लेरेशन से Windows पर किसी भी DLL का एक्सपोर्ट कॉल करें; user32, kernel32 और advapi32 के लिए तैयार बाइंडिंग।
    link: /hi/reference/ffi
  - title: Windows GUI एक्ज़ीक्यूटेबल
    details: कंसोल विंडो के बिना प्रोग्राम, आइकन, ऐप्लिकेशन मैनिफ़ेस्ट और वर्ज़न जानकारी के साथ।
    link: /hi/reference/windows-executables
---

## छोटा उदाहरण

<<< ../../samples/hello.js

::: code-group

```sh [Windows]
node dist/cli.js build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux]
node dist/cli.js build hello.js -o build/hello --target linux-x64
./build/hello
```

:::

```text
Hello, from Nona!
a microtask runs before any timer
tick 1
tick 2
tick 3
done; at least 30 ms passed: true
```

एक्ज़ीक्यूटेबल में प्रोग्राम का मशीन कोड और Nona का रनटाइम होता है। उसे Node.js की ज़रूरत नहीं है: Windows एक्ज़ीक्यूटेबल केवल `KERNEL32.dll` इम्पोर्ट करता है, और Linux एक्ज़ीक्यूटेबल libc के बिना सीधे सिस्टम कॉल करता है।

## स्थिति

मौजूदा रिलीज़ **v0.8.0** है। Windows x64 पर पिन किया गया Test262 सूट (ES2020 फ़ीचर) language के 22436/22492, built-ins के 15868/15933, Atomics के 268/268 और Annex B के 996/1016 टेस्ट पास करता है; बचा हर फ़ेल्योर [स्थिति पेज](/hi/guide/status) पर वर्गीकृत है। स्टार्टअप, एक्ज़ीक्यूटेबल का आकार और मेमोरी Nona की ताक़त हैं; प्रोग्राम के अंदर की गणना V8 से 20–100 गुना धीमी है और कुछ ऑपरेशन (`Map`, `sort`, स्ट्रिंग बनाना, लंबी Promise चेन) अभी भी सुपर-लीनियर हैं, देखें [प्रदर्शन](/hi/guide/performance)। Nona प्रयोगात्मक है: यह Node.js का सीधा विकल्प नहीं है और इसका सुरक्षा ऑडिट नहीं हुआ है।
