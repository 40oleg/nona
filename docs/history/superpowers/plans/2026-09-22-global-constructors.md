# Standard global constructors

Продолжение полной ES2020 цели после OrdinaryToPrimitive. Не считать этап
завершённым до frontend bindings, native implementations и differential tests.

- [x] FunctionLayout.constructCode: отдельный native construct entry, ноль для
  обычных JS функций/bound wrappers. InvokeConstruct unwraps bound calls и
  передаёт out/argc/argv/callee/receiver по builtin ABI; source functions остаются
  на обычном invoke. Обновить все allocating paths, static layout и native tests.
- [x] Mutable global builtin properties и identifier lookup/write с shadowing.
  Script var с именем builtin без initializer сохраняет существующее значение;
  lexical bindings не конфликтуют с configurable builtin global properties.
  Не закреплять builtin names как immutable или reserved identifiers.
- [x] Object/Array/Boolean/Number/String constructors: static function objects,
  name/length/prototype и обратные constructor links, GC roots static nodes.
  Отдельный call/construct путь для primitive wrappers; Object identity/boxing;
  Array single numeric length versus element list, holes и invalid lengths.
- [x] Prototype selection, bound constructors, callbacks/GC during conversion,
  mutation and shadowing, metadata/deletion tests, standalone comparison example.
- [x] Full check, Node bytewise comparison, independent review, docs/matrix.

Dynamic eval/Function остаются исключены по поручению пользователя. Остальные
глобальные API и constructor static methods идут последующими этапами.

## Проверенные правила глобальных привязок

Node vm.runInNewContext подтвердил: var Object без initializer сохраняет
constructor identity и configurable:true; последующий delete globalThis.Object
успешен, typeof Object становится undefined. let Object=3 оставляет globalThis.Object
функцией. Object=3 меняет global property. var globalThis сохраняет this identity.

В binder отдельный набор mutable global builtins не включать в reserved check.
Script var builtin names используют property binding вместо нового undefined
storage slot/неудаляемого alias. Function declarations поверх builtin, напротив,
делают binding nonconfigurable: они используют прежний global alias/storage.
Это отдельно проверено Node differential test. Function-local var/parameters и
лексические declarations получают обычное локальное/лексическое storage.
Read/write/delete таких identifier-ов направлять в runtime global object;
обычное чтение удалённого имени — runtime error, typeof отсутствующего — undefined.
Нельзя просто добавить Object к текущему constant builtin lowering.

Механизм подключён на globalThis: writable/configurable non-enumerable static
property, явное GC tracing node, read/typeof/delete/write, var preservation,
function hoisting, lexical/local shadowing и closures. Затем подключены шесть
constructor names и реальные Object/Array/Boolean/Number/String implementations.
Function object поддерживает reflection и prototype links, но его call/construct
fatal: динамическая компиляция исключена. Class/subclass newTarget пока не существует.
