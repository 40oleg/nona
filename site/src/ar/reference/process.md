# واجهة process

::: info ترجمة
هذه الصفحة ترجمة للصفحة الإنجليزية [Process API](/reference/process) المولَّدة من [`docs/process.md`](https://github.com/40oleg/nona/blob/main/docs/process.md). النسخة الإنجليزية هي المرجع المعتمد وقد تكون أحدث.
:::

‏`process` كائن عام (كما في Node.js)، ومتاح أيضًا بوصفه التصدير الافتراضي لـ `node:process` و`nona:process`، اللتين تصدّران إضافةً إلى ذلك `argv` و`env` و`platform` و`arch` و`pid` و`execPath` و`exit` و`cwd`.

| العضو | ملاحظات |
| --- | --- |
| `argv` | `[execPath, ...arguments]`. لا يوجد مسار سكربت: `argv[1]` هو الوسيط الأول (يضع Node.js هناك مسار السكربت). على Windows يُقسَّم سطر الأوامر وفق قواعد `CommandLineToArgvW`. |
| `env` | كائن عادي يحمل لقطة من البيئة عند أول وصول. لا تُمرَّر التغييرات إلى نظام التشغيل. على Windows تُتخطّى المدخلات المخفية من نوع `=C:`. |
| `exit(code?)` | ينهي العملية فورًا بالرمز `code`، أو بالقيمة `process.exitCode` (الافتراضي 0). |
| `exitCode` | يُستخدم كحالة خروج حين ينتهي البرنامج انتهاءً طبيعيًا. |
| `execPath` | المسار المطلق للملف التنفيذي قيد التشغيل. |
| `cwd()` | مجلد العمل الحالي. |
| `platform` و`arch` و`pid` | ‏`'win32'` أو `'linux'`، و`'x64'`، ومعرّف العملية. |

يُبنى `process` بكسل عند أول وصول، لذا لا تدفع البرامج التي لا تستخدمه أي كلفة عند الإقلاع. وعلى خلاف Node.js ليس EventEmitter، ولا يملك تدفقات `stdout`/`stdin` ولا `nextTick` ولا `hrtime` ولا `memoryUsage`.

التنفيذ: تحتوي كل صورة على دوال المضيف للمنصتين، لذا يمكن ربط البرنامج المولَّد نفسه بصيغة PE وبصيغة ELF؛ ويربط كل رابط استيرادات المنصة الأخرى بدالة بديلة تعيد 0. على Windows تُقرأ `GetCommandLineW` و`GetEnvironmentStringsW` و`GetModuleFileNameW` و`GetCurrentDirectoryW` عبر دوال FFI وسيطة يثبّتها المترجم لمقدّمته الخاصة؛ وعلى Linux تُقرأ `/proc/self/cmdline` و`/proc/self/environ` و`/proc/self/exe` وتُستدعى `getcwd`/`exit_group` مباشرةً.
