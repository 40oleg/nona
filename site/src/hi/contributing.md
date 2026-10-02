# योगदान

## डेवलपमेंट सेटअप

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run check            # build and run the unit suite
npm run compare          # compile examples/compat and compare with Node.js
npm run compare:linux    # the same for linux-x64
npm run test262:smoke    # a quick pinned Test262 subset
```

टेस्ट सूट असली एक्ज़ीक्यूटेबल कंपाइल करके चलाता है: PE टेस्ट Windows पर और ELF टेस्ट Linux पर चलते हैं, उनमें से कई GC स्ट्रेस के तहत। CI (`.github/workflows/check.yml`) पूरा सूट और Test262 समूह Windows पर Node.js 26 के साथ चलाता है, और नेटिव टेस्ट Linux पर। पूरे Test262 ऑडिट का विवरण [Test262](/hi/reference/test262) पेज पर है।

## काम करने का तरीका

- हर बदलाव एक GitHub issue से शुरू होता है, जिसमें प्रेरणा, प्रस्ताव और स्वीकृति मानदंड (acceptance criteria) होते हैं।
- एक issue — एक ब्रांच (`issue-<number>-<short-slug>`) — एक pull request; उसके विवरण में `Closes #N`, डिज़ाइन, टेस्ट कैसे किया गया और ज्ञात सीमाएँ होती हैं।
- `main` को हरा रखें: pull request तभी मर्ज होता है जब `check` workflow पास हो।
- Issues, pull requests, कमिट संदेश, कोड टिप्पणियाँ और दस्तावेज़ अंग्रेज़ी में लिखे जाते हैं।

## टेस्ट

टेस्ट `tests/*.test.ts` में रहते हैं। Node.js oracle (`runOracle`) के साथ `runOnHost` को प्राथमिकता दें: तब वही टेस्ट दोनों टार्गेट पर, GC स्ट्रेस के तहत चलता है और प्रोग्राम के आउटपुट की तुलना Node.js से करता है।

## कोड कन्वेंशन

- कंपाइलर TypeScript (`src/`) में है। रनटाइम कोड `RuntimeBuilder` (`src/runtime/*.ts`) के ज़रिए x86-64 के रूप में उत्पन्न होता है या JavaScript प्रील्यूड (`src/runtime/*-source.ts`) के रूप में लिखा जाता है, जो हर एक्ज़ीक्यूटेबल में कंपाइल होते हैं।
- प्रील्यूड टॉप-लेवल `var` बाइंडिंग नहीं जोड़ सकते; कोड को IIFE में लपेटें।
- नेटिव रनटाइम फ़ंक्शन Win64 ABI का पालन करते हैं (shadow space, कॉल पर 16-बाइट एलाइनमेंट, callee-saved रजिस्टर)। जो फ़ंक्शन ऐसी कॉल के पार वैल्यू रखते हैं जो मेमोरी आवंटित कर सकती हैं, वे `rootedFn` का उपयोग करते हैं।
- हर नए KERNEL32 इम्पोर्ट के लिए `src/backend/linux/shims.ts` में Linux सिस्टम-कॉल शिम चाहिए।
- बनाए गए एक्ज़ीक्यूटेबल बाहरी निर्भरताओं से मुक्त रहते हैं: न libc, न C टूलचेन, न साथ में भेजी गई DLL।

## दस्तावेज़

जब कोई फ़ीचर प्रोग्राम को दिखने वाला व्यवहार बदलता है, तो अपडेट करें:

- `README.md` और `README.ru.md`;
- `docs/` में संदर्भ दस्तावेज़ (`host-apis.md`, `process.md`, `fs.md`, `ffi.md`, `windows-executables.md`, `test262.md`) — साइट इन फ़ाइलों को अपने आप शामिल करती है;
- `site/src/` में वे साइट पेज जो फ़ीचर का वर्णन करते हैं, जैसे [भाषा समर्थन](/hi/guide/language-support) या [कमांड लाइन](/hi/reference/cli) पेज;
- `CHANGELOG.md` में `## Unreleased` के नीचे, issue के लिंक के साथ।

## दस्तावेज़ीकरण साइट

साइट `site/` से [VitePress](https://vitepress.dev) के साथ बनती है:

```sh
npm run build              # the compiler, needed to check the samples
cd site
npm ci
npm run dev                # local server with live reload
npm run build              # production build; fails on broken internal links
npm run check:samples      # compiles every program in site/samples
```

चलाने योग्य उदाहरण `site/samples/` की फ़ाइलें हैं, जिन्हें `<<<` से शामिल किया जाता है; नाम में `.win32.` या `.linux.` होने पर सैंपल उसी टार्गेट तक सीमित रहता है। नया पेज जोड़ने का तरीका `site/README.md` में बताया गया है। साइट `.github/workflows/pages.yml` द्वारा `main` से GitHub Pages पर प्रकाशित होती है।

साइट कई भाषाओं में अनूदित है। अंग्रेज़ी पेज ही स्रोत हैं; अनुवाद `site/src/<locale>/` में रहते हैं। जब कोई अंग्रेज़ी पेज बदले, तो अनुवाद अपडेट करें या कम से कम यह सुनिश्चित करें कि वे उससे विरोधाभासी न हों।

## स्वचालित योगदानकर्ता

एजेंटों के नियम — `blocked` लेबल से issue लेना, कमिट का लेखकत्व और pull request की चेकलिस्ट — [`AGENTS.md`](https://github.com/40oleg/nona/blob/main/AGENTS.md) में हैं।
