# Native Ubuntu desktop

The experimental `nona:gui` module provides GTK windows and retained elements on
Ubuntu 24.04 x86-64 with GTK 4.14. Its executable uses the system graphics libraries
without a browser, DOM, WebView, Electron or Node.js. Stock Ubuntu 20.04 and 22.04
do not meet the supported library floor. Native acceptance receipts are pending.

The sample has a service list and scrolling stdout log, a settings page with a
toggle and system folder chooser, local image/font assets, custom drawing, native
text entry, focus navigation, shortcuts and application-state updates. A real
child writes stdout while timers and Promise continuations run. Finish demo
disposes the controls and lets remaining work drain; closing the window reopens it.

```sh
sudo apt-get install libgtk-4-1 libpangoft2-1.0-0 python3
npm ci
npm run build
mkdir -p work/gui-demo/gui-assets
node dist/cli.js build site/samples/gui.linux.mjs --target linux-x64 -o work/gui-demo/gui
cp site/samples/gui-assets/* work/gui-demo/gui-assets/
./work/gui-demo/gui
```

The child uses Python only for this demonstration. Distribute `gui-assets/` with
the ELF. Scroll log changes the retained scroll offset; automatic wheel scrolling
and scrollbars are not implemented. Ctrl+S switches pages, Ctrl+L scrolls and
Ctrl+R resizes. Tab/Shift+Tab and Enter/Space use GTK focus and activation.

See the shared [window, installation and lifecycle reference](/reference/gui),
[layout/control reference](/reference/gui-elements) and
[hosted native evidence requirements](/reference/gui#validation-and-acceptance-receipts).
Import/element construction does not initialize a display; `open()` throws when
libraries are installed but a usable display is absent. GUI library loading still
requires the system packages. Console ELF dependencies remain unchanged.

<<< ../../samples/gui.linux.mjs{js}
