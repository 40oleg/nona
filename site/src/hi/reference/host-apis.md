# होस्ट API

::: info अनुवाद
यह पेज अंग्रेज़ी पेज [Host APIs](/reference/host-apis) का अनुवाद है, जो [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md) से बनता है। अंग्रेज़ी संस्करण ही प्रामाणिक है और उसमें नई जानकारी हो सकती है।
:::

Nona प्रोग्राम Node.js के बिना चलते हैं। नीचे दिए गए होस्ट API नेटिव रनटाइम और छोटे JavaScript प्रील्यूड द्वारा लागू किए गए हैं, जो हर एक्ज़ीक्यूटेबल में कंपाइल होते हैं।

## Paths (`node:path`)

`node:path` / `path` implements Node.js 26 path utilities on all eight native targets.
Use `posix`, `win32`, or explicit flavor modules (`node:path/posix`,
`node:path/win32`, `path/posix`, `path/win32`). Functions: `normalize`, `join`,
`resolve`, `relative`, `parse`, `format`, `basename`, `dirname`, `extname`,
`isAbsolute`, `toNamespacedPath`, `matchesGlob`; properties: `sep`, `delimiter`.
The target selects the default flavor; resolution reads the executable's runtime
current directory. Working-directory information is read on demand; importing
Path does not initialize the full process object. [Full reference](https://github.com/40oleg/nona/blob/main/docs/path.md).

## टाइमर और इवेंट लूप

ग्लोबल: `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask(callback)` और `performance.now()`।

- टॉप-लेवल प्रोग्राम के बाद एंट्री एक इवेंट लूप चलाती है: यह Promise जॉब कतार खाली करती है, फिर बार-बार सबसे नज़दीकी टाइमर की समय-सीमा का इंतज़ार करती है, उस कॉलबैक को चलाती है और फिर से जॉब कतार खाली करती है। जब कोई टाइमर नहीं बचता, प्रोसेस बाहर निकल जाती है।
- टाइमर समय-सीमा के क्रम में, फिर पंजीकरण के क्रम में व्यवस्थित होते हैं। देरी (delay) Node.js का पालन करती है: इसे `ToNumber` से बदला जाता है, और जो मान `NaN` हैं, 1 से कम हैं या 2^31-1 से अधिक हैं, वे 1 बन जाते हैं।
- टाइमर id Number होते हैं (Node.js `Timeout` ऑब्जेक्ट लौटाता है)। `clearTimeout` और `clearInterval` कोई भी id स्वीकार करते हैं; अज्ञात id को अनदेखा किया जाता है।
- इंतज़ार Windows पर `Sleep` और Linux पर `nanosleep` से होता है, इसलिए निष्क्रिय प्रोग्राम CPU का उपयोग नहीं करता। Windows पर रिज़ॉल्यूशन सिस्टम टाइमर टिक होता है (आमतौर पर 15.6 ms)।
- `performance.now()` मोनोटोनिक घड़ी (`QueryPerformanceCounter`, `clock_gettime(CLOCK_MONOTONIC)`) का उपयोग करता है और प्रोग्राम शुरू होने से मिलीसेकंड गिनता है।
- टाइमर कॉलबैक में न पकड़ा गया एक्सेप्शन प्रोसेस को exit कोड 1 के साथ समाप्त कर देता है, ठीक वैसे ही जैसे टॉप-लेवल प्रोग्राम में न पकड़ा गया एक्सेप्शन।
- Test262 होस्ट द्वारा बनाए गए realm अपने टाइमर स्थापित नहीं करते।

## लंबे समय तक चलने वाले प्रोग्राम

- कलेक्टर कमिट किए गए coroutine स्टैक (हर चल रहे async फ़ंक्शन या जनरेटर के लिए 1 MiB, `rt.generatorStackBytes`) को अपनी सीमा में गिनता है, इसलिए छोड़े गए coroutine, जिनके स्टैक केवल sweep ही मुक्त करता है, सामान्य कचरे की तरह कलेक्शन शुरू करते हैं।
- `tests/stability.test.ts` जाँचता है कि दस गुना अधिक टाइमर फ़ायरिंग (हर टिक में promise जॉब और कचरे के साथ) पीक मेमोरी नहीं बढ़ाती, कि हज़ारों छोड़े गए coroutine मुक्त हो जाते हैं, और कि दो सेकंड के टाइमर का इंतज़ार करने वाला प्रोग्राम लगभग कोई CPU उपयोग नहीं करता।
- ज्ञात सीमाएँ: प्रॉपर्टी, एलिमेंट और Map स्टोरेज रैखिक (linear) है (#36), इसलिए सैकड़ों जीवित टाइमर या बड़े ऑब्जेक्ट वाले प्रोग्राम धीमे हो जाते हैं; Linux पर हर हीप ब्लॉक एक अलग मेमोरी मैपिंग है (#37)।


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
