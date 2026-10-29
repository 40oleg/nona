---
layout: home

hero:
    name: Nona
    text: JavaScript से नेटिव एक्ज़ीक्यूटेबल तक
    tagline: एक ahead-of-time कंपाइलर, जो ES2020 JavaScript को Windows, Linux, macOS, FreeBSD और OpenBSD के छोटे स्वतंत्र एक्ज़ीक्यूटेबल में बदलता है। न कोई एम्बेडेड इंटरप्रेटर, न C टूलचेन।
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
      details: कंपाइल किया गया hello world लगभग 2 ms में शुरू होता है और अधिकतम 11 MB मेमोरी लेता है, जबकि फ़ाइल लगभग 2 MB की है। Node.js को 28 ms और 45 MB लगते हैं; Node SEA एक्ज़ीक्यूटेबल 124 MB का होता है।
      link: /hi/guide/performance
    - title: किसी भी होस्ट से आठ टार्गेट
      details: x64 और ARM64 पर Windows, Linux और macOS, तथा x64 पर FreeBSD और OpenBSD। --target से क्रॉस-कंपाइल करें; हर एक्ज़ीक्यूटेबल स्वतंत्र है।
      link: /reference/native-platforms
    - title: ES2020 भाषा
      details: क्लास, जनरेटर, async फ़ंक्शन, डीस्ट्रक्चरिंग, ऑप्शनल चेनिंग, BigInt, प्रॉपर टेल कॉल और साइकिल व लाइव बाइंडिंग वाले ES मॉड्यूल, दस्तावेज़ित अपवादों के साथ।
      link: /hi/guide/language-support
    - title: npm पैकेज
      details: node_modules के पैकेज बिल्ड के समय हल किए जाते हैं और उन Node.js मॉड्यूल के साथ, जिनकी उन्हें आम तौर पर ज़रूरत होती है, एक्ज़ीक्यूटेबल में कंपाइल हो जाते हैं।
      link: /reference/npm
    - title: Node.js-शैली के होस्ट API
      details: टाइमर और इवेंट लूप, process, fs, path, Buffer, स्ट्रीम, events, URL, और HTTP व TCP सर्वर तथा क्लाइंट।
      link: /hi/reference/modules
    - title: नेटिव रनटाइम
      details: एक सटीक mark-and-sweep गार्बेज कलेक्टर, UTF-16 स्ट्रिंग, असली एक्सेप्शन, स्टैक ओवरफ़्लो पर पकड़ा जा सकने वाला RangeError और स्वयं-होस्टेड कंपाइलर।
      link: /hi/guide/how-it-works
    - title: FFI और Windows GUI प्रोग्राम
      details: कंपाइल-टाइम डिक्लेरेशन से किसी भी DLL का एक्सपोर्ट कॉल करें, और कंसोल विंडो के बिना, आइकन, मैनिफ़ेस्ट और वर्ज़न जानकारी वाले प्रोग्राम बनाएँ।
      link: /hi/reference/ffi
---

## छोटा उदाहरण

<<< ../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux and macOS]
nona build hello.js -o build/hello
./build/hello
```

```sh [Cross-compile]
nona build hello.js -o build/hello --target linux-arm64
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

मौजूदा रिलीज़ **v0.33.0** है; Nona प्रयोगात्मक है। यह Node.js का सीधा विकल्प नहीं है और इसका सुरक्षा ऑडिट नहीं हुआ है।

- **अनुपालन।** पिछले पूर्ण ऑडिट (v0.8.0) में पिन किया गया Test262 सूट Windows x64 पर language के 22436/22492, built-ins के 15868/15933, Atomics के 268/268 और Annex B के 996/1016 टेस्ट पास करता था। बचा हर फ़ेल्योर [स्थिति पेज](/hi/guide/status) पर वर्गीकृत है।
- **गति।** स्टार्टअप, एक्ज़ीक्यूटेबल का आकार और मेमोरी Nona की ताक़त हैं। प्रोग्राम के अंदर की गणना में JIT नहीं है: सरल लूप में V8 के बराबर से लेकर कॉल, आवंटन और लंबे चलने वाले असली प्रोग्रामों में कई गुना या दसियों गुना धीमी। [प्रदर्शन](/hi/guide/performance) पेज पर माप और ज्ञात धीमे स्थान हैं।
- **सीमाएँ।** `eval` और `Function` को कंपाइल के समय ज्ञात सोर्स टेक्स्ट चाहिए, और केवल वही Node.js API मौजूद हैं जो Nona लागू करता है। देखें [संगतता और सीमाएँ](/hi/guide/compatibility)।
