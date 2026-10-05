# التوافق والقيود

## النطاق

يستهدف Nona اللغة والكائنات المدمجة في الإصدار المعياري الحادي عشر من ECMA-262 ‏(يونيو 2020)، للسكربتات ووحدات ES. أما التدويل ECMA-402 وواجهات المتصفح وواجهات Node.js فهي مواصفات منفصلة؛ ولا يوفّر Nona إلا واجهات المضيف المذكورة في [المرجع](/ar/reference/modules). ويُحفَظ عقد الاكتمال في [`docs/es2020-contract.md`](https://github.com/40oleg/nona/blob/main/docs/es2020-contract.md).

يوصف كل إصدار بأنه «ES2020 مع استثناءات موثّقة»، ولا يوصف أبدًا بأنه متوافق تمامًا مع ES2020.

## `eval` و`Function` {#eval-and-function}

يترجم Nona مسبقًا، لذا يحتاج `eval` ومُنشئات الدوال الديناميكية إلى نصها المصدري وقت الترجمة:

- **يُترجَم مسبقًا:** السلسلة الحرفية، أو تسلسل من السلاسل الحرفية، أو المتغير الذي لا يُسنَد إليه إلا مثل هذه الثوابت (وتُقارَن القيمة وقت التشغيل). يرى `eval` المباشر نطاق المستدعي و`this` و`arguments` و`new.target` و`super`؛ أما الأشكال غير المباشرة (`(0, eval)(…)` و`globalThis.eval(…)` و`eval?.(…)`) فتعمل في النطاق العام. واستدعاءات `Function` و`GeneratorFunction` و`AsyncFunction` و`AsyncGeneratorFunction` التي تكون كل وسائطها قيمًا حرفية تُترجَم بدلالات CreateDynamicFunction.
- **غير مدعوم:** الشيفرة المحسوبة وقت التشغيل، ووسائط spread المُمرَّرة إلى `eval`، و`$262.evalScript`. وكلها ترمي:

```text
EvalError: Nona compiles ahead of time: eval and Function need source text known at compile time
```

تُتابَع الشيفرة المحسوبة وقت التشغيل في [#11](https://github.com/40oleg/nona/issues/11).

## الفروق عن Node.js

| المجال | Nona | Node.js |
| --- | --- | --- |
| `process.argv` | `[execPath, ...arguments]`: ‏`argv[1]` هو الوسيط الأول | `[node, script, ...arguments]` |
| `process` | `argv` و`env` و`exit` و`exitCode` و`execPath` و`cwd` و`platform` و`arch` و`pid` | ‏EventEmitter مع تدفقات و`nextTick` و`hrtime` وغيرها |
| معرّفات المؤقتات | أعداد | كائنات `Timeout` |
| `readFileSync(path)` | يعيد `Uint8Array` | يعيد `Buffer` |
| الترميزات | `utf8` فقط | كثيرة |
| رسائل الخطأ على Windows | تحتوي على المسار كما مُرِّر | تحتوي على المسار المطلق |
| الوحدات | `nona:*` و`node:fs`, `node:path` و`node:process` والملفات النسبية | كل ما في `node:*` وحزم npm |
| `require` و`Buffer` | غير متاحة | متاحة |
| `console.log` دون مخرج قياسي | يُتجاهَل الناتج | يُتجاهَل الناتج أو يُرمى خطأ |

## الأداء

- تحفظ المصفوفات و`Map`/`Set` عناصرها في بنى مترابطة؛ والمجموعات الكبيرة جدًا أبطأ منها في V8 ‏([#13](https://github.com/40oleg/nona/issues/13) و[#36](https://github.com/40oleg/nona/issues/36)).
- محرك RegExp آلة افتراضية بالتراجع مكتوبة بلغة JavaScript. النمط الخالي من المراجع الخلفية والنظر الأمامي والخلفي الذي يكثر التراجع (دون العلامة `u`) يكمله محرك بزمن خطي.
- على Windows تستيقظ المؤقتات مع نبضة النظام (عادةً 15.6 ms).
- لا يوجد JIT: تُترجَم الشيفرة مرة واحدة مسبقًا، دون تحسين موجَّه بالتنميط.

## العوالم (Realms)

‏`$262.createRealm` مدعوم لأجل Test262. وما زالت بعض المُنشئات المنفَّذة في مقدّمات JavaScript تأخذ النماذج الأولية الافتراضية من العالم الخطأ حين تُستدعى بـ `new.target` من عالم آخر ([#7](https://github.com/40oleg/nona/issues/7)).

## المنصات

- المنصات المستهدفة: Windows 10/11 x64 وLinux x86-64 فقط.
- لا تستورد الملفات التنفيذية لـ Windows إلا `KERNEL32.dll` و`KERNELBASE.dll` وملفات DLL المصرَّح عنها عبر FFI؛ أما الملفات التنفيذية لـ Linux فثابتة الربط وتستخدم استدعاءات النظام مباشرةً.
- استدعاء ملفات DLL عبر FFI متاح على Windows فقط، واستدعاءات النظام الخام على Linux فقط.

## الأنظمة الأصلية

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — الأنظمة الأصلية](/reference/native-platforms). `darwin-arm64`: system dyld/libSystem startup.
