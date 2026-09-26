# Журнал разработки Nona

## 2026-09-23 — C++-версия матричного калькулятора

- Добавлен `matrix-cpp/matrix-calculator.cpp` с теми же операциями и входными
  матрицами; инструкция сборки сохранена в `matrix-cpp/README.md`.
- Собран GCC 16.2.0 UCRT64 с `-std=c++17 -O2 -s -static -Wall -Wextra
  -Wpedantic -ffp-contract=off`. Предупреждений нет.
- C++ EXE и исходный JS запущены: оба завершились кодом 0, stderr пуст,
  stdout совпал после нормализации переводов строк Windows.
- Размер C++ EXE: 204 288 байт; существующего Nona EXE: 510 976 байт.
  Проверены импорты: только системные Windows KERNEL32/UCRT, без DLL MinGW.

## 2026-09-23 — пример матричного калькулятора

- Добавлен `examples/compat/matrix-calculator.cjs`: сложение, вычитание,
  умножение, транспонирование, определитель и обратная матрица.
- Добавлена инструкция `docs/matrix-calculator.md`: сборка в PowerShell,
  редактирование входных матриц и ограничения приближённых вычислений.
- `npm.cmd run build` и сборка примера через CLI завершились успешно.
- `node scripts/check-matrix-calculator.mjs`: пример и программа с проверочными
  утверждениями скомпилированы и запущены; у обеих stdout/stderr совпали с Node.js,
  все четыре запуска завершились кодом 0. Проверены численные результаты,
  прямоугольные и вырожденные матрицы, выбор ведущей строки, размеры 1×1/3×3,
  сохранность исходных данных и восемь ошибочных входов.
- Компилятор и runtime в рамках этого примера не изменялись; полный набор
  регрессионных тестов повторно не запускался. Возможности языка не расширены.

## 2026-09-20 — исходное состояние перед расширением языка

**Запрос:** вести документацию выполненной работы; реализовать пункты 1–3
предыдущего перечня. Пользователь уточнил: **«Разделы 1–3: весь язык до ES2020»**.
Объём не ограничивается объектами, замыканиями и управлением памятью.

### Выполнено

- Прочитаны существующие спецификация, README, frontend, модель IR, генератор x64,
  модель значений, управление памятью и тестовые помощники.
- Установлено: каталог не является Git-репозиторием; коммиты и Git-worktree
  сейчас недоступны без отдельной инициализации репозитория.
- Повторно выполнена исходная проверка `npm.cmd run check` на Windows.
- Созданы индекс документации, матрица текущей поддержки и этот журнал.
- Подготовлен проект архитектуры расширения с явно обозначенными вопросами.

### Результат проверки

Команда: `npm.cmd run check` (сборка TypeScript и полный запуск Node test runner).

Всего: **148**. Успешно: **147**. Ошибок: **0**. Пропущено: **1**.
Пропуск: `symlink aliases are rejected` — у учётной записи нет права создавать
символические ссылки. Проверки hard links выполняются и проходят.

Проверка включает запуск сгенерированных Windows EXE, сравнение с JavaScript,
структуру PE, ABI, Unicode, ошибки I/O и самостоятельный запуск без Node.js.
Это подтверждает существующий поднабор v0.1, а не поддержку запрошенного расширения.

### Что ещё не было выполнено на момент исходной проверки

- Новые возможности языка не реализованы.
- Проект новой архитектуры не согласован; детальный план реализации не утверждён.
- Test262 не подключён и не запускался.

### Следующая запись

После рассмотрения архитектуры зафиксировать принятое решение, план первого законченного
этапа, добавленные проверки, изменённые файлы и фактический результат EXE.

## 2026-09-20 — этап базовых операций, управления потоком и лексики

**Уточнение пользователя:** убрать динамические `eval` и `Function`.
Распространено на динамические конструкторы generator/async-функций; обычные
функции, функциональные объекты, `call/apply/bind` остаются в объёме.
Архитектурный документ обновлён; runtime-компилятор не добавляется.

**Ruling:** начать с независимых от heap базовых конструкций до объектного runtime —
они не требуют смены ABI и дают проверяемую исходную основу. Это перестановка
этапов, а не сокращение итогового объёма.

### Реализовано

- Побитовые операторы `& | ^ ~ << >> >>>` и составные присваивания.
- Нативное ToInt32 через декодирование binary64, с корректными младшими битами
  за пределами int64, обработкой NaN/infinities, truncation и signed/unsigned shifts.
- Операторы запятая и `void`, сохранение порядка побочных эффектов.
- `do/while`, `switch` со strict comparison, default и fallthrough.
- Метки, проверка их областей, break на блок, continue через switch и цепочки меток.
- `debugger` как no-op при отсутствии debugger host.
- Unicode-идентификаторы и escapes; 0b/0o; Unicode code point escapes в строках.
- Identity string escapes и разрешённые ES2019 символы U+2028/U+2029 в строках.
- U+180E больше не принимается как пробел в современном языке.

### Доказательства

1. `language-operators.test.ts`: сначала 9 падающих тестов из-за отсутствия
   синтаксиса, затем все 9 проходят с запуском EXE.
2. `language-control.test.ts`: сначала 12 позитивных сценариев падают;
   после реализации 22 теста проходят, включая 10 негативных.
3. `language-lexical.test.ts`: сначала 8 падений, после реализации все 23 проходят.
4. `npm.cmd run check`: **196 всего, 195 pass, 0 fail, 1 skip**.
   Причина пропуска symlink не изменилась. Лог: `work/core-language-check.log`.
5. Исправлена обнаруженная сборкой несовместимость `Array.findLast` с target
   ES2022 самого компилятора: поиск контекста заменён на reverse/find без смены target.

Удалены 6 прежних негативных примеров, которые теперь являются поддержанным
синтаксисом; добавлены 54 новых теста. Это объясняет изменение общего числа 148 → 196.

### Оставшийся объём

Этот этап **не реализует весь ES2020**. Объекты, массивы, свойства, GC, функции
как значения, замыкания, исключения, strict mode, стандартная библиотека,
классы, итераторы, генераторы, модули, Promise/async, BigInt и shared memory
ещё не реализованы. См. матрицу поддержки. Test262 не запускался.

## 2026-09-20 — let/const и nullish coalescing

### Реализовано

- Разделены function/global var hoisting и lexical scopes блоков, for и switch.
- Добавлены let/const, декларация без initializer для let, shadowing и early errors
  конфликтующих имён. Лексические объявления в одиночном теле if/while запрещены.
- TDZ сбрасывается при входе в scope; чтение, typeof и запись проверяют инициализацию.
- Запись в const проверяется во время исполнения, после RHS простого присваивания;
  недостижимое присваивание не становится ошибкой компиляции.
- `??` вычисляет RHS только при null/undefined; грамматика требует скобки при
  смешивании с &&/||. Поддержаны цепочки и сочетания с ?: и comma.

### Проверки и найденные проблемы

- `lexical-bindings.test.ts`: 17 позитивных/runtime сценариев сначала падали;
  после реализации все 29 тестов прошли.
- `nullish.test.ts`: 4 позитивных сценария сначала падали; после реализации
  все 8 тестов прошли, включая грамматические запреты.
- Первый полный запуск выявил устаревший CLI fixture: он считал `let y=2`
  синтаксической ошибкой. Заменён на однозначно невалидный `)`; сохранены проверки
  строки/столбца и защиты ранее записанного EXE.
- Итог `npm.cmd run check`: **232 теста, 231 pass, 0 fail, 1 skip**.
  Лог: `work/lexical-nullish-check.log`; symlink skip по прежней причине.
- Независимое ревью первого этапа не обнаружило существенных дефектов; дополнительно
  проверены сотни сравнений битовых операций с Node, границы exponent и вложенные
  switch/labels. Отдельное ревью lexical bindings также не выявило существенных
  дефектов: дополнительно проверены 9 scope/control сценариев, 7 TDZ/const сценариев
  и 108 сочетаний грамматики ??/&&/||. Две полезные проверки перенесены в постоянные
  тесты: global TDZ через функцию и outer binding в switch discriminant.

### Ограничения этапа

Runtime-ошибки TDZ и const пока завершают EXE с кодом 1 и сообщением
`Nona runtime error`; это не перехватываемые ReferenceError/TypeError.
Замыканий ещё нет, поэтому захват отдельных окружений for/let пока не реализован.
Остальные незавершённые подсистемы из предыдущей записи остаются в объёме запроса.

### Финальная проверка этих двух этапов после ревью

`npm.cmd run check`: **234 всего, 233 pass, 0 fail, 1 skip**.
Лог: `work/language-expansion-final-check.log`.
В первом этапе 54 новых теста и 6 снятых устаревших отказов; во втором —
31 lexical test, 8 nullish tests и снят один устаревший отказ для let.
Итого исходные 148 тестов превратились в 234. CLI protection test сохранён.
Новых зависимостей и импорта сторонних runtime/DLL не добавлено.

**Следующий незавершённый этап:** heap/root ABI, объектная модель и массивы,
после них функции-значения, замыкания и исключения. Полный запрос не закрыт.

## 2026-09-21 — ограничение расхода и начало объектов

Пользователь попросил сохранить минимум 15% usage. Проверка счётчика в начале
этапа: основной недельный лимит использован на 35%, осталось 65%.
Рабочий порог остановки — 20% оставшегося основного лимита, чтобы оставить запас
на запись результатов и остановку. Перед крупными этапами повторять проверку.
При достижении порога остановиться по этому условию пользователя; цель не считать
достигнутой. Изменять модель без запроса пользователя не требуется.

Дополнение пользователя: после завершения всей работы либо достижения порога
расхода сохранить изменения/результаты и выключить ПК. Это разрешение на выключение
по указанному условию; до его наступления продолжать работу. На повторной проверке
основной лимит использован на 36%, осталось 64%.

Объектные проверки добавлены: 16 end-to-end сценариев первоначально падают из-за
отсутствующего синтаксиса; лог `work/objects-red.log`. Предыдущий этап классифицирован
как прогресс: изменены исходники/документация и получены проверяемые результаты.

### Нативные объекты и массивы — проверенный промежуточный этап

- Добавлен object tag, header с kind/prototype/length и списком data-properties.
  Объекты и массивы создаются во время исполнения EXE; результаты не вычисляются
  компилятором. Память пока хранится в существующей арене.
- Реализованы literals, shorthand/computed properties, вложенные member expressions,
  запись, compound/update, `in`, `delete`, prototype literals/`__proto__`, identity,
  truthiness, string length/indices, sparse arrays и length shrink/grow.
- Добавлены внутренние преобразования объектов/массивов, включая циклы,
  generic join по свойству length, затенение и удаление встроенных методов.
  Сами стандартные методы ещё не являются доступными функциями-значениями.
- Первый полный прогон: 248 всего, 247 pass, 1 skip. Удалены три устаревших
  frontend rejection-теста для теперь поддерживаемых literals/member access.
- Регрессионный тест обнаружил ненормализованный boolean от object pointer;
  исправлен `!object`. Проверено удаление/повторное создание `__proto__`.
- Независимое ревью нашло раннее преобразование object-valued key: RHS может
  менять ключ между чтением и записью. Исправлены lowering и формулировка плана.
  Также исправлены prototype/shadow/delete при intrinsic toString/join.
  Каждый дефект воспроизведён тестом до исправления.
- `tests/objects.test.ts`: 36 сценариев, включая fatal errors для невалидного
  length, nullish bases, RHS `in`, циклов прототипа и отсутствия coercion method.
- Итог `npm.cmd run check`: **267 всего, 266 pass, 0 fail, 1 skip**;
  `work/objects-final-check.log`. Symlink skip по прежней причине; проверки
  PE, ABI, независимого EXE и защиты файлов сохранены.
- `npm.cmd run compare`: **3/3 PASS** для `control.js`, `records.js`, `sparse.js`.
  Каждый исходник отдельно запущен обычным Node.js и скомпилирован в EXE, затем
  EXE действительно запущен; stdout/stderr сравниваются побайтно, оба exit status 0.
  В отчёте `work/compat-report.json` сохранены вывод, версии Node/V8 и SHA-256
  исходников. EXE находятся в `build/compat/`. Console не переопределяется.

Полный запрос до ES2020 **не завершён**. Следующие зависимости: heap/root ABI и GC,
функции-значения/замыкания, полноценные свойства и встроенные методы, исключения.
После них оставшиеся синтаксис/библиотека/асинхронность/модули. Три демонстрационные
программы проверяют текущие возможности, а не весь будущий язык.
На проверке перед окончанием этого этапа usage оставался 36% использовано (64%
остатка). Условие выключения ПК пока не наступило; работа продолжается.

## 2026-09-21 — liveness и аудит основания GC

Предыдущий goal turn классифицирован как прогресс: реализованы и проверены
объекты/массивы, исправлены воспроизведённые дефекты, получен реальный отчёт Node/EXE.
Новая проверка usage: 37% использовано, 63% осталось; условие остановки не наступило.

Добавлен план `2026-09-21-garbage-collection.md` и backward liveness анализ
`src/ir/liveness.ts`: fixed point по CFG, live-in/out блоков, отдельные snapshots
перед operations/terminators; dest kill предшествует добавлению reads, включая
self-updates. Exhaustive switches заставят расширить анализ при новых IR variants.

Проверка: сначала build падал из-за отсутствующего модуля; после реализации
`npm.cmd run build` и `node --test dist/tests/liveness.test.js` прошли:
**7 pass, 0 fail**. Проверены overwrite, branches, loop back edges, call args,
property references, globals/checkInitialized и returns. Последний полный native
прогон остаётся 266 pass/1 skip из предыдущего этапа; новый анализ пока не подключён
к генератору и не меняет EXE. Поддержка GC по-прежнему не заявляется.

Аудированы все rt.alloc call sites. Найден существенный контракт:
`numeric/format.ts` выдаёт строковый descriptor внутри рабочего блока на смещении
2400; маркировка должна сохранять содержащий allocation. Остальные сохраняемые
objects/properties/strings используют payload base. Parse/ratio и UTF8 output
buffers временные, их можно освобождать на следующем safepoint после runtime call.
Следующий шаг: heap metadata и native collector, затем цепочка root frames и
очистка мёртвых slots по этому анализу; активная полная цель не изменена.

Независимое ревью liveness не обнаружило существенных дефектов. Ревьюер повторил
7 тестов и отдельно сопоставил 300 случайных CFG с независимой проверкой
достижимости чтения до перезаписи; результаты совпали. Это подтверждает анализ,
но не будущую интеграцию корней/GC.

## 2026-09-21 — нативный GC и root frames

Предыдущий turn — прогресс: добавлены проверенный liveness и аудит аллокаций.
На старте этого этапа осталось 62% usage; после реализации и исправлений — 61%.
Условие остановки/выключения ПК не наступило.

Реализован точный немещающий mark/sweep для текущих String/Object и property
nodes. Добавлены heap metadata, iterative grey-list traversal, typed roots из
globals/кадров/static prototypes, освобождение unrooted cycles и buffers.
Числовые descriptor pointers внутри allocations поддержаны. Порог сборки
адаптируется к живому heap; сборка выполняется только между IR operations.
Compiler и runtime ABI подробно описаны в `docs/runtime-memory.md`.

Первые 4 native acceptance tests сначала падали (collector symbols отсутствовали),
затем прошли. После подключения codegen проверки collection-before-every-operation
подтвердили рекурсию, caller/callee roots, shared objects, property references и
динамические строки. Нагрузочная проверка наблюдает настоящий gcCount и проверяет
нулевые gcRoots/liveBytes после выхода из функций и явной финальной сборки.

Независимое ревью обнаружило два дефекта, оба исправлены:

- Линейный heap membership делал marking квадратичным. Добавлен отсортированный
  heapsort индекс allocations и binary range search. Workspace выделяется вне
  managed heap и освобождается после сборки. Пример из 40 000 связанных объектов
  при повторном запуске: 29,8 с до исправления, 110 мс после (локальный замер,
  не общее обещание производительности). Тест большого графа добавлен постоянно.
- Top-level block lexical bindings ошибочно были вечными globals. Они перенесены
  в main frame slots; script-level bindings остаются globals. Новый тест для
  block/for/label break сначала воспроизвёл утечку, затем подтвердил освобождение.

Повторное ревью: новых существенных дефектов нет; все 11 GC-тестов прошли.
Ревьюер дополнительно проверил девять размеров индекса, последний байт allocations,
частичное освобождение, повторную сборку и освобождение workspace.

Итог `npm.cmd run check`: **285 всего, 284 pass, 0 fail, 1 skip**.
Лог `work/gc-final-check.log`; symlink skip по прежней причине. Native/PE/unwind,
numeric, lexical и остальные регрессии сохранены. GC не добавил новых DLL/imports.
Добавлена четвёртая отдельная программа `examples/compat/memory.js` с недостижимыми
циклами и сохранёнными строками. Контракт будущих callbacks/closures/exception roots
зафиксирован: нельзя включать reentrant JS из runtime без защиты его временных корней.

Полный ES2020 ещё не реализован. Следующий этап — функции-значения и окружения/
замыкания, затем this/new/arguments и полноценные методы/дескрипторы; остальные
пункты первоначальной цели остаются открытыми.

Финальный `npm.cmd run compare` после всех исправлений GC: **4/4 PASS**;
stdout/stderr и exit status совпали с обычным Node.js. Актуальный отчёт —
`work/compat-report.json`, EXE — `build/compat/`.

## 2026-09-21 — функции как значения и косвенные вызовы

Предыдущий turn — прогресс: GC подключён и проверен; архитектура полного языка
не сужалась. Новый план: `2026-09-21-functions-closures.md`, выполнен Task 1.

- Top-level function declarations создают callable objects до исполнения body
  и хранятся в mutable global bindings. Допустимы aliases, callbacks через
  параметры, возврат функций, функции в свойствах/массивах, переопределение имени,
  var redeclaration поверх функции, `typeof f === "function"`.
- Call.callee теперь Expression; IR invoke сохраняет callee до аргументов.
  Добавлены x64 call-register (проверены bytes для rax/r10), callable type check
  и ABI: out/argc/argv/callee. Поля свойств функционального объекта трассирует GC.
- Liveness учитывает callee/arguments. Проверка с GC перед каждой операцией
  сохраняет вызываемую функцию после обнуления её прежней глобальной ссылки.
- 12 acceptance tests сначала падали (`work/function-values-red.log`), затем
  прошли (`work/function-values-first.log`). Вызов не-callable пока fatal runtime
  error; полноценного TypeError/catch ещё нет.
- Убраны три устаревших frontend rejection cases для теперь допустимых операций.
  Metadata test учитывает функцию в global array. Нагрузочный GC teardown снимает
  новые законные global function roots; expired-block test сохраняет исходную
  проверку и не маскирует ошибки persistent roots.
- Полный `npm.cmd run check`: **295 всего, 294 pass, 0 fail, 1 skip**,
  `work/function-values-check.log`. Затем добавлен отдельный liveness regression
  для invoke, overwriting callee slot: build + все **8 liveness tests** прошли.
