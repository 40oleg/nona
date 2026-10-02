# Windows एक्ज़ीक्यूटेबल

::: info अनुवाद
यह पेज अंग्रेज़ी पेज [Windows executables](/reference/windows-executables) का अनुवाद है, जो [`docs/windows-executables.md`](https://github.com/40oleg/nona/blob/main/docs/windows-executables.md) से बनता है। अंग्रेज़ी संस्करण ही प्रामाणिक है और उसमें नई जानकारी हो सकती है।
:::

## सबसिस्टम

`nona build app.js -o app.exe --subsystem windows` PE इमेज को GUI प्रोग्राम के रूप में चिह्नित करता है (optional header में Subsystem 2)। तब Windows इसे कंसोल विंडो के बिना शुरू करता है, जो बैकग्राउंड प्रोग्राम और ट्रे यूटिलिटी के लिए उपयुक्त है। डिफ़ॉल्ट `--subsystem console` (3) है। इस विकल्प के लिए `--target win32-x64` आवश्यक है।

GUI प्रोग्राम फिर भी `console.log` का आउटपुट उन स्टैंडर्ड आउटपुट हैंडल में लिखता है जो उसे विरासत में मिलते हैं (उदाहरण के लिए पैरेंट प्रोसेस द्वारा बनाए गए पाइप)। जब कोई स्टैंडर्ड आउटपुट नहीं होता — कंसोल नहीं है, हैंडल बंद या अलग (detached) है, या लिखना विफल होता है — तो आउटपुट छोड़ दिया जाता है और प्रोग्राम चलता रहता है; पुराने संस्करण exit कोड 1 के साथ समाप्त हो जाते थे।

## रिसोर्स

```text
nona build app.js -o app.exe --icon app.ico --manifest app.manifest --version-info version.json
```

- `--icon` एक `.ico` फ़ाइल की हर इमेज को जोड़ता है (`RT_ICON` 1…n और `RT_GROUP_ICON` 1); Explorer और टास्कबार उसे दिखाते हैं।
- `--manifest` एक एप्लिकेशन मैनिफ़ेस्ट जोड़ता है (`RT_MANIFEST` 1)। यह एक मान्य मैनिफ़ेस्ट होना चाहिए: ग़लत मैनिफ़ेस्ट वाले प्रोग्राम को Windows शुरू करने से मना कर देता है। `--subsystem windows` के साथ और बिना मैनिफ़ेस्ट के बने प्रोग्राम को एक डिफ़ॉल्ट मैनिफ़ेस्ट मिलता है: `asInvoker`, Windows 10/11 संगतता और per-monitor DPI awareness।
- `--version-info` एक JSON ऑब्जेक्ट पढ़ता है जिसमें `FileVersion`, `ProductVersion` (`"major.minor.build.revision"`, हिस्से 0–65535), `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName` और `Comments` में से कोई भी हो सकता है; ये फ़ाइल के Properties → Details में दिखते हैं (`RT_VERSION` 1, भाषा 0409, कोड पेज 04B0)।

```json
{ "FileVersion": "1.0.0.0", "ProductName": "Museum", "FileDescription": "Paintings on the desktop", "CompanyName": "Oleg" }
```

यही विकल्प `compile()` में `icon` (बाइट्स), `manifest` (स्ट्रिंग) और `versionInfo` (ऑब्जेक्ट) के रूप में उपलब्ध हैं। इनके लिए `--target win32-x64` आवश्यक है।
