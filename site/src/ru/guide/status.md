# Статус и планы

## Текущий релиз

**v0.15.0** — см. [список изменений](/changelog) (на английском). Nona — экспериментальный проект: он не проходил аудит безопасности и не заменяет Node.js.

## Аудит Test262

Последний полный аудит закреплённого Test262 на Windows x64 для v0.8.0 (`scripts/test262-audit.ps1 -Unit`, возможности ES2020 и более ранние, а также поддерживаемые более поздние, например элементы классов ES2022):

| Каталог                      | Пройдено / применимо             | Оставшиеся отказы                              |
| ---------------------------- | -------------------------------- | ---------------------------------------------- |
| `language/`                  | **22436 / 22492** (26 пропущено) | 44 `eval`, 1 более новая семантика, 11 прочих  |
| `built-ins/`                 | **15868 / 15933**                | 16 `eval`, 12 более новая семантика, 37 прочих |
| `built-ins/Atomics` (агенты) | **268 / 268**                    | —                                              |
| `annexB/`                    | **996 / 1016** (8 пропущено)     | 20 `eval`                                      |

Классификацию выполняет `scripts/test262-summary.mjs`: тесты «`eval`» вызывают `eval` или `$262.evalScript` с исходным текстом, который Nona не может знать при компиляции; тесты «более новой семантики» проверяют поведение из поздних изданий (флаг `v`, разделители в числах, `Promise.any`, …) под старым или отсутствующим тегом возможности. Модульный набор тестов в CI запускается на Windows и Linux, компилирует и исполняет настоящие файлы PE и ELF, многие — под GC stress. Как запускать аудиты, описано на странице [Test262](/ru/reference/test262).

## Оставшиеся отказы

Это отказы аудита v0.8.0; более поздние релизы полный прогон не повторяли. Все «прочие» отказы на Windows разобраны:

- `built-ins/Function` (26): исходник функции берётся из `toString` объектов во время исполнения — исключение для `eval`.
- `is-a-constructor` для `AsyncFunction`, `AsyncGeneratorFunction` и `GeneratorFunction` и тест `prototype` асинхронной стрелки (4): обвязка Test262 строит исходный текст во время исполнения.
- Другие realms (8): прототипы по умолчанию из другого realm ([#7](https://github.com/40oleg/nona/issues/7), закрыта после аудита).
- Классы, созданные через `Function`, в том числе в другом realm (10, `language/expressions/class`): исходный текст строится во время исполнения. Те же тесты через псевдоним `eval` считаются отказами `eval`.

Аудит v0.8.0 нашёл также семь падений (`Array.prototype.indexOf` на `Math` с элементом, унаследованные и собственные ключи typed arrays), появившихся вместе с плотными элементами; они исправлены в [#119](https://github.com/40oleg/nona/issues/119) и выше учтены как пройденные.

## Открытые задачи

Пробелы языка и библиотеки:

- [#11](https://github.com/40oleg/nona/issues/11) — `eval` и `Function` с исходником, вычисленным во время исполнения.
- [#44](https://github.com/40oleg/nona/issues/44) — реакции Promise: отдельный вид promise и одна запись на каждый `then`.

Производительность — основное направление [плана развития](https://github.com/40oleg/nona/blob/main/docs/roadmap.md):

- Вызовы и выделение памяти: [#47](https://github.com/40oleg/nona/issues/47) (накладные расходы вызова), [#48](https://github.com/40oleg/nona/issues/48) (короткоживущие объекты), [#235](https://github.com/40oleg/nona/issues/235) (инлайнинг), [#236](https://github.com/40oleg/nona/issues/236) (скалярная замена).
- Сгенерированный код: [#237](https://github.com/40oleg/nona/issues/237)–[#242](https://github.com/40oleg/nona/issues/242) (optional chaining, `%`, прямые вызовы, циклы по typed arrays, таблицы переходов `switch`, проверки мёртвой зоны).
- Библиотека: [#155](https://github.com/40oleg/nona/issues/155) (`JSON.stringify`), [#258](https://github.com/40oleg/nona/issues/258) (начальное сканирование RegExp), [#262](https://github.com/40oleg/nona/issues/262) (`shift` и `splice` на больших массивах).

Полный список — на [GitHub](https://github.com/40oleg/nona/issues).

## Подробные отчёты

- [Статус ES2020 для 0.17–0.20](https://github.com/40oleg/nona/blob/main/docs/status.md)
- [История релизов](/changelog) и [журнал разработки](https://github.com/40oleg/nona/blob/main/docs/history/development-log.md)
- [План развития: идеи из блога V8 и целевые архитектуры](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [План релизов 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/history/release-roadmap-0.4-0.20.md)
