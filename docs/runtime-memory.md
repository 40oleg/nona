# Память и GC

Текущий runtime использует точный немещающий mark/sweep. Tagged Value имеет
16 байт: tag и payload. Только String/Object payload считается pointer root;
числа с похожими битами не удерживают память. Адреса живых объектов не меняются.

## Аллокации и обход графа

Header перед payload: next, payload bytes, kind, marked, greyNext (40 байт).
Kind raw не содержит ссылок; object указывает на properties/prototype; property
указывает на next/key и содержит tagged Value. Numeric scratch и UTF8 output
buffers — raw, не сканируются как произвольная память.

Object payload теперь 48 bytes: kind/properties/length/prototype/stringifying
на прежних offsets 0/8/16/24/32, flags at 40. Flags не содержат pointers;
bit 1 — nonExtensible (подготовлен для следующих APIs), bit 2 — array length
readonly. Zero означает extensible + writable length. Все allocators и static
payloads инициализируют flags; function/box поля сдвинуты относительно O.size.

Property payload теперь 72 байта: next(0), key(8), Value(16), attributes(32),
getter Value(40), setter Value(56). GC трассирует все три Value; неиспользуемые
getter/setter fields обнуляются при allocation/data conversion/deletion.
Bits attributes: writable=1, enumerable=2, configurable=4, accessor=8. Обычные свойства
получают 7; function.prototype — 1, prototype.constructor — 5, name/length — 4. Публичный
Object.defineProperty/getOwnPropertyDescriptor реализованы. Native accessor dispatch
проверен через public API и test-only PE installation; getter/setter roots сохраняют
методы после удаления самого свойства.
Attributes не содержат heap edges.

Callable object использует тот же object prefix и trace kind; адрес нативного
кода не является heap edge. Поле environment указывает на массив выбранных
captured cells; каждая cell содержит один tagged Value. Callee остаётся tagged
Value в caller root slots на всё время косвенного вызова.
Поле constructable отделяет обычные source functions от callable, но
неконструируемого Function.prototype. Native code/environment/constructable
занимают offsets 48/56/64; rawThis flag — 72, bound-data pointer — 80,
sourceText descriptor — 88, native constructCode — 96, homeObject pointer — 104, полный function payload — 112 bytes.
ConstructCode — static code pointer, не managed edge. Ноль означает обычный
source-function construct через invoke. Ненулевой entry получает builtin ABI
out/argc/argv/callee и prepared receiver пятым аргументом. Bound wrappers хранят
ноль и передают construction дальше target-у; режим не определяется по thisArg.
SourceText всегда указывает на immutable static string в PE, поэтому не является
managed heap edge. Source functions используют точный substring исходника,
native/bound functions — static native representation. Имена свойств можно
менять/удалять независимо от этих данных. Manual IR без sourceText получает
native fallback. Если когда-либо появятся динамические source descriptors,
их потребуется добавить в GC tracing (динамические функции исключены из цели).
Raw builtin this не нормализуется invoke. BoxKind=4 содержит tagged primitive
в offset 48 (полный box payload 64 bytes), GC отдельно трассирует его String
payload. Static Number/Boolean/String prototypes используют тот же layout.
Object/Array/Boolean/Number/String/Function constructor objects и их static nodes
прослеживаются отдельно; global property и prototype.constructor links mutable.
Intrinsic prototype property самого constructor nonwritable/nonconfigurable.
Number/String constructor callbacks root-ят argv, primitive temporary и output
container. Primitive construct entries возвращают новый Box; Array возвращает
новый Array-kind object, Object сохраняет object argument identity либо boxing.
Подготовленный обычный instance может быть заменён object result конструктора.
Cell roots в compiler slots имеют внутренний tag 254, не видимый JavaScript.
Mapped argument properties также хранят Cell Value с tag 254: get возвращает
содержимое, write изменяет cell, delete снимает связь. DefineProperty с accessor
отсоединяет mapping; readonly data descriptor сперва обновляет параметр, затем
сохраняет его текущее значение как обычный Value и отсоединяет mapping. Обычный property tracer
удерживает эти cells и их значения даже после возврата из source function.
Arguments object использует общий object prefix с kind=3; length/callee —
обычные writable/configurable properties. Отдельного массива параметров в heap
не требуется: metadata передаётся в stack scratch только на время создания.
При повторяющихся formal names только последняя позиция содержит Cell Value
в metadata; ранние позиции содержат undefined marker и копируются из actual
argv как независимые значения. Отсутствующий последний actual аргумент не
меняет этот выбор mapping. Лишние physical parameter slots не становятся
долгоживущими bindings и очищаются обычным liveness.
GC трассирует environment→cells и cell→Value, включая циклы. Parser/binder и
lowering source closures подключены: захватываются только необходимые bindings,
а транзитивные captures передаются через промежуточные функции.

