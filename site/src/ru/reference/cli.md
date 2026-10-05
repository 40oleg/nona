# Командная строка

## Синтаксис

```text
Nona 0.8.0 — JavaScript subset to native executables
Usage: nona build <input.js> -o <output> [--target win32-x64|linux-x64|linux-arm64|win32-arm64|darwin-x64|freebsd-x64|openbsd-x64] [--module]
       [--subsystem console|windows] [--icon app.ico] [--manifest app.manifest]
       [--version-info version.json]
       (.mjs inputs are compiled as modules)
       nona --help | --version
```

В клоне репозитория запускайте `node dist/cli.js …`; после `npm link` та же команда доступна как `nona`.

## Параметры

| Параметр | Значение | Описание |
| --- | --- | --- |
| `-o` | путь | Выходной файл. Обязателен. Недостающие каталоги создаются. |
| `--target` | [Платформы](/reference/native-platforms) | PE32+, ELF64 или Mach-O64; по умолчанию ОС и CPU хоста. |
| `--module` | — | Компилировать вход как ES-модуль. Файлы с окончанием `.mjs` — модули автоматически. |
| `--subsystem` | `console` (по умолчанию), `windows` | GUI-программа Windows без консольного окна. Только `win32-x64`. GUI-программа без `--manifest` получает манифест по умолчанию. |
| `--icon` | файл `.ico` | Встроить все изображения из файла иконки. Только `win32-x64`. |
| `--manifest` | файл XML | Встроить манифест приложения. Он должен быть корректным: Windows отказывается запускать программу с повреждённым манифестом. Только `win32-x64`. |
| `--version-info` | файл JSON | Встроить сведения о версии (`FileVersion`, `ProductVersion`, `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName`, `Comments`). Только `win32-x64`. |
| `--help` | — | Вывести синтаксис. |
| `--version` | — | Вывести версию компилятора. |

Каждый параметр можно указать один раз. Форматы ресурсов описаны в разделе [Исполняемые файлы Windows](/ru/reference/windows-executables).

## Вход и выход

- Вход — один исходный файл в UTF-8. Модуль подтягивает модули, которые он импортирует; встроенные модули `nona:*` и `node:*` — часть компилятора.
- Результат записывается во временный файл рядом и затем переименовывается, поэтому неудачная сборка никогда не оставляет недописанный исполняемый файл и сохраняет предыдущий.
- Компилятор отказывается перезаписывать свой входной файл, в том числе через жёсткую или символическую ссылку.
- Файлы для Linux получают права `0755`.

## Кэш рантайма

Скомпилированный рантайм и прелюдии одинаковы для всех программ с одинаковым набором линкуемых частей, и их генерация занимает бо́льшую часть сборки. Командная строка хранит их в каталоге кэша, поэтому повторные сборки примерно втрое быстрее (hello world под Linux: 1,1 с, затем 0,33 с). Результат с кэшем и без него одинаков. Записи относятся к одной сборке компилятора и после обновления не используются.

| Переменная | Действие |
| --- | --- |
| `NONA_CACHE_DIR` | Каталог кэша. По умолчанию `%LOCALAPPDATA%\nona\cache` в Windows, `~/Library/Caches/nona` в macOS, `$XDG_CACHE_HOME/nona` или `~/.cache/nona` в остальных системах. |
| `NONA_CACHE=0` | Не читать и не записывать кэш. |

## Диагностика и коды выхода

Код выхода — `0` при успехе и `1` при любой ошибке. Ошибки в исходнике выводятся так:

```text
<file>:<line>:<column> <CODE>: <message>
```

| Код | Значение |
| --- | --- |
| `E_LEX`, `E_SYNTAX` | Исходник не удаётся разбить на токены или разобрать, либо он использует неподдерживаемый синтаксис. |
| `E_BIND` | Ранняя ошибка при разрешении имён (повторные объявления, недопустимые цели присваивания, …). |
| `E_MODULE` | Модуль не удаётся разрешить, прочитать или связать, либо экспорты конфликтуют. |
| `E_FFI_STATIC` | Вызов `define()` из `nona:ffi` — не три строковых литерала или содержит недопустимую сигнатуру. |
| `E_FFI_TARGET` | Объявление DLL скомпилировано для `linux-x64` или объявление системного вызова — для `win32-x64`. |
| `E_RESOURCE` | Некорректная иконка или сведения о версии, либо ресурсы запрошены для `linux-x64`. |
| `E_TARGET` | Неподдерживаемая цель или подсистема. |

Ошибки аргументов выводятся как `nona: <message>`, например `Unknown option: --foo`, `Duplicate option: -o`, `Missing value for --target`, `Output is required (-o <output>)`, `Unsupported target: arm64`, `Unsupported subsystem: native` или `--subsystem requires --target win32-x64`.

## Примеры

::: code-group

```sh [Консольная программа]
node dist/cli.js build app.js -o build/app.exe
```

```sh [GUI-программа с ресурсами]
node dist/cli.js build app.mjs -o build/app.exe --subsystem windows --icon app.ico --version-info version.json
```

```sh [Linux]
node dist/cli.js build app.js -o build/app --target linux-x64
```

:::


## Native target availability

Windows/Linux/macOS x64 and ARM64 and FreeBSD/OpenBSD x64 targets are available. Apple Silicon uses the system dyld/libSystem startup path. See the [native platform matrix](/reference/native-platforms) for target names, host API limits and native verification. DLL FFI requires Windows; raw syscall FFI uses Linux, Darwin or BSD kernel numbers.
