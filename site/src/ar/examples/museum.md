# Museum: مبدّل خلفيات سطح المكتب <Badge type="warning" text="Windows فقط" />

::: warning Windows فقط
يستدعي هذا المثال دوال Windows عبر `nona:win32` ولا يُترجَم إلا للمنصة `win32-x64`.
:::

‏Museum برنامج خلفي يعرض لوحة فنية مختلفة خلفيةً لسطح المكتب كل بضع دقائق. يعمل دون نافذة طرفية، ولا يستهلك المعالج بين التبديلات، ولا يُشغَّل إلا نسخة واحدة منه، ويمكنه تسجيل نفسه للبدء مع Windows. البرنامج كله وحدة واحدة من نحو 80 سطرًا.

## الخطوة 1: الوسائط

```js
const folder = process.argv[1];
const minutes = Number(process.argv[2] ?? 30);
const install = process.argv.includes('--install');
```

‏`process.argv[0]` هو الملف التنفيذي و`process.argv[1]` هو الوسيط الأول. البرنامج الرسومي لا يملك نافذة طرفية، لذا تُعرَض الأخطاء عبر `MessageBoxW`:

```js
function fail(message) {
  MessageBoxW(null, message, 'Museum', MB_OK | MB_ICONERROR);
  process.exit(1);
}
```

## الخطوة 2: الصور

`readdirSync` from `node:fs` lists the folder. This sample joins paths with `\\`; `node:path` is also available.

```js
const pictures = readdirSync(folder)
  .filter(name => /\.(jpe?g|png|bmp)$/i.test(name))
  .sort()
  .map(name => folder.replace(/[\\/]+$/, '') + '\\' + name);
```

## الخطوة 3: نسخة واحدة فقط

يبقى الـ mutex المسمّى موجودًا ما دامت العملية التي أنشأته حية. فإذا كان موجودًا بالفعل، فهناك نسخة أخرى من Museum قيد التشغيل.

```js
CreateMutexW(null, false, 'Local\\NonaMuseum');
if (lastError() === ERROR_ALREADY_EXISTS) process.exit(0);
```

تعيد `lastError()` قيمة `GetLastError()` الملتقطة مباشرةً بعد استدعاء FFI السابق.

## الخطوة 4: تعيين الخلفية

```js
SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, picture, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)
```

يحوّل المعامل `wstr` سلسلة JavaScript إلى نسخة UTF-16 مؤقتة منتهية بـ NUL، لذا تعمل المسارات التي تحتوي على أي محارف. يحفظ `SPIF_UPDATEINIFILE` الخلفية بعد تسجيل الخروج، ويُعلِم `SPIF_SENDCHANGE` البرامج الأخرى بالتغيير.

## الخطوة 5: التدوير

```js
showNext();
setInterval(showNext, minutes * 60 * 1000);
```

المؤقت الدوري المعلَّق يبقي العملية حية. وبين النبضات تنام حلقة الأحداث في النواة، لذا لا يستهلك البرنامج المعالج أثناء الانتظار.

## الخطوة 6: بناء برنامج رسومي

<<< ../../../samples/museum.version.json

```sh
node dist/cli.js build museum.mjs -o build/museum.exe --subsystem windows --icon museum.ico --version-info museum.version.json
```

- يشغّل `--subsystem windows` البرنامج دون نافذة طرفية ويضمّن بيانًا افتراضيًا (asInvoker، وWindows 10/11، والوعي بدقة DPI لكل شاشة).
- يضمّن `--icon` الأيقونة التي يعرضها مستكشف الملفات وشريط المهام.
- يملأ `--version-info` تبويب الخصائص ← التفاصيل.

شغّله مع مجلد وفاصل زمني بالدقائق:

```powershell
.\build\museum.exe "C:\Users\me\Pictures\Paintings" 30
```

## الخطوة 7: البدء مع Windows (اختياري)

مع `--install` يكتب Museum سطر الأوامر الخاص به في `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. تكتب `RegCreateKeyExW` المفتاح المفتوح في مخزن بحجم 8 بايت تقرؤه `readHandle`؛ وتُعِدّ `wideString` بيانات UTF-16 من أجل `RegSetValueExW`.

```js
const key = new Uint8Array(8);
RegCreateKeyExW(HKEY_CURRENT_USER, runKey, 0, null, 0, KEY_WRITE, null, key, null);
const command = wideString(`"${process.execPath}" "${folder}" ${minutes}`);
RegSetValueExW(readHandle(key), 'NonaMuseum', 0, REG_SZ, command, command.byteLength);
```

للتراجع عن ذلك احذف القيمة `NonaMuseum` من ذلك المفتاح (مثلًا عبر `RegDeleteValueW` أو في محرر السجل).

## المصدر الكامل

<<< ../../../samples/museum.win32.mjs{js}

## انظر أيضًا

- [الدوال الأصلية (FFI)](/ar/reference/ffi) و[قائمة تصديرات `nona:win32`](/ar/reference/modules#nona-win32)
- [الملفات التنفيذية لـ Windows](/ar/reference/windows-executables)
- [المؤقتات وحلقة الأحداث](/ar/reference/host-apis)
