# Контрольная точка — 2026-09-23

Полная цель: весь язык до ES2020, кроме eval и динамического Function, собственный
Windows x64 PE runtime без Node/CRT/LLVM/interpreter. Цель НЕ завершена.

Последний проверенный этап: Number exponentiation и optional chaining. Финальный
`npm run check`: 1078 total, 1077 pass, 0 fail, 1 Windows symlink skip
(`work/modern-expressions-check.log`). Все 33 `examples/compat`, включая
`modern-expressions.cjs`, совпали с Node по stdout/stderr/status
(`work/modern-expressions-compare.log`, `work/compat-report.json`). Каталог не
является Git repository. Независимое review нашло и закрепило тестами две
ошибки: infinite-exponent comparison и receiver вложенной optional chain.

Текущая архитектура: FunctionLayout payload112, homeObject104; GC traces homeObject.
Source ABI sixth stack arg new.target pointer, copied next to this, rootcount
slotCount+2. Detailed contracts: runtime-memory.md. Подробности этапов и исправлений
порядка super key/base/RHS: development-log.md. Точная support matrix:
language-support.md. Дифференциальные проверки используют Node 26.9; известные
исторические различия ES2020 (разрешение strict assignment и общий
ThrowTypeError intrinsic) закреплены отдельными ожидаемыми результатами.

Остаётся значительный объём: for-in/of, arrows/templates,
rest/default/destructuring/spread, classes, Symbol/iterators/generators, modules,
Map/Set/Weak*, Proxy/Reflect, buffers/typed arrays, Promise/async, RegExp, BigInt
и большая часть стандартной библиотеки. Не переопределять цель вокруг уже
реализованного поднабора. Legacy-пункт 3 остаётся явно отложенным; следующий
новый пункт начинать только по команде пользователя.

Проверять usage каждые 10 минут активной работы. При расходе строго больше
3 процентных пунктов за 10 минут приостановить эту задачу и сообщить пользователю.
Ограничения самой платформы этим не изменяются.
Не помечать всю цель complete из-за исчерпания доступного usage.

Работа возобновлена. План текущего этапа:
superpowers/plans/2026-09-22-exceptions-strict.md. Реализованы explicit throw и
try/catch/finally; 28 tests exceptions, 25 tests finally, native GP/full128 XMM
restoration test. Независимое review дополнительно проверило7 native/Node
GC-stress сценариев finally без замечаний. Pending completion реализован inline
IR copies. Error family:15 tests, runtime errors:38 tests. Новый независимый
review плюс5 native/Node probes без дефектов. rt.throwTypeError/ReferenceError/
RangeError callback-free; rt.fail остаётся для allocation/IO/internal failures
и uncaught throw reporting. Runtime messages generic, V8 stack отсутствует.
Документация ABI/cleanup: runtime-memory.md. Strict mode: directive prologue,
наследование, raw this, unmapped arguments, restricted properties/bindings,
failed write/delete и глобальное разрешение проверены 53 целевыми тестами.
Исторический ES2020 общий frozen ThrowTypeError используется для restricted
Function properties и strict arguments.callee. Независимое review не нашло
оставшихся замечаний в границах поддерживаемого синтаксиса.
Эта контрольная точка не означает завершение цели.

Этап scope/name resolution добавил runtime global references, ordinary intrinsic
global properties и `console`, чистый сбор declarations/early errors и lexical
block functions без Annex B aliases. Целевой журнал: 41 pass в
`work/scope-resolution-targeted.log`; полный и compatibility журналы указаны выше.
Следующим остаётся пункт 3 согласованного списка; текущая работа его не начинает.

Этап modern expressions добавил `**`/`**=` и optional chaining с optional calls,
delete, receiver preservation, grouping semantics и GC-stress coverage. Числовое
ядро не импортирует CRT/libm; дифференциальный корпус допускает не более 1 ULP.
Журналы полного и compatibility прогонов: `work/modern-expressions-check.log`
и `work/modern-expressions-compare.log`. Ручной пример:
`examples/modern-expressions-demo.js`.
