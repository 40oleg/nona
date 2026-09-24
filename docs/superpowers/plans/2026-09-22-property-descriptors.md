# Property descriptors and accessors

Полная ES2020 цель продолжается. Реализация по зависимостям, без объявления
descriptor API готовым до публичных операций и проверок invariants.

- [x] Property payload getter/setter Values, accessor attribute, zero-init всех
  allocation paths, GC tracing и очистка при unlink static property.
- [x] Native get/set accessor dispatch: original receiver, inherited accessors,
  missing getter/setter, ignored setter result, primitive receiver setter lookup.
  Root method/receiver/argument/temporaries при reentrant JS.
- [x] Аудит новых getter callers: bind metadata fresh bound value и target,
  newInstance/instanceOf prototype temporary, ранее защищённые join/apply/coercion.
- [x] Native tests через test-only descriptor installation, GC stress и review.
- [x] Internal To/From/CompletePropertyDescriptor: presence mask, field order,
  validation, callback roots и defaults для переиспользуемых records.
- [x] Public Object.getOwnPropertyDescriptor: data/accessor reflection, boxed
  strings, array length, mapped arguments, globals и virtual __proto__ identities.
- [x] DefineOwnProperty/Object.defineProperty и invariants data/accessor.
- [x] Array length writable/truncation failure, string own properties, mapped
  arguments disconnect, global aliases и virtual __proto__ descriptor.
- [x] Object.defineProperties/create и property enumeration.
- [x] Extensibility APIs: preventExtensions/isExtensible/seal/freeze/isSealed/isFrozen.
- [x] Syntax getters/setters и object methods со своим function semantics.
- [x] Full suite, Node examples, документация и matrix.

Для native dispatch tests исходник вызывает globalThis.installAccessor; test
composition добавляет helper только в тестовый PE. Production runtime не получает
несуществующего JS builtin и не обходит descriptor invariants публично.

## Реализованный контракт: DefineOwnProperty

Публичный defineProperty проверяет Object target до key coercion, затем вызывает
ToPropertyDescriptor и только после callbacks читает актуальное own property.
Partial presence mask сохраняется до ValidateAndApply: Complete нельзя вызывать
при изменении существующего свойства, иначе отсутствующие flags изменят его.
Нужны SameValue для NaN/signed zero и getter/setter identity, atomic validation
перед записью, configurable data/accessor transitions и nonconfigurable checks.

Exotic cases обязательны до заявления полноты API: String indices/length,
array length readonly + descending deletion с восстановлением length при
nonconfigurable index, mapped arguments disconnect и global binding aliases.
Для array length readonly/extensibility добавлен ObjectLayout.flags at 40,
ObjectLayout.size=48 с zero-init во всех allocators; FunctionLayout.size=104,
BoxLayout.size=64. NonExtensible bit зарезервирован для следующих APIs.

__proto__ материализован как настоящий accessor node со стабильными
rt.protoGetter/rt.protoSetter. Переопределяется общим ValidateAndApply; virtual
fallback отключён. Delete/redefine, primitive receivers, Object.prototype
immutability и static GC tracing проверяются существующими и новыми tests.
