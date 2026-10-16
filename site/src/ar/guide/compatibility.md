# التوافق والقيود

## النطاق

يستهدف Nona اللغة والكائنات المدمجة في الإصدار المعياري الحادي عشر من ECMA-262 ‏(يونيو 2020)، للسكربتات ووحدات ES. أما التدويل ECMA-402 وواجهات المتصفح وواجهات Node.js فهي مواصفات منفصلة؛ ولا يوفّر Nona إلا واجهات المضيف المذكورة في [المرجع](/ar/reference/modules). ويُحفَظ عقد الاكتمال في [`docs/es2020-contract.md`](https://github.com/40oleg/nona/blob/main/docs/es2020-contract.md).

يوصف كل إصدار بأنه «ES2020 مع استثناءات موثّقة»، ولا يوصف أبدًا بأنه متوافق تمامًا مع ES2020.

## `eval` و`Function` {#eval-and-function}

يترجم Nona مسبقًا، لذا يحتاج `eval` ومُنشئات الدوال الديناميكية إلى نصها المصدري وقت الترجمة:

- **يُترجَم مسبقًا:** السلسلة الحرفية، أو تسلسل من السلاسل الحرفية، أو المتغير الذي لا يُسنَد إليه إلا مثل هذه الثوابت (وتُقارَن القيمة وقت التشغيل). يرى `eval` المباشر نطاق المستدعي و`this` و`arguments` و`new.target` و`super`؛ أما الأشكال غير المباشرة (`(0, eval)(…)` و`globalThis.eval(…)` و`eval?.(…)`) فتعمل في النطاق العام. واستدعاءات `Function` و`GeneratorFunction` و`AsyncFunction` و`AsyncGeneratorFunction` التي تكون كل وسائطها قيمًا حرفية تُترجَم بدلالات CreateDynamicFunction.
- **غير مدعوم:** الشيفرة المحسوبة وقت التشغيل، ووسائط spread المُمرَّرة إلى `eval`، و`$262.evalScript`. وكلها ترمي:

```text
EvalError: Nona compiles ahead of time: eval and Function need source text known at compile time
```

تُتابَع الشيفرة المحسوبة وقت التشغيل في [#11](https://github.com/40oleg/nona/issues/11).

## الفروق عن Node.js

| المجال                       | Nona                                                                                                                                                                                | Node.js                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `process.argv`               | `[execPath, ...arguments]`: ‏`argv[1]` هو الوسيط الأول                                                                                                                              | `[node, script, ...arguments]`                                                               |
| `process`                    | البيانات الوصفية العامة، وتعديل متغيرات البيئة، والساعات والنبضات، والدخل/الخرج القياسي، ودورة الحياة والتحذيرات، والمعالج/الموارد، والتحكم الأصلي في العملية (على المنصات الثماني) | معالجات الإشارات، وIPC، وتقارير كومة V8، والتدفقات غير المتزامنة الكاملة، والتحكم في الطرفية |
| معرّفات المؤقتات             | أعداد                                                                                                                                                                               | كائنات `Timeout`                                                                             |
| `readFileSync(path)`         | يعيد `Uint8Array` (دون ترميز)                                                                                                                                                       | يعيد `Buffer`                                                                                |
| الترميزات                    | `utf8` (fs); UTF-8, UTF-16LE, Latin-1, ASCII, hex, base64/base64url (Buffer) فقط                                                                                                    | كثيرة                                                                                        |
| رسائل الخطأ على Windows      | تحتوي على المسار كما مُرِّر                                                                                                                                                         | تحتوي على المسار المطلق                                                                      |
| الوحدات                      | `nona:*` ووحدات `node:*` المدرجة في [الوحدات المدمجة](/ar/reference/modules)، والملفات وحزم npm التي تُحلّ وقت البناء                                                               | كل ما في `node:*` وحزم npm، وتُحلّ وقت التشغيل                                               |
| `require`                    | وحدات CommonJS بمحددات حرفية معروفة وقت البناء ([حزم npm](/reference/npm))                                                                                                          | أي محدد وقت التشغيل                                                                          |
| `console.log` دون مخرج قياسي | يُتجاهَل الناتج                                                                                                                                                                     | يُتجاهَل الناتج أو يُرمى خطأ                                                                 |

## الأداء

- تستخدم المصفوفات والكائنات و`Map`/`Set` تخزينًا كثيفًا ومجزّأً مع الأشكال وذاكرات التخزين المضمّنة، لكن الاستدعاءات والإغلاقات (closures) وتخصيص الذاكرة لا تزال أبطأ من V8 بعدة أضعاف؛ وتسرد صفحة [الأداء](/ar/guide/performance) المواضع البطيئة.
- محرك RegExp آلة افتراضية بالتراجع مكتوبة بلغة JavaScript. النمط الخالي من المراجع الخلفية والنظر الأمامي والخلفي الذي يكثر التراجع (دون العلامة `u`) يكمله محرك بزمن خطي.
- على Windows تستيقظ المؤقتات مع نبضة النظام (عادةً 15.6 ms).
- لا يوجد JIT: تُترجَم الشيفرة مرة واحدة مسبقًا، دون تحسين موجَّه بالتنميط.

## أجزاء بيئة التشغيل المربوطة

يحتوي كل ملف تنفيذي على بيئة التشغيل، لكن أجزاءها الاختيارية الكبيرة لا تُربط إلا عندما يستطيع البرنامج الوصول إليها. يقرّر المترجم ذلك من نص كل مصدر يترجمه: البرنامج ووحداته ومصادر `eval`/`Function` المعروفة وقت الترجمة:

| الجزء                                  | الحجم      | يُربط عندما يحتوي مصدر على                                                                                                        |
| -------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| محرك RegExp                            | نحو 1 MB   | قيمة حرفية RegExp، أو الاسم `RegExp` أو `match` أو `matchAll` أو `search` (معرّفًا أو اسم خاصية أو داخل سلسلة حرفية أو قالب حرفي) |
| جداول خصائص Unicode لـ `\p{…}`/`\P{…}` | نحو 2 MB   | ‏`\p{` أو `\P{` في قيمة حرفية RegExp أو في سلسلة، أو أحد الأسماء أعلاه (فقد يُبنى النمط وقت التشغيل)                              |
| جداول تطبيع Unicode                    | نحو 0.7 MB | الاسم `normalize` أو `localeCompare`                                                                                              |

لا تحتاج `split` و`replace` و`replaceAll` ذات الوسائط النصية إلى محرك RegExp.

تُربط بالطريقة نفسها المكتبات المدمجة المكتوبة بلغة JavaScript التي لا تفعل سوى تثبيت كائنات عامة أو توابع (نحو 0.7 MB معًا) عندما يحتوي مصدر على أحد أسمائها:

| الجزء                                                                                                                                                   | الأسماء                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Proxy`                                                                                                                                                 | `Proxy`                                                                                                                                        |
| `TextEncoder` و`TextDecoder`                                                                                                                            | ‏`TextEncoder` و`TextDecoder` (وتُربط أيضًا مع `process`)                                                                                      |
| `process`                                                                                                                                               | `process`                                                                                                                                      |
| المؤقتات وحلقة الأحداث و`queueMicrotask` و`performance`                                                                                                 | ‏`setTimeout` و`setInterval` و`setImmediate` و`clearTimeout` و`clearInterval` و`clearImmediate` و`queueMicrotask` و`performance` و`globalThis` |
| ‏`.at()` و`findLast` و`findLastIndex` و`Object.hasOwn` و`AggregateError` و`Promise.any`                                                                 | ‏`at` و`findLast` و`findLastIndex` و`hasOwn` و`AggregateError` و`any` و`unscopables`                                                           |
| Iterator helpers (`Iterator`, `Iterator.from`, `map`, `take`, `drop`, `flatMap`, `toArray`, …)                                                          | `Iterator`, `toArray`, `take`, `drop`, `flatMap`                                                                                               |
| دوال Annex B ‏`escape` و`unescape` و`substr` و`setYear` و`toGMTString` و`RegExp.prototype.compile` وتوابع HTML للسلاسل (`anchor` و`big` و`link` وغيرها) | الأسماء نفسها                                                                                                                                  |
| ترتيب `Array.prototype.sort` المستقر بالدمج                                                                                                             | ‏`sort`                                                                                                                                        |
| ‏`Object.freeze` و`seal` و`isFrozen` و`isSealed` عبر مصائد Proxy (وإلا فالنسخ الأصلية للكائنات العادية)                                                 | الأسماء نفسها                                                                                                                                  |
| ‏`__defineGetter__` و`__defineSetter__` و`__lookupGetter__` و`__lookupSetter__`                                                                         | الأسماء نفسها                                                                                                                                  |
| توابع البيانات الثنائية لـ `ArrayBuffer` و`SharedArrayBuffer` و`DataView` والمصفوفات المنمّطة (`slice` و`subarray` و`sort`، …)                          | أسماء مُنشِئاتها و`Atomics` و`TypedArray` (تُربط أيضًا مع `process` و`Buffer` و`TextEncoder`)                                                  |
| توابع بروتوكول RegExp وString (`Symbol.replace` و`String.prototype.match` و`matchAll` و`search` و`replaceAll`، …)                                       | مع محرك RegExp، أو `replaceAll`                                                                                                                |

يربط البرنامج الذي يستدعي `Object.getOwnPropertyNames` أو `Object.getOwnPropertyDescriptors` أو `Reflect.ownKeys` كل هذه الأجزاء، لأنه قد يسرد الكائنات المدمجة ([#84](https://github.com/40oleg/nona/issues/84)). يبلغ حجم hello world نحو 1.1 MB؛ ومع كل الأجزاء 7 MB.

المساعدات التي لا يحتاجها إلا بعض الصياغة تُربط عندما يستدعيها البرنامج المترجَم، لا بالاسم: عبارات `with` و`eval` الحرفي وحقول الأصناف والأسماء الخاصة ووحدات ES مع `import()` و`import.meta` ([#278](https://github.com/40oleg/nona/issues/278)).

يستطيع البرنامج مع ذلك الوصول إلى جزء محذوف عبر اسم يُحسب وقت التشغيل، مثل `globalThis['Reg' + 'Exp']`. وفي حالة محرك RegExp وجداول Unicode يرمي هذا الاستدعاء `Error` تسمّي رسالته الجزء المفقود؛ أما الكائن العام أو التابع المحذوف فيكون غائبًا ببساطة. ترجم مع `--full-runtime` (أو الخيار `fullRuntime` في [`compile()`](/ar/reference/api)) لربط كل شيء ([#62](https://github.com/40oleg/nona/issues/62)). يضيف `--link جزء,...` أجزاء منفردة، ويعرض `--print-link` ما رُبط والاسم الذي اختار كل جزء ([#182](https://github.com/40oleg/nona/issues/182)).

## العوالم (Realms)

‏`$262.createRealm` مدعوم لأجل Test262. الدوال والأصناف وشيفرة eval المُنشأة بمصدر حرفي عبر `Function` أو `eval` أو مُنشئات الدوال الديناميكية لعالم آخر تعمل في ذلك العالم، وتأتي النماذج الأولية الافتراضية وأخطاء المُنشئات من العالم الذي تحدده ECMA-262 ([#7](https://github.com/40oleg/nona/issues/7), [#176](https://github.com/40oleg/nona/issues/176)).

## المنصات

- ‏`process` و`node:fs` متاحان على المنصات الثماني؛ وHTTP وTCP (`node:http` و`node:net`) على Windows وLinux.
- تستخدم الملفات التنفيذية لـ Windows ملفات DLL الخاصة بالنظام (ومنها NTDLL لبيانات العملية الأم) واستيرادات FFI المصرَّح عنها؛ وتستخدم الملفات التنفيذية لأنظمة POSIX خدمات نظام التشغيل الأصلية.
- استدعاء ملفات DLL عبر FFI يتطلب Windows؛ وتستخدم استدعاءات النظام الخام أرقام النواة الخاصة بالمنصة المختارة من Linux أو Darwin أو BSD. التفاصيل: [المنصات الأصلية](/reference/native-platforms).

## Buffer

Global `Buffer`, `Blob` and `File`, and `node:buffer` / `buffer` / `nona:buffer` imports are available on every native target. Buffer supports standard byte encodings, shared slices, copying, searching and numeric access. Blob/File support immutable data and metadata. Blob byte/text streams and object URL registration/resolution are available; see [the API contract and limitations](/reference/host-apis#buffer-and-binary-data).
