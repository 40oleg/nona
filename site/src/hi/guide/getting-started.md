# शुरुआत करें

## आवश्यकताएँ

- कंपाइलर चलाने के लिए: Windows या Linux पर Node.js 26 या नया, और npm।
- टार्गेट: Windows 10/11 x64 (`win32-x64`, डिफ़ॉल्ट) और Linux x86-64 (`linux-x64`)।

## कंपाइलर बनाएँ

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
```

कंपाइलर का एंट्री पॉइंट `dist/cli.js` है; इस साइट के उदाहरण इसे `node dist/cli.js` के रूप में चलाते हैं। पैकेज एक `nona` कमांड भी घोषित करता है: रिपॉज़िटरी में `npm link` चलाने से यह आपके `PATH` में आ जाता है।

## आपका पहला प्रोग्राम

<<< ../../../samples/hello.js

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

जब कोई टाइमर या Promise जॉब नहीं बचता, प्रोग्राम ख़त्म हो जाता है। एक्ज़ीक्यूटेबल अपने आप चलता है: इसे ऐसी मशीन पर कॉपी करें जहाँ Node.js नहीं है, तब भी यह काम करेगा।

## टार्गेट और क्रॉस-कंपाइलेशन

यह एक क्रॉस-कंपाइलर है: Windows पर यह Linux एक्ज़ीक्यूटेबल बना सकता है और Linux पर Windows एक्ज़ीक्यूटेबल। `--target` आउटपुट फ़ॉर्मैट चुनता है; डिफ़ॉल्ट `win32-x64` है। Linux आउटपुट `0755` मोड के साथ लिखे जाते हैं।

## मॉड्यूल

`.mjs` इनपुट, या `--module` के साथ कंपाइल किया गया कोई भी इनपुट, ES मॉड्यूल होता है। रिलेटिव इम्पोर्ट (`./util.mjs`, `../lib/x.mjs`) इम्पोर्ट करने वाली फ़ाइल के पास से रिज़ॉल्व होते हैं और उसी एक्ज़ीक्यूटेबल में कंपाइल होते हैं। बिल्ट-इन मॉड्यूल `nona:` प्रीफ़िक्स का उपयोग करते हैं (`nona:ffi`, `nona:win32`, `nona:fs`, `nona:process`), और `node:fs` व `node:process` Nona के सबसेट के उपनाम (alias) हैं; देखें [बिल्ट-इन मॉड्यूल](/hi/reference/modules)।

## कंसोल के बिना Windows प्रोग्राम

```sh
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` प्रोग्राम को कंसोल विंडो के बिना शुरू करता है और एक डिफ़ॉल्ट मैनिफ़ेस्ट जोड़ता है; `--icon` और `--version-info` ऐसे रिसोर्स जोड़ते हैं जिन्हें Explorer दिखाता है। देखें [Windows एक्ज़ीक्यूटेबल](/hi/reference/windows-executables) और [Museum उदाहरण](/hi/examples/museum)।

## समस्या निवारण

कंपाइल एरर `file:line:column CODE: message` के रूप में छपते हैं और कंपाइलर स्टेटस 1 के साथ बाहर निकलता है:

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- असमर्थित सिंटैक्स रनटाइम पर फ़ेल होने के बजाय कंपाइल के समय ही अस्वीकार कर दिया जाता है।
- `E_FFI_TARGET` का अर्थ है कि DLL डिक्लेरेशन `linux-x64` के लिए कंपाइल हुआ (या सिस्टम कॉल `win32-x64` के लिए)।
- रनटाइम पर `EvalError` का अर्थ है कि `eval` या `Function` को ऐसा सोर्स टेक्स्ट मिला जो कंपाइल के समय ज्ञात नहीं था।

[कमांड लाइन संदर्भ](/hi/reference/cli) में हर विकल्प और एरर की सूची है।

## नेटिव प्लेटफ़ॉर्म

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — नेटिव प्लेटफ़ॉर्म](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.
