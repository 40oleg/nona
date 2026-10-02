# المساهمة

## إعداد بيئة التطوير

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run check            # build and run the unit suite
npm run compare          # compile examples/compat and compare with Node.js
npm run compare:linux    # the same for linux-x64
npm run test262:smoke    # a quick pinned Test262 subset
```

تترجم مجموعة الاختبارات ملفات تنفيذية حقيقية وتشغّلها: اختبارات PE تعمل على Windows واختبارات ELF على Linux، وكثير منها تحت ضغط جامع المهملات. يشغّل التكامل المستمر (`.github/workflows/check.yml`) المجموعة الكاملة ومجموعات Test262 على Windows مع Node.js 26، والاختبارات الأصلية على Linux. والتدقيقات الكاملة لـ Test262 موصوفة في صفحة [Test262](/ar/reference/test262).

## سير العمل

- يبدأ كل تغيير من issue على GitHub يتضمن الدافع والمقترح ومعايير القبول.
- ‏issue واحدة، وفرع واحد (`issue-<number>-<short-slug>`)، وطلب سحب واحد يتضمن وصفه `Closes #N` والتصميم وطريقة الاختبار والقيود المعروفة.
- حافظ على `main` أخضر: لا يُدمَج طلب السحب إلا إذا نجح سير العمل `check`.
- تُكتب الـ issues وطلبات السحب ورسائل الإيداع وتعليقات الشيفرة والتوثيق بالإنجليزية.

## الاختبارات

توجد الاختبارات في `tests/*.test.ts`. فضّل `runOnHost` مع المرجع المستند إلى Node.js ‏(`runOracle`): عندئذٍ يعمل الاختبار نفسه على المنصتين تحت ضغط جامع المهملات، ويقارن ناتج البرنامج بناتج Node.js.

## اصطلاحات الشيفرة

- المترجم مكتوب بلغة TypeScript ‏(`src/`). تُصدَر شيفرة بيئة التشغيل بصيغة x86-64 عبر `RuntimeBuilder` ‏(`src/runtime/*.ts`)، أو تُكتب كمقدّمات JavaScript ‏(`src/runtime/*-source.ts`) تُترجَم في كل ملف تنفيذي.
- يجب ألا تضيف المقدّمات ارتباطات `var` في المستوى الأعلى؛ غلّف الشيفرة في IIFE.
- تتبع دوال بيئة التشغيل الأصلية واجهة Win64 الثنائية (shadow space، ومحاذاة 16 بايت عند الاستدعاءات، والمسجّلات التي تحفظها الدالة المستدعاة). والدوال التي تحتفظ بقيم عبر استدعاءات قد تخصّص ذاكرة تستخدم `rootedFn`.
- كل استيراد جديد من KERNEL32 يحتاج إلى طبقة وسيطة على استدعاءات نظام Linux في `src/backend/linux/shims.ts`.
- تبقى الملفات التنفيذية المولَّدة خالية من الاعتماديات الخارجية: بلا libc، وبلا سلسلة أدوات C، وبلا ملفات DLL مرفقة.

## التوثيق

حين تغيّر ميزةٌ سلوكًا مرئيًا للبرامج، حدّث:

- ‏`README.md` و`README.ru.md`؛
- الوثيقة المرجعية في `docs/` ‏(`host-apis.md` و`process.md` و`fs.md` و`ffi.md` و`windows-executables.md` و`test262.md`)، إذ يضمّن الموقع هذه الملفات تلقائيًا؛
- صفحات الموقع في `site/src/` التي تصف الميزة، مثل صفحة [دعم اللغة](/ar/guide/language-support) أو صفحة [سطر الأوامر](/ar/reference/cli)؛
- ‏`CHANGELOG.md` تحت `## Unreleased` مع رابط إلى الـ issue.

## موقع التوثيق

يُبنى الموقع باستخدام [VitePress](https://vitepress.dev) من `site/`:

```sh
npm run build              # the compiler, needed to check the samples
cd site
npm ci
npm run dev                # local server with live reload
npm run build              # production build; fails on broken internal links
npm run check:samples      # compiles every program in site/samples
```

الأمثلة القابلة للتشغيل ملفات في `site/samples/` تُضمَّن عبر `<<<`؛ والاسم الذي يحتوي على `.win32.` أو `.linux.` يقصر المثال على تلك المنصة. ويشرح `site/README.md` كيفية إضافة صفحة. ويُنشَر الموقع على GitHub Pages من `main` بواسطة `.github/workflows/pages.yml`.

الموقع مترجَم إلى عدة لغات. الصفحات الإنجليزية هي المصدر، والترجمات موجودة في `site/src/<locale>/`. حين تتغير صفحة إنجليزية، حدّث ترجماتها، أو تأكد على الأقل من أنها لا تناقضها.

## المساهمون الآليون

قواعد الوكلاء، أي حجز الـ issues بالوسم `blocked` وتأليف الإيداعات وقائمة التحقق لطلبات السحب، موجودة في [`AGENTS.md`](https://github.com/40oleg/nona/blob/main/AGENTS.md).
