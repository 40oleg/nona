# الدوال الأصلية (FFI)

::: info ترجمة
هذه الصفحة ترجمة للصفحة الإنجليزية [Native functions (FFI)](/reference/ffi) المولَّدة من [`docs/ffi.md`](https://github.com/40oleg/nona/blob/main/docs/ffi.md). النسخة الإنجليزية هي المرجع المعتمد وقد تكون أحدث.
:::

يمكن لبرامج Windows استدعاء الدوال المصدَّرة من أي DLL عبر الوحدة المدمجة `nona:ffi`. تُحَلّ التصريحات وقت الترجمة: كل استدعاء لـ `define` يضيف مُدخلًا إلى جدول الاستيراد PE، لذا لا يستخدم البرنامج `LoadLibrary`/`GetProcAddress`.

```js
import { define, lastError } from 'nona:ffi';

const MessageBoxW = define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)');
MessageBoxW(null, 'Hello from Nona', 'Nona', 0);
```

- ‏FFI متاح في شيفرة الوحدات (`.mjs` أو `--module`). يجب استدعاء `define` مباشرةً بثلاث سلاسل حرفية: اسم DLL، واسم التصدير، والتوقيع. وأي شكل آخر خطأ ترجمة (`E_FFI_STATIC`).
- تُرفض تصريحات DLL مع `--target linux-x64` ‏(`E_FFI_TARGET`).
- على Linux يصرّح `define('syscall', '<number>', signature)` عن استدعاء نظام خام (ستة وسائط على الأكثر من نوع عدد صحيح أو `buf`؛ والنتيجة هي القيمة الخام التي تعيدها النواة، و`errno` سالب عند الفشل). وتُرفض تصريحات استدعاءات النظام للمنصة `win32-x64`.
- تعيد `lastError()` قيمة `GetLastError()` الملتقطة فورًا بعد آخر استدعاء FFI.
- إذا كان ملف DLL أو التصدير مفقودًا يرفض محمّل Windows تشغيل البرنامج.

## التوقيعات {#signatures}

‏`result(param, param, ...)`، مثل `bool(u32,u32,wstr,u32)`.

| النوع | المعامل | النتيجة |
| --- | --- | --- |
| `i8 i16 i32 i64 u8 u16 u32 u64` | ‏Number (مقطوع باتجاه الصفر) أو Boolean | Number |
| `ptr` | ‏Number أو Boolean أو `null`/`undefined` ‏(NULL) | Number |
| `bool` | مثل `i32` | ‏Boolean ‏(`BOOL` في Win32، وأي قيمة غير صفرية تعني `true`) |
| `f32 f64` | Number | Number |
| `wstr` | ‏String ← نسخة UTF-16 مؤقتة منتهية بـ NUL؛ و`null`/`undefined` ← NULL | — |
| `str` | ‏String ← نسخة UTF-8 مؤقتة منتهية بـ NUL؛ و`null`/`undefined` ← NULL | — |
| `buf` | ‏ArrayBuffer أو SharedArrayBuffer أو مصفوفة منمَّطة أو DataView ← مؤشر إلى بايتاته (عند إزاحة العرض)؛ و`null`/`undefined` ← NULL | — |
| `void` | — | `undefined` |

الوسائط من الأنواع الأخرى ترمي `TypeError`، وكذلك الوسائط الناقصة (إلا في أنواع المؤشرات، حيث تعني `undefined` القيمة NULL) والمخازن المفصولة. ويمكن للدالة المستدعاة أن تكتب في ذاكرة `buf`، وهكذا تُعاد معاملات الإخراج: مرِّر `Uint16Array` لمخزن سلسلة UTF-16 أو `Uint8Array(8)` لمقبض. تُحرَّر النسخ المؤقتة من السلاسل بعد الاستدعاء، ويجب ألا تحتفظ الدالة المستدعاة بالمؤشر. أما دوال الاستدعاء الراجع (`cb(...)`) وأنواع معاملات الإخراج فمحجوزة لإصدار لاحق.

## `nona:win32` {#nona-win32}

مجموعة منتقاة من التصريحات والدوال المساعدة مبنية على `nona:ffi`:

- ‏user32: ‏`MessageBoxW` و`GetSystemMetrics` و`SystemParametersInfoW` (معامل نصي) و`SystemParametersInfoBufferW` (معامل مخزن)؛
- ‏kernel32: ‏`CreateMutexW` و`ReleaseMutex` و`CloseHandle` و`GetModuleFileNameW` و`GetCurrentProcessId`؛
- ‏advapi32: ‏`RegCreateKeyExW` و`RegOpenKeyExW` و`RegSetValueExW` و`RegQueryValueExW` و`RegDeleteValueW` و`RegDeleteKeyW` و`RegCloseKey`؛
- ثوابت مثل `HKEY_CURRENT_USER` و`KEY_ALL_ACCESS` و`REG_SZ` و`SPI_SETDESKWALLPAPER` و`SPIF_UPDATEINIFILE` و`ERROR_ALREADY_EXISTS`؛
- الدوال المساعدة `wideString(text)` ‏(`Uint16Array` منتهية بـ NUL) و`fromWideString(buffer)` و`readHandle(buffer)`؛ ويُعاد تصدير `lastError`.

```js
import { SystemParametersInfoW, SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE } from 'nona:win32';
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, 'C:\\Pictures\\painting.jpg', SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
```


## Native target availability

Windows/Linux x64 and ARM64, Intel macOS and FreeBSD/OpenBSD x64 targets are available. Apple Silicon startup is not enabled. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
