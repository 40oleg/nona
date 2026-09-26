# Nona

[English](README.md)

Текущее состояние языка: [матрица поддержки](docs/language-support.md).
Ход работ и результаты проверок: [журнал разработки](docs/development-log.md).
Все документы: [индекс](docs/README.md).

Компилятор поднабора JavaScript с отдельными возможностями до ES2020 в самостоятельные консольные
файлы Windows x64 и Linux x64. Написан на TypeScript; сам генерирует машинный код x64, PE32+ и ELF64.
Node.js нужен для запуска компилятора. Сгенерированная программа не содержит Node.js,
интерпретатор или LLVM; Windows-версия использует KERNEL32.dll, Linux-версия — системные вызовы.
Уведомления для распространения исходников и EXE: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Сборка и запуск

В PowerShell из каталога проекта:

```powershell
npm.cmd ci
npm.cmd run build
node dist/cli.js build examples/factorial.js -o build/factorial.exe
.\build\factorial.exe
npm.cmd run check
npm.cmd run compare
```

Компилятор принимает один UTF-8 файл. `-o` обязателен; необязательный
`--target win32-x64` (по умолчанию) или `--target linux-x64` выбирает платформу.
Также доступны `--help` и `--version`. Код завершения: 0 — успех, 1 — ошибка.
При ошибке анализа прежний выходной файл сохраняется. Успешная сборка записывается
через временный файл с атомарной заменой. Алиасы исходника, включая hard links,
нельзя использовать как выходной файл.

Примеры: `examples/factorial.js`, `fibonacci.js`, `strings.js`, `loops.js`,
`modern-expressions-demo.js`. Последний можно собрать так:

```powershell
node dist/cli.js build examples/modern-expressions-demo.js -o build/modern-expressions-demo.exe
.\build\modern-expressions-demo.exe
```

## Поддерживаемый язык

- Concise methods и get/set accessors в литералах объектов, computed names,
  объединение getter/setter, name/length/source text; функции nonconstructable.
  `super` property read/write/call с текущим receiver и сохранением home object при GC.
- `Object.preventExtensions`/`isExtensible`, `seal`/`isSealed`, `freeze`/`isFrozen`;
  shallow integrity, readonly array length и freeze mapped arguments.
- `Object.keys`/`values`/`entries`, `getOwnPropertyNames`/`getOwnPropertyDescriptors`,
  `Object.create` и `defineProperties`: порядок ключей, snapshot/recheck после getters,
  двухэтапное чтение descriptor bag перед изменением target.
- `var` с областью функции и hoisting, повторные объявления, глобальные переменные
  и ранняя проверка конфликтов с lexical declarations.
- `let`/`const` с блочной областью, затенением, TDZ и проверкой записи в константы.
  Ошибки TDZ/const являются перехватываемыми `ReferenceError`/`TypeError`.
- Числа binary64, строки UTF-16, boolean, `null`, `undefined`, `NaN`, `Infinity`.
- Десятичные, hex, binary (`0b`) и octal (`0o`) литералы, дроби и экспоненты;
  Unicode-идентификаторы, identifier escapes, строковые escapes, включая `\u{…}`.
- Арифметика `+ - * / % **`, сравнения `== != === !== < <= > >=`, `!`, `typeof`.
- `&&`, `||`, `?:` с коротким замыканием; `=`, `+= -= *= /= %= **=`, `++ --`.
- `??` сохраняет `0`, `false`, пустые строки и `NaN`; правая часть вычисляется
  только для `null`/`undefined`. Смешивание с `&&`/`||` требует скобок.
- Optional chaining: `obj?.x`, `obj?.[key]`, `fn?.()`, `obj.method?.()`,
  смешанные цепочки и `delete obj?.x`. Nullish short-circuit пропускает ключи
  и аргументы, а вызовы свойств сохраняют receiver.
- Побитовые `& | ^ ~ << >> >>>` и составные присваивания; операторы `void` и запятая.
- `if/else`, `while`, `do/while`, `for`, `switch`, метки, `break`, `continue`,
  блоки, вставка точек с запятой; `debugger` без подключённого отладчика — no-op.
