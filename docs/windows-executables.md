# Windows executables

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
