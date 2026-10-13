# Как это устроено

## Конвейер

```text
JavaScript source (script or module graph)
      │
      ▼
 lexer → parser → early errors and scope binding → compile-time eval/Function
                                                         │
                                                         ▼
                                     IR lowering → x86-64 code generation
                                                         │
                                                         ▼
                       runtime (native code + JS preludes) → PE32+/ELF64/Mach-O64 linker
```

Всё выполняется внутри процесса компилятора: нет внешнего ассемблера, линковщика или C-компилятора. Результат — один файл с машинным кодом программы и runtime Nona.

## Фронтенд

[`src/frontend`](https://github.com/40oleg/nona/tree/main/src/frontend) превращает исходный текст в связанную программу:

- `lexer.ts`, `parser.ts` и `ast.ts` строят синтаксическое дерево; неподдерживаемый синтаксис — ошибка компиляции.
- `binder.ts` и `declarations.ts` проверяют ранние ошибки, связывают каждый идентификатор с областью видимости (глобальной, модуля, функции, блока, объекта `with`) и решают, какие привязки живут в замыканиях.
- `modules.ts` загружает граф модулей: статические импорты, `import()` с литеральными спецификаторами, циклы и разрешение экспортов. `builtin-modules.ts` и `fs-module.ts` предоставляют модули `nona:*` и `node:*`.
- `eval-aot.ts` и `dynamic-functions.ts` компилируют вызовы `eval` и `Function`, исходный текст которых известен при компиляции.

## Промежуточное представление

[`src/ir`](https://github.com/40oleg/nona/tree/main/src/ir) переводит связанную программу в регистровое IR из блоков, операций и терминаторов (`lower.ts`, `model.ts`) и вычисляет живость (`liveness.ts`), чтобы сборщик мусора в каждой safepoint видел только живые значения.

Перед генерацией кода IR каждой функции проходит оптимизации, точно сохраняющие семантику JavaScript: свёртку и распространение констант с удалением ветвлений по известным условиям, удаление проверок временной мёртвой зоны, проброс копий и удаление мёртвого кода, вывод типа Number и прямые вызовы известных функций ([архитектура](https://github.com/40oleg/nona/blob/main/docs/architecture.md#ir-optimization)).

## Генерация кода

[`src/backend/x64`](https://github.com/40oleg/nona/tree/main/src/backend/x64) содержит кодировщик инструкций и ассемблер x86-64 и генератор кода, который превращает операции IR в вызовы runtime и встроенные быстрые пути; [`src/backend/arm64`](https://github.com/40oleg/nona/tree/main/src/backend/arm64) делает то же для AArch64. Сгенерированный код использует общее логическое соглашение о вызовах; мосты ОС преобразуют его в нативный ABI каждой платформы.

## Runtime

Каждый исполняемый файл содержит runtime из [`src/runtime`](https://github.com/40oleg/nona/tree/main/src/runtime):

- **Значения** — 16-байтовые пары с тегом: undefined, null, логические значения, числа binary64, строки UTF-16, объекты, символы и BigInt.
- **Объекты** из литералов и конструкторов делят _shapes_ (скрытые классы): свойства лежат в 16-байтовых слотах, которые описывает shape, а инлайн-кэши в сгенерированном коде читают и пишут их после одного сравнения shape. То, что shape описать не может (аксессоры, удаление, другие атрибуты, ключи-символы), переводит объект в упорядоченный список свойств, который получает хеш-индекс, когда становится длинным.
- **Нативный код** встроенных объектов генерируется как x86-64 небольшим построителем (`RuntimeBuilder`).
- **JavaScript-прелюдии** (`src/lib/runtime/*.js`) реализуют части библиотеки на JavaScript и компилируются в каждый исполняемый файл: движок RegExp, драйверы Promise и async, вспомогательные функции Proxy и Reflect, таймеры и цикл событий, `process`, `TextEncoder`/`TextDecoder` и встроенные объекты Annex B.

### Сборщик мусора

Сборщик точный и немещающий: mark-and-sweep по явным корням (глобальные переменные, живые слоты стека в safepoint, корневые области runtime). Стеки сопрограмм генераторов и async-функций (по 1 МиБ) учитываются в пороге сборки. На Linux блоки кучи выделяются из классов размеров, нарезанных из арен по 1 МиБ. Внутренний контракт памяти описан в [`docs/runtime-memory.md`](https://github.com/40oleg/nona/blob/main/docs/runtime-memory.md).

### Исключения, сопрограммы и цикл событий

- Исключения раскручивают нативные кадры по настоящим unwind-данным; переполнение стека бросает перехватываемый `RangeError`.
- Генераторы и async-функции работают на собственных стеках и переключают контекст на `yield` и `await`.
- После программы верхнего уровня точка входа запускает цикл событий: он выполняет задания Promise, ждёт следующего таймера, не загружая CPU, и завершается, когда ничего не осталось ([подробности](/ru/reference/host-apis)).

## Линковка

- **PE32+** ([`src/backend/pe`](https://github.com/40oleg/nona/tree/main/src/backend/pe)): секции, таблица импорта (KERNEL32 для runtime и DLL, объявленные через FFI), базовые релокации, unwind-данные и ресурсы (иконка, манифест, сведения о версии).
- **ELF64** ([`src/backend/elf`](https://github.com/40oleg/nona/tree/main/src/backend/elf), [`src/backend/linux`](https://github.com/40oleg/nona/tree/main/src/backend/linux), [`src/backend/bsd`](https://github.com/40oleg/nona/tree/main/src/backend/bsd)): у каждой функции KERNEL32, которую использует runtime, есть прослойка на системных вызовах с тем же соглашением о вызовах, поэтому код runtime общий для всех целей. Linux и BSD делают вызовы ядра напрямую, без libc.
- **Mach-O64** ([`src/backend/macho`](https://github.com/40oleg/nona/tree/main/src/backend/macho), [`src/backend/darwin`](https://github.com/40oleg/nona/tree/main/src/backend/darwin)): исполняемые файлы для macOS на Intel тоже используют прямые вызовы ядра; на Apple Silicon они загружают системную `libSystem.B.dylib` через dyld для запуска и служб ОС.

Один и тот же runtime обслуживает все восемь целей; что и где проверено, перечислено на странице [Нативные платформы](/reference/native-platforms).

## Самосборка

Компилятор компилирует сам себя. Выпускаемый `nona` — нативный исполняемый файл, собранный Nona без Node.js внутри; на Windows и Linux x64 он пересобирает себя во второй этап, побайтово идентичный первому. [Руководство по начальной сборке](https://github.com/40oleg/nona/blob/main/docs/self-hosting.md) описывает порядок действий и проверки.

## FFI

Вызов `define('user32.dll', 'MessageBoxW', 'i32(ptr,wstr,wstr,u32)')` разрешается при компиляции: объявление становится записью в таблице импорта PE и нативным переходником (thunk), который преобразует значения JavaScript, соблюдает ABI Win64 и сохраняет `GetLastError`. На Linux `define('syscall', '1', …)` объявляет прямой системный вызов. См. [Нативные функции (FFI)](/ru/reference/ffi).

## Структура репозитория

```text
src/frontend       lexer, parser, early errors, scope binding, compile-time eval/Function
src/ir             intermediate representation, lowering and liveness
src/backend/x64    x86-64 encoding and code generation
src/backend/arm64  AArch64 encoding and code generation
src/backend/pe     PE32+ linker: imports, relocations, unwind data, resources
src/backend/elf    ELF64 linker; src/backend/linux, bsd: system-call shims
src/backend/macho  Mach-O64 linker; src/backend/darwin: macOS services
src/runtime        native runtime and JavaScript preludes emitted into every executable
tests              unit, integration, native-execution and compatibility tests
examples           sample programs
site               this documentation site
```

## Formal verification prototype

[Lean proofs](https://github.com/40oleg/nona/blob/main/docs/formal-verification.md) cover selected slot move rules and a modeled straight-line dead-move optimizer. Run `npm run check:proofs` with Lean/elan installed. The production compiler, CFG analysis and native runtime are outside the current formal guarantee.
