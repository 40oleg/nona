# Базовый уровень Test262

::: info Перевод
Это перевод английской страницы [Test262 baseline](/reference/test262), созданной из [`docs/test262.md`](https://github.com/40oleg/nona/blob/main/docs/test262.md). Английская версия — основная и может быть новее.
:::

Раннер использует ревизию Test262 из основного репозитория `7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd`. Test262 намеренно не копируется в этот репозиторий. На Windows x64:

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/tc39/test262.git work/test262
git -C work/test262 sparse-checkout set harness test/language/expressions/coalesce test/language/expressions/arrow-function test/language/expressions/array test/language/expressions/call test/language/expressions/new test/language/expressions/template-literal test/language/rest-parameters test/language/statements/function test/language/statements/for-in test/language/statements/for-of test/built-ins/Symbol test/built-ins/Array/prototype/includes test/built-ins/Array/prototype/pop test/built-ins/Math/pow test/built-ins/Math/min test/built-ins/Math/max test/built-ins/Math/abs test/built-ins/Math/sign test/built-ins/Math/sqrt test/built-ins/Math/trunc test/built-ins/Math/floor test/built-ins/Math/ceil test/built-ins/Math/round test/built-ins/String/prototype/includes test/built-ins/Number/isFinite test/built-ins/Number/isInteger test/built-ins/Number/isNaN test/built-ins/Number/isSafeInteger
git -C work/test262 rev-parse HEAD
git -C work/test262 sparse-checkout add test/built-ins/Math/imul test/built-ins/Math/clz32
npm ci
npm run test262:smoke
node scripts/test262-smoke.mjs language/expressions/coalesce
```

Тот же раннер работает и на Linux x64: тогда он компилирует ELF-образы `linux-x64` вместо файлов PE и повторяет запуск при кратковременной гонке `ETXTBSY` при exec, которую на Linux могут вызывать рабочие потоки. Установите `TEST262_DELETE_BINARIES=1`, чтобы удалять каждый скомпилированный тестовый образ после запуска; иначе большие каталоги оставляют в `work/test262-smoke` несколько гигабайт.

Checkout должен быть на закреплённой ревизии. Если HEAD основного репозитория ушёл вперёд, перед запуском выполните fetch/checkout именно этого коммита. `TEST262_ROOT` выбирает другой checkout, а `TEST262_REPORT` — другой путь к JSON-отчёту. `TEST262_JOBS` запускает параллельно до восьми рабочих потоков (по умолчанию один) и сохраняет порядок в отчёте. Например, установите `TEST262_JOBS=4` перед прогоном большого каталога. `TEST262_PATH_FILTER` включает совпадающие пути; `TEST262_EXCLUDE_PATH_FILTER` исключает их. Оба фильтра — буквальные подстроки. Команда без аргументов запускает проверенный манифест `tests/test262-smoke.json`; относительный путь к каталогу в аргументе запускает все файлы `.js` в этой группе Test262. Отчёты различают отказы компиляции, отказы во время исполнения и пропуски.

## Полные аудиты

`scripts/test262-audit.ps1` (Windows) и `scripts/test262-audit.sh` (Linux) запускают каждый каталог Test262 в `language/`, `annexB/` и `built-ins/` с `TEST262_EXCLUDE_FEATURES=post-es2020`, по одному отчёту на каталог в `work/test262-audit` (с возможностью продолжить прерванный прогон). `-Dirs 'a,b' -Tag r1` (PowerShell) или `TAG=r1 scripts/test262-audit.sh <out> a b` повторно запускает выбранные каталоги в подкаталог, результаты которого переопределяют полный прогон. Сводка и классификация:

```
node scripts/test262-summary.mjs work/test262-audit --others work/others.txt
node scripts/test262-summary.mjs work/test262-audit --compare work/previous-audit
```

Сводка относит каждый отказ к `eval` (тест использует eval; при исходниках eval, известных при компиляции, это в основном исходники времени исполнения, `$262.evalScript` или другие realms), `post` (семантика после ES2020 под старым или отсутствующим тегом возможности) или `other` и перечисляет файлы `other` (`--evals <file>` перечисляет файлы eval). `TEST262_FILE_LIST=<file>` ограничивает прогон `scripts/test262-smoke.mjs <group>` перечисленными путями, например чтобы перезапустить такой список. Checkout без метаданных git (например, скопированный на другую машину) принимается, если `work/test262/.nona-test262-revision` содержит хеш закреплённого коммита; тесты разделителей строк тогда читают файлы напрямую.

## Семантика новее ES2020 в закреплённом Test262 {#semantics-newer-than-es2020-in-the-pinned-test262}

Закреплённый Test262 (2026) иногда проверяет поведение, появившееся после ES2020, без тега возможности после ES2020. Политика (issue #17): если более позднее издание лишь убрало наблюдаемую особенность ES2020, от которой программы не зависят, Nona следует закреплённому Test262; всё остальное остаётся как в ES2020 и классифицируется `scripts/test262-summary.mjs` как `post` или перечисляется как известное отклонение. Nona следует Test262 в следующих случаях:

- `[[Set]]`, `[[GetOwnProperty]]` и `[[DefineOwnProperty]]` у TypedArray (ES2021/ES2022): сначала преобразуется значение; затем при недопустимом индексе или отсоединённом буфере запись игнорируется и сообщается об успехе; у отсоединённого буфера нет собственных элементов; если Receiver — не сам TypedArray, недопустимый индекс ни на что не влияет, а допустимый означает OrdinarySet на Receiver.
- `String.prototype.{replace,split,match,matchAll,search}` не ищут методы с ключами-символами у примитивных аргументов (ES2025).
- Цели присваивания в виде выражения вызова из Annex B бросают ReferenceError во время исполнения в нестрогом коде и являются ранними ошибками в строгом коде (веб-реальность ES2022).

Остаются на уровне ES2020 (отказы классифицируются как `post`): поля классов и приватные методы, разделители в числах, логическое присваивание, `Promise.any`/`AggregateError`, `Error.prototype.stack`/`cause`, флаг RegExp `v` и индексы совпадений, `await` верхнего уровня и остальные возможности из `postEs2020Features`. Оставшиеся известные отклонения перечислены по каталогам в `docs/pr5-es2020-remaining-work.md` и в статусе релиза.

Возможности раннера, добавленные для рубежа ES2020 (2026-09):

- `TEST262_TARGET=linux-x64` (по умолчанию на Linux) собирает ELF-образы; тесты модулей (`flags: [module]`) компилируются как граф модулей, а обвязка — как прелюдия классического скрипта; негативные тесты разрешения модулей ожидают ошибку компиляции.
- `TEST262_EXCLUDE_FEATURES=post-es2020` разворачивается в список тегов возможностей, появившихся после ES2020 (см. `postEs2020Features` в скрипте), плюс `error-stack-accessor` и нестандартное расширение `caller`.
- `$262.createRealm` компилируется в программу, когда тест его упоминает (до трёх realms); программы `$262.agent` извлекаются из статических шаблонов (счётчики циклов, константы верхнего уровня и `$262.agent.timeouts` сворачиваются) и компилируются в образ как потоки-агенты. Тесты `CanBlockIsFalse` пропускаются, потому что главный агент может блокироваться.
- Вычисляемые спецификаторы `import()` могут загружать файлы `_FIXTURE.js` теста, названные в его исходнике (`ModuleHost.candidates`).
- Исключение в компиляторе засчитывается как отказ этого файла (`phase: compiler-crash`) вместо остановки прогона.

Это **базовый адаптер**, а не полная обвязка Test262: raw-тесты и негативные тесты времени исполнения сейчас пропускаются с указанием причин. Негативные тесты разбора проходят, когда Nona отклоняет исходник с диагностикой компилятора; адаптер пока не проверяет соответствие типа диагностики. Он запускает позитивные тесты скриптов со стандартной обвязкой `sta.js`/`assert.js` и объявленными `includes`. Прежде чем заявлять о соответствии, адаптер должен поддержать все применимые режимы метаданных и оба варианта, строгий и нестрогий, а затем прогнать все применимые группы. Основным регрессионным рубежом на этом этапе остаются обычные нативные тесты репозитория. Запускайте тесты и оракул на Node 26, как требует `package.json`; Node 22 отличается наблюдаемыми метаданными функций и может падать, когда тест запечатывает свой глобальный объект.

Позитивный runtime smoke-манифест от 2026-09-26 включает случаи параметров по умолчанию и spread; его текущие счётчики записаны в журнале разработки. Более широкие raw-группы на закреплённой ревизии дают 72 pass / 26 fail для `built-ins/Symbol`, 85 pass / 34 fail для `language/statements/for-in` и 142 pass / 607 fail / 2 skip для `language/statements/for-of`. Эти группы содержат случаи за пределами реализованного подмножества и случаи, добавленные после ES2020; raw-счётчики диагностические, это не проценты соответствия ES2020. `built-ins/Array/prototype/includes` даёт 26 pass / 4 fail / 0 skip; падающие случаи используют Proxy или resizable ArrayBuffer. `built-ins/Math/pow` даёт 28 pass / 0 fail / 0 skip после добавления констант Math из ES2020. `built-ins/Math/min` и `built-ins/Math/max` дают по 10 pass / 0 fail / 0 skip, включая преобразование каждого аргумента и порядок знаковых нулей. `built-ins/String/prototype/includes` даёт 25 pass / 2 fail / 0 skip; падающие случаи содержат литералы RegExp, которые пока не поддерживаются. `built-ins/String/prototype/padStart` и `padEnd` дают по 13 pass / 0 fail / 0 skip, включая порядок преобразований и проверки дескрипторов. `built-ins/String/prototype/indexOf` даёт 44 pass / 3 fail / 0 skip; оставшиеся случаи зависят от `eval` или BigInt. `built-ins/String/prototype/lastIndexOf` даёт 25 pass / 0 fail / 0 skip. `built-ins/String/fromCharCode` даёт 16 pass / 1 fail / 0 skip; оставшемуся случаю нужен BigInt. `built-ins/Array/prototype/indexOf` даёт 193 pass / 8 fail / 0 skip, а `lastIndexOf` — 189 pass / 9 fail / 0 skip после добавления глобального `isNaN`. Оставшиеся случаи используют Date, RegExp, JSON, Proxy, resizable-буферы/typed arrays или `eval`. Глобальный `isFinite` даёт 15 pass / 0 fail / 0 skip. Глобальный `isNaN` даёт 14 pass / 1 fail / 0 skip; оставшийся случай использует `Array.prototype.forEach` в теле обвязки теста. `built-ins/Array/prototype/pop` даёт 23 pass / 0 fail / 0 skip после добавления констант Number из ES2020. Четыре группы `Number.isFinite/isInteger/isNaN/isSafeInteger` дают соответственно 8/9/7/10 pass без отказов и пропусков. `language/rest-parameters` даёт 11 pass / 0 fail / 0 skip после деструктуризации параметров и методов классов. После поддержки параметров по умолчанию `language/expressions/arrow-function` даёт 147 pass / 196 fail / 0 skip; все 9 случаев `dflt-params` в этой группе проходят. Со spread в литералах массивов и объектов `language/expressions/array` даёт 50 pass / 2 fail / 0 skip. Двум оставшимся случаям нужны генераторы. Со spread в вызовах и конструировании `language/expressions/call` даёт 72 pass / 20 fail / 0 skip, а `language/expressions/new` — 54 pass / 5 fail / 0 skip. Среди случаев `spread-*` в каждой группе не компилируются только два, потому что им нужны генераторы. Остальные отказы групп связаны с другими неподдерживаемыми возможностями, включая `eval`. Группы `Math.abs/sign/sqrt/trunc/floor/ceil/round` проходят соответственно 8/5/10/12/11/11/11 тестов без отказов и пропусков. Группы `Math.imul` и `Math.clz32` проходят 5/5 и 10/10. После шаблонов привязки массивов и объектов три группы объявлений `language/statements/variable/dstr`, `let/dstr` и `const/dstr` проходят соответственно 79/97, 77/93 и 77/93 случаев. Каждый оставшийся случай не компилируется, потому что использует генераторы или классы. Это выбранные группы Test262, а не процент соответствия ES2020. `language/destructuring/binding/syntax` даёт 12 pass / 2 fail; обоим оставшимся случаям нужен синтаксис генераторов и async. `language/expressions/assignment/dstr` даёт 323 pass / 45 отказов компиляции / 0 отказов во время исполнения; этим отказам компиляции нужны генераторы или классы. Выбранные группы классов `language/statements/class/method` и `method-static` проходят по 20/20. `language/statements/class/definition` даёт 46 pass / 17 отказов компиляции / 2 skip; оставшимся случаям нужен синтаксис за пределами текущего подмножества классов, включая генераторы и async-методы.

2026-09-25 группа `language/expressions/coalesce` дала 21 pass, 3 fail, 0 skip. Одному отказу нужен отсутствующий тип `Symbol`; два проверяют proper tail calls в строгом коде и переполняют нативный стек. Четыре негативных теста разбора прошли за счёт отклонения компилятором. Это отслеживаемые недостающие возможности, а не свидетельство того, что `??` в целом сломан.

2026-09-26 полные закреплённые группы `built-ins/parseInt` и `built-ins/parseFloat` прошли 55/55 и 54/54. Первый полный прогон `built-ins/Array` дал 2632 pass, 360 fail, 90 skip из 3082; все 90 пропусков — тесты `Array.fromAsync` (API после ES2020); он выявил ошибку завершения итератора и пять тайм-аутов на разреженных массивах, которые с тех пор исправлены. Повторный полный прогон Array даёт 2640 pass, 352 fail, 90 skip. Для каждого оставшегося отказа записана предпосылка в [списке отложенного для v0.4](https://github.com/40oleg/nona/blob/main/docs/v0.4-array-deferred.json): 150 случаев API после ES2020, 72 случая resizable-буферов и 130 других будущих зависимостей или документированное исключение для `eval`. Позитивный манифест проходит 100/100.

После v0.4.0 полная группа `built-ins/String/fromCodePoint` проходит 11/11. Один случай оставлен в закреплённом smoke-манифесте; на тот момент манифест проходил 101/101.

Полная группа `built-ins/String/raw` проходит 30/30. Её случай с тегированным шаблоном включён в закреплённый позитивный smoke-манифест. Обновлённый манифест проходит 102/102; совместимые примеры на Windows и Linux проходят по 54/54.

Полная группа `built-ins/String/prototype/concat` проходит 22/22. Один случай включён в позитивный smoke-манифест. Обновлённый манифест проходит 103/103; совместимые примеры на Windows и Linux проходят по 55/55.

Группа `built-ins/String/prototype/toUpperCase` даёт 24 pass / 2 fail / 0 skip. Двум отказам нужны `RegExp` и прямой `eval`, оба отслеживаются за пределами v0.5. Случай специальных правил регистра Unicode входит в позитивный smoke-манифест, теперь 104/104. Совместимые примеры на Windows и Linux проходят по 56/56.

Группа `built-ins/String/prototype/toLowerCase` даёт 28 pass / 2 fail / 0 skip. Её двум отказам тоже нужны `RegExp` и прямой `eval`. Условное отображение конечной сигмы, включая символы `Case_Ignorable`, проходит. Позитивный smoke-манифест — 105/105; совместимые примеры — 57/57 на Windows и Linux.

Полная группа `built-ins/Number/prototype/toFixed` даёт 15 pass / 1 fail / 0 skip. Падающий случай использует BigInt, запланированный на v0.8. Случай точности входит в позитивный smoke-манифест, теперь 106/106; совместимые примеры проходят 58/58 на Windows и Linux.

Полные группы `built-ins/Number/prototype/toExponential` и `built-ins/Number/prototype/toPrecision` проходят 15/15 и 17/17. Их случаи с обычными значениями входят в позитивный smoke-манифест, теперь 108/108. Совместимые примеры проходят 59/59 на Windows и Linux.

Первый полный прогон `built-ins/Math` до добавления тригонометрии дал 176 pass / 151 fail из 327. Большинство отказов — отсутствующие трансцендентные функции ES2020; `f16round` и `sumPrecise` — более поздние API. Полные группы `Math.sin`, `Math.cos` и `Math.tan` теперь проходят 8/8, 9/9 и 9/9. Позитивный smoke — 111/111; совместимые примеры проходят 60/60 на Windows и Linux.

Полные группы `Math.log`, `Math.log2` и `Math.log10` проходят 9/9, 5/5 и 5/5. Позитивный smoke — 114/114; совместимые примеры проходят 61/61 на Windows и Linux.

Полные группы `Math.exp` и `Math.expm1` проходят 9/9 и 5/5. Позитивный smoke — 116/116; совместимые примеры проходят 62/62 на Windows и Linux.

Полные группы `Math.atan` и `Math.atan2` проходят 7/7 и 11/11. Позитивный smoke — 118/118; совместимые примеры проходят 63/63 на Windows и Linux.

Полная группа `Math.log1p` проходит 5/5. Позитивный smoke — 119/119; совместимые примеры проходят 64/64 на Windows и Linux.

Полная группа `Math.cbrt` проходит 5/5. Позитивный smoke — 120/120; совместимые примеры проходят 65/65 на Windows и Linux.

Полные группы `Math.asin` и `Math.acos` проходят 9/9 и 8/8. Позитивный smoke — 122/122; совместимые примеры проходят 66/66 на Windows и Linux.

Полные группы `encodeURI` и `encodeURIComponent` проходят по 31/31. Позитивный smoke — 124/124; совместимые примеры проходят 67/67 на Windows и Linux.

Полные группы `decodeURI` и `decodeURIComponent` проходят 55/55 и 56/56. Позитивный smoke — 126/126; совместимые примеры проходят 68/68 на Windows и Linux.

Полная группа `Math.atanh` проходит 5/5. Позитивный smoke — 127/127; совместимые примеры проходят 69/69 на Windows и Linux. Полный прогон нативных тестов после работы над URI дал 1632 прохождения, 27 пропусков и ноль отказов.

Полные группы `Math.asinh` и `Math.acosh` проходят 5/5 и 7/7. Позитивный smoke — 129/129; совместимые примеры проходят 70/70 на Windows и Linux.

Полные группы `Math.sinh`, `Math.cosh` и `Math.tanh` проходят по 5/5. Позитивный smoke — 132/132; совместимые примеры проходят 71/71 на Windows и Linux.

Полный прогон `built-ins/Math` теперь даёт 312 прохождений и 15 отказов из 327. Все 15 отказов касаются `Math.f16round` и `Math.sumPrecise`, которые появились позже ES2020. Этот прогон не измеряет точность трансцендентных функций для произвольных конечных входов. Редукция больших углов для `sin`, `cos` и `tan` добавлена после этого прогона и проверена по Node.js 26 на всех двоичных порядках.

`String.prototype.toLocaleLowerCase` и `toLocaleUpperCase` проходят 26/28 и 24/26. Четырём оставшимся тестам нужны RegExp или eval. Позитивный smoke — 134/134; совместимые примеры проходят 72/72 на Windows и Linux. Отображения, зависящие от локали, сверх стандартного отображения Unicode ещё предстоит оценить.

`String.prototype.split` проходит 86/120 случаев Test262. Оставшимся 34 нужны RegExp, BigInt или eval. Проверены строковые разделители, ограничения, примитивные разделители и собственные хуки `Symbol.split`. Позитивный smoke — 137/137; совместимые примеры проходят 73/73 на Windows и Linux.

`Math.sin`, `Math.cos` и `Math.tan` для больших углов теперь используют таблицу `2/pi` с фиксированной точкой на 1152 бита. Нативные тесты проходят 48/48, включая 80 детерминированных конечных значений на порядках 63–1022. Совместимые примеры проходят 74/74 на Windows и Linux.

`String.prototype.replace` проходит 24/55 случаев Test262. Оставшимся 31 нужны RegExp, BigInt или динамическое создание функций. Покрыты поиск по строке, функциональная замена, шаблоны замены и собственный `Symbol.replace`. Позитивный smoke — 140/140; совместимые примеры проходят 75/75 на Windows и Linux.
