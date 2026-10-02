# Nona

**Nona — компилятор ahead-of-time, который превращает JavaScript (ES2020 с документированными исключениями) в самостоятельные исполняемые файлы Windows и Linux x64.**

[Документация](https://40oleg.github.io/nona/) (англ.) · [English](README.md) · [Поддержка языка](docs/language-support.md) · [Статус ES2020](docs/v0.17-v0.20-status.md) · [Изменения](CHANGELOG.md) · [Все документы](docs/README.md)

Nona разбирает JavaScript, переводит его в собственное промежуточное представление, генерирует машинный код x86-64 и собирает исполняемый файл PE32+ (Windows) или ELF64 (Linux). Внутри нет Node.js, V8 или интерпретатора, не нужны C/C++-компилятор и LLVM: программы для Windows импортируют только `KERNEL32.dll` (и DLL, которые вы вызываете через FFI), программы для Linux работают через системные вызовы, без libc.

> **Статус:** `v0.7.0`. Полный закреплённый Test262 (возможности ES2020) на Windows x64: language **17298/17337**, built-ins **15491/15559**, Atomics **268/268**, Annex B **996/1016**. Каждый оставшийся отказ разобран в [отчёте](docs/v0.17-v0.20-status.md): `eval` строки, вычисленной во время исполнения, другие realms и семантика новее ES2020. Проект экспериментальный: он не заменяет Node.js и не проходил аудит безопасности.

## Возможности

- **Язык ES2020.** Классы и `super`, генераторы, async-функции и async-генераторы, `for await`, деструктуризация, spread, optional chaining, `??`, BigInt, Symbol, итераторы, proper tail calls, `with` в нестрогом режиме, семантика Annex B.
- **ES-модули.** Статические `import`/`export`, циклы и live bindings, `import.meta`, динамический `import()` модулей, известных при компиляции. Файлы `.mjs` компилируются как модули.
- **Стандартная библиотека ES2020.** Object/Function/Array/String/Number/Math, Date, JSON, RegExp (именованные группы, lookbehind, флаги `s` и `u`, Unicode property escapes), Map/Set/WeakMap/WeakSet, ArrayBuffer, DataView и все typed arrays, SharedArrayBuffer и Atomics (с агентами-потоками), Proxy и Reflect, Promise с очередью jobs.
- **`eval` и `Function` с исходником, известным при компиляции.** Строковый литерал, конкатенация литералов или переменная, которой присваиваются только такие константы, компилируются заранее с полной семантикой прямого и косвенного `eval`. Строка, вычисленная во время исполнения, бросает `EvalError` — это единственное сознательное исключение.
- **Нативный runtime.** Точный немещающий mark-and-sweep сборщик мусора, строки UTF-16, настоящие исключения, перехватываемый `RangeError` при переполнении стека.
- **API хоста** для настоящих программ:
  - цикл событий: `setTimeout`/`setInterval`, `queueMicrotask`, `performance.now()` ([host APIs](docs/host-apis.md));
  - глобальный `process` (`argv`, `env`, `exit`, `exitCode`, `cwd`, `platform`, …) и `node:process` ([process](docs/process.md));
  - синхронные `node:fs`/`nona:fs`, `TextEncoder`/`TextDecoder` ([файловая система](docs/fs.md));
  - вызов экспортов любых DLL на Windows через `nona:ffi`, готовые объявления в `nona:win32` ([FFI](docs/ffi.md)).
- **Исполняемые файлы Windows.** GUI-программы без консоли (`--subsystem windows`), иконка, манифест и сведения о версии в ресурсах ([подробности](docs/windows-executables.md)).

## Как это устроено

```text
исходник JavaScript (скрипт или граф модулей)
      │
      ▼
 лексер → парсер → ранние ошибки и области видимости → eval/Function времени компиляции
                                                              │
                                                              ▼
                                       IR → генерация кода x86-64
                                                              │
                                                              ▼
                     runtime (машинный код + JS-прелюдии) → линковщик PE32+ или ELF64
```

Компилятор написан на TypeScript и запускается в Node.js. Исполняемый файл содержит машинный код программы и runtime Nona: значения, объекты, сборщик мусора, встроенные объекты, очередь jobs и API хоста.

## Требования

- Для компилятора: Node.js 26 или новее и npm, на Windows или Linux.
- Цели: Windows 10/11 x64 (`win32-x64`, по умолчанию) и Linux x86-64 (`linux-x64`).

## Сборка

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
```

Точка входа компилятора — `dist/cli.js`.

## Компиляция программы

```js
// hello.js
function greet(name) {
  return `Hello, ${name}!`;
}

setTimeout(() => console.log(greet("from Nona")), 10);
```

```sh
node dist/cli.js build hello.js -o build/hello.exe                     # Windows
node dist/cli.js build hello.js -o build/hello --target linux-x64      # Linux
```

```text
nona build <input.js> -o <output> [--target win32-x64|linux-x64] [--module]
           [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
           [--version-info version.json]
nona --help | --version
```

Файлы `.mjs` (или с `--module`) компилируются как ES-модули вместе с импортируемыми модулями. Другие программы — в каталоге `examples`, в том числе [матричный калькулятор](docs/matrix-calculator.md).

## Ограничения

- `eval`, `Function`, `GeneratorFunction` и `AsyncFunction` требуют исходного текста, известного при компиляции; вычисленные строки бросают `EvalError` ([контракт](docs/es2020-contract.md)).
- Возможности языка и библиотеки после ES2020 (поля классов, `Promise.any`, `WeakRef`, …) не поддерживаются, кроме отдельных семантик, которые проверяет закреплённый Test262.
- Модули Node.js, кроме встроенных `fs` и `process`, пакеты npm и браузерные API недоступны.
- Ещё не закрыты: прототипы по умолчанию для конструкторов из другой realm, производительность Map/Set на очень больших коллекциях, скорость движка RegExp.
- Цели — только Windows и Linux на x86-64.

Неподдерживаемый синтаксис отклоняется при компиляции. Точное поведение и покрытие тестами — в [матрице поддержки](docs/language-support.md).

## Разработка

```sh
npm run check      # сборка и полный набор unit-тестов
npm run compare    # сборка примеров совместимости и сравнение с Node.js
```

Тесты компилируют и запускают настоящие файлы PE и ELF, многие — под GC stress, и сравнивают вывод с Node.js. Аудит закреплённого Test262 — `scripts/test262-audit.ps1` (Windows) и `scripts/test262-audit.sh` (Linux), см. [Test262](docs/test262.md). Правила работы для людей и агентов — в [AGENTS.md](AGENTS.md).

```text
src/frontend       лексер, парсер, ранние ошибки, области видимости, eval/Function времени компиляции
src/ir             промежуточное представление, lowering, liveness
src/backend/x64    кодирование и генерация кода x86-64
src/backend/pe     линковщик PE32+: импорты, релокации, unwind, ресурсы
src/backend/elf    линковщик ELF64; src/backend/linux — системные вызовы
src/runtime        нативный runtime и JS-прелюдии, встраиваемые в каждый файл
tests              unit-, интеграционные, нативные тесты и тесты совместимости
examples           примеры программ
```

## Безопасность

Аудит безопасности не проводился. Не компилируйте недоверенный код и не считайте сгенерированные программы песочницей: у них те же права, что у любой нативной программы, а через FFI можно вызвать любую DLL.

## Лицензия

[MIT](LICENSE). Сторонние лицензии — в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
