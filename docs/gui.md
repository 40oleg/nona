# Ubuntu native GUI foundation

`nona:gui` is an opt-in, experimental Linux x64 host module for #664. This
first stage implements native GTK 4 top-level windows and deferred events.
Retained elements, layout, styling, drawing, assets, controls, input and
accessibility are later stages, not implemented exports. The complete issue
acceptance criteria remain open. Keep the eventual PR draft until native
acceptance evidence and the remaining stages are complete.

## Platform and dependencies

The hosted window-bridge job targets Ubuntu 24.04 LTS x86-64. This is a
configured validation target, not a completed desktop smoke receipt. The
bridge uses GTK 4.0 APIs; [GTK 4.0 requires GLib 2.66 or newer](https://github.com/GNOME/gtk/blob/4.0.0/meson.build).
Install `libgtk-4-1`; the loader resolves `libgtk-4.so.1`,
`libgobject-2.0.so.0` and `libglib-2.0.so.0` and their system dependencies.
No C compiler, application helper library, browser, WebView, DOM, Node.js or
Electron is used by a compiled application. Missing libraries fail at ELF
load time. With libraries installed but no working display, `open()` throws
an initialization error without terminating the process. Import and
construction alone do not initialize GTK. Failed initialization is cached;
retry in a new process after correcting the display environment.

This is a narrow opt-in exception to the dependency-free native executable
rule: only an image using the GUI bridge imports these desktop libraries.
Console binaries keep their previous dependency set, including static,
libc-free ELF output when no library FFI is used. Other targets are rejected
at compile time. Agent programs are rejected at code generation; native
entry also checks Linux gettid equals getpid before touching GTK. No GTK
access is supported from runtime worker threads, which lack libc TLS.

## Window API

```js
import { Window } from "nona:gui";
const window = new Window({
    title: "Nona",
    width: 640,
    height: 480,
    onEvent(event) {
        console.log(event.type);
    },
});
window.open(); // creates and presents; returns this
window.resize(800, 600); // requests a logical size, compositor decides final size
// window.show();    // present an already open window
// window.close();   // silently destroy this session; may reopen
// window.dispose(); // silently close and permanently reject open/updates
```

Title is a string without NUL, at most 511 UTF-8 bytes. Width and height are
integers 1..16384, in GTK logical pixels. Defaults are Nona / 640 / 480.
`onEvent` is an optional function. Invalid options throw before native work.
`isOpen` reflects the managed session. Up to 32 simultaneous windows are
supported, each independently owned. Opening an open/disposed instance throws.
`show()` and `resize()` require an open instance. `close()` and `dispose()`
are idempotent. A failed creation disconnects handlers and destroys the
partial window before releasing its slot; another open may be attempted.

Events are `{type: "resize", width, height}`, `{type: "scale", scaleFactor}`
and `{type: "close"}`. Resize/scale report observations after GLib dispatch;
their first positive observation is also delivered. Changes coalesce to the
latest observed value. A request is not evidence that the compositor applied
it. Close-request records a terminal event and inhibits GTK default closing;
the poller destroys the window before delivering `close`. It detaches the
session before user code, allowing reopen from a listener. Explicit close or
dispose discards pending notifications and delivers no close event.

Listeners and windows are held by managed module session objects reachable
from the registered poller. Native records never hold managed Values. Ready
events carry both slot and generation; close/dispose invalidates old events.
Listeners run with the Window receiver; return values are ignored. Exceptions
use the existing I/O loop's `runReady` / uncaught-exception handling, and its
microtask checkpoint runs after each event, including handled exceptions.
No JS runs inside GTK callbacks. Long synchronous JS/native calls pause GUI
dispatch; there is no GUI background thread or nested-loop progress guarantee.

Open sessions and undelivered terminal events keep the event loop referenced.
After the last close/dispose/event, normal exit waits only for other referenced
work. Disposing all windows disconnects handlers and releases GTK toplevel
ownership. The default context/display and fixed native records remain process
resources; explicit process exit is reclaimed by the OS.

## Retained API boundary for subsequent stages

The intended extension is a Window-owned retained element tree: elements have
stable IDs, typed properties, children and explicit disposal; updates validate
before applying, events refer to IDs plus session generations, and disposal
invalidates pending events before releasing assets. No public raw GTK handles,
native pointers or general FFI callbacks will be exposed. Rows, columns,
stacking, positions, clipping, scrolling, precise style, custom drawing,
assets and accessible controls must extend this document with tested semantics
before becoming supported exports. There is currently no `Element`, `update`,
input or drawing API; this paragraph specifies the extension boundary only.

## Private bridge protocol, version 1

The module captures/removes `__nonaGui`. Its single argument is a Uint32Array
with at least 160 elements over a fixed, nonshared, attached ArrayBuffer,
borrowed only for a synchronous call. A view with a nonzero byte offset is
valid; the bridge borrows that view's bytes. Other element types, undersized,
detached, shared and resizable backing stores throw before GTK is touched.
The wrapper supplies exactly 160 elements. Words:
0 operation; 1 slot (0..31); 2 generation; 3 width; 4 height; 5 timeout ms;
6 event type; 7 observed width; 8 observed height; 9 observed integer scale.
Bytes 64..575 hold a NUL-terminated UTF-8 title (512 bytes). Operations are
1 create/present, 2 destroy/discard, 3 poll/take, 4 present, 5 resize.
Create writes slot/generation; poll writes event fields. Return is 0 (success
or no event), 1 (one event), -1 (initialization), -2 (capacity/generation),
-3 (stale/invalid command), -4 (partial creation), -5 (wrong thread).
The protocol is private and may change alongside its only caller.

Each native slot contains a GTK pointer, signal ID, generation, pending close
bit, observed dimensions/scale and coalesced dirty bits. There is no unbounded
queue: one terminal record plus the latest resize and scale per slot is the
entire capacity. Close dominates other notifications. Round-robin extraction
prevents one window starving another. Generations never wrap: a slot reaching
2147483647 is retired. Callbacks copy scalar data to image-owned records;
they never retain transient signal data, invoke JS or allocate managed memory.
Ownership is cleared and signals disconnected before synchronous destruction,
so nested signals cannot revive a session. Slots are reused only after cleanup.

Win64-shaped runtime calls cross dedicated SysV wrappers, preserving RDI/RSI
and XMM6..15 with aligned calls and marshalled fifth/sixth arguments. The
SysV close callback adapts to the internal Win64 record helper while preserving
SysV nonvolatile registers. The public `nona:ffi` ABI is unchanged. Helpers
perform no managed allocation; future helpers retaining Values across allocating
calls must use [rootedFn](../src/runtime/root-scope.ts) and follow
[runtime memory rules](runtime-memory.md).

`__nonaIoLoop` registers one GUI poller. One native poll performs at most eight
nonblocking default-context iterations, samples live windows, then extracts at
most one event. When idle it sleeps via GLib for at most 10 ms, reduced by the
relative timeout and the absolute timer deadline supplied by
[the timer loop](../src/lib/runtime/timers.js). The wrapper recomputes the
remaining deadline in `performance.now()` units after preceding pollers; the
native helper converts milliseconds to microseconds and subtracts time spent
dispatching and sampling before requesting sleep. An expired deadline or a
nonblocking poll requests no sleep. These are bounds on requested waits, not
real-time guarantees about OS scheduling or time spent in GTK callbacks.
Other pollers and timers retain their existing scheduling and exception policy. This uses bounded
[GLib iteration](https://docs.gtk.org/glib/main-loop.html), not a nested
`g_main_loop_run`; [GTK thread affinity](https://docs.gtk.org/gtk4/section-threading.html)
is maintained. A GLib source's own unbounded callback can still block the thread.

## Validation and acceptance receipts

[gui-bridge.test.ts](../tests/gui-bridge.test.ts) is registered in the frontend
suite and the always-GC-stress list. Its layers establish different guarantees:

| Check                                                  | Established boundary                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VM wrapper tests                                       | Validation before native work, independent session ownership, invalidation between `poll` and `run`, stale generations, silent disposal, close/reopen before listener invocation and timer budget conversion.                                                                                       |
| Executable native probes, GC stress off/on             | Win64/SysV register preservation (full 128-bit XMM6..15), aligned calls, distinct fifth/sixth arguments, narrow GTK returns, borrowed-buffer validation, main-thread rejection branch, partial cleanup, capacity, generation retirement, round-robin/coalesced delivery and bounded dispatch/sleep. |
| Compiled wrapper and real timer loop, GC stress off/on | Poller roots keep otherwise unreachable windows/listeners alive, multiple pollers progress, handled exceptions checkpoint Promises, unhandled exceptions fail, close handlers may reopen, last-window close drains its final Promise and allows normal exit.                                        |
| Cross-compilation and ELF inspection                   | Unsupported targets/agents reject the bridge, public FFI callback types remain reserved, unrelated programs link on all eight targets without GUI imports; Linux console images retain no `DT_NEEDED` entries.                                                                                      |
| Opt-in real GTK fixture                                | A real native close request, multiple windows, resize/scale observations, reopen, disposal while stdout is pending, and continuing timers, Promises and child stdout. Requires Linux x64 and a display; skipped elsewhere.                                                                          |

The executable probes replace only external GTK/GLib calls with native stubs
using [test composition](../tests/helpers/gui-native.ts). On Windows they also
replace Linux thread-identity syscalls; on Linux normal probes use real kernel
thread IDs. A separate probe forces the wrong-thread branch before any GTK
call. These probes establish Nona bridge behavior, not GTK window-system
behavior. The standalone ABI probes exercise both directions of the callback
boundary without adding public FFI callbacks or production test hooks.

The bounded [real window fixture](../tests/fixtures/gui-window.mjs) uses GTK's
own [close request](https://docs.gtk.org/gtk4/method.Window.close.html) to exercise
the installed native signal callback. Build/run on an Ubuntu desktop:

```sh
npm ci
npm run build
node dist/cli.js build tests/fixtures/gui-window.mjs --target linux-x64 -o work/gui-window
./work/gui-window
```

For the focused tests after building:

```sh
NONA_GTK_GUI_TESTS=1 node --test --test-concurrency=1 dist/tests/gui-bridge.test.js
```

Each native case requests GC stress both disabled and enabled. Leave
`NONA_GC_STRESS` unset or set to `on`; `off` overrides even the stress-enabled
compiler requests. The fixture has a four-second application deadline, and
the test runner imposes a fifteen-second process deadline.
[The hosted window-bridge job](../.github/workflows/gui-bridge.yml) configures
Ubuntu 24.04 with GTK and an isolated Xvfb X11 display, runs the focused file
at concurrency 1, records package versions, source commit, raw native output
and headless console `readelf` output, and retains artifacts on failures.
Its Xvfb launcher owns and reaps its display process.

Local Windows native probes do not establish Linux desktop support. Hosted
execution of this revision is pending until the harness pushes it. No actual
Wayland, mapped-surface backend/scale or Ubuntu 20.04 result is claimed here.
The minimal window fixture is not the complete acceptance example: layout,
text/image, controls, input, drawing and fixtures remain for stages 2..4.

The final hosted matrix must run on Ubuntu 24.04, X11/Xvfb and Wayland/headless
Weston at scales 1 and 2. Isolate each display, wait for `xdpyinfo` or a
`wayland-info` round trip, and bound/reap all launcher processes. Record actual
mapped surface backend type, positive size, scale after a presented frame,
PID/session/generation and ordered timer, Promise, real I/O, close/reopen and
disposal traces. Two launches at different scales establish initial scales,
not a scale-change callback; the latter requires two values on one surface.
Mapped-surface backend diagnostics are still a later-stage gap. Keep raw logs,
reference traces and failures as workflow artifacts. Compare `readelf -d`
direct dependencies of identical console sources built by base and candidate,
and run the console binary with both display variables cleared. Source tests
of dependency isolation supplement but do not replace those native receipts.
