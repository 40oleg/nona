# سطر الأوامر

## الصيغة العامة

```text
Nona 0.7.0 — JavaScript subset to native Windows/Linux x64
Usage: nona build <input.js> -o <output> [--target win32-x64|linux-x64|linux-arm64|win32-arm64|darwin-x64|freebsd-x64|openbsd-x64] [--module]
       [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
       [--version-info version.json]
       (.mjs inputs are compiled as modules)
       nona --help | --version
```

من نسخة مستنسخة من المستودع شغّل `node dist/cli.js …`؛ وبعد `npm link` يصبح الأمر نفسه متاحًا باسم `nona`.

## الخيارات

| الخيار | القيمة | الوصف |
| --- | --- | --- |
| `-o` | مسار | ملف الناتج. إلزامي. تُنشأ المجلدات الناقصة. |
| `--target` | [Native platforms](/reference/native-platforms) | PE32+, ELF64 or Mach-O64; default: host OS and CPU. |
| `--module` | — | ترجمة المدخل كوحدة ES. المدخلات المنتهية بـ `.mjs` وحدات تلقائيًا. |
| `--subsystem` | `console` (الافتراضي)، `windows` | برنامج Windows رسومي بلا نافذة طرفية. للمنصة `win32-x64` فقط. البرنامج الرسومي بلا `--manifest` يحصل على بيان افتراضي. |
| `--icon` | ملف `.ico` | تضمين كل صور ملف الأيقونة. للمنصة `win32-x64` فقط. |
| `--manifest` | ملف XML | تضمين بيان تطبيق. يجب أن يكون صالحًا: يرفض Windows تشغيل برنامج ببيان تالف. للمنصة `win32-x64` فقط. |
| `--version-info` | ملف JSON | تضمين معلومات الإصدار (`FileVersion` و`ProductVersion` و`ProductName` و`FileDescription` و`CompanyName` و`LegalCopyright` و`OriginalFilename` و`InternalName` و`Comments`). للمنصة `win32-x64` فقط. |
| `--help` | — | طباعة الصيغة العامة. |
| `--version` | — | طباعة إصدار المترجم. |

يمكن أن يظهر كل خيار مرة واحدة. راجع [الملفات التنفيذية لـ Windows](/ar/reference/windows-executables) لمعرفة صيغ الموارد.

## المدخلات والمخرجات

- المدخل ملف مصدري واحد بترميز UTF-8. والمدخل من نوع وحدة يجلب معه الوحدات التي يستوردها؛ أما الوحدات المدمجة `nona:*` و`node:*` فهي جزء من المترجم.
- يُكتب الناتج في ملف مؤقت بجواره ثم يُعاد تسميته إلى مكانه، لذا لا يترك البناء الفاشل أبدًا ملفًا تنفيذيًا مكتوبًا جزئيًا ويحتفظ بالملف السابق.
- يرفض المترجم الكتابة فوق ملف المدخل، حتى عبر رابط صلب أو رمزي.
- تحصل مخرجات Linux على الصلاحيات `0755`.

## ذاكرة التخزين المؤقت لبيئة التشغيل

بيئة التشغيل والمقدمات المترجمة متطابقة لكل برنامج يربط الأجزاء نفسها، وتوليدها يستغرق معظم وقت البناء. يحفظها سطر الأوامر في مجلد للتخزين المؤقت، فتصبح عمليات البناء التالية أسرع بنحو ثلاث مرات (برنامج hello world على Linux: ‏1.1 ثانية ثم 0.33 ثانية). الناتج متطابق مع التخزين المؤقت أو بدونه. تخص المدخلات إصدارًا واحدًا من المترجم وتُتجاهل بعد التحديث.

| المتغير | الأثر |
| --- | --- |
| `NONA_CACHE_DIR` | مجلد التخزين المؤقت. الافتراضي: `%LOCALAPPDATA%\nona\cache` على Windows، و`~/Library/Caches/nona` على macOS، و`$XDG_CACHE_HOME/nona` أو `~/.cache/nona` في غيرهما. |
| `NONA_CACHE=0` | عدم قراءة التخزين المؤقت أو الكتابة فيه. |

## التشخيصات ورموز الخروج

حالة الخروج `0` عند النجاح و`1` عند أي خطأ. تُطبع أخطاء المصدر هكذا:

```text
<file>:<line>:<column> <CODE>: <message>
```

| الرمز | المعنى |
| --- | --- |
| `E_LEX` و`E_SYNTAX` | تعذّر تقسيم المصدر إلى رموز أو تحليله، أو أنه يستخدم صيغة غير مدعومة. |
| `E_BIND` | خطأ مبكر عُثر عليه أثناء حلّ الأسماء (تصريحات مكررة، وأهداف إسناد غير صالحة، وغيرها). |
| `E_MODULE` | تعذّر حلّ وحدة أو قراءتها أو ربطها، أو أن التصديرات متعارضة. |
| `E_FFI_STATIC` | استدعاء `define()` من `nona:ffi` ليس ثلاث سلاسل حرفية أو أن توقيعه غير صالح. |
| `E_FFI_TARGET` | تصريح DLL مترجَم للمنصة `linux-x64`، أو تصريح استدعاء نظام مترجَم للمنصة `win32-x64`. |
| `E_RESOURCE` | أيقونة أو معلومات إصدار غير صالحة، أو موارد مطلوبة للمنصة `linux-x64`. |
| `E_TARGET` | منصة مستهدفة أو نظام فرعي غير مدعوم. |

تُطبع أخطاء الوسائط بالشكل `nona: <message>`، مثل `Unknown option: --foo` و`Duplicate option: -o` و`Missing value for --target` و`Output is required (-o <output>)` و`Unsupported target: arm64` و`Unsupported subsystem: native` و`--subsystem requires --target win32-x64`.

## أمثلة

::: code-group

```sh [برنامج طرفي]
node dist/cli.js build app.js -o build/app.exe
```

```sh [برنامج رسومي مع موارد]
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

```sh [Linux]
node dist/cli.js build app.js -o build/app --target linux-x64
```

:::


## Native target availability

Windows/Linux x64 and ARM64, Intel macOS and FreeBSD/OpenBSD x64 targets are available. Apple Silicon startup is not enabled. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
