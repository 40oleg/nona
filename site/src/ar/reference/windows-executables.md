# الملفات التنفيذية لـ Windows

::: info ترجمة
هذه الصفحة ترجمة للصفحة الإنجليزية [Windows executables](/reference/windows-executables) المولَّدة من [`docs/windows-executables.md`](https://github.com/40oleg/nona/blob/main/docs/windows-executables.md). النسخة الإنجليزية هي المرجع المعتمد وقد تكون أحدث.
:::

## النظام الفرعي

يوسم الأمر `nona build app.js -o app.exe --subsystem windows` صورة PE بأنها برنامج رسومي (قيمة Subsystem في الترويسة الاختيارية تساوي 2). فيشغّله Windows عندئذٍ دون نافذة طرفية، وهذا يناسب البرامج الخلفية وأدوات منطقة الإشعارات. والقيمة الافتراضية `--subsystem console` ‏(3). ويتطلب الخيار `--target win32-x64`.

يظل البرنامج الرسومي يكتب ناتج `console.log` إلى مقابض المخرج القياسي التي يرثها (مثل الأنابيب التي تعدّها العملية الأم). وحين لا يوجد مخرج قياسي، أي لا توجد نافذة طرفية، أو كان المقبض مغلقًا أو مفصولًا، أو فشلت الكتابة، يُتجاهَل الناتج ويواصل البرنامج عمله؛ أما الإصدارات السابقة فكانت تنتهي برمز الخروج 1.

## الموارد

```text
nona build app.js -o app.exe --icon app.ico --manifest app.manifest --version-info version.json
```

- يضمّن `--icon` كل صور ملف `.ico` ‏(`RT_ICON` من 1 إلى n و`RT_GROUP_ICON` 1)؛ ويعرضها مستكشف الملفات وشريط المهام.
- يضمّن `--manifest` بيان تطبيق (`RT_MANIFEST` 1). ويجب أن يكون بيانًا صالحًا: يرفض Windows تشغيل برنامج ببيان تالف. والبرامج المبنية بـ `--subsystem windows` دون بيان تحصل على بيان افتراضي: ‏`asInvoker`، والتوافق مع Windows 10/11، والوعي بدقة DPI لكل شاشة.
- يقرأ `--version-info` كائن JSON يحتوي على أي من `FileVersion` و`ProductVersion` ‏(`"major.minor.build.revision"`، وكل جزء من 0 إلى 65535) و`ProductName` و`FileDescription` و`CompanyName` و`LegalCopyright` و`OriginalFilename` و`InternalName` و`Comments`، وتظهر في الخصائص ← التفاصيل الخاصة بالملف (`RT_VERSION` 1، واللغة 0409، وصفحة الترميز 04B0).

```json
{ "FileVersion": "1.0.0.0", "ProductName": "Museum", "FileDescription": "Paintings on the desktop", "CompanyName": "Oleg" }
```

الخيارات نفسها متاحة في `compile()` بالأسماء `icon` (بايتات) و`manifest` (سلسلة) و`versionInfo` (كائن). وتتطلب `--target win32-x64`.
