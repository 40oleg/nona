# Test262 बेसलाइन

::: info अनुवाद
यह पेज अंग्रेज़ी पेज [Test262 baseline](/reference/test262) का अनुवाद है, जो [`docs/test262.md`](https://github.com/40oleg/nona/blob/main/docs/test262.md) से बनता है। अंग्रेज़ी संस्करण ही प्रामाणिक है और उसमें नई जानकारी हो सकती है।
:::

रनर अपस्ट्रीम Test262 के रिविज़न `7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd` का उपयोग करता है। Test262 को जानबूझकर इस रिपॉज़िटरी में शामिल (vendor) नहीं किया गया है। Windows x64 पर:

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/tc39/test262.git work/test262
git -C work/test262 sparse-checkout set harness test/language/expressions/coalesce test/language/expressions/arrow-function test/language/expressions/array test/language/expressions/call test/language/expressions/new test/language/expressions/template-literal test/language/rest-parameters test/language/statements/function test/language/statements/for-in test/language/statements/for-of test/built-ins/Symbol test/built-ins/Array/prototype/includes test/built-ins/Array/prototype/pop test/built-ins/Math/pow test/built-ins/Math/min test/built-ins/Math/max test/built-ins/Math/abs test/built-ins/Math/sign test/built-ins/Math/sqrt test/built-ins/Math/trunc test/built-ins/Math/floor test/built-ins/Math/ceil test/built-ins/Math/round test/built-ins/String/prototype/includes test/built-ins/Number/isFinite test/built-ins/Number/isInteger test/built-ins/Number/isNaN test/built-ins/Number/isSafeInteger
git -C work/test262 rev-parse HEAD
git -C work/test262 sparse-checkout add test/built-ins/Math/imul test/built-ins/Math/clz32
npm ci
npm run test262:smoke
node scripts/test262-smoke.mjs language/expressions/coalesce
```

यही रनर Linux x64 पर भी काम करता है: तब यह PE फ़ाइलों के बजाय `linux-x64` ELF इमेज कंपाइल करता है और Linux पर worker threads से होने वाली क्षणिक `ETXTBSY` exec रेस को दोबारा आज़माता है। हर कंपाइल की गई टेस्ट इमेज को चलने के बाद हटाने के लिए `TEST262_DELETE_BINARIES=1` सेट करें; वरना बड़े कैटलॉग `work/test262-smoke` में कई गीगाबाइट छोड़ जाते हैं।

चेकआउट पिन किए गए रिविज़न पर होना चाहिए। अगर अपस्ट्रीम HEAD आगे बढ़ गया है, तो चलाने से पहले ठीक उसी कमिट को fetch/checkout करें। `TEST262_ROOT` एक अलग चेकआउट चुनता है और `TEST262_REPORT` JSON रिपोर्ट का अलग पाथ। `TEST262_JOBS` अधिकतम आठ worker threads समानांतर चलाता है (डिफ़ॉल्ट एक) और रिपोर्ट का क्रम बनाए रखता है। उदाहरण के लिए, बड़े कैटलॉग रन से पहले `TEST262_JOBS=4` सेट करें। `TEST262_PATH_FILTER` मेल खाने वाले पाथ शामिल करता है; `TEST262_EXCLUDE_PATH_FILTER` मेल खाने वाले पाथ छोड़ देता है। दोनों शाब्दिक सबस्ट्रिंग फ़िल्टर हैं। बिना आर्ग्युमेंट वाली कमांड `tests/test262-smoke.json` में समीक्षित मैनिफ़ेस्ट चलाती है; रिलेटिव डायरेक्टरी आर्ग्युमेंट उस Test262 समूह के नीचे की हर `.js` फ़ाइल चलाता है। रिपोर्ट कंपाइल विफलताओं, रनटाइम विफलताओं और स्किप को अलग-अलग दिखाती हैं।

## पूर्ण ऑडिट

`scripts/test262-audit.ps1` (Windows) और `scripts/test262-audit.sh` (Linux) `language/`, `annexB/` और `built-ins/` के नीचे की हर Test262 डायरेक्टरी को `TEST262_EXCLUDE_FEATURES=post-es2020` के साथ चलाते हैं, `work/test262-audit` में हर डायरेक्टरी के लिए एक रिपोर्ट (फिर से शुरू किया जा सकता है)। `-Dirs 'a,b' -Tag r1` (PowerShell) या `TAG=r1 scripts/test262-audit.sh <out> a b` चुनी गई डायरेक्टरी को एक उप-डायरेक्टरी में फिर से चलाता है, जिसके परिणाम पूर्ण रन के परिणामों की जगह लेते हैं। सारांश और वर्गीकरण:

```
node scripts/test262-summary.mjs work/test262-audit --others work/others.txt
node scripts/test262-summary.mjs work/test262-audit --compare work/previous-audit
```

सारांश हर विफलता को `eval` (टेस्ट eval का उपयोग करता है; कंपाइल-टाइम eval सोर्स के साथ ये ज़्यादातर रनटाइम सोर्स, `$262.evalScript` या दूसरे realm होते हैं), `post` (पुराने या अनुपस्थित फ़ीचर टैग के तहत ES2020 के बाद की सिमेंटिक्स) या `other` में वर्गीकृत करता है, और `other` फ़ाइलों की सूची देता है (`--evals <file>` eval वाली फ़ाइलों की सूची देता है)। `TEST262_FILE_LIST=<file>` `scripts/test262-smoke.mjs <group>` के रन को सूचीबद्ध पाथ तक सीमित करता है, उदाहरण के लिए ऐसी सूची को फिर से चलाने के लिए। git मेटाडेटा के बिना चेकआउट (उदाहरण के लिए किसी दूसरी मशीन पर कॉपी किया गया) तब स्वीकार होता है जब `work/test262/.nona-test262-revision` में पिन किया गया कमिट हैश हो; तब line terminator टेस्ट फ़ाइलों को सीधे पढ़ते हैं।

## पिन किए गए Test262 में ES2020 से नई सिमेंटिक्स {#semantics-newer-than-es2020-in-the-pinned-test262}

पिन किया गया Test262 (2026) कभी-कभी ES2020 के बाद आए व्यवहार की जाँच बिना post-ES2020 फ़ीचर टैग के करता है। नीति (issue #17): जहाँ बाद के संस्करण ने केवल ES2020 की कोई दिखाई देने वाली विचित्रता हटाई है जिस पर प्रोग्राम निर्भर नहीं होते, वहाँ Nona पिन किए गए Test262 का पालन करता है; बाकी सब ES2020 पर रहता है और `scripts/test262-summary.mjs` द्वारा `post` के रूप में वर्गीकृत होता है या ज्ञात विचलन के रूप में सूचीबद्ध होता है। Test262 का पालन:

- TypedArray `[[Set]]`, `[[GetOwnProperty]]` और `[[DefineOwnProperty]]` (ES2021/ES2022): मान पहले बदला जाता है; फिर अमान्य इंडेक्स या detached बफ़र लिखने को अनदेखा करता है और सफलता बताता है; detached बफ़र के अपने एलिमेंट नहीं होते; TypedArray के अलावा किसी Receiver के साथ अमान्य इंडेक्स का कोई प्रभाव नहीं होता और मान्य इंडेक्स Receiver पर OrdinarySet होता है।
- `String.prototype.{replace,split,match,matchAll,search}` प्रिमिटिव आर्ग्युमेंट पर Symbol-key वाले मेथड नहीं खोजते (ES2025)।
- Annex B के call-expression असाइनमेंट टार्गेट sloppy कोड में रनटाइम पर ReferenceError फेंकते हैं और strict कोड में early error होते हैं (ES2022 web reality)।

ES2020 पर रखा गया (विफलताएँ `post` के रूप में वर्गीकृत): class fields और private methods, numeric separators, logical assignment, `Promise.any`/`AggregateError`, `Error.prototype.stack`/`cause`, RegExp `v` फ़्लैग और match indices, top-level await, और `postEs2020Features` में अन्य फ़ीचर। बाकी ज्ञात विचलन हर कैटलॉग के लिए `docs/pr5-es2020-remaining-work.md` और रिलीज़ स्थिति में सूचीबद्ध हैं।

ES2020 गेट के लिए रनर में जोड़े गए फ़ीचर (2026-09):

- `TEST262_TARGET=linux-x64` (Linux पर डिफ़ॉल्ट) ELF इमेज लिंक करता है; मॉड्यूल टेस्ट (`flags: [module]`) एक मॉड्यूल ग्राफ़ के रूप में कंपाइल होते हैं, जिसमें हार्नेस एक क्लासिक स्क्रिप्ट प्रील्यूड होता है; रिज़ॉल्यूशन-नेगेटिव मॉड्यूल टेस्ट कंपाइल एरर की अपेक्षा करते हैं।
- `TEST262_EXCLUDE_FEATURES=post-es2020` ES2020 के बाद आए फ़ीचर टैग की सूची में फैलता है (स्क्रिप्ट में `postEs2020Features` देखें), साथ में `error-stack-accessor` और ग़ैर-मानक `caller` एक्सटेंशन।
- `$262.createRealm` तब कंपाइल किया जाता है जब टेस्ट उसका ज़िक्र करता है (अधिकतम तीन realm); `$262.agent` प्रोग्राम स्टैटिक टेम्पलेट से निकाले जाते हैं (लूप काउंटर, टॉप-लेवल कॉन्स्टेंट और `$262.agent.timeouts` फ़ोल्ड किए जाते हैं) और इमेज में agent थ्रेड के रूप में कंपाइल होते हैं। `CanBlockIsFalse` टेस्ट छोड़ दिए जाते हैं क्योंकि मुख्य agent ब्लॉक कर सकता है।
- Computed `import()` स्पेसिफ़ायर टेस्ट के सोर्स में नामित `_FIXTURE.js` फ़ाइलें लोड कर सकते हैं (`ModuleHost.candidates`)।
- कंपाइलर एक्सेप्शन रन रोकने के बजाय उस फ़ाइल की विफलता (`phase: compiler-crash`) के रूप में रिपोर्ट होता है।

यह एक **बेसलाइन एडाप्टर** है, पूरा Test262 हार्नेस नहीं: raw और रनटाइम-नेगेटिव टेस्ट फ़िलहाल कारणों के साथ छोड़े जाते हैं। पार्स-नेगेटिव टेस्ट तब पास होते हैं जब Nona सोर्स को कंपाइलर डायग्नोस्टिक के साथ अस्वीकार करता है; एडाप्टर अभी डायग्नोस्टिक टाइप की समतुल्यता नहीं जाँचता। यह पॉज़िटिव स्क्रिप्ट टेस्ट को मानक `sta.js`/`assert.js` हार्नेस और घोषित `includes` के साथ चलाता है। अनुरूपता (conformance) का दावा करने से पहले एडाप्टर को सभी लागू मेटाडेटा मोड और strict/sloppy दोनों वैरिएंट का समर्थन करना होगा, फिर सभी लागू समूह चलाने होंगे। इस चरण में रिपॉज़िटरी के सामान्य नेटिव टेस्ट ही मुख्य रिग्रेशन गेट बने रहते हैं। टेस्ट और oracle को `package.json` के अनुसार Node 26 के साथ चलाएँ; Node 22 फ़ंक्शन मेटाडेटा में दिखाई देने वाले अंतर रखता है और जब कोई टेस्ट अपने ग्लोबल ऑब्जेक्ट को seal करता है तो विफल हो सकता है।

2026-09-26 के पॉज़िटिव रनटाइम स्मोक मैनिफ़ेस्ट में डिफ़ॉल्ट पैरामीटर और spread के मामले शामिल हैं; इसकी वर्तमान संख्याएँ डेवलपमेंट लॉग में दर्ज हैं। पिन किए गए रिविज़न पर व्यापक raw समूहों में `built-ins/Symbol` के लिए 72 पास / 26 फ़ेल, `language/statements/for-in` के लिए 85 पास / 34 फ़ेल, और `language/statements/for-of` के लिए 142 पास / 607 फ़ेल / 2 स्किप हैं। इन समूहों में लागू सबसेट से बाहर के मामले और ES2020 के बाद जोड़े गए मामले शामिल हैं; raw संख्याएँ निदान के लिए हैं, ES2020 अनुरूपता प्रतिशत नहीं। `built-ins/Array/prototype/includes` में 26 पास / 4 फ़ेल / 0 स्किप हैं; विफल मामले Proxy या resizable ArrayBuffer का उपयोग करते हैं। ES2020 Math कॉन्स्टेंट जोड़ने के बाद `built-ins/Math/pow` में 28 पास / 0 फ़ेल / 0 स्किप हैं। `built-ins/Math/min` और `built-ins/Math/max` में से हर एक में 10 पास / 0 फ़ेल / 0 स्किप हैं, जिसमें हर आर्ग्युमेंट का रूपांतरण और signed zero का क्रम शामिल है। `built-ins/String/prototype/includes` में 25 पास / 2 फ़ेल / 0 स्किप हैं; विफल मामलों में RegExp लिटरल हैं, जो अभी समर्थित नहीं हैं। `built-ins/String/prototype/padStart` और `padEnd` में से हर एक में 13 पास / 0 फ़ेल / 0 स्किप हैं, जिसमें रूपांतरण क्रम और डिस्क्रिप्टर जाँच शामिल है। `built-ins/String/prototype/indexOf` में 44 पास / 3 फ़ेल / 0 स्किप हैं; बाकी मामले `eval` या BigInt पर निर्भर हैं। `built-ins/String/prototype/lastIndexOf` में 25 पास / 0 फ़ेल / 0 स्किप हैं। `built-ins/String/fromCharCode` में 16 पास / 1 फ़ेल / 0 स्किप हैं; बाकी मामले को BigInt चाहिए। ग्लोबल `isNaN` जोड़ने के बाद `built-ins/Array/prototype/indexOf` में 193 पास / 8 फ़ेल / 0 स्किप हैं, और `lastIndexOf` में 189 पास / 9 फ़ेल / 0 स्किप। बाकी मामले Date, RegExp, JSON, Proxy, resizable buffers/typed arrays या `eval` का उपयोग करते हैं। ग्लोबल `isFinite` में 15 पास / 0 फ़ेल / 0 स्किप हैं। ग्लोबल `isNaN` में 14 पास / 1 फ़ेल / 0 स्किप हैं; बाकी मामला अपने टेस्ट हार्नेस बॉडी में `Array.prototype.forEach` का उपयोग करता है। ES2020 Number कॉन्स्टेंट जोड़ने के बाद `built-ins/Array/prototype/pop` में 23 पास / 0 फ़ेल / 0 स्किप हैं। चार `Number.isFinite/isInteger/isNaN/isSafeInteger` समूह क्रमशः 8/9/7/10 पास करते हैं, बिना किसी विफलता या स्किप के। डीस्ट्रक्चरिंग पैरामीटर और class मेथड के बाद `language/rest-parameters` में 11 पास / 0 फ़ेल / 0 स्किप हैं। डिफ़ॉल्ट पैरामीटर समर्थन के बाद `language/expressions/arrow-function` में 147 पास / 196 फ़ेल / 0 स्किप हैं; उस समूह के सभी 9 `dflt-params` मामले पास होते हैं। ऐरे और ऑब्जेक्ट लिटरल spread के साथ `language/expressions/array` में 50 पास / 2 फ़ेल / 0 स्किप हैं। बाकी दो मामलों को जनरेटर चाहिए। कॉल और कंस्ट्रक्शन spread के साथ `language/expressions/call` में 72 पास / 20 फ़ेल / 0 स्किप और `language/expressions/new` में 54 पास / 5 फ़ेल / 0 स्किप हैं। `spread-*` मामलों में से हर समूह में केवल दो कंपाइल नहीं होते, क्योंकि उन्हें जनरेटर चाहिए। समूहों की अन्य विफलताएँ असंबंधित असमर्थित फ़ीचर से जुड़ी हैं, जिनमें `eval` शामिल है। `Math.abs/sign/sqrt/trunc/floor/ceil/round` समूह क्रमशः 8/5/10/12/11/11/11 टेस्ट पास करते हैं, बिना किसी विफलता या स्किप के। `Math.imul` और `Math.clz32` समूह क्रमशः 5/5 और 10/10 पास करते हैं। ऐरे और ऑब्जेक्ट बाइंडिंग पैटर्न के बाद तीन डिक्लेरेशन समूह `language/statements/variable/dstr`, `let/dstr` और `const/dstr` क्रमशः 79/97, 77/93 और 77/93 मामले पास करते हैं। हर बाकी मामला कंपाइल नहीं होता क्योंकि वह जनरेटर या class का उपयोग करता है। ये चुने हुए Test262 समूह हैं, ES2020 अनुरूपता प्रतिशत नहीं। `language/destructuring/binding/syntax` में 12 पास / 2 फ़ेल हैं; दोनों बाकी मामलों को जनरेटर और async सिंटैक्स चाहिए। `language/expressions/assignment/dstr` में 323 पास / 45 कंपाइल विफलताएँ / 0 रनटाइम विफलताएँ हैं; उन कंपाइल विफलताओं को जनरेटर या class चाहिए। चुने हुए class समूह `language/statements/class/method` और `method-static` में से हर एक 20/20 पास करता है। `language/statements/class/definition` में 46 पास / 17 कंपाइल विफलताएँ / 2 स्किप हैं; बाकी मामलों को वर्तमान class सबसेट से बाहर का सिंटैक्स चाहिए, जिसमें जनरेटर और async मेथड शामिल हैं।

2026-09-25 को `language/expressions/coalesce` समूह ने 21 पास, 3 फ़ेल, 0 स्किप दिए। एक विफलता को अनुपस्थित `Symbol` टाइप चाहिए; दो strict कोड में proper tail calls का परीक्षण करती हैं और नेटिव स्टैक को ओवरफ़्लो करती हैं। चार पार्स-नेगेटिव मामले कंपाइलर द्वारा अस्वीकार किए जाने से पास हुए। ये ट्रैक की जा रही अनुपस्थित क्षमताएँ हैं, इस बात का प्रमाण नहीं कि `??` आम तौर पर टूटा हुआ है।

2026-09-26 को पिन किए गए पूरे `built-ins/parseInt` और `built-ins/parseFloat` समूह 55/55 और 54/54 पास हुए। पहले पूर्ण `built-ins/Array` रन में 3082 में से 2632 पास, 360 फ़ेल, 90 स्किप थे; सभी 90 स्किप `Array.fromAsync` टेस्ट हैं (ES2020 के बाद का API); इसने एक iterator completion बग और पाँच sparse-array टाइमआउट उजागर किए, जिन्हें बाद में ठीक कर दिया गया। दोहराए गए पूर्ण Array रन में 2640 पास, 352 फ़ेल, 90 स्किप हैं। हर बाकी विफलता की एक दर्ज पूर्व-शर्त [v0.4 की स्थगन सूची](https://github.com/40oleg/nona/blob/main/docs/v0.4-array-deferred.json) में है: ES2020 के बाद के API के 150 मामले, resizable-buffer के 72 मामले, और अन्य भविष्य की निर्भरताओं या दस्तावेज़ित `eval` अपवाद के 130 मामले। पॉज़िटिव मैनिफ़ेस्ट 100/100 पास करता है।

v0.4.0 के बाद पूरा `built-ins/String/fromCodePoint` समूह 11/11 पास करता है। एक मामला पिन किए गए स्मोक मैनिफ़ेस्ट में रखा गया है; उस चेकपॉइंट पर मैनिफ़ेस्ट 101/101 पास हुआ।

पूरा `built-ins/String/raw` समूह 30/30 पास करता है। इसका tagged-template मामला पिन किए गए पॉज़िटिव स्मोक मैनिफ़ेस्ट में शामिल है। अपडेट किया गया मैनिफ़ेस्ट 102/102 पास करता है; Windows और Linux के संगत उदाहरण दोनों 54/54 पास करते हैं।

पूरा `built-ins/String/prototype/concat` समूह 22/22 पास करता है। एक मामला पॉज़िटिव स्मोक मैनिफ़ेस्ट में शामिल है। अपडेट किया गया मैनिफ़ेस्ट 103/103 पास करता है; Windows और Linux के संगत उदाहरण दोनों 55/55 पास करते हैं।

`built-ins/String/prototype/toUpperCase` समूह में 24 पास / 2 फ़ेल / 0 स्किप हैं। दोनों विफलताओं को `RegExp` और direct `eval` चाहिए, जो दोनों v0.5 के बाहर ट्रैक किए जाते हैं। Unicode special-casing मामला पॉज़िटिव स्मोक मैनिफ़ेस्ट में है, जो अब 104/104 है। Windows और Linux के संगत उदाहरण दोनों 56/56 पास करते हैं।

`built-ins/String/prototype/toLowerCase` समूह में 28 पास / 2 फ़ेल / 0 स्किप हैं। इसकी दोनों विफलताओं को भी `RegExp` और direct `eval` चाहिए। Final Sigma की सशर्त मैपिंग, `Case_Ignorable` अक्षरों सहित, पास होती है। पॉज़िटिव स्मोक मैनिफ़ेस्ट 105/105 है; संगत उदाहरण Windows और Linux पर 57/57 हैं।

पूरे `built-ins/Number/prototype/toFixed` समूह में 15 पास / 1 फ़ेल / 0 स्किप हैं। विफल मामला BigInt का उपयोग करता है, जो v0.8 के लिए निर्धारित है। सटीकता वाला मामला पॉज़िटिव स्मोक मैनिफ़ेस्ट में है, जो अब 106/106 है; संगत उदाहरण Windows और Linux पर 58/58 पास करते हैं।

पूरे `built-ins/Number/prototype/toExponential` और `built-ins/Number/prototype/toPrecision` समूह 15/15 और 17/17 पास करते हैं। उनके सामान्य-मान वाले मामले पॉज़िटिव स्मोक मैनिफ़ेस्ट में हैं, जो अब 108/108 है। संगत उदाहरण Windows और Linux पर 59/59 पास करते हैं।

त्रिकोणमितीय फ़ंक्शन जोड़ने से पहले के पहले पूर्ण `built-ins/Math` रन में 327 में से 176 पास / 151 फ़ेल थे। ज़्यादातर विफलताएँ अनुपस्थित ES2020 transcendental फ़ंक्शन हैं; `f16round` और `sumPrecise` बाद के API हैं। पूरे `Math.sin`, `Math.cos` और `Math.tan` समूह अब 8/8, 9/9 और 9/9 पास करते हैं। पॉज़िटिव स्मोक 111/111 है; संगत उदाहरण Windows और Linux पर 60/60 पास करते हैं।

पूरे `Math.log`, `Math.log2` और `Math.log10` समूह 9/9, 5/5 और 5/5 पास करते हैं। पॉज़िटिव स्मोक 114/114 है; संगत उदाहरण Windows और Linux पर 61/61 पास करते हैं।

पूरे `Math.exp` और `Math.expm1` समूह 9/9 और 5/5 पास करते हैं। पॉज़िटिव स्मोक 116/116 है; संगत उदाहरण Windows और Linux पर 62/62 पास करते हैं।

पूरे `Math.atan` और `Math.atan2` समूह 7/7 और 11/11 पास करते हैं। पॉज़िटिव स्मोक 118/118 है; संगत उदाहरण Windows और Linux पर 63/63 पास करते हैं।

पूरा `Math.log1p` समूह 5/5 पास करता है। पॉज़िटिव स्मोक 119/119 है; संगत उदाहरण Windows और Linux पर 64/64 पास करते हैं।

पूरा `Math.cbrt` समूह 5/5 पास करता है। पॉज़िटिव स्मोक 120/120 है; संगत उदाहरण Windows और Linux पर 65/65 पास करते हैं।

पूरे `Math.asin` और `Math.acos` समूह 9/9 और 8/8 पास करते हैं। पॉज़िटिव स्मोक 122/122 है; संगत उदाहरण Windows और Linux पर 66/66 पास करते हैं।

पूरे `encodeURI` और `encodeURIComponent` समूह दोनों 31/31 पास करते हैं। पॉज़िटिव स्मोक 124/124 है; संगत उदाहरण Windows और Linux पर 67/67 पास करते हैं।

पूरे `decodeURI` और `decodeURIComponent` समूह 55/55 और 56/56 पास करते हैं। पॉज़िटिव स्मोक 126/126 है; संगत उदाहरण Windows और Linux पर 68/68 पास करते हैं।

पूरा `Math.atanh` समूह 5/5 पास करता है। पॉज़िटिव स्मोक 127/127 है; संगत उदाहरण Windows और Linux पर 69/69 पास करते हैं। URI पर काम के बाद पूरे नेटिव टेस्ट रन में 1632 पास, 27 स्किप और शून्य विफलताएँ थीं।

पूरे `Math.asinh` और `Math.acosh` समूह 5/5 और 7/7 पास करते हैं। पॉज़िटिव स्मोक 129/129 है; संगत उदाहरण Windows और Linux पर 70/70 पास करते हैं।

पूरे `Math.sinh`, `Math.cosh` और `Math.tanh` समूह हर एक 5/5 पास करते हैं। पॉज़िटिव स्मोक 132/132 है; संगत उदाहरण Windows और Linux पर 71/71 पास करते हैं।

पूर्ण `built-ins/Math` रन में अब 327 में से 312 पास और 15 फ़ेल हैं। सभी 15 विफलताएँ `Math.f16round` और `Math.sumPrecise` से जुड़ी हैं, जो ES2020 के बाद के हैं। यह मनमाने सीमित (finite) इनपुट के लिए transcendental सटीकता को नहीं मापता। `sin`, `cos` और `tan` के लिए बड़े कोण का रिडक्शन इस रन के बाद जोड़ा गया और binary exponents के पार Node.js 26 के विरुद्ध सत्यापित किया गया।

`String.prototype.toLocaleLowerCase` और `toLocaleUpperCase` 26/28 और 24/26 पास करते हैं। बाकी चार टेस्ट को RegExp या eval चाहिए। पॉज़िटिव स्मोक 134/134 है; संगत उदाहरण Windows और Linux पर 72/72 पास करते हैं। डिफ़ॉल्ट Unicode मैपिंग के अलावा लोकेल-विशिष्ट मैपिंग का मूल्यांकन अभी बाकी है।

`String.prototype.split` 120 में से 86 Test262 मामले पास करता है। बाकी 34 को RegExp, BigInt या eval चाहिए। केवल-स्ट्रिंग सेपरेटर, limits, प्रिमिटिव सेपरेटर और कस्टम `Symbol.split` hooks की जाँच की गई है। पॉज़िटिव स्मोक 137/137 है; संगत उदाहरण Windows और Linux पर 73/73 पास करते हैं।

बड़े कोण वाले `Math.sin`, `Math.cos` और `Math.tan` अब `2/pi` की 1152-बिट fixed-point तालिका का उपयोग करते हैं। नेटिव टेस्ट 48/48 पास करते हैं, जिनमें exponents 63–1022 के पार 80 नियतात्मक सीमित मान शामिल हैं। संगत उदाहरण Windows और Linux पर 74/74 पास करते हैं।

`String.prototype.replace` 55 में से 24 Test262 मामले पास करता है। बाकी 31 को RegExp, BigInt या डायनामिक फ़ंक्शन निर्माण चाहिए। स्ट्रिंग खोज, फ़ंक्शनल रिप्लेसमेंट, रिप्लेसमेंट पैटर्न और कस्टम `Symbol.replace` कवर किए गए हैं। पॉज़िटिव स्मोक 140/140 है; संगत उदाहरण Windows और Linux पर 75/75 पास करते हैं।
