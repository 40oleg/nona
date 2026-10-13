# Начало работы

## Установка

Скачайте архив для вашей системы из [последнего релиза](https://github.com/40oleg/nona/releases/latest), распакуйте его и выполните `nona --help` (`./nona --help` на Linux, macOS и BSD). В архиве лежат исполняемый файл, лицензия и файл версии; компилятор — нативная программа, которой не нужен Node.js. В каждом релизе также есть `SHA256SUMS`.

| ОС                          | Архив                                          | Имя цели                     |
| --------------------------- | ---------------------------------------------- | ---------------------------- |
| Windows x64 / ARM64         | `nona-win32-x64.zip`, `nona-win32-arm64.zip`   | `win32-x64`, `win32-arm64`   |
| Linux x64 / ARM64           | `nona-linux-x64.zip`, `nona-linux-arm64.zip`   | `linux-x64`, `linux-arm64`   |
| macOS Intel / Apple Silicon | `nona-darwin-x64.zip`, `nona-darwin-arm64.zip` | `darwin-x64`, `darwin-arm64` |
| FreeBSD / OpenBSD x64       | `nona-freebsd-x64.zip`, `nona-openbsd-x64.zip` | `freebsd-x64`, `openbsd-x64` |

В POSIX-системах выполните `chmod +x nona`, если архиватор потерял право на исполнение. Чтобы попробовать Nona, ничего не устанавливая, используйте [песочницу](/playground).

### Сборка из исходников

Нужны Node.js 26 или новее и npm на любом хосте, где работает Node.js 26.

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
node dist/cli.js --help
```

Точка входа компилятора — `dist/cli.js`. `npm link` в репозитории добавляет команду `nona` в `PATH`. Остальная часть сайта пишет `nona`; из клона запускайте `node dist/cli.js`.

## Первая программа

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux and macOS]
nona build hello.js -o build/hello
./build/hello
```

:::

```text
Hello, from Nona!
a microtask runs before any timer
tick 1
tick 2
tick 3
done; at least 30 ms passed: true
```

Программа завершается, когда не остаётся ни таймеров, ни заданий Promise. Исполняемый файл работает сам по себе: скопируйте его на машину без Node.js — он всё равно запустится.

## Цели и кросс-компиляция

Компилятор — кросс-компилятор: любой хост может собирать исполняемые файлы для любой из восьми [нативных платформ](/reference/native-platforms). `--target` выбирает формат результата и процессор; без него целью считаются ОС и процессор хоста.

```sh
nona build hello.js -o build/hello --target linux-arm64
nona build hello.js -o build/hello.exe --target win32-x64
```

Кросс-скомпилированный исполняемый файл работает только на той же ОС и процессоре. Файлы для Linux, BSD и macOS записываются с правами `0755`.

## Модули

Входной файл `.mjs` или любой файл, скомпилированный с `--module`, — ES-модуль. Относительные импорты (`./util.mjs`, `../lib/x.mjs`) разрешаются относительно импортирующего файла и компилируются в тот же исполняемый файл. Входной файл CommonJS компилируется вместе со всем, что он подключает через `require`.

Встроенные модули используют префикс `nona:` (`nona:ffi`, `nona:win32`, `nona:fs`, `nona:process`); доступны и многие имена Node.js (`node:fs`, `node:path`, `node:http`, …). См. [Встроенные модули](/ru/reference/modules).

## Пакеты npm

Устанавливайте пакеты через npm как обычно и собирайте программу: Nona разрешает `node_modules` при сборке и компилирует пакеты в исполняемый файл. `nona build <каталог пакета>` собирает команду `"bin"` или модуль `"main"` пакета. См. [пакеты npm](/reference/npm).

## Программа для Windows без консоли

```sh
nona build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` запускает программу без консольного окна и встраивает манифест по умолчанию; `--icon` и `--version-info` добавляют ресурсы, которые показывает Проводник. См. [Исполняемые файлы Windows](/ru/reference/windows-executables) и [пример Museum](/ru/examples/museum).

## Решение проблем

Ошибки компиляции выводятся в виде `file:line:column CODE: message`, и компилятор завершается с кодом 1:

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- Неподдерживаемый синтаксис отклоняется при компиляции, а не падает во время исполнения.
- `E_FFI_TARGET` означает, что объявление DLL скомпилировано для цели не на Windows (или системный вызов — для `win32-x64`).
- `E_HOST_MODULE` означает, что встроенный модуль недоступен для цели.
- `EvalError` во время исполнения означает, что `eval` или `Function` получили исходный текст, неизвестный при компиляции.

В [справочнике по командной строке](/ru/reference/cli) перечислены все параметры и ошибки.

## Дальше

- [Примеры](/ru/examples/) — полные программы с пояснениями.
- [Поддержка языка](/ru/guide/language-support) и [Совместимость и ограничения](/ru/guide/compatibility) — чего ожидать.
- [Встроенные модули](/ru/reference/modules) — API хоста.
