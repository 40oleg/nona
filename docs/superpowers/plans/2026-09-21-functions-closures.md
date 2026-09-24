# Functions and closures implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Функции как объекты, косвенные вызовы, lexical environments и замыкания,
затем this/new/arguments и стандартный протокол функциональных объектов.
**Architecture:** Object kind function хранит адрес собственного машинного кода
и далее environment pointer. Обычные объявления хранятся в mutable bindings;
вызов сохраняет callee до вычисления аргументов. Heap environments/cells разделяются
между замыканиями и прослеживаются GC. Runtime callbacks требуют runtime roots.
**Tech Stack:** TypeScript → собственный x64/PE, native object/GC runtime.
**Spec:** `docs/superpowers/specs/2026-09-20-language-expansion-design.md`.

## Constraints

Без eval/динамического Function и готового JS engine. Каждый вертикальный этап
проверяется EXE/Node. Не считать всю цель завершённой по функции-значению без
замыканий/this/new. Сохранять минимум 15% usage, остановка при ~20% остатка;
после всей цели либо этого порога сохранить результаты и выключить ПК.

## Task 1: Callable object и косвенные вызовы

Files: AST/parser/binder, IR/lower/liveness, x64 assembler/codegen,
runtime/functions, typeof, tests/functions-values.

- [x] RED: aliases, callbacks, returned functions, property calls, replacement,
  function hoisting/mutual recursion, callee-before-args, typeof, GC stress.
- [x] call-register x64 instruction с независимой проверкой bytes.
- [x] Function object kind и native code pointer; общий invoke проверяет callable.
- [x] Top-level declarations — mutable global bindings с hoisted initialization.
- [x] Call.callee — Expression; lower получает callee до args, IR invoke root uses.
- [x] Проверить native errors не-callable, полный check, review и docs.

## Task 2: Function expressions и lexical environments

### Runtime contract (первый проверяемый шаг)

Captured binding хранится в отдельной cell (один tagged Value). Внутренний tag
254 используется только для cell roots в compiler slots, никогда не выдаётся
пользовательской программе. Closure environment содержит count и выбранные cell
pointers; родительский кадр целиком не сохраняется. Function object содержит
environment pointer рядом с code pointer. GC трассирует function→environment→cell
и cell→Value, включая циклы. NewFunction принимает список cell roots; runtime
создаёт окружение без GC внутри helper. LoadCapture/readCell/writeCell — отдельный
IR с точным liveness. Перед подключением parser/binder проверить shared/independent
cells, transitively forwarded captures и сборку циклов через вручную заданный IR.
Это проверяет runtime ABI, не заявляет поддержку JS syntax closures.

### Binding/lowering integration (следующий шаг)

Каждый local/parameter binding получает owner function и признак captured;
global bindings остаются доступными напрямую. BoundFunction хранит parent и
упорядоченный список Binding captures. При разрешении outer local добавить его
во все промежуточные функции до owner: иначе создание глубоко вложенного closure
не сможет передать cell, даже если промежуточная функция не читает переменную.
Сохранять только необходимые cells, не целый кадр.

Lowering own captured local использует его прежний local slot для Cell Value;
read/write обращаются к payload через readCell/writeCell. Captured parameters/var
box в начале вызова; lexical cells создаются при входе в соответствующую область
с TDZ Value. Prologue loadCapture загружает outer cells в отдельные root slots.
Function declarations инициализируются до body; для self/mutual recursion ячейки
создаются раньше функциональных объектов. Function expressions создают новый
объект при каждом вычислении.

Для captured for/let header clone cells после initializer перед первым test и
после body перед update; continue ведёт через clone/update, break обходит их.
Captured block lexicals получают новые cells при каждом входе в block.
Named expression self-binding требует отдельного immutable self-name, не alias
внешнего mutable имени; sloppy assignment к этому имени игнорируется, в strict
позднее должна стать ошибкой. Не смешивать этот случай с const.

- [x] Добавить AST function expression/nested declaration и lexical binding graph.
- [x] Cells/environments в heap, capture-by-reference, GC trace kinds/rooting
  на уровне runtime/IR; source binding integration остаётся следующими пунктами.
- [x] Не захватывать всё окружение без необходимости: проверить освобождение
  недоступных closures, совместные и независимые captured bindings.
- [x] Hoisting, named expression self-binding, block scopes и per-iteration let.
- [x] Проверить counter factories, mutual closures, nested recursive calls и TDZ.

## Task 3: Function protocol и callbacks

- [x] Object receiver, parenthesized members и sloppy bare-call/global `this`;
  глобальные var/function properties alias существующих Value slots, lexicals
  остаются отдельными. `this.test.ts`, включая GC stress.
- [ ] this/arguments/new/instanceof, Function.prototype и name/length/prototype.
- [x] Ordinary new/instanceof, own function.prototype, prototype.constructor;
  аргументы до чтения prototype, возврат object вместо экземпляра, GC stress.
- [x] Own function.name/length, direct anonymous name inference, callable
  Function.prototype с name/length и nonconstructable flag. Методы ещё впереди.
