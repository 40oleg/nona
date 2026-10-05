# कमांड लाइन

## सारांश

```text
Nona 0.8.0 — JavaScript subset to native executables
Usage: nona build <input.js> -o <output> [--target win32-x64|linux-x64|linux-arm64|win32-arm64|darwin-x64|freebsd-x64|openbsd-x64] [--module]
       [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
       [--version-info version.json]
       (.mjs inputs are compiled as modules)
       nona --help | --version
```

रिपॉज़िटरी के क्लोन से `node dist/cli.js …` चलाएँ; `npm link` के बाद यही कमांड `nona` के रूप में उपलब्ध है।

## विकल्प

| विकल्प | मान | विवरण |
| --- | --- | --- |
| `-o` | पाथ | आउटपुट फ़ाइल। ज़रूरी। ग़ायब डायरेक्टरी बना दी जाती हैं। |
| `--target` | [Native platforms](/reference/native-platforms) | PE32+, ELF64 or Mach-O64; default: host OS and CPU. |
| `--module` | — | इनपुट को ES मॉड्यूल के रूप में कंपाइल करें। `.mjs` पर ख़त्म होने वाले इनपुट अपने आप मॉड्यूल होते हैं। |
| `--subsystem` | `console` (डिफ़ॉल्ट), `windows` | कंसोल विंडो के बिना Windows GUI प्रोग्राम। केवल `win32-x64`। `--manifest` के बिना GUI प्रोग्राम को डिफ़ॉल्ट मैनिफ़ेस्ट मिलता है। |
| `--icon` | `.ico` फ़ाइल | आइकन फ़ाइल की हर इमेज जोड़ें। केवल `win32-x64`। |
| `--manifest` | XML फ़ाइल | ऐप्लिकेशन मैनिफ़ेस्ट जोड़ें। यह मान्य होना चाहिए: ख़राब मैनिफ़ेस्ट वाले प्रोग्राम को Windows शुरू करने से मना कर देता है। केवल `win32-x64`। |
| `--version-info` | JSON फ़ाइल | वर्ज़न जानकारी जोड़ें (`FileVersion`, `ProductVersion`, `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName`, `Comments`)। केवल `win32-x64`। |
| `--help` | — | सारांश छापें। |
| `--version` | — | कंपाइलर का वर्ज़न छापें। |

हर विकल्प एक बार ही आ सकता है। रिसोर्स फ़ॉर्मैट के लिए [Windows एक्ज़ीक्यूटेबल](/hi/reference/windows-executables) देखें।

## इनपुट और आउटपुट

- इनपुट एक UTF-8 सोर्स फ़ाइल है। मॉड्यूल इनपुट अपने इम्पोर्ट किए मॉड्यूल भी साथ ले आता है; बिल्ट-इन `nona:*` और `node:*` मॉड्यूल कंपाइलर का हिस्सा हैं।
- आउटपुट पहले पास की एक अस्थायी फ़ाइल में लिखा जाता है और फिर उसका नाम बदलकर सही जगह रखा जाता है, इसलिए फ़ेल हुआ बिल्ड कभी आधा लिखा एक्ज़ीक्यूटेबल नहीं छोड़ता और पिछला वाला बना रहता है।
- कंपाइलर अपने इनपुट को ओवरराइट करने से मना करता है, हार्ड लिंक या सिम्बॉलिक लिंक के ज़रिए भी।
- Linux आउटपुट को `0755` मोड मिलता है।

## रनटाइम कैश

एक जैसे हिस्से लिंक करने वाले हर प्रोग्राम के लिए कंपाइल किया गया रनटाइम और प्रील्यूड एक जैसे होते हैं, और इन्हें बनाने में बिल्ड का ज़्यादातर समय लगता है। कमांड लाइन इन्हें कैश डायरेक्टरी में रखती है, इसलिए बाद के बिल्ड लगभग तीन गुना तेज़ होते हैं (Linux पर hello world: 1.1 s, फिर 0.33 s)। कैश के साथ और बिना आउटपुट एक जैसा रहता है। एंट्रियाँ एक ही कंपाइलर बिल्ड की होती हैं और अपडेट के बाद अनदेखी कर दी जाती हैं।

| वेरिएबल | असर |
| --- | --- |
| `NONA_CACHE_DIR` | कैश डायरेक्टरी। डिफ़ॉल्ट: Windows पर `%LOCALAPPDATA%\nona\cache`, macOS पर `~/Library/Caches/nona`, बाकी जगह `$XDG_CACHE_HOME/nona` या `~/.cache/nona`। |
| `NONA_CACHE=0` | कैश न पढ़ें और न लिखें। |

## डायग्नॉस्टिक और एग्ज़िट कोड

सफलता पर एग्ज़िट स्टेटस `0` और किसी भी एरर पर `1` होता है। सोर्स एरर ऐसे छपते हैं:

```text
<file>:<line>:<column> <CODE>: <message>
```

| कोड | अर्थ |
| --- | --- |
| `E_LEX`, `E_SYNTAX` | सोर्स को टोकनाइज़ या पार्स नहीं किया जा सकता, या वह असमर्थित सिंटैक्स का उपयोग करता है। |
| `E_BIND` | नाम रिज़ॉल्व करते समय मिला अर्ली एरर (डुप्लिकेट डिक्लेरेशन, अमान्य असाइनमेंट टार्गेट, …)। |
| `E_MODULE` | मॉड्यूल रिज़ॉल्व, पढ़ा या लिंक नहीं किया जा सकता, या एक्सपोर्ट आपस में टकराते हैं। |
| `E_FFI_STATIC` | `nona:ffi` का `define()` कॉल तीन स्ट्रिंग लिटरल नहीं है या उसका सिग्नेचर अमान्य है। |
| `E_FFI_TARGET` | `linux-x64` के लिए कंपाइल किया गया DLL डिक्लेरेशन, या `win32-x64` के लिए कंपाइल किया गया सिस्टम कॉल डिक्लेरेशन। |
| `E_RESOURCE` | अमान्य आइकन या वर्ज़न जानकारी, या `linux-x64` के लिए माँगे गए रिसोर्स। |
| `E_TARGET` | असमर्थित टार्गेट या सबसिस्टम। |

आर्ग्युमेंट एरर `nona: <message>` के रूप में छपते हैं, जैसे `Unknown option: --foo`, `Duplicate option: -o`, `Missing value for --target`, `Output is required (-o <output>)`, `Unsupported target: arm64`, `Unsupported subsystem: native` या `--subsystem requires --target win32-x64`।

## उदाहरण

::: code-group

```sh [कंसोल प्रोग्राम]
node dist/cli.js build app.js -o build/app.exe
```

```sh [रिसोर्स वाला GUI प्रोग्राम]
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

```sh [Linux]
node dist/cli.js build app.js -o build/app --target linux-x64
```

:::


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
