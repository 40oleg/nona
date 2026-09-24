# Области видимости и разрешение имён — проект архитектуры

Дата: 2026-09-23. Статус: реализовано и проверено.

## 1. Цель и границы

Завершить второй пункт согласованного пути к JavaScript ES2020:

- динамическое разрешение глобальных имён;
- sloppy-присваивание необъявленному имени;
- `ReferenceError` при чтении отсутствующего имени;
- допустимое затенение встроенных имён;
- function declarations внутри блоков и их область видимости;
- совместные правила hoisting, TDZ, повторных объявлений и ранних ошибок.

Результат остаётся собственным AOT-компилятором и Windows x64 runtime. `eval` и
динамические конструкторы функций исключены. `with`, legacy octal и Annex B
var-подобные алиасы block functions относятся к следующему пункту и здесь не
реализуются. Параметры остаются простыми до отдельного этапа default/rest/
destructuring.

## 2. Выбранный подход

Сохранить статические binding descriptors и существующие stack slots/cells.
Binder выполняет отдельный проход сбора объявлений для каждой области, затем
разрешает ссылки. Runtime используется только там, где состояние действительно
динамическое: свойства глобального объекта.

Полные heap-объекты Environment Record сейчас не вводятся. Без `eval` и `with`
лексическая цепочка известна при компиляции; перенос всех локальных чтений в
runtime усложнил бы ABI, GC и generated code без изменения наблюдаемого результата.

Отклонён вариант локальных специальных исправлений в текущем binder: один
рекурсивный `visitVars` не способен надёжно выразить разные множества
VarDeclaredNames и LexicallyDeclaredNames. Отклонён и преждевременный полный
runtime environment: он нужен позднее только для `with`, а `eval` исключён.

## 3. Модель объявлений

Binder вводит явную запись области для script, function body, block, switch и
catch. Запись содержит родителя, владельца storage, объявления этой области и
ссылки на созданные bindings. Сбор объявлений завершается до обхода выражений.

Для каждой области вычисляются отдельно:

- прямые lexical declarations (`let`, `const`, block function);
- var-scoped declarations (`var` и функции script/function body), включая `var`
  во вложенных операторах, но исключая вложенные функции;
- имена параметров и именованного function expression;
- catch parameter;
- объявления единой lexical scope всех clauses одного `switch`.

Проверки ранних ошибок выполняются по этим множествам, а не как побочный эффект
первого встретившегося идентификатора. Это покрывает duplicate lexical names,
lexical/var conflicts, parameter/body lexical conflicts, catch conflicts и
повторные block functions. Разрешённые повторения `var` и function declarations
сохраняют стандартный порядок hoisting: последнее function declaration задаёт
начальное значение, `var` без initializer его не стирает.

Простой catch parameter конфликтует с прямым `let`/`const`/function того же
catch block, но совместим с `var` того же имени, как требует ES2020.

Lexical binding создаётся в TDZ при входе в область. `let` без initializer
инициализируется `undefined` в точке объявления; `const` требует initializer.
Block function инициализируется созданным function object до первого statement
блока. При повторном входе в блок создаются новые cells для захваченных bindings.

## 4. Function declarations внутри блоков

Parser принимает function declaration в `StatementList` блока и clauses
`switch`. Одиночная function declaration как тело `if`, цикла или label без
фигурных скобок остаётся ошибкой: это Annex B syntax, отложенный в пункт 3.

В script/function body function declaration остаётся var-scoped и hoisted как
сейчас. В block/switch declaration становится lexical binding этой области:

- доступна до текстовой позиции declaration;
- недоступна за пределами блока;
- конфликтует с `let`, `const` и другой function declaration того же имени;
- может затенять внешний `var`, parameter, function или builtin;
- вложенная функция захватывает именно binding текущего входа в блок.

Для sloppy source применяется обязательная core-семантика block lexical
declaration. Дополнительная web-совместимая var binding из Annex B здесь не
создаётся и будет добавлена отдельно, чтобы она не смешивалась с ядром.

## 5. Глобальное разрешение

Любой IdentifierReference, не найденный в статической lexical/function chain,
становится global-object reference с именем. Binder больше не отклоняет такое
имя только потому, что его нет среди заранее известных globals.

Операции имеют следующие правила:

- обычное чтение вызывает `HasProperty(globalObject, name)` и бросает
  `ReferenceError`, если свойства нет; затем выполняет обычный `Get`;
- `typeof` отсутствующего имени возвращает `undefined`, но найденное свойство
  читается обычным `Get`, включая inherited getter;
- strict assignment использует уже проверенную семантику сохранения исходной
  разрешимости LHS и повторную проверку перед записью;
- sloppy assignment с unresolvable reference выполняет `Set(globalObject,
  name, value, false)`, создавая собственное writable/enumerable/configurable
  свойство при обычном отсутствующем имени;
- delete через `globalThis.name` следует дескриптору свойства; `delete name`
  остаётся существующей операцией над reference согласно strict/sloppy rules;
