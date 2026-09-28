# План Nona 0.4–0.20: согласованный объём ES2020

Дата плана: 2026-09-26. База: опубликованный v0.3.0 и локальная ветка
`work/es2020-after-v0.3`. Цель — [контракт ES2020](es2020-contract.md):
ECMA-262, редакция 11, самостоятельные Windows x64 PE и Linux x64 ELF.
`eval` и динамические конструкторы функций остаются согласованными исключениями;
ECMA-402, браузерные и Node.js API не входят в этот контракт.

Номера обозначают **порядок работ и критерии релиза**, а не обещанные даты.
Если Test262 обнаружит зависимость от более поздней версии, она фиксируется в
журнале и закрывается вместе с этой зависимостью. Нельзя объявлять версию
готовой по одним выбранным smoke-тестам. Оценка оставшейся работы на момент
плана: приблизительно 500–1000 часов активной работы агента, с высокой
неопределённостью в RegExp, Proxy, async и модулях.

| Версия | Объём | Проверка перед релизом |
| --- | --- | --- |
| **0.4** | Завершить методы Array по ES2020: уже добавленные после 0.3 `forEach`/`some`/`every`/`find`/`findIndex`/`reduce`/`reduceRight`/`fill`/`copyWithin`/`reverse`/`shift`/`unshift`/`map`/`filter`/`slice`/`splice`/`concat`, `Array.of`/`Array.from`, species; доделать `flat`, `flatMap`, `sort`, `toLocaleString` и оставшиеся дескрипторы/крайние случаи. Включить уже реализованные глобальные `parseInt`/`parseFloat` и алиасы Number. | Полные применимые группы Test262 Array и глобальных числовых функций на Windows/Linux; holes, species, callbacks и GC stress. Все случаи, зависящие от будущих Proxy/RegExp/typed arrays, явно перенести в соответствующие версии. |
| **0.5** | Независимые от RegExp методы String/Number/Math и глобальные функции: `String.fromCodePoint`/`raw`, UTF-16/Unicode методы, методы форматирования Number, недостающие функции Math, URI encode/decode, свойства и дескрипторы. | Test262 по каждой семье; Unicode, округление, URI errors, побочные эффекты преобразования и GC. RegExp-интеграция отложена до 0.10. |
| **0.6** | Закрыть Object, Function, Boolean, Symbol, arguments и Error family: `Object.fromEntries`, reflection/дескрипторы/порядок ключей, прототипы, callable/constructable и приведение типов, well-known symbols, остающиеся методы и metadata. | Соответствующие Test262 группы, инварианты внутренних операций, строгий и нестрогий режимы, повторный вход через getters и GC. Случаи Proxy закрыть в 0.15. |
| **0.7** | Date и JSON целиком по ECMA-262: календарная арифметика и парсинг, UTC/локальное время и host policy, `JSON.parse`/`stringify`, reviver/replacer, циклы, `toJSON`, порядок ключей. | Группы Test262 Date/JSON и контролируемое время/таймзона на Windows и Linux; исключения и GC. |
| **0.8** | JS BigInt: литералы, тип значений, операторы/сравнения/приведения, `BigInt`, `asIntN`/`asUintN`, методы прототипа и взаимодействие с Number/Boolean/String/JSON. | Группы BigInt и числовые границы; большие значения, смешанные операторы, исключения, GC. BigInt typed arrays — в 0.11. |
| **0.9** | RegExp literal и constructor, ES2020 грамматика/flags, Unicode и property escapes, named captures/lookbehind, движок сопоставления и `lastIndex`. | Группы Test262 RegExp syntax/exec и Unicode; ограничение времени и памяти на патологических шаблонах. |
| **0.10** | Интеграция RegExp со String: `match`, `matchAll`, `replace`, `search`, `split`, Symbol hooks, replacement patterns и итераторы; завершить зависимые String API. | Группы RegExp/String и Test262 `@@match`/`@@replace`/`@@search`/`@@split`/`@@matchAll`, side effects, Unicode и GC. |
| **0.11** | ArrayBuffer, DataView, все ES2020 typed arrays (включая BigInt variants), views, byte order, bounds, species, методы и итераторы. | Группы Test262 buffers/typed arrays, detachment, переполнение, GC; Windows/Linux native. |
| **0.12** | SharedArrayBuffer и Atomics: shared backing storage, атомарные операции, `wait`/`notify`, модель агентов и host-поведение. | Test262 Atomics/SharedArrayBuffer и многопоточные native тесты с явной моделью агента на обеих ОС. |
| **0.13** | Map и Set: порядок вставки, SameValueZero, итераторы, mutation во время обхода, constructors и методы прототипов. | Полные группы Map/Set, GC и callback mutation. |
| **0.14** | WeakMap и WeakSet: ключи, слабая достижимость, ephemeron/fixpoint в GC, constructor и методы. | Группы WeakMap/WeakSet, тесты сборки циклов и недостижимых ключей на Windows/Linux. |
| **0.15** | Reflect и Proxy: все traps, внутренние методы объектов, invariants, revocation, функции/конструкторы, массивы и взаимодействие со всеми ранее созданными объектами. | Все применимые группы Proxy/Reflect плюс повтор ранее отложенных тестов Array/Object/RegExp/typed arrays; abrupt completion и GC. |
| **0.16** | Promise, thenable assimilation, reactions, microtask/job queue, combinators ES2020 (`all`, `allSettled`, `race`, `any` **не входит** в ES2020), rejection policy и host loop. | Группы Test262 Promise, порядок jobs, thenable cycles, GC и проверка завершения standalone процесса. |
| **0.17** | Async functions/arrows/methods, `await`, async generators, async iterators, `for await...of`, AsyncFunction/AsyncGenerator families и IteratorClose. | Test262 async language/runtime, порядок jobs, abrupt completion, yield/return/throw, Windows/Linux GC stress. |
| **0.18** | ES-модули: parse/early errors, import/export, linking, cycles, live bindings, top-level script/module distinction, `import.meta`, dynamic `import()`; документировать CLI resolver и загрузку файлов. Top-level `await` не входит в ES2020. | Многофайловые графы, Test262 module cases, циклы и ошибки связывания/выполнения на обеих ОС. |
| **0.19** | Закрыть семантику языка: лексика/Unicode/ASI/early errors, области видимости, `with` в sloppy scripts, statements и ссылки, strict/sloppy, классы/`super`/`new.target`, генераторы, параметры/destructuring/spread, Annex B и proper tail calls. Для исключённых `eval`/динамических Function задать и проверить точное поведение синтаксиса/reflection. | Полные применимые группы Test262 language/Annex B, сценарии `with`, ограниченная глубина native стека при tail calls, повторный вход и GC. |
| **0.20** | Итоговая интеграция ECMA-262 ES2020: все конструкторы, методы, свойства и дескрипторы, кросс-зависимости, GC/liveness, Windows PE и Linux ELF/SysV, CLI/API, CI и документация. Закрыть все обнаруженные пропуски предыдущих версий. | Полный закреплённый Test262 с отчётом pass/fail/skip и объяснением каждого исключения; совместимые standalone примеры на Windows/Linux; стресс-проверки GC/ошибок/памяти; выпускать только как «ES2020 с документированными исключениями», если `eval` и dynamic Function по-прежнему исключены. |