- Независимое ревью не обнаружило существенных дефектов. Дополнительно ревьюер
  проверил 10 native/Node случаев со stress GC: mutual recursion, шесть аргументов,
  callee replacement, обнуление последней global reference и вызовы через выражения.
- Добавлен `examples/compat/functions.js`. `npm.cmd run compare`: **5/5 PASS**,
  обычный Node/EXE совпали по stdout/stderr и exit status; отчёт обновлён.

Ограничения Task 1 явны: function expressions/nested declarations/closures пока
нет; Function.prototype/name/length/prototype, this/new/arguments, function source
stringification и runtime coercion hooks не завершены. Следующий шаг — Task 2:
lexical binding graph, heap environments/cells, capture-by-reference и GC trace.
После него Task 3 и оставшийся полный объём до ES2020.

Последняя проверка usage: **40% использовано, 60% осталось**. До порога 20% остатка
работа продолжается; разрешение на последующее выключение ПК сохранено.

## 2026-09-21 — runtime cells и окружения замыканий

Предыдущий turn — прогресс: callable objects/indirect calls проверены; полный
объём остаётся прежним. На старте этого этапа 41% usage использовано, 59% осталось.

Добавлены `environment-layout.ts`, `environments.ts`: cell хранит один tagged
Value, environment — count и выбранные cell pointers. В compiler root slots
ячейка представлена внутренним tag 254, недоступным JavaScript. FunctionLayout
расширен environment pointer; newFunction принимает capture vector. GC обходит
function→environment→cells→Value, в том числе циклы. Runtime allocation helpers
по-прежнему не входят в safepoints, их временные raw pointers защищены этим контрактом.

IR: newCell/readCell/writeCell/loadCapture и captures у newFunction. Liveness
учитывает все явные ссылки; codegen резервирует место под captures независимо
от числа обычных аргументов. Callee удерживается caller root frame, в том числе
когда loadCapture выполняется после вложенного вызова.

Проверки сначала не собирались из-за отсутствующих IR operations
(`work/environments-red.log`). После реализации добавлены **6 native IR tests**:
shared/independent cells, транзитивный escaping capture, closure-cell cycle,
семь captures и aliasing source/destination. GC запускается перед каждой operation;
после main принудительная сборка проверяет gcRoots=0 и liveBytes=0.
Это проверки runtime/IR — JavaScript parser/binder closures ещё не подключены.

Независимое ревью не нашло существенных дефектов. Дополнительная stress-проба
подтвердила отложенный loadCapture, interior string в cell и aliasing у newCell,
newFunction, invoke/readCell. Полный `npm.cmd run check`: **302 всего, 301 pass,
0 fail, 1 skip**, лог `work/environments-check.log`. Symlink skip по прежней причине.
`npm.cmd run compare`: **5/5 PASS**, stdout/stderr и exit status совпали с Node;
`work/compat-report.json` обновлён.

В плане сохранён конкретный следующий шаг: Binding owner/captured и транзитивные
списки captures, function expressions/nested declarations, boxing по областям
видимости, TDZ и per-iteration cells для for/let. Runtime-основание не закрывает
пользовательский запрос о замыканиях или полный ES2020. Цель остаётся активной.

## 2026-09-22 — source closures, capture analysis и for/let

Предыдущий turn — прогресс: runtime/IR cells и environments проверены. Этот этап
подключает их к пользовательскому JavaScript; выполнен Task 2 плана functions-closures.

- Parser принимает anonymous/named function expressions и nested declarations
  внутри function body. Вложенные block declarations/Annex B пока не поддержаны.
- Binder хранит owner/captured у bindings и selective capture lists у функций.
  Outer cells передаются через все промежуточные функции. Named-expression self
  name имеет отдельную immutable область; parameter/var может его затенить.
- Lowering создаёт cells для захваченных parameters/var и lexical bindings,
  сохраняет TDZ/const, hoisting и self/mutual recursion. Захваты читаются/пишутся
  по ссылке; function expressions создают новые объекты при каждом вычислении.
- Для for/let cells клонируются после initializer и перед update каждой итерации;
  continue проходит через clone/update, break — нет. Captured block bindings
  получают новые cells при каждом входе в блок. Var остаётся общей привязкой.
- Повторные function declarations теперь используют одну binding: последнее
  hoisted declaration побеждает. Старые отказные тесты для expressions/nested
  declarations заменены реальной положительной проверкой.

Первые **20 source acceptance tests** были RED (`work/closures-red.log`), затем
GREEN. Дополнительно проверены last declaration, shadowing named self и GC:
escaping closure не удерживает 3000 посторонних объектов, а 1000 недостижимых
recursive closures освобождаются. Native probes наблюдают liveBytes после GC;
эти проверки не подменены одним совпадением печатаемого значения.

Независимое ревью не выявило существенных дефектов. Дополнительно прошли 15
native/Node differential-проб со сборкой перед каждой IR operation: transitive
captures, hoisting, shadowing, nested recursion, condition/update captures,
несколько for-let bindings, labelled continue, switch scope и const captures.

Итог `npm.cmd run check`: **324 всего, 323 pass, 0 fail, 1 skip**;
`work/closures-final-check.log`. Symlink skip по прежней причине. Новый пример
`examples/compat/closures.js`; `npm.cmd run compare`: **6/6 PASS** (stdout/stderr
побайтно, exit status совпадает с обычным Node), `work/compat-report.json`.

Дальше — Task 3: this/new/arguments/instanceof, Function.prototype и стандартные
поля/методы функций, runtime callbacks с временными корнями; затем исключения,
strict mode и остальные подсистемы до ES2020. Полная цель не достигнута.
Последняя проверка usage: **43% использовано, 57% осталось**; до условной остановки
и выключения ПК ещё есть запас, работа продолжается.

## 2026-09-22 — object receiver, sloppy this и глобальный объект

Добавлен `this` в AST/binding/IR и пятый аргумент receiver в ABI. Member call
сохраняет исходный объект до вычисления ключа/аргументов; скобки сохраняют
reference, comma/conditional возвращают значение без receiver. Обычный sloppy
вызов получает глобальный объект. Каждый JS frame держит отдельный tagged this
root до return; stack+32 выделен outgoing argument и не пересекается с saved state.

Static global object трассируется GC. Script-level var/function properties
ссылаются на существующие global Values: чтения и записи через имя/свойство
согласованы, delete возвращает false. Lexical globals свойствами не становятся;
динамические свойства глобального объекта поддержаны. Global aliases учитываются
при наследовании и затенении внутренних coercion methods.

RED: 13 новых проверок сначала отклонялись на синтаксисе this. После реализации
прошли; добавлена постоянная проверка рекурсивного метода с пятью аргументами.
Первая полная проверка выявила только устаревший тест, требовавший отклонять
`this;`; он заменён проверкой недопустимого `this=1;`. Проверка liveness теперь
охватывает receiver. Независимый read-only review не нашёл существенных дефектов
и выполнил ещё 10 native/Node differential probes с GC перед каждой операцией.

Итог `npm.cmd run check`: **338 всего, 337 pass, 0 fail, 1 skip**;
`work/this-final-check.log`. Symlink skip по прежней причине. Новый пример
`examples/compat/receivers.js`; `npm.cmd run compare`: **7/7 PASS**, совпали
stdout/stderr побайтно и exit status; отчёт `work/compat-report.json`.

Границы этапа: нет primitive boxing/primitive prototypes, strict this,
globalThis и builtin global properties; dynamic unbound names ещё отклоняются.
Конструкторы, arguments, instanceof и Function.prototype — следующие части
Task 3. Полная цель ES2020 остаётся активной и не выполнена.

Пользователь подтвердил выключение ПК после всей работы либо при достижении
порога расхода. Сначала сохранять код и документацию; рабочий порог остановки —
20% остатка для сохранения запрошенных минимум 15%. Проверка usage после этапа:
**44% использовано, 56% осталось**. Условие выключения пока не наступило.

## 2026-09-22 — ordinary new, instanceof и prototype/constructor

Предыдущий goal turn дал проверяемый прогресс (this/receiver). Продолжен Task 3:
AST New, member/new/call precedence, lowering callee→arguments→prepare instance→
invoke→constructor result. Объект, возвращённый конструктором, заменяет instance;
primitive return игнорируется. Primitive function.prototype при new использует
Object.prototype, а при instanceof с object LHS вызывает runtime error.
Ordinary instanceof проверяет RHS callable и обходит внутреннюю prototype chain.

Каждая source function теперь имеет собственный prototype с constructor ссылкой.
Property payload расширен до 40 bytes с attributes: обычные data-properties=7,
function.prototype=1, prototype.constructor=5. Own writes/delete соблюдают
writable/configurable; полного descriptor API и inherited readonly protocol
пока нет. Function/prototype cycles доступны существующему GC через properties.

15 новых тестов дали RED, затем проверили constructor return rules, mutation
timing, вложенные new, primitive/noncallable errors и stress GC. Первоначальная
проверка удаления constructor выявила отложенный builtin Object.prototype.constructor:
в Nona его ещё нет. Для проверки именно собственного свойства prototype chain
в тесте обнулена; пробел builtin явно оставлен в матрице. Это не заявка на полную
поддержку стандартных prototype objects.

Независимый review не нашёл существенных дефектов в границах этапа; дополнительно
прошли 12 differential probes с GC на каждой IR operation. Полный check:
**354 всего, 353 pass, 0 fail, 1 skip** (`work/constructors-check.log`). Новый
пример `examples/compat/constructors.js`; compare **8/8 PASS**, stdout/stderr
побайтно и exit status совпали с Node (`work/compat-report.json`).

Следом нужны name/length, Function.prototype/call/apply/bind, arguments,
primitive boxing, runtime callback roots; полный ES2020 всё ещё не реализован.
Usage: **45% использовано, 55% осталось**. Цель активна; условие остановки с
запасом и выключения ПК пока не наступило.

## 2026-09-22 — function metadata и callable Function.prototype

Предыдущий turn дал прогресс: ordinary constructors. Добавлены собственные
name/length функций: явное имя, прямой anonymous initializer/identifier assignment
и значения свойств литерала, включая computed/numeric keys. Inference не проходит
через comma/conditional/return и member assignment; __proto__ setter literal не
задаёт имя. Inferred name не создаёт named-expression lexical binding.

IR newFunction хранит name/nameSlot и parameterCount; liveness удерживает dynamic
name. Backend сохраняет descriptor до записи result, затем ставит metadata без
промежуточной GC. name/length readonly, nonenumerable и configurable. Assignment
учитывает inherited nonwritable data-properties; literal define создаёт own property.

RED выявил также наследование после удаления name/length, поэтому реализован
общий callable Function.prototype: возвращает undefined, name='', length=0,
не имеет собственного prototype и не допускает new даже после записи .prototype.
FunctionLayout дополнен constructable flag; static prototype и оба static property
nodes включены в GC roots. Методы call/apply/bind и builtin Function constructor
ещё не реализованы; динамический Function по запросу пользователя исключён.

Полный `npm.cmd run check`: **367 всего, 366 pass, 0 fail, 1 skip**
(`work/function-metadata-check.log`). После него добавлен отдельный stress GC
тест удержания dynamic properties через static Function.prototype; расширенный
набор metadata **14/14 PASS** (`work/function-metadata-final-targeted.log`).
Независимый review не нашёл дефектов; ещё 11 differential probes с GC на каждой
операции совпали с Node. Новый пример `examples/compat/function-metadata.js`;
compare **9/9 PASS** (`work/compat-report.json`).

Следующий этап: call/apply/bind и primitive receiver boxing, arguments,
runtime callback roots. Полная цель ES2020 остаётся активной. Usage:
**46% использовано, 54% осталось**; условие выключения ПК ещё не наступило.

## 2026-09-22 — sloppy mapped arguments

Предыдущий turn дал прогресс: metadata и callable Function.prototype. Реализован
implicit arguments binding с lazy materialization; ordinary nested functions
получают собственные arguments, parameter/function/body lexical shadows учтены,
var arguments сохраняет implicit binding. Объявление с именем arguments больше
не запрещено само по себе. Неиспользующие arguments функции не выделяют объект.

Supplied simple formal parameters разделяют cells с indexed arguments properties.
Missing formal indices не создаются, extra arguments копируются как обычные
Values. Запись через параметр/индекс согласована; delete разрывает связь,
повторное создание индекса её не восстанавливает. Length — обычное свойство,
callee указывает на исходную функцию. Arguments object имеет kind=3 и строковый
tag [object Arguments]. Escape через return/closure сохраняет cells с GC.

IR newArguments получает metadata (formal count, callee header, Cell Values)
в stack scratch. Helper не вызывает JS или GC. Public property get/write
обрабатывают внутренний CellTag; новый property Value инициализируется до
проверки тега, поскольку HeapAlloc не обнуляет payload.

17 новых проверок сначала дали RED, затем PASS. Удалён устаревший reject-test
для return arguments. Независимый review не нашёл дефектов; дополнительно
прошли 12 native/Node probes с GC на каждой операции, включая argument cycles,
inherited index writes, hoisted parameter/function collision и много аргументов.
Полный check: **384 всего, 383 pass, 0 fail, 1 skip** (`work/arguments-check.log`).

Compare runner теперь принимает .js/.cjs; новый `examples/compat/arguments.cjs`
проверяет mapped writes с обычным Node в sloppy functions (в .js текущий Node
использует ESM strict semantics). Nona по-прежнему компилирует один script,
CommonJS API не добавлены. Compare **10/10 PASS**: stdout/stderr побайтно и status
совпадают (`work/compat-report.json`).

Границы: duplicate parameters, strict/unmapped arguments, defaults/rest и
Symbol.iterator ещё не реализованы. Впереди call/apply/bind, primitive boxing,
runtime callback roots и остальные этапы полной цели ES2020. Usage при старте
этапа: **47% использовано, 53% осталось**. Выключение ПК пока не требуется.

## 2026-09-22 — duplicate simple parameters

Предыдущий turn дал прогресс: mapped arguments. Снят запрет повторяющихся имён
простых параметров в sloppy functions. Каждый formal сохраняет свой physical
input slot, но body/var/hoisted function/closures разрешают последнее вхождение.
Function.length по-прежнему считает все formal positions. Для mapped arguments
только последнее имя получает Cell metadata; ранние duplicates имеют -1 marker
в IR и undefined marker в runtime metadata, поэтому копируют независимый actual
Value. Последний formal без actual аргумента всё равно запрещает ранний mapping.