- Частичные `for...in` и `for...of` с `var`/`let`/`const`; общий протокол
  `Symbol.iterator`, встроенные итераторы массивов/строк и IteratorClose.
- Простые стрелочные функции, шаблонные строки с тегами и без тегов, Symbol как примитив
  и ключ свойства, Symbol.for/keyFor, Symbol.toPrimitive/hasInstance/toStringTag.
- Отдельные методы UTF-16 строк, включая `indexOf`, `lastIndexOf`, `padStart`, `padEnd` и `String.fromCharCode`.
- Отдельные методы массива, включая `includes`, `indexOf` и `lastIndexOf`.
- Параметр `...rest` в функциях, методах и стрелках; отдельный массив лишних
  аргументов и unmapped `arguments` для таких функций.
- Именованные функции верхнего уровня, параметры, `return`, рекурсия и взаимная рекурсия.
- Функции как значения: передача/возврат, присваивание, свойства и косвенные вызовы,
  включая функции в массивах/объектах. Имена объявленных функций можно переприсваивать.
- Именованные и анонимные function expressions, вложенные объявления в function body,
  замыкания с общими/независимыми переменными, транзитивные захваты, отдельные
  привязки `for (let …)` по итерациям и захваченные TDZ/const.
- Function declarations в блоках и clauses `switch` с lexical scope, hoisting
  при входе в область и свежими cells при повторном входе. Annex B aliases не создаются.
- Object receiver/`this` в методах, sloppy global `this` при обычном вызове;
  свойства глобального объекта связаны с script-level `var` и функциями.
- Глобальные `Object`, `Array`, `Boolean`, `Number`, `String`: вызов и `new`,
  boxing, длина/элементы массива, metadata и связи prototype/constructor.
- `new.target` внутри функций: обычный вызов даёт undefined, конструкция —
  исходную функцию, в том числе после bind; независимость вложенных вызовов.
- `new` для обычных функций, собственные `prototype`/`constructor`, правила
  возвращаемого значения конструктора и ordinary `instanceof`.
- `name`/`length` функций, вывод имени анонимной функции из переменной или
  свойства литерала; общий callable `Function.prototype` с `call`/`apply`/`bind`/`toString`.
- Sloppy `arguments` для простых параметров, включая повторяющиеся имена: связь индексов с
  параметрами, extra arguments, `length`/`callee`, разрыв связи через `delete`.
- `Function.prototype.call`, упаковка primitive receiver, Number/Boolean/String
  prototypes для member lookup; boxed String с readonly indices/length.
- `Function.prototype.apply` с массивами, array-like и `arguments`, включая
  inherited indices и holes; предел реализации — 65 536 аргументов.
- `Function.prototype.bind`, сохранённые this/arguments, повторный bind,
  name/length, ordinary new/instanceof; до 65 536 объединённых аргументов.
- `Function.prototype.toString`: точный исходный текст обычных функций,
  native representation встроенных/связанных функций, преобразование в строку.
- `Object.prototype.toString/valueOf`, `Array.prototype.toString/join` как
  вызываемые функции; generic receivers, separator, holes/cycles, custom join.
- Пользовательские `valueOf`/`toString` с правильным порядком преобразований
  и сохранением временных значений при вложенной сборке мусора.
- `globalThis` как изменяемое и удаляемое глобальное свойство; корректное
  затенение локальными и лексическими привязками.
- `Object.getPrototypeOf/setPrototypeOf/is`, проверки собственных свойств,
  перечисляемости и цепочки прототипов; `Object.prototype.toLocaleString`.
- `Object.defineProperty`: data/accessor descriptors, неизменяемые свойства,
  readonly array length, mapped arguments и глобальные привязки.
- `Object.getOwnPropertyDescriptor`: data/accessor reflection, специальные свойства
  строк/массивов/arguments и вызываемые getter/setter встроенного `__proto__`.
- `Boolean`/`Number`/`String` prototype `valueOf/toString` с brand checks;
  `Number.prototype.toString(radix)` для оснований 2–36, дробей и крайних binary64.
- Объектные литералы, shorthand/computed keys, свойства и индексы, `in`, `delete`,
  наследование data-properties и `__proto__`. Массивы с holes, изменяемым `length`
  и каноническими индексами; базовое преобразование объектов/массивов в примитивы.