Каждая ordinary function создаёт собственный prototype object с обратной
constructor ссылкой; этот цикл доступен через обычные property edges и собирается
при потере корней. `new` lowering состоит из prepare-instance, invoke и выбора
return object/instance. Instance и constructor живут в compiler root slots между
этими операциями; runtime helper не хранит временные raw pointers через вызов JS.

Строковый descriptor может находиться внутри allocation: числовой форматтер
использует смещение 2400 в рабочем блоке. Поэтому membership проверяет диапазон
payload. Перед каждой сборкой создаётся индекс адресов блоков, сортируется heapsort;
маркировка находит содержащий блок двоичным поиском. Индекс выделяется напрямую
через HeapAlloc и освобождается после сборки, не входит в managed allocations.
Сложность индекса O(B log B), обхода O(E log B), sweep O(B). Пользовательский граф
обходится итеративно через grey list, глубина цепочки не расходует стек сборщика.

## Корни и safepoints

Корни: global Value array, static global object/Object/Array/Function prototypes и цепочка активных
кадров. Root frame содержит previous, Value array, count (24 байта). Все slots
инициализируются до регистрации; перед каждой IR operation мёртвые slots
очищаются по backward liveness. Аргументы остаются в caller slots до копирования
в callee. Результат копируется в caller до снятия callee root frame.

Receiver передаётся пятым аргументом Windows x64 ABI (caller stack+32).
Каждый JS frame копирует его до первой safepoint в дополнительный tagged Value
после обычных slots. Этот this root живёт до return и не очищается liveness.
Script var/function properties глобального объекта ссылаются на те же global
Values через static key/Value* table; lexical globals в неё не входят.
Два статических property nodes Function.prototype (name/length) трассируются
явно: managed heap index не содержит их адреса. Динамические свойства прототипа
идут через обычные property edges. Dynamic inferred name остаётся String root
в compiler slot до newFunction; внутри этой IR operation GC не запускается.
Также явно трассируются static call function, её metadata, mutable call property
и primitive prototypes. Удаление property после unlink обнуляет edges в node:
иначе static root table удерживала бы бывшее значение удалённого свойства.

Function.prototype.call регистрирует два runtime ranges: target Value и весь
incoming argv. Они сохраняются через reentrant JS safepoints и снимаются после
return. Box, создаваемый invoke для sloppy receiver, копируется в this root
callee до первой safepoint; после возвращения invoke этот временный box не читает.

Function.prototype.apply дополнительно создаёт managed raw buffer из скопированных
аргументов. Третий runtime range удерживает сам буфер и заполненные Values; count
увеличивается после записи каждого элемента. MarkRange отмечает allocation,
содержащую адрес values, до обхода элементов: иначе элементы были бы живы, а буфер
мог бы освобождаться. Stack/static ranges не совпадают с managed heap и безопасно
игнорируются на этом шаге. После return все три ranges снимаются; следующий GC
освобождает буфер. Вложенные apply и освобождение проверены в stress tests.
Static apply function и её property nodes также входят в явные корни.

