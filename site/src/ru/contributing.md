# Участие в разработке

## Подготовка окружения

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run check            # build and run the unit suite
npm run compare          # compile examples/compat and compare with Node.js
npm run compare:linux    # the same for linux-x64
npm run test262:smoke    # a quick pinned Test262 subset
```

Набор тестов компилирует и запускает настоящие исполняемые файлы: тесты PE работают на Windows, тесты ELF — на Linux, многие под GC stress. CI (`.github/workflows/check.yml`) запускает полный набор и группы Test262 на Windows с Node.js 26 и нативные тесты на Linux. Полные аудиты Test262 описаны на странице [Test262](/ru/reference/test262).

## Процесс работы

- Каждое изменение начинается с issue на GitHub с мотивацией, предложением и критериями приёмки.
- Одна issue — одна ветка (`issue-<number>-<short-slug>`) — один pull request, в описании которого есть `Closes #N`, устройство решения, способ проверки и известные ограничения.
- `main` должен оставаться зелёным: pull request сливается, только когда проходит workflow `check`.
- Issues, pull requests, сообщения коммитов, комментарии в коде и документация пишутся на английском.

## Тесты

Тесты лежат в `tests/*.test.ts`. Предпочитайте `runOnHost` с оракулом Node.js (`runOracle`): тогда один и тот же тест запускается на обеих целях под GC stress и сравнивает вывод программы с Node.js.

## Соглашения о коде

- Компилятор написан на TypeScript (`src/`). Код runtime генерируется как x86-64 через `RuntimeBuilder` (`src/runtime/*.ts`) или пишется как JavaScript-прелюдии (`src/runtime/*-source.ts`), которые компилируются в каждый исполняемый файл.
- Прелюдии не должны добавлять привязки `var` верхнего уровня; оборачивайте код в IIFE.
- Нативные функции runtime следуют ABI Win64 (shadow space, выравнивание 16 байт при вызовах, сохраняемые вызываемой функцией регистры). Функции, которые держат значения между вызовами, способными выделять память, используют `rootedFn`.
- Каждому новому импорту KERNEL32 нужна прослойка на системных вызовах Linux в `src/backend/linux/shims.ts`.
- Сгенерированные исполняемые файлы остаются без внешних зависимостей: без libc, без C-тулчейна, без поставляемых DLL.

## Документация

Когда меняется поведение, видимое программам, обновите:

- `README.md` и `README.ru.md`;
- справочный документ в `docs/` (`host-apis.md`, `process.md`, `fs.md`, `ffi.md`, `windows-executables.md`, `test262.md`) — сайт включает эти файлы автоматически;
- страницы сайта в `site/src/`, описывающие возможность, например [Поддержку языка](/ru/guide/language-support) или [Командную строку](/ru/reference/cli);
- `CHANGELOG.md` в разделе `## Unreleased` со ссылкой на issue.

## Сайт документации

Сайт собирается [VitePress](https://vitepress.dev) из `site/`:

```sh
npm run build              # the compiler, needed to check the samples
cd site
npm ci
npm run dev                # local server with live reload
npm run build              # production build; fails on broken internal links
npm run check:samples      # compiles every program in site/samples
```

Запускаемые примеры — файлы в `site/samples/`, подключаемые через `<<<`; имя, содержащее `.win32.` или `.linux.`, ограничивает пример этой целью. Как добавить страницу, объясняет `site/README.md`. Сайт публикуется на GitHub Pages из `main` workflow `.github/workflows/pages.yml`.

Сайт переведён на несколько языков. Источник — английские страницы; переводы лежат в `site/src/<locale>/`. Когда меняется английская страница, обновите переводы или хотя бы проследите, чтобы они ей не противоречили.

## Автоматические участники

Правила для агентов — захват issues меткой `blocked`, авторство коммитов и чек-лист pull request — описаны в [`AGENTS.md`](https://github.com/40oleg/nona/blob/main/AGENTS.md).
