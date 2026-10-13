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

الدوال العامة: `setTimeout(callback, delay, ...args)` و`setInterval` و`clearTimeout` و`clearInterval` و`setImmediate(callback, ...args)`, `clearImmediate`, `queueMicrotask(callback)` و`performance.now()`.

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

## URL {#url}

يتبع الكائنان العامان `URL` و`URLSearchParams` (وتصدّرهما `node:url` أيضًا) [معيار URL](https://url.spec.whatwg.org/): المخططات الخاصة (`http` و`https` و`ws` و`wss` و`ftp` و`file`) مع منافذها الافتراضية، والشرطات المائلة العكسية ومقاطع النقاط، والمراجع النسبية إلى عنوان أساس، والمخططات الأخرى ذات الجزء authority أو المسار المعتم (`mailto:` و`data:` و`blob:`)، ومجموعات الترميز بالنسبة المئوية القياسية، وأرقام IPv4 بأي صيغة، وعناوين IPv6. يمكن قراءة كل مكوّن وتعيينه، ويبقى `searchParams` متزامنًا مع `search`. ويتوفر `URL.canParse` و`URL.parse`. تُحوَّل أسماء المضيفين إلى أحرف صغيرة لكنها لا تُحوَّل عبر IDNA: فعنوان URL ذو المضيف غير ASCII يرمي `ERR_INVALID_URL`. ولا يُربط المحلّل بالبرنامج إلا إذا ذكرت مصادره `URL` أو `URLSearchParams`. تُثبَّت توابعه وموصّلاته على `URL.prototype` و`URLSearchParams.prototype` عند إنشاء أول كائن URL أو معاملات بحث (أو عند استدعاء `URL.canParse`)، مما يُبقي كومة البرامج التي لا تحلّل أي URL صغيرة.

## وحدات دعم Node.js {#nodejs-support-modules}

توجد هذه الوحدات أساسًا من أجل [حزم npm](/reference/npm) التي تحمّلها عند بدء التشغيل. وكل منها متاحة باسم `node:<name>` و`<name>`.

- `node:os`: `EOL` و`devNull` و`platform` و`arch` و`machine` و`type` و`endianness`، و`homedir` (`HOME`، أو `USERPROFILE` على Windows)، و`tmpdir` (`TMPDIR`/`TMP`/`TEMP`)، و`hostname` (`HOSTNAME`/`COMPUTERNAME` أو `localhost`)، و`userInfo` و`uptime` و`freemem` و`totalmem`، و`constants.signals`/`priority`. القيمتان `release` و`version` سلسلتان فارغتان، و`cpus()` و`networkInterfaces()` فارغتان، و`loadavg()` أصفار، و`availableParallelism()` تساوي 1.
- `node:tty`: تخبر `isatty(fd)` إن كان الدخل القياسي أو الخرج القياسي أو خرج الأخطاء طرفيةً؛ و`ReadStream` و`WriteStream` صنفان بسيطان لاكتشاف الميزات.
- `node:util`: `format` و`formatWithOptions` (`%s %d %i %f %j %o %O %c %%`)، و`inspect` (مع `inspect.custom` و`depth` و`breakLength` و`maxArrayLength` و`customInspect`)، و`inherits`، و`promisify` (مع `promisify.custom`)، و`callbackify`، و`deprecate` (يحذّر مرة واحدة لكل رمز)، و`debuglog` (`NODE_DEBUG`)، و`isDeepStrictEqual` و`types` و`styleText` و`stripVTControlCharacters` و`TextEncoder`/`TextDecoder`، والدوال الشرطية القديمة `is*`. تقارب `inspect` تنسيق Node.js: تُعرض الكائنات والمصفوفات وMap وSet والمصفوفات المنمّطة والدوال والأصناف والأخطاء والتواريخ والقيم المغلّفة والـ getters والمراجع الدائرية، لكن الألوان و`showHidden` و`sorted` وتجميع Node.js للمصفوفات الطويلة في أعمدة لا تُستنسخ بدقة. و`node:util/types` هي `util.types`.
- `node:url`: `URL` و`URLSearchParams` و`fileURLToPath` و`pathToFileURL` (أحرف الأقراص ومضيفو UNC على Windows) و`urlToHttpOptions` و`domainToASCII`/`domainToUnicode` (ASCII فقط)، والدوال القديمة `parse` و`format` و`resolve`.
- `node:assert` و`node:assert/strict`: `ok` و`equal` و`notEqual` و`strictEqual` و`notStrictEqual` و`deepEqual` و`deepStrictEqual` ونفيها، و`throws` و`doesNotThrow` و`rejects` و`doesNotReject` و`match` و`doesNotMatch` و`ifError` و`fail`، و`AssertionError` (`code` ‏`ERR_ASSERTION`). رسائل الفشل أقصر من فروق Node.js.
- `node:crypto`: تقرأ `randomBytes` و`randomFill`/`randomFillSync` و`randomUUID` (الإصدار 4) و`randomInt` و`getRandomValues` و`webcrypto.getRandomValues` من مصدر العشوائية في نظام التشغيل (`BCryptGenRandom` على Windows، و`/dev/urandom` في غيره). وتتوفر كذلك `createHash` (`md5` و`sha1` و`sha256` و`sha384` و`sha512`، مع `update` و`digest` بأي ترميز من ترميزات Buffer و`copy`) و`createHmac` و`hash` و`getHashes` و`timingSafeEqual`. لا تتوفر الشيفرات والمفاتيح والتواقيع واشتقاق المفاتيح و`crypto.subtle`، ولا يوجد `crypto` عام.
- `node:querystring`: `parse`/`decode` و`stringify`/`encode` و`escape` و`unescape`.
- `node:timers`: دوال المؤقتات العامة. `node:timers/promises`: `setTimeout` و`setImmediate` (كلتاهما مع `AbortSignal`)، و`setInterval` كمكرّر غير متزامن، و`scheduler.wait`/`yield`.
- `node:perf_hooks`: `performance`؛ و`PerformanceObserver` و`monitorEventLoopDelay` لا يراقبان شيئًا.
- `node:module`: `builtinModules` و`isBuiltin`. ترمي `createRequire` الخطأ `ERR_NONA_UNSUPPORTED`: فالوحدات تُحلّ عند بناء البرنامج.
- `node:worker_threads`: `isMainThread` تساوي `true`، و`parentPort` و`workerData` تساويان `null`؛ وترمي `Worker` الخطأ `ERR_NONA_UNSUPPORTED`.
- `node:child_process`: ترمي كل الدوال و`ChildProcess` الخطأ `ERR_NONA_UNSUPPORTED`. توجد الوحدة كي تُحمَّل الحزم التي تكتفي بذكرها.
