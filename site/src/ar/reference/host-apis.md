# واجهات المضيف

::: info ترجمة
هذه الصفحة ترجمة للصفحة الإنجليزية [Host APIs](/reference/host-apis) المولَّدة من [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md). النسخة الإنجليزية هي المرجع المعتمد وقد تكون أحدث.
:::

تعمل برامج Nona دون Node.js. واجهات المضيف أدناه تنفّذها بيئة التشغيل الأصلية ومقدّمات JavaScript صغيرة تُترجَم في كل ملف تنفيذي.

## Paths (`node:path`)

`node:path` / `path` implements Node.js 26 path utilities on all eight native targets.
Use `posix`, `win32`, or explicit flavor modules (`node:path/posix`,
`node:path/win32`, `path/posix`, `path/win32`). Functions: `normalize`, `join`,
`resolve`, `relative`, `parse`, `format`, `basename`, `dirname`, `extname`,
`isAbsolute`, `toNamespacedPath`, `matchesGlob`; properties: `sep`, `delimiter`.
The target selects the default flavor; resolution reads the executable's runtime
current directory. Working-directory information is read on demand; importing
Path does not initialize the full process object. [Full reference](https://github.com/40oleg/nona/blob/main/docs/path.md).

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

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.

## Events

`node:events`, `events` and `nona:events` share one built-in module. The default
export is `EventEmitter`; listener ordering, once/prepend listeners, removal,
introspection, meta events, error monitoring and rejection capture are supported.
Promise `once` and async-iterator `on` include cleanup, close events, externally
supplied abort signals and emitter watermarks. Listener/max-listener helpers and
disposable `addAbortListener` subscriptions under `Symbol.dispose` are also available.
`Symbol.dispose` and `Symbol.asyncDispose` have the distinct symbol identities used by Node.js 26.

See the [English events reference](/reference/host-apis#events) for the
complete supported API and limitations.

Event globals (`Event`, `CustomEvent`, `EventTarget`, `AbortController`,
`AbortSignal`) and `NodeEventTarget` are supported, including cancellation,
protected abort subscriptions and target introspection. `EventEmitterAsyncResource`
and `node:async_hooks` / `nona:async_hooks` provide explicit resources, hooks and
local context storage. Promise, await, timer and microtask callbacks preserve
captured context. Saved bind, snapshot and resource stores survive later scope changes; registration reuses immutable contexts without copying a Map per reaction. Native resource hooks and automatic GC destruction are outside
this API; see the English reference for the precise boundaries.


AbortSignal.timeout uses an unreferenced cancellation timer. The signal and its listeners do not keep a process alive; it can fire while ordinary timers keep the event loop active.
