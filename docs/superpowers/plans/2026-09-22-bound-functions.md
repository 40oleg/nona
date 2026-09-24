# Bound functions implementation plan

> **For agentic workers:** use superpowers:executing-plans; independent read-only review after native tests.

**Goal:** реализовать Function.prototype.bind, ordinary calls, new и instanceof
в существующем runtime, сохранив общую цель ES2020.

**Architecture:** FunctionLayout получает nullable bound-data pointer. Отдельный
managed блок хранит target, this и Value array аргументов; GC обходит его явно.
Bound invoke объединяет аргументы в rooted buffer. Constructor invoke отдельно
передаёт уже созданный instance, игнорируя bound this; newInstance/instanceof
проходят цепочку bound targets. Обычный ABI функций остаётся прежним.

**Tech Stack:** TypeScript, собственные x64 assembler/PE writer/runtime.

**Spec:** functions-closures plan и ECMAScript
[Function.prototype.bind](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-function.prototype.bind) /
[bound function exotic objects](https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-bound-function-exotic-objects).
Применяются текущие ограничения: нет descriptors/getters,
Symbol.hasInstance, Reflect/new.target и JS exceptions; они остаются в полной цели.

- [x] RED native tests: captured args/this, rebinding, metadata, custom prototype,
  construction/return/instanceof, call/apply, ошибки и stress GC.
- [x] Layout/GC: FunctionLayout.bound, BoundDataLayout, trace heap kind.
- [x] function-bind.ts: creation, metadata (own numeric length, string name),
  static builtin. function-bound-call.ts: rooted combined argv, normal/construct.
- [x] invoke/newInstance/instanceOf, IR invoke.construct и backend dispatch.
- [x] GREEN targeted tests, independent review, full check and Node comparison.
- [x] Update matrix, README, runtime memory and development log with evidence.

Resource bound для combined argv — 65 536, как у apply; превышение пока fatal.
Callbacks во время чтения metadata потребуют дополнительных временных корней
при реализации getters; текущие metadata helpers не вызывают JS.
