# Матрица поддержки языка

Дата проверки: 2026-09-23. Текущая версия: **Nona 0.1.0**.

Статусы: **проверено** — реализовано в указанных границах и проверено тестами;
**частично** — реализован только названный поднабор; **нет** — поддержки нет.
В таблице отражено состояние продукта, а не обещания из проекта решения.

| Возможность | Статус | Границы / подтверждение |
| --- | --- | --- |
| Самостоятельный EXE Windows x64 | Проверено | `standalone.test.ts`, `pe.test.ts` |
| Числа binary64, boolean, null, undefined | Проверено | `primitives.test.ts`, `numeric.test.ts` |
| UTF-16 строки, преобразования примитивов | Проверено | `strings.test.ts`, `numeric.test.ts`, `runtime-io.test.ts` |
| OrdinaryToPrimitive, пользовательские valueOf/toString | Проверено в текущем поднаборе | Number/default и string hints, порядок/mutations/fallback, bound methods, callbacks в property keys/join/apply/radix/array length, precise GC roots. Symbol.toPrimitive ещё нет; explicit throw из callbacks перехватывается. `coercion-hooks.test.ts` |
| Литералы и идентификаторы | Частично | Decimal/hex/binary/octal, Unicode ID_Start/ID_Continue, identifier escapes, `\u{…}` в строках; legacy octal ещё нет. `language-lexical.test.ts` |
| `var`, hoisting | Частично | Переменные, параметры, функции script/function body; двухфазный сбор объявлений, конфликты с lexical declarations, var redeclaration сохраняет функцию, последнее function declaration побеждает; duplicate simple parameters в sloppy mode. `declaration-instantiation.test.ts` |
| Арифметика, сравнения, логика, присваивания | Частично | Включая Number `**`/`**=`, битовые операции, запятую, `void`, `in`, `delete`, ordinary `instanceof`; Symbol.hasInstance и BigInt ещё нет. `language-operators.test.ts`, `exponentiation-grammar.test.ts`, `exponentiation-runtime.test.ts`, `objects.test.ts`, `constructors.test.ts` |
| Управление потоком | Проверено в текущем поднаборе | `if`, `while`, `for`, `do/while`, `switch`, метки, `break`/`continue`, `debugger` без отладчика. `language-control.test.ts`; `for/in`, `for/of` отдельно не реализованы |
| Функции | Частично | Script/function-body declarations, function expressions и lexical block/switch declarations; hoisting при входе, затенение, closures и fresh cells при повторном входе. Annex B var-like aliases не реализованы. `function-values.test.ts`, `closures.test.ts`, `block-functions.test.ts` |
| Вывод | Частично | Обычные изменяемые свойства global `console` и `console.log`; метод можно заменить, передать и вызвать detached. Форматирование текущего поднабора значений. `builtin-shadowing.test.ts`, `runtime-io.test.ts` |
| Объекты, свойства, прототипы, дескрипторы | Частично | Литералы, shorthand/computed keys, member read/write/update, identity, `in`, `delete`, цепочка прототипов и `__proto__`; defineProperty/getOwnPropertyDescriptor добавлены ниже; синтаксис методов/getters/setters реализован (включая computed names); super property read/write/call реализован. `objects.test.ts` |
| Native accessor foundation | Внутренняя инфраструктура | Getter/setter fields/GC, own/inherited dispatch и receiver, callback roots, primitive setter lookup; проверено test-only PE installer. Public defineProperty/getOwnPropertyDescriptor реализованы; accessor syntax реализован, `object-literal-methods.test.ts`. `accessor-runtime.test.ts` |
| Property descriptor reflection/conversion | Частично | Object.getOwnPropertyDescriptor, data/accessor fields без вызова getter, String/Array/arguments/global own properties, native legacy __proto__ identities. Internal To/From/Complete с presence mask и GC. DefineProperty реализован с validation/merge, SameValue, String/Array/arguments/global invariants; defineProperties/create и keys/values/entries/getOwnPropertyNames/getOwnPropertyDescriptors реализованы для текущих типов; Symbol/Proxy ещё нет. `object-collections.test.ts`. `define-property.test.ts`, `define-property-failure-state.test.ts`. `property-descriptors.test.ts`, `descriptor-conversion.test.ts` |
| Массивы, holes, индексы и `length` | Частично | Sparse literals, канонические индексы, рост/сокращение length, readonly length и nonconfigurable shrink barriers, toString/join как вызываемые методы, separator, inherited entries и циклы. Другие методы массивов ещё нет. `objects.test.ts`, `object-methods.test.ts` |
| Object.prototype.toString/valueOf | Проверено в текущем поднаборе | Generic tags/boxing, nullish rules, method metadata, call/apply/bind. Symbol.toStringTag ещё нет. `object-methods.test.ts` |
| Array.prototype.toString/join | Частично | Generic receivers, separator conversion, holes, nullish entries, ToLength, cycles, explicit custom join callback с GC roots. Coercion/accessor callbacks с precise roots; публичное создание accessors через defineProperty; Symbol ещё впереди. `object-methods.test.ts` |
| Функции как значения, вложенные функции, замыкания | Проверено в текущем поднаборе | Named/anonymous expressions, вложенные объявления в function body, selective/transitive captures по ссылке, independent/shared cells, named self-binding и GC. `closures.test.ts`, `environments.test.ts`; стрелок пока нет |
| `this` и receiver | Проверено в текущем поднаборе | Object methods, inherited receivers, parenthesized members, sloppy bare calls/global this, primitive boxing и GC rooting. Strict source functions сохраняют `undefined`, `null` и primitive receiver без подстановки/boxing. `this.test.ts`, `function-call.test.ts`, `strict.test.ts` |
| Глобальный объект | Частично | Dynamic resolution произвольных имён, catchable ReferenceError, `typeof`, sloppy creation, inherited lookup и strict RHS semantics; ordinary descriptors для `undefined`, `NaN`, `Infinity`, `console`, constructors и `globalThis`. Global lexical declarations не становятся properties. `name-resolution.test.ts`, `builtin-shadowing.test.ts`, `global-properties.test.ts`, `scope-resolution.cjs` |
| `new`, function.prototype и prototype.constructor | Частично | Ordinary functions, выбор prototype после аргументов, object return override, nonobject prototype fallback, writable/nonconfigurable prototype; `constructors.test.ts`. Native constructor dispatch и Object/Array/Boolean/Number/String; metadata-only Function (dynamic invocation исключён) |
| `arguments` | Частично | Sloppy mapped и strict unmapped arguments для простых параметров, включая duplicate-name rules, extra/missing values, length/callee, delete/defineProperty disconnect, escape/GC и shadowing. Strict `callee`, а также `Function.prototype.caller/arguments`, используют общий frozen ThrowTypeError intrinsic ES2020. `arguments.test.ts`, `duplicate-parameters.test.ts`, `strict.test.ts`. Default/rest параметры и Symbol.iterator ещё нет |
| Function.prototype.call | Проверено в текущем поднаборе | Receiver/arguments, raw builtin this, call.call, ошибки callable/constructable, runtime roots и boxing. `function-call.test.ts` |
| Function.prototype.apply | Проверено в текущем поднаборе | Array-like/arguments/boxed strings, inherited indices, holes, nullish list, ToLength и GC buffers; лимит 65 536 аргументов. `function-apply.test.ts` |
| Function.prototype.bind | Проверено в текущем поднаборе | Captured this/arguments, повторный bind, name/length, internal prototype, call/apply, ordinary new/instanceof и GC; combined argv до 65 536. `function-bind.test.ts` |
| Function.name/length и Function.prototype | Частично | Simple parameter count, explicit/inferred names, readonly/configurable data-properties; общий callable/nonconstructable Function.prototype с call/apply/bind/toString. `function-metadata.test.ts`, `function-call.test.ts`, `function-apply.test.ts`, `function-bind.test.ts`; Function object/prototype.constructor для reflection есть, dynamic constructor исключён; Symbol.hasInstance ещё нет |
| Function.prototype.toString | Проверено в текущем поднаборе | Точный source text обычных функций (comments/whitespace/Unicode), native representation builtin/bound functions, независимость от свойства name, implicit conversion. `function-source.test.ts` |
| Primitive wrappers/prototypes | Частично | Boxing Boolean/Number/String, primitive lookup, valueOf/toString с brand checks, wrapper identity/coercion, String readonly indices/length. Пользовательские coercion hooks поддержаны; Boolean/Number/String constructors есть; остальные методы ещё нет. `wrapper-methods.test.ts` |
| Number.prototype.toString(radix) | Проверено в текущем поднаборе | Основания 2–36, fractional/large/subnormal, signed zero/nonfinite, radix conversion/range checks; сравнение с Node, включая seeded binary64. `wrapper-methods.test.ts` |
| Strict mode | Проверено в текущем поднаборе | Directive prologue на уровне script/function, наследование контекста, strict `this`, unmapped arguments, restricted bindings/properties, early errors и TypeError/ReferenceError для запрещённых записей/удалений. Проверены порядок вычисления и изменение глобального свойства во время RHS; отдельный EXE `strict-mode.cjs` сравнивается с Node. Non-simple parameters и классы проверяются после их реализации. `strict.test.ts`, `strict-writes.test.ts` |
| `for/in`, перечисление свойств | Частично | Object.keys/values/entries и getOwnPropertyNames реализованы с порядком ключей и snapshot/recheck; синтаксиса for/in ещё нет |
| `eval`, динамические конструкторы функций | Исключено пользователем | Не входят в итоговый объём; обычные функции и Function.prototype остаются |
| `with` | Нет | Динамические object environment records не реализованы |
| RegExp | Нет | Нет парсера и исполнителя регулярных выражений |
| Базовая стандартная библиотека | Частично | Object/Array/Number/String/Boolean constructors и Function reflection, методы прототипов указаны выше. Date, Math, JSON, остальные constructors и методы ещё предстоят |
| Object integrity | Проверено в текущем поднаборе | preventExtensions/isExtensible/seal/freeze/isSealed/isFrozen: ES2015 primitive rules, shallow integrity, arrays, String wrappers, functions, mapped arguments и global aliases. Symbol/Proxy ещё нет. `object-integrity.test.ts` |
| Object inspection/prototype APIs | Проверено в текущем поднаборе | hasOwnProperty, propertyIsEnumerable, isPrototypeOf, toLocaleString, Object.getPrototypeOf/setPrototypeOf/is, special own properties и callback GC. Symbol/Proxy ещё нет; nonextensible prototype changes запрещены. `object-introspection.test.ts` |
| Сборка мусора | Частично | Точный немещающий mark/sweep, callable objects/environments/cells/globals/frames/prototypes, освобождение циклов и buffers; weak collections/async roots ещё нет. `gc.test.ts`, `liveness.test.ts`, `function-values.test.ts`, `environments.test.ts` |
| `let/const`, TDZ | Частично | Scope/hoisting/TDZ/readonly, declaration conflicts, catch/switch/loop interactions, captured bindings и per-iteration for/let cells. TDZ выбрасывает ReferenceError, const write — TypeError, обе ошибки перехватываются. `lexical-bindings.test.ts`, `declaration-instantiation.test.ts`, `closures.test.ts` |
| `throw`, `try/catch/finally` | Частично | Произвольный Value, optional catch binding, вложенные вызовы/getters/setters/coercion, catch closures, GC и native unwind; `exceptions.test.ts`, `exception-registers.test.ts`, `finally.test.ts`. Finally сохраняет либо заменяет normal/return/throw/break/continue completion; ошибки текущих языковых операций преобразуются в TypeError/RangeError/ReferenceError, fatal остаётся для allocator/IO/internal failures |
| Error family | Проверено в текущем поднаборе | Error/EvalError/RangeError/ReferenceError/SyntaxError/TypeError/URIError: call/new/bind, inheritance, message descriptor, generic toString, Error tag, GC; `errors.test.ts`, `runtime-errors.test.ts`. Текст runtime message собственный; nonstandard V8 stack/captureStackTrace и ES2022 cause не реализованы |
| Стрелки и шаблоны | Нет | Frontend пока отклоняет этот синтаксис |
| Destructuring, rest/spread, default parameters | Нет | Требуют новых AST/binding/lowering и итераторов |
| Классы, `super`, `new.target` | Частично | super properties в object methods/accessors: home object, current receiver, read/write/call/update и GC; `super-properties.test.ts`. new.target в ordinary functions/methods/accessors реализован (`new-target.test.ts`); классы и super() ещё отсутствуют |
| Symbol, итераторы, генераторы, `for/of` | Нет | Требуют runtime и новых состояний исполнения |
| Модули ES2015, динамический `import`, `import.meta` | Нет | API компиляции сейчас принимает один скрипт |
| Map/Set/WeakMap/WeakSet | Нет | Требуют объектов, хеширования и GC для слабых коллекций |
| Proxy/Reflect | Нет | Требуют полного протокола внутренних операций над объектами |
| ArrayBuffer/DataView/typed arrays | Нет | Требуют бинарной памяти, views и проверок границ |
| Promise, async/await, async generators | Нет | Нет очереди jobs и механизмов приостановки |
| ES2016: степень и includes | Частично | Number `**` и `**=` реализованы с right-associative grammar, ES special cases и автономным числовым ядром; BigInt и `includes` ещё нет. `exponentiation-grammar.test.ts`, `exponentiation-runtime.test.ts` |
| SharedArrayBuffer/Atomics | Нет | Нет shared backing stores и agent model |
| Новые API ES2017–ES2020 | Нет | Зависимости: базовые объекты, массивы, строки, обещания и RegExp |
| BigInt и BigInt typed arrays | Нет | Внутренняя арифметика biguint для double-конверсий не является типом JS BigInt |
| Nullish coalescing `??` | Проверено в текущем поднаборе | `nullish.test.ts`: null/undefined, falsy values, порядок вычисления, грамматика смешивания |
| globalThis | Проверено в текущем поднаборе | Writable/configurable global property, reassignment/deletion/typeof, var/function declaration semantics, lexical/local shadowing и GC. `global-properties.test.ts` |
| Object/Array/Boolean/Number/String constructors | Проверено в текущем поднаборе | Mutable globals, call/new, metadata/prototype/constructor links, boxed values, single numeric array length versus elements, bound constructors и GC callbacks. Static methods, Symbol/BigInt conversions и subclass newTarget — последующие этапы. `builtin-constructors.test.ts` |
| Optional chaining | Проверено в текущем поднаборе | Property/computed access, optional call, mixed chains, receiver, grouping, skipped effects, `delete`, early errors и GC roots. Private fields и tagged templates отсутствуют. `optional-chaining-frontend.test.ts`, `optional-chaining.test.ts`, `optional-chaining-gc.test.ts` |
| Полное соответствие ES5, ES2015 или ES2020 | Нет | Тесты подтверждают только текущий поднабор; есть согласованные исключения |

Имена тестов в таблице относятся к каталогу `tests/`.
Сводка запуска: [журнал](development-log.md).

Object.toString/valueOf, Array.toString/join и Function.toString материализованы
как функции. Их чтение/вызов/`in`/замена/удаление используют обычные properties.
OrdinaryToPrimitive вызывает пользовательские valueOf/toString с number/default
либо string hint, пропускает noncallable methods и продолжает после object result.
Методы читаются по очереди, с учётом мутаций. Array.toString вызывает custom join.
Reentrant callers защищены precise runtime scopes. Native getter dispatch реализован;
accessor syntax, Symbol.toPrimitive,
остальные builtin конструкторы/API и Symbol.hasInstance ещё предстоят. Контракт корней и границы GC описаны в
[памяти runtime](runtime-memory.md).
