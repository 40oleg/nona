# Статус и планы

## Текущий релиз

**v0.7.0** — см. [список изменений](/changelog) (на английском). Nona — экспериментальный проект: он не проходил аудит безопасности и не заменяет Node.js.

## Аудит Test262

Полный закреплённый Test262 на Windows x64 (`scripts/test262-audit.ps1 -Unit`, возможности ES2020 и более ранние):

| Каталог | Пройдено / применимо | Оставшиеся отказы |
| --- | --- | --- |
| `language/` | **17298 / 17337** (26 пропущено) | 30 `eval`, 6 более новая семантика, 3 прочих |
| `built-ins/` | **15491 / 15559** | 16 `eval`, 14 более новая семантика, 38 прочих |
| `built-ins/Atomics` (агенты) | **268 / 268** | — |
| `annexB/` | **996 / 1016** (8 пропущено) | 20 `eval` |

Классификацию выполняет `scripts/test262-summary.mjs`: тесты «`eval`» вызывают `eval` или `$262.evalScript` с исходным текстом, который Nona не может знать при компиляции; тесты «более новой семантики» проверяют поведение из поздних изданий (флаг `v`, разделители в числах, `Promise.any`, …) под старым или отсутствующим тегом возможности. Модульный набор тестов в CI запускается на Windows и Linux, компилирует и исполняет настоящие файлы PE и ELF, многие — под GC stress. Как запускать аудиты, описано на странице [Test262](/ru/reference/test262).

## Оставшиеся отказы

Все «прочие» отказы на Windows разобраны:

- `built-ins/Function` (25): исходник функции берётся из `toString` объектов во время исполнения — исключение для `eval`.
- `is-a-constructor` для `AsyncFunction`, `AsyncGeneratorFunction` и `GeneratorFunction` (4): обвязка Test262 строит исходный текст во время исполнения.
- Другие realms (7): прототипы по умолчанию из другого realm ([#7](https://github.com/40oleg/nona/issues/7)).
- Приватные поля классов на нерасширяемых объектах (2): приватные поля ES2022 без тега более новой возможности.

## Открытые задачи

- [#11](https://github.com/40oleg/nona/issues/11) — `eval` и `Function` с исходником, вычисленным во время исполнения.
- [#7](https://github.com/40oleg/nona/issues/7) — прототипы по умолчанию из других realms для конструкторов из прелюдий.
- [#13](https://github.com/40oleg/nona/issues/13), [#36](https://github.com/40oleg/nona/issues/36) — плотные элементы массивов и хеш-таблицы для `Map`/`Set`.
- [#14](https://github.com/40oleg/nona/issues/14) — производительность движка RegExp.

Полный список — на [GitHub](https://github.com/40oleg/nona/issues).

## Подробные отчёты

- [Статус ES2020 для 0.17–0.20](https://github.com/40oleg/nona/blob/main/docs/v0.17-v0.20-status.md)
- [Статус v0.6](https://github.com/40oleg/nona/blob/main/docs/v0.6-status.md) (на английском)
- [План развития: идеи из блога V8 и целевые архитектуры](https://github.com/40oleg/nona/blob/main/docs/roadmap.md)
- [План релизов 0.4–0.20](https://github.com/40oleg/nona/blob/main/docs/release-roadmap-0.4-0.20.md)
