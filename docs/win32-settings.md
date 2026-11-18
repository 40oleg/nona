# Modeless Windows settings

`nona:win32/settings` is a narrow Windows x64 bridge (#649). Importing it on
any other target, including Windows ARM64, is a compile error. Existing
`nona:win32` exports are unchanged. This is not a general FFI callback ABI.
One live settings window per process is supported.

```js
import { SettingsWindow } from "nona:win32/settings";

let saved = { checked: false, choice: 0 };
const settings = new SettingsWindow({
    title: "Settings",
    checkboxLabel: "Enabled",
    choices: ["One", "Two", "Three", "Four", "Five", "Six", "Seven"],
    onEvent(event) {
        if (event.type === "save")
            saved = { checked: event.checked, choice: event.choice };
        // cancel and close discard the draft; open(saved) may be called here.
    },
});
settings.open(saved);
// settings.setStatus("Background ticks: 10");
// settings.close();   // silently discard the draft; reusable
// settings.dispose(); // silently close; permanently unusable
```

The constructor requires exactly seven string choices and one `onEvent`
function. Title, checkbox label and each choice accept at most 127 UTF-16 code
units, without NUL. Defaults are "Settings" and "Enabled". `open({checked,
choice})` requires a Boolean and an integer choice from 0 through 6. It throws
if this or another settings window is already open, or after disposal. A
failed native creation throws and releases all partially created controls;
another open can be attempted. `isOpen` reflects the JavaScript session.
`setStatus(text)` updates the visible status line while open (same text limit).
If a native text update fails it throws, leaving the session open for retry or close.
Closing and disposal are idempotent. Disposed instances cannot reopen.

Save commits nothing automatically: its event contains the selected Boolean
`checked` and zero-based `choice`. The application decides where to store them.
Cancel, Escape and the title-bar close button discard the draft. Events have
`type` equal to `save`, `cancel` or `close`; only Save includes draft values.
Tab/Shift+Tab navigate controls, Space toggles the checkbox, selection keys
operate the drop-down, Enter activates the focused/default button and Escape
cancels. Standard mouse interaction works as well.

All windows and their controls belong to the main JavaScript thread. Native
window procedures perform synchronous Win32 work and record only native
integers. They never call JavaScript or allocate managed objects. The private
helper does not retain temporary JavaScript/FFI buffers: Windows copies text
during creation and updates; handles and the pending result live in a fixed
native slot owned by the image. Destroying the parent destroys child controls.
The immutable dialog template and fixed slot remain until process exit; no per-open
native heap allocation is retained.

The existing `__nonaIoLoop` poller pumps at most 64 queued messages per poll and waits
at most 10 ms, limited further by the next timer. It uses an OS message wait,
not a spin loop. Timers, other I/O pollers and Promise jobs continue while the
window is open. Synchronous application/FFI calls pause this thread. Windows
native modal loops (for example moving a window, a system menu, a drop-down or
a message box) can pause JavaScript timers until the OS call returns. There is
no background GUI thread and no promise of JavaScript progress inside those
native loops.

Native messages are processed in queue order. The first terminal action
captures the draft if saving, destroys the window, and ends that session's
message batch. One event is delivered after native dispatch has returned.
The session is detached before calling `onEvent`, so handlers can close,
dispose or reopen safely. Each ready event carries its JavaScript session
identity; closing/disposal invalidates it, and it cannot affect a later open.
The native slot is cleared before reuse. No event is delivered for explicit
`close()` or `dispose()`. The listener runs synchronously with the
`SettingsWindow` as `this`; its return value, including a Promise, is ignored.
Synchronous listener exceptions follow the existing I/O poller's
`uncaughtException` policy; they never unwind through Win32 frames. A rejected
Promise follows the normal unhandled-rejection policy.
Microtasks drain after the event (also after a handled exception), before the
next I/O event. A handler that reopens synchronously finishes before its queued
Promise jobs run; a reopen scheduled by a timer runs after those jobs. Unhandled
exceptions terminate normally under Nona's policy.

An open session and its pending event keep the process alive. A closed or
disposed instance does not; keep a referenced timer or other I/O handle if
reopening later is required. Closing never posts `WM_QUIT` or exits the
process. Explicit `process.exit()` terminates background work and Windows
reclaims process resources; dispose first for deterministic window cleanup.

Build the complete [settings sample](../site/samples/settings.win32.mjs) as a
GUI-subsystem executable:

```sh
nona build site/samples/settings.win32.mjs --target win32-x64 --subsystem windows -o settings.exe
```

The sample shows a background counter, reopens after each action, and exits
explicitly after a bounded demonstration. Its PE subsystem is 2. Artwork,
wallpaper changes, startup registration and distribution belong to the host
application, not this bridge.
