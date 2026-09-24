# Следующий этап: исключения и strict mode

План этапа полной ES2020 цели. Explicit throw/try/catch, finally, Error objects
и strict mode в текущем синтаксическом поднаборе реализованы и проверены.

## Зависимости и решение до реализации

Сейчас failIf вызывает rt.fail и завершает процесс. rootedFn снимает runtime
roots только обычным эпилогом; source frames также восстанавливают gcRoots
при return. Нельзя добавить прямой переход из throw в catch без восстановления
стека, цепочки roots и временных состояний runtime (например, join cycle guard).
PE UnwindFunction уже описывает allocation/saved registers, но наличие .pdata
само по себе не реализует JavaScript catch/finally.

- [x] Выбрать и записать механизм abrupt completion через source/runtime границы.
  Сравнить явное распространение completion с native unwinding. Для варианта
  с переносом управления доказать сохранность Windows x64 nonvolatile state,
  корректность stack/root restoration и выполнение runtime cleanup.
- [x] Описать handler/completion records: throw Value, catch target, finally
  target, pending return/break/continue, saved root chain. Все живые Values
  должны быть видны GC; raw адреса и masks не должны сканироваться как Values.
- [x] Сначала добавить throw/try/catch для произвольного Value с проверяемым
  проходом через вложенные functions, getters/setters и coercion callbacks.
- [x] Добавить finally с заменой pending completion: return/throw из finally
  перекрывает прежний результат; обычное завершение сохраняет его. Проверить
  labeled break/continue и вложенные finally.
- [x] Error/TypeError/ReferenceError/RangeError objects и перевод runtime checks
  из fatal-only в JS throw. Оставить отдельный fatal path для allocator/system
  failures. Перехватить реальные ошибки TDZ/readonly/coercion/constructability.
- [x] Проверить cleanup join/stringifying, nested descriptor helpers, bound
  argv buffers, partially collected descriptors и source new.target roots.

## Strict semantics после основы exceptions

- [x] Directive prologue с наследованием strict контекста; strict this без
  boxing/global substitution. Не распознавать escaped directive как use strict.
- [x] Early errors: duplicate parameters, restricted identifiers, delete
  identifier, legacy literals/escapes, with и запрещённые binding forms.
- [x] Throw при failed strict assignment/delete, const/TDZ, immutable named
  function binding; сохранить sloppy поведение существующих программ.
- [x] Unmapped strict arguments, callee/caller restrictions; отдельно учитывать
  будущие non-simple parameters и arrow lexical bindings.

## Обязательные проверки

- [x] RED→GREEN semantic tests против Node, GC stress, nesting и reentrancy.
- [x] После caught exception продолжить allocations/GC и проверить отсутствие
  stale root records/stack pointers и лишнего удержания heap allocations.
- [x] Standalone examples: catch primitive/object, nested finally, coercion
  exceptions, strict receiver/arguments. Совпадение stdout/stderr/status.
- [x] Full suite, независимое review ABI/GC/unwind, docs/support matrix.

Это не замена оставшегося объёма: arrows/templates, iteration, classes, Symbol,
modules, collections, async и стандартная библиотека остаются в общей цели.

## Решение первого шага

Explicit throw/try/catch: source-frame handler records сохраняют next/RSP/catchPC/
gcRoots/exceptionValue destination/cleanup snapshot и полный Win64 nonvolatile
register state. Nonlocal transfer допускается только из нашего JS throw runtime;
не перехватывает OS faults. Runtime cleanup chain снимает O.stringifying guards
до snapshot; root chain восстанавливается до catch frame. GC не выполняется
внутри передачи. Catch values и нужные catch locals сохраняются exceptional
CFG edges в liveness. Normal return/break/continue снимают покидаемые handlers.
finally и классифицированные runtime errors пока отдельные незавершённые шаги.

## Следующий шаг: finally completion routing

AST Try должен допускать handler=null и finalizer=Block|null, но требовать хотя
бы catch или finally. Binder обходит finalizer вне catch parameter scope и
учитывает var hoisting во всех трёх блоках. Lowering должен направлять normal,
return, throw, break и continue через finalizer только при выходе из его try:
локальный break/continue внутри защищённого блока не запускает finalizer.

Для throw используется отдельный внешний handler вокруг try/catch. Перед
входом в finalizer этот handler снимается: исключение из finalizer должно идти
во внешний catch. Pending return/throw Value хранится в rooted IR slot; return
expression вычисляется один раз до finalizer. Normal completion finalizer
восстанавливает pending completion; любой новый abrupt completion заменяет его.
Нельзя выполнять finalizer повторно при выходе из самого finalizer. CFG edges
должны сохранять pending Values и outer locals через callbacks и GC.

Обязательные новые проверки: try/finally без catch; normal/caught/uncaught throw;
return из try/catch/finally и замена throw на return; labeled break/continue;
вложенные finalizers с различными pending completions; break внутри finalizer,
который остаётся в его пределах; closure cells и GC с pending object Value;
исключение из getter/coercion и последующий join; отсутствие stale handlers
после каждого вида выхода. Сначала получить RED на текущем parser/lowering.

Решение finally: inline IR copies с отдельным outer handler для throw;
return/break/continue используют complete(), handler depth и finalizer depth.
Control snapshot исключает циклы внутри покидаемого try. Рост кода принимается
как текущий tradeoff; семантика pending completion проверена с GC stress.

## Следующий шаг: strict implementation contracts

Parser.checkDirective сейчас отклоняет raw use strict. Заменить это на metadata
Program/Function body, сохраняя запрет parenthesized/escaped pseudo-directives.
Binder должен наследовать strict через лексическое вложение, включая function
expressions/object methods; use strict внутри обычного блока не является
directive. Strict parameter validation выполняется после чтения всего body.

FunctionLayout.rawThis уже поддерживает native raw receiver: strict source
function может использовать тот же flag без расширения layout. Передать strict
из BoundFunction через newFunction IR и установить flag до публикации объекта.
Script this остаётся globalThis даже при strict script; function bare-call this
остаётся undefined, primitive call/apply/bind receiver не boxing.

Strict arguments должен получать обычные Values вместо mapped CellTag и
nonconfigurable poison callee accessor. Не полагаться на общее отсутствие mapping
всех функций: sloppy tests остаются действующими. Function caller/arguments
restrictions требуют poison intrinsic и отдельной проверки reflection/GC.

Property set/delete должны сообщать успех caller или принимать strict flag,
чтобы strict failed write/delete бросал TypeError после исходного порядка
вычислений. Sloppy failed assignments всё ещё игнорируются. Named function
expression immutable binding в strict должен бросать TypeError. Unknown global
assignment требует ReferenceError runtime в strict (и создания свойства в
sloppy), вместо нынешнего безусловного bind-time rejection. Early errors
restricted names/duplicate params/delete identifier отделяются от runtime errors.
