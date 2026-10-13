# البدء

## التثبيت

نزّل الأرشيف الخاص بنظامك من [أحدث إصدار](https://github.com/40oleg/nona/releases/latest)، وفُكّ ضغطه ثم شغّل `nona --help` (أو `./nona --help` على Linux وmacOS وBSD). يحتوي الأرشيف على الملف التنفيذي والرخصة وملف الإصدار؛ والمترجم برنامج أصلي لا يحتاج إلى Node.js. ويسرد كل إصدار أيضًا الملف `SHA256SUMS`.

| نظام التشغيل                | الأرشيف                                        | اسم المنصة                   |
| --------------------------- | ---------------------------------------------- | ---------------------------- |
| Windows x64 / ARM64         | `nona-win32-x64.zip`, `nona-win32-arm64.zip`   | `win32-x64`, `win32-arm64`   |
| Linux x64 / ARM64           | `nona-linux-x64.zip`, `nona-linux-arm64.zip`   | `linux-x64`, `linux-arm64`   |
| macOS Intel / Apple Silicon | `nona-darwin-x64.zip`, `nona-darwin-arm64.zip` | `darwin-x64`, `darwin-arm64` |
| FreeBSD / OpenBSD x64       | `nona-freebsd-x64.zip`, `nona-openbsd-x64.zip` | `freebsd-x64`, `openbsd-x64` |

على أنظمة POSIX نفّذ `chmod +x nona` إذا أسقطت أداة فك الضغط صلاحية التنفيذ. وللتجربة دون تثبيت أي شيء استخدم [الملعب](/playground).

### البناء من المصدر

تحتاج إلى Node.js 26 أو أحدث مع npm، على أي مضيف يشغّل Node.js 26.

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
node dist/cli.js --help
```

نقطة دخول المترجم هي `dist/cli.js`. ينشئ `npm link` داخل المستودع أمر `nona` على `PATH`. يكتب بقية هذا الموقع `nona`؛ ومن نسخة مستنسخة نفّذ `node dist/cli.js` بدلًا منه.

## برنامجك الأول

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux and macOS]
nona build hello.js -o build/hello
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

المترجم مترجم متقاطع: يستطيع أي مضيف إنتاج ملفات تنفيذية لأي من [المنصات الأصلية](/reference/native-platforms) الثماني. يختار الخيار `--target` صيغة الناتج والمعالج؛ وبدونه تكون المنصة هي نظام التشغيل والمعالج الخاصين بالمضيف.

```sh
nona build hello.js -o build/hello --target linux-arm64
nona build hello.js -o build/hello.exe --target win32-x64
```

لا يعمل الملف التنفيذي المترجَم عبر المنصات إلا على نظام التشغيل والمعالج المطابقين. تُكتب مخرجات Linux وBSD وmacOS بالصلاحيات `0755`.

## الوحدات

المدخل بامتداد `.mjs`، أو أي مدخل يُترجَم مع `--module`، هو وحدة ES. تُحَلّ الاستيرادات النسبية (`./util.mjs` و`../lib/x.mjs`) بجوار الملف المستورِد وتُترجَم في الملف التنفيذي نفسه. ويُترجَم مدخل CommonJS مع كل ما يطلبه عبر `require`.

تستخدم الوحدات المدمجة البادئة `nona:` (`nona:ffi` و`nona:win32` و`nona:fs` و`nona:process`)؛ كما تتوفر أسماء Node.js كثيرة (`node:fs` و`node:path` و`node:http` وغيرها). راجع [الوحدات المدمجة](/ar/reference/modules).

## حزم npm

ثبّت الحزم بـ npm كالمعتاد ثم ابنِ: يحلّ Nona مجلد `node_modules` عند البناء ويترجم الحزم ضمن الملف التنفيذي. يبني الأمر `nona build <package directory>` أمر `"bin"` أو وحدة `"main"` الخاصة بالحزمة. راجع [حزم npm](/reference/npm).

## برنامج Windows بلا نافذة طرفية

```sh
nona build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

يشغّل `--subsystem windows` البرنامج بلا نافذة طرفية ويضمّن بيانًا افتراضيًا؛ ويضيف `--icon` و`--version-info` موارد يعرضها مستكشف الملفات. راجع [الملفات التنفيذية لـ Windows](/ar/reference/windows-executables) و[مثال Museum](/ar/examples/museum).

## حل المشكلات

تُطبع أخطاء الترجمة بالشكل `file:line:column CODE: message` ويخرج المترجم برمز الحالة 1:

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- تُرفض الصيغة غير المدعومة وقت الترجمة بدلًا من أن تفشل وقت التشغيل.
- يعني `E_FFI_TARGET` أن تصريح DLL تُرجم لمنصة غير Windows (أو أن استدعاء نظام تُرجم للمنصة `win32-x64`).
- يعني `E_HOST_MODULE` أن وحدة مدمجة غير متاحة للمنصة المستهدفة.
- يعني ظهور `EvalError` وقت التشغيل أن `eval` أو `Function` تلقّى نصًا مصدريًا لم يكن معروفًا وقت الترجمة.

يسرد [مرجع سطر الأوامر](/ar/reference/cli) جميع الخيارات والأخطاء.

## الخطوات التالية

- [أمثلة](/ar/examples/): برامج كاملة مع شروحات.
- [دعم اللغة](/ar/guide/language-support) و[التوافق والقيود](/ar/guide/compatibility): ما الذي يمكن توقعه.
- [الوحدات المدمجة](/ar/reference/modules): واجهات المضيف.
