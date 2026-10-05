# संगतता और सीमाएँ

## दायरा

Nona स्क्रिप्ट और ES मॉड्यूल के लिए मानक ECMA-262 के 11वें संस्करण (जून 2020) की भाषा और बिल्ट-इन को लक्ष्य करता है। ECMA-402 इंटरनेशनलाइज़ेशन, ब्राउज़र API और Node.js API अलग स्पेसिफ़िकेशन हैं; Nona केवल [संदर्भ](/hi/reference/modules) में सूचीबद्ध होस्ट API देता है। पूर्णता का अनुबंध [`docs/es2020-contract.md`](https://github.com/40oleg/nona/blob/main/docs/es2020-contract.md) में रखा गया है।

किसी रिलीज़ को "दस्तावेज़ित अपवादों के साथ ES2020" कहा जाता है, कभी भी पूरी तरह ES2020-अनुरूप नहीं।

## `eval` और `Function` {#eval-and-function}

Nona पहले से कंपाइल करता है, इसलिए `eval` और डायनैमिक फ़ंक्शन कंस्ट्रक्टर को कंपाइल के समय ही अपना सोर्स टेक्स्ट चाहिए:

- **पहले से कंपाइल होता है:** स्ट्रिंग लिटरल, लिटरल का कॉन्कैटिनेशन, या ऐसा वेरिएबल जिसे केवल ऐसे ही कॉन्स्टेंट असाइन होते हैं (वैल्यू की तुलना रनटाइम पर होती है)। डायरेक्ट `eval` कॉलर का स्कोप, `this`, `arguments`, `new.target` और `super` देखता है; इनडायरेक्ट रूप (`(0, eval)(…)`, `globalThis.eval(…)`, `eval?.(…)`) ग्लोबल स्कोप में चलते हैं। `Function`, `GeneratorFunction`, `AsyncFunction` और `AsyncGeneratorFunction` के ऐसे कॉल जिनके सभी आर्ग्युमेंट लिटरल हैं, CreateDynamicFunction सिमैंटिक्स के साथ कंपाइल होते हैं।
- **समर्थित नहीं:** रनटाइम पर बना सोर्स, `eval` को spread आर्ग्युमेंट और `$262.evalScript`। ये फेंकते हैं:

```text
EvalError: Nona compiles ahead of time: eval and Function need source text known at compile time
```

रनटाइम सोर्स [#11](https://github.com/40oleg/nona/issues/11) में ट्रैक किए जा रहे हैं।

## Node.js से अंतर

| क्षेत्र | Nona | Node.js |
| --- | --- | --- |
| `process.argv` | `[execPath, ...arguments]`: `argv[1]` पहला आर्ग्युमेंट है | `[node, script, ...arguments]` |
| `process` | Common metadata, environment mutation, clocks/ticks, standard I/O, lifecycle/warnings, CPU/resources and native process control (all eight targets) | Signal handlers, IPC, V8 heap reports, full async streams and terminal control |
| टाइमर id | नंबर | `Timeout` ऑब्जेक्ट |
| `readFileSync(path)` | `Uint8Array` लौटाता है | `Buffer` लौटाता है |
| एन्कोडिंग | केवल `utf8` (fs); UTF-8, UTF-16LE, Latin-1, ASCII, hex, base64/base64url (Buffer) | कई |
| Windows पर एरर मैसेज | पाथ वैसा ही, जैसा दिया गया | एब्सोल्यूट पाथ |
| मॉड्यूल | `nona:*`, `node:fs`, `node:process`, `node:buffer` और रिलेटिव फ़ाइलें | `node:*` का सब कुछ और npm पैकेज |
| `require`, `node:path` | उपलब्ध नहीं | उपलब्ध |
| स्टैंडर्ड आउटपुट के बिना `console.log` | आउटपुट छोड़ दिया जाता है | आउटपुट छोड़ दिया जाता है या एरर आता है |

## प्रदर्शन

- ऐरे और `Map`/`Set` अपने एलिमेंट लिंक्ड संरचनाओं में रखते हैं; बहुत बड़े कलेक्शन V8 से धीमे हैं ([#13](https://github.com/40oleg/nona/issues/13), [#36](https://github.com/40oleg/nona/issues/36))।
- RegExp इंजन JavaScript में लिखी बैकट्रैकिंग VM है। बैकरेफ़रेंस और लुकअराउंड के बिना कोई पैटर्न बहुत ज़्यादा बैकट्रैक करे (`u` फ़्लैग के बिना), तो उसे लीनियर-टाइम इंजन पूरा करता है।
- Windows पर टाइमर सिस्टम टिक पर जागते हैं (आम तौर पर 15.6 ms)।
- JIT नहीं है: कोड एक ही बार, पहले से, प्रोफ़ाइल-आधारित ऑप्टिमाइज़ेशन के बिना कंपाइल होता है।

## Realm

Test262 के लिए `$262.createRealm` समर्थित है। JavaScript प्रील्यूड में लागू कुछ कंस्ट्रक्टर, जब दूसरे realm के `new.target` के साथ कॉल किए जाते हैं, तब भी डिफ़ॉल्ट प्रोटोटाइप ग़लत realm से लेते हैं ([#7](https://github.com/40oleg/nona/issues/7))।

## प्लेटफ़ॉर्म

- टार्गेट: केवल Windows 10/11 x64 और Linux x86-64।
- Windows एक्ज़ीक्यूटेबल केवल `KERNEL32.dll`, `KERNELBASE.dll` और FFI से घोषित DLL इम्पोर्ट करते हैं; Linux एक्ज़ीक्यूटेबल स्टैटिक हैं और सीधे सिस्टम कॉल का उपयोग करते हैं।
- DLL के लिए FFI केवल Windows पर है; रॉ सिस्टम कॉल केवल Linux पर।

## नेटिव प्लेटफ़ॉर्म

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — नेटिव प्लेटफ़ॉर्म](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.

## Buffer

Global `Buffer`, `Blob` and `File`, and `node:buffer` / `buffer` / `nona:buffer` imports are available on every native target. Buffer supports standard byte encodings, shared slices, copying, searching and numeric access. Blob/File support immutable data and metadata. Blob byte/text streams and object URL registration/resolution are available; see [the API contract and limitations](/reference/host-apis#buffer-and-binary-data).