Bound function сохраняет nullable FunctionLayout.bound pointer. HeapKind.boundData
содержит count, затем target, receiver и bound arguments как contiguous Values.
GC отмечает этот блок из callable object и обходит count+2 Values. Поэтому
сохранённые closures, receiver, аргументы и циклы имеют обычное время жизни.
Normal bound invoke объединяет bound/incoming args в managed raw buffer с тремя
runtime ranges: callee, incoming argv и combined argv. Constructor invoke
сохраняет instance, созданный и укоренённый IR, вместо bound receiver. После
возврата ranges снимаются; unreachable bound cycles/buffers освобождает GC.
Static bind function/properties включены в явную таблицу корней.

Материализованные Object/Array methods и их static property/metadata nodes также
трассируются явно. Array.prototype.toString регистрирует два contiguous Values
(boxed receiver и join callable) до Get/Invoke, сохраняя их через JS safepoints.
Callback может удалить собственный метод, очистить внешнюю ссылку или вызвать
вложенный toString. После return native helper снимает root scope. Array.join
body пока leaf-only: separator/item ToString и property Get не вызывают JS;
общий coercion этап обязан укоренить accumulator, keys/items и receiver перед
разрешением callbacks. Cycle guard включается после separator conversion.

Boolean/Number/String methods и metadata имеют такие же явные static roots.
Branded valueOf возвращает primitive payload, сохраняя signed zero и string
descriptor. Nondecimal radix formatter использует managed raw buffer 4416 bytes;
выдаёт interior string descriptor с UTF-16 данными. GC удерживает allocation по
interior pointer результата; внутренние scratch числа не являются roots.
Formatter leaf-only, использует SSE2/собственный remainder, без CRT/V8 runtime.
Number.toString radix conversion защищена input/output/local roots для user callbacks.

Bind metadata root-ит fresh bound Value, target и name/length temporaries через
getter callbacks. Аллокация bound data до metadata пока leaf-only; будущий
GetPrototypeOf proxy trap потребует отдельного аудита этого участка.

Apply root-ит length/key/number temporaries и initialized portion argv buffer.
Чтение length/indices и ToNumber могут вызывать native accessor/coercion callbacks.

Только script-level var/lexical/function bindings живут в global array. Вложенные
block/for/switch lexicals в main — локальные slots кадра; они не становятся
вечными глобальными корнями после выхода из области видимости.

Проверка порога выполняется перед IR operations. Начальный порог — 1 MiB managed
bytes; после сборки — max(1 MiB, 2 × live bytes). Leaf runtime helpers сами
не вызывают GC. Это сохраняет их временные raw pointers без регистрации
каждого внутреннего буфера. Reentrant call helper отдельно регистрирует ranges,
поскольку вызываемый JS входит в safepoints. Одна большая leaf операция может
временно превысить порог.
Итоговая уборка оставшихся allocations выполняется при завершении EXE.

## Контракт для следующих этапов

DefineProperty проверяет Object target до key coercion и ToPropertyDescriptor,
затем raw GetOwnDescriptor читает текущее состояние. ValidateDescriptor проверяет
configurable/enumerable/kind/writable/SameValue и меняет только local merged
record при успехе; отказ до commit не меняет target или mapped cell. Existing
properties сохраняют поля, отсутствующие в partial descriptor. String own keys
проходят compatible-descriptor validation; global var/function aliases остаются
nonconfigurable, но writable можно сбросить. Global alias table теперь содержит
24-byte entries (key, Value pointer, attributes) в .data; runtime property stores
и compiler storeGlobal проверяют один writable bit.

Array length value проходит два преобразования с roots: ToUint32, затем ToNumber
исходного Value. После callbacks читается актуальный length descriptor. Нативный
commit сначала определяет самый высокий nonconfigurable index, затем удаляет
indices выше него и восстанавливает length=barrier+1 при отказе; если barrier нет,
применяется requested length. Delete не вызывает JS, поэтому два прохода
эквивалентны descending deletion без перебора всех holes. Requested readonly
применяется и при отказе сокращения. Sloppy assignment игнорирует Boolean failure;
Object.defineProperty преобразует его в перехватываемый TypeError.
Некорректная длина выбрасывает RangeError. Запись readonly length не преобразует RHS.