## Общий gate для каждой версии

1. Реализация и metadata/дескрипторы соответствуют ECMA-262 2020, включая
   порядок побочных эффектов и исключения.
2. Проверки включают Windows и Linux native исполнение, GC stress и тесты
   повторного входа для новых ссылок на heap.
3. Test262 запускается на закреплённой ревизии; числа pass/fail/skip и причины
   незакрытых случаев записываются. Зависимости из будущих версий не считаются
   успешным завершением всего контракта.
4. Обновляются [матрица поддержки](language-support.md), журнал разработки,
   README, статус релиза и патч/история изменений.

Текущая работа находится в **0.4**. На 2026-09-26 `concat` уже зафиксирован
коммитом `85988d0`; `flat`/`flatMap` реализованы и проходят целевые проверки.
`toLocaleString` проходит целевые Windows проверки и применимые Test262.
`sort` реализован и проходит 48/54 Test262, оставшиеся случаи требуют
возможностей более поздних релизов. Аудит добавил
`Array.prototype[Symbol.unscopables]`. Локальная проверка gate 0.4 завершена;
результаты собраны в [отчёте v0.4](v0.4-status.md). Следующий шаг — отдельный
PR и проверка GitHub CI, после которой работа приостанавливается.

Дополнительный аудит охватил 3082 теста группы `built-ins/Array`: исходно
2632 pass, 360 fail, 90 skip. Из отказов исправлены завершение итераторов
`entries`/`keys`/`values` при последующем росте массива и пять случаев с
миллионным sparse Array, которые ранее достигали лимита времени. Остальные
отказы получили пофайловую классификацию: среди них API после ES2020,
ResizableArrayBuffer, Proxy, Date, RegExp, typed arrays и cross-realm.
Локальная полная native регрессия: 1596 pass, 0 fail, 11 skip из 1607;
Test262 smoke: 100/100. Совместимые примеры Windows и Linux: по 52/52.
Группы глобальных `parseInt` и `parseFloat` закрыты: 55/55 и 54/54
Test262. Повторный полный прогон Array: 2640 pass, 352 fail, 90 skip;
все отказы перечислены с зависимостями в `v0.4-array-deferred.json`.

