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

## توليد الشيفرة

يحتوي [`src/backend/x64`](https://github.com/40oleg/nona/tree/main/src/backend/x64) على مرمِّز تعليمات ومجمِّع x86-64 وعلى مولّد الشيفرة الذي يحوّل عمليات التمثيل الوسيط إلى استدعاءات لبيئة التشغيل وإلى مسارات سريعة مضمَّنة. وتتبع الشيفرة المولَّدة وبيئة التشغيل اصطلاح الاستدعاء Win64 على المنصتين.

## بيئة التشغيل

يحتوي كل ملف تنفيذي على بيئة التشغيل من [`src/runtime`](https://github.com/40oleg/nona/tree/main/src/runtime):

- **القيم** أزواج موسومة بحجم 16 بايت: undefined وnull والقيم المنطقية وأعداد binary64 وسلاسل UTF-16 والكائنات والرموز وBigInt.
- **الكائنات** التي تنشئها القيم الحرفية والمُنشئات تتشارك *أشكالًا* (shapes، أي الأصناف المخفية): تُحفظ خصائصها في خانات بحجم 16 بايت يصفها الشكل، وتقرؤها ذاكرات التخزين المضمّنة في الشيفرة المولَّدة وتكتبها بعد مقارنة شكل واحدة. وما لا يستطيع الشكل وصفه (الموصِّلات، والحذف، والسمات الأخرى، ومفاتيح الرموز) يحوّل الكائن إلى قائمة خصائص مرتّبة تحصل على فهرس تجزئة حين تطول.
- **الشيفرة الأصلية** للكائنات المدمجة تُصدَر بصيغة x86-64 عبر باني صغير (`RuntimeBuilder`).
- **مقدّمات JavaScript** (`*-source.ts`) تنفّذ أجزاءً من المكتبة بلغة JavaScript وتُترجَم في كل ملف تنفيذي: محرك RegExp، ومشغّلات Promise وasync، ومساعدات Proxy وReflect، والمؤقتات وحلقة الأحداث، و`process`، و`TextEncoder`/`TextDecoder`، والكائنات المدمجة في Annex B.

### جامع المهملات

الجامع دقيق ولا ينقل الكائنات: mark-and-sweep على جذور صريحة (المتغيرات العامة، وخانات المكدس الحية عند النقاط الآمنة، ونطاقات الجذور في بيئة التشغيل). تُحتسَب مكدسات الروتينات المشتركة (coroutines) الخاصة بالمولّدات والدوال غير المتزامنة (1 MiB لكل منها) ضمن عتبة الجمع. وعلى Linux تأتي كتل الكومة من فئات أحجام مقتطعة من ساحات (arenas) بحجم 1 MiB. والعقد الداخلي للذاكرة موصوف في [`docs/runtime-memory.md`](https://github.com/40oleg/nona/blob/main/docs/runtime-memory.md) (بالروسية).

### الاستثناءات والروتينات المشتركة وحلقة الأحداث

- تفكّ الاستثناءات الإطارات الأصلية باستخدام بيانات فكّ (unwind) حقيقية؛ وطفح المكدس يرمي `RangeError` يمكن التقاطه.
- تعمل المولّدات والدوال غير المتزامنة على مكدساتها الخاصة وتبدّل السياق عند `yield` و`await`.
- بعد انتهاء البرنامج في المستوى الأعلى تشغّل نقطة الدخول حلقة الأحداث: تفرغ مهام Promise، وتنتظر المؤقت التالي دون استهلاك المعالج، وتخرج حين لا يبقى شيء ([التفاصيل](/ar/reference/host-apis)).

## الربط

- **PE32+** ([`src/backend/pe`](https://github.com/40oleg/nona/tree/main/src/backend/pe)): الأقسام، وجدول الاستيراد (KERNEL32 لبيئة التشغيل، إضافةً إلى ملفات DLL المصرَّح عنها عبر FFI)، وإعادات التموضع الأساسية، وبيانات الفكّ، والموارد (الأيقونة والبيان ومعلومات الإصدار).
- **ELF64** ([`src/backend/elf`](https://github.com/40oleg/nona/tree/main/src/backend/elf) و[`src/backend/linux`](https://github.com/40oleg/nona/tree/main/src/backend/linux)): لكل دالة من KERNEL32 تستخدمها بيئة التشغيل طبقة وسيطة (shim) على استدعاءات نظام Linux باصطلاح الاستدعاء نفسه، لذا تتشارك المنصتان شيفرة بيئة التشغيل.

## FFI

يُحَلّ الاستدعاء `define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)')` وقت الترجمة: يصبح التصريح مُدخلًا في جدول الاستيراد PE ودالة وسيطة أصلية (thunk) تحوّل قيم JavaScript وتتبع واجهة Win64 الثنائية وتلتقط `GetLastError`. وعلى Linux يصرّح `define('syscall', '1', …)` عن استدعاء نظام خام. راجع [الدوال الأصلية (FFI)](/ar/reference/ffi).

## بنية المستودع

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

## الأنظمة الأصلية

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — الأنظمة الأصلية](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.

## Formal verification prototype

[Lean proofs](https://github.com/40oleg/nona/blob/main/docs/formal-verification.md) cover selected slot move rules and a modeled straight-line dead-move optimizer. Run `npm run check:proofs` with Lean/elan installed. The production compiler, CFG analysis and native runtime are outside the current formal guarantee.
