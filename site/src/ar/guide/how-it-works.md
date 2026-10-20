# كيف يعمل

## مراحل الترجمة

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

يجري كل شيء داخل عملية المترجم؛ فلا يوجد مجمِّع أو رابط أو مترجم C خارجي. والنتيجة ملف واحد يحتوي على شيفرة الآلة الخاصة بالبرنامج وعلى بيئة تشغيل Nona.

## الواجهة الأمامية

يحوّل [`src/frontend`](https://github.com/40oleg/nona/tree/main/src/frontend) النص المصدري إلى برنامج مربوط:

- ينتج `lexer.ts` و`parser.ts` و`ast.ts` شجرة الصياغة؛ والصيغة غير المدعومة خطأ ترجمة.
- يطبّق `binder.ts` و`declarations.ts` الأخطاء المبكرة، ويربطان كل معرّف بنطاق (عام، أو نطاق وحدة، أو دالة، أو كتلة، أو كائن `with`)، ويقرّران أي الارتباطات تعيش في الإغلاقات (closures).
- يحمّل `modules.ts` مخطط الوحدات: الاستيرادات الثابتة، و`import()` بمحدِّدات حرفية، والدورات، وحلّ التصديرات. ويوفّر `builtin-modules.ts` و`fs-module.ts` الوحدات `nona:*` و`node:*`.
- يترجم `eval-aot.ts` و`dynamic-functions.ts` استدعاءات `eval` و`Function` التي يكون نصها المصدري معروفًا وقت الترجمة.

## التمثيل الوسيط

يخفّض [`src/ir`](https://github.com/40oleg/nona/tree/main/src/ir) البرنامج المربوط إلى تمثيل وسيط شبيه بالمسجّلات مؤلَّف من كتل وعمليات ومُنهيات (`lower.ts` و`model.ts`)، ويحسب الحيوية (`liveness.ts`) كي لا يرى جامع المهملات عند كل نقطة آمنة (safepoint) إلا القيم الحية.

قبل توليد الشيفرة، يمرّ التمثيل الوسيط لكل دالة بتحسينات تحافظ على دلالات JavaScript تمامًا: طيّ الثوابت ونشرها مع حذف التفرعات ذات الشروط المعروفة، وحذف فحوص المنطقة الميتة المؤقتة، وتمرير النسخ وحذف الشيفرة الميتة، والاستبدال العددي للقيم الحرفية للكائنات والمصفوفات التي لا تهرب، واستنتاج النوع Number، والاستدعاءات المباشرة للدوال المعروفة ([البنية](https://github.com/40oleg/nona/blob/main/docs/architecture.md#ir-optimization)).

## توليد الشيفرة

يحتوي [`src/backend/x64`](https://github.com/40oleg/nona/tree/main/src/backend/x64) على مرمِّز تعليمات ومجمِّع x86-64 وعلى مولّد الشيفرة الذي يحوّل عمليات التمثيل الوسيط إلى استدعاءات لبيئة التشغيل وإلى مسارات سريعة مضمَّنة؛ ويفعل [`src/backend/arm64`](https://github.com/40oleg/nona/tree/main/src/backend/arm64) الشيء نفسه لـ AArch64. وتتبع الشيفرة المولَّدة اصطلاح استدعاء منطقيًا مشتركًا؛ وتحوّله جسور نظام التشغيل إلى واجهة ABI الأصلية لكل منصة.

## بيئة التشغيل

يحتوي كل ملف تنفيذي على بيئة التشغيل من [`src/runtime`](https://github.com/40oleg/nona/tree/main/src/runtime):

- **القيم** أزواج موسومة بحجم 16 بايت: undefined وnull والقيم المنطقية وأعداد binary64 وسلاسل UTF-16 والكائنات والرموز وBigInt.
- **الكائنات** التي تنشئها القيم الحرفية والمُنشئات تتشارك _أشكالًا_ (shapes، أي الأصناف المخفية): تُحفظ خصائصها في خانات بحجم 16 بايت يصفها الشكل، وتقرؤها ذاكرات التخزين المضمّنة في الشيفرة المولَّدة وتكتبها بعد مقارنة شكل واحدة. وما لا يستطيع الشكل وصفه (الموصِّلات، والحذف، والسمات الأخرى، ومفاتيح الرموز) يحوّل الكائن إلى قائمة خصائص مرتّبة تحصل على فهرس تجزئة حين تطول.
- **الشيفرة الأصلية** للكائنات المدمجة تُصدَر بصيغة x86-64 عبر باني صغير (`RuntimeBuilder`).
- **مقدّمات JavaScript** (`src/lib/runtime/*.js`) تنفّذ أجزاءً من المكتبة بلغة JavaScript وتُترجَم في كل ملف تنفيذي: محرك RegExp، ومشغّلات Promise وasync، ومساعدات Proxy وReflect، والمؤقتات وحلقة الأحداث، و`process`، و`TextEncoder`/`TextDecoder`، والكائنات المدمجة في Annex B.

### التعليمات المتجهية (SIMD)

تعالج الإجراءات الأكثر استخدامًا في بيئة التشغيل 16 بايتًا في كل خطوة بتعليمات متجهية بعرض 128 بت: SSE2 على x86-64 وNEON على ARM64. يملكها كل معالج من هاتين المعماريتين، فلا يحتاج الملف التنفيذي إلى فحص المعالج ويعمل في أي مكان؛ ولا يُستخدم AVX ([#253](https://github.com/40oleg/nona/issues/253)).

- **السلاسل النصية:** مساواة سلسلتين وترتيبهما، و`indexOf` و`includes` و`lastIndexOf` و`split` و`replaceAll` (بحث متجهي عن أول وحدة في النمط)، ونسخ وحدات الترميز.
- **المصفوفات المنمّطة:** `fill` و`copyWithin` و`slice` و`set` و`indexOf` و`lastIndexOf` و`includes` تنقل كتل الذاكرة أو تقارنها.
- **المصفوفات:** `shift` و`splice` تنقلان خانات العناصر 64 بايتًا في كل خطوة ([#262](https://github.com/40oleg/nona/issues/262)).
- **RegExp:** النمط الذي لا يمكن أن تبدأ مطابقاته إلا بإحدى ثماني وحدات ترميز على الأكثر يقفز إليها بمسح متجهي قبل كل محاولة ([#258](https://github.com/40oleg/nona/issues/258)).
- **الذاكرة:** تُصفَّر كتل الكومة الجديدة بعمليات كتابة من 16 بايتًا.

قِيس في [`docs/simd.md`](https://github.com/40oleg/nona/blob/main/docs/simd.md) (بالإنجليزية) أين تذهب تعليمات البرامج الحقيقية وأي الإجراءات تسرّعها المتجهات.

### جامع المهملات

الجامع دقيق ولا ينقل الكائنات: mark-and-sweep على جذور صريحة (المتغيرات العامة، وخانات المكدس الحية عند النقاط الآمنة، ونطاقات الجذور في بيئة التشغيل). تُحتسَب مكدسات الروتينات المشتركة (coroutines) الخاصة بالمولّدات والدوال غير المتزامنة (1 MiB لكل منها) ضمن عتبة الجمع. وعلى Linux تأتي كتل الكومة من فئات أحجام مقتطعة من ساحات (arenas) بحجم 1 MiB. والعقد الداخلي للذاكرة موصوف في [`docs/runtime-memory.md`](https://github.com/40oleg/nona/blob/main/docs/runtime-memory.md) (بالروسية).

### الاستثناءات والروتينات المشتركة وحلقة الأحداث

- تفكّ الاستثناءات الإطارات الأصلية باستخدام بيانات فكّ (unwind) حقيقية؛ وطفح المكدس يرمي `RangeError` يمكن التقاطه.
- تعمل المولّدات والدوال غير المتزامنة على مكدساتها الخاصة وتبدّل السياق عند `yield` و`await`.
- بعد انتهاء البرنامج في المستوى الأعلى تشغّل نقطة الدخول حلقة الأحداث: تفرغ مهام Promise، وتنتظر المؤقت التالي دون استهلاك المعالج، وتخرج حين لا يبقى شيء ([التفاصيل](/ar/reference/host-apis)).

## الربط

- **PE32+** ([`src/backend/pe`](https://github.com/40oleg/nona/tree/main/src/backend/pe)): الأقسام، وجدول الاستيراد (KERNEL32 لبيئة التشغيل، إضافةً إلى ملفات DLL المصرَّح عنها عبر FFI)، وإعادات التموضع الأساسية، وبيانات الفكّ، والموارد (الأيقونة والبيان ومعلومات الإصدار).
- **ELF64** ([`src/backend/elf`](https://github.com/40oleg/nona/tree/main/src/backend/elf) و[`src/backend/linux`](https://github.com/40oleg/nona/tree/main/src/backend/linux) و[`src/backend/bsd`](https://github.com/40oleg/nona/tree/main/src/backend/bsd)): لكل دالة من KERNEL32 تستخدمها بيئة التشغيل طبقة وسيطة (shim) على استدعاءات النظام باصطلاح الاستدعاء نفسه، لذا تتشارك المنصات شيفرة بيئة التشغيل. ويجري Linux وأنظمة BSD استدعاءات النواة مباشرةً دون libc.
- **Mach-O64** ([`src/backend/macho`](https://github.com/40oleg/nona/tree/main/src/backend/macho) و[`src/backend/darwin`](https://github.com/40oleg/nona/tree/main/src/backend/darwin)): تستخدم الملفات التنفيذية لنظام macOS على Intel استدعاءات النواة المباشرة أيضًا؛ أما الملفات التنفيذية لـ Apple Silicon فتحمّل `libSystem.B.dylib` الخاصة بالنظام عبر dyld للإقلاع وخدمات نظام التشغيل.

تخدم بيئة التشغيل نفسها المنصات الثماني جميعًا؛ وتسرد صفحة [المنصات الأصلية](/reference/native-platforms) ما جرى التحقق منه وأين.

## الاستضافة الذاتية

يترجم المترجم نفسه. إن `nona` المنشور ملف تنفيذي أصلي بناه Nona دون أي Node.js بداخله؛ وعلى Windows وLinux x64 يعيد بناء نفسه إلى مرحلة ثانية مطابقة بايتًا ببايت. يصف [دليل الإقلاع الذاتي](https://github.com/40oleg/nona/blob/main/docs/self-hosting.md) الإجراء وفحوصاته.

## FFI

يُحَلّ الاستدعاء `define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)')` وقت الترجمة: يصبح التصريح مُدخلًا في جدول الاستيراد PE ودالة وسيطة أصلية (thunk) تحوّل قيم JavaScript وتتبع واجهة Win64 الثنائية وتلتقط `GetLastError`. وعلى Linux يصرّح `define('syscall', '1', …)` عن استدعاء نظام خام. راجع [الدوال الأصلية (FFI)](/ar/reference/ffi).

## بنية المستودع

```text
src/frontend       lexer, parser, early errors, scope binding, compile-time eval/Function
src/ir             intermediate representation, lowering and liveness
src/backend/x64    x86-64 encoding and code generation
src/backend/arm64  AArch64 encoding and code generation
src/backend/pe     PE32+ linker: imports, relocations, unwind data, resources
src/backend/elf    ELF64 linker; src/backend/linux, bsd: system-call shims
src/backend/macho  Mach-O64 linker; src/backend/darwin: macOS services
src/runtime        native runtime and JavaScript preludes emitted into every executable
tests              unit, integration, native-execution and compatibility tests
examples           sample programs
site               this documentation site
```

## نموذج أولي للتحقق الصوري

تغطي [براهين Lean](https://github.com/40oleg/nona/blob/main/docs/formal-verification.md) قواعد نقل الخانات المختارة ومحسّنًا نموذجيًا لحذف عمليات النقل الميتة في الشيفرة الخطية. نفّذ `npm run check:proofs` مع تثبيت Lean/elan. أما المترجم الإنتاجي وتحليل CFG وبيئة التشغيل الأصلية فخارج الضمان الصوري الحالي.