## Передача каждого готового релиза

По указанию пользователя от 2026-09-27 объём расширен до **0.6–0.14**.
Все девять этапов выполняются последовательно в одной ветке без промежуточных
релизов и подтверждений. Результат передаётся **одним pull request** после
выполнения gate всего объёма. Отдельные релизные PR возобновляются с 0.15.

Начиная с 0.15, после выполнения gate очередной версии подготовить отдельную
релизную ветку, отправить её в GitHub, создать отдельный pull request и
**приостановить работу** до следующего указания пользователя. Незавершённый
релиз не выдавать за готовый. Тег и GitHub Release оформляются при публикации
версии; PR оставляется для просмотра.

Текущий снимок ветки `work/v0.6-v0.14`: `Object.fromEntries` 25/25 Test262;
`Object.assign` 34/38 (оставшиеся 4 зависят от Proxy). Для Date добавлены
конструктор и вызов функции, `now`/`UTC`/`parse`, календарные getter- и
setter-методы, ISO и обычные строковые форматы, `toJSON`, `@@toPrimitive` и
locale-методы с политикой UTC для локального времени. Выбранная группа
`Date.parse` проходит 8/8, `Date.UTC` — 17/17. Полная группа
`Date/prototype` после locale-методов дала 473 pass / 12 fail. Четыре теста
формата, тогда требовавшие RegExp из 0.9, теперь повторно прошли; восемь тестов
`toTemporalInstant` относятся к Temporal после ES2020. Последняя Windows native-регрессия: 1772 pass / 0 fail / 1 skip из 1773 (тесты Linux исключены). Группа `Boolean` дала
47 pass / 4 fail: два отказа требуют согласованно исключённые `eval` и
динамический `Function`, два — будущий `Reflect`/cross-realm. Группа `Error`
дала 41 pass / 52 fail: 50 отказов относятся к появившимся после ES2020
`cause`, `isError` и `stack`, два требуют `Reflect`/cross-realm; один из них
также использует исключённый динамический `Function`. Группа `Symbol` дала
73 pass / 25 fail: 17 тестов требуют cross-realm, 6 касаются `dispose` и
`asyncDispose` после ES2020 (две группы пересекаются); остальные четыре
требуют `Reflect`, `Proxy`, коллекции/RegExp или классы. Группа `Function`
дала 249 pass / 260 fail; среди отказов есть тесты
динамического `Function`, RegExp в harness для `toString`, классов и async.
Пофайловая классификация этой группы ещё не завершена. Группа
`Object/prototype` дала 165 pass / 83 fail: 54 отказа относятся к
методам Annex B `__defineGetter__`/`__defineSetter__`/`__lookupGetter__`/
`__lookupSetter__`, запланированным на 0.19; остальные в основном требуют
Proxy/Reflect, BigInt, RegExp, коллекции или более поздние Iterator Helpers.
`Object.getOwnPropertySymbols` дал 8 pass / 4 fail; все четыре отказа требуют
инвариантов Proxy из 0.15. `Object.is` прошёл 21/21;
`Object.setPrototypeOf` — 10/12, оставшиеся тесты требуют BigInt и Proxy.
Повторный срез 28.09.2026 после Proxy и BigInt: `Object/prototype` вырос с
180/248 до **185/248** после указанных ниже исправлений;
54 отказа связаны с методами Annex B. Исправлены `isPrototypeOf` с ловушкой
`getPrototypeOf` (10/10) и `toString` для Proxy и примитивов с нестандартным
`@@toStringTag` (32/41). Остальные случаи `toString` зависят от динамического
`Function`, async или Iterator Helpers после ES2020.
Отдельная локальная проверка подтвердила, что вложенный callable Proxy без
строкового `@@toStringTag` получает `[object Function]`; полный файл Test262
`proxy-function.js` пока не компилируется из-за других видов функций в нём.
Локальный сценарий `isPrototypeOf` через Proxy с принудительным GC добавлен в
Proxy suite. Для него требуется полный `compileToIR`, который включает Proxy
bootstrap; упрощённый путь прямого вызова frontend/IR не эквивалентен ему.
Date и BigInt существенно расширены, но общий gate ES2020 ещё открыт. RegExp, его интеграция со String, буферы и Agent model для Atomics остаются частичными. Полные каталоги Map/Set проверены; WeakMap/WeakSet реализованы с ephemeron GC и проверкой освобождения памяти. Текущие результаты описаны в статусах 0.9–0.14. PR для 0.6–0.14 пока не открывать.