Descriptor record — 104 bytes: enumerable/configurable/value/writable/get/set
Values (offsets 0/16/32/48/64/80), presence mask at 96. Presence bits 1/2/4/8/16/32
отделяют отсутствующее поле от explicit undefined. Mask -1 обозначает missing
own property; data/accessor complete masks — 15/51. GC сканирует только 6 Values,
не mask. ToPropertyDescriptor инициализирует output record до callbacks и root-ит
его range, input object и key/has temporaries. Has/Get выполняются поочерёдно
enumerable/configurable/value/writable/get/set; callable validation немедленная,
проверка mixed data/accessor — после чтения всех полей. Complete заполняет
отсутствующие поля независимо от прежнего содержимого initialized storage.
From создаёт свежий обычный объект с own data properties, обходя inherited setters.

GetOwnPropertyDescriptor box-ит target до key coercion, сохраняет boxed target
и key через callbacks, читает accessor functions напрямую, не вызывая getter.
Mapped arguments возвращают current cell Value. __proto__ материализован как
настоящий static accessor node со стабильными native getter/setter functions;
node, functions и metadata properties добавлены в static GC roots. Старый virtual
fallback отключён. Тестовый roundTrip не экспортируется в production globals.

Object inspection methods получают rooted native frame с копией raw receiver,
argv range, converted key и boxed receiver. Own attribute lookup после coercion
остаётся leaf-only; учитывает data nodes и специальные array/string/global keys.
ToLocaleString root-ит lookup result и receiver через invoke callback. Общий
prependFunctionBuiltin сохраняет предыдущую цепочку свойств static owner;
методы и property nodes добавлены в явные static GC roots.

GlobalThis — static property node глобального объекта, отдельно прослеживаемый
GC (включая heap Value после переназначения). Удаление очищает node как прочие
static properties; новое присваивание создаёт обычный managed property node.
Known mutable global names читаются через runtime global object, без постоянного
снимка builtin value в compiler global slots. Лексические и локальные shadowing
bindings используют обычные slots/cells. Script function declarations используют
неудаляемые aliases; bare var builtin сохраняет configurable property.

`rootedFn` создаёт precise runtime scopes с сохранением исходных offsets locals.
Входной Value сохраняется снимком вместе с typed pointer на его контейнер;
output root удерживает только контейнер и не читает ещё не записанный результат.
Range удерживает свой heap buffer и Value elements. Local ranges обнуляются
до регистрации. Raw managed pointer представляется внутренней ссылкой, которая
не видна JavaScript. Scope сохраняет RAX/XMM0 при снятии и передаёт увеличенный
frame size emitter-у для корректного доступа к stack arguments.

Scopes подключены к преобразованиям числа/строки, арифметике, сравнениям,
битовым операциям и console.log. Property read/has/delete, array length, join, apply и number radix также
защищены scopes. Четыре native tests в runtime-roots.test.ts
проверяют живые байты после GC, изменение исходного Value, nested scopes,
освобождение после возврата, return registers и пятый argument. OrdinaryToPrimitive включён; coercion-hooks.test.ts проверяет callbacks и
мутации при сборке перед каждой операцией. Getter dispatch и дополнительные roots
bind metadata/newInstance/instanceOf проверены в accessor-runtime.test.ts;
Object.getOwnPropertyDescriptor и internal To/From/CompletePropertyDescriptor
проверены в property-descriptors/descriptor-conversion tests. DefineProperty и
exotic write invariants проверены в define-property/failure-state tests;
accessor syntax проверен в object-literal-methods.test.ts.

