# स्थिति और रोडमैप

## मौजूदा रिलीज़

**v0.10.0** — देखें [चेंजलॉग](/changelog) (अंग्रेज़ी में)। Nona प्रयोगात्मक है: इसका सुरक्षा ऑडिट नहीं हुआ है और यह Node.js का सीधा विकल्प नहीं है।

## Test262 ऑडिट

Windows x64 पर पिन किया गया पूरा Test262 (`scripts/test262-audit.ps1 -Unit`, ES2020 और उससे पहले के फ़ीचर):

| डायरेक्टरी | पास / लागू | बचे फ़ेल्योर |
| --- | --- | --- |
| `language/` | **22436 / 22492** (26 छोड़े गए) | 44 `eval`, 1 नई सिमैंटिक्स, 11 अन्य |
| `built-ins/` | **15868 / 15933** | 16 `eval`, 12 नई सिमैंटिक्स, 37 अन्य |
| `built-ins/Atomics` (एजेंट) | **268 / 268** | — |
| `annexB/` | **996 / 1016** (8 छोड़े गए) | 20 `eval` |

वर्गीकरण `scripts/test262-summary.mjs` से आता है: "`eval`" टेस्ट ऐसे सोर्स टेक्स्ट के साथ `eval` या `$262.evalScript` कॉल करते हैं जिसे Nona कंपाइल के समय नहीं जान सकता; "नई सिमैंटिक्स" वाले टेस्ट पुराने या ग़ायब फ़ीचर टैग के तहत बाद के संस्करणों का व्यवहार (`v` फ़्लैग, न्यूमेरिक सेपरेटर, `Promise.any`, …) जाँचते हैं। यूनिट सूट CI में Windows और Linux पर चलता है और असली PE व ELF फ़ाइलें कंपाइल करके चलाता है, जिनमें से कई GC स्ट्रेस के तहत चलती हैं। ऑडिट कैसे चलाएँ, यह [Test262](/hi/reference/test262) पेज पर बताया गया है।

## बचे फ़ेल्योर

Windows पर सभी "अन्य" फ़ेल्योर वर्गीकृत हैं:

- `built-ins/Function` (25): फ़ंक्शन का सोर्स रनटाइम पर ऑब्जेक्ट के `toString` से आता है — यह `eval` वाला अपवाद है।
- `AsyncFunction`, `AsyncGeneratorFunction` और `GeneratorFunction` के लिए `is-a-constructor` (4): Test262 हार्नेस रनटाइम पर सोर्स टेक्स्ट बनाता है।
- दूसरे realm (7): दूसरे realm के डिफ़ॉल्ट प्रोटोटाइप ([#7](https://github.com/40oleg/nona/issues/7))।
- नॉन-एक्सटेंसिबल ऑब्जेक्ट पर प्राइवेट क्लास फ़ील्ड (2): नए फ़ीचर टैग के बिना ES2022 प्राइवेट फ़ील्ड।

## खुला काम

- [#11](https://github.com/40oleg/nona/issues/11) — रनटाइम पर बने सोर्स के साथ `eval` और `Function`।
- [#7](https://github.com/40oleg/nona/issues/7) — प्रील्यूड कंस्ट्रक्टर के लिए दूसरे realm के डिफ़ॉल्ट प्रोटोटाइप।
- [#13](https://github.com/40oleg/nona/issues/13), [#36](https://github.com/40oleg/nona/issues/36) — डेंस ऐरे एलिमेंट और `Map`/`Set` के लिए हैश टेबल।

पूरी सूची [GitHub](https://github.com/40oleg/nona/issues) पर है।

## विस्तृत रिपोर्ट

- [0.17–0.20 के लिए ES2020 स्थिति](https://github.com/40oleg/nona/blob/main/docs/v0.17-v0.20-status.md) (रूसी में)
- [v0.6 स्थिति](https://github.com/40oleg/nona/blob/main/docs/v0.6-status.md) (अंग्रेज़ी में)
- [रोडमैप: V8 से प्रेरित योजना और लक्ष्य आर्किटेक्चर (अंग्रेज़ी में)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [रिलीज़ रोडमैप 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/release-roadmap-0.4-0.20.md) (रूसी में)
