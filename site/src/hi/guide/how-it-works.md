# यह कैसे काम करता है

## पाइपलाइन

```text
JavaScript source (script or module graph)
      │
      ▼
 lexer → parser → early errors and scope binding → compile-time eval/Function
                                                         │
                                                         ▼
                                     IR lowering → x86-64 code generation
                                                         │
                                                         ▼
                       runtime (native code + JS preludes) → PE32+/ELF64/Mach-O64 linker
```

सब कुछ कंपाइलर प्रोसेस के अंदर ही चलता है; कोई बाहरी असेंबलर, लिंकर या C कंपाइलर नहीं है। नतीजा एक फ़ाइल है जिसमें प्रोग्राम का मशीन कोड और Nona का रनटाइम होता है।

## फ़्रंटएंड

[`src/frontend`](https://github.com/40oleg/nona/tree/main/src/frontend) सोर्स टेक्स्ट को बाउंड प्रोग्राम में बदलता है:

- `lexer.ts`, `parser.ts` और `ast.ts` सिंटैक्स ट्री बनाते हैं; असमर्थित सिंटैक्स कंपाइल एरर है।
- `binder.ts` और `declarations.ts` अर्ली एरर लागू करते हैं, हर आइडेंटिफ़ायर को किसी स्कोप (ग्लोबल, मॉड्यूल, फ़ंक्शन, ब्लॉक, `with` ऑब्जेक्ट) से जोड़ते हैं और तय करते हैं कि कौन-सी बाइंडिंग क्लोज़र में रहेंगी।
- `modules.ts` मॉड्यूल ग्राफ़ लोड करता है: स्टैटिक इम्पोर्ट, लिटरल स्पेसिफ़ायर वाला `import()`, साइकिल और एक्सपोर्ट रिज़ॉल्यूशन। `builtin-modules.ts` और `fs-module.ts` `nona:*` और `node:*` मॉड्यूल देते हैं।
- `eval-aot.ts` और `dynamic-functions.ts` उन `eval` और `Function` कॉल को कंपाइल करते हैं जिनका सोर्स टेक्स्ट कंपाइल के समय ज्ञात है।

## इंटरमीडिएट रिप्रेज़ेंटेशन

[`src/ir`](https://github.com/40oleg/nona/tree/main/src/ir) बाउंड प्रोग्राम को ब्लॉक, ऑपरेशन और टर्मिनेटर से बने रजिस्टर-जैसे IR में बदलता है (`lower.ts`, `model.ts`) और लाइवनेस (`liveness.ts`) निकालता है, ताकि गार्बेज कलेक्टर हर सेफ़पॉइंट पर केवल जीवित (लाइव) वैल्यू देखे।

## कोड जनरेशन

[`src/backend/x64`](https://github.com/40oleg/nona/tree/main/src/backend/x64) में x86-64 इंस्ट्रक्शन एन्कोडर, असेंबलर और कोड जनरेटर हैं, जो IR ऑपरेशन को रनटाइम कॉल और इनलाइन फ़ास्ट पाथ में बदलता है। दोनों टार्गेट पर जनरेट किया गया कोड और रनटाइम Win64 कॉलिंग कन्वेंशन का पालन करते हैं।

## रनटाइम

हर एक्ज़ीक्यूटेबल में [`src/runtime`](https://github.com/40oleg/nona/tree/main/src/runtime) का रनटाइम होता है:

- **वैल्यू** 16-बाइट के टैग किए गए जोड़े हैं: undefined, null, बूलियन, binary64 नंबर, UTF-16 स्ट्रिंग, ऑब्जेक्ट, सिंबल और BigInt।
- **ऑब्जेक्ट** अपनी प्रॉपर्टी जोड़ने के क्रम में रखते हैं; 32 या उससे ज़्यादा प्रॉपर्टी वाले ऑब्जेक्ट को हैश इंडेक्स मिलता है।
- बिल्ट-इन के लिए **नेटिव कोड** एक छोटे बिल्डर (`RuntimeBuilder`) से x86-64 के रूप में बनाया जाता है।
- **JavaScript प्रील्यूड** (`*-source.ts`) लाइब्रेरी के हिस्से JavaScript में लागू करते हैं और हर एक्ज़ीक्यूटेबल में कंपाइल होते हैं: RegExp इंजन, Promise और async ड्राइवर, Proxy और Reflect हेल्पर, टाइमर और इवेंट लूप, `process`, `TextEncoder`/`TextDecoder` और Annex B बिल्ट-इन।

### गार्बेज कलेक्टर

कलेक्टर सटीक है और ऑब्जेक्ट को खिसकाता नहीं: स्पष्ट रूट (ग्लोबल, सेफ़पॉइंट पर लाइव स्टैक स्लॉट, रनटाइम रूट स्कोप) पर mark-and-sweep। जनरेटर और async फ़ंक्शन के कोरूटीन स्टैक (हर एक 1 MiB) कलेक्शन थ्रेशोल्ड में गिने जाते हैं। Linux पर हीप ब्लॉक 1 MiB के एरीना से काटी गई साइज़ क्लास से आते हैं। आंतरिक मेमोरी अनुबंध [`docs/runtime-memory.md`](https://github.com/40oleg/nona/blob/main/docs/runtime-memory.md) (रूसी में) में वर्णित है।

### एक्सेप्शन, कोरूटीन और इवेंट लूप

- एक्सेप्शन असली अनवाइंड डेटा से नेटिव फ़्रेम खोलते हैं; स्टैक ओवरफ़्लो पकड़ा जा सकने वाला `RangeError` फेंकता है।
- जनरेटर और async फ़ंक्शन अपने स्टैक पर चलते हैं और `yield` व `await` पर कॉन्टेक्स्ट बदलते हैं।
- टॉप-लेवल प्रोग्राम के बाद एंट्री इवेंट लूप चलाती है: यह Promise जॉब पूरे करता है, CPU इस्तेमाल किए बिना अगले टाइमर की प्रतीक्षा करता है और कुछ न बचने पर बाहर निकलता है ([विवरण](/hi/reference/host-apis))।

## लिंकिंग

- **PE32+** ([`src/backend/pe`](https://github.com/40oleg/nona/tree/main/src/backend/pe)): सेक्शन, इम्पोर्ट टेबल (रनटाइम के लिए KERNEL32, और FFI से घोषित DLL), बेस रीलोकेशन, अनवाइंड डेटा और रिसोर्स (आइकन, मैनिफ़ेस्ट, वर्ज़न जानकारी)।
- **ELF64** ([`src/backend/elf`](https://github.com/40oleg/nona/tree/main/src/backend/elf), [`src/backend/linux`](https://github.com/40oleg/nona/tree/main/src/backend/linux)): रनटाइम जिस भी KERNEL32 फ़ंक्शन का उपयोग करता है, उसके लिए उसी कॉलिंग कन्वेंशन वाला Linux सिस्टम-कॉल शिम है, इसलिए रनटाइम कोड दोनों टार्गेट में साझा होता है।

## FFI

`define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)')` कॉल कंपाइल के समय रिज़ॉल्व होती है: डिक्लेरेशन PE इम्पोर्ट टेबल की एक एंट्री और एक नेटिव थंक बन जाता है, जो JavaScript वैल्यू बदलता है, Win64 ABI का पालन करता है और `GetLastError` सहेजता है। Linux पर `define('syscall', '1', …)` एक रॉ सिस्टम कॉल घोषित करता है। देखें [नेटिव फ़ंक्शन (FFI)](/hi/reference/ffi)।

## रिपॉज़िटरी की संरचना

```text
src/frontend       lexer, parser, early errors, scope binding, compile-time eval/Function
src/ir             intermediate representation, lowering and liveness
src/backend/x64    x86-64 encoding and code generation
src/backend/pe     PE32+ linker: imports, relocations, unwind data, resources
src/backend/elf    ELF64 linker; src/backend/linux: system-call shims
src/runtime        native runtime and JavaScript preludes emitted into every executable
tests              unit, integration, native-execution and compatibility tests
examples           sample programs
site               this documentation site
```

## नेटिव प्लेटफ़ॉर्म

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — नेटिव प्लेटफ़ॉर्म](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.
