# Core language implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Реализация непосредственно в текущей задаче с проверкой каждого этапа.

**Goal:** Реализовать независимые от объектной модели базовые операторы и инструкции как первый этап расширения до ES2020.

**Architecture:** Существующий pipeline lexer → AST → binder → IR → x64 сохраняется. Операторы используют нативные runtime-функции, управление потоком — блоки IR; исходник не исполняется при компиляции.

**Tech Stack:** TypeScript, собственный x64 emitter, Windows PE32+, Node test runner.

**Spec:** `docs/history/superpowers/specs/2026-09-20-language-expansion-design.md`.

## Global Constraints

- EXE без Node.js, C-компилятора, LLVM и готового JS-интерпретатора.
- eval и динамические конструкторы функций исключены пользователем.
- Сохранять диагностику и существующие проверки ABI, PE и standalone.
- Каталог без Git: изменения выполняются на месте; коммиты/worktree не создаются.
- Этот план — один этап, не реализация всего запроса. Матрица сохраняет незавершённые возможности.

## Review Focus

1. ToInt32 для NaN, infinities, отрицательных дробей и чисел за границей int64.
2. Число сдвигов по модулю 32, signed right shift и unsigned результат >>>.
3. Запятая в выражении не должна поглощать разделители аргументов/деклараторов.
4. switch сравнивает строго, проверяет case до первого совпадения и сохраняет fallthrough.
5. continue через switch и цепочки меток должен выбирать цикл, а не switch; break на блок — выход из блока.

## Task 1: Операторы

**Files:** `src/frontend/lexer.ts`, `parser.ts`, `src/ir/lower.ts`, `src/backend/x64/codegen.ts`, новый `src/runtime/bitwise.ts`, `src/runtime/index.ts`, новый `tests/language-operators.test.ts`.

**Interfaces:** существующие Unary/Binary/Assignment AST и IR; `emitBitwise(b: RuntimeBuilder): void`; runtime `rt.toInt32` принимает Value pointer в RCX, возвращает sign-extended int32 в RAX; остальные runtime-функции имеют стандартные result/operand pointers.

- [x] Добавить и запустить падающие end-to-end проверки:

```js
console.log(~0, -1 >>> 0, 1 << 33, -8 >> 2);
console.log(4294967297 | 0, -4294967297 | 0, NaN | 0, Infinity | 0);
var a=1; console.log((a+=2,a*=3,a),void(a++),a);
```

Ожидания: `-1 4294967295 2 -2\n`, `1 -1 0 0\n`, `9 undefined 10\n`.

- [x] Добавить приоритеты &, ^, |, <<, >>, >>>; составные присваивания через `operator.slice(0,-1)`.
- [x] Разделить Expression (с запятой) и AssignmentExpression в parser; аргументы, initializers и ветви ?: используют AssignmentExpression.
- [x] Реализовать ToInt32 декодированием binary64: exponent, mantissa, truncation и младшие 32 бита; не использовать int64 conversion до range handling.
- [x] Нативные битовые операции возвращают Number. Сдвиги маскируют count на 31; >>> возвращает unsigned double.
- [x] void вычисляет аргумент и возвращает undefined; comma вычисляет оба операнда и возвращает правый.
- [x] Запустить `npm.cmd run check`; обновить журнал и матрицу.

## Task 2: Управление потоком

**Files:** `src/frontend/ast.ts`, `parser.ts`, `binder.ts`, `src/ir/lower.ts`, новый `tests/language-control.test.ts`.

**Interfaces:** DoWhile AST с body/test; Switch AST с discriminant/cases, test null для default; Labeled AST с label/body; Break/Continue с nullable label. Контекст lowering хранит метки, break-target и optional continue-target.

- [x] Добавить и запустить падающие тесты:

```js
var x=0; do { x++; if(x<3)continue; } while(x<3); console.log(x);
var s=''; switch(2){case 1:s+='a';break;default:s+='d';case 2:s+='b';case 3:s+='c';}console.log(s);
var n=0; outer:for(var i=0;i<3;i++){switch(i){case 1:continue outer;}n++;}console.log(n);
```

Ожидания: `3\n`, `bc\n`, `2\n`.

- [x] Parser: do/while с особым правилом необязательной финальной точки с запятой; switch с одним default; labels без перевода строки после break/continue.
- [x] Binder: var hoisting из всех веток, проверка меток, запрет continue на нецикл и break вне допустимого контекста.
- [x] Lowering: do сначала body, continue идёт к condition; switch сначала dispatch по strict equality, затем отдельные тела с fallthrough.
- [x] Добавить debugger как корректную no-op инструкцию при отсутствии отладчика.
- [x] Сохранить негативные тесты неизвестных/дублирующихся меток и повторного default; обновить старые тесты отказа ставших поддержанными конструкций.
- [x] Запустить `npm.cmd run check`; записать результаты и оставшийся объём.

## Task 3: Лексика ES2015

**Files:** `src/frontend/lexer.ts`, `parser.ts`, `token.ts`, новый `tests/language-lexical.test.ts`.

**Interfaces:** Token.value для decoded identifier; parser использует декодированное имя, но keyword matching требует неэкранированного spelling.

- [x] Проверить падение EXE-теста `var число=0b101+0o7; console.log(число,"\u{1F600}");` с ожиданием `12 😀\n`.
- [x] Поддержать Unicode ID_Start/ID_Continue, ZWNJ/ZWJ, surrogate pairs и identifier Unicode escapes.
- [x] Добавить 0b/0o literals и code point string escapes; отклонять пустые/невалидные цифры, запрещённые identifier escapes и значения >0x10ffff.
- [x] Сохранить source spans в UTF-16 offset; escaped reserved words не должны превращаться в допустимые имена.
- [x] Запустить полный набор и обновить документацию; провести независимое ревью изменений.