Повторная проверка 28.09.2026 после реализации Proxy/Reflect: закреплённый Test262 `Object.assign` — **38/38**, `Object.getOwnPropertySymbols` — **12/12**, `Object.setPrototypeOf` — **12/12**. Каталог `Symbol` вырос с 73/98 до **77/98**; оставшийся 21 отказ относится к cross-realm или к `dispose`/`asyncDispose` после ES2020. Это закрывает ранее отложенные зависимости этих групп, но не общий gate 0.6–0.16.

Общий native `IsArray` теперь разворачивает вложенные Proxy и проверяет отзыв. Test262 `Array.isArray` — **29/29**, `Array.prototype.concat` — **67/69** (два оставшихся требуют cross-realm), `flat` — **19/19**, `flatMap` — **24/24**. GC stress тест Proxy-массивов и Linux native compatibility **81/81** прошли. Общий gate ES2020 остаётся открытым.

Повторная проверка ранее отложенных зависимостей BigInt/RegExp: Test262 `Array.prototype.sort` — **50/54** (четыре resizable-buffer теста после ES2020), `Array.prototype.toLocaleString` — **9/12** (три resizable-buffer теста после ES2020). `String.fromCharCode` — **17/17**, `String.prototype.indexOf` — **46/47**, `toUpperCase` — **25/26**, `toLowerCase` — **29/30**; по одному оставшемуся тесту в последних трёх группах использует исключённый `eval`. Эти выборки не заменяют полный gate String/Array.