Source binding/capture analysis создаёт только необходимые cells и загружает
их из окружения. Captured for/let cells копируются до первого condition и
после body перед update; block cells создаются заново при каждом входе.
При добавлении других вызовов
пользовательского JS из runtime (getters, coercion hooks, callbacks) нужны явные
runtime root scopes либо проверяемое запрещение GC на время helper: текущего
межоперационного правила для reentrant вызовов недостаточно.
Исключения обязаны снимать root frames при unwind. Promise jobs/modules добавят
долгоживущие runtime roots. WeakMap требует ephemeron processing отдельно.

## Проверка

`tests/gc.test.ts` запускает реальные EXE: освобождение блоков/циклов, interior
strings, static prototypes, отсутствие false roots от чисел, сборка перед каждой
операцией, рекурсия, shared objects, давление памяти, истёкшие lexical scopes и
цепочка из 40 000 объектов. Test-only wrappers проверяют нативные gcCount,
gcRoots/liveBytes; нестандартный JavaScript builtin не добавляется.
`examples/compat/memory.js` сравнивает программу с циклами аллокаций с обычным Node.

## Own-key snapshots и bulk descriptors

HeapKind.valueList=6: count at 0, initialized tagged Values from offset 8.
GC traces every slot. OwnKeys snapshots строковые keys без callbacks; индексы
сортируются heapsort, остальные keys сохраняют creation order. Snapshot удерживает
динамические строки даже после удаления property nodes во время getter.
Enumeration methods root source, snapshot, result и промежуточную пару/descriptor.
DefineProperties сначала собирает все descriptors в typed ValueList: каждый record
занимает восемь Values — key, шесть полей и presence mask как Number Value. Только
после успешной коллекции начинается последовательный DefineOwnProperty. Native
mask восстанавливается из tagged Number; GC никогда не читает raw bitmask как tag.
Незаполненные slots нулевые до первой возможности повторного входа в JS.

## Integrity levels

Object flags bit1 используется preventExtensions; seal/freeze сначала устанавливают
его, затем применяют partial descriptors через DefineOwnProperty. Keys и target
удерживаются runtime roots. Descriptor fields инициализированы, raw presence mask
находится вне Value range. Accessor bodies не вызываются при integrity queries
или seal/freeze. Freeze mapped arguments проходит общий descriptor path и
отключает mapping, сохраняя текущее значение. SetPrototype сравнивает identity
до проверки nonExtensible: тот же prototype допустим, другой вызывает error.

## Literal methods/accessors

IR defineAccessor удерживает object/key/function в liveness set; native helper
rootedFn удерживает их и шесть initialized descriptor Values. Literal definition
обходит изменяемый public Object.defineProperty, но использует общий внутренний
DefineOwnProperty. Partial get/set descriptor сохраняет вторую половину пары.
NewMethod создаёт fresh function через leaf newFunction, затем удаляет private
prototype node и constructable flag до публикации/GC safepoint. Временный prototype
и его constructor node собираются при следующем GC. Metadata helper допускает
отсутствие prototype; методы получают length/name в правильном порядке.

## Super property references

Function.homeObject raw pointer удерживает исходный object literal; GC обходит
его, поэтому borrowed/bound method сохраняет связь даже после удаления внешних
ссылок. NewFunction/bound allocators инициализируют поле нулём, static payloads
расширены через FunctionLayout.size. Lowering хранит receiver и raw key.
На Get/Put заново читает текущий home prototype до key coercion; compound
операция преобразует raw key отдельно для Get и Put. Этот порядок проверен против
Node 26.9.0, в том числе mutation внутри key/RHS/getter; старые редакции
спецификации нельзя использовать как доказательство этого порядка.

Native superDescriptor проходит own descriptors по цепочке без вызова getters.
SuperGet вызывает найденный getter с исходным receiver. SuperSet вызывает setter
или делает ordinary data write на receiver через DefineOwnProperty; собственный
accessor receiver блокирует data write. Frame roots удерживают base/key/receiver/
value, complete и partial descriptors. Delete super вычисляет только expression
ключа без ToPropertyKey и выбрасывает ReferenceError.

## new.target ABI

