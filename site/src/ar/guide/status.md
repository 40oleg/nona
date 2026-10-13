# الحالة وخارطة الطريق

## الإصدار الحالي

**v0.12.0**: راجع [سجل التغييرات](/changelog) (بالإنجليزية). Nona مشروع تجريبي: لم يخضع لتدقيق أمني وليس بديلًا مباشرًا لـ Node.js.

## تدقيق Test262

آخر تدقيق كامل لـ Test262 المثبَّت، على Windows x64 للإصدار v0.8.0 ‏(`scripts/test262-audit.ps1 -Unit`، ميزات ES2020 وما قبله إضافةً إلى الميزات اللاحقة المدعومة مثل عناصر الأصناف في ES2022):

| المجلد                        | الناجحة / القابلة للتطبيق     | الإخفاقات المتبقية                   |
| ----------------------------- | ----------------------------- | ------------------------------------ |
| `language/`                   | **22436 / 22492** (26 متخطّى) | 44 `eval`، و1 دلالات أحدث، و11 أخرى  |
| `built-ins/`                  | **15868 / 15933**             | 16 `eval`، و12 دلالات أحدث، و37 أخرى |
| `built-ins/Atomics` (الوكلاء) | **268 / 268**                 | —                                    |
| `annexB/`                     | **996 / 1016** (8 متخطّاة)    | 20 `eval`                            |

يأتي التصنيف من `scripts/test262-summary.mjs`: اختبارات «`eval`» تستدعي `eval` أو `$262.evalScript` بنص مصدري لا يمكن لـ Nona معرفته وقت الترجمة؛ واختبارات «الدلالات الأحدث» تتحقق من سلوك من إصدارات لاحقة (العلَم `v`، وفواصل الأعداد، و`Promise.any`، وغيرها) تحت وسم ميزة قديم أو مفقود. تعمل مجموعة اختبارات الوحدة على Windows وLinux في التكامل المستمر، وتترجم ملفات PE وELF حقيقية وتشغّلها، وكثير منها تحت ضغط جامع المهملات. وطريقة تشغيل التدقيقات موصوفة في صفحة [Test262](/ar/reference/test262).

## الإخفاقات المتبقية

هذه إخفاقات تدقيق v0.8.0؛ ولم تكرر الإصدارات اللاحقة التشغيل الكامل. جميع الإخفاقات «الأخرى» على Windows مصنَّفة:

- ‏`built-ins/Function` ‏(26): تأتي الشيفرة المصدرية للدالة من `toString` لكائنات وقت التشغيل، أي استثناء `eval`.
- ‏`is-a-constructor` للأنواع `AsyncFunction` و`AsyncGeneratorFunction` و`GeneratorFunction`، واختبار `prototype` للدالة السهمية غير المتزامنة ‏(4): يبني إطار اختبارات Test262 النص المصدري وقت التشغيل.
- عوالم أخرى (8): نماذج أولية افتراضية من عالم آخر ([#7](https://github.com/40oleg/nona/issues/7)، أُغلقت بعد التدقيق).
- أصناف أُنشئت عبر `Function`، وكذلك في عالم آخر (10، `language/expressions/class`): نص مصدري يُبنى وقت التشغيل. أما الاختبارات نفسها عبر اسم بديل لـ `eval` فتُحتسب إخفاقات `eval`.

وجد تدقيق v0.8.0 أيضًا سبعة انهيارات (`Array.prototype.indexOf` على `Math` مع عنصر، والمفاتيح الموروثة والخاصة للمصفوفات المنمّطة) أُدخلت مع العناصر الكثيفة؛ وقد أُصلحت في [#119](https://github.com/40oleg/nona/issues/119)، وتجتازها إعادة تشغيل `built-ins/Array` و`built-ins/TypedArrayConstructors` بعد الإصلاح (المشمولة أعلاه).

## العمل المفتوح

فجوات اللغة والمكتبة:

- [#11](https://github.com/40oleg/nona/issues/11): ‏`eval` و`Function` بشيفرة محسوبة وقت التشغيل.
- [#44](https://github.com/40oleg/nona/issues/44): ردود فعل Promise: نوع مخصص للوعود وسجل واحد لكل `then`.

الأداء، وهو الخط الرئيسي في [خارطة الطريق](https://github.com/40oleg/nona/blob/main/docs/roadmap.md):

- الاستدعاءات وتخصيص الذاكرة: [#47](https://github.com/40oleg/nona/issues/47) (كلفة الاستدعاء)، و[#48](https://github.com/40oleg/nona/issues/48) (الكائنات قصيرة العمر)، و[#235](https://github.com/40oleg/nona/issues/235) (التضمين inlining)، و[#236](https://github.com/40oleg/nona/issues/236) (الاستبدال السلّمي scalar replacement).
- الشيفرة المولَّدة: [#237](https://github.com/40oleg/nona/issues/237)–[#242](https://github.com/40oleg/nona/issues/242) (التسلسل الاختياري، و`%`، والاستدعاءات المباشرة، وحلقات المصفوفات المنمّطة، وجداول القفز لـ `switch`، وفحوص المنطقة الميتة).
- المكتبة: [#155](https://github.com/40oleg/nona/issues/155) (`JSON.stringify`)، و[#258](https://github.com/40oleg/nona/issues/258) (مسح بداية RegExp)، و[#262](https://github.com/40oleg/nona/issues/262) (`shift` و`splice` على المصفوفات الكبيرة).

القائمة الكاملة على [GitHub](https://github.com/40oleg/nona/issues).

## تقارير تفصيلية

- [حالة ES2020 للإصدارات 0.17–0.20](https://github.com/40oleg/nona/blob/main/docs/status.md) (بالروسية)
- [سجل الإصدارات](/changelog) و[سجل التطوير](https://github.com/40oleg/nona/blob/main/docs/history/development-log.md) (بالروسية)
- [خارطة الطريق: خطة مستوحاة من V8 والمعماريات المستهدفة (بالإنجليزية)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [خارطة طريق الإصدارات 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/history/release-roadmap-0.4-0.20.md) (بالروسية)
