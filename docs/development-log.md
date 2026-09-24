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