- inherited свойства глобального объекта участвуют в `HasProperty`, а setter и
  readonly data property обрабатываются общими внутренними операциями объектов.

Script `var` и function declarations продолжают иметь алиасы-свойства
глобального объекта. Script lexical declarations не создают свойства.
Global declaration instantiation учитывает уже существующие own properties:
non-configurable property запрещает конфликтующую global lexical declaration;
`var` сохраняет существующее значение; function declaration может заменить
значение только когда дескриптор это допускает.

## 6. Встроенные глобальные имена и `console`

Запрет `checkBaseName` удаляется. Parameters, function locals и вложенные lexical
bindings могут затенять `undefined`, `NaN`, `Infinity`, `console`, `globalThis`,
конструкторы и Error family.

`undefined`, `NaN` и `Infinity` материализуются как обычные non-writable,
non-enumerable, non-configurable свойства глобального объекта. Поэтому global
`var undefined` сохраняет встроенное значение, global `let undefined` является
ранней ошибкой, а локальное `let undefined` допустимо.

`console` материализуется как минимальный объект с вызываемым методом `log`,
который использует существующий вывод runtime. Parser перестаёт сворачивать
`console.log` в специальный identifier; вызов идёт через обычные Member/Get/
Call правила. Это делает `console` доступным для нормального затенения, передачи
и замены, не добавляя другие Console API. Глобальное свойство `console` writable,
non-enumerable и configurable; свойство `log` также writable, non-enumerable и
configurable, а функция имеет `name === "log"` и `length === 0`.

Остальные уже материализованные конструкторы и `globalThis` разрешаются тем же
global-object путём. После материализации `undefined`, `NaN`, `Infinity` и
`console` тип compile-time binding `builtin` удаляется: все доступные программе
глобальные значения разрешаются через одну модель global-object reference.

## 7. Изменения компонентов

- `src/frontend/parser.ts`: block function grammar; обычный AST для
  `console.log`.
- `src/frontend/binder.ts` и `bound.ts`: declaration/scope records, двухфазный
  анализ, dynamic global references, разрешённое затенение.
- `src/ir/lower.ts` и `model.ts`: инициализация block functions при входе,
  различение resolvable/unresolvable sloppy assignment, обычный console call.
- `src/backend/x64/codegen.ts`: только необходимые новые IR операции; правила
  областей не дублируются в backend.
- `src/runtime/globals.ts` и новый `src/runtime/console.ts`:
  глобальные свойства, dynamic Set/Get/Has и callable `console.log`.
- GC roots и own-key enumeration включают новые intrinsic objects/properties.

## 8. Ошибки и порядок вычисления

Reference и declaration errors должны быть JavaScript исключениями либо ранними
CompileError в предписанной фазе. RHS, getters, setters и property-key coercion
не выполняются, если ошибка должна возникнуть раньше. Если ошибка PutValue должна
возникнуть после RHS, наблюдаемые эффекты RHS сохраняются.

Hoisting создаёт bindings до исполнения кода, но function object создаётся в
правильной области и с действующими GC roots. TDZ сохраняется через callbacks,
closures, `typeof`, loops, switch fallthrough и exception paths.

## 9. Проверка результата

До production-кода добавляются падающие тесты по четырём группам:

1. Dynamic globals: missing read/call/update, `typeof`, sloppy create,
   strict write, inherited properties, RHS mutation и descriptors.
2. Declarations: все пары конфликтов и допустимых повторов, parameter/catch/
   switch/loop interactions, hoisting order и TDZ.
3. Builtin shadowing: global/local lexical, var, parameter, function and catch;
   ordinary shadowed `console.log`; immutable global descriptors.
4. Block functions: pre-declaration call, outside visibility, nested blocks,
   switch, closures across repeated entry, strict/sloppy core behavior and GC.

Положительные случаи сравниваются с Node, кроме явно помеченной core sloppy
block-function семантики без Annex B. Для неё используются ожидаемые результаты
ES2020 и парные strict cases. Ошибочные программы проверяют фазу и тип ошибки.

Добавляется отдельный `examples/compat/scope-resolution.cjs`, собираемый в EXE и
сравниваемый с Node по stdout/stderr/status. После целевых тестов выполняются
полный `npm run check`, `npm run compare`, независимое review и обновление
`docs/language-support.md`, README, журнала и контрольной точки.

## 10. Критерии завершения

- все конструкции пункта 2 имеют положительные и отрицательные тесты;
- отсутствующее имя больше не является bind-time ошибкой там, где требуется
  runtime global resolution;
- встроенные имена затеняются только в разрешённых областях;
- block functions имеют core ES2020 lexical semantics без скрытого Annex B;
- существующие strict, arguments, closures, globals, descriptors и GC тесты не
  регрессируют;
- standalone EXE совпадает с Node в документированных общих случаях;
- матрица не заявляет Annex B, `with` или будущий параметрический синтаксис.

Полная цель ES2020 после этого этапа остаётся незавершённой.
