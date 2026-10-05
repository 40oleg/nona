# البدء

## المتطلبات

- لتشغيل المترجم: Node.js 26 أو أحدث مع npm، على Windows أو Linux.
- المنصات المستهدفة: Windows 10/11 x64 (`win32-x64`، وهي الافتراضية) وLinux x86-64 (`linux-x64`).

## بناء المترجم

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
```

نقطة دخول المترجم هي `dist/cli.js`؛ وتشغّله أمثلة هذا الموقع بالأمر `node dist/cli.js`. كما تعرّف الحزمة أمرًا باسم `nona`: تنفيذ `npm link` داخل المستودع يضيفه إلى `PATH`.

## برنامجك الأول

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
node dist/cli.js build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux]
node dist/cli.js build hello.js -o build/hello --target linux-x64
./build/hello
```

:::

```text
Hello, from Nona!
a microtask runs before any timer
tick 1
tick 2
tick 3
done; at least 30 ms passed: true
```

ينتهي البرنامج حين لا تبقى مؤقتات ولا مهام Promise. ويعمل الملف التنفيذي وحده: انسخه إلى جهاز لا يوجد عليه Node.js وسيظل يعمل.

## المنصات المستهدفة والترجمة المتقاطعة

المترجم مترجم متقاطع: على Windows يمكنه إنتاج ملفات تنفيذية لـ Linux، وعلى Linux يمكنه إنتاج ملفات تنفيذية لـ Windows. يختار الخيار `--target` صيغة الناتج، والقيمة الافتراضية `win32-x64`. تُكتب مخرجات Linux بالصلاحيات `0755`.

## الوحدات

المدخل بامتداد `.mjs`، أو أي مدخل يُترجَم مع `--module`، هو وحدة ES. تُحَلّ الاستيرادات النسبية (`./util.mjs` و`../lib/x.mjs`) بجوار الملف المستورِد وتُترجَم في الملف التنفيذي نفسه. تستخدم الوحدات المدمجة البادئة `nona:` (`nona:ffi` و`nona:win32` و`nona:fs` و`nona:process`)، أما `node:fs` و`node:process` فهما اسمان مستعاران للمجموعتين الفرعيتين في Nona؛ راجع [الوحدات المدمجة](/ar/reference/modules).

## برنامج Windows بلا نافذة طرفية

```sh
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

يشغّل `--subsystem windows` البرنامج بلا نافذة طرفية ويضمّن بيانًا افتراضيًا؛ ويضيف `--icon` و`--version-info` موارد يعرضها مستكشف الملفات. راجع [الملفات التنفيذية لـ Windows](/ar/reference/windows-executables) و[مثال Museum](/ar/examples/museum).

## حل المشكلات

تُطبع أخطاء الترجمة بالشكل `file:line:column CODE: message` ويخرج المترجم برمز الحالة 1:

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- تُرفض الصيغة غير المدعومة وقت الترجمة بدلًا من أن تفشل وقت التشغيل.
- يعني `E_FFI_TARGET` أن تصريح DLL تُرجم للمنصة `linux-x64` (أو أن استدعاء نظام تُرجم للمنصة `win32-x64`).
- يعني ظهور `EvalError` وقت التشغيل أن `eval` أو `Function` تلقّى نصًا مصدريًا لم يكن معروفًا وقت الترجمة.

يسرد [مرجع سطر الأوامر](/ar/reference/cli) جميع الخيارات والأخطاء.

## الأنظمة الأصلية

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — الأنظمة الأصلية](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.
