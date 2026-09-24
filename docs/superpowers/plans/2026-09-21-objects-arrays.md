# Objects and arrays implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Нативная основа объектов и массивов для дальнейшего полного runtime.
**Architecture:** Object Value tag с pointer на header (kind, property list, length, prototype, flags). Строковые ключи и data-property nodes; общие get/set/has/delete операции. Runtime пока использует существующую арену; GC и descriptors остаются следующими этапами, не исключаются из цели.
**Tech Stack:** TypeScript → собственный x64 → PE32+.
**Spec:** `docs/superpowers/specs/2026-09-20-language-expansion-design.md`.

## Global Constraints

Без eval/динамических Function, без готового движка и сторонних DLL. Никакого
исполнения исходника при сборке. Все результаты проверяются запуском EXE.

## Review Focus

- База и ключ присваивания вычисляются ровно один раз до RHS; compound получает старое значение раньше RHS.
- Hole отличается от undefined; delete не уменьшает length, запись индекса увеличивает.
- Array index только канонические строки 0..4294967294; 4294967295 — обычное свойство.
- length shrink удаляет элементы, grow не создаёт свойств; invalid length завершается runtime error до появления exceptions.
- Объекты сравниваются по идентичности; преобразование не должно превращать pointer в число.

## Task 1: Frontend и операции свойств

Files: frontend AST/parser/binder, IR model/lower, codegen, runtime objects, tests.
Interfaces: ObjectLiteral/ArrayLiteral/Member AST; Member как lvalue; IR newObject,
getProperty/setProperty/deleteProperty/hasProperty/setPrototype. Выражение ключа
вычисляется один раз; raw value сохраняется. Преобразование object-valued key
выполняется при чтении и записи отдельно, поэтому RHS может менять его результат.
Для computed property literal ключ преобразуется до значения свойства.

- [x] RED: `let o={x:2};let p=o;p.x+=3;console.log(o.x,p===o,typeof o);` → `5 true object`.
- [x] RED: `let a=[1,,3];console.log(a.length,1 in a);delete a[2];console.log(a.length);` → `3 false`, `3`.
- [x] Реализовать синтаксис literal/member и однократное вычисление lvalue.
- [x] Реализовать header, списки data-properties, lookup по prototype, canonical indices.
- [x] Реализовать array length и shrink; строковые length/индексы с read-only поведением.
- [x] Реализовать object identity, truthiness, typeof и базовые преобразования объектов/массивов.
- [x] GREEN: unit/native differential tests, затем полный `npm.cmd run check`.

## Task 2: Программы и отчёт

- [x] Добавить несколько файлов `examples/compat/`, печатающих примитивные итоги алгоритмов: коллекция записей, sparse arrays, битовые/control/lexical сценарии.
- [x] Скомпилировать каждый в EXE и запустить обычным Node без переопределения console; stdout и exit status сравнить побайтно.
- [x] Сохранить машиночитаемый отчёт в work и обновить журнал/матрицу с точными ограничениями.
- [x] Независимое ревью; исправить подтверждённые дефекты и повторить проверки.
