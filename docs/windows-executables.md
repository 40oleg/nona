# Windows executables

## Interactive settings example

```sh
nona build site/samples/settings.win32.mjs --target win32-x64 --subsystem windows -o settings.exe
```

The [sample](../site/samples/settings.win32.mjs) has a checkbox, seven choices,
Save/Cancel, keyboard navigation and a visible background timer counter. Save
commits the draft; Cancel or title-bar close discards it. It reopens after one
second and disposes/exits explicitly after 60 seconds. Its PE subsystem is 2.
The [modeless bridge contract](win32-settings.md) describes main-thread event
delivery, exceptions, resource lifetime and the pauses caused by synchronous
OS calls/native modal loops. It is supported only on Windows x64.

## Subsystem

`nona build app.js -o app.exe --subsystem windows` marks the PE image as a
GUI program (optional header Subsystem 2). Windows then starts it without a
console window, which suits background programs and tray utilities. The
default is `--subsystem console` (3). The option requires `--target win32-x64`.

A GUI program still writes `console.log` output to standard output handles it
inherits (for example pipes set up by the parent process). When there is no
standard output — no console, a closed or detached handle, or a failing
write — the output is dropped and the program continues; earlier versions
terminated with exit code 1.

## Resources

```text
nona build app.js -o app.exe --icon app.ico --manifest app.manifest --version-info version.json
```

- `--icon` embeds every image of a `.ico` file (`RT_ICON` 1…n and
  `RT_GROUP_ICON` 1); Explorer and the taskbar show it.
- `--manifest` embeds an application manifest (`RT_MANIFEST` 1). It must be a
  valid manifest: Windows refuses to start a program with a malformed one. Programs built
  with `--subsystem windows` and no manifest get a default one: `asInvoker`,
  Windows 10/11 compatibility and per-monitor DPI awareness.
- `--version-info` reads a JSON object with any of `FileVersion`,
  `ProductVersion` (`"major.minor.build.revision"`, parts 0–65535),
  `ProductName`, `FileDescription`, `CompanyName`, `LegalCopyright`,
  `OriginalFilename`, `InternalName` and `Comments`, shown in the file's
  Properties → Details (`RT_VERSION` 1, language 0409, code page 04B0).

```json
{
    "FileVersion": "1.0.0.0",
    "ProductName": "Museum",
    "FileDescription": "Paintings on the desktop",
    "CompanyName": "Oleg"
}
```

The same options are available as `icon` (bytes), `manifest` (string) and
`versionInfo` (object) in `compile()`. They require `--target win32-x64`.

The CLI refuses to write its output over an explicit icon, manifest or version
information file, including through a symbolic link, an alias in a parent
directory or a hard link. These files receive the same protection as every
source file and `package.json` successfully read for compilation or resolution.
