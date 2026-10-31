# शुरुआत करें

## इंस्टॉल करें

अपने सिस्टम का आर्काइव [नवीनतम रिलीज़](https://github.com/40oleg/nona/releases/latest) से डाउनलोड करें, उसे एक्सट्रैक्ट करें और `nona --help` चलाएँ (Linux, macOS और BSD पर `./nona --help`)। आर्काइव में एक्ज़ीक्यूटेबल (Windows पर `nona.exe`, अन्य सिस्टम पर `nona`), `LICENSE`, `VERSION`, `README.txt` और `THIRD_PARTY_NOTICES.md` हैं; कंपाइलर एक नेटिव प्रोग्राम है जिसे Node.js की ज़रूरत नहीं। हर रिलीज़ में `SHA256SUMS` भी सूचीबद्ध है। नीचे आर्काइव के नामों में `<version>` रिलीज़ का वर्ज़न है।

बनाए गए प्रोग्राम को वितरित करते समय कंपाइलर के आर्काइव से `LICENSE` और `THIRD_PARTY_NOTICES.md` फ़ाइलें एक्ज़ीक्यूटेबल के साथ रखें। साझा रनटाइम में इन [नोटिस](https://github.com/40oleg/nona/blob/main/THIRD_PARTY_NOTICES.md) के अंतर्गत आने वाले गैर-दशमलव संख्या फ़ॉर्मैटिंग और घनमूल का समर्थन शामिल है; ARM64 आउटपुट सॉफ़्टवेयर में लागू लघुगणक और घातीय फ़ंक्शन भी इस्तेमाल करता है।

| OS                          | आर्काइव                                                                  | टार्गेट नाम                  |
| --------------------------- | ------------------------------------------------------------------------ | ---------------------------- |
| Windows x64 / ARM64         | `nona-<version>-win32-x64.zip`, `nona-<version>-win32-arm64.zip`         | `win32-x64`, `win32-arm64`   |
| Linux x64 / ARM64           | `nona-<version>-linux-x64.tar.gz`, `nona-<version>-linux-arm64.tar.gz`   | `linux-x64`, `linux-arm64`   |
| macOS Intel / Apple Silicon | `nona-<version>-darwin-x64.tar.gz`, `nona-<version>-darwin-arm64.tar.gz` | `darwin-x64`, `darwin-arm64` |
| FreeBSD / OpenBSD x64       | `nona-<version>-freebsd-x64.tar.gz`, `nona-<version>-openbsd-x64.tar.gz` | `freebsd-x64`, `openbsd-x64` |

POSIX सिस्टम पर, अगर आर्काइव टूल अनुमति हटा दे तो `chmod +x nona` चलाएँ। कुछ भी इंस्टॉल किए बिना Nona आज़माने के लिए [प्लेग्राउंड](/playground) का उपयोग करें।

### सोर्स से बनाएँ

आपको Node.js 26 या नया और npm चाहिए, किसी भी ऐसे होस्ट पर जो Node.js 26 चलाता है।

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
node dist/cli.js --help
```

कंपाइलर का एंट्री पॉइंट `dist/cli.js` है। रिपॉज़िटरी में `npm link` चलाने से आपके `PATH` में `nona` कमांड आ जाती है। इस साइट का बाकी हिस्सा `nona` लिखता है; क्लोन से इसकी जगह `node dist/cli.js` चलाएँ।

## आपका पहला प्रोग्राम

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux and macOS]
nona build hello.js -o build/hello
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

यह एक क्रॉस-कंपाइलर है: कोई भी होस्ट आठों [नेटिव प्लेटफ़ॉर्म](/reference/native-platforms) में से किसी के भी एक्ज़ीक्यूटेबल बना सकता है। `--target` आउटपुट फ़ॉर्मैट और CPU चुनता है; इसके बिना टार्गेट होस्ट का OS और CPU होता है।

```sh
nona build hello.js -o build/hello --target linux-arm64
nona build hello.js -o build/hello.exe --target win32-x64
```

क्रॉस-कंपाइल किया गया एक्ज़ीक्यूटेबल केवल मेल खाते OS और CPU पर चलता है। Linux, BSD और macOS आउटपुट `0755` मोड के साथ लिखे जाते हैं।

## मॉड्यूल

`.mjs` इनपुट, या `--module` के साथ कंपाइल किया गया कोई भी इनपुट, ES मॉड्यूल होता है। रिलेटिव इम्पोर्ट (`./util.mjs`, `../lib/x.mjs`) इम्पोर्ट करने वाली फ़ाइल के पास से रिज़ॉल्व होते हैं और उसी एक्ज़ीक्यूटेबल में कंपाइल होते हैं। CommonJS इनपुट उन सभी के साथ कंपाइल होता है जिन्हें वह `require` करता है।

बिल्ट-इन मॉड्यूल `nona:` प्रीफ़िक्स का उपयोग करते हैं (`nona:ffi`, `nona:win32`, `nona:fs`, `nona:process`); कई Node.js नाम (`node:fs`, `node:path`, `node:http`, …) भी उपलब्ध हैं। देखें [बिल्ट-इन मॉड्यूल](/hi/reference/modules)।

## npm पैकेज

npm से पैकेज हमेशा की तरह इंस्टॉल करें और बिल्ड करें: Nona बिल्ड के समय `node_modules` हल करता है और पैकेजों को एक्ज़ीक्यूटेबल में कंपाइल कर देता है। `nona build <package directory>` पैकेज की `"bin"` कमांड या `"main"` मॉड्यूल बनाता है। देखें [npm पैकेज](/reference/npm)।

## कंसोल के बिना Windows प्रोग्राम

```sh
nona build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` प्रोग्राम को कंसोल विंडो के बिना शुरू करता है और एक डिफ़ॉल्ट मैनिफ़ेस्ट जोड़ता है; `--icon` और `--version-info` ऐसे रिसोर्स जोड़ते हैं जिन्हें Explorer दिखाता है। देखें [Windows एक्ज़ीक्यूटेबल](/hi/reference/windows-executables) और [Museum उदाहरण](/hi/examples/museum)।

## समस्या निवारण

कंपाइल एरर `file:line:column CODE: message` के रूप में छपते हैं और कंपाइलर स्टेटस 1 के साथ बाहर निकलता है:

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- असमर्थित सिंटैक्स रनटाइम पर फ़ेल होने के बजाय कंपाइल के समय ही अस्वीकार कर दिया जाता है।
- `E_FFI_TARGET` का अर्थ है कि DLL डिक्लेरेशन किसी गैर-Windows टार्गेट के लिए कंपाइल हुआ (या सिस्टम कॉल `win32-x64` के लिए)।
- `E_HOST_MODULE` का अर्थ है कि कोई बिल्ट-इन मॉड्यूल उस टार्गेट के लिए उपलब्ध नहीं है।
- रनटाइम पर `EvalError` का अर्थ है कि `eval` या `Function` को ऐसा सोर्स टेक्स्ट मिला जो कंपाइल के समय ज्ञात नहीं था।

[कमांड लाइन संदर्भ](/hi/reference/cli) में हर विकल्प और एरर की सूची है।

## अगले कदम

- [उदाहरण](/hi/examples/) — स्पष्टीकरण के साथ पूरे प्रोग्राम।
- [भाषा समर्थन](/hi/guide/language-support) और [संगतता और सीमाएँ](/hi/guide/compatibility) — क्या अपेक्षा करें।
- [बिल्ट-इन मॉड्यूल](/hi/reference/modules) — होस्ट API।
