# Начало работы

## Требования

- Для компилятора: Node.js 26 или новее и npm, на Windows или Linux.
- Цели: Windows 10/11 x64 (`win32-x64`, по умолчанию) и Linux x86-64 (`linux-x64`).

## Сборка компилятора

```sh
git clone https://github.com/40oleg/nona.git
cd nona
npm ci
npm run build
```

Точка входа компилятора — `dist/cli.js`; примеры на этом сайте запускают его как `node dist/cli.js`. Пакет также объявляет команду `nona`: `npm link` в репозитории добавляет её в `PATH`.

## Первая программа

<<< ../../../samples/hello.js

::: code-group

```sh [Windows]
node dist/cli.js build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux]
node dist/cli.js build hello.js -o build/hello --target linux-x64
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

Компилятор — кросс-компилятор: на Windows он может собирать исполняемые файлы для Linux, а на Linux — для Windows. `--target` выбирает формат результата; по умолчанию `win32-x64`. Файлы для Linux записываются с правами `0755`.

## Модули

Входной файл `.mjs` или любой файл, скомпилированный с `--module`, — ES-модуль. Относительные импорты (`./util.mjs`, `../lib/x.mjs`) разрешаются относительно импортирующего файла и компилируются в тот же исполняемый файл. Встроенные модули используют префикс `nona:` (`nona:ffi`, `nona:win32`, `nona:fs`, `nona:process`), а `node:fs` и `node:process` — псевдонимы подмножеств Nona; см. [Встроенные модули](/ru/reference/modules).

## Программа для Windows без консоли

```sh
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

`--subsystem windows` запускает программу без консольного окна и встраивает манифест по умолчанию; `--icon` и `--version-info` добавляют ресурсы, которые показывает Проводник. См. [Исполняемые файлы Windows](/ru/reference/windows-executables) и [пример Museum](/ru/examples/museum).

## Решение проблем

Ошибки компиляции выводятся в виде `file:line:column CODE: message`, и компилятор завершается с кодом 1:

```text
app.mjs:3:12 E_FFI_STATIC: define() arguments must be string literals
```

- Неподдерживаемый синтаксис отклоняется при компиляции, а не падает во время исполнения.
- `E_FFI_TARGET` означает, что объявление DLL скомпилировано для `linux-x64` (или системный вызов — для `win32-x64`).
- `EvalError` во время исполнения означает, что `eval` или `Function` получили исходный текст, неизвестный при компиляции.

В [справочнике по командной строке](/ru/reference/cli) перечислены все параметры и ошибки.

## Нативные платформы

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — Нативные платформы](/reference/native-platforms). `darwin-arm64`: пока не поддерживается.
