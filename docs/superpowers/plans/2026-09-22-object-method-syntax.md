# Object methods and accessors

Следующий этап общей ES2020 цели после descriptor/integrity runtime.

- [x] Parser: обычные concise methods, get/set accessors, computed/string/numeric
  names; distinction между property get/set и accessor prefix; arity и duplicate
  parameter early errors. __proto__ method/accessor — обычное own property.
- [x] AST/IR сохраняют вид функции и accessor field; source span включает полный
  method/accessor text. Binder сохраняет closure/arguments semantics.
- [x] Native methods/accessors nonconstructable, без own prototype. name/length,
  get/set name prefix, computed key evaluation один раз до создания closure.
- [x] Internal literal descriptor definition не зависит от изменяемого public
  Object.defineProperty. Getter/setter pair merge; data/accessor replacement
  соблюдает порядок и enumerable/configurable flags литерала.
- [x] HomeObject и super property semantics, включая receiver и prototype lookup;
  нельзя объявлять полную поддержку methods до этого шага.
- [x] Тесты early errors, closures, receiver, source text, constructor rejection,
  descriptor reflection, duplicate keys, getter/setter merge, GC stress.
- [x] Full suite, standalone example против Node, независимое review и docs.

Strict mode, generators, async и Symbol keys пока отдельные незавершённые части
общего плана. Их отсутствие должно оставаться явным в support matrix.
