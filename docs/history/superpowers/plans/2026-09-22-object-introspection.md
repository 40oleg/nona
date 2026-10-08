# Object property and prototype APIs

Продолжение полной ES2020 цели после constructors. Сначала inspection/prototype
operations, затем descriptors/getters/enumeration/extensibility отдельными этапами.

- [x] Общий prependFunctionBuiltin сохраняет existing owner property chain.
- [x] Own attribute lookup: data properties, array length, boxed string indices
  и length, mapped arguments, global aliases и virtual __proto__ accessor.
- [x] Object.prototype.hasOwnProperty/propertyIsEnumerable: key conversion до
  ToObject(receiver), GC roots receiver/key. isPrototypeOf: non-object argument
  возвращает false до ToObject(receiver). toLocaleString invokes current toString.
- [x] Object.getPrototypeOf/setPrototypeOf: nullish rules, primitive boxing/no-op,
  prototype validation, cycles и immutable Object.prototype. Object.is SameValue.
- [x] Native/Node differential tests, callback GC stress, metadata/errors,
  standalone example, review, full check и документация.

Symbol keys/Proxy/getters/extensibility subclasses и JS exceptions пока не готовы.
Object.create с descriptors будет реализован вместе с descriptor machinery;
второй аргумент не должен молча игнорироваться.
