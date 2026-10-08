# Lexical bindings implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** let/const с блочными окружениями, TDZ и проверками записи для текущих нефункциональных значений.
**Architecture:** Binding получает признаки lexical/mutable; BoundProgram сохраняет bindings каждой lexical scope. IR явно сбрасывает binding в TDZ на входе в scope, проверяет чтение и запись. До реализации JS exceptions ошибки runtime используют существующий fatal-канал; это ограничение документируется.
**Tech Stack:** TypeScript, x64 emitter, Windows.
**Spec:** `docs/history/superpowers/specs/2026-09-20-language-expansion-design.md`.

## Global Constraints

Собственный AOT; без eval/динамических Function. Без новых зависимостей. Работа на месте без Git.
Отсутствие замыканий пока не позволяет проверять захват отдельных per-iteration environments.

## Review Focus

- TDZ при чтении, typeof, записи до объявления.
- RHS простого присваивания вычисляется до запрета записи; compound читает LHS раньше RHS.
- TDZ заново при каждом входе в блок цикла.
- Конфликты var/let в охватывающих scope и параметры функции.
- Общая lexical scope switch, невыполненные декларации в case остаются TDZ.

## Task 1: Binding и исполняемые проверки

**Files:** frontend AST/parser/binder/bound; IR model/lower; x64 codegen; `tests/lexical-bindings.test.ts`.
**Interfaces:** `Var.declarationKind: 'var'|'let'|'const'`; `Binding.lexical/mutable`; `BoundProgram.lexicalScopes: Map<Node,Binding[]>`; IR `uninitialized` и `checkInitialized` с slot, `immutableWrite`.

- [x] RED: native test `let x=1;{let x=2;const y=x+1;console.log(x,y);}console.log(x);` → `2 3\n1\n`.
- [x] RED: `let x=1;{console.log(x);let x=2;}` компилируется, но EXE завершается runtime error; `if(false){x=2;}const x=1;console.log(x);` → `1\n`.
- [x] RED: `for(let i=0;i<3;i++)console.log(i);` → `0\n1\n2\n`; `i` после цикла недоступен.
- [x] Собрать lexical declarations до разрешения имён, сохраняя var hoisting отдельно. Выделить уникальные слоты для shadowed bindings.
- [x] Явные операции TDZ в IR: начальный tag 255; checks до чтений и до выполненных записей; declaration initialization обходит readonly check.
- [x] Проверить switch scope, duplicate declarations, отсутствующие const initializers и недопустимые одиночные lexical statements.
- [x] GREEN: targeted tests, затем `npm.cmd run check`.
- [x] Документация: отметить отсутствие catchable exceptions и closures, не заявлять полную ES2015.