Правило сверено с [ES2020 CreateMappedArgumentsObject](https://262.ecma-international.org/11.0/#sec-createmappedargumentsobject)
и Node. Девять новых тестов прошли RED→GREEN; reject-test заменён strict-function
случаем, который пока отклоняется вместе со strict mode. Review не нашёл дефектов:
дополнительно прошли 56 сочетаний formal duplicates/actual counts с GC stress и
четыре hoisting/shadowing пробы. Source files ревьюером не изменялись.

Полный check: **393 всего, 392 pass, 0 fail, 1 skip**
(`work/duplicate-parameters-check.log`). Запуск оставался активен; долгие первые
запуски EXE завершились, повторный suite не запускался. Обновлён standalone
`arguments.cjs`, compare **10/10 PASS** (`work/compat-report.json`).

Остались strict/unmapped arguments, default/rest/destructuring, методы функций,
boxing/callback roots и остальные части полной цели. Usage: **49% использовано,
51% осталось**; цель активна, условие выключения ещё не наступило.

## 2026-09-22 — Function.prototype.call, boxing и runtime roots

Предыдущий turn дал прогресс: duplicate parameters. Добавлен static callable
Function.prototype.call (name=call, length=1, nonconstructable). FunctionLayout
расширен rawThis flag: builtin получает исходный receiver; target ordinary JS
нормализует nullish в global и упаковывает Boolean/Number/String. Native call
регистрирует target/argv ranges перед reentrant invoke и снимает после return.

BoxKind=4 содержит tagged primitive; GC трассирует String payload. Материализованы
static Boolean/Number/String prototypes для primitive property lookup. Boxed
String own и inherited indices/length доступны, readonly/nonconfigurable.
Lookup sentinels 4/5 отделены от property pointers. Базовый wrapper ToPrimitive
распаковывает значение; builtin constructors, стандартные методы и пользовательские
coercion hooks ещё не реализованы.

18 основных проверок call/boxing, включая call.call и stress GC, прошли.
Review обнаружил два дефекта: объектная ветка ToString возвращала unboxed
Number/Boolean как будто String (boxed property key приводил к access violation);
detached static call property удерживал бывший heap value после delete.
Оба воспроизведены отдельными RED tests и исправлены: ToString после ToPrimitive
повторно преобразует primitive; delete после unlink обнуляет edges node.
Повторный review подтвердил все 20 function-call тестов и ещё три stress-пробы.

Итоговый полный check: **413 всего, 412 pass, 0 fail, 1 skip**
(`work/function-call-final-check.log`). Новый пример `function-call.cjs` включает
boxing, inherited string properties и boxed keys/arrays; compare **11/11 PASS**,
stdout/stderr побайтно и status совпали (`work/compat-report.json`).

Следом apply/bind, полные runtime callbacks/coercion, strict/exceptions и другие
части ES2020. Полная цель остаётся активной. Usage после этапа:
**51% использовано, 49% осталось**; до условной остановки/выключения есть запас.

## 2026-09-22 — Function.prototype.apply и managed argv

Добавлен static nonconstructable apply (name=apply, length=2). Проверяет callable
receiver до обработки списка, принимает nullish list как пустой, читает length
и индексы обычного array-like, включая inherited properties, arguments и boxed
String. Holes превращаются в явно переданные undefined. Значения копируются до
начала тела target. Положительная дробная length округляется вниз, отрицательная
и NaN дают ноль. Ресурсный предел — 65 536 аргументов; превышение/Infinity пока
дают fatal runtime error, не RangeError: JS exceptions ещё не реализованы.

Общий builder static builtin functions вынесен в function-builtin.ts; call
сохранил прежнее поведение. Apply регистрирует target, incoming argv и copied
heap argv ranges. GC markRange удерживает также allocation самого массива
Values. После return root chain восстанавливается, буфер освобождает следующий
GC. Временные key/length пока leaf-only; будущие getters/coercion hooks требуют
дополнительных корней, что отмечено в runtime-memory.md.

Исходные 15 тестов прошли RED→GREEN; добавлены ограничения, вложенные вызовы,
временные targets и проверка нулевых liveBytes/gcRoots после выхода. Всего
19 apply tests. Полный check: **432 всего, 431 pass, 0 fail, 1 skip**
(`work/function-apply-check.log`). Compare **12/12 PASS**, включая новый
`examples/compat/function-apply.cjs`: stdout/stderr и exit status совпали
с обычным Node (`work/compat-report.json`). Отдельная native-проба на length
65536.9 подтвердила arguments.length=65536 и последний аргумент=42.

Независимый read-only review не нашёл существенных дефектов; шесть дополнительных
gcStress-проб совпали с Node: вложенные apply/call, duplicates, boxed length,
граничная длина, удаление static apply при сохранённой ссылке и рекурсивная
передача объектов. Source files ревьюером не менялись.

Полная цель активна: далее bind и оставшиеся части ES2020 согласно матрице.
Usage после этапа: **53% использовано, 47% осталось**. Пользователь подтвердил
выключение ПК после всей задачи либо при расходе до порога остановки; рабочий
порог — 20% остатка, чтобы сохранить минимум 15%. Сейчас условие не наступило.

## 2026-09-22 — Function.prototype.bind, bound calls и construction

Предыдущий turn дал подтверждённый прогресс: apply. Реализован bind в границах
текущей объектной модели. Bound function хранит target/this/args в отдельном
typed heap block; копирует internal prototype и constructable flag target,
не получает own prototype. Name имеет префикс bound, length вычисляется из own
числового length с учётом связанного argc; NaN/negative/fractional/Infinity и
большие значения проверены. Native bind — nonconstructable, rawThis builtin.

FunctionLayout.bound добавлен в offset 72 (payload теперь 80 bytes).
GC трассирует boundData Values и циклы. Bound invoke создаёт rooted combined
argv, дописывая incoming args после bound args. Повторный bind сохраняет receiver
самой ранней связи. IR invoke.construct направляет new в отдельный dispatch:
он сохраняет подготовленный instance вместо bound this. NewInstance/instanceOf
разворачивают цепочку bound targets; prototype читается у ultimate target после
вычисления аргументов. Return override остаётся обычным constructorResult.

22 исходных теста: 18 RED failures до реализации (4 error cases уже давали
fatal), затем 22/22 GREEN. Metadata tests усилены: custom prototype позволяет
действительно переопределить deleted length/name, не упираясь в inherited
readonly Function.prototype properties. Добавлены numerical boundaries,
evaluation order, combined argv limit и zero liveBytes/gcRoots после циклов,
обычных вызовов и construction: теперь **26 bind tests**.

Независимый read-only review не нашёл дефектов. Семь дополнительных gcStress
native-проб совпали с Node: nested bind/call/apply, null prototype, крайние
length, сохранённые closures и constructor return function. Source files
ревьюером не менялись.

Полный check: **458 всего, 457 pass, 0 fail, 1 skip**
(`work/function-bind-check.log`). Compare **13/13 PASS**, включая новый
`examples/compat/function-bind.cjs`; stdout/stderr побайтно и exit status
совпали с обычным Node (`work/compat-report.json`).

Лимит bound combined argv — 65 536, превышение пока fatal. Getter/coercion
callbacks, Symbol.hasInstance, Reflect/new.target, Function.prototype.toString,
strict/exceptions и остальные части ES2020 ещё не завершены. Полная цель
остаётся активной. Usage: **54% использовано, 46% осталось**; условие остановки
и выключения ещё не наступило.

## 2026-09-22 — Function.prototype.toString и точный source text

Предыдущий turn дал прогресс: bind. Реализован Function.prototype.toString
для текущих ordinary source functions, native builtins и bound functions.
Lexer сохраняет source как nonenumerable immutable metadata TokenStream,
Parser передаёт его Program; lowering берёт substring FunctionNode.span.
Compiler pipeline сохраняет comments/whitespace/CRLF/Unicode/identifier escapes,
исключая внешние скобки expression. Native/bound representations соответствуют
выбранному Node format и не зависят от изменяемого свойства name.

FunctionLayout.sourceText занимает offset 80; полный payload теперь 88 bytes.
Все creation paths инициализируют pointer на immutable PE string descriptor.
Manual IR без sourceText получает native fallback. Managed GC tracing этому
полю не нужен: dynamic source strings не создаются. Static toString function
и property nodes включены в корни. Legacy coercion resolver узнаёт identity
этого builtin, поэтому строковые ключи, concatenation и array conversion
используют function source. После delete метода Object fallback возвращает
[object Function]. Общие пользовательские hooks по-прежнему впереди.

16 native tests: до реализации 12 RED failures и 4 ожидаемых fatal cases;
после **16/16 GREEN**. Независимый review не нашёл существенных дефектов;
пять дополнительных gcStress-проб совпали с Node (Unicode/comments, nested
functions, prototype changes/deletion, property keys и arrays).

Полный check: **474 всего, 473 pass, 0 fail, 1 skip**
(`work/function-source-check.log`). Запуск завершился за 164 секунды; длительные
первые старты отдельных EXE не приводили к повторному запуску suite. Новый
`examples/compat/function-source.cjs`; compare **14/14 PASS**: stdout/stderr
и exit status совпали с обычным Node (`work/compat-report.json`).

Полная ES2020 цель остаётся активной. Следуют общий протокол coercion callbacks,
дескрипторы/библиотека, strict/exceptions и прочие строки матрицы без поддержки.
Usage: **55% использовано, 45% осталось**. Условие остановки/выключения пока
не наступило; рабочий порог остатка — 20%, резерв пользователя минимум 15%.

## 2026-09-22 — Materialized Object/Array methods

Предыдущий turn дал прогресс: Function.prototype.toString. Начат следующий
план object-methods: Object.prototype.toString/valueOf и Array.prototype.toString/
join стали настоящими nonconstructable native functions с metadata/source,
writable/configurable method properties и общим Function.prototype. Общий builder
поддерживает owner и отдельные key literals без коллизий одинаковых имён методов.
Virtual intrinsic flags удалены: Get/in/delete/замена используют реальные nodes.

Object.toString поддерживает существующие tags, включая null/undefined,
примитивы/boxes, arrays, functions и arguments; Symbol.toStringTag ещё нет.
Object.valueOf делает ToObject с nullish error и свежим primitive box.
Array.join принимает generic receiver, separator, inherited entries/holes,
ToLength и циклы. Array.toString читает join и вызывает любой callable с
receiver, сохраняя method/receiver в runtime root scope; noncallable join
даёт Object tag. Возвращаемое callback значение не преобразуется принудительно.

Native targeted tests выявили проблему test oracle: удаление Array.prototype.join
ломало console shim самого Node. Тест теперь сохраняет результат удаления и
восстанавливает join до вывода. Дополнительная RED-проба a.join(a) обнаружила
реальный порядок conversion: cycle guard включался раньше separator ToString,
выдавая 12 вместо Node 11,22. Guard перенесён после conversion; regression прошёл.

**19/19 targeted GREEN**. Независимый read-only review не нашёл дефектов в границах
этапа; шесть дополнительных gcStress native-проб совпали с Node: self-separator,
циклы, arguments/string receivers, boxed receiver/custom join, вложенные callbacks,
удаление методов и Object tags. Файлы ревьюером не изменялись.

Полный check: **493 всего, 492 pass, 0 fail, 1 skip**
(`work/object-methods-check.log`). Compare **15/15 PASS**, новый
`examples/compat/object-methods.cjs`; stdout/stderr/exit status совпали с Node
(`work/compat-report.json`). README, matrix и runtime-memory обновлены.

Остались методы Boolean/Number/String (включая radix formatting), общий
OrdinaryToPrimitive с callbacks и точными временными корнями, descriptors,
strict/exceptions и остальные части ES2020. Implicit conversion пока распознаёт
только builtin identities; explicit Array.toString callback уже поддержан.
Полная цель активна. Usage **56% использовано, 44% осталось**; выключение ещё
не требуется, рабочий порог остатка — 20%.

## 2026-09-22 — Primitive wrapper methods и radix formatting

Предыдущий turn дал прогресс: Object/Array methods. Добавлены valueOf/toString
Boolean/Number/String prototypes. Native methods проверяют primitive tag либо
BoxKind с соответствующим payload; prototype lookalikes не проходят brand check.
ValueOf сохраняет signed zero и primitive identity. Metadata/source и static GC
roots подключены через общий builtin builder.

Number.toString проверяет receiver до radix, использует 10 для missing/undefined,
преобразует radix в число и целое, принимает 2–36. Invalid radix пока fatal,
а не RangeError (JS exceptions ещё нет). Форматтер покрывает fractions, большие
числа, subnormal, signed zero, NaN/Infinity. Недесятичная стратегия digit generation,
precision padding и rounding адаптирована из V8 DoubleToRadixStringView в наш x64
emitter. Системные зависимости EXE не менялись: CRT/V8 engine не используются.
BSD-3-Clause attribution сохранён в THIRD_PARTY_NOTICES.md, связанном из README.

Native formatter использует UTF-16 managed buffer с проверками границ каждого
записываемого символа; результат — interior descriptor, поддержанный текущим GC.
Decimal radix делегирует существующему точному formatter. Внутренние helpers
остаются leaf-only до общего этапа пользовательских coercion callbacks.

20 первоначальных tests: **19 RED failures до реализации**, затем **20/20 GREEN**.
Добавлен seeded differential test конечных binary64 во всех radix 2–36.
Review не нашёл дефектов: **3605** независимых boundary conversions совпали с
Node, плюс три gcStress-пробы wrappers/строк/null prototype. Source files
ревьюером не менялись.

Полный check: **514 всего, 513 pass, 0 fail, 1 skip**
(`work/wrapper-methods-check.log`). Compare **16/16 PASS**, включая новый
`examples/compat/wrapper-methods.cjs`: stdout/stderr побайтно и exit status
совпали с Node (`work/compat-report.json`). Матрица и документация актуализированы.

Следующий этап плана — общий OrdinaryToPrimitive, точные runtime temporary
roots перед callbacks, затем дальнейшие части полной ES2020 цели. Global
constructors, descriptors/getters, strict/exceptions и прочие API ещё отсутствуют.
Цель активна. Usage **58% использовано, 42% осталось**; до порога остановки 20%
ещё есть запас, условие выключения не наступило.

## 2026-09-22 — Runtime root scopes перед coercion callbacks

Добавлен rootedFn: снимки входных Values вместе с удержанием контейнеров,
initialized local ranges, managed argv ranges, raw managed pointers и output
containers без чтения незаписанного результата. Сохраняет исходные local offsets,
выравнивание стека, RAX/XMM0 и возвращает увеличенный frame size для stack args.
Подключён к primitives (conversions/arithmetic/comparison), bitwise и log.

Четыре native tests проверяют реальные сборки и liveBytes: снимок после
перезаписи входа, контейнер результата без удержания старого значения,
вложенные scopes, temporaries, освобождение после возврата, return registers
и пятый stack argument. Независимое read-only review дефектов не выявило.

Полный check: **518 всего, 517 pass, 0 fail, 1 Windows symlink skip**
(`work/coercion-roots-check.log`). Все **16/16** compatibility programs совпали
с Node побайтно по stdout/stderr и exit status (`work/compat-report.json`).

Общий OrdinaryToPrimitive пока не включён: следующие пункты — property helpers,
array length с двумя observable conversions, join/apply, затем callbacks и
GC stress по всем callers. Полная ES2020 цель остаётся активной.
Usage **59% использовано, 41% осталось**. Подтверждено поручение выключить ПК
после завершения всей цели либо достижения порога остановки (20% остатка с
запасом к требуемым 15%), предварительно сохранив код и документацию.

## 2026-09-22 — Пользовательские преобразования объектов

Предыдущий turn дал прогресс: reusable root scopes и первые защищённые callers.
Теперь OrdinaryToPrimitive вызывает реальные valueOf/toString: number/default
hint начинает с valueOf, string hint — с toString. Noncallable methods пропускаются,
object result переводит к следующему методу. Следующий lookup выполняется после
предыдущего вызова, поэтому мутации методов видны. Wrapper fast-unboxing и
legacy builtin identity resolver удалены. Symbol.toPrimitive остаётся на этапе Symbol.

Завершён аудит roots для get/has/delete, array length, join, apply и radix.
ArraySetLength выполняет ToUint32 исходного Value, затем отдельный ToNumber
того же значения и сравнение; callbacks происходят дважды, даже перед ошибкой.
Managed input/output containers и временные строки сохраняются через вложенный GC.

Первоначальные **11 RED tests** стали GREEN. Итоговые **19** tests включают
gcStress, порядок методов/сравнений, property keys, fallback/наследование/bind,
nullish primitive results, detached references, join/apply/radix, ошибки и двойное
преобразование array length. Для errors Node запускается напрямую: проверяются
stdout и status; native пока печатает Nona runtime error вместо JS exception.
Независимый reviewer дефектов не нашёл; **9** дополнительных native gcStress-проб
совпали с Node. При уборке legacy code выявлена зависимость objectTag от трёх
сгенерированных string symbols; literals перенесены к object methods, затем
полная проверка повторена на окончательном коде.

**537 tests: 536 pass, 0 fail, 1 Windows symlink skip**
(`work/coercion-hooks-check.log`). **17/17** standalone programs совпали с Node
по stdout/stderr и exit status; добавлен `examples/compat/coercion.cjs`.
Результаты: `work/compat-report.json`, `work/coercion-hooks-compare.log`.
README, matrix, memory contract и планы обновлены.

Полная ES2020 цель не завершена. Следующие зависимости: стандартные глобальные
конструкторы и методы, descriptors/getters, strict mode/exceptions и дальнейший
синтаксис/runtime из общей матрицы. Usage **60% использовано, 40% осталось**;
условие выключения ПК пока не наступило.

## 2026-09-22 — Отдельный native construct entry

Предыдущий turn завершил OrdinaryToPrimitive с callback roots. Начат следующий
план global-constructors. FunctionLayout теперь имеет constructCode в offset 88,
полный payload 96 bytes. Все allocating/static paths инициализируют поле;
source functions и bound wrappers содержат ноль. Native address не является GC edge.

InvokeConstruct после проверки bound dispatch выбирает native constructCode
либо прежний source invoke. Native ABI: out, argc, argv, callee header, prepared
receiver пятым аргументом. Конструктор через bind сохраняет constructor mode,
игнорирует bound this и передаёт все bound arguments. Обычный call продолжает
использовать code; construction не угадывается по receiver.

Три native tests сначала дали поведенческий RED (undefined length вместо
значения из native constructor), затем GREEN. Проверены call/new, вложенный bind,
аргументы, prototype selection и instanceof. Review дефектов не нашёл, независимый
прогон native-construction/constructors/function-bind: **44/44 pass**.

Полный check **540 total, 539 pass, 0 fail, 1 Windows symlink skip**
(`work/native-construction-check.log`). Сравнение с Node **17/17 PASS**
(`work/compat-report.json`, `work/native-construction-compare.log`).

Это prerequisite: глобальные Object/Array/Boolean/Number/String ещё не добавлены.
Следующий шаг — mutable global property bindings с правильным shadowing и
var declaration behavior; отдельные Node vm probes сохранены в плане.
Usage **61% использовано, 39% осталось**; цель активна, условие выключения не наступило.

## 2026-09-22 — Mutable global bindings и globalThis

Предыдущий turn добавил отдельный native construct entry. Продолжен план
global-constructors: теперь есть общий mutable global name механизм, первый
поддержанный builtin — globalThis. Отдельный Binding.globalProperty не резервирует
имя и не превращает его в compile-time constant. Read/typeof идут через global
object, write/delete — через обычные property operations. Отсутствующее имя при
обычном чтении даёт runtime error; существующее undefined читается нормально.

Bare script var globalThis сохраняет builtin property. Function declaration
с тем же именем использует nonconfigurable global alias — различие выявлено
differential test и исправлено. Parameters/local var/lexicals затеняют builtin,
closures видят актуальное global property. Static globalThis node writable и
configurable, non-enumerable; GC прослеживает его отдельно, deletion очищает
node, новое присваивание может создать managed ordinary property.

Первоначальные tests: **12 RED /1 уже проходил**, итог **13/13 GREEN** с gcStress.
Review дефектов в рамках этапа не нашёл; ещё **6** независимых native probes
с GC совпали с Node (host-specific global Object tag нормализован отдельно).
Полный check **553 total, 552 pass, 0 fail, 1 Windows symlink skip**
(`work/global-properties-check.log`). Все **18/18** standalone programs совпали
с Node по stdout/stderr и exit status; добавлен `examples/compat/global-properties.cjs`.
Report: `work/compat-report.json`, `work/global-properties-compare.log`.

README, матрица, memory contract и план обновлены. Следующий шаг — реальные
Object/Array/Boolean/Number/String constructors и их static/prototype links.
Цель остаётся активной. Usage **63% использовано, 37% осталось**;
порог остановки/выключения пока не достигнут.

## 2026-09-22 — Стандартные глобальные конструкторы

Предыдущий turn завершил globalThis/property binding infrastructure. Теперь
Object/Array/Boolean/Number/String — реальные static callable/constructable
objects с mutable global properties, name/length/source, immutable prototype
property и обратными prototype.constructor links. Function object добавлен для
reflection и constructor identity; его dynamic call/new по-прежнему исключены
пользователем и завершаются runtime error, без интерпретатора/готового движка.

Object сохраняет object argument identity, упаковывает примитивы, создаёт fresh
object для nullish/missing. Array отличает единственный Number length от списка
элементов, создаёт holes, проверяет диапазон и целочисленность. Boolean/Number/String
при обычном call возвращают примитив; native construct entry возвращает Box с
нужным intrinsic prototype. Missing argument обрабатывается отдельно от undefined.
Call/apply/bind, вложенные bound constructors и coercion callbacks используют
существующий ABI/root scopes. Static constructors, metadata/global/prototype
nodes включены в GC. Class/subclass newTarget и static methods ещё впереди.

Все **21** новых tests стали GREEN после RED. Проверены defaults/brands,
identity, array holes/elements/errors, metadata/immutability, mutable bindings,
bound calls/new, callbacks и GC. Независимое review дефектов в текущем подмножестве
не нашло; **7** дополнительных native gcStress-проб совпали с Node, включая
Array length 2^32-1 и удаление Number во время преобразования.

Полный check: **574 total, 573 pass, 0 fail, 1 Windows symlink skip**
(`work/builtin-constructors-check.log`). Все **19/19** standalone programs
совпали с Node по stdout/stderr и exit status; новый пример
`examples/compat/builtin-constructors.cjs`. Report `work/compat-report.json`,
лог `work/builtin-constructors-compare.log`. README/matrix/memory/plan обновлены.

Следующие части полной цели — Object property APIs/descriptors, остальные
стандартные методы, strict/exceptions и дальнейший язык/runtime до ES2020.
Цель активна. Usage **64% использовано, 36% осталось**, до порога остановки есть запас.

## 2026-09-22 — Object inspection и prototype APIs

Предыдущий turn завершил global constructors. Добавлены hasOwnProperty,
propertyIsEnumerable, isPrototypeOf, toLocaleString, Object.getPrototypeOf,
setPrototypeOf и is. Общий prependFunctionBuiltin сохраняет existing owner
property chain, новые objects/nodes зарегистрированы в static GC roots.

Own attribute lookup учитывает data properties, array length, String indices/length,
mapped arguments, global aliases и virtual __proto__. Key coercion выполняется
до ToObject(receiver); receiver/key/lookup temporaries root-ятся через callbacks.
IsPrototypeOf проверяет nonobject argument до boxing receiver. ToLocaleString
читает текущий toString и вызывает его с исходным receiver. Object.is реализует
SameValue (NaN равен NaN, +0 отличается от -0), без coercion. SetPrototypeOf
валидирует nullish/primitive/prototype, циклы и immutable Object.prototype.

**23 tests GREEN** с gcStress; RED до реализации показал отсутствующую поддержку
на success/order случаях. Review дефектов не нашёл; **7** дополнительных native
проб, включая 100 пар SameValue, совпали с Node.
Полный check **597 total, 596 pass, 0 fail, 1 Windows symlink skip**
(`work/object-introspection-check.log`). Все **20/20** standalone examples
совпали с Node по stdout/stderr/exit status; новый `examples/compat/object-introspection.cjs`.
Report: `work/compat-report.json`, `work/object-introspection-compare.log`.

Документация и план обновлены; исправлены старые строки матрицы, где globalThis
и constructors ещё значились отсутствующими. Descriptors/getters, Object.create,
enumeration/extensibility и дальнейший язык до ES2020 остаются следующими этапами.
Цель активна. Usage **65% использовано, 35% осталось**; выключение пока не требуется.

## 2026-09-22 — Native accessor foundation

Property payload расширен до 72 bytes: getter/setter Values и accessor attribute.
Все поля инициализируются, GC трассирует оба callback, unlink очищает их, включая
static property nodes. Native Get/Set вызывает собственные и унаследованные
accessors с исходным receiver; отсутствующий getter возвращает undefined,
отсутствующий setter игнорирует запись, результат setter не используется.
Primitive receiver поддержан; immutable String own indices/length проверяются
до поиска prototype setter. Internal own definition обходит inherited setter.

Reentrant GC roots добавлены для accessor method/receiver/argument/result,
bind metadata fresh bound value/target, newInstance и instanceOf prototype.
Проверены существующие rooted callers apply/join/coercion. При реализации
обнаружен и устранён native access violation: copyValue использует RAX как
scratch, поэтому адрес property для копирования getter/setter сохранён в R10.

Первые 9 behavioral tests прошли RED→GREEN; затем добавлены ещё 3 сценария,
включая RED→GREEN regression String readonly index precedence. Все **12**
accessor tests с gcStress прошли. Installer существует только в test PE:
публичные Object.defineProperty/getOwnPropertyDescriptor ещё не реализованы.
Независимое review дефектов не выявило; **6** дополнительных native gcStress
сценариев совпали с Node.js.

Полный check: **609 total, 608 pass, 0 fail, 1 Windows symlink skip**
(`work/accessor-runtime-check.log`). Все **20/20** standalone programs совпали
с Node по stdout/stderr/exit status (`work/accessor-runtime-compare.log`,
`work/compat-report.json`). README, runtime memory, support matrix и план
обновлены. Следующий этап — публичные descriptors и их invariants, затем
специальные property cases и остальные пункты полного плана ES2020.

Полная цель активна. Usage **67% использовано, 33% осталось**. Условие
выключения ПК ещё не наступило: цель не завершена, порог остановки 20% остатка
для сохранения пользовательского резерва минимум 15% ещё не достигнут.

## 2026-09-22 — Descriptor reflection и преобразование records

Добавлен публичный Object.getOwnPropertyDescriptor: свежие mutable descriptor
objects, own-only lookup, data/accessor fields без вызова getter, special String
indices/length, array length, mapped arguments current cells и global aliases.
Target box-ится до key coercion; key/target/result protected через callbacks.
Для virtual __proto__ добавлены стабильные native getter/setter functions,
metadata и static GC roots. Getter поддерживает primitives, setter — nullish,
primitive no-op, prototype validation/cycles/immutable Object.prototype.
EmitNativeFunction отделён от установки owner data property.

Внутренние To/From/CompletePropertyDescriptor используют 6 Values + presence mask
(104 bytes): explicit undefined отличается от отсутствующего поля. To проверяет
Has/Get последовательно enumerable/configurable/value/writable/get/set,
нормализует booleans, немедленно валидирует callable getter/setter и после всех
полей отвергает mixed descriptors. Output range root удерживает ранние значения
через поздние getters/GC. From создаёт own data properties, обходя inherited
setters. Public defineProperty ещё не реализован; test-only roundTrip проверяет
conversion через нативный PE и Node defineProperty/getOwnPropertyDescriptor.
Порядок сверялся с https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-topropertydescriptor.

Reflection: 14 success tests сначала RED на отсутствующем builtin, затем GREEN;
5 error/order tests прошли. Conversion: исходные 17 tests сначала не линковались
из-за отсутствующих helpers, после реализации прошли; это не behavioral RED.
Review не нашёл дефектов текущих callers; 5 дополнительных native gcStress probes
совпали с Node. Замечание о default values при reused partial records исправлено:
3 настоящих RED tests выявили stale value/get/set, Complete теперь очищает
отсутствующие поля по presence bits, все 3 GREEN. Отложенных findings нет.
Тест на prototype poisoning восстановил Object.prototype перед console output,
чтобы не ломать lazy initialization самого Node stdout. Общий test installer
вынесен в tests/helpers/accessors.ts, остаётся только в test PE.

Итого добавлены **39 tests**. Финальный полный check:
**648 total, 647 pass, 0 fail, 1 Windows symlink skip**
(`work/property-descriptors-final-check.log`, exit 0).
Все **21/21** standalone examples совпали с Node по stdout/stderr/exit status
(`work/property-descriptors-final-compare.log`, `work/compat-report.json`),
новый пример `examples/compat/property-descriptors.cjs`. Текущий Node v26.9.0,
V8 14.6.202.34-node.32. README, matrix, memory contract и descriptor plan обновлены.

Далее — DefineOwnProperty/Object.defineProperty с invariants и exotic write cases;
план фиксирует необходимость length readonly/extensibility state и реального
__proto__ accessor node. Вся ES2020 цель остаётся активной. Usage **69% использовано,
31% осталось**; порог остановки/выключения 20% остатка ещё не достигнут.

## 2026-09-22 — Object.defineProperty и exotic write invariants

Добавлен public Object.defineProperty (length 3, native metadata/static roots).
Object target проверяется до key coercion, затем ToPropertyDescriptor читает
поля, и raw GetOwnDescriptor получает актуальное состояние после callbacks.
ValidateDescriptor сохраняет absent поля, проверяет nonconfigurable flags,
SameValue (NaN/signed zero/identity), data↔accessor transitions. Перед отказом
не изменяет target. GetOwnDescriptor выделен из public reflection в общий helper.
__proto__ теперь настоящий static accessor node с прежними getter/setter identities;
virtual fallback отключён. Attributes и методы удерживаются static GC roots.

String indices/length допускают только совместимые descriptors. Mapped arguments
обновляют parameter cell при data value, затем отключают mapping при writable:false;
accessor conversion отключает mapping без изменения параметра. Global aliases
получили writable attributes в 24-byte .data table; обычные compiler storeGlobal
и property assignment учитывают readonly. Их enumerable/configurable invariants
сохраняются. Inherited readonly array length/global alias блокируют assignment.

ObjectLayout расширен: flags at 40, size48; Function payload104, Box64. Flags
нулевые во всех allocators/static payloads; bit2 — readonly array length, bit1
зарезервирован для nonExtensible APIs. Array index definitions обновляют length,
readonly length блокирует рост. ArraySetLength делает ToUint32 и повторный
ToNumber исходного Value с GC roots; актуальный length читается после callbacks.
Shrink вычисляет highest nonconfigurable barrier и удаляет только более высокие
indices. Без callbacks два прохода эквивалентны descending deletion, не перебирая
billions of holes. При отказе length восстанавливается до barrier+1, requested
readonly всё равно применяется. Sloppy assignment игнорирует Boolean failure,
public defineProperty выдаёт текущий fatal error; JS throw/catch ещё впереди.

Исходные 22 success cases были RED при отсутствующем API, после реализации все
**38** начальных tests GREEN. Добавлены 2 inherited exotic cases и 6 проверок
состояния после отказа: test-only tryDefine возвращает Boolean внутреннего
оператора, oracle использует настоящий Reflect.defineProperty. Все **46** новых
проверок с gcStress прошли. Независимое review дефектов не нашло, **8** дополнительных
native probes совпали с Node: barriers, reentrant readonly, duplicate params,
inherited readonly и transitions. Отложенных замечаний нет.

Full check: **694 total, 693 pass, 0 fail, 1 Windows symlink skip**
(`work/define-property-check.log`, exit0). Все **22/22** standalone programs
совпали с Node stdout/stderr/exit status (`work/define-property-compare.log`,
`work/compat-report.json`); новый `examples/compat/define-property.cjs`.
README, matrix, memory contract и descriptor plan обновлены. Следующие части:
Object.create/defineProperties, own-key enumeration/extensibility, accessor syntax
и дальнейший язык до ES2020. Полная цель остаётся активной. Последний usage check:
**70% использовано, 30% осталось**, порог выключения 20% остатка ещё не достигнут.

## 2026-09-22 — перечисление own properties и массовые descriptors

Добавлены Object.keys/values/entries, getOwnPropertyNames/getOwnPropertyDescriptors,
create и defineProperties. OwnKeys делает snapshot строковых keys: numeric indices
по возрастанию, остальные в creation order. Values/entries/defineProperties
повторно читают own descriptor и enumerable после каждого getter; новые keys
в snapshot не попадают. GetOwnPropertyDescriptors не вызывает getters.
DefineProperties сначала полностью собирает и валидирует descriptor bag, затем
применяет descriptors; отказ при применении может оставить предыдущие изменения.

Typed ValueList (heap kind6) удерживает snapshot и собранные records при GC;
presence mask хранится как Number Value. Heapsort own keys O(n log n). Static
intrinsic property lists перелинковываются в creation order; source functions
публикуют length/name/prototype в верном порядке. Review выявило потерю исходной
позиции builtin global при function declaration поверх него. Исправлено:
сохраняется intrinsic key, alias даёт значение/attributes без повторного key.
Повторное независимое review замечаний не нашло; четыре gcStress probes совпали.

41 новый тест прошёл, включая восемь RED→GREEN проверок intrinsic order.
Full check: **735 total, 734 pass, 0 fail, 1 Windows symlink skip**, exit0
(work/object-collections-check.log). Все **23/23** standalone programs совпали
с Node stdout/stderr/exit status (work/object-collections-compare.log и
work/compat-report.json). Добавлен examples/compat/object-collections.cjs.
Документация и support matrix обновлены. Набор builtins всё ещё неполон;
Symbol/Proxy и другие отсутствующие типы этим этапом не добавлены.

Следующий этап: extensibility/seal/freeze APIs и запрет изменения prototype
nonextensible объекта; затем accessor syntax и оставшийся язык до ES2020.
Цель остаётся активной. Последняя проверка usage: **74% использовано, 26% осталось**.
Выключение по просьбе пользователя — только при полной цели либо пороге остатка
20% (запас над требуемыми 15%); текущий порог ещё не достигнут.

## 2026-09-22 — Object integrity levels

Реализованы preventExtensions/isExtensible, seal/isSealed, freeze/isFrozen.
Для primitives действуют ES2015+ правила: mutators возвращают исходное значение,
isExtensible false, isSealed/isFrozen true. Integrity shallow: getter/setter
не исполняются при проверках или freeze, вложенные объекты не замораживаются.
NonExtensible flag блокирует создание properties и смену prototype; идентичный
prototype разрешён. Inherited setter продолжает работать.

Seal/freeze используют own-key snapshot и общий DefineOwnProperty. Array length
остаётся writable после seal, readonly после freeze; holes не заполняются.
String synthetic properties проверяются без материализации. Seal сохраняет
mapped arguments, freeze отключает mapping через общий descriptor path. Global
alias flags блокируют как property writes, так и прямое script binding assignment.
Static builtin roots зарегистрированы для новых функций/properties.

29 исходных тестов GREEN после RED отсутствующих API, затем ещё 8 проверок,
включая повторные операции, global aliases и inherited/shallow behavior. Freeze
globalThis в Node -e ломал cleanup самого harness (запись module); только этот
oracle перенесён в vm context с DONT_CONTEXTIFY, обычным global object и тем же
console. Production behavior из-за особенности harness не изменялось.
Независимое review дефектов не нашло; пять дополнительных gcStress probes совпали.

Full check exit0: **772 total, 771 pass, 0 fail, 1 Windows symlink skip**
(work/object-integrity-check.log). **24/24** standalone examples совпали с Node
stdout/stderr/exit status, новый examples/compat/object-integrity.cjs
(work/object-integrity-compare.log, work/compat-report.json). Docs обновлены.
Следующий этап описан в object-method-syntax.md: методы/accessors, metadata,
nonconstructability, HomeObject/super. Полная ES2020 цель ещё не выполнена.
Последний usage check: 74% использовано, 26% осталось; stop/shutdown при 20%
остатка ещё не достигнут.

## 2026-09-22 — concise methods и accessor literal syntax

Parser поддерживает concise methods и get/set accessors: static/computed/string/
numeric/keyword names, обычные методы get()/set(), __proto__ как own method/accessor.
Getter arity0, setter arity1, unique method parameters; source span сохраняет
исходный текст с comments. AST/IR несут method/accessor kind. Lowering вычисляет
key один раз, строит get/set name prefix и держит object/key/function live.
Runtime newMethod nonconstructable, без own prototype; metadata length/name и
Function.toString корректны. Внутренний defineLiteralAccessor применяет partial
descriptor через DefineOwnProperty, сохраняя пару и data/accessor transitions.
Изменение public Object.defineProperty не влияет на создание литерала.

23 исходных теста прошли после RED, включая GC, closures, sloppy arguments,
source text и new rejection. Review нашло escaped contextual prefix: decoded
g\u0065t/s\u0065t ошибочно считались getter/setter. Исправлено проверкой raw token;
две RED→GREEN syntax regressions и допустимое escaped method name проверены.
Других замечаний нет, три независимые gcStress native/Node probes совпали.

Full check final exit0: **798 total, 797 pass, 0 fail, 1 Windows symlink skip**
(work/object-literal-methods-check-final.log). Все **25/25** standalone programs
совпали с Node (work/object-literal-methods-compare-final.log, work/compat-report.json).
Новый examples/compat/object-literal-methods.cjs. Docs обновлены.
HomeObject/super ещё не реализованы; полная поддержка методов не объявляется.
Следующий шаг — super lookup/receiver и GC retention home object. Strict mode,
async/generator/Symbol и оставшийся язык ES2020 также ещё впереди.
Usage: 76% использовано, 24% осталось; цель активна, shutdown threshold20% не достигнут.

## 2026-09-22 — HomeObject и super properties

Object methods/accessors получили super property read/write/call/update. Binder
отклоняет super вне method/accessor и внутри nested ordinary function; bare super
и super() не принимаются. FunctionLayout.homeObject at104, payload112; поле
инициализировано всеми allocators и traced GC. Borrowed/bound method удерживает
home object после удаления внешних ссылок. Native get/set используют descriptors
по prototype chain и исходный receiver; data writes учитывают receiver own
descriptor/extensibility и не вызывают setter в посторонней prototype chain.

RED tests обнаружили различия evaluation order; независимое review добавило
compound prototype mutation. Порядок доведён до Node26.9: raw key expression
один раз, base читается отдельно на Get/Put до key coercion; RHS может изменить
base для Put. Compound key object преобразуется отдельно для get и put (полный
suite поймал ошибочную initial cache); toggling x→y regression проверен. Delete
super вычисляет key expression без ToPropertyKey, затем текущая fatal error.
Null base допускает key coercion до failure. Эти детали подтверждены Node,
не заявляется побайтовое соответствие исторической редакции ES2020: см.
https://tc39.es/ecma262/2026/multipage/ecmascript-language-expressions.html#sec-super-keyword
для контекста меняющихся правил; oracle остаётся конкретный Node26.9.

Независимое review GC/root/ABI дополнительных дефектов не нашло; три gcStress
probes совпали. Всего **28** новых tests, full final exit0: **826 total, 825 pass,
0 fail, 1 Windows symlink skip** (work/super-check-final.log). Все **26/26**
standalone programs совпали по stdout/stderr/exit status (work/super-compare-final.log,
work/compat-report.json), новый examples/compat/super-properties.cjs. Docs/планы
обновлены. Классы, super(), new.target, strict/exceptions и остальной ES2020 ещё
не реализованы; общая цель остаётся активной. Usage последний77%/23%remaining,
порог shutdown20% ещё не достигнут.

## 2026-09-22 — new.target

Добавлен NewTarget AST/IR, function-context binding check и exact raw token target
(escaped spelling отклоняется). Source ABI получил шестой stack argument с Value
указателем: rt.invoke передаёт undefined, rt.invokeSourceConstruct — callee после
bound unwrap. Prologue копирует new.target в root slot рядом с this; nested
calls/constructors независимы. Native constructCode dispatch не менялся.

14 тестов GREEN после syntax RED: обычный/new/call/apply/bind, nested calls,
return constructor, rebinding, GC, methods/accessors и invalid contexts.
Независимое review ABI/root layout дефектов не нашло; native construction tests
3/3 passed. Full check exit0: **840 total, 839 pass, 0 fail, 1 Windows symlink skip**
(work/new-target-check.log). **27/27** standalone programs совпали с Node
stdout/stderr/status (work/new-target-compare.log, work/compat-report.json).
Добавлен examples/compat/new-target.cjs, docs обновлены.
Классы, Reflect.construct с отличающимся newTarget и lexical arrow new.target
пока не заявляются: соответствующие конструкции отсутствуют. Общая ES2020 цель
не завершена. Остаток последнего usage check21%; следующий шаг перед крупным
изменением — повторная проверка лимита и checkpoint по порогу20%.

## Остановка с сохранением usage — 2026-09-22

После проверенного new.target этапа осталось21% (79%used). Крупный следующий
этап exceptions/strict не начинается в последнем1% до рабочего порога20%,
чтобы оставить проверенную контрольную точку и запас выше требуемых15%.
Сохранён конкретный план exceptions-strict.md на основе текущих ABI/root/PE
контрактов. Полная ES2020 цель НЕ завершена. По просьбе пользователя будет
отправлена команда выключения Windows; принудительное закрытие приложений
через /f не используется.

## 2026-09-22 — explicit throw / try / catch

Добавлены handler records, exceptional CFG liveness, nonlocal native transfer
с восстановлением Win64 GP/full128 XMM, RSP и GC roots. Array.join cleanup chain
снимает только guards покидаемых runtime frames. Catch closures получают свежие
cells; исправлен var initializer внутри catch parameter scope. Независимый
review ABI/GC/cleanup не выявил оставшихся дефектов.

28 semantic exception tests и независимый native register preservation test
прошли. Full check обнаружил устаревший frontend rejection try/catch; он заменён
на malformed catch() и добавлен positive binding test. Повторный полный прогон:
871 total, 870 pass, 0 fail, 1 Windows symlink skip (work/exceptions-check-final.log).
28/28 standalone programs совпали с Node по stdout/stderr/status, включая
exceptions.cjs (work/exceptions-compare.log, work/compat-report.json).

Пользователь отменил резерв15% и рабочий stop20%; старые записи об остановке
выше являются историей, а не действующим ограничением. Следующий шаг finally
начат с18 RED semantic tests; Error objects/runtime error conversion и strict
ещё впереди. Общая ES2020 цель не завершена.

## 2026-09-22 — finally

Try AST допускает optional catch/finally; binder учитывает hoisting и отдельную
область finalizer. Lowering выполняет finalizers при normal/return/throw/break/
continue, снимает handlers до входа и использует snapshot внешних control
targets. Pending Value удерживается liveness; новый abrupt completion заменяет
прежний. Внутренние exits циклов finalizer не теряют pending completion.

После RED добавлены25 Node/native GC-stress сценариев. Первый прогон выявил
опечатку в одной тестовой программе (пропущенная скобка, Node SyntaxError);
исправленная программа и остальные сценарии прошли. Независимый reviewer
проверил код и7 дополнительных native/Node проб без найденных дефектов.
Полный npm.cmd run check: 896 total, 895 pass, 0 fail, 1 Windows symlink skip
(work/finally-check.log). 29/29 standalone programs совпали по stdout/stderr/
status (work/finally-compare.log, work/compat-report.json), включая finally.cjs.
Следующий шаг — Error family и преобразование runtime checks в JS throw, затем
strict semantics. Полный ES2020 scope остаётся незавершённым.

## 2026-09-22 — Error family и runtime exceptions

Добавлены семь ES2020 Error constructors/prototypes, instance Error tag,
message descriptor и generic Error.prototype.toString с точным порядком
get/coercion. NativeError constructors наследуют Error; static prototypes и
property nodes включены в GC. Internal throw helpers обходят глобальные
подмены и inherited setters, не вызывают JS/GC до передачи исключения.

Семантические failIf переведены на TypeError/ReferenceError/RangeError; allocator,
OS IO и внутренние invariants сохраняют fatal path. TDZ/const/delete super,
callability/constructability, descriptors, prototype checks, conversion, invalid
array length/radix и argument limits теперь могут перехватываться.

15 Error и38 runtime-error tests прошли после RED; проверены mutation/cleanup,
GC, hostile prototypes и descriptor partial state. Reviewer не нашёл дефектов
и выполнил5 независимых Node/native gcStress probes. Full suite сначала нашёл
6 link errors в минимальном IO fixture из-за неиспользуемого concat dependency;
fixture теперь исключает concat вместе с log (эти функции не вызываются IO
тестами). Повторный полный check:949 total,948 pass,0 fail,1 Windows symlink skip
(work/errors-check-final.log). 30/30 standalone programs, включая errors.cjs,
совпали с Node stdout/stderr/status (work/errors-compare.log,compat-report.json).

Runtime messages пока Invalid operation; differential probes сравнивают типы
и состояния, а не implementation-defined текст V8. Пользовательский Error(message)
сохраняет message. V8 stack/captureStackTrace не реализованы, ES2022 cause вне
текущего ES2020 scope. Следующий шаг strict описан в exceptions-strict.md.
Полная цель не завершена.

## 2026-09-23 — strict mode

Завершён strict mode для текущего синтаксического поднабора: directive prologue
script/function и наследование контекста, raw `this`, unmapped `arguments`,
restricted bindings и Function properties, early errors, strict failed writes/
deletes и ReferenceError для необъявленных имён. GC-stress проверки охватывают
receiver, escaped arguments и функции-бросатели.

Независимое review выявило два расхождения с историческим ES2020, скрытые
дифференциальной проверкой против Node 26.9. Разрешение левой части strict
assignment теперь сохраняется до вычисления RHS и повторно проверяется перед
записью: ни создание, ни удаление глобального свойства в RHS не меняет исходную
семантику ссылки. `Function.prototype.caller/arguments` и strict
`arguments.callee` используют один frozen ThrowTypeError intrinsic, как требует
ES2020. Оба дефекта закреплены отдельными тестами без современного Node oracle.

Целевые strict-тесты: 53 pass. Полный `npm run check`: 1003 total, 1002 pass,
0 fail, 1 Windows symlink skip (`work/strict-check-final.log`). Все 31 standalone
programs, включая новый `strict-mode.cjs`, совпали с Node по stdout/stderr/status
(`work/compat-report.json`). Повторное независимое review не нашло других
strict-specific дефектов в текущем поддерживаемом синтаксисе. Non-simple
parameters и classes будут проверены при реализации этих конструкций.

Следующий пункт общего списка — области видимости и разрешение имён; работа над
ним не начата и ожидает команды пользователя. Полная ES2020 цель не завершена.

## 2026-09-23 — области видимости и разрешение имён

Неизвестные IdentifierReference теперь разрешаются через глобальный объект:
обычное чтение бросает перехватываемый ReferenceError, `typeof` допускает
отсутствие, sloppy assignment создаёт ordinary property, strict assignment
сохраняет состояние ссылки через эффекты RHS. `undefined`, `NaN`, `Infinity` и
`console` материализованы как свойства с проверенными дескрипторами; `console.log`
проходит через обычные get/invoke и допускает замену, передачу и затенение.

Добавлен чистый `collectDeclarations`, ранние конфликты var/lexical/parameters/
catch/switch и lexical block functions во всех StatementList positions. Block
functions инициализируются при входе в scope, получают свежие captured cells при
повторном входе и не создают Annex B aliases. Независимое review нашло пропущенный
конфликт catch parameter с block function; исправление и усиленный GC test добавлены.

Целевой прогон после review: 41 pass (`work/scope-resolution-targeted.log`).
Полный прогон: 1037 total, 1036 pass, 0 fail, 1 Windows symlink skip; он и
32/32 standalone comparisons записаны в
`work/scope-resolution-check.log` и `work/scope-resolution-compare.log`.
Полная цель ES2020 не завершена; следующий согласованный этап — пункт 3.

## 2026-09-23 — степень и optional chaining

После явного решения отложить legacy-пункт 3 реализован пункт 4: Number `**` и
`**=`, optional property/computed access, optional call, смешанные цепочки и
`delete` optional chain. Parser сохраняет right associativity степени,
ограничение unary left operand, границы цепочки в скобках и ранние ошибки для
optional assignment/update/new/super. Lowering использует общий CFG exit,
пропускает keys/arguments после nullish и сохраняет receiver обычных, optional,
сгруппированных и super-вызовов.

`rt.pow` удерживает исходные Values во время ToNumber и вызывает автономное
binary64-ядро без новых DLL. ES special cases проверяются явно; конечный
положительный путь использует x87 log2/exp2 и отличается от Node максимум на
1 ULP в четырёх из 96 детерминированных проб, что допускается
implementation-approximated семантикой степени.

Целевой прогон после review: 39 pass. Полный `npm run check`: 1078 total, 1077 pass,
0 fail, 1 Windows symlink skip (`work/modern-expressions-check.log`). Все 33
standalone programs, включая `modern-expressions.cjs`, совпали с Node
(`work/modern-expressions-compare.log`, `work/compat-report.json`). Добавлен
ручной пример `examples/modern-expressions-demo.js`. Независимое review нашло
ошибочное сравнение при бесконечном показателе и потерю receiver во вложенной
сгруппированной optional chain; оба дефекта прошли RED→GREEN и полный повторный
прогон. Пункт 3 остаётся отложенным;
полная цель ES2020 не завершена.

## 2026-09-25 — инфраструктурные этапы 0–2

Добавлен [контракт ES2020](es2020-contract.md) с границами ECMA-262,
исключениями `eval`/динамического `Function`, решением включить `with` в цель и
отдельным учётом Annex B. [Аудит операций](runtime-operations-audit.md)
фиксирует нынешние общие входы property/call/construct/coercion/GC и границу
будущего Linux backend. `compileToIR` выделяет платформенно независимый
frontend/IR путь. Все текущие преобразования property keys проходят через
`rt.toPropertyKey`; до появления Symbol этот вход совпадает с `ToString`.

Добавлены Windows CI с полным native-набором и сравнением примеров, Linux CI
для frontend/IR тестов, закреплённый адаптер Test262 с JSON-отчётом и десять
native-тестов общих операций. Адаптер пока пропускает runtime-negative/module/async/raw
и не является полным Test262 harness. Группа coalesce: 21 pass, 3 fail, 0 skip;
один fail использует отсутствующий Symbol, два — proper tail calls. Manifest
smoke: 2 pass, 0 fail, 0 skip.

Проверка Windows x64, Node 26.9.0: `npm run build`; `node --test
dist/tests/*.test.js` — 1088 total, 1087 pass, 0 fail, 1 skip. Единственный
skip — проверка symlink в `cli.test.ts`, у Windows account нет разрешения на
создание ссылки. `node scripts/compare-examples.mjs` — 34/34 совпадений с
Node. Журналы: `work/stage02-check.log`, `work/stage02-compare.log`,
`work/test262-smoke-report.json`, `work/compat-report.json`.

Этап 2 создал общую точку расширения, но не реализовал Symbol, Proxy или
полную диспетчеризацию ES2020 internal methods. Эти задачи остаются в
соответствующих этапах [контракта](es2020-contract.md).

## 2026-09-25 — этап 3, простые стрелочные функции

Парсер принимает стрелки с простыми параметрами и expression/block body.
Стрелки неконструируемы и не имеют own `prototype`; вызов берёт лексические
`this`, `arguments`, `new.target` и `super` окружения. Function payload расширен
до 152 байт, GC обходит сохранённые lexical Values. Точный исходный текст
остаётся доступен через `Function.prototype.toString`.

`arrows.test.ts`: 11 pass, включая native stress GC. Полный native-прогон:
1099 total, 1098 pass, 0 fail, 1 Windows symlink skip
(`work/stage03-arrow-check.log`). Совместимые примеры: 35/35 совпали с Node
(`work/stage03-arrow-compare.log`). Test262 arrow group на закреплённой ревизии:
129 pass, 214 fail, 0 skip (`work/stage03-arrow-test262-report.json`). Из 214
ошибок 205 — compile failures: недостающие параметры, синтаксис и другие
конструкции; 9 runtime failures требуют `eval`, Symbol, Array.forEach или иных
 API за пределами текущего поднабора. Поддержка стрелок остаётся частичной.

## 2026-09-25 — этап 3, шаблонные строки без тегов

Lexer разбирает template segments с вложенными `${...}`, escape и
нормализацией CRLF. Parser строит Template AST; lowering вычисляет каждое
выражение в исходном порядке с явным строковым преобразованием. Tagged
templates пока отклоняются.

`templates.test.ts`: 8 pass. Полный native-прогон: 1106 total, 1105 pass,
0 fail, 1 Windows symlink skip (`work/stage03-template-check.log`).
Совместимые примеры: 36/36 совпали с Node
(`work/stage03-template-compare.log`). Test262 template-literal group:
42 pass, 15 fail, 0 skip (`work/stage03-template-test262-report.json`).
14 compile failures связаны с tagged templates, один runtime failure
использует исключённый из цели `eval`.
Обновлённый Test262 smoke manifest: 4 pass, 0 fail, 0 skip (coalesce,
lexical new.target стрелки и вложенный шаблон).

## 2026-09-25 — этап 3, `for...in` для `var` и identifier

Native helper собирает строковые ключи с цепочки прототипов, учитывает
неперечислимые тени, а перед выдачей повторно проверяет существование ключа.
Lexer/parser/binder/IR поддерживают `for (var key in value)` и запись в ранее
объявленный identifier. `let`/`const`, property/destructuring targets и полная
семантика мутаций остаются отдельной работой.

`for-in.test.ts`: 8 pass, включая GC stress. Полный native-прогон:
1114 total, 1113 pass, 0 fail, 1 Windows symlink skip
(`work/stage03-for-in-check.log`). Совместимые примеры: 37/37 совпали с Node
(`work/stage03-for-in-compare.log`). Test262 for-in group: 74 pass,
45 fail, 0 skip (`work/stage03-for-in-test262-report.json`); 22 compile failures
связаны с ещё неготовыми формами синтаксиса, runtime failures преимущественно
используют `eval` и Array.push.

## 2026-09-25 — этап 3/4, `for...of` для массивов

Parser и IR принимают `for (var value of array)` и ранее объявленный
identifier. Runtime проверяет, что RHS — массив или примитивная строка. Цикл
читает текущую длину и значение по индексу на каждой итерации; массивы
поддерживают holes и inherited values, строки выдают Unicode code points с
объединением surrogate pair. `break`/`continue` работают. Пользовательские iterable, Symbol.iterator,
IteratorClose, `let`/`const` и destructuring ещё отсутствуют.

`for-of.test.ts`: 10 pass, включая GC stress. Полный native-прогон: 1124 total, 1123 pass,
0 fail, 1 Windows symlink skip (`work/stage03-for-of-check.log`). Совместимые
примеры: 38/38 совпали с Node (`work/stage03-for-of-compare.log`). Первый
Test262 for-of group: 106 pass, 643 fail, 2 skip
(`work/stage03-for-of-test262-report.json`); основная причина — отсутствие
общего протокола и прочего синтаксиса ES2020. Smoke manifest: 6 pass.

## 2026-09-26 — этап 4, основа Symbol

Введён Symbol как отдельный Value tag и вид heap-объекта с точной трассировкой
GC. Реализованы уникальность, typeof, преобразования и ошибки ToNumber/
неявного ToString, символьные ключи с сохранением identity, порядок собственных
ключей, Object.getOwnPropertySymbols, well-known symbols, Symbol.for/keyFor,
Symbol.prototype.toString/valueOf/description/@@toPrimitive и пользовательский
Symbol.toPrimitive. Реестр удерживает ключи и символы при сборке мусора.

`symbols.test.ts`: 17 pass, включая три проверки с принудительным GC.
Полный Windows native-прогон: 1141 total, 1140 pass, 0 fail, 1 прежний
symlink skip (`work/stage04-symbol-check.log`). Test262 Symbol group:
38 pass, 60 fail, 0 skip (`work/stage04-symbol-test262-report.json`);
часть ошибок связана с недостающими возможностями общего harness
(`Array.isArray`, `Math.pow`, `Array.prototype.push`, realm). Это не оценка
полного соответствия разделу Symbol. `Object.prototype.toString` учитывает
пользовательский `Symbol.toStringTag` и безопасен при вызове getter/GC.
Общий итерационный протокол, Symbol.hasInstance и остальные интеграции
well-known symbols ещё не готовы.
Совместимые примеры: 39/39 совпали с Node (`work/stage04-symbol-compare.log`).

## 2026-09-26 — этап 4, итерационный протокол

`for...of` получает `@@iterator`, один раз читает `next`, вызывает его на
каждом шаге и проверяет объект результата, `done` и `value`. Array/String
prototypes предоставляют `@@iterator`; их методы возвращают объекты с `next`
и `[Symbol.iterator]`. Поддержаны пользовательские iterables, замена метода
массива и boxed strings. IteratorClose вызывается при break/return и
исключении из тела цикла; при throw прежнее исключение сохраняется, если
`return` выбросил новое. Ошибка из `next` не вызывает IteratorClose.

`for-of.test.ts`: 27 pass, включая две проверки с принудительным GC.
Полный Windows native-прогон: 1158 total, 1157 pass, 0 fail, 1 прежний
symlink skip (`work/stage04-iterator-check.log`). Совместимые примеры:
39/39 (`work/stage04-iterator-compare.log`). Test262 for-of group на
закреплённой ревизии: 123 pass, 626 fail, 2 skip
(`work/stage04-iterator-test262-report.json`). Не закрыты все варианты
итерационных деклараций, destructuring, генераторы, async и ряд встроенных API.

Добавлены Array.prototype.values (тот же callable, что @@iterator),
Array.isArray и generic Array.prototype.push с проверкой длины, свойств и
GC. `array-builtins.test.ts`: 6 pass, включая stress GC.

Создан Math object и Math.pow поверх существующего числового ядра.
`math.test.ts`: 4 pass. Остальные свойства Math ещё не реализованы.

## 2026-09-26 — продолжение этапа 4, Symbol.hasInstance и лексические циклы

`instanceof` вызывает пользовательский `Symbol.hasInstance`; обычный алгоритм
вынесен в `Function.prototype[Symbol.hasInstance]`. Проверены переопределение,
неконструируемые функции, ошибки и работа с GC. `for...in` и `for...of`
поддерживают `let`/`const` в заголовке: создаются отдельные bindings на каждой
итерации, включая захваты замыканиями; RHS вычисляется с учётом TDZ. Для
`for...of` проверены закрытие итератора при помеченном `break` и сохранение
захваченных значений при stress GC.

Команда `npm exec --yes --package=node@26.9.0 -- node --test
dist/tests/*.test.js`: 1180 total, 1179 pass, 0 fail, 1 Windows symlink skip
(`work/stage04-node26-full.log`). Команда сравнения примеров с тем же Node 26:
39/39 (`work/stage04-final-compare.log`). Положительный Test262 smoke:
9 pass, 0 fail, 0 skip (`work/stage04-final-smoke.log`). Сырые группы
закреплённой ревизии Test262: Symbol 72/26/0 pass/fail/skip,
for-in 84/35/0, for-of 128/621/2. Эти группы содержат возможности вне
текущего поднабора и тесты после ES2020; числа не означают закрытие этапа.

Node 22 не является поддерживаемой версией тестового окружения: три теста
сравнения с его собственным oracle дали отличия (в том числе metadata
функций и sealing глобального объекта). На требуемом Node 26 они проходят.
Linux native backend ещё не реализован; CI запускает на Linux только
frontend/IR тесты. Полный объём ES2020 остаётся открытым.

Затем добавлен `Array.prototype.includes` для обычных и generic receivers:
SameValueZero (включая NaN), holes как `undefined`, унаследованные элементы,
положительный и отрицательный `fromIndex`, объектные getters и GC roots.
`array-builtins.test.ts`: 10 pass на Node 26. Полный native-прогон после этого
добавления: 1184 total, 1183 pass, 0 fail, 1 Windows symlink skip
(`work/stage04-includes-full.log`). Группа Test262
`built-ins/Array/prototype/includes`: 26 pass, 4 fail, 0 skip; провалы требуют
Proxy или resizable ArrayBuffer (`work/stage04-array-includes-test262.log`).
Положительный smoke manifest расширен до 10 pass, 0 fail, 0 skip
(`work/stage04-includes-smoke.log`). Совместимые примеры: 40/40
(`work/stage04-includes-compare.log`).

В Math добавлены восемь стандартных констант с неизменяемыми дескрипторами:
E, LN10, LN2, LOG10E, LOG2E, PI, SQRT1_2, SQRT2. После этого вся группа
Test262 `built-ins/Math/pow` прошла: 28 pass, 0 fail, 0 skip
(`work/stage04-math-pow-test262.log`). `math.test.ts`: 5 pass. Итоговый
native-прогон на Node 26: 1185 total, 1184 pass, 0 fail, 1 Windows symlink
skip (`work/stage04-math-constants-full.log`); примеры 40/40, smoke 11/11.

Добавлен `String.prototype.includes`: generic receiver, UTF-16 поиск,
ToIntegerOrInfinity позиции, проверка Symbol.match до строкового преобразования
и GC roots при пользовательских hooks. `string-builtins.test.ts`: 7 pass.
Test262 `built-ins/String/prototype/includes`: 25 pass, 2 fail, 0 skip;
два провала используют ещё отсутствующие RegExp literals
(`work/stage04-string-includes-test262.log`). Итоговый native-прогон:
1192 total, 1191 pass, 0 fail, 1 Windows symlink skip
(`work/stage04-string-includes-full.log`); примеры 41/41, smoke 12/12.

Заголовки `for...in`/`for...of` теперь принимают присваивание в member
expression. Объект и вычисляемый ключ оцениваются на каждой итерации после
получения следующего значения. Добавлены Array.prototype.keys/entries с
общим состоянием итератора и собственный `arguments[Symbol.iterator]`
для mapped и unmapped arguments. Соответствующие native-тесты проверяют
итераторы, holes, строгую функцию и computed targets.

Test262: for-in 85 pass / 34 fail / 0 skip; for-of 139 pass / 610 fail /
2 skip (`work/stage04-property-forin.log`,
`work/stage04-arguments-iterator-forof.log`). Полный native-прогон на Node 26:
1201 total, 1200 pass, 0 fail, 1 Windows symlink skip
(`work/stage04-arguments-iterator-full.log`). Совместимые примеры: 41/41.
Положительный Test262 smoke manifest: 16/16
(`work/stage04-final-smoke.log`).

Реализован generic `Array.prototype.pop`: ToLength, чтение последнего
элемента, DeletePropertyOrThrow, запись новой длины и возврат значения.
Поддержаны sparse массивы, accessor callbacks и GC stress. Добавлены восемь
стандартных констант Number с неизменяемыми дескрипторами. Группа Test262
`built-ins/Array/prototype/pop`: 23 pass, 0 fail, 0 skip; группа for-of после
этого: 142 pass, 607 fail, 2 skip (`work/stage04-array-pop-test262.log`,
`work/stage04-array-pop-forof.log`). Итоговый native-прогон на Node 26:
1206 total, 1205 pass, 0 fail, 1 Windows symlink skip
(`work/stage04-array-pop-full.log`). Примеры 41/41, smoke 17/17.

Добавлены Number.isFinite, Number.isInteger, Number.isNaN и
Number.isSafeInteger. Они принимают только Number, обрабатывают NaN,
бесконечности, дроби, ±0 и safe-integer границы без пользовательских
преобразований. Четыре группы Test262 прошли полностью: 8/8, 9/9, 7/7,
10/10. `number-builtins.test.ts`: 6 pass, включая GC stress. Полный native
прогон на Node 26: 1212 total, 1211 pass, 0 fail, 1 Windows symlink skip
(`work/stage04-number-builtins-full.log`). Примеры 41/41, положительный
smoke manifest 21/21.

Добавлен параметр `...rest` в function declarations/expressions, methods и
стрелках. В parser/binder/IR отмечены фиксированные параметры и отдельная
rest-привязка; runtime создаёт массив из оставшихся аргументов с GC roots.
Sloppy `arguments` с rest остаётся unmapped. Проверены length, замыкания,
обработка некорректного порядка/дубликатов и strict directive early error.
`rest-parameters.test.ts`: 12 pass. Test262 `language/rest-parameters`:
8 pass, 3 fail, 0 skip (классы/деструктуризация); группа стрелок:
136 pass, 207 fail, 0 skip (`work/stage05-rest-test262.log`,
`work/stage05-rest-arrow.log`). Полный native-прогон: 1224 total, 1223 pass,
0 fail, 1 Windows symlink skip (`work/stage05-rest-full.log`); совместимые
примеры 42/42, положительный smoke manifest 22/22.

Добавлены `Math.min` и `Math.max` для произвольного числа аргументов:
преобразования выполняются слева направо для каждого аргумента, `NaN`
сохраняется, а при равных нулях выбирается нужный знак. Проверены
callback-преобразования под GC stress. Обе группы Test262 прошли полностью:
10/10 и 10/10 (`work/stage06-math-min-report.json`,
`work/stage06-math-max-report.json`). Полный native-прогон на Node 26.10.0:
1229 total, 1228 pass, 0 fail, 1 Windows symlink skip
(`work/stage06-node26-test.log`); совместимые примеры 42/42, smoke 22/22.

Добавлены параметры `name=expr` для функций, методов и стрелок. Инициализация
идёт слева направо; при чтении ещё не инициализированного параметра возникает
ReferenceError. Значение `undefined` запускает default-выражение, остальные
переданные значения сохраняются. `arguments` не связан с параметрами,
`length` останавливается перед первым default. Проверены замыкания, порядок
вычисления, early errors и GC stress. Все 9 `dflt-params` случаев группы
Test262 `language/expressions/arrow-function` проходят; группа в целом:
147 pass / 196 fail / 0 skip (`work/stage07-default-arrow-report.json`).

Добавлены spread-элементы в литералах массивов и spread-свойства в
литералах объектов. Массивы используют общий синхронный итератор; объектное
копирование перебирает снимок собственных ключей, проверяет перечисляемость
перед чтением и переносит значения в новый объект, включая Symbol и getters.
Проверены sparse массивы, Unicode-строки, переопределённые итераторы,
порядок эффектов и GC stress. Test262 `language/expressions/array`:
50 pass / 2 fail / 0 skip; два оставшихся случая требуют генераторов
(`work/stage08-array-spread-report.json`). Полный native-прогон на Node 26:
1256 total, 1255 pass, 0 fail, 1 Windows symlink skip
(`work/stage08-node26-test.log`); совместимые примеры 45/45, smoke 36/36.

Добавлен spread в аргументах вызовов, optional calls и `new`. Аргументы
собираются через общий синхронный итератор, а runtime хранит динамический
список Value под корнем GC. Порядок вычисления, receiver, конструкторы и
GC stress проверены; действует ресурсный предел 65536 аргументов. Группы
Test262 `language/expressions/call` и `new`: 72/92 и 54/59; среди случаев
`spread-*` не проходят только четыре теста с генераторами (по два в группе).
В Math добавлены `abs`, `sign`, `sqrt`, `trunc`, `floor`, `ceil`, `round` с
обработкой NaN, ±0, бесконечностей и границ округления. Семь групп Test262
прошли: 8/8, 5/5, 10/10, 12/12, 11/11, 11/11, 11/11. Полный native-прогон
на Node 26: 1270 total, 1269 pass, 0 fail, 1 Windows symlink skip
(`work/stage09-node26-test.log`); совместимые примеры 46/46, smoke 45/45.

Реализованы рекурсивные binding patterns для массивов и объектов в
`var`/`let`/`const` и `for...in`/`for...of`: вложенность, elisions,
инициализаторы по умолчанию, array rest, object rest и вычисляемые ключи.
Object rest исключает связанные ключи до чтения getters и переносит
перечисляемые собственные строковые и символьные свойства. При ошибке
инициализатора или вложенного binding array-итератор закрывается; эти пути
проверены вместе с GC stress. Test262 declaration/dstr: `var` 79/97,
`let` 77/93, `const` 77/93; оставшиеся случаи не компилируются, так как
требуют генераторов или классов (`work/stage10-*-dstr-report*.json`).
Профильный набор `array-destructuring.test.ts`: 28/28. Полный native-прогон
на Node 26: 1298 total, 1297 pass, 0 fail, 1 Windows symlink skip
(`work/stage10-regression.log`).

Расширены formal parameters функций, стрелок и методов до вложенных
array/object binding patterns, включая defaults и rest pattern. Проверены
TDZ, несвязанный `arguments`, длина функции и совместимость со старыми
default/rest параметрами. Группа Test262 `language/rest-parameters`:
10 pass / 1 compile fail (классы); `language/destructuring/binding/syntax`:
12 pass / 2 compile fail (генераторы и async).

Добавлены array/object destructuring assignment с идентификаторами и
property targets, defaults, rest и корректным результатом RHS. Для
assignment targets ссылки на свойства вычисляются до шага итератора;
ошибка ссылки закрывает итератор, ошибка `next()` не закрывает. В strict
режиме запись в необъявленное имя вызывает ReferenceError. Группа Test262
`language/expressions/assignment/dstr`: 323 pass / 45 compile fail /
0 runtime fail; оставшиеся случаи требуют генераторов или классов
(`work/stage11-assignment-dstr-report4.json`). Полный native-прогон на
Node 26: 1313 total, 1312 pass, 0 fail, 1 Windows symlink skip
(`work/stage11-regression2.log`); совместимые примеры 46/46, smoke 45/45.

## 2026-09-26: базовая семантика классов

Реализованы объявления и выражения классов, конструкторы, методы и аксессоры,
статические и вычисляемые имена, `extends`, `super()` и `super` property,
лексическая TDZ и обязательный `new` для вызова конструктора. Для методов
используются строгий режим и non-enumerable дескрипторы. Проверены 14 новых
сценариев `classes.test.ts`, включая наследование и ошибки при доступе к `this`
до `super()`. Выбранные группы Test262 `class/method` и `class/method-static`
прошли по 20/20; `class/definition`: 46 pass, 17 compile fail, 2 skip
(`work/stage12-class-definition-report4.json`). `language/rest-parameters`:
11/11. Первый общий native-прогон на Node 26: 1324 total, 1323 pass, 0 fail,
1 Windows symlink skip (`work/stage12-regression2.log`). Это ещё не полная
семантика классов: генераторные/async методы, поля, private syntax и крайние
случаи derived construction остаются открытыми. Дополнительно проверены
возвраты из производного конструктора: объект допустим до `super()`, примитив
вызывает TypeError, `undefined` требует инициализированного `this`. Крайний
случай `static prototype` теперь отклоняется при разборе. Финальный прогон:
1328 total, 1327 pass, 0 fail, 1 symlink skip (`work/stage12-regression4.log`).

## 2026-09-26: `new.target` и лексический `this` в производных классах

Передача `new.target` через `super()` теперь сохраняет исходный конструктор
при обычных, spread и bound вызовах базового конструктора. Исправлена область
outgoing аргументов x64: шестой аргумент больше не перезаписывает сохранённый
указатель результата. Для производного конструктора `this` хранится в GC cell;
стрелка, созданная до `super()`, видит ReferenceError до и объект после вызова.
Проверены дополнительные сценарии и GC stress. Общий прогон Node 26:
1333 total, 1332 pass, 0 fail, 1 Windows symlink skip
(`work/stage14-regression.log`). Группа Test262 `class/definition` остаётся
46 pass / 17 compile fail / 2 skip; непрошедшие случаи требуют в основном
генераторной/async семантики.

## 2026-09-26: вызовы встроенных базовых конструкторов из классов

`super()` теперь проверяет вызываемость и constructability базы до чтения
внутренних полей. `extends null` и изменение прототипа конструктора приводят к
TypeError вместо native crash. Нативные конструкторы Object, Array,
Boolean/Number/String и семейства Error при наследовании сохраняют прототип
производного класса; для Object с производным `new.target` возвращается
подготовленный объект. Добавлены сравнения с Node для всех этих случаев.
Общий прогон Node 26: 1340 total, 1339 pass, 0 fail, 1 Windows symlink
skip (`work/stage15-regression4.log`).

## 2026-09-26: `Math.imul` и `Math.clz32`

Добавлены операции с преобразованием аргументов через `ToInt32`, включая
отсутствующие аргументы, знаковое переполнение и ведущие нули. Группы Test262
`built-ins/Math/imul` и `clz32`: 5/5 и 10/10. Общий прогон Node 26:
1343 total, 1342 pass, 0 fail, 1 Windows symlink skip
(`work/stage16-regression.log`).

## 2026-09-26: Linux x64 native target

Добавлен ELF64 writer с секциями кода, констант и данных, разрешением
релокаций и проверкой символов. Linux syscall shims сохраняют ожидаемый
Win64 ABI машинного кода runtime и реализуют выделение памяти, вывод UTF-8,
завершение процесса и необходимые операции KERNEL32 без внешней библиотеки.
Компилятор и CLI принимают `--target linux-x64`; выходному файлу задаётся
исполняемый режим. Добавлены `elf.test.ts`, `scripts/compare-linux.mjs` и
Linux native задание CI.

В WSL Ubuntu синтетический ELF, JavaScript-вывод, Unicode, GC stress и
наследование классов прошли. Совместимые примеры Linux совпали с Node в 46/46
случаях (`work/stage17-linux-compat.log`). Общий прогон Node 26 на Windows:
1349 total, 1344 pass, 0 fail, 5 skip (`work/stage17-regression2.log`):
1 пропуск Windows symlink и 4 Linux execution tests, когда WSL временно не
отвечал. Отдельный запуск Linux-тестов с доступным WSL прошёл 5/5.
CLI `--target linux-x64` дополнительно проверен по ELF header. Проверка GitHub CI ещё не выполнялась; Linux target покрывает текущий
поднабор языка, а не весь ES2020.

## 2026-09-26: `Math.fround`

Добавлено округление binary64 до binary32 и обратное представление результатом
binary64 через SSE-преобразования. Два сравнения с Node, включая ±0, NaN,
переполнение и underflow, прошли; группа Test262 `built-ins/Math/fround`
прошла 9/9 (`work/stage18-fround.log`).
Общий прогон Node 26: 1351 total, 1346 pass, 0 fail, 5 skip
(`work/stage18-regression.log`): Windows symlink и четыре WSL-теста при
временной недоступности WSL.

## 2026-09-26: `Math.hypot`

Добавлено масштабированное вычисление евклидовой нормы без преждевременного
переполнения/потери субнормальных аргументов. Все аргументы приводятся к числу
слева направо, даже после NaN или Infinity; Infinity имеет приоритет в
результате. Тесты Node включают GC stress во время пользовательского `valueOf`.
Группа Test262 `built-ins/Math/hypot` прошла 12/12
(`work/stage19-hypot.log`).
Общий прогон Node 26: 1354 total, 1349 pass, 0 fail, 5 skip
(`work/stage19-regression.log`).
Linux ELF с `Math.hypot` и `Math.fround` запущен под WSL; числа совпали с Node.

## 2026-09-26: `Math.random`

Добавлен PRNG xorshift64* с состоянием на процесс, начальной смесью счётчика
тактов и равномерной выдачей 53-битного числа в диапазоне `[0, 1)`. Это
реализация математического API, без криптографических гарантий. Локальный
тест проверяет диапазон, изменение состояния и метаданные функции. Группа
Test262 `built-ins/Math/random` прошла 5/5 (`work/stage20-random.log`).
Общий прогон Node 26: 1355 total, 1350 pass, 0 fail, 5 skip
(`work/stage20-regression.log`). ELF с `Math.random` запущен под WSL;
два значения в диапазоне `[0, 1)` различались.

## 2026-09-26: `String.prototype.startsWith` и `endsWith`

Общий путь поиска `includes` расширен двумя методами с их правилами позиции
и неизменным порядком coercion/проверки Symbol.match. Профильный набор
`string-builtins.test.ts` прошёл 10/10. Группы Test262: `startsWith` 19/21,
`endsWith` 25/27; четыре compile failures относятся к RegExp literals,
которые пока не поддержаны (`work/stage21-starts.log`,
`work/stage21-ends.log`).
Общий прогон Node 26: 1358 total, 1353 pass, 0 fail, 5 skip
(`work/stage21-regression.log`).

## 2026-09-26: `String.prototype.charCodeAt` и `codePointAt`

Добавлены generic методы с `ToIntegerOrInfinity`, UTF-16 code units и
декодированием корректной суррогатной пары для `codePointAt`. Исправлено
округление отрицательных дробных позиций к отрицательному нулю. Группа
Test262 `codePointAt` прошла 16/16; `charCodeAt` — 24/25, единственный
непрошедший тест использует исключённый из объёма `eval`
(`work/stage22-codepoint.log`, `work/stage22-charcode2.log`).

## 2026-09-26: `String.prototype.charAt` и `substring`

`charAt` создаёт строку из одного UTF-16 code unit, возвращает пустую строку
за пределами диапазона и сохраняет исходную строку при GC во время
выделения результата. `substring` ограничивает границы длиной строки,
переставляет их по порядку и трактует отсутствующий или явно `undefined`
конечный индекс как длину. Профильный GC stress для динамических строк прошёл.
Группы Test262: `charAt` 29/30 (оставшийся тест использует исключённый `eval`),
`substring` 45/46 (оставшийся тест вызывает исключённый динамический
`Function()`). Отчёты: `work/stage24-charat.log`,
`work/stage24-substring2.log`.
Общий прогон Node 26: 1368 total, 1363 pass, 0 fail, 5 skip
(`work/stage24-regression.log`).
Linux ELF для `substring`, `codePointAt` и `charAt` запущен под WSL;
результат совпал с Node.

## 2026-09-26: `String.prototype.slice`

Метод использует относительные отрицательные индексы и возвращает пустую
строку, если конечная граница не правее начальной. Исправлен случай
отрицательной дроби, которая после `ToIntegerOrInfinity` становится `-0`.
Группа Test262: 37/38; единственный непрошедший случай вызывает
исключённый динамический `Function()` (`work/stage25-slice.log`).
Общий прогон Node 26: 1370 total, 1365 pass, 0 fail, 5 skip
(`work/stage25-regression.log`).

## 2026-09-26: `String.prototype.repeat`

Метод повторяет UTF-16 последовательность после преобразования счётчика,
отбрасывает дробную часть, проверяет отрицательное значение и бесконечность,
ограничивает размер результата доступным диапазоном runtime. Пустая строка
с конечным очень большим счётчиком возвращает пустую строку. Группа Test262
прошла 16/16 (`work/stage26-repeat2.log`); есть профильный GC stress
с преобразованием счётчика после чтения исходной строки.
Общий прогон Node 26: 1374 total, 1369 pass, 0 fail, 5 skip
(`work/stage26-regression.log`).
Linux ELF для `repeat` и `slice` запущен под WSL с ожидаемым Unicode-выводом.

## 2026-09-26: семейство `String.prototype.trim`

`trim`, `trimStart` и `trimEnd` используют общий набор пробельных code points
ES2020 и создают строку из нужного диапазона. `trimLeft` и `trimRight` ссылаются
на те же функции, что `trimStart` и `trimEnd`. Группы Test262: `trim` 128/129
(один тест требует RegExp literal), `trimStart` и `trimEnd` по 23/23
(`work/stage27-trim.log`, `work/stage27-trimstart2.log`,
`work/stage27-trimend.log`). При проверке обнаружена и исправлена ошибка
именования методов/аксессоров с символьным ключом в литерале объекта:
теперь используется тот же путь `methodName`, что и для классов.
Общий прогон Node 26: 1377 total, 1372 pass, 0 fail, 5 skip
(`work/stage27-regression.log`).
Linux ELF для семейства `trim` и алиасов запущен под WSL; Unicode-вывод
совпал с Node.

## 2026-09-26: первый этап генераторов — грамматика

Frontend теперь представляет объявления и выражения `function*`, генераторные
методы в объектах/классах и выражения `yield`/`yield*` в AST. Контекст
генератора не протекает во вложенные обычные функции, стрелки или параметры.
Binder проверяет допустимость `yield`; пока механизм приостановки не готов,
компилятор возвращает явный `E_UNSUPPORTED` вместо внутренней ошибки.
Это подготовка к генераторному runtime, не поддержка выполнения генераторов.
`frontend.test.ts` проверяет форму AST, ошибки контекста и диагностический код.
Общий прогон Node 26: 1381 total, 1376 pass, 0 fail, 5 skip
(`work/stage29-regression.log`). Linux примеры после последних изменений
прошли 46/46 (`work/stage28-linux-compat.log`), smoke Test262 — 45/45
(`work/stage28-smoke.log`).

## 2026-09-26: примитив переключения контекста для генераторов

`rt.switchContext` сохраняет машинный указатель стека, невозвратные регистры
Win64 (включая XMM6–XMM15) и головы цепочек корней GC, обработчиков JS
исключений и cleanup. При возобновлении восстанавливает все эти поля.
Отдельный native PE тест дважды переключает выполнение между обычным и
альтернативным стеком и проверяет сохранение `r12` и трёх runtime-цепочек.
Тот же тест проверяет обе 64-битные половины XMM6 на каждом переходе.
Общий прогон под Node.js 26: 1382 total, 1377 pass, 0 fail, 5 skip
(`work/stage30-regression-node26.log`); после расширения теста XMM6
профильный тест повторно прошёл.
После добавления runtime-фрагмента Linux-совместимые примеры снова прошли
46/46 (`work/stage30-linux-compat.log`).

## 2026-09-26: защищённый стек генератора

`rt.allocGeneratorStack` резервирует и выделяет 1 МиБ памяти, затем делает
нижнюю страницу 4 КиБ недоступной. На Windows используются `VirtualAlloc`,
`VirtualProtect`, `VirtualFree`; Linux shim отображает их на
`mmap`/`mprotect`/`munmap` для этого фиксированного размера. Стек явно
освобождается через `rt.freeGeneratorStack`. Исполняемые PE и ELF тесты
проверили выделение, выравнивание, доступность рабочего диапазона и
освобождение (2/2 при прогретом WSL). Отдельная проверка выхода за границу
не проводилась. Глобальная регрессия под Node.js 26: 1384 total, 1378 pass,
0 fail, 6 skip (`work/stage31-regression-node26.log`); пять Linux-тестов были
пропущены из-за холодного запуска WSL и отдельно перепроверены для стека.
Подключение стека к объекту генератора и трассировка приостановленного кадра
ещё требуются.
Обход цепочки корней GC вынесен в `rt.gcMarkRootChain`, чтобы его можно было
вызвать для сохранённого контекста генератора; нынешний активный стек
использует тот же путь. Профильные GC тесты после изменения прошли 15/15.
После добавления новых системных обёрток Linux-совместимые примеры снова
совпали с Node в 46/46 случаях (`work/stage31-linux-compat.log`).

## 2026-09-26: корни при вложенных переключениях

Контекст теперь сохраняет указатель на цепочку приостановленных вызывающих
контекстов. `rt.collect` проходит их корневые записи через общий
`rt.gcMarkRootChain`, пока внутренний стек активен. PE-тест проверяет
сохранение и восстановление указателя цепочки, 11 GC-тестов и этот PE-тест
прошли вместе (12/12). Это защищает корни вызывающих кадров во время
выполнения вложенного генератора; трассировку кадра уже приостановленного
генератора через сам генераторный объект ещё предстоит добавить.
Общий прогон после этого изменения: 1384 total, 1378 pass, 0 fail, 6 skip
(`work/stage32-regression-node26.log`).
Linux-совместимые примеры после изменения GC снова прошли 46/46
(`work/stage32-linux-compat.log`).

## 2026-09-26: метаданные генераторной функции

IR-операция создания функции и `FunctionIR` теперь несут признак генератора.
Runtime-объект функции имеет отдельное поле для этого признака; backend
помечает такую функцию неконструируемой. Генераторный вызов и объект состояния
ещё не подключены, поэтому компиляция `function*` по-прежнему завершится
явным `E_UNSUPPORTED`. Сборка и 50 профильных frontend/functional тестов прошли.

## 2026-09-26: объект состояния генератора и GC

Внутренний `rt.newGenerator` копирует аргументы в управляемый `ValueList`,
сохраняет исходную функцию и `this`, создаёт объект с местом для native
контекста. Трассировщик отмечает эти значения и корни сохранённого кадра;
при сборке недостижимого генератора освобождает его отдельный стек.
Синтетические исполняемые PE и ELF тесты создают объект, запускают GC,
проверяют копию аргументов и повторно собирают объект (2/2). Методы
`next`/`throw`/`return`, запуск тела и `yield` ещё не подключены, так что
пользовательский `function*` остаётся `E_UNSUPPORTED`.

## 2026-09-26: первый исполняемый поднабор генераторов

`rt.invoke` создаёт объект генератора без запуска тела. Первый `.next()`
переключается на его стек; `yield` сохраняет кадр и возвращает IteratorResult,
а следующий `.next(value)` передаёт значение обратно в выражение `yield`.
Обычный `return` завершает генератор, освобождает стек и сохраняет `done`.
Работают объявления, выражения и генераторные методы; тесты проверяют
отложенный запуск, передачу значения, `this` и выживание локального объекта
при GC stress. Синтетический PE/ELF тест отдельно проверяет два переключения,
копию аргументов и сборку состояния. Linux-примеры после добавления
`generators.cjs` совпали с Node в 47/47 случаях
(`work/stage35-linux-compat.log`).
Пока отсутствуют `yield*`, `.throw()`, `.return()`, `@@iterator`, полная
семантика генераторных прототипов и передача непойманного исключения через
границу стека. Это частичный генераторный runtime.

## 2026-09-26: исключения, закрытие и делегированный `yield*`

Генератор теперь поддерживает `.throw()`, `.return()` и `@@iterator`.
Непойманное исключение проходит через границу отдельного стека; `return`
обходит `catch`, выполняет `finally` и допускает `yield` внутри `finally`.
`yield*` кэширует `next` делегированного итератора, передаёт ему значения
следующих `.next(value)`, пересылает `.throw(value)` и `.return(value)`,
проверяет объектность каждого IteratorResult и использует его итоговое
`value`. При отсутствии `throw` вызывает `return` для закрытия итератора.
При отсутствии `return` завершает внешний генератор через его `finally`.

На Windows пройдены 54/54 положительных smoke-теста Test262, включая четыре
случая `yield*` внутри `for...of`/`try`/`catch`/`finally`. Linux сравнение
47/47 включает вложенный делегированный генератор. Полная семантика
генераторных прототипов и все пограничные случаи Test262 ещё не проверены.

Группа Test262 `built-ins/GeneratorPrototype` теперь проходит 61/61 после
добавления `constructor` и `@@toStringTag`. Для `yield*` исправлена передача
исходного IteratorResult наружу: когда `done` ложно, `value` не читается
раньше времени; первый `next` получает аргумент `undefined`.
`language/expressions/yield` проходит 61/63: оставшиеся тесты требуют `with`
и RegExp. Широкая группа `language/expressions/generators` дала 208/290.
Главный выявленный дефект — default/destructuring параметры исполняются
при первом `.next()`, тогда как спецификация требует их инициализации уже
при вызове функции-генератора. Это следующий этап работы.

## 2026-09-26: инициализация параметров генератора до первого `next`

Вызов функции-генератора теперь запускает её отдельный стек, выполняет
инициализацию параметров и объявлений и приостанавливается перед первым
оператором тела. Исключения из параметров передаются вызывающему коду сразу.
После этого выбор прототипа экземпляра учитывает изменение `g.prototype`
из default-параметра. Собственный `g.prototype` начинается без свойств,
а генераторные методы имеют собственный `prototype`.

Группа Test262 `language/expressions/generators` выросла с 208/290 до
277/290. Все 13 оставшихся случаев используют `eval`, `with` или статические
блоки классов. Статические блоки добавлены после ES2020 и не входят в
согласованный объём. Отдельно исправлено имя статического метода класса `name`
в default-параметрах и различение `arguments` в параметрах и теле.

## 2026-09-26: tagged templates

Добавлены tagged templates с raw/cooked строками, `undefined` для неверного
escape в cooked сегменте, кэшем замороженного template object на место вызова
и сохранением `this` при вызове метода. Обычный шаблон с неверным escape
по-прежнему отвергается. Test262 `language/expressions/template-literal`
прошла 56/57 (оставшийся случай использует `eval`), а
`language/expressions/tagged-template` — 19/27. Из восьми оставшихся tagged
случаев два требуют proper tail calls, остальные используют `eval` или
динамический `Function()`.

Windows regression: 1415 total, 1410 pass, 0 fail, 5 skip. Положительный
smoke-набор Test262: 66/66. Linux совместимые примеры: 48/48.

## 2026-09-26: String.prototype.padStart и padEnd

Добавлены методы заполнения строк с усечением целевой длины, повторением
заполнителя по UTF-16 code units, правильным порядком преобразований и ранним
возвратом без преобразования заполнителя, если расширение не требуется.
Оба набора Test262 прошли 13/13. GC stress проверил сохранение исходной строки
и заполнителя при пользовательских `valueOf` и `toString`.

Windows regression: 1420 total, 1417 pass, 0 fail, 3 skip; два WSL-теста
пропущены во время параллельного запуска. Отдельное Linux сравнение прошло
49/49, положительный smoke-набор Test262 — 68/68.

## 2026-09-26: String indexOf/lastIndexOf и fromCharCode

Добавлены поиск по UTF-16 code units с прямым и обратным направлением,
позициями и generic receiver, а также статический `String.fromCharCode` с
ToUint16 каждого аргумента. Объект результата сохраняется при вызовах
пользовательских преобразований и GC stress. Test262: `indexOf` 43/47;
из оставшихся четырёх случаев один использует пока отсутствующий метод
массива, один — согласованное исключение `eval`, два — BigInt. `lastIndexOf`
24/25, оставшийся случай использует метод массива. `fromCharCode` 16/17,
оставшийся случай требует BigInt.

Windows regression: 1427 total, 1422 pass, 0 fail, 5 skip; четыре Linux-теста
пропущены во время параллельного запуска. Отдельное Linux сравнение прошло
50/50, положительный smoke-набор Test262 — 71/71.

## 2026-09-26: Array.prototype.indexOf и lastIndexOf

Добавлены generic методы поиска с ToLength, преобразованием `fromIndex`,
проверкой HasProperty перед чтением элемента и строгим сравнением. Holes
пропускаются; унаследованные свойства и изменения объекта из getters видны.
Test262 обнаружил и помог исправить граничный случай `lastIndexOf` при
`fromIndex = -Infinity` и при отрицательной позиции за пределами массива.
После исправления `Array.prototype.indexOf` проходит 193/201, `lastIndexOf`
188/198. Остальные случаи используют Date, RegExp, JSON, Proxy, typed arrays,
`eval` или отсутствующий глобальный `isNaN`. Зависимые группы строкового поиска
улучшились до `String.prototype.indexOf` 44/47 и `lastIndexOf` 25/25.

Общий прогон Node 26: 1432 total, 1425 pass, 0 fail, 7 skip (Windows symlink
и шесть WSL-проверок при массовом параллельном запуске). Два специфичных
Linux generator-теста повторно прошли 2/2 отдельно. Совместимые Linux
примеры совпали с Node в 51/51 случаях; smoke Test262 — 73/73.

## 2026-09-26: подготовка v0.3.0

Добавлены глобальные `isNaN` и `isFinite` с ToNumber, metadata, обычными
глобальными дескрипторами и GC roots. Test262: `isFinite` 15/15, `isNaN`
14/15 (оставшийся тест использует пока отсутствующий Array.prototype.forEach).
Зависимая группа `Array.prototype.lastIndexOf` выросла до 189/198.

Релизная ветка основана на `origin/main` v0.2.0. Версия пакета и CLI поднята
до 0.3.0; сохранён документ v0.2. CI sparse checkout расширен всеми каталогами
из smoke manifest. Локальный релизный прогон Node 26: 1437 total, 1430 pass,
0 fail, 7 skip (один Windows symlink и шесть WSL-тестов при массовом запуске).
Совместимые примеры Windows и Linux прошли по 51/51; положительный Test262
smoke — 73/73. Отдельные Linux generator-тесты ранее прошли 2/2.

## 2026-09-26: после v0.3.0 — Array.prototype.forEach

После тега `v0.3.0` работа продолжена в отдельной локальной ветке
`work/es2020-after-v0.3`. Добавлен generic `forEach`: ToObject/ToLength,
проверка callback после чтения длины, снимок начальной длины, HasProperty для
каждого индекса, передача `(value, index, object)` и `thisArg`. Корни GC
сохраняют получатель, callback, аргументы и временные значения при getter и
повторном входе в JavaScript. Целевые Windows native тесты: 24/24; Linux native
тест callback с GC stress прошёл, ещё один ELF smoke был пропущен из-за WSL.

Test262 `built-ins/Array/prototype/forEach`: 178 pass, 12 fail, 0 skip из 190.
Семь ошибок зависят от отсутствующих Date, RegExp, JSON или исключённого
`eval`; четыре используют resizable ArrayBuffer, который появился после ES2020;
один тест с индексом 999999 превысил 30-секундный лимит из-за медленного
обхода большого разреженного массива. Зависимая группа `built-ins/isNaN`
теперь проходит 15/15. Полная семантика массивов и производительность больших
разреженных массивов остаются открытыми.

## 2026-09-26: Array.prototype.some и every

Цикл `forEach` расширен методами `some` и `every` с ToBoolean результата
callback и ранним завершением. Пустой массив возвращает `false` и `true`
соответственно; callback проверяется даже при нулевой длине. Передача
`thisArg`, разреженные массивы, унаследованные индексы, изменения объекта и
GC при повторном входе покрыты native тестами. Windows array suite: 30/30;
Linux native suite: 6 pass, 0 fail, 1 skip из-за недоступной WSL-проверки.

Test262 `built-ins/Array/prototype/some`: 203/219; `every`: 202/218.
В каждой группе 11 случаев требуют Date, RegExp, JSON, `eval` или `parseInt`,
четыре используют resizable ArrayBuffer после ES2020, один с большим
разреженным массивом превышает 30-секундный лимит запуска. В этих группах
не выявлено другого семантического расхождения текущего поднабора.

## 2026-09-26: Array.prototype.find и findIndex

Общий callback-цикл расширен методами `find` и `findIndex`. Они читают каждый
индекс через Get, включая отсутствующие свойства, и возвращают найденное
значение или индекс; при отсутствии совпадения — `undefined` или `-1`.
Windows array suite: 35/35. Test262: обе группы по 17 pass, 6 fail из 23.
Четыре случая в каждой группе требуют resizable ArrayBuffer после ES2020,
один использует отсутствующий `splice`, один содержит RegExp literal,
который компилятор пока не разбирает. Linux native callback и GC проверяются
отдельным тестом в `elf.test.ts`.

## 2026-09-26: Array.prototype.reduce и reduceRight

Добавлены generic левые и правые свёртки с фиксированной начальной длиной,
пропуском holes, поиском первого существующего элемента без initial value,
TypeError для пустого обхода без initial value и передачей callback четырёх
аргументов. Аккумулятор, значение, индекс и объект удерживаются корнями GC
при повторном входе в JavaScript. Windows array suite: 40/40; Linux native
suite: 8 pass, 0 fail, 1 skip из-за WSL-проверки. Test262 для `reduce` и
`reduceRight`: каждая группа 250/260; шесть случаев в каждой требуют Date,
RegExp или JSON, четыре — resizable ArrayBuffer после ES2020.

## 2026-09-26: Array.prototype.fill

Добавлен generic `fill`: ToObject/ToLength, ToIntegerOrInfinity для start/end,
отрицательные и бесконечные границы, явный `end = undefined`, запись в holes
и возврат получателя. Значение удерживается корнем GC через setter callbacks.
Test262 `built-ins/Array/prototype/fill`: 20/22; оставшиеся два теста требуют
буферов или typed arrays, включая resizable ArrayBuffer. Целевые Windows
native тесты: 46/46; Linux native: 9 pass, 1 skip при недоступной WSL-проверке.
Общий прогон на Node 26.10.0: 1469 total, 1457 pass, 0 fail, 12 skip;
положительный smoke Test262 расширен до 81/81 и CI sparse checkout включает
все новые каталоги Array. Пропуски общего прогона: один из-за права на symlink
и 11 WSL-проверок, недоступных во время массового запуска. Отдельный Linux
native прогон выше подтвердил новые методы массива.

## 2026-09-26: Array.prototype.copyWithin

Добавлен generic `copyWithin` с преобразованием target/start/end, снимком
длины, выбором обратного направления при перекрытии диапазонов, HasProperty,
Get, Set и DeletePropertyOrThrow. Отсутствующий исходный индекс удаляет
соответствующий целевой индекс. Windows array suite: 51/51. Test262:
36/39; оставшиеся случаи используют Proxy traps или resizable ArrayBuffer.
Положительный smoke manifest расширен отдельной проверкой holes до 82/82.
Отдельный Linux native suite: 10 pass, 1 skip. Полная регрессия Node 26.10.0:
1475 total, 1462 pass, 0 fail, 13 skip (один symlink и 12 WSL-проверок,
недоступных при параллельном прогоне).

## 2026-09-26: Array.prototype.reverse

Добавлен generic `reverse` с четырьмя ветвями для пары присутствующих или
отсутствующих индексов, чтением/записью и DeletePropertyOrThrow. Test262
обнаружил важный порядок: Get нижнего элемента должен происходить до
HasProperty верхнего, поскольку getter может сократить массив. После
исправления Windows array suite 57/57, Test262 `reverse` 16/18; оставшиеся
два случая требуют Proxy либо resizable ArrayBuffer. Этот сценарий включён
в положительный smoke manifest, который теперь проходит 83/83. Отдельный
Linux native suite: 11 pass, 1 skip. Общая регрессия Node 26.10.0: 1482
total, 1471 pass, 0 fail, 11 skip (один symlink и 10 WSL-проверок).

## 2026-09-26: Array.prototype.shift и unshift

Добавлены generic `shift` и `unshift` с ToLength, переносом sparse и
унаследованных элементов, DeletePropertyOrThrow, обновлением `length` и
GC roots для аргументов и значений при повторном входе через accessors.
`unshift()` с нулём аргументов пропускает перенос элементов: Test262 выявил
тайм-аут на `length = 2^53-1`, после исправления группа проходит 22/22.
Группа `shift` проходит 20/20. Целевые Windows native тесты: 68/68;
отдельный Linux native suite: 13 pass, 1 skip. Положительный Test262 smoke
расширен до 85/85, все его каталоги входят в CI checkout. Общая регрессия
Node 26.10.0: 1495 total, 1486 pass, 0 fail, 9 skip (один symlink и восемь
WSL-проверок при массовом параллельном прогоне).

## 2026-09-26: числовая грамматика строк ES2020

Строковое ToNumber теперь принимает префиксы `0b`/`0B` и `0o`/`0O`;
разбор использует тот же большой целый буфер и точное округление binary64,
что и `0x`. Полная проверка цифр, ведущих нулей, длинных значений, знаков и
пробелов добавлена в `numeric.test.ts`. U+180E удалён из списка пробелов:
этот символ не входит в WhiteSpace ES2020. Целевой набор: 11/11.

## 2026-09-26: parseInt и parseFloat

Добавлены глобальные `parseInt` и `parseFloat` и тождественные им функции
`Number.parseInt` и `Number.parseFloat`. `parseInt` выполняет ToString перед
ToInt32(radix), разбирает основания 2–36 и округляет длинные целые через
общий biguint/binary64 converter. `parseFloat` берёт самый длинный допустимый
десятичный префикс и передаёт его точному числовому разбору. Проверены
отрицательный ноль, Infinity, некорректный экспонентный суффикс, дескрипторы,
побочные эффекты преобразования аргументов и GC stress. Целевой набор:
21/21. Группа Test262 `built-ins/Number`: 151/154; два оставшихся случая
требуют иных возможностей realm/constructors, один — BigInt. Тесты
`Number/parseInt.js` и `Number/parseFloat.js` прошли и добавлены в smoke.
Положительный smoke-набор после этого проходит 87/87. Отдельный Linux native
набор: 20 успешно, 1 пропуск из-за недоступного WSL probe.
Общая регрессия на Node 26.10.0 после обеих функций: 1564 теста,
1561 успешно, 0 ошибок, 3 пропуска из-за ограничений среды.

## 2026-09-26: Array.prototype.concat

Добавлен generic `concat` с `ArraySpeciesCreate`, `Symbol.isConcatSpreadable`,
ToLength для spreadable объектов, сохранением holes и унаследованных элементов.
Результат создаёт собственные свойства и в конце устанавливает `length`;
превышение `2^53-1` вызывает TypeError до обхода большого источника.
Целевые Windows native тесты: 10/10, включая GC stress и побочные эффекты
геттеров. Группа Test262 `concat`: 58/69; 11 случаев требуют отсутствующих
typed arrays, RegExp literal, Proxy и cross-realm. Smoke: 89/89. Отдельный
Linux native набор: 21 успешно, 1 пропуск из-за WSL probe.
Общая регрессия Node 26.10.0: 1575 тестов, 1551 успешно, 0 ошибок,
24 пропуска из-за WSL под параллельной нагрузкой и ограничений среды.

## 2026-09-26: Array.prototype.flat и flatMap

Добавлены generic `flat` и `flatMap` с рекурсивным FlattenIntoArray,
`ArraySpeciesCreate`, унаследованными индексами и пропуском holes. `flatMap`
вызывает mapper с `(element, index, source)` и нужным `thisArg`, а результат
расплющивает ровно на один уровень. Промежуточные значения и массивы
удерживаются через точные GC roots при вложенных вызовах и callbacks.

Целевые Windows native тесты: 10/10, включая GC stress; вся группа
`array-builtins.test.ts`: 139/139. Test262 `flat`: 18/19 (один тест требует
Proxy); `flatMap`: 21/24 (два теста требуют typed arrays, один Proxy).
Положительный smoke-набор: 91/91. Linux native GC stress тест добавлен, но
текущий запуск пропущен из-за недоступного WSL probe.

## 2026-09-26: Array.prototype.toLocaleString

Добавлен generic метод из ECMA-262 без ECMA-402: длина фиксируется до обхода,
для каждого ненулевого элемента вызывается его `toLocaleString` без аргументов,
результат приводится к строке и соединяется запятой. Ресивер, элементы,
методы и промежуточные строки удерживаются через GC roots. Целевые Windows
тесты: 4/4, включая GC stress. Группа Test262: 9/12; три оставшихся теста
зависят от resizable ArrayBuffer и typed arrays, причём resizable buffers
появились после ES2020 и не входят в контракт. Smoke: 92/92.

## 2026-09-26: Array.prototype.sort

Добавлен generic стабильный `sort`: сначала собирает существующие элементы,
включая унаследованные, во внутренний список, затем устойчиво сортирует их
методом вставок. `undefined` идёт после остальных значений, holes удаляются
в хвосте. Компаратор может вызывать JS и GC; default сравнение переводит
значения в строки и сравнивает UTF-16. Отдельные GC roots удерживают список,
компаратор, элементы и результаты преобразований. Метод записывает результат
строгими `Set` и `Delete`, сохраняя ошибки дескрипторов.

Целевые Windows тесты: 9/9, включая GC stress, мутацию в компараторе и
стабильность. Вся группа Array: 152/152. Test262 `sort`: 48/54; два
оставшихся случая требуют BigInt/RegExp literal, четыре — resizable buffers,
которые появились после ES2020. Положительный smoke: 93/93. Linux GC stress
тест добавлен; первый отдельный запуск пропущен из-за недоступности WSL.
Полная регрессия Node.js 26.10.0: 1601 тест, 1585 успешно, 0 ошибок,
16 пропусков из-за ограничений WSL и права на symlink.

## 2026-09-26: Array.prototype[Symbol.unscopables]

Аудит полного набора свойств Array выявил пропущенный объект
`@@unscopables`. Добавлен статический объект с null-прототипом и десятью
ES2020 ключами со значением `true`; дескриптор символьного свойства имеет
`writable: false`, `enumerable: false`, `configurable: true`. Внутренний
порядок ключей и GC roots проверены. Test262: 2/5; остальные три теста
относятся к методам `at`, `findLast` и change-array-by-copy, появившимся
после ES2020. Целевые native тесты: 2/2; вся группа Array: 154/154;
положительный smoke Test262: 94/94.

## 2026-09-26: полный аудит Test262 Array и завершение итераторов

Запущены все 3082 файла `built-ins/Array` закреплённой ревизии Test262:
2632 pass, 360 fail, 90 skip. Этот сырой результат включает API после
ES2020 (`at`, `findLast`, `findLastIndex`, `toReversed`, `toSorted`,
`toSpliced`, `with`, `fromAsync`), resizable buffers и отсутствующие пока
Proxy/Reflect, BigInt, RegExp, Date, JSON, ArrayBuffer/typed arrays и
cross-realm. Пять тестов с sparse Array длиной 1 000 000 достигли лимита
smoke-раннера 30 с; производительность требует отдельной проверки.

Аудит выявил ошибку ES2020: массивный итератор после первого `done: true`
оставался привязанным к исходному массиву, поэтому при последующем `push`
мог снова вернуть значение. При завершении `next` теперь очищает
`[[IteratedObject]]`; повторные вызовы остаются завершёнными. Группы
Test262 `entries`, `keys` и `values` после исправления: по 9/12;
три остальных случая в каждой группе требуют resizable buffers.
Целевой native тест с мутацией массива прошёл; `for-of` и Array регрессия:
197/197. Положительный smoke Test262: 95/95. Отдельная проверка
`Array.of` с nonconstructor function на доступном `Math.pow` прошла;
провал Test262 с `Math.cos` относится к пока отсутствующему Math API.

Пять sparse-тестов Test262 (`every`, `filter`, `forEach`, `map`, `some`)
длиной 1 000 000 ранее достигали лимита 30 секунд. Причина — общий
форматтер binary64 выделял буфер 4096 байт для строкового ключа каждого
индекса. Для целых чисел от 0 до 2^32−1 добавлен путь с буфером точной
длины. Контрольный sparse `map` на 300 000 элементов сократился примерно
с 11 с до 0,2 с, на 600 000 — с 95 с до 0,3 с; все пять Test262 теперь
проходят примерно за 0,4 с каждый. Добавлены регрессии для границ
форматирования и массива длиной 1 000 000. Полная native регрессия после
исправления: 1596 pass, 0 fail, 11 skip из 1607; smoke Test262: 96/96.
Новый совместимый пример для Array и числовых глобальных функций довёл
сверку самостоятельных PE/ELF с Node.js до 52/52 на Windows и Linux.
Полные группы Test262 `built-ins/parseInt` и `built-ins/parseFloat` на
закреплённой ревизии прошли 55/55 и 54/54 соответственно. По одному
представителю каждой группы добавлено в постоянный smoke-набор и CI.

Повторный полный запуск `built-ins/Array` после исправлений: 2640 pass,
352 fail, 90 skip из 3082. Все 90 пропусков относятся к `fromAsync`,
который появился позже ES2020. Все 352 отказа получили пофайловую запись
зависимости в `docs/v0.4-array-deferred.json`: 150 тестов API после ES2020,
72 с resizable buffers, 130 с иными ещё не реализованными предпосылками
или согласованным исключением `eval`. Запись зависимости не утверждает,
что у теста нет других проблем; его нужно повторить после реализации
предпосылки. Алиасы `Number.parseInt` и `Number.parseFloat` прошли
соответствующие Test262; smoke-набор увеличен до 100/100.

Выборочный повторный прогон Linux native после полного Windows набора:
24 pass, 0 fail, 1 skip в `elf.test.js`. Единственный пропуск — проба
доступности WSL; остальные Linux-тесты, включая Array и numeric GC stress,
выполнились. Совместимые программы Windows/Linux — по 52/52.

## 2026-09-26: начало v0.5 — String.fromCodePoint

PR v0.4.0 принят в `main`, тег и GitHub Release опубликованы. Ветка
`work/v0.5.0` создана от merge-коммита v0.4.0. Добавлен
`String.fromCodePoint`: последовательное ToNumber, RangeError для дробных,
NaN и выходящих за диапазон кодовых точек, UTF-16 суррогатные пары.
Буфер строки защищён корнем GC во время пользовательских преобразований.
Целевые native проверки 4/4, полная группа Test262 11/11, smoke 101/101;
совместимые примеры Windows и Linux — по 53/53.

Добавлен `String.raw` с преобразованием шаблона и `raw` в объект,
`ToLength(raw.length)`, последовательным чтением сегментов и подстановок.
Сегменты и результат защищены корнями GC при вызовах getters и `ToString`.
Целевые native проверки 5/5, полная группа Test262 `String/raw` 30/30.
Полный файл String native tests: 50/50; smoke 102/102. Совместимые
примеры Windows и Linux — по 54/54.

Реализован `String.prototype.concat` с generic receiver, последовательным
`ToString` аргументов и корнем GC для накапливаемой строки. Целевые native
проверки 4/4, группа Test262 `String/prototype/concat` 22/22.
Полный файл String native tests: 54/54, smoke 103/103, совместимые
примеры Windows и Linux — по 55/55.

Добавлен `String.prototype.toUpperCase` с фиксированной таблицей 1580
Unicode 17.0 соответствий, с поддержкой расширений и supplementary plane.
Таблица генерируется воспроизводимым скриптом под Node 26 и не зависит от
версии Unicode установленной на машине пользователя. Исходная строка
защищена корнем GC. В группе Test262 24/26; два теста требуют `RegExp` и
прямой `eval`. Native String tests 57/57, smoke 104/104, совместимые
примеры Windows/Linux по 56/56.

`String.prototype.toLowerCase` использует ту же независимую от хоста
таблицу Unicode 17.0. Для контекстной формы греческой сигмы добавлены
таблицы диапазонов Cased и Case_Ignorable, сканирование UTF-16 в обоих
направлениях и правило Final_Sigma. Test262: 28/30, два случая требуют
`RegExp` и `eval`; native String tests 60/60, smoke 105/105,
совместимые примеры Windows/Linux по 57/57.

Реализован `Number.prototype.toFixed` на точной бинарной целочисленной
арифметике: диапазон 0–100, преобразование `digits`, округление половин
от нуля, длинные десятичные дроби и обычный `Number::toString` для
`|x| >= 1e21`. Test262 15/16, оставшийся тест требует BigInt.
Проверены детерминированные binary64 значения с разной точностью,
повторный вход во время преобразования аргумента и стрессовый GC.
Numeric/wrapper native tests 37/37, smoke 106/106, совместимые
примеры Windows/Linux по 58/58.

Добавлены `Number.prototype.toExponential` и `toPrecision`. Общий
форматтер строит точное десятичное значение из binary64, выбирает
значащие цифры и округляет без промежуточных floating-point вычислений.
Вызовы без аргумента используют минимальную длину, совместимую с
`Number::toString`. Полные группы Test262 прошли 15/15 и 17/17;
сравнение с Node на 70 детерминированных binary64 значениях и GC stress
прошли. Numeric/wrapper native tests 41/41, smoke 108/108,
совместимые примеры Windows/Linux по 59/59.

Первый полный прогон `built-ins/Math`: 176/327; выявлены отсутствующие
трансцендентные методы. Начата эта часть v0.5: `Math.sin`, `cos`, `tan`
используют x87 для конечных аргументов. Их группы Test262 прошли
8/8, 9/9 и 9/9; отдельные native проверки охватывают малые конечные
значения, signed zero и GC callback. Для очень больших конечных
аргументов ещё требуется точное сведение угла; эти методы пока частичны.
Smoke 111/111, совместимые примеры Windows/Linux по 60/60.

Добавлены `Math.log`, `log2`, `log10` через x87 `fyl2x` с константами
ln(2) и log10(2). Их группы Test262 прошли 9/9, 5/5 и 5/5;
проверены конечные аргументы с числовым допуском и GC callback.
Math native tests 29/29, smoke 114/114, совместимые примеры
Windows/Linux по 61/61.

Добавлены `Math.exp` и `expm1`. Общий x87 путь вычисляет степень двойки
с сохранением 80-битной промежуточной точности; `expm1` около нуля
использует `f2xm1`, чтобы избежать вычитания близких чисел. Test262:
9/9 и 5/5. Отдельные числовые проверки охватывают переполнение,
значения около нуля и signed zero. Math native tests 32/32,
smoke 116/116, совместимые примеры Windows/Linux по 62/62.

Добавлены `Math.atan` и `atan2` через x87 `fpatan`. Проверены все
квадранты, бесконечности, signed zero и порядок преобразования аргументов
при стрессовом GC. Группы Test262 прошли 7/7 и 11/11. Math native
tests 34/34, smoke 118/118, совместимые примеры Windows/Linux по 63/63.

Добавлен `Math.log1p`: путь x87 `fyl2xp1` сохраняет малые аргументы,
остальные вычисляются через логарифм от 1+x. Проверены signed zero,
область определения, бесконечности и GC callback. Test262 5/5,
Math native tests 36/36, smoke 119/119, совместимые примеры
Windows/Linux по 64/64.

Добавлен `Math.cbrt` через логарифм и экспоненту с отдельной обработкой
нулей, бесконечностей и NaN. Проверены субнормальные и большие конечные
значения с числовым допуском и GC callback. Test262 5/5, Math native
tests 38/38, smoke 120/120, совместимые примеры Windows/Linux по 65/65.

Добавлены `Math.asin` и `acos` через `fpatan` и квадратный корень.
Проверены границы области определения, signed zero, конечные значения
с числовым допуском и GC callback. Test262 9/9 и 8/8, Math native
tests 40/40, smoke 122/122, совместимые примеры Windows/Linux по 66/66.

Добавлены глобальные `encodeURI` и `encodeURIComponent`: UTF-16
проверяется на корректные пары суррогатов, кодовые точки переводятся
в UTF-8 с процентным кодированием, неправильные суррогаты дают URIError.
Группы Test262 прошли по 31/31, native tests 5/5, smoke 124/124,
совместимые примеры Windows/Linux по 67/67.

Добавлены `decodeURI` и `decodeURIComponent` с проверкой UTF-8 на
недопустимые и неполные последовательности, суррогаты, чрезмерно длинные
формы и значения за пределом Unicode. `decodeURI` сохраняет escape-пары
для разделителей. Группы Test262 прошли 55/55 и 56/56, URI native
tests 10/10, smoke 126/126, совместимые примеры Windows/Linux по 68/68.

Общее ядро `Math.log1p` используется в новой `Math.atanh`. Разность
двух log1p сохраняет точность возле нуля; отдельно обработаны границы
области определения и signed zero. Test262 5/5, Math native 42/42,
smoke 127/127, совместимые примеры Windows/Linux по 69/69. Полная
регрессия после URI: 1632 успешных, 27 пропусков, 0 ошибок.

Добавлены `Math.asinh` и `acosh`: возле нуля и единицы вычисление
использует устойчивые формы через `log1p`, для больших аргументов
логарифм плюс ln(2). Test262 5/5 и 7/7; конечные и граничные значения
проверены с числовым допуском и GC callback. Math native 44/44,
smoke 129/129, совместимые примеры Windows/Linux по 70/70.

Добавлены `Math.sinh`, `cosh`, `tanh` через `expm1` около нуля и
масштабированный экспоненциальный путь для больших аргументов.
Проверены signed zero, бесконечности и конечные значения до 711.
Test262 по 5/5, Math native 46/46, smoke 132/132, совместимые
примеры Windows/Linux по 71/71.

Полный повторный прогон `built-ins/Math`: 312/327. Все 15 ошибок
приходятся на более поздние `Math.f16round` и `Math.sumPrecise`.
Результат не доказывает точность трансцендентных функций на всех
конечных входах; в частности, ещё требуется сведение больших углов.

Добавлены `String.prototype.toLocaleLowerCase` и `toLocaleUpperCase`
с Unicode-преобразованием по умолчанию. Test262: 26/28 и 24/26;
остальные четыре теста требуют RegExp или eval. String native 62/62,
smoke 134/134, совместимые примеры Windows/Linux по 72/72.
Локалезависимые варианты ещё требуют отдельной оценки.

Добавлен `String.prototype.split` для строковых разделителей, включая
пустую строку, ограничения длины и пользовательский `Symbol.split`.
Примитивные разделители не читают одноимённый getter на прототипе.
Test262 86/120; 34 оставшихся случая зависят от RegExp, BigInt или
eval. Native tests 7/7 под Node.js 26, smoke 137/137, совместимые
примеры Windows/Linux по 73/73.

Для `Math.sin`, `cos`, `tan` добавлено точное сведение больших углов
через 1152-битную таблицу `2/π` и целочисленное умножение мантиссы.
Проверены граничные значения, Number.MAX_VALUE и 80 воспроизводимых
чисел в диапазоне порядков 63–1022 против Node.js 26. Math native
48/48, совместимые примеры Windows/Linux по 74/74. Полная регрессия
после String.split: 1657 успешных, 17 пропусков, 0 ошибок.

Добавлена строковая ветка `String.prototype.replace`: первая строковая
подстановка, шаблоны $$/$&/$`/$', функция замены и пользовательский
`Symbol.replace`. Test262 24/55, остальные 31 случая требуют RegExp,
BigInt или динамического конструктора функций. Native tests 8/8,
smoke 140/140, совместимые примеры Windows/Linux по 75/75.
