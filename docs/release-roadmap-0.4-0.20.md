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

По указанию пользователя от 2026-09-26 этапы **0.6–0.10** выполняются
последовательно в одной ветке и передаются **одним pull request** после
выполнения gate всех пяти этапов. Промежуточные подтверждения между ними не
требуются. Отдельные релизные PR возобновляются с 0.11.

Начиная с 0.11, после выполнения gate очередной версии подготовить отдельную
релизную ветку, отправить её в GitHub, создать отдельный pull request и
**приостановить работу** до следующего указания пользователя. Незавершённый
релиз не выдавать за готовый. Тег и GitHub Release оформляются при публикации
версии; PR оставляется для просмотра.

Текущий снимок ветки `work/v0.6-v0.10`: `Object.fromEntries` 25/25 Test262;
`Object.assign` 34/38 (оставшиеся 4 зависят от Proxy). Для Date добавлены
конструктор и вызов функции, `now`/`UTC`/`parse`, календарные getter- и
setter-методы, ISO и обычные строковые форматы, `toJSON`, `@@toPrimitive` и
locale-методы с политикой UTC для локального времени. Выбранная группа
`Date.parse` проходит 8/8, `Date.UTC` — 17/17. Полная группа
`Date/prototype` после locale-методов дала 473 pass / 12 fail. Четыре теста
формата требуют RegExp из 0.9, восемь тестов
`toTemporalInstant` относятся к Temporal после ES2020. Последняя полная native
регрессия: 1725 pass / 0 fail / 14 skip из 1739. Группа `Boolean` дала
47 pass / 4 fail: два отказа требуют согласованно исключённые `eval` и
динамический `Function`, два — будущий `Reflect`/cross-realm. Полный разбор
Date, JSON, BigInt,
RegExp и его интеграция со String остаются открытыми. PR для 0.6–0.10 пока
не открывать.