### Промежуточная проверка 0.7 (2026-09-27)

Добавлены `JSON.parse` с рекурсивным разбором и reviver, а также
`JSON.stringify` для примитивов, объектов и массивов, `toJSON`, replacer-функции
и списка ключей, отступов, циклов и объектов-обёрток. Выбранная группа
Test262 `JSON.parse` проходит 63/77; оставшиеся тесты используют Proxy либо
`json-parse-with-source` после ES2020. Группа `JSON.stringify` проходит
55/66 после исправления порядка `BigInt.prototype.toJSON`, replacer и
распаковки BigInt-обёртки. Десять оставшихся тестов требуют Proxy, один —
cross-realm. Четыре прежних format теста Date, зависевших от RegExp, повторно
прошли **4/4**; в предыдущем полном каталоге Date.prototype остальные восемь
отказов требовали Temporal после ES2020. Эти результаты касаются выбранных
тестов и не заменяют полный gate 0.7.

### Промежуточная проверка 0.13 (2026-09-27)

Native `Map` и `Set` включают iterable-конструкторы, методы и итераторы,
SameValueZero, порядок вставки и трассировку GC. Windows и Linux native
сценарии с GC stress прошли. Полные каталоги Test262: Map **164/204**,
Set **229/383**; отказы требуют функций после ES2020, Reflect/cross-realm
или WeakRef. Детали в `v0.13-collections-status.md`. Этап 0.12 с агентами
остаётся открытым.

### Дополнительный аудит Function.prototype (2026-09-27)

Каталог Test262 `Function.prototype.bind` дал **94/100**: шесть отказов требуют `Reflect.construct` и/или cross-realm. Каталог `Function.prototype.apply` дал **19/48**: из 29 отказов 26 используют исключённые динамический `Function` или `eval` (часть совместно с другими зависимостями), два требуют cross-realm, один — resizable ArrayBuffer после ES2020. Применимые независимые проверки обеих групп прошли. Общий gate 0.6 остаётся открытым до повтора после 0.15 и аудита остальных групп.
Дополнительный полный каталог `Function.prototype.call`: **22/49**. Все 27 отказов используют исключённый динамический конструктор `Function` (включая `new Function`); остальные тесты прошли. Повтор после реализации смежных этапов остаётся открытым.
Полный каталог `Function.prototype.toString` до корректировки Test262 line endings дал **35/80**. Git checkout на Windows переписывал LF в CRLF в тесте исходного текста; runner теперь читает исходный blob из закреплённой ревизии для трёх тестов line-terminator-normalisation, и они прошли **3/3**. Повтор каталога: **36/80**. Среди оставшихся отказов есть действительный пробел ES2020: функции RegExp `Symbol.match` и getter `Symbol.species`, реализованные в JS-прелюдии, пока показывают исходный текст вместо допустимой NativeFunction-формы. Остальные в основном зависят от классов, async, Proxy/Reflect, динамического Function и генераторов следующих этапов. Этап 0.6 остаётся открытым.
Исправлен применимый отказ `symbol-named-builtins.js`: функция `RegExp.prototype[Symbol.match]` и getter `RegExp[Symbol.species]`, созданные прелюдией, теперь получают NativeFunction-представление через внутреннюю операцию до запуска пользовательского кода. Операция удаляется из `Function.prototype` после bootstrap. Каталог `Function.prototype.toString` вырос до **37/80**; целевой Test262 и регрессии метаданных/RegExp прошли. Остальные 43 отказа ещё требуют классификации и закрытия на этапах классов, async, Proxy/Reflect, генераторов либо исключённого динамического Function.
Повторный каталог `Function.prototype[Symbol.hasInstance]` после Proxy: **11/11**. Ранее отложенный `value-get-prototype-of-err.js` теперь проходит.

