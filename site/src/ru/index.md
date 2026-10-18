---
layout: home

hero:
    name: Nona
    text: JavaScript в нативные исполняемые файлы
    tagline: Компилятор ahead-of-time, который превращает JavaScript ES2020 в небольшие самостоятельные исполняемые файлы для Windows, Linux, macOS, FreeBSD и OpenBSD. Без встроенного интерпретатора и без C-тулчейна.
    actions:
        - theme: brand
          text: Начать
          link: /ru/guide/getting-started
        - theme: alt
          text: Попробовать в браузере
          link: /playground
        - theme: alt
          text: Что такое Nona
          link: /ru/guide/what-is-nona
        - theme: alt
          text: GitHub
          link: https://github.com/40oleg/nona

features:
    - title: Запуск за 2 мс
      details: Скомпилированный hello world стартует примерно за 2 мс и занимает не больше 11 МБ памяти при размере файла около 2 МБ. Node.js нужно 28 мс и 45 МБ; исполняемый файл Node SEA весит 124 МБ.
      link: /ru/guide/performance
    - title: Восемь целей с любого хоста
      details: Windows, Linux и macOS на x64 и ARM64, FreeBSD и OpenBSD на x64. Кросс-компиляция с --target; каждый исполняемый файл самодостаточен.
      link: /reference/native-platforms
    - title: Язык ES2020
      details: Классы, генераторы, async-функции, деструктуризация, optional chaining, BigInt, proper tail calls и ES-модули с циклами и live bindings, с документированными исключениями.
      link: /ru/guide/language-support
    - title: Пакеты npm
      details: Пакеты из node_modules разрешаются при сборке и компилируются в исполняемый файл вместе с модулями Node.js, которые им обычно нужны.
      link: /reference/npm
    - title: API хоста в стиле Node.js
      details: Таймеры и цикл событий, process, fs, path, Buffer, потоки, события, URL, серверы и клиенты HTTP и TCP.
      link: /ru/reference/modules
    - title: Нативный runtime
      details: Точный mark-and-sweep сборщик мусора, строки UTF-16, настоящие исключения, перехватываемый RangeError при переполнении стека и самосборный компилятор.
      link: /ru/guide/how-it-works
    - title: FFI и GUI-программы для Windows
      details: Вызов любого экспорта DLL в Windows и любой функции разделяемой библиотеки в Linux и macOS по объявлениям времени компиляции, а также программы Windows без консольного окна, с иконкой, манифестом и сведениями о версии.
      link: /ru/reference/ffi
---

## Короткий пример

<<< ../../samples/hello.js

::: code-group

```sh [Windows]
nona build hello.js -o build/hello.exe
.\build\hello.exe
```

```sh [Linux and macOS]
nona build hello.js -o build/hello
./build/hello
```

```sh [Cross-compile]
nona build hello.js -o build/hello --target linux-arm64
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

Исполняемый файл содержит машинный код программы и runtime Nona. Node.js ему не нужен: программа для Windows импортирует только `KERNEL32.dll`, а программа для Linux делает системные вызовы напрямую, без libc.

## Статус

Текущий релиз — **v0.19.0**; Nona — экспериментальный проект. Он не заменяет Node.js и не проходил аудит безопасности.

- **Соответствие.** В последнем полном аудите (v0.8.0) закреплённый набор Test262 на Windows x64 проходил 22436/22492 тестов language, 15868/15933 built-ins, 268/268 Atomics и 996/1016 Annex B. Каждый оставшийся отказ разобран на [странице статуса](/ru/guide/status).
- **Скорость.** Сильные стороны Nona — время запуска, размер файла и память. У вычислений внутри программы нет JIT: от уровня V8 на простых циклах до нескольких раз и десятков раз медленнее на вызовах, выделении памяти и долго работающих настоящих программах. Измерения и известные медленные места — в разделе [Производительность](/ru/guide/performance).
- **Ограничения.** `eval` и `Function` требуют исходный текст, известный при компиляции, и существуют только те API Node.js, которые реализованы в Nona. См. [Совместимость и ограничения](/ru/guide/compatibility).
