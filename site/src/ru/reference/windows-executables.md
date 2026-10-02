# Исполняемые файлы Windows

::: info Перевод
Это перевод английской страницы [Windows executables](/reference/windows-executables), созданной из [`docs/windows-executables.md`](https://github.com/40oleg/nona/blob/main/docs/windows-executables.md). Английская версия — основная и может быть новее.
:::

## Подсистема

`nona build app.js -o app.exe --subsystem windows` помечает образ PE как GUI-программу (поле Subsystem необязательного заголовка равно 2). Тогда Windows запускает её без консольного окна, что подходит для фоновых программ и утилит в области уведомлений. По умолчанию используется `--subsystem console` (3). Параметр требует `--target win32-x64`.

GUI-программа по-прежнему пишет вывод `console.log` в унаследованные дескрипторы стандартного вывода (например, в каналы, созданные родительским процессом). Если стандартного вывода нет — нет консоли, дескриптор закрыт или отсоединён, либо запись завершается ошибкой, — вывод отбрасывается, и программа продолжает работу; ранние версии в этом случае завершались с кодом 1.

## Ресурсы

```text
nona build app.js -o app.exe --icon app.ico --manifest app.manifest --version-info version.json
```

- `--icon` встраивает все изображения из файла `.ico` (`RT_ICON` 1…n и `RT_GROUP_ICON` 1); её показывают Проводник и панель задач.
- `--manifest` встраивает манифест приложения (`RT_MANIFEST` 1). Манифест должен быть корректным: Windows отказывается запускать программу с повреждённым манифестом. Программы, собранные с `--subsystem windows` без манифеста, получают манифест по умолчанию: `asInvoker`, совместимость с Windows 10/11 и поддержка DPI для каждого монитора.
- `--version-info` читает JSON-объект с любыми из полей `FileVersion`, `ProductVersion` (`"major.minor.build.revision"`, части 0–65535), `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`, `OriginalFilename`, `InternalName` и `Comments`, которые показываются в окне «Свойства → Подробно» (`RT_VERSION` 1, язык 0409, кодовая страница 04B0).

```json
{ "FileVersion": "1.0.0.0", "ProductName": "Museum", "FileDescription": "Paintings on the desktop", "CompanyName": "Oleg" }
```

Те же параметры доступны в `compile()` как `icon` (байты), `manifest` (строка) и `versionInfo` (объект). Они требуют `--target win32-x64`.
