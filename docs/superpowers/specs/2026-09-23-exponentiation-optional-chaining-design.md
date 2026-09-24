# Степень и optional chaining — проект архитектуры

Дата: 2026-09-23. Статус: реализовано и независимо проверено.

## 1. Цель и границы

Реализовать пункт 4 согласованного пути к JavaScript ES2020:

- операторы `**` и `**=`;
- optional property access `obj?.x` и `obj?.[key]`;
- optional call `fn?.()` и `obj.method?.()`;
- смешанные цепочки с корректным коротким замыканием;
- `delete obj?.x` и `delete obj?.[key]`.

Результат остаётся собственным AOT-компилятором Windows x64 без Node, CRT,
LLVM или интерпретатора внутри EXE. BigInt появится отдельным этапом, поэтому
степень пока работает с текущим типом Number и существующим ToNumber.
Tagged templates, private fields и optional chaining с ними не входят в этот
этап, поскольку соответствующего базового синтаксиса ещё нет.

## 2. Выбранная модель

Optional chain представляется одним AST-узлом с базовым выражением и плоским
списком звеньев. Каждое звено является property access, computed property access
или call и содержит признак `optional`. Это сохраняет границу всей цепочки и
позволяет lowering создать один общий short-circuit exit.

Отклонён вариант независимых `optional` flags на вложенных `Member` и `Call`:
он затрудняет различение `obj?.x.y` и `(obj?.x).y`, а также перенос receiver через
optional call. Отклонено преобразование в conditional expressions: оно склонно
повторно вычислять base/key, терять receiver и неверно исполнять аргументы.

Степень добавляется как обычная binary IR operation после отдельного parser
уровня exponentiation. Числовое ядро реализуется внутри собственного runtime.
Windows CRT `pow` не импортируется.

## 3. AST optional chain

Добавляется модель, эквивалентная:

```ts
type OptionalLink =
  | {kind:'property';property:Expression;computed:boolean;optional:boolean}
  | {kind:'call';arguments:Expression[];optional:boolean};

interface OptionalChain extends Node {
  kind:'OptionalChain';
  base:Expression;
  links:OptionalLink[];
}
```

Parser помещает в один узел все последовательные member/call operations одной
цепочки, включая неoptional звенья после первого `?.`. Скобки завершают цепочку:
`a?.b.c` short-circuits до `undefined`, если `a` nullish, а `(a?.b).c` затем
выполняет обычный property access и бросает TypeError для `undefined`.

OptionalChain не является Assignable. Поэтому `a?.b=1`, `a?.b++` и аналогичные
формы являются ранними синтаксическими ошибками. Обычный member после скобок,
такой как `(a?.b).c=1`, остаётся допустимой целью.

`new a?.b()` и optional chain непосредственно в constructor position без скобок
отклоняются. `new (a?.b)()` использует результат законченной цепочки и остаётся
обычной конструкцией. `super?.x` отклоняется; уже допустимый `super.x?.()`
использует существующую super-reference и текущий receiver.

## 4. Семантика цепочки и reference

Lowering обходит links слева направо и хранит состояние как Value либо Reference.
Property link создаёт reference с base/key; call link читает callable value и,
если предыдущий reference был property/super reference, передаёт исходный receiver.
Bare `fn?.()` не получает property receiver.

Перед optional link проверяется именно значение, к которому применяется звено:

- `obj?.m()` проверяет `obj`, затем обычный call сохраняет receiver `obj`;
- `obj.m?.()` сначала читает `obj.m`, проверяет callee и вызывает с receiver `obj`;
- `fn?.(arg())` не вычисляет `arg()`, если `fn` nullish;
- `obj?.[key()]` не вычисляет `key()`, если `obj` nullish;
- `obj?.missing()` short-circuits только при nullish `obj`; найденный
  `undefined` method затем даёт TypeError обычного вызова.

Первый nullish optional operand записывает `undefined` в общий result slot и
переходит в конец всего OptionalChain. Неoptional ошибки и callbacks до этой
границы сохраняют обычный порядок. Вычисление base не пропускается, поэтому
`undeclared?.x` бросает ReferenceError.

Для `delete` nullish short-circuit возвращает `true`. Если цепочка дошла до
property reference, применяется существующий deleteProperty со strict/sloppy
правилами. Удаление результата call/value возвращает `true`, как обычный delete
не-reference expression.

## 5. Грамматика степени

Lexer распознаёт `**=` раньше `**`, а `**` раньше `*`. Parser вводит отдельный
right-associative уровень:

- `2 ** 3 ** 2` разбирается как `2 ** (3 ** 2)`;
- exponentiation связывается сильнее `*`, `/` и `%`;
- UnaryExpression не допускается слева без скобок: `-2 ** 2` является ранней
  ошибкой, `(-2) ** 2` допустимо;
