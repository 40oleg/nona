# Совместимость и ограничения

## Область действия

Nona реализует язык и встроенные объекты нормативного ECMA-262 11-го издания (июнь 2020) для скриптов и ES-модулей. Интернационализация ECMA-402, API браузера и API Node.js — отдельные спецификации; Nona предоставляет только API хоста, перечисленные в [Справочнике](/ru/reference/modules). Контракт завершённости ведётся в [`docs/es2020-contract.md`](https://github.com/40oleg/nona/blob/main/docs/es2020-contract.md).

Релиз описывается как «ES2020 с документированными исключениями» и никогда — как полностью соответствующий ES2020.

## `eval` и `Function` {#eval-and-function}

Nona компилирует заранее, поэтому `eval` и динамическим конструкторам функций нужен исходный текст во время компиляции:

- **Компилируется заранее:** строковый литерал, конкатенация литералов или переменная, которой присваиваются только такие константы (значение сравнивается во время исполнения). Прямой `eval` видит область видимости вызывающего кода, `this`, `arguments`, `new.target` и `super`; косвенные формы (`(0, eval)(…)`, `globalThis.eval(…)`, `eval?.(…)`) выполняются в глобальной области. Вызовы `Function`, `GeneratorFunction`, `AsyncFunction` и `AsyncGeneratorFunction`, все аргументы которых — литералы, компилируются с семантикой CreateDynamicFunction.
- **Не поддерживается:** исходник, вычисленный во время исполнения, spread-аргументы `eval` и `$262.evalScript`. Они бросают:

```text
EvalError: Nona compiles ahead of time: eval and Function need source text known at compile time
```

Исходники времени исполнения отслеживаются в [#11](https://github.com/40oleg/nona/issues/11).

## Отличия от Node.js

| Область | Nona | Node.js |
| --- | --- | --- |
| `process.argv` | `[execPath, ...arguments]`: `argv[1]` — первый аргумент | `[node, script, ...arguments]` |
| `process` | `argv`, `env`, `exit`, `exitCode`, `execPath`, `cwd`, `platform`, `arch`, `pid` | EventEmitter с потоками, `nextTick`, `hrtime`, … |
| Идентификаторы таймеров | Числа | Объекты `Timeout` |
| `readFileSync(path)` | Возвращает `Uint8Array` | Возвращает `Buffer` |
| Кодировки | Только `utf8` (fs); UTF-8, UTF-16LE, Latin-1, ASCII, hex, base64/base64url (Buffer) | Много |
| Сообщения об ошибках на Windows | Содержат путь в том виде, в каком он передан | Содержат абсолютный путь |
| Модули | `nona:*`, `node:fs`, `node:process`, `node:buffer` и относительные файлы | Всё из `node:*` и пакеты npm |
| `require`, `node:path` | Недоступны | Доступны |
| `console.log` без стандартного вывода | Вывод отбрасывается | Вывод отбрасывается или возникает ошибка |

## Производительность

- Массивы и `Map`/`Set` хранят элементы в связных структурах; очень большие коллекции работают медленнее, чем в V8 ([#13](https://github.com/40oleg/nona/issues/13), [#36](https://github.com/40oleg/nona/issues/36)).
- Движок RegExp — VM с возвратами, написанная на JavaScript. Шаблон без обратных ссылок и lookaround, который слишком долго перебирает варианты (без флага `u`), доматчивается движком с линейным временем.
- На Windows таймеры просыпаются по системному тику (обычно 15,6 мс).
- JIT нет: код компилируется один раз, заранее, без оптимизации по профилю.

## Realms

`$262.createRealm` поддерживается для Test262. Некоторые конструкторы, реализованные в JavaScript-прелюдиях, при вызове с `new.target` из другого realm всё ещё берут прототипы по умолчанию не из того realm ([#7](https://github.com/40oleg/nona/issues/7)).

## Платформы

- Цели: только Windows 10/11 x64 и Linux x86-64.
- Исполняемые файлы Windows импортируют только `KERNEL32.dll`, `KERNELBASE.dll` и DLL, объявленные через FFI; исполняемые файлы Linux статические и используют системные вызовы напрямую.
- FFI к DLL есть только на Windows; прямые системные вызовы — только на Linux.

## Нативные платформы

Windows/Linux: x64, ARM64. macOS: Intel x64. FreeBSD/OpenBSD: x64.

[OS/CPU, API, CI — Нативные платформы](/reference/native-platforms). `darwin-arm64`: запуск через системные dyld/libSystem.

## Buffer

Global `Buffer`, `Blob` and `File`, and `node:buffer` / `buffer` / `nona:buffer` imports are available on every native target. Buffer supports standard byte encodings, shared slices, copying, searching and numeric access. Blob/File support immutable data and metadata. Blob byte/text streams and object URL registration/resolution are available; see [the API contract and limitations](/reference/host-apis#buffer-and-binary-data).
