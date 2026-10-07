# Nona

**Nona — компилятор ahead-of-time, который превращает JavaScript (ES2020 с документированными исключениями) в небольшие самостоятельные исполняемые файлы для Windows, Linux, macOS, FreeBSD и OpenBSD.**

[Документация](https://40oleg.github.io/nona/) (англ.) · [Песочница](https://40oleg.github.io/nona/playground) · [Релизы](https://github.com/40oleg/nona/releases) · [English](README.md) · [Поддержка языка](docs/language-support.md) · [Производительность](PERFORMANCE.md) (англ.) · [Изменения](CHANGELOG.md) · [Все документы](docs/README.md)

```sh
$ nona build hello.js -o hello
$ ./hello
Hello, from Nona!
```

В исполняемом файле только машинный код вашей программы и среда выполнения Nona. Внутри нет Node.js, V8 или интерпретатора, а для сборки не нужны C/C++-компилятор и LLVM.

> **Статус:** `v0.10.0`, экспериментальный. По аудиту v0.8.0 закреплённый Test262 (возможности ES2020 и поддержанные более поздние, например элементы классов ES2022) на Windows x64: language **22436/22492**, built-ins **15868/15933**, Atomics **268/268**, Annex B **996/1016**. Каждый оставшийся отказ разобран на [странице статуса](https://40oleg.github.io/nona/guide/status). Nona не заменяет Node.js и не проходила аудит безопасности.

## Зачем Nona

- **Маленькие и быстро стартуют.** Hello world весит около 2,2 МБ: движок RegExp, таблицы Unicode и библиотеки вроде `Proxy`, таймеров или `process` попадают в файл, только если программа может до них дойти. Запуск занимает около 2 мс, пик памяти около 11 МБ (у Node.js 28 мс и 45 МБ; замер на v0.7.0, см. [PERFORMANCE.md](PERFORMANCE.md#14-startup-executable-size-build-time-memory)).
- **Никаких зависимостей при запуске.** Файлы для Windows импортируют только `KERNEL32.dll` (и DLL, которые вы вызываете через FFI). Файлы для Linux, BSD и macOS на Intel обращаются к ядру напрямую, без libc. Для Apple Silicon используются системные dyld и libSystem.
- **Восемь целей с любой машины.** Кросс-компиляция через `--target`; один файл для Linux на каждый процессор работает в Mint, Ubuntu, Debian, Fedora и Alpine.
- **Самосборка.** Компилятор собирает сам себя. Выпущенный `nona` — нативный исполняемый файл, собранный Nona, без Node.js внутри. На Windows и Linux x64 он пересобирает себя во вторую стадию, совпадающую побайтно ([bootstrap](docs/self-hosting.md)).
- **Настоящие программы.** Кроме языка и его стандартной библиотеки: `process`, `fs`, `path`, `Buffer`, события, потоки, таймеры, HTTP-серверы и клиенты, TCP-сокеты и FFI для Windows.

## Установка

Скачайте сборку для своей системы из [последнего релиза](https://github.com/40oleg/nona/releases/latest), распакуйте и запустите `nona --help` (`./nona --help` в Linux, macOS и BSD). В архиве только исполняемый файл, лицензия и файл с версией; больше ничего ставить не нужно.

| ОС | Сборка в релизе | Имя цели | Формат файлов |
| --- | --- | --- | --- |
| Windows x64 / ARM64 | `nona-win32-x64.zip`, `nona-win32-arm64.zip` | `win32-x64`, `win32-arm64` | PE32+ |
| Linux x64 / ARM64 | `nona-linux-x64.zip`, `nona-linux-arm64.zip` | `linux-x64`, `linux-arm64` | ELF64 |
| macOS Intel / Apple Silicon | `nona-darwin-x64.zip`, `nona-darwin-arm64.zip` | `darwin-x64`, `darwin-arm64` | Mach-O64 |
| FreeBSD / OpenBSD x64 | `nona-freebsd-x64.zip`, `nona-openbsd-x64.zip` | `freebsd-x64`, `openbsd-x64` | ELF64 |

В POSIX-системах выполните `chmod +x nona`, если архиватор потерял права. [Песочница в браузере](https://40oleg.github.io/nona/playground) компилирует и скачивает программы для всех восьми целей без установки.

Чтобы собрать из исходников, нужны Node.js 26 или новее и npm:

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
node dist/cli.js --help
```

## Быстрый старт

```js
// hello.js
function greet(name) {
  return `Hello, ${name}!`;
}

setTimeout(() => console.log(greet("from Nona")), 10);
```

```sh
nona build hello.js -o hello.exe                        # для текущей системы
nona build hello.js -o hello --target linux-x64         # кросс-компиляция для Linux
nona build hello.js -o hello --target darwin-arm64      # кросс-компиляция для Apple Silicon
```

Небольшой HTTP-сервер:

```js
// server.mjs
import http from 'node:http';

http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ path: req.url, time: Date.now() }));
}).listen(8080, () => console.log('listening on http://localhost:8080'));
```

```sh
nona build server.mjs -o server
```

Командная строка:

```text
nona build <input.js> -o <output> [--target <target>] [--module]
           [--full-runtime] [--call-stats] [--coverage dir]
           [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
           [--version-info version.json]
nona --help | --version
```

Файлы `.mjs` (или `--module`) компилируются как ES-модули вместе со всем, что они импортируют. `--full-runtime` подключает всю среду выполнения, а не только достижимые части. Все параметры описаны в [справочнике CLI](https://40oleg.github.io/nona/reference/cli), а в каталоге `examples` есть другие программы, например [матричный калькулятор](docs/matrix-calculator.md).

## Что поддерживается

**Язык: ES2020.** Классы и `super`, генераторы, async-функции и async-генераторы, `for await`, деструктуризация, spread, optional chaining, `??`, BigInt, Symbol, итераторы, proper tail calls, `with` в нестрогом режиме и семантика Annex B. ES-модули с циклами, live bindings, `import.meta` и динамическим `import()` модулей, известных при компиляции. Из более поздних стандартов поддержаны поля, приватные методы и статические блоки классов (ES2022), разделители в числах, логическое присваивание, `Promise.any`/`AggregateError`, `.at()`, `findLast`/`findLastIndex`, `Object.hasOwn`, `String.prototype.replaceAll` и `cause` у Error.

**Стандартная библиотека: ES2020.** Object, Function, Array, String, Number, Math, Date, JSON, RegExp (именованные группы, lookbehind, флаги `s` и `u`, Unicode property escapes), Map, Set, WeakMap, WeakSet, ArrayBuffer, DataView и все typed arrays, SharedArrayBuffer и Atomics (с агентами-потоками), Proxy, Reflect и Promise.

**`eval` и `Function`** работают, если исходный текст известен при компиляции: строковый литерал, конкатенация литералов или переменная, которой присваиваются только такие константы. Такой код компилируется заранее с полной семантикой прямого и косвенного `eval`. Код, вычисленный во время выполнения, бросает `EvalError`; это единственное намеренное исключение ([контракт](docs/es2020-contract.md)).

**API, совместимые с Node.js.** Они написаны для Nona, а не взяты из Node.js, и покрывают подмножества, описанные по ссылкам:

| Модуль или глобальный объект | Что покрывает | Документы |
| --- | --- | --- |
| `process`, `node:process` | `argv`, `env`, `cwd`/`chdir`, `exit`, `nextTick`, стандартные потоки ввода-вывода, `hrtime`, `cpuUsage`, `memoryUsage`, сигналы, `kill`, `abort`, `execve` (POSIX), `title`, учётные данные и группы, диагностические отчёты, `getBuiltinModule`, `loadEnvFile`; все восемь целей | [process](docs/process.md) |
| таймеры | `setTimeout`, `setInterval`, `setImmediate` и их `clear*`, `queueMicrotask`, `performance.now()` | [host APIs](docs/host-apis.md) |
| `node:events` | EventEmitter, EventTarget, `AbortController`/`AbortSignal`, помощники асинхронного контекста | [события](docs/host-apis.md#events) |
| `node:async_hooks` | `AsyncLocalStorage` и `AsyncResource`, контекст переносится через промисы, таймеры и микрозадачи | [host APIs](docs/host-apis.md) |
| `node:stream` | Readable, Writable, Duplex, Transform, pipeline, backpressure, асинхронная итерация, адаптеры Web streams | [потоки](docs/host-apis.md#streams) |
| `node:fs` | синхронные операции с файлами и каталогами на всех восьми целях | [файловая система](docs/fs.md) |
| `node:path` | варианты POSIX и Windows, разбор, разрешение путей, glob | [пути](docs/path.md) |
| `Buffer`, `Blob`, `File`, `node:buffer` | хранение байтов, стандартные кодировки, числовой доступ; `TextEncoder`/`TextDecoder` | [двоичные данные](docs/host-apis.md#buffer-and-binary-data) |
| `node:http`, `node:net`, `node:string_decoder` | HTTP/1.1-серверы, клиенты и keep-alive-агенты; TCP-сокеты и серверы (Linux и Windows) | [сеть](docs/network.md) |
| `nona:ffi`, `nona:win32` | вызов любых экспортов DLL в Windows | [FFI](docs/ffi.md) |

**Программы для Windows** могут быть оконными, без консоли (`--subsystem windows`), и содержать иконку, манифест и сведения о версии ([исполняемые файлы Windows](docs/windows-executables.md)).

Точное поведение и покрытие тестами — в [матрице поддержки языка](docs/language-support.md). Неподдерживаемый синтаксис отклоняется при компиляции.

## Производительность

Nona выигрывает там, где и должен выигрывать исполняемый файл без среды выполнения: запуск, размер и память. Внутри программы обычные вычисления пока в разы и в десятки раз медленнее JIT V8; сокращение этого разрыва — основная линия [дорожной карты](docs/roadmap.md).

Собственный HTTP-сервер Nona против Node.js на одной и той же программе ([bench/http](bench/http/server.mjs), Linux x64, замер для v0.9.0):

| Сценарий | Node.js, запр./с | Nona, запр./с | Память, Node.js / Nona |
| --- | --- | --- | --- |
| hello (keep-alive) | 71–72k | 61–70k | 80 / 16 МБ |
| ответ JSON | 66–68k | 55–61k | 79 / 16 МБ |
| новое соединение на запрос | 25–27k | 22–26k | 70 / 18 МБ |
| ответ 64 КиБ | 20–21k | **33–38k** | 91 / 16 МБ |
| тело запроса 16 КиБ | 49–54k | 41k | 78 / 16 МБ |

Полное сравнение с Node.js, Deno и Bun, методика и известные медленные места — в [PERFORMANCE.md](PERFORMANCE.md).

## Как это устроено

```text
исходный JavaScript (скрипт или граф модулей)
      │
      ▼
 лексер → парсер → ранние ошибки и связывание областей → eval/Function при компиляции
                                                         │
                                                         ▼
                                  понижение в IR → генерация кода x86-64/AArch64
                                                         │
                                                         ▼
              среда выполнения (нативный код + JS-прелюдии) → линкер PE32+/ELF64/Mach-O64
```

Компилятор написан на TypeScript. Разработка и bootstrap идут на Node.js, а выпущенный компилятор — тот же код, скомпилированный самой Nona. Среда выполнения написана на ассемблерном DSL и JavaScript-прелюдиях: значения и объекты с inline-кэшами, точный неперемещающий сборщик мусора mark-and-sweep с ленивой очисткой, строки UTF-16, исключения с перехватываемым `RangeError` при переполнении стека, очередь заданий, цикл событий, который ждёт таймеры и сокеты, и host API.

## Ограничения

- `eval`, `Function`, `GeneratorFunction` и `AsyncFunction` требуют исходный текст, известный при компиляции.
- Большинство возможностей новее ES2020, которых нет в списке выше (`WeakRef`, `await` верхнего уровня, …), не поддерживаются.
- Модули Node.js вне таблицы выше, npm-пакеты, которым они нужны, и браузерные API недоступны. Сеть работает в Linux и Windows.
- Обычные вычисления намного медленнее, чем в JIT; часть прототипов по умолчанию для конструкторов из других realm ещё не доделана.

## Разработка

```sh
npm run check            # сборка и модульные тесты
npm run check:programs   # сравнение 1000 самостоятельных программ с Node.js
npm run compare          # компиляция примеров совместимости и сравнение с Node.js
```

Тесты компилируют и запускают настоящие исполняемые файлы, многие в режиме GC stress (сборка мусора при каждом выделении памяти), и сравнивают вывод с Node.js. CI прогоняет их на всех восьми целях, включая гостевые FreeBSD и OpenBSD, и проверяет, что нативный компилятор пересобирает сам себя. Аудиты Test262 запускаются через `scripts/test262-audit.ps1` (Windows) и `scripts/test262-audit.sh` (Linux); см. [Test262](docs/test262.md). [Корпус программ](programs/README.md) содержит 1000 небольших приложений с записанными результатами.

```text
src/frontend       лексер, парсер, ранние ошибки, связывание областей, eval/Function при компиляции, встроенные модули
src/ir             промежуточное представление, понижение и анализ живости
src/backend        генерация кода x86-64 и AArch64; линкеры PE32+, ELF64 и Mach-O64; адаптеры ОС
src/runtime        нативная среда выполнения и JavaScript-прелюдии, попадающие в исполняемые файлы
tests              модульные, интеграционные, нативные и сравнительные тесты
programs           корпус из 1000 программ
examples           примеры программ
```

Правила участия для людей и агентов — в [AGENTS.md](AGENTS.md).

## Безопасность

Nona не проходила аудит безопасности. Не компилируйте недоверенный код и не считайте собранные файлы песочницей: они работают с теми же правами, что и любая другая нативная программа, а через FFI можно вызвать любую DLL.

## Лицензия

[MIT](LICENSE). Сторонние уведомления — в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