- [x] Sloppy mapped arguments с simple parameters, включая duplicates, length/callee,
  parameter aliasing, shadowing, deletion disconnect и escaped GC roots.
- [ ] call/apply/bind, constructor return rules и object primitive hooks.
- [ ] Runtime temporary root scopes до reentrant JS; GC callbacks stress.
- [x] Function.prototype.call с raw builtin this, receiver boxing и runtime
  roots для target/argv во время reentrant invoke.
- [x] Function.prototype.apply: array-like snapshot, ToLength, nullish list,
  heap argv root range, вложенные вызовы и освобождение буфера.
- [x] Function.prototype.bind: bound data/GC, args/this, metadata и internal
  prototype, ordinary new/instanceof, nested bind и constructor return rules.
- [x] Function.prototype.toString: exact source text, native/bound representation,
  immutable static source descriptor и legacy implicit conversion integration.
- [ ] Стрелки и lexical this; receiver evaluation order и ошибки.
- [ ] Отдельные программы EXE/Node, документация, полный check и review.

Исключения/strict mode, полные дескрипторы, генераторы/async остаются последующими
связанными этапами полной цели. Их отсутствие фиксировать в матрице.

### ABI receiver (2026-09-22)

JS call сохраняет result/argc/argv/callee в RCX/RDX/R8/R9 и получает пятый
аргумент receiver Value* на стеке. У caller stack+32 принадлежит только этому
аргументу. Saved state сдвинут в +40/+48/+56/+64, root record в +80, Values в
+112. В конце Value range — отдельный this root, не очищаемый liveness; callee
копирует receiver до первой safepoint. rt.invoke нормализует nullish receiver
в static global Value. Primitive boxing/strict this остаются следующим шагом.
Global object — static GC root; таблица key/Value* связывает script var/functions
со свойствами, не копируя их значения. Эти свойства нельзя удалить; динамические
свойства обычные. Main получает global receiver от entry. GlobalThis, свойства
встроенных глобальных объектов/констант и динамические unbound names ещё впереди.

### Ordinary construction (2026-09-22)

Parser разделяет member/new и call precedence рекурсивным leftHandSide.
Lowering сначала вычисляет callee и arguments, затем prepare-instance читает
prototype, создаёт объект и использует Object.prototype при primitive prototype.
После обычного invoke отдельная IR operation выбирает object return либо instance.
Это сохраняет все значения через safepoints без runtime callback locals.
NewFunction создаёт собственный prototype и constructor back-reference.
В property payload добавлены attributes, чтобы prototype нельзя было удалить,
а constructor можно; public descriptors и полные builtin prototypes ещё впереди.
Ordinary instanceof проверяет callable RHS, primitive LHS, затем prototype и
цепочку; Symbol.hasInstance/bound functions добавятся со своими подсистемами.

### Mapped arguments (2026-09-22)

Binder лениво выделяет implicit local arguments только при разрешении имени;
parameter/function/body lexical с таким именем затеняет его, var переиспользует.
Формальные параметры тогда получают cells до newArguments и hoisted functions.
Metadata для runtime: formal count, callee header, array of Cell Values. Helper
создаёт объект kind Arguments с actual argc indices; supplied formal indices
содержат внутренний Cell Value, extras — JS Value. Public get разыменовывает
cell, write меняет её содержимое, delete удаляет property и разрывает mapping.
Параметры без actual arguments не получают mapped property. GC уже трассирует
CellTag через property Value. Strict, rest/defaults и iterator
добавляются со своими подсистемами.

Duplicate names (2026-09-22): physical input slot остаётся у каждой formal
позиции, body binding ссылается на последнюю. Metadata newArguments содержит
-1/undefined marker для ранних повторов; runtime копирует для них actual Value,
а не Cell. Выбор последнего formal происходит независимо от actual argc:
пропущенный последний duplicate не позволяет раннему индексу стать mapped.
Основание: [ES2020 CreateMappedArgumentsObject](https://262.ecma-international.org/11.0/#sec-createmappedargumentsobject).

### Call и primitive receivers (2026-09-22)

FunctionLayout.rawThis отделяет builtin receiver от sloppy source this. Invoke
сначала проверяет callable, затем ordinary function заменяет nullish на global
и упаковывает primitive в BoxKind=4 с tagged primitive Value. Native call получает
исходный this (target), регистрирует два runtime root ranges (target и incoming
argv), вызывает invoke с argv без первого thisArg, снимает ranges после return.
Box публикуется в callee this root до первой safepoint; helper invoke не требует
его после вложенного return. Function.prototype.call и metadata — static objects;
их mutable properties/nodes явно трассируются сборщиком.

Number/Boolean/String prototypes материализованы для member lookup и boxing.
Boxed String индексы/length readonly/nonconfigurable, доступны по наследованию;
lookup возвращает отдельные sentinels вместо raw property pointers. Базовое
преобразование wrapper распаковывает primitive. Стандартные методы prototypes и
пользовательские coercion hooks остаются следующими этапами.
