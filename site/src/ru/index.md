---
layout: home

hero:
  name: Nona
  text: JavaScript в нативные исполняемые файлы
  tagline: Компилятор ahead-of-time, который превращает JavaScript ES2020 в самостоятельные исполняемые файлы Windows и Linux x64. Без встроенного интерпретатора и без C-тулчейна.
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
    details: Скомпилированный hello world стартует за 1,8 мс и занимает не больше 11 МБ памяти при размере файла 7 МБ. Node.js нужно 28 мс и 45 МБ; исполняемый файл Node SEA весит 124 МБ.
    link: /ru/guide/performance
  - title: Язык ES2020
    details: Классы, генераторы, async-функции, деструктуризация, optional chaining, BigInt, proper tail calls и ES-модули с циклами и live bindings — с документированными исключениями.
    link: /ru/guide/language-support
  - title: Нативный runtime
    details: Точный mark-and-sweep сборщик мусора, строки UTF-16, настоящие исключения и перехватываемый RangeError при переполнении стека — в каждом исполняемом файле.
    link: /ru/guide/how-it-works
  - title: API хоста
    details: Цикл событий с таймерами, глобальный process, синхронный node:fs, TextEncoder и TextDecoder.
    link: /ru/reference/host-apis
  - title: FFI и nona:win32
    details: Вызов любого экспорта DLL на Windows по объявлениям времени компиляции; готовые привязки к user32, kernel32 и advapi32.
    link: /ru/reference/ffi
  - title: GUI-программы для Windows
    details: Программы без консольного окна, с иконкой, манифестом приложения и сведениями о версии.
    link: /ru/reference/windows-executables
---

## Короткий пример

<<< ../../samples/hello.js

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

Исполняемый файл содержит машинный код программы и runtime Nona. Node.js ему не нужен: программа для Windows импортирует только `KERNEL32.dll`, а программа для Linux делает системные вызовы напрямую, без libc.

## Статус

Текущий релиз — **v0.7.0**. Закреплённый набор Test262 (возможности ES2020) на Windows x64 проходит 17298/17337 тестов language, 15491/15559 built-ins, 268/268 Atomics и 996/1016 Annex B; каждый оставшийся отказ разобран на [странице статуса](/ru/guide/status). Сильные стороны Nona — время запуска, размер файла и память; вычисления внутри программы в 20–100 раз медленнее, чем в V8, а некоторые операции (`Map`, `sort`, сборка строк, длинные цепочки Promise) пока растут сверхлинейно, см. [Производительность](/ru/guide/performance). Nona — экспериментальный проект: он не заменяет Node.js и не проходил аудит безопасности.