- Обычный глобальный объект `console` и заменяемый/detached `console.log(...)`:
  преобразование примитивов в строки, пробел между аргументами, LF в конце;
  возвращает `undefined`. `%s` — обычный текст. `-0` печатается как `0`.

Вычисление операндов и аргументов идёт слева направо. Недостающие аргументы —
`undefined`; лишние вычисляются и игнорируются. Строки сохраняют встроенный NUL;
вывод в pipe/файл — UTF-8 без BOM, одинокие суррогаты заменяются U+FFFD.
Неизвестные имена разрешаются через глобальный объект: чтение отсутствующего
имени бросает `ReferenceError`, `typeof` возвращает `undefined`, а sloppy assignment
создаёт обычное глобальное свойство.

Явные `throw` и `try/catch/finally` поддержаны, в том числе через callbacks и вложенные
функции. Реализованы Error/EvalError/RangeError/ReferenceError/SyntaxError/TypeError/URIError.
Ошибки текущих языковых операций перехватываются; сообщения runtime имеют
собственный текст, расширения V8 stack/captureStackTrace пока отсутствуют.

Strict mode поддержан для текущего синтаксического поднабора: directive prologue
script/function, наследование strict-контекста, raw `this`, unmapped `arguments`,
ограничения `callee`/`caller`, ранние ошибки и исключения при запрещённых записях
и удалениях. Non-simple parameters и классы будут проверены вместе с реализацией
соответствующего синтаксиса.

## Ограничения

Это **не весь JavaScript** и не упаковщик произвольного Node.js-проекта.
Нет большинства стандартных методов объектов/массивов; классы поддержаны частично. Нет
полной семантики генераторов, Promise и async,
Annex B aliases для block functions, полного Function.prototype, остальных builtin конструкторов/API,
регулярных выражений, модулей, браузерных и Node.js API. Стрелки, шаблонные
строки с тегами и без тегов, Symbol, `for...in` и `for...of` реализованы частично;
точные границы — в матрице поддержки. Legacy octal ещё нет.
`eval` и динамические конструкторы функций исключены из следующего объёма по
решению пользователя; обычные функции и замыкания поддержаны в описанных границах.

Недостижимые объекты, циклы, строки и рабочие буферы освобождаются точным
mark/sweep GC между операциями. Одна большая runtime-операция может временно
превысить порог сборки; лимит памяти процесса не гарантируется.
Ошибки памяти и вывода завершают процесс с кодом 1. Исчерпание стека —
системная ошибка Windows, без JavaScript stack trace.

## Устройство и проверка

`src/frontend` → `src/ir` → `src/backend/x64` → `src/backend/pe`.
Нативные операции над значениями генерируются из `src/runtime`.
Ядро `compile(source, {fileName, target: 'win32-x64'})` возвращает PE и импорты
или структурированные диагностики, не обращаясь к файловой системе.

`npm.cmd run check` собирает TypeScript и запускает тесты, в том числе настоящие
Windows EXE, сравнение с JavaScript, проверки PE/ABI, Unicode, ошибок вывода,
защиты файлов и запуска без Node.js в PATH. Тестам нужна Windows x64.
Проверено на Windows 11 Home x64 (10.0.26200), Node.js 26.9.0,
TypeScript 7.0.2, npm 11.19.1. Зависимости закреплены в `package-lock.json`.
Итог последней полной проверки: 1077 тестов прошли, ошибок нет; один тест символических ссылок
пропущен из-за отсутствия соответствующего разрешения Windows.
Hard links, регистр пути и блокировка выходного файла проверены. Четыре примера собраны
и запущены; тест отдельного EXE с системным PATH также прошёл.

`npm.cmd run compare` дополнительно компилирует 33 программы из `examples/compat`
в `build/compat` и сравнивает stdout/stderr побайтно и код завершения с обычным
Node.js, без замены console. Отчёт: `work/compat-report.json`.
Примеры mapped arguments и sloppy receiver имеют расширение `.cjs`, чтобы обычный Node использовал
sloppy function semantics; это не означает поддержку CommonJS API в Nona.

Подробные границы версии: `docs/superpowers/specs/2026-09-20-js-aot-win64-design.md`.
