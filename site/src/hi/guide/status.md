# स्थिति और रोडमैप

## मौजूदा रिलीज़

**v0.29.0** — देखें [चेंजलॉग](/changelog) (अंग्रेज़ी में)। Nona प्रयोगात्मक है: इसका सुरक्षा ऑडिट नहीं हुआ है और यह Node.js का सीधा विकल्प नहीं है।

## Test262 ऑडिट

पिन किया गया पिछला पूरा Test262 ऑडिट, Windows x64 पर v0.8.0 के लिए (`scripts/test262-audit.ps1 -Unit`, ES2020 और उससे पहले के फ़ीचर, साथ में समर्थित बाद के फ़ीचर जैसे ES2022 क्लास एलिमेंट):

| डायरेक्टरी                  | पास / लागू                      | बचे फ़ेल्योर                         |
| --------------------------- | ------------------------------- | ------------------------------------ |
| `language/`                 | **22436 / 22492** (26 छोड़े गए) | 44 `eval`, 1 नई सिमैंटिक्स, 11 अन्य  |
| `built-ins/`                | **15868 / 15933**               | 16 `eval`, 12 नई सिमैंटिक्स, 37 अन्य |
| `built-ins/Atomics` (एजेंट) | **268 / 268**                   | —                                    |
| `annexB/`                   | **996 / 1016** (8 छोड़े गए)     | 20 `eval`                            |

वर्गीकरण `scripts/test262-summary.mjs` से आता है: "`eval`" टेस्ट ऐसे सोर्स टेक्स्ट के साथ `eval` या `$262.evalScript` कॉल करते हैं जिसे Nona कंपाइल के समय नहीं जान सकता; "नई सिमैंटिक्स" वाले टेस्ट पुराने या ग़ायब फ़ीचर टैग के तहत बाद के संस्करणों का व्यवहार (`v` फ़्लैग, न्यूमेरिक सेपरेटर, `Promise.any`, …) जाँचते हैं। यूनिट सूट CI में Windows और Linux पर चलता है और असली PE व ELF फ़ाइलें कंपाइल करके चलाता है, जिनमें से कई GC स्ट्रेस के तहत चलती हैं। ऑडिट कैसे चलाएँ, यह [Test262](/hi/reference/test262) पेज पर बताया गया है।

## कॉपी करने वाली ऐरे विधियाँ

ऑडिट के बाद पिन किए गए Test262 संस्करण पर जाँच (Windows x64, [#308](https://github.com/40oleg/nona/issues/308)): `built-ins/Array/prototype/{toSorted,toReversed,toSpliced,with}` और `Symbol.unscopables` 94 में से 94 पास हुए, कोई शेष विफलता नहीं। `%TypedArray%` रूप लागू नहीं हैं; देखें [Test262 बेसलाइन](https://github.com/40oleg/nona/blob/main/docs/test262.md) (अंग्रेज़ी में)।

## बचे फ़ेल्योर

ये v0.8.0 ऑडिट के फ़ेल्योर हैं; बाद की रिलीज़ में पूरा रन दोहराया नहीं गया। Windows पर सभी "अन्य" फ़ेल्योर वर्गीकृत हैं:

- `built-ins/Function` (26): फ़ंक्शन का सोर्स रनटाइम पर ऑब्जेक्ट के `toString` से आता है — यह `eval` वाला अपवाद है।
- `AsyncFunction`, `AsyncGeneratorFunction` और `GeneratorFunction` के लिए `is-a-constructor`, और async arrow का `prototype` टेस्ट (4): Test262 हार्नेस रनटाइम पर सोर्स टेक्स्ट बनाता है।
- दूसरे realm (8): दूसरे realm के डिफ़ॉल्ट प्रोटोटाइप ([#7](https://github.com/40oleg/nona/issues/7), ऑडिट के बाद बंद)।
- `Function` से बनाई गई क्लास, दूसरे realm में भी (10, `language/expressions/class`): रनटाइम पर बना सोर्स टेक्स्ट। `eval` उपनाम वाले वही टेस्ट `eval` फ़ेल्योर में गिने जाते हैं।

v0.8.0 के ऑडिट में सात क्रैश भी मिले (`Math` पर एलिमेंट के साथ `Array.prototype.indexOf`, टाइप्ड ऐरे की इनहेरिटेड और अपनी कुंजियाँ), जो डेंस एलिमेंट के साथ आए थे; वे [#119](https://github.com/40oleg/nona/issues/119) में ठीक हुए, और सुधार के बाद `built-ins/Array` तथा `built-ins/TypedArrayConstructors` का दोबारा रन (ऊपर शामिल) उन्हें पास करता है।

## खुला काम

भाषा और लाइब्रेरी की कमियाँ:

- [#44](https://github.com/40oleg/nona/issues/44) — Promise रिएक्शन: समर्पित promise प्रकार और हर `then` के लिए एक रिकॉर्ड।

प्रदर्शन, [रोडमैप](https://github.com/40oleg/nona/blob/main/docs/roadmap.md) की मुख्य दिशा:

- कॉल और आवंटन: [#47](https://github.com/40oleg/nona/issues/47) (कॉल ओवरहेड), [#48](https://github.com/40oleg/nona/issues/48) (अल्पजीवी ऑब्जेक्ट), [#235](https://github.com/40oleg/nona/issues/235) (इनलाइनिंग), [#236](https://github.com/40oleg/nona/issues/236) (स्केलर रिप्लेसमेंट)।
- जनरेट किया गया कोड: [#237](https://github.com/40oleg/nona/issues/237)–[#242](https://github.com/40oleg/nona/issues/242) (ऑप्शनल चेनिंग, `%`, सीधी कॉल, typed-array लूप, `switch` जंप टेबल, डेड-ज़ोन जाँचें)।
- लाइब्रेरी: [#155](https://github.com/40oleg/nona/issues/155) (`JSON.stringify`), [#258](https://github.com/40oleg/nona/issues/258) (RegExp स्टार्ट स्कैन), [#262](https://github.com/40oleg/nona/issues/262) (बड़े ऐरे पर `shift` और `splice`)।

पूरी सूची [GitHub](https://github.com/40oleg/nona/issues) पर है।

## विस्तृत रिपोर्ट

- [0.17–0.20 के लिए ES2020 स्थिति](https://github.com/40oleg/nona/blob/main/docs/status.md) (रूसी में)
- [रिलीज़ इतिहास](/changelog) और [डेवलपमेंट लॉग](https://github.com/40oleg/nona/blob/main/docs/history/development-log.md) (रूसी में)
- [रोडमैप: V8 से प्रेरित योजना और लक्ष्य आर्किटेक्चर (अंग्रेज़ी में)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [रिलीज़ रोडमैप 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/history/release-roadmap-0.4-0.20.md) (रूसी में)
