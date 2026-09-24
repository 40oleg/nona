# Precise garbage collection implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Освобождать недостижимые объекты, циклы, строки и рабочие буферы без
потери живых значений в глобалах, кадрах, аргументах и графе свойств.
**Architecture:** Точный немещающий mark/sweep. Сборка только на safepoints между
IR operations, вне внутренних runtime-вызовов. Цепочка кадров содержит диапазоны
tagged Value, liveness очищает мёртвые корни; globals и статические prototype
objects — отдельные корни. Аллокации имеют header с размером, mark и типом графа.
**Tech Stack:** TypeScript, собственный x64/PE, Windows HeapAlloc/HeapFree.
**Spec:** `docs/superpowers/specs/2026-09-20-language-expansion-design.md`.

## Global Constraints

- Собственный backend/runtime, без готового движка; не исполнять JS при сборке.
- Адреса живых объектов не меняются. Не собирать память внутри runtime helper,
  пока его временные raw pointers не зарегистрированы как корни.
- Runtime allocations сами только увеличивают счётчик; сборка откладывается до
  следующего compiler safepoint. Внутренние операции могут временно превысить порог.
- Никаких изменений полного объёма ES2020 или исключений eval/dynamic Function.
- Пользователь требует минимум 15% usage; рабочая остановка при 20% остатка.
  После завершения всей цели или этой остановки сохранить результаты и выключить ПК.

## Task 1: Проверенный анализ живых IR slots

Files: `src/ir/liveness.ts`, `tests/liveness.test.ts`.

- [x] RED: фиксированные проверки straight-line kills, branch unions, loop fixed
  point, call args/result, member/update references и return roots.
- [x] Вычислять live-in/live-out блоков до fixed point; затем live-before каждой
  операции и терминатора. Запись убивает прежний dest, чтения создают корни.
- [x] Обход всех вариантов Operation/Terminator исчерпывающий на уровне TypeScript.
- [x] GREEN: unit tests, build; обновить журнал. Анализ сам ещё не означает GC.

## Task 2: Heap metadata и collector

Files: `src/runtime/memory.ts`, новый `src/runtime/gc.ts`, runtime index,
object allocations, `tests/gc.test.ts`.

- [x] Проверить все rt.alloc call sites: наружу выдаётся payload base либо
  interior pointer? Зафиксировать поддерживаемые корни до реализации маркировки.

  Результат аудита: `numeric/format.ts` выдаёт descriptor по `payload + 2400`
  внутри 4096-byte allocation. Поэтому mark membership обязан находить **содержащий**
  блок по диапазону `[payload, payload + size)`, не только точное начало. Это остаётся
  точным GC: кандидаты приходят лишь из типизированных Value/pointer полей, не из
  произвольных чисел. `strings.ts`, string indexing, objects и property nodes
  возвращают base. `numeric/parse.ts` (включая num.ratio) и `io.ts` возвращают
  только primitive/void, их рабочие буферы не живут за пределами runtime operation.
  Внутренние pointers числовых алгоритмов пока защищены запретом сборки внутри runtime.
- [x] Header: next, payload size, kind (raw/object/property), mark/scan state.
  raw allocations не содержат traced edges; object/property посещают только
  определённые pointer/Value поля, не произвольные биты чисел.
- [x] Реализовать iterative marking без рекурсии по пользовательскому графу;
  проверять membership heap pointer без разыменования памяти перед static literals.
- [x] Sweep удаляет только немаркированные блоки и обновляет счётчик живых байтов.
- [x] Нативные тесты: недостижимые циклы освобождаются, живые shared graphs остаются,
  static roots сохраняют динамические свойства, строки и deleted properties корректны.

## Task 3: Compiler safepoints и root frames

Files: `src/backend/x64/codegen.ts`, liveness, native/PE tests.

- [x] Зарегистрировать globals и оба static prototypes; функции push/pop root frame.
- [x] Инициализировать все root slots до первой сборки, очищать dead slots по
  liveness перед safepoint. Вызовы сохраняют caller roots и аргументы до копирования.
- [x] Включить safepoint threshold и тестовый stress mode, не вводя пользовательский
  нестандартный builtin. Межоперационные данные должны переживать частые сборки.
- [x] Проверить память при длинных циклах, вложенных вызовах/рекурсии и выходах,
  dead temporary release, compiler stack probes и unwind metadata.
- [x] `npm.cmd run check`, `npm.cmd run compare`, независимое ревью, docs matrix/log.

## Следующие расширения

Функции/окружения добавят свои trace kinds; exceptions должны корректно снимать
root frames при unwind. Promise jobs и modules добавят runtime roots. WeakMap
потребует ephemeron pass. Эти зависимости остаются частью полной цели.
