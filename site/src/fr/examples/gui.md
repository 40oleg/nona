# Native Ubuntu desktop

`nona:gui` provides experimental native GTK windows, retained layout/drawing, buttons, text entry, toggles, focus/shortcuts and asynchronous system folder selection on Ubuntu 24.04 x64 with GTK 4.14. See the shared English [API and installation contract](/reference/gui), [retained API](/reference/gui-elements) and [two-screen example](/examples/gui). Hosted X11/Wayland receipts at scales 1/2 and a live scale change remain pending; stock Ubuntu 20.04 dependencies are unsupported.

The shared English [example and exact ELF build command](/examples/gui) is the maintained source for this experimental API. Distribute the local `gui-assets/` directory beside the executable. The sample covers service/log and settings screens while a real child writes stdout. Native acceptance remains open until the hosted artifacts pass.
