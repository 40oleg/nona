# واجهات المضيف

::: info ترجمة
هذه الصفحة ترجمة للصفحة الإنجليزية [Host APIs](/reference/host-apis) المولَّدة من [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md). النسخة الإنجليزية هي المرجع المعتمد وقد تكون أحدث.
:::

تعمل برامج Nona دون Node.js. واجهات المضيف أدناه تنفّذها بيئة التشغيل الأصلية ومقدّمات JavaScript صغيرة تُترجَم في كل ملف تنفيذي.

## المؤقتات وحلقة الأحداث

الدوال العامة: `setTimeout(callback, delay, ...args)` و`setInterval` و`clearTimeout` و`clearInterval` و`queueMicrotask(callback)` و`performance.now()`.

- بعد انتهاء البرنامج في المستوى الأعلى تشغّل نقطة الدخول حلقة أحداث: تفرغ طابور مهام Promise، ثم تنتظر مرارًا أقرب موعد لمؤقت، وتنفّذ دالة الاستدعاء الخاصة به، ثم تفرغ طابور المهام من جديد. وتنتهي العملية حين لا تبقى مؤقتات.
- تُرتَّب المؤقتات حسب الموعد ثم حسب ترتيب التسجيل. ويتبع التأخير سلوك Node.js: يُحوَّل عبر `ToNumber`، والقيم `NaN` أو الأصغر من 1 أو الأكبر من 2^31-1 تصبح 1.
- معرّفات المؤقتات أعداد (يعيد Node.js كائنات `Timeout`). تقبل `clearTimeout` و`clearInterval` أي معرّف؛ وتُتجاهَل المعرّفات غير المعروفة.
- يستخدم الانتظار `Sleep` على Windows و`nanosleep` على Linux، لذا لا يستهلك البرنامج الخامل المعالج. وعلى Windows تساوي الدقة نبضة مؤقت النظام (عادةً 15.6 ms).
- يستخدم `performance.now()` الساعة الرتيبة (`QueryPerformanceCounter` و`clock_gettime(CLOCK_MONOTONIC)`) ويعدّ الميلي ثانية منذ بدء البرنامج.
- الاستثناء غير الملتقط داخل دالة استدعاء مؤقت ينهي العملية برمز الخروج 1، تمامًا مثل الاستثناء غير الملتقط في البرنامج في المستوى الأعلى.
- العوالم (realms) التي ينشئها مضيف Test262 لا تثبّت مؤقتات خاصة بها.

## البرامج طويلة التشغيل

- يحتسب جامع المهملات مكدسات الروتينات المشتركة المحجوزة (1 MiB لكل دالة غير متزامنة أو مولّد قيد التشغيل، `rt.generatorStackBytes`) ضمن عتبته، لذا فالروتينات المشتركة المتروكة، التي لا تحرّر مكدساتها إلا مرحلة الكنس، تطلق عمليات جمع كما تفعل المهملات العادية.
- يتحقق `tests/stability.test.ts` من أن زيادة عدد مرات انطلاق المؤقتات عشرة أضعاف (مع مهام Promise ومهملات في كل نبضة) لا ترفع ذروة الذاكرة، وأن آلاف الروتينات المشتركة المتروكة تُحرَّر، وأن برنامجًا ينتظر مؤقتًا مدته ثانيتان لا يكاد يستهلك المعالج.
- قيود معروفة: تخزين الخصائص والعناصر وMap خطي (#36)، لذا تتباطأ البرامج التي فيها مئات المؤقتات الحية أو كائنات كبيرة؛ وعلى Linux كل كتلة من الكومة تعيين ذاكرة مستقل (#37).


## Native target availability

Windows/Linux x64 and ARM64, Intel macOS and FreeBSD/OpenBSD x64 targets are available. Apple Silicon startup is not enabled. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