28.09.2026: прозрачная пересылка Proxy к Promise проверяет executor до
`newTarget.prototype`, включая вложенные и bound конструкции. GC stress
регрессия для `Reflect.construct` и прямого `new` сверена с Node.js 26;
Proxy с собственной ловушкой `construct` проверяется отдельно. Gate 0.16
остаётся открытым по причинам, перечисленным в статусе Promise.

Повторный аудит после интеграции Proxy/Reflect: полный Test262 `Reflect`
**152/153** (оставшийся файл использует исключённый динамический `Function`),
`BigInt` **76/77** (оставшийся cross-realm),
`Proxy/getOwnPropertyDescriptor` **19/21** (оба оставшихся cross-realm).
Эти срезы не означают прохождения общего gate 0.6–0.16.

`Function.prototype.toString` возвращает NativeFunction-представление для
вызываемого Proxy; для невызываемого Proxy сохраняется TypeError. Повторный
каталог вырос с 38/80 до **44/80**. Оставшиеся файлы в основном требуют
async, классы/приватные методы или исключённый динамический `Function`.

Полный рекурсивный каталог Test262 `built-ins/Promise` с async-режимом:
**530/732**. Из 202 отказов 196 требуют API после ES2020, пять используют
исключённый `eval`, один — cross-realm. Детали в статусе 0.16.

Полный рекурсивный каталог `built-ins/Proxy`: **263 pass / 47 fail / 1 skip**
из 311. Среди отказов 37 cross-realm, девять `with`, один исключённый `eval`;
пропуск требует модули. Детали в статусе 0.15.

Исправлены границы исходного текста статических методов и всего класса при
явном конструкторе. `Function.prototype.toString` вырос с 44/80 до
**52/80**; оставшиеся случаи требуют async, приватные методы, динамические
конструкторы функций или полный обход отсутствующих intrinsics.

Повторный Unicode property gate RegExp остановлен после 65/469 файлов:
27 прошли, 38 достигли тайм-аута 180 секунд, семантических отказов пока нет.
Проблема производительности остаётся открытой; детали в статусе 0.9.

После этого `Function.prototype.apply` получил проверяемый быстрый путь для
плотных массивов: `ASCII.js` прошёл за 14,4 секунды, ранее истекавший по
тайм-ауту `General_Category_-_Uppercase_Letter.js` — за 63,6 секунды.
Полный Unicode gate требуется повторить на этой версии.

Аудит Date и JSON после интеграции Proxy: прямые Test262 `built-ins/Date`
**75/78** (три оставшихся требуют cross-realm). `Reflect.construct(Date, …,
newTarget)` теперь использует `%Date.prototype%`, если `newTarget.prototype`
не является объектом; `subclassing.js` прошёл. Рекурсивный каталог
`built-ins/JSON` вырос с **134/165** до **142/165** после подключения
`IsArray` к reviver, replacer и сериализации Proxy-массивов. Из 23
оставшихся отказов 16 относятся к `rawJSON`/`isRawJSON`, пять к контексту
`source` для `JSON.parse` (оба API новее ES2020), два требуют cross-realm.
Локальный JSON набор 21/21 и адресные Proxy/Date регрессии прошли.
Новый Linux ELF пример Date/JSON/Proxy проходит; общая native
совместимость с Node.js — **83/83**. JSON Proxy traversal также прошёл
под принудительным GC, включая объект `length` с выделениями в `valueOf`.
Сводный локальный прогон шести групп дал 117/122: пять отказов оказались
ожидаемыми значениями, вычисленными системным Node.js 22 для setter'ов Date
при исходном `NaN` и побочном эффекте в `valueOf`. Закреплённый Test262 и
Node.js 26 требуют чтения исходного времени до преобразования; Nona уже
выполняет это правило. Ожидаемые значения зафиксированы явно, затем все
пять адресных тестов прошли. Отдельная проверка `Reflect.construct(Date,
…, Proxy(newTarget))` подтвердила один вызов getter `prototype`.