Source functions получают шестой stack argument: pointer на new.target Value.
Обычный rt.invoke передаёт rt.undefinedValue, внутренний rt.invokeSourceConstruct
передаёт callee Value после bound unwrapping. invokeConstruct по-прежнему отдельно
диспетчеризует native constructCode; native builtin ABI не изменён.
Source prologue копирует this и new.target в два последовательных rooted Values
после IR slots; root count=slotCount+2, argv scratch начинается после них.
Main entry передаёт undefined. Outgoing +40 в invoke переиспользует сохранённый
out pointer лишь после загрузки в RCX, когда старое значение больше не нужно.
Вложенные calls получают собственный new.target, без глобального mutable state.

## Explicit exception transfer

Source-frame handler records (272 bytes) сохраняют previous handler, RSP, catch
PC, gcRoots, pointer на rooted exception Value и cleanup snapshot. Полностью
сохраняются RBX/RBP/RSI/RDI/R12–R15 и все128 bits XMM6–XMM15. Handler area
располагается после argv scratch и не сканируется как Values. Catch destination
и живые catch locals входят в source roots через exceptional CFG liveness.

rt.throw копирует Value в catch frame, снимает runtime cleanup records до
snapshot, удаляет выбранный handler, восстанавливает roots/registers/RSP и
переходит в catch. В этой передаче нет callbacks или GC. Array.join регистрирует
cleanup record для stringifying guard; nested catch сохраняет внешний guard.
Return/break/continue снимают покидаемые handlers, catch captures получают
свежие cells. Это не OS exception handler; rt.fail остаётся fatal.
Ошибки языковых операций вызывают rt.throwTypeError/ReferenceError/RangeError.

## Finally completion routing

Try/finally использует внешний handler вокруг try/catch для pending throw.
Normal и exception paths исполняют отдельные IR copies finalizer; return и
break/continue также направляются через нужные finalizers при выходе из scope.
Lowering временно восстанавливает outer handler/finalizer stacks и snapshot
control targets, чтобы finalizer не видел циклы внутри своего try. Handler
снимается до выполнения finalizer, поэтому новый throw идёт наружу.

Pending return/throw Values остаются в отдельных IR slots, liveness удерживает
их через callbacks и GC. Новый abrupt completion из finalizer заменяет прежний;
обычное завершение восстанавливает его. Внутренний break в цикле finalizer не
теряет pending completion. Scope initialization каждой исполняемой копии
создаёт свежие captured lexical cells. Цена inline lowering — рост IR/code
при большом числе вложенных abrupt paths; общего completion dispatcher пока нет.

## Error objects and runtime failures

Error instances используют обычный O.size header с kind5 (Error tag), без
дополнительных managed полей. Семь prototypes — ordinary objects; NativeError
constructors наследуют Error, их prototypes наследуют Error.prototype.
Constructor(message) создаёт own writable/nonenumerable/configurable message
после ToString, undefined не создаёт свойства. Error.prototype.toString читает
и преобразует name прежде message, roots удерживают receiver и промежуточные
Values через getters/conversion callbacks. Static prototypes/functions/property
nodes явно включены в GC tracing, даже после удаления глобальных ссылок.

rt.throwTypeError/ReferenceError/RangeError конструируют intrinsic error со
статическим message, без JS callbacks и GC safepoints, и передают rt.throw.
Глобальная подмена конструктора не влияет на internal errors; own define
обходит inherited setters/readonly message. failIf принимает optional target,
по умолчанию сохраняет rt.fail для allocation/IO/internal invariant failures.
TDZ/missing mutable global/delete super — ReferenceError; const, callable,
receiver, descriptor, coercion и prototype checks — TypeError; invalid array
length/radix/argument limits — RangeError. Uncaught throw пока использует
общий fatal reporter, без stack trace. Runtime message: Invalid operation;
текст не претендует на совпадение с V8. V8 stack/captureStackTrace и ES2022
cause не входят в реализованный ES2020 Error surface.
