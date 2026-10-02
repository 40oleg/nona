# خط الأساس لـ Test262

::: info ترجمة
هذه الصفحة ترجمة للصفحة الإنجليزية [Test262 baseline](/reference/test262) المولَّدة من [`docs/test262.md`](https://github.com/40oleg/nona/blob/main/docs/test262.md). النسخة الإنجليزية هي المرجع المعتمد وقد تكون أحدث.
:::

يستخدم المشغّل مراجعة Test262 من المستودع الأصلي `7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd`. ولا يضمّن عن قصد نسخة من Test262 في هذا المستودع. على Windows x64:

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/tc39/test262.git work/test262
git -C work/test262 sparse-checkout set harness test/language/expressions/coalesce test/language/expressions/arrow-function test/language/expressions/array test/language/expressions/call test/language/expressions/new test/language/expressions/template-literal test/language/rest-parameters test/language/statements/function test/language/statements/for-in test/language/statements/for-of test/built-ins/Symbol test/built-ins/Array/prototype/includes test/built-ins/Array/prototype/pop test/built-ins/Math/pow test/built-ins/Math/min test/built-ins/Math/max test/built-ins/Math/abs test/built-ins/Math/sign test/built-ins/Math/sqrt test/built-ins/Math/trunc test/built-ins/Math/floor test/built-ins/Math/ceil test/built-ins/Math/round test/built-ins/String/prototype/includes test/built-ins/Number/isFinite test/built-ins/Number/isInteger test/built-ins/Number/isNaN test/built-ins/Number/isSafeInteger
git -C work/test262 rev-parse HEAD
git -C work/test262 sparse-checkout add test/built-ins/Math/imul test/built-ins/Math/clz32
npm ci
npm run test262:smoke
node scripts/test262-smoke.mjs language/expressions/coalesce
```

يعمل المشغّل نفسه على Linux x64 أيضًا: يترجم عندئذٍ صور ELF للمنصة `linux-x64` بدلًا من ملفات PE، ويعيد المحاولة عند حالة السباق العابرة `ETXTBSY` أثناء exec التي قد تسببها الخيوط العاملة على Linux. اضبط `TEST262_DELETE_BINARIES=1` لحذف كل صورة اختبار مترجَمة بعد تشغيلها؛ وإلا فإن الفهارس الكبيرة تترك عدة غيغابايتات في `work/test262-smoke`.

يجب أن يكون الـ checkout على المراجعة المثبَّتة. إذا تقدّم HEAD في المستودع الأصلي، فاجلب ذلك الإيداع بعينه وانتقل إليه قبل التشغيل. يختار `TEST262_ROOT` نسخة أخرى، ويختار `TEST262_REPORT` مسارًا آخر لتقرير JSON. ويشغّل `TEST262_JOBS` ما يصل إلى ثمانية خيوط عاملة بالتوازي (الافتراضي خيط واحد) مع الحفاظ على ترتيب التقرير؛ فمثلًا اضبط `TEST262_JOBS=4` قبل تشغيل فهرس كبير. يضمّ `TEST262_PATH_FILTER` المسارات المطابقة، ويستبعدها `TEST262_EXCLUDE_PATH_FILTER`؛ وكلاهما مرشّح سلسلة فرعية حرفي. يشغّل الأمر دون وسائط البيان المُراجَع في `tests/test262-smoke.json`؛ ويشغّل وسيط على شكل مجلد نسبي كل ملفات `.js` تحت مجموعة Test262 تلك. وتميّز التقارير بين إخفاقات الترجمة وإخفاقات وقت التشغيل والاختبارات المتخطّاة.

## التدقيقات الكاملة

يشغّل `scripts/test262-audit.ps1` ‏(Windows) و`scripts/test262-audit.sh` ‏(Linux) كل مجلد من Test262 تحت `language/` و`annexB/` و`built-ins/` مع `TEST262_EXCLUDE_FEATURES=post-es2020`، بتقرير لكل مجلد في `work/test262-audit` (قابل للاستئناف). ويعيد `-Dirs 'a,b' -Tag r1` ‏(PowerShell) أو `TAG=r1 scripts/test262-audit.sh <out> a b` تشغيل المجلدات المختارة في مجلد فرعي تحلّ نتائجه محل نتائج التشغيل الكامل. للتلخيص والتصنيف:

```
node scripts/test262-summary.mjs work/test262-audit --others work/others.txt
node scripts/test262-summary.mjs work/test262-audit --compare work/previous-audit
```

يصنّف الملخص كل إخفاق إلى `eval` (الاختبار يستخدم eval؛ ومع ترجمة شيفرة eval مسبقًا تكون هذه غالبًا شيفرة محسوبة وقت التشغيل أو `$262.evalScript` أو عوالم أخرى)، أو `post` (دلالات ما بعد ES2020 تحت وسم ميزة قديم أو مفقود)، أو `other`، ويسرد ملفات `other` (ويسرد `--evals <file>` ملفات eval). يقيّد `TEST262_FILE_LIST=<file>` تشغيل `scripts/test262-smoke.mjs <group>` بالمسارات المدرجة، مثلًا لإعادة تشغيل قائمة كهذه. ويُقبَل checkout بلا بيانات git الوصفية (مثل نسخة منقولة إلى جهاز آخر) إذا احتوى `work/test262/.nona-test262-revision` على تجزئة الإيداع المثبَّت؛ وعندئذٍ تقرأ اختبارات فواصل الأسطر الملفات مباشرةً.

## دلالات أحدث من ES2020 في Test262 المثبَّت {#semantics-newer-than-es2020-in-the-pinned-test262}

يتحقق Test262 المثبَّت (2026) أحيانًا من سلوك أُدخل بعد ES2020 دون وسم ميزة لما بعد ES2020. السياسة (issue #17): حين يكون الإصدار اللاحق قد أزال فقط غرابة ملحوظة في ES2020 لا تعتمد عليها البرامج، يتبع Nona معيار Test262 المثبَّت؛ وكل ما عدا ذلك يبقى على ES2020 ويصنّفه `scripts/test262-summary.mjs` بوصفه `post` أو يُدرَج كانحراف معروف. الحالات التي يُتَّبع فيها Test262:

- ‏`[[Set]]` و`[[GetOwnProperty]]` و`[[DefineOwnProperty]]` في TypedArray ‏(ES2021/ES2022): تُحوَّل القيمة أولًا؛ ثم يتجاهل الفهرس غير الصالح أو المخزن المفصول عملية الكتابة ويُبلغ بالنجاح؛ ولا يملك المخزن المفصول عناصر خاصة به؛ ومع Receiver غير الـ TypedArray لا أثر للفهرس غير الصالح، أما الفهرس الصالح فيعني OrdinarySet على الـ Receiver.
- لا تبحث `String.prototype.{replace,split,match,matchAll,search}` عن توابع مفاتيحها رموز (Symbol) في الوسائط البدائية (ES2025).
- أهداف الإسناد في Annex B على شكل تعبير استدعاء ترمي ReferenceError وقت التشغيل في الشيفرة غير الصارمة، وهي أخطاء مبكرة في الشيفرة الصارمة (واقع الويب في ES2022).

ما بقي على ES2020 (وتُصنَّف إخفاقاته `post`): حقول الأصناف والتوابع الخاصة، وفواصل الأعداد، والإسناد المنطقي، و`Promise.any`/`AggregateError`، و`Error.prototype.stack`/`cause`، والعلَم `v` في RegExp ومؤشرات المطابقة، وawait في المستوى الأعلى، وبقية الميزات في `postEs2020Features`. والانحرافات المعروفة المتبقية مدرجة لكل فهرس في `docs/pr5-es2020-remaining-work.md` وفي حالة الإصدار.

ميزات المشغّل المضافة لمحطة ES2020 ‏(2026-09):

- ‏`TEST262_TARGET=linux-x64` (الافتراضي على Linux) يربط صور ELF؛ وتُترجَم اختبارات الوحدات (`flags: [module]`) كمخطط وحدات مع إطار الاختبار كمقدّمة سكربت تقليدي؛ وتتوقع اختبارات حلّ الوحدات السلبية خطأ ترجمة.
- يتوسّع `TEST262_EXCLUDE_FEATURES=post-es2020` إلى قائمة وسوم الميزات التي أُدخلت بعد ES2020 (انظر `postEs2020Features` في السكربت)، إضافةً إلى `error-stack-accessor` والامتداد غير القياسي `caller`.
- يُترجَم `$262.createRealm` حين يذكره الاختبار (حتى ثلاثة عوالم)؛ وتُستخرَج برامج `$262.agent` من قوالب ثابتة (تُطوى عدّادات الحلقات والثوابت في المستوى الأعلى و`$262.agent.timeouts`) وتُترجَم في الصورة كخيوط وكلاء. وتُتخطّى اختبارات `CanBlockIsFalse` لأن الوكيل الرئيسي يمكنه الانتظار المحجوب.
- يمكن لمحدِّدات `import()` المحسوبة تحميل ملفات `_FIXTURE.js` الخاصة بالاختبار والمذكورة في مصدره (`ModuleHost.candidates`).
- يُبلَّغ عن استثناء المترجم كإخفاق لذلك الملف (`phase: compiler-crash`) بدلًا من إيقاف التشغيل.

هذا **محوِّل لخط الأساس** وليس إطار اختبارات Test262 الكامل: تُتخطّى حاليًا الاختبارات الخام (raw) والاختبارات السلبية وقت التشغيل مع ذكر الأسباب. وتنجح الاختبارات السلبية للتحليل حين يرفض Nona المصدر بتشخيص من المترجم؛ ولا يتحقق المحوِّل بعد من تكافؤ نوع التشخيص. ويشغّل الاختبارات الإيجابية للسكربتات بإطار الاختبار القياسي `sta.js`/`assert.js` والـ `includes` المصرَّح عنها. وقبل أي ادعاء بالتوافق، يجب أن يدعم المحوِّل جميع أنماط البيانات الوصفية المنطبقة والنسختين الصارمة وغير الصارمة، ثم يشغّل جميع المجموعات المنطبقة. وتظل الاختبارات الأصلية العادية في المستودع البوابة الرئيسية ضد التراجعات في هذه المرحلة. شغّل الاختبارات والمرجع (oracle) على Node 26 كما يشترط `package.json`؛ إذ يختلف Node 22 في بيانات الدوال الوصفية الملحوظة وقد يفشل حين يختم الاختبار كائنه العام.

يتضمن بيان smoke الإيجابي لوقت التشغيل بتاريخ 2026-09-26 حالات المعاملات الافتراضية وspread؛ وأعداده الحالية مسجَّلة في سجل التطوير. وتعطي مجموعات خام أوسع على المراجعة المثبَّتة 72 pass / 26 fail لـ `built-ins/Symbol`، و85 pass / 34 fail لـ `language/statements/for-in`، و142 pass / 607 fail / 2 skip لـ `language/statements/for-of`. تتضمن هذه المجموعات حالات خارج المجموعة الفرعية المنفَّذة وحالات أضيفت بعد ES2020؛ والأعداد الخام تشخيصية وليست نسب توافق مع ES2020. ‏`built-ins/Array/prototype/includes` تعطي 26 pass / 4 fail / 0 skip؛ والحالات الفاشلة تستخدم Proxy أو ArrayBuffer قابلة لتغيير الحجم. ‏`built-ins/Math/pow` تعطي 28 pass / 0 fail / 0 skip بعد إضافة ثوابت Math في ES2020. ‏`built-ins/Math/min` و`built-ins/Math/max` تعطي كل منهما 10 pass / 0 fail / 0 skip، بما في ذلك تحويل كل وسيط وترتيب الأصفار ذات الإشارة. ‏`built-ins/String/prototype/includes` تعطي 25 pass / 2 fail / 0 skip؛ والحالات الفاشلة تحتوي على قيم RegExp حرفية لم تكن مدعومة بعد. ‏`built-ins/String/prototype/padStart` و`padEnd` تعطي كل منهما 13 pass / 0 fail / 0 skip، بما في ذلك ترتيب التحويل وفحوص الواصفات. ‏`built-ins/String/prototype/indexOf` تعطي 44 pass / 3 fail / 0 skip؛ والحالات المتبقية تعتمد على `eval` أو BigInt. ‏`built-ins/String/prototype/lastIndexOf` تعطي 25 pass / 0 fail / 0 skip. ‏`built-ins/String/fromCharCode` تعطي 16 pass / 1 fail / 0 skip؛ والحالة المتبقية تتطلب BigInt. ‏`built-ins/Array/prototype/indexOf` تعطي 193 pass / 8 fail / 0 skip، و`lastIndexOf` تعطي 189 pass / 9 fail / 0 skip بعد إضافة `isNaN` العامة. والحالات المتبقية تستخدم Date أو RegExp أو JSON أو Proxy أو مخازن/مصفوفات منمَّطة قابلة لتغيير الحجم أو `eval`. ‏`isFinite` العامة تعطي 15 pass / 0 fail / 0 skip. و`isNaN` العامة تعطي 14 pass / 1 fail / 0 skip؛ والحالة المتبقية تستخدم `Array.prototype.forEach` في جسم إطار الاختبار. ‏`built-ins/Array/prototype/pop` تعطي 23 pass / 0 fail / 0 skip بعد إضافة ثوابت Number في ES2020. والمجموعات الأربع `Number.isFinite/isInteger/isNaN/isSafeInteger` تعطي 8/9/7/10 pass على الترتيب، دون إخفاقات أو تخطٍّ. ‏`language/rest-parameters` تعطي 11 pass / 0 fail / 0 skip بعد المعاملات المفكَّكة وتوابع الأصناف. وبعد دعم المعاملات الافتراضية تعطي `language/expressions/arrow-function` ‏147 pass / 196 fail / 0 skip؛ وتنجح جميع حالات `dflt-params` التسع في تلك المجموعة. ومع spread في القيم الحرفية للمصفوفات والكائنات تعطي `language/expressions/array` ‏50 pass / 2 fail / 0 skip. والحالتان المتبقيتان تتطلبان المولّدات. ومع spread في الاستدعاء والإنشاء تعطي `language/expressions/call` ‏72 pass / 20 fail / 0 skip، و`language/expressions/new` ‏54 pass / 5 fail / 0 skip. ومن بين حالات `spread-*` لا تفشل في الترجمة إلا حالتان في كل مجموعة لأنهما تتطلبان المولّدات. أما الإخفاقات الأخرى في المجموعتين فتتعلق بميزات أخرى غير مدعومة، منها `eval`. ومجموعات `Math.abs/sign/sqrt/trunc/floor/ceil/round` تنجح في 8/5/10/12/11/11/11 اختبارًا على الترتيب، دون إخفاقات أو تخطٍّ. ومجموعتا `Math.imul` و`Math.clz32` تنجحان في 5/5 و10/10 على الترتيب. وبعد أنماط ربط المصفوفات والكائنات تنجح مجموعات التصريحات الثلاث `language/statements/variable/dstr` و`let/dstr` و`const/dstr` في 79/97 و77/93 و77/93 حالة على الترتيب. وكل حالة متبقية تفشل في الترجمة لأنها تستخدم المولّدات أو الأصناف. هذه مجموعات Test262 مختارة، وليست نسبة توافق مع ES2020. ‏`language/destructuring/binding/syntax` تعطي 12 pass / 2 fail؛ والحالتان المتبقيتان تتطلبان صيغة المولّدات وasync. و`language/expressions/assignment/dstr` تعطي 323 pass / 45 إخفاق ترجمة / 0 إخفاق وقت التشغيل؛ وإخفاقات الترجمة تلك تتطلب المولّدات أو الأصناف. ومجموعتا الأصناف المختارتان `language/statements/class/method` و`method-static` تنجح كل منهما في 20/20. و`language/statements/class/definition` تعطي 46 pass / 17 إخفاق ترجمة / 2 skip؛ والحالات المتبقية تتطلب صيغة خارج المجموعة الفرعية الحالية للأصناف، منها المولّدات والتوابع غير المتزامنة.

بتاريخ 2026-09-25 أعطت المجموعة `language/expressions/coalesce` ‏21 pass و3 fail و0 skip. أحد الإخفاقات يتطلب النوع `Symbol` الذي كان مفقودًا؛ واثنان يختبران استدعاءات الذيل الصحيحة في الشيفرة الصارمة ويُطفحان المكدس الأصلي. ونجحت أربع حالات تحليل سلبية برفض المترجم لها. هذه قدرات مفقودة ومتابَعة، وليست دليلًا على أن `??` معطّل عمومًا.

بتاريخ 2026-09-26 نجحت المجموعتان الكاملتان المثبَّتتان `built-ins/parseInt` و`built-ins/parseFloat` في 55/55 و54/54. وأعطى أول تشغيل كامل لـ `built-ins/Array` ‏2632 pass و360 fail و90 skip من أصل 3082؛ وكل الاختبارات المتخطّاة التسعين اختبارات لـ `Array.fromAsync` (واجهة جاءت بعد ES2020)؛ وكشف التشغيل خطأً في إكمال المكرِّرات وخمس حالات انتهاء مهلة في المصفوفات المتفرقة، وقد أُصلحت منذ ذلك الحين. ويعطي التشغيل الكامل المتكرر لـ Array ‏2640 pass و352 fail و90 skip. ولكل إخفاق متبقٍّ متطلب مسبق مسجَّل في [قائمة التأجيلات لـ v0.4](https://github.com/40oleg/nona/blob/main/docs/v0.4-array-deferred.json): ‏150 حالة لواجهات ما بعد ES2020، و72 حالة للمخازن القابلة لتغيير الحجم، و130 اعتمادية مستقبلية أخرى أو استثناء `eval` الموثَّق. وينجح البيان الإيجابي في 100/100.

بعد v0.4.0 تنجح المجموعة الكاملة `built-ins/String/fromCodePoint` في 11/11. وأُبقيت حالة واحدة في بيان smoke المثبَّت؛ وكان البيان ينجح في 101/101 عند تلك النقطة.

تنجح المجموعة الكاملة `built-ins/String/raw` في 30/30. وحالة القالب الموسوم فيها مضمَّنة في بيان smoke الإيجابي المثبَّت. وينجح البيان المحدَّث في 102/102؛ وتنجح الأمثلة المتوافقة على Windows وLinux في 54/54 لكل منهما.

تنجح المجموعة الكاملة `built-ins/String/prototype/concat` في 22/22. وحالة واحدة مضمَّنة في بيان smoke الإيجابي. وينجح البيان المحدَّث في 103/103؛ وتنجح الأمثلة المتوافقة على Windows وLinux في 55/55 لكل منهما.

تعطي المجموعة `built-ins/String/prototype/toUpperCase` ‏24 pass / 2 fail / 0 skip. والإخفاقان يتطلبان `RegExp` و`eval` المباشر، وكلاهما متابَع خارج v0.5. وحالة تحويل الحالة الخاصة في Unicode موجودة في بيان smoke الإيجابي، وهو الآن 104/104. وتنجح الأمثلة المتوافقة على Windows وLinux في 56/56 لكل منهما.

تعطي المجموعة `built-ins/String/prototype/toLowerCase` ‏28 pass / 2 fail / 0 skip. وإخفاقاها يتطلبان كذلك `RegExp` و`eval` المباشر. وينجح التحويل الشرطي لحرف سيغما النهائي، بما في ذلك محارف `Case_Ignorable`. وبيان smoke الإيجابي عند 105/105؛ والأمثلة المتوافقة عند 57/57 على Windows وLinux.

تعطي المجموعة الكاملة `built-ins/Number/prototype/toFixed` ‏15 pass / 1 fail / 0 skip. والحالة الفاشلة تستخدم BigInt المقرَّر لـ v0.8. وحالة الدقة موجودة في بيان smoke الإيجابي، وهو الآن 106/106؛ وتنجح الأمثلة المتوافقة في 58/58 على Windows وLinux.

تنجح المجموعتان الكاملتان `built-ins/Number/prototype/toExponential` و`built-ins/Number/prototype/toPrecision` في 15/15 و17/17. وحالات القيم العادية فيهما موجودة في بيان smoke الإيجابي، وهو الآن 108/108. وتنجح الأمثلة المتوافقة في 59/59 على Windows وLinux.

أعطى أول تشغيل كامل لـ `built-ins/Math` قبل إضافة الدوال المثلثية 176 pass / 151 fail من أصل 327. ومعظم الإخفاقات دوال متسامية من ES2020 كانت مفقودة؛ أما `f16round` و`sumPrecise` فواجهات لاحقة. وتنجح الآن المجموعات الكاملة `Math.sin` و`Math.cos` و`Math.tan` في 8/8 و9/9 و9/9. وsmoke الإيجابي عند 111/111؛ وتنجح الأمثلة المتوافقة في 60/60 على Windows وLinux.

تنجح المجموعات الكاملة `Math.log` و`Math.log2` و`Math.log10` في 9/9 و5/5 و5/5. وsmoke الإيجابي عند 114/114؛ وتنجح الأمثلة المتوافقة في 61/61 على Windows وLinux.

تنجح المجموعتان الكاملتان `Math.exp` و`Math.expm1` في 9/9 و5/5. وsmoke الإيجابي عند 116/116؛ وتنجح الأمثلة المتوافقة في 62/62 على Windows وLinux.

تنجح المجموعتان الكاملتان `Math.atan` و`Math.atan2` في 7/7 و11/11. وsmoke الإيجابي عند 118/118؛ وتنجح الأمثلة المتوافقة في 63/63 على Windows وLinux.

تنجح المجموعة الكاملة `Math.log1p` في 5/5. وsmoke الإيجابي عند 119/119؛ وتنجح الأمثلة المتوافقة في 64/64 على Windows وLinux.

تنجح المجموعة الكاملة `Math.cbrt` في 5/5. وsmoke الإيجابي عند 120/120؛ وتنجح الأمثلة المتوافقة في 65/65 على Windows وLinux.

تنجح المجموعتان الكاملتان `Math.asin` و`Math.acos` في 9/9 و8/8. وsmoke الإيجابي عند 122/122؛ وتنجح الأمثلة المتوافقة في 66/66 على Windows وLinux.

تنجح المجموعتان الكاملتان `encodeURI` و`encodeURIComponent` في 31/31 لكل منهما. وsmoke الإيجابي عند 124/124؛ وتنجح الأمثلة المتوافقة في 67/67 على Windows وLinux.

تنجح المجموعتان الكاملتان `decodeURI` و`decodeURIComponent` في 55/55 و56/56. وsmoke الإيجابي عند 126/126؛ وتنجح الأمثلة المتوافقة في 68/68 على Windows وLinux.

تنجح المجموعة الكاملة `Math.atanh` في 5/5. وsmoke الإيجابي عند 127/127؛ وتنجح الأمثلة المتوافقة في 69/69 على Windows وLinux. وأعطى التشغيل الكامل للاختبارات الأصلية بعد العمل على URI ‏1632 نجاحًا و27 تخطّيًا وصفر إخفاقات.

تنجح المجموعتان الكاملتان `Math.asinh` و`Math.acosh` في 5/5 و7/7. وsmoke الإيجابي عند 129/129؛ وتنجح الأمثلة المتوافقة في 70/70 على Windows وLinux.

تنجح المجموعات الكاملة `Math.sinh` و`Math.cosh` و`Math.tanh` في 5/5 لكل منها. وsmoke الإيجابي عند 132/132؛ وتنجح الأمثلة المتوافقة في 71/71 على Windows وLinux.

يعطي التشغيل الكامل لـ `built-ins/Math` الآن 312 نجاحًا و15 إخفاقًا من أصل 327. وكل الإخفاقات الخمسة عشر تخص `Math.f16round` و`Math.sumPrecise`، وهما لاحقتان لـ ES2020. ولا يقيس هذا دقة الدوال المتسامية لمدخلات منتهية عشوائية. وأُضيف اختزال الزوايا الكبيرة لـ `sin` و`cos` و`tan` بعد هذا التشغيل وتم التحقق منه مقابل Node.js 26 عبر جميع الأسس الثنائية.

تنجح `String.prototype.toLocaleLowerCase` و`toLocaleUpperCase` في 26/28 و24/26. والاختبارات الأربعة المتبقية تتطلب RegExp أو eval. وsmoke الإيجابي عند 134/134؛ وتنجح الأمثلة المتوافقة في 72/72 على Windows وLinux. ولا يزال تقييم التحويلات الخاصة بالمحليات خارج تحويل Unicode الافتراضي مطلوبًا.

تنجح `String.prototype.split` في 86/120 حالة من Test262. والحالات الـ 34 المتبقية تتطلب RegExp أو BigInt أو eval. وتم التحقق من الفواصل النصية والحدود والفواصل البدائية وخطافات `Symbol.split` المخصصة. وsmoke الإيجابي عند 137/137؛ وتنجح الأمثلة المتوافقة في 73/73 على Windows وLinux.

تستخدم `Math.sin` و`Math.cos` و`Math.tan` للزوايا الكبيرة الآن جدولًا لـ `2/pi` بفاصلة ثابتة من 1152 بت. وتنجح الاختبارات الأصلية في 48/48، بما في ذلك 80 قيمة منتهية حتمية عبر الأسس 63–1022. وتنجح الأمثلة المتوافقة في 74/74 على Windows وLinux.

تنجح `String.prototype.replace` في 24/55 حالة من Test262. والحالات الـ 31 المتبقية تتطلب RegExp أو BigInt أو إنشاء الدوال ديناميكيًا. والبحث في السلاسل، والاستبدال الوظيفي، وأنماط الاستبدال، و`Symbol.replace` المخصص كلها مغطّاة. وsmoke الإيجابي عند 140/140؛ وتنجح الأمثلة المتوافقة في 75/75 على Windows وLinux.
