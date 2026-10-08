# Object methods and primitive wrappers plan

Продолжение полной ES2020 цели. Сделать методы прототипов вызываемыми значениями
вместо скрытых intrinsic operations. Использовать общий static builtin builder,
обычный invoke ABI, explicit GC roots во всех native callbacks.

- [x] Object.prototype.toString/valueOf и Array.prototype.toString/join:
  generic receivers, nullish errors, separator, holes/inherited indices,
  custom callable join, metadata/descriptors, call/apply/bind и GC.
- [x] Boolean/Number/String prototype methods: valueOf, toString, receiver
  brand validation; Number.toString с radix formatting 2–36, включая fractions.
- [x] Общий OrdinaryToPrimitive с пользовательскими callbacks и аудит корней
  всех вызывающих runtime helpers. Убрать временный resolver только после этого.
- [x] Отдельные native/Node examples, full check/review и документация по этапам.

Object/Array methods и пользовательский OrdinaryToPrimitive реализованы.
Legacy resolver заменён обычным lookup/call с rooted scopes. Symbol.toPrimitive,
getters и JS exceptions требуют следующих этапов; полная ES2020 цель ещё открыта.
