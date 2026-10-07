# الحالة وخارطة الطريق

## الإصدار الحالي

**v0.10.0**: راجع [سجل التغييرات](/changelog) (بالإنجليزية). Nona مشروع تجريبي: لم يخضع لتدقيق أمني وليس بديلًا مباشرًا لـ Node.js.

## تدقيق Test262

تشغيل كامل لـ Test262 المثبَّت على Windows x64 ‏(`scripts/test262-audit.ps1 -Unit`، ميزات ES2020 وما قبله):

| المجلد | الناجحة / القابلة للتطبيق | الإخفاقات المتبقية |
| --- | --- | --- |
| `language/` | **22436 / 22492** (26 متخطّى) | 44 `eval`، و1 دلالات أحدث، و11 أخرى |
| `built-ins/` | **15868 / 15933** | 16 `eval`، و12 دلالات أحدث، و37 أخرى |
| `built-ins/Atomics` (الوكلاء) | **268 / 268** | — |
| `annexB/` | **996 / 1016** (8 متخطّاة) | 20 `eval` |

يأتي التصنيف من `scripts/test262-summary.mjs`: اختبارات «`eval`» تستدعي `eval` أو `$262.evalScript` بنص مصدري لا يمكن لـ Nona معرفته وقت الترجمة؛ واختبارات «الدلالات الأحدث» تتحقق من سلوك من إصدارات لاحقة (العلَم `v`، وفواصل الأعداد، و`Promise.any`، وغيرها) تحت وسم ميزة قديم أو مفقود. تعمل مجموعة اختبارات الوحدة على Windows وLinux في التكامل المستمر، وتترجم ملفات PE وELF حقيقية وتشغّلها، وكثير منها تحت ضغط جامع المهملات. وطريقة تشغيل التدقيقات موصوفة في صفحة [Test262](/ar/reference/test262).

## الإخفاقات المتبقية

جميع الإخفاقات «الأخرى» على Windows مصنَّفة:

- ‏`built-ins/Function` ‏(25): تأتي الشيفرة المصدرية للدالة من `toString` لكائنات وقت التشغيل، أي استثناء `eval`.
- ‏`is-a-constructor` للأنواع `AsyncFunction` و`AsyncGeneratorFunction` و`GeneratorFunction` ‏(4): يبني إطار اختبارات Test262 النص المصدري وقت التشغيل.
- عوالم أخرى (7): نماذج أولية افتراضية من عالم آخر ([#7](https://github.com/40oleg/nona/issues/7)).
- حقول الأصناف الخاصة على الكائنات غير القابلة للتوسيع (2): حقول خاصة من ES2022 دون وسم ميزة أحدث.

## العمل المفتوح

- [#11](https://github.com/40oleg/nona/issues/11): ‏`eval` و`Function` بشيفرة محسوبة وقت التشغيل.
- [#7](https://github.com/40oleg/nona/issues/7): النماذج الأولية الافتراضية من عوالم أخرى لمُنشئات المقدّمات.
- [#13](https://github.com/40oleg/nona/issues/13) و[#36](https://github.com/40oleg/nona/issues/36): عناصر المصفوفات الكثيفة وجداول التجزئة لـ `Map`/`Set`.

القائمة الكاملة على [GitHub](https://github.com/40oleg/nona/issues).

## تقارير تفصيلية

- [حالة ES2020 للإصدارات 0.17–0.20](https://github.com/40oleg/nona/blob/main/docs/status.md) (بالروسية)
- [حالة v0.6](https://github.com/40oleg/nona/blob/main/docs/history/v0.6-status.md) (بالإنجليزية)
- [خارطة الطريق: خطة مستوحاة من V8 والمعماريات المستهدفة (بالإنجليزية)](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [خارطة طريق الإصدارات 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/history/release-roadmap-0.4-0.20.md) (بالروسية)
