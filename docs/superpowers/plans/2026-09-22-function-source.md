# Function source representation plan

Продолжение утверждённого functions-closures plan. Реализовать
Function.prototype.toString с точным исходным текстом source functions и native
representation builtin/bound functions. Eval/dynamic constructors исключены.

- [x] RED: comments/whitespace/Unicode/escaped names, anonymous/nested functions,
  metadata mutation, native/bound methods, errors, implicit conversion and GC.
- [x] Сохранять source metadata у token array и Program; closure IR sourceText
  берёт substring по FunctionNode.span. Для ручного IR без source — native fallback.
- [x] FunctionLayout.sourceText указывает только на static string descriptor;
  source/newFunction, native builtin builder и bound creation инициализируют поле.
- [x] Static toString builtin и leaf helper; включить в static roots. Временно
  распознавать именно этот callable в legacy intrinsic coercion resolver, до
  общего протокола пользовательских hooks. Object fallback tag для Function.
- [x] Native tests, independent review, check, standalone Node comparison, docs.

Representation builtin functions выбрано как у Node: `function name() { [native code] }`;
для bound functions и Function.prototype — `function () { [native code] }`.
Это допустимый native syntax, без зависимости от изменяемого свойства name.
