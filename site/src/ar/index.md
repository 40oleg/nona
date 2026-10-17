---
layout: home

hero:
    name: Nona
    text: من JavaScript إلى ملفات تنفيذية أصلية
    tagline: مترجم مسبق (ahead-of-time) يحوّل JavaScript ES2020 إلى ملفات تنفيذية مستقلة صغيرة لأنظمة Windows وLinux وmacOS وFreeBSD وOpenBSD، بلا مفسّر مضمَّن وبلا سلسلة أدوات C.
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
      details: يبدأ برنامج hello world المترجَم خلال نحو 2 ms ولا تتجاوز ذاكرته 11 MB، في ملف حجمه نحو 2 MB. أما Node.js فيحتاج إلى 28 ms و45 MB، ويبلغ حجم الملف التنفيذي Node SEA نحو 124 MB.
      link: /ar/guide/performance
    - title: ثماني منصات من أي مضيف
      details: Windows وLinux وmacOS على x64 وARM64، وFreeBSD وOpenBSD على x64. ترجم عبر المنصات بالخيار --target؛ وكل ملف تنفيذي مكتفٍ بذاته.
      link: /reference/native-platforms
    - title: لغة ES2020
      details: الأصناف والمولّدات والدوال غير المتزامنة والتفكيك والتسلسل الاختياري وBigInt واستدعاءات الذيل الصحيحة ووحدات ES مع الدورات والارتباطات الحية، مع استثناءات موثّقة.
      link: /ar/guide/language-support
    - title: حزم npm
      details: تُحَلّ الحزم الموجودة في node_modules عند البناء وتُترجَم ضمن الملف التنفيذي، مع وحدات Node.js التي تحتاجها عادةً.
      link: /reference/npm
    - title: واجهات مضيف على نمط Node.js
      details: المؤقتات وحلقة الأحداث، وprocess، وfs، وpath، وBuffer، والتدفقات، والأحداث، وURL، وخوادم وعملاء HTTP وTCP.
      link: /ar/reference/modules
    - title: بيئة تشغيل أصلية
      details: جامع مهملات دقيق من نوع mark-and-sweep، وسلاسل UTF-16، واستثناءات حقيقية، وخطأ RangeError يمكن التقاطه عند طفح المكدس، ومترجم يستضيف نفسه.
      link: /ar/guide/how-it-works
    - title: FFI وبرامج Windows الرسومية
      details: استدعِ أي دالة مُصدَّرة من DLL عبر تصريحات تُحَلّ وقت الترجمة، وابنِ برامج بلا نافذة طرفية، مع أيقونة وبيان تطبيق ومعلومات إصدار.
      link: /ar/reference/ffi
---

## مثال سريع

<<< ../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux and macOS]
nona build hello.js -o build/hello
./build/hello
```

```sh [Cross-compile]
nona build hello.js -o build/hello --target linux-arm64
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

الإصدار الحالي هو **v0.16.0**؛ Nona مشروع تجريبي. وهو ليس بديلًا مباشرًا لـ Node.js ولم يخضع لتدقيق أمني.

- **التوافق.** في آخر تدقيق كامل (v0.8.0) اجتازت مجموعة Test262 المثبَّتة على Windows x64 عدد 22436/22492 من اختبارات language، و15868/15933 من built-ins، و268/268 من Atomics، و996/1016 من Annex B. وكل إخفاق متبقٍّ مصنَّف في [صفحة الحالة](/ar/guide/status).
- **السرعة.** سرعة الإقلاع وحجم الملف التنفيذي والذاكرة هي نقاط قوة Nona. أما الحسابات داخل البرنامج فلا JIT فيها: من مستوى V8 نفسه في الحلقات البسيطة إلى أبطأ بعدة أضعاف أو بعشرات الأضعاف في الاستدعاءات وتخصيص الذاكرة والبرامج الحقيقية طويلة التشغيل. تقدّم صفحة [الأداء](/ar/guide/performance) القياسات والمواضع البطيئة المعروفة.
- **القيود.** يحتاج `eval` و`Function` إلى نص مصدري معروف وقت الترجمة، ولا توجد إلا واجهات Node.js التي ينفّذها Nona. راجع [التوافق والقيود](/ar/guide/compatibility).
