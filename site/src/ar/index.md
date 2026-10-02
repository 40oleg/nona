---
layout: home

hero:
  name: Nona
  text: من JavaScript إلى ملفات تنفيذية أصلية
  tagline: مترجم مسبق (ahead-of-time) يحوّل JavaScript ES2020 إلى ملفات تنفيذية مستقلة لنظامي Windows وLinux x64، بلا مفسّر مضمَّن وبلا سلسلة أدوات C.
  actions:
    - theme: brand
      text: ابدأ الآن
      link: /ar/guide/getting-started
    - theme: alt
      text: جرّبه في المتصفح
      link: /playground
    - theme: alt
      text: ما هو Nona
      link: /ar/guide/what-is-nona
    - theme: alt
      text: GitHub
      link: https://github.com/40oleg/nona

features:
  - title: يبدأ خلال 2 ms
    details: يبدأ برنامج hello world المترجَم خلال 1.8 ms ولا تتجاوز ذاكرته 11 MB، في ملف تنفيذي حجمه 7 MB. أما Node.js فيحتاج إلى 28 ms و45 MB، ويبلغ حجم الملف التنفيذي Node SEA نحو 124 MB.
    link: /ar/guide/performance
  - title: لغة ES2020
    details: الأصناف والمولّدات والدوال غير المتزامنة والتفكيك والتسلسل الاختياري وBigInt واستدعاءات الذيل الصحيحة ووحدات ES مع الدورات والارتباطات الحية، مع استثناءات موثّقة.
    link: /ar/guide/language-support
  - title: بيئة تشغيل أصلية
    details: جامع مهملات دقيق من نوع mark-and-sweep، وسلاسل UTF-16، واستثناءات حقيقية، وخطأ RangeError يمكن التقاطه عند طفح المكدس، كلها مربوطة في كل ملف تنفيذي.
    link: /ar/guide/how-it-works
  - title: واجهات المضيف
    details: حلقة أحداث مع مؤقتات، وكائن process عام، وnode:fs متزامن، وTextEncoder وTextDecoder.
    link: /ar/reference/host-apis
  - title: FFI وnona:win32
    details: استدعِ أي دالة مُصدَّرة من DLL على Windows عبر تصريحات تُحَلّ وقت الترجمة، مع ارتباطات جاهزة لـ user32 وkernel32 وadvapi32.
    link: /ar/reference/ffi
  - title: برامج Windows الرسومية
    details: برامج بلا نافذة طرفية، مع أيقونة وبيان تطبيق ومعلومات إصدار.
    link: /ar/reference/windows-executables
---

## مثال سريع

<<< ../../samples/hello.js

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

يحتوي الملف التنفيذي على شيفرة الآلة الخاصة بالبرنامج وعلى بيئة تشغيل Nona. ولا يحتاج إلى Node.js: الملف التنفيذي لنظام Windows لا يستورد إلا `KERNEL32.dll`، والملف التنفيذي لنظام Linux يجري استدعاءات النظام مباشرةً دون libc.

## الحالة

الإصدار الحالي هو **v0.7.0**. تجتاز مجموعة Test262 المثبَّتة (ميزات ES2020) على Windows x64 عدد 17298/17337 من اختبارات language، و15491/15559 من built-ins، و268/268 من Atomics، و996/1016 من Annex B؛ وكل إخفاق متبقٍّ مصنَّف في [صفحة الحالة](/ar/guide/status). سرعة الإقلاع وحجم الملف التنفيذي والذاكرة هي نقاط قوة Nona؛ أما الحسابات داخل البرنامج فأبطأ من V8 بما بين 20 و100 مرة، ولا تزال بعض العمليات (`Map` و`sort` وبناء السلاسل وسلاسل Promise الطويلة) فوق خطية، راجع [الأداء](/ar/guide/performance). Nona مشروع تجريبي: ليس بديلًا مباشرًا لـ Node.js ولم يخضع لتدقيق أمني.