- справа unary expression допустимо: `2 ** -2`;
- `**=` остаётся right-associative assignment.

Compound assignment использует существующий Reference pipeline. Base и key LHS
вычисляются один раз, старое значение читается до RHS, а PutValue выполняется
после вычисления RHS и степени. Это сохраняет setters, global resolution,
strict errors и эффекты coercion.

## 6. Number exponentiation runtime

В binary dispatch добавляется `** -> rt.pow`. `rt.pow` удерживает оба исходных
Value как GC roots, выполняет ToNumber слева направо после вычисления обоих
операндов и передаёт два binary64 значения в `rt.numberPow`.

`rt.numberPow` сначала реализует предписанные ES2020 special cases для NaN,
`±0`, `±Infinity`, отрицательной базы, целого/нецелого показателя и нечётности
целого показателя. Основной конечный путь использует автономную x87 log2/exp2
последовательность с округлением результата в binary64. Внешняя библиотека и
новая runtime DLL не добавляются. На закреплённом дифференциальном корпусе
отличие от Node не превышает 1 ULP.

Числовое ядро располагается в `src/runtime/numeric/power.ts` и экспортирует
функцию с XMM ABI, аналогично
существующему remainder. Константы хранятся как точные binary64 bit patterns.
Реализация не обещает совпадения последнего бита с каждой версией V8 там, где
ECMAScript допускает implementation-approximated result; special cases,
целочисленные результаты и выбранный дифференциальный корпус должны совпадать.

## 7. Изменения компонентов

- `src/frontend/lexer.ts`: токен `**=` и порядок longest-match.
- `src/frontend/ast.ts`: OptionalChain и links.
- `src/frontend/parser.ts`: exponentiation grammar, chain construction,
  grouping/new/assignment restrictions.
- `src/frontend/binder.ts`: рекурсивный анализ base, keys и arguments только как
  статический обход; runtime short-circuit остаётся lowering concern.
- `src/ir/lower.ts`: общий optional-chain CFG, reference/receiver preservation,
  delete path и binary `**`.
- `src/ir/model.ts`, `liveness.ts`, `src/backend/x64/codegen.ts`: используются
  существующие unary/binary/property/invoke operations; short-circuit и reference
  state выражаются текущими slots и CFG без нового вида IR operation.
- `src/runtime/primitives.ts`, `numeric.ts`, новый `numeric/power.ts`: ToNumber,
  special cases и автономное binary64 ядро.

## 8. Ошибки, порядок и GC

Optional short-circuit является control flow, поэтому обычный CFG liveness
удерживает base, receiver, key и ранее вычисленные значения на callback paths.
Keys и arguments не создаются до соответствующего link. Property getters и
ToPropertyKey вызываются только после nullish check.

Степень сохраняет существующий порядок: вычислить/GetValue left, затем right,
затем ToNumber left и ToNumber right. Если left coercion изменяет right object,
right ToNumber видит изменение. Исключения coercion проходят существующим native
unwind и не оставляют временные GC roots связанными.

Parser выдаёт CompileError для optional assignment/update, запрещённого `new`,
`super?.`, malformed `?.` и unary-left exponentiation. Runtime TypeError
возникает только после реально выполненного nonoptional access/call.

## 9. Проверка результата

До production-кода добавляются RED suites:

1. Exponentiation grammar: precedence, right associativity, unary restriction,
   assignment associativity и invalid targets.
2. Exponentiation runtime: primitive/object coercion order, setters, `**=`, NaN,
   infinities, signed zero, negative/fractional bases, underflow/overflow и
   representative seeded binary64 corpus within 1 ULP of Node.
3. Optional properties: dot/computed access, mixed chains, grouping, skipped
   keys, missing globals, getters and thrown errors.
4. Optional calls: bare/property/super receiver, skipped arguments, noncallable
   values, mutations and nested chains.
5. Delete and GC: nullish `true`, descriptor/strict behavior, callbacks that
   remove the last external references, stress collection and liveness joins.

Добавляется `examples/compat/modern-expressions.cjs` с общим для Node/Nona
поведением. После целевых тестов выполняются полный `npm run check`, сравнение
всех standalone programs, независимое review и обновление документации.

## 10. Критерии завершения

- весь заявленный синтаксис пункта 4 компилируется либо отклоняется в правильной
  фазе;
- optional chains сохраняют receiver, grouping и точный short-circuit effects;
- `delete` следует ES2020 semantics;
- `**`/`**=` имеют правильную грамматику, evaluation order и Number special cases;
- generated EXE не импортирует CRT/libm;
- targeted, full regression, GC stress и standalone comparison проходят;
- независимое review не оставляет Critical/Important замечаний;
- пункт 3 остаётся явно отложенным, а полная цель ES2020 не объявляется готовой.
