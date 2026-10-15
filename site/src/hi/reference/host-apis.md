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

ग्लोबल: `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`, `clearInterval`, `setImmediate(callback, ...args)`, `clearImmediate`, `queueMicrotask(callback)` और `performance.now()`।

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

## Events

`node:events`, `events` and `nona:events` share one built-in module. The default
export is `EventEmitter`; listener ordering, once/prepend listeners, removal,
introspection, meta events, error monitoring and rejection capture are supported.
Promise `once` and async-iterator `on` include cleanup, close events, externally
supplied abort signals and emitter watermarks. Listener/max-listener helpers and
disposable `addAbortListener` subscriptions under `Symbol.dispose` are also available.
`Symbol.dispose` and `Symbol.asyncDispose` have the distinct symbol identities used by Node.js 26.

See the [English events reference](/reference/host-apis#events) for the
complete supported API and limitations.

## URL {#url}

ग्लोबल `URL` और `URLSearchParams` (जिन्हें `node:url` भी एक्सपोर्ट करता है) [URL Standard](https://url.spec.whatwg.org/) का पालन करते हैं: डिफ़ॉल्ट पोर्ट वाली विशेष स्कीम (`http`, `https`, `ws`, `wss`, `ftp`, `file`), बैकस्लैश और डॉट सेगमेंट, किसी बेस के सापेक्ष रिलेटिव रेफ़रेंस, authority या अपारदर्शी पाथ वाली अन्य स्कीम (`mailto:`, `data:`, `blob:`), मानक प्रतिशत-एन्कोडिंग सेट, किसी भी नोटेशन में IPv4 संख्याएँ और IPv6 पते। हर घटक पढ़ा और सेट किया जा सकता है; `searchParams` `search` के साथ सिंक में रहता है। `URL.canParse` और `URL.parse` उपलब्ध हैं। होस्ट लोअरकेस किए जाते हैं, पर IDNA से रूपांतरित नहीं होते: गैर-ASCII होस्ट वाला URL `ERR_INVALID_URL` थ्रो करता है। पार्सर प्रोग्राम में तभी लिंक होता है जब उसके सोर्स में `URL` या `URLSearchParams` का ज़िक्र हो। इसकी मेथड और एक्सेसर `URL.prototype` और `URLSearchParams.prototype` पर तब लगाए जाते हैं जब पहला URL या सर्च पैरामीटर ऑब्जेक्ट बनता है (या `URL.canParse` बुलाया जाता है); इससे जो प्रोग्राम कभी URL पार्स नहीं करते, उनका हीप छोटा रहता है।

## Node.js सहायक मॉड्यूल {#nodejs-support-modules}

ये मॉड्यूल मुख्य रूप से [npm पैकेजों](/reference/npm) के लिए हैं, जो इन्हें स्टार्टअप पर लोड करते हैं। हर मॉड्यूल `node:<name>` और `<name>` दोनों रूपों में उपलब्ध है।

- `node:os`: `EOL`, `devNull`, `platform`, `arch`, `machine`, `type`, `endianness`, `homedir` (`HOME`, या Windows पर `USERPROFILE`), `tmpdir` (`TMPDIR`/`TMP`/`TEMP`), `hostname` (`HOSTNAME`/`COMPUTERNAME` या `localhost`), `userInfo`, `uptime`, `freemem`, `totalmem` और `constants.signals`/`priority`। `release` और `version` ख़ाली स्ट्रिंग हैं, `cpus()` और `networkInterfaces()` ख़ाली हैं, `loadavg()` शून्य लौटाता है और `availableParallelism()` 1 है।
- `node:tty`: `isatty(fd)` बताता है कि स्टैंडर्ड इनपुट, आउटपुट या एरर टर्मिनल है या नहीं; `ReadStream` और `WriteStream` फ़ीचर डिटेक्शन के लिए न्यूनतम क्लास हैं।
- `node:util`: `format` और `formatWithOptions` (`%s %d %i %f %j %o %O %c %%`), `inspect` (`inspect.custom`, `depth`, `breakLength`, `maxArrayLength`, `customInspect` के साथ), `inherits`, `promisify` (`promisify.custom` के साथ), `callbackify`, `deprecate` (हर कोड के लिए एक बार चेतावनी), `debuglog` (`NODE_DEBUG`), `isDeepStrictEqual`, `types`, `styleText`, `stripVTControlCharacters`, `TextEncoder`/`TextDecoder` और पुराने `is*` प्रेडिकेट। `inspect` Node.js के लेआउट के क़रीब है: ऑब्जेक्ट, ऐरे, Map, Set, टाइप्ड ऐरे, फ़ंक्शन, क्लास, एरर, तारीख़ें, बॉक्स्ड वैल्यू, गेटर और सर्कुलर रेफ़रेंस दिखाए जाते हैं, लेकिन रंग, `showHidden`, `sorted` और लंबे ऐरे को कॉलम में बाँटने का Node.js का तरीक़ा हूबहू नहीं दोहराया जाता। `node:util/types` ही `util.types` है।
- `node:url`: `URL`, `URLSearchParams`, `fileURLToPath`, `pathToFileURL` (Windows पर ड्राइव अक्षर और UNC होस्ट), `urlToHttpOptions`, `domainToASCII`/`domainToUnicode` (केवल ASCII), और पुराने `parse`, `format` और `resolve`।
- `node:assert` और `node:assert/strict`: `ok`, `equal`, `notEqual`, `strictEqual`, `notStrictEqual`, `deepEqual`, `deepStrictEqual` और उनके निषेध, `throws`, `doesNotThrow`, `rejects`, `doesNotReject`, `match`, `doesNotMatch`, `ifError`, `fail` और `AssertionError` (`code` `ERR_ASSERTION`)। विफलता संदेश Node.js के diff से छोटे होते हैं।
- `node:crypto`: `randomBytes`, `randomFill`/`randomFillSync`, `randomUUID` (वर्ज़न 4), `randomInt`, `getRandomValues` और `webcrypto.getRandomValues` ऑपरेटिंग सिस्टम के रैंडम स्रोत से पढ़ते हैं (Windows पर `BCryptGenRandom`, बाक़ी जगह `/dev/urandom`)। साथ ही `createHash` (`md5`, `sha1`, `sha256`, `sha384`, `sha512`, `update`, किसी भी Buffer एन्कोडिंग में `digest` और `copy` के साथ), `createHmac`, `hash`, `getHashes` और `timingSafeEqual`। साइफ़र, कुंजियाँ, सिग्नेचर, कुंजी व्युत्पत्ति और `crypto.subtle` उपलब्ध नहीं हैं, और कोई ग्लोबल `crypto` नहीं है।
- `node:querystring`: `parse`/`decode`, `stringify`/`encode`, `escape`, `unescape`।
- `node:timers`: ग्लोबल टाइमर फ़ंक्शन। `node:timers/promises`: `setTimeout`, `setImmediate` (दोनों `AbortSignal` के साथ), async इटरेटर के रूप में `setInterval`, और `scheduler.wait`/`yield`।
- `node:perf_hooks`: `performance`; `PerformanceObserver` और `monitorEventLoopDelay` कुछ भी नहीं देखते।
- `node:module`: `builtinModules` और `isBuiltin`। `createRequire` एक `require` लौटाता है जो केवल वे मॉड्यूल रिज़ॉल्व करता है जो प्रोग्राम बनाते समय उसमें होते हैं; कोई भी अन्य आईडी `MODULE_NOT_FOUND` थ्रो करती है।
- `node:worker_threads`: `isMainThread` `true` है, `parentPort` और `workerData` `null` हैं; `Worker` `ERR_NONA_UNSUPPORTED` थ्रो करता है।
- `node:child_process`: हर फ़ंक्शन और `ChildProcess` `ERR_NONA_UNSUPPORTED` थ्रो करते हैं। यह मॉड्यूल इसलिए है कि जो पैकेज इसका सिर्फ़ ज़िक्र करते हैं, वे लोड हो सकें।
