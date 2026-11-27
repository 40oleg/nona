# Ubuntu native GUI foundation

`nona:gui` is an opt-in, experimental Linux x64 host module for #664. The
module implements native GTK 4 windows, deferred events, retained
elements, layout, styling, drawing, local assets, native controls, input and
asynchronous folder selection. A Nona-owned service-console example and hosted
desktop acceptance workflow are included. The complete issue acceptance criteria
remain open until the native receipts pass. Keep the eventual PR draft until then.

## Platform and dependencies

The hosted window-bridge job targets Ubuntu 24.04 LTS x86-64. This is a
configured validation target, not a completed desktop smoke receipt. The
supported baseline is **Ubuntu 24.04 x86-64, GTK 4.14 and GLib/GObject/GIO 2.80**.
The chooser uses [GtkFileDialog, introduced in GTK 4.10](https://docs.gtk.org/gtk4/class.FileDialog.html);
the earlier GTK 4.0/Ubuntu 22.04 compatibility claim no longer applies.
Install `libgtk-4-1`; the loader resolves `libgtk-4.so.1`,
`libgobject-2.0.so.0`, `libglib-2.0.so.0`, `libgio-2.0.so.0`, `libcairo.so.2`,
`libpango-1.0.so.0`, `libpangocairo-1.0.so.0`, `libpangoft2-1.0.so.0` and
`libfontconfig.so.1` and their system dependencies. The rendering baseline is
GTK 4.14, GLib/GObject/GIO 2.80, Cairo 1.18, Pango 1.52 and Fontconfig 2.15,
using Ubuntu 24.04 distribution packages. These are supported library floors;
the newest directly imported GTK API is `GtkFileDialog` (4.10), while imported
GLib/GObject/GIO APIs predate 2.80. Older combinations are unvalidated and
unsupported. Stock Ubuntu 20.04 is unsupported because it does not
provide the required GTK 4 desktop stack. No Ubuntu 20.04 execution receipt
or backported-library support is claimed.
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
it. Retained layout keeps the last observed dimensions until a resize event
arrives, including element updates after an ignored request. Before the first
observation it uses the constructor dimensions. Close-request records a terminal
event and inhibits GTK default closing;
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

## Retained elements, layout and rendering

`Window.setRoot(elementOrNull)` attaches a retained tree constructed with the
exported `Element` class. Rows, columns, stacks, text, PNG images and drawing
surfaces are available. `Element.update`, `setChildren` and subtree `dispose`
validate changes and preserve the previous scene if native preparation fails.
IDs are stable; elements belong to their first window until disposal, including
while detached. Closing retains the tree; window disposal releases all owned
elements. See [native controls and input](gui-elements.md#native-controls-and-input)
for editing, focus, accessibility and native propagation policies.

The [retained API reference](gui-elements.md) specifies typed properties,
layout and clipping rules, scale conversion, drawing commands, native storage,
asset path resolution and ownership, rollback and limits. Its guarantees are
checked by [gui-elements.test.ts](../tests/gui-elements.test.ts) with
[local fixtures](../tests/fixtures/gui/README.md). GTK draw callbacks only
replay native-owned recordings, with no JS, asset decoding or widget mutation,
following [GTK's drawing restrictions](https://docs.gtk.org/gtk4/method.DrawingArea.set_draw_func.html).

## Asynchronous folder selection

```js
const folder = await window.chooseFolder({
    title: "Choose workspace", // optional, same limits as window title
    initialFolder: "/home/me", // optional absolute local path, <=4095 UTF-8 bytes
});
if (folder !== null) console.log(folder);
// window.cancelFolder(); // cancel outstanding requests for this window
```

Requires an open window. The GTK system chooser runs asynchronously through
the default context; timers, Promises and child I/O continue. It resolves to
an absolute local path, or `null` for dismissal, explicit cancellation or parent
close/disposal. Backend failures and nonlocal selections reject. The chooser is
modal to its parent; it does not run a nested main loop. Up to 32 requests may
be outstanding across all windows.

Each request keeps its native dialog, cancellable and managed resolver rooted
until GTK finishes, even after cancellation or destruction of its parent.
Both poller `active()` and `total()` include that work. Cancellation does not
prematurely release or recycle the record. Late completion is consumed exactly
once and releases its native objects/path/error; an old session cannot deliver
a selected path into a reopened window. Closing the last window therefore waits
for cancelled chooser completion as well as other referenced work.

## Acceptance application

Install the runtime packages on **Ubuntu 24.04 Desktop x86-64**:

```sh
sudo apt-get update
sudo apt-get install libgtk-4-1 libpangoft2-1.0-0 python3
```

Python is used only by this example's real periodic stdout child. The GUI runtime
does not require Python. Compile the example into a Nona-owned Linux ELF and copy
its assets beside the executable:

```sh
npm ci
npm run build
mkdir -p work/gui-demo/gui-assets
node dist/cli.js build site/samples/gui.linux.mjs --target linux-x64 -o work/gui-demo/gui
cp site/samples/gui-assets/* work/gui-demo/gui-assets/
./work/gui-demo/gui
```

[`gui.linux.mjs`](../site/samples/gui.linux.mjs) implements a service list with
editable service name, a scrolling stdout log, state-driven action counter,
local PNG image, custom drawing and a separate settings page with a native toggle
and system folder chooser. Tab/Shift+Tab traverse controls; Enter/Space activate
native buttons. Ctrl+S switches pages, Ctrl+L changes the log scroll offset and
Ctrl+R requests an 820×700 content size. The Scroll log button also changes the
offset; automatic scrollbars/wheel scrolling are not implemented. GTK owns text
entry, IM composition, focus and accessible roles/names.

Closing the native window deliberately reopens the retained tree after 100 ms.
Finish demo disposes it while timers and child stdout are still pending. The
example observes another 400 ms of background progress, stops its timer and child,
then lets the event loop drain normally. It does not call `process.exit()` on
success. An 80-second safety deadline sets a nonzero exit code. In acceptance
mode (`NONA_GUI_ACCEPTANCE=1`) the fourth folder request disposes its parent while
that request is pending; this mode is set only by the integration driver.

Local PNG/font paths resolve relative to the executable, not its working
directory. Distribute the `gui-assets/` directory with the ELF. Its pinned Abel
font includes its OFL license. See [asset limits and ownership](gui-elements.md)
and the [fixture provenance](../tests/fixtures/gui/README.md).

Supported backend targets are native **GDK X11 and GDK Wayland on Linux x64**.
The application runs without Node.js, a browser or a WebView. Other architectures,
desktop stacks, Ubuntu 22.04's stock GTK 4.6, and Ubuntu 20.04's stock GTK 3 are
unsupported. The minimum supported graphics-library versions are listed above;
they are validation floors, not a claim that every older library lacks every API.
Import/element construction works without a display; opening fails as described
under [platform and dependencies](#platform-and-dependencies). A GUI ELF still
needs its libraries even when it only imports the module without opening a window.

## Mapped-surface diagnostics

`window.inspectSurface()` requires an open window and returns a copied, read-only
observation: `slot`, `session` (generation), `surface` (opaque process-local identity
string), `mapped`, `backend` (actual GDK display runtime type), `width`, `height`,
`scaleFactor`, `frame`, `complete` and `presentationTime`. It performs no event
dispatch and exposes no callable native handle. Compare surface identity only
within one process/session; native pointers can be reused after destruction.

The bridge obtains the [native GDK surface](https://docs.gtk.org/gtk4/method.Native.get_surface.html),
queries its mapped state, dimensions, integer scale and display type, then checks
the current and up to seven preceding GDK frame timings. It reports a frame only
when its timing is complete and its actual presentation timestamp is positive.
`presentationTime` uses GLib's monotonic microsecond timebase; zero means no such
recent timing is available. A mapped surface or a
[complete timing](https://docs.gtk.org/gdk4/method.FrameTimings.get_complete.html)
alone is insufficient evidence of presentation. Call again after asynchronous
dispatch/redraw. Width/height are surface logical pixels and can include native
decoration extents; retained `Element.bounds` uses content coordinates. Device
fixture conversion multiplies logical bounds by the measured integer scale.

## Private bridge protocol, version 4

The module captures/removes `__nonaGui`. Its single argument is a Uint32Array
with at least 160 elements over a fixed, nonshared, attached ArrayBuffer,
borrowed only for a synchronous call. A view with a nonzero byte offset is
valid; the bridge borrows that view's bytes. Other element types, undersized,
detached, shared and resizable backing stores throw before GTK is touched.
Window commands supply 2048 elements; scene commands supply a larger packet. Words:
0 operation; 1 slot (0..31); 2 generation; 3 width; 4 height; 5 timeout ms;
6 event type; 7 observed width; 8 observed height; 9 observed integer scale.
Bytes 64..575 hold a NUL-terminated UTF-8 title (512 bytes). Operations are
1 create/present, 2 destroy/discard, 3 poll/take, 4 present, 5 resize, 6 replace scene,
7 focus control, 8 choose folder, 9 cancel request, 10 replace shortcuts,
11 inspect the mapped native surface.
Create writes slot/generation; poll writes event fields. Return is 0 (success
or no event), 1 (one event), -1 (initialization), -2 (capacity/generation),
-3 (stale/invalid command), -4 (partial creation), -5 (wrong thread),
-6 (candidate graphics/asset failure).
The protocol is private and may change alongside its only caller.

Inspection uses a zeroed output region: word 3 mapped, 4/5 logical width/height,
6 integer surface scale, 7/8 opaque native identity, 9/10 frame counter, 11/12
presentation timestamp, 13 timing complete, 15 display-name byte length (max 63),
and UTF-8 display type at byte 64. Two-word fields are low/high u32 halves.
Zero fields represent unavailable data. The caller must zero words 3 onward
before issuing the command. Native inspection validates the session generation
and borrows all GDK objects only for the synchronous call.

Scene words 10/11 are record count and exact packet byte length (max 8 MiB).
At byte 640 are up to 16384 128-byte records: u32 opcode at 0, primary string
offset at 4, fourteen f64 slots at 8..119, family/font offsets at 120/124.
UTF-8 NUL-terminated strings follow all records; zero offset means empty.
Opcodes are save, restore, rounded clip, rounded fill, rounded stroke, text,
PNG, line, circle (1..9), button, entry, checkbox (10..12). Control scalar slots
are ID, element generation, x/y/width/height, checked, enabled, state revision,
clip x/y/width/height. Strings are text and accessible label; font is unused.
Native validation bounds counts/offsets, requires
terminated strings, finite scalar slots within 2^30 and a balanced save stack
of at most 65 before allocating graphics resources. Native records hold only
GTK/Cairo handles; no managed pointers survive the synchronous call.

Each native slot contains a GTK pointer, signal ID, generation, pending close
bit, observed dimensions/scale and coalesced dirty bits. There is no unbounded
queue: one terminal record plus the latest resize and scale per slot is the
window-notification capacity. Close dominates other notifications. Round-robin extraction
prevents one window starving another. Generations never wrap: a slot reaching
2147483647 is retired. Callbacks copy scalar data to image-owned records;
they never retain transient signal data, invoke JS or allocate managed memory.
Ownership is cleared and signals disconnected before synchronous destruction,
so nested signals cannot revive a session. Slots are reused only after cleanup.

Input uses a separate 256-record process-wide FIFO. Each window's 256 control
slots support 128 live plus 128 staged widgets; a separate native record owns
its shortcut controller. Native handlers copy scalar
event data and duplicate transient UTF-8 entry text before returning; they never
retain a GTK text pointer or a managed address. A record carries the window
generation, element ID/generation and state revision. Poll copies text into the
borrowed output buffer and frees native ownership before JS delivery. Each entry
is limited to 1024 Unicode characters (up to 4096 UTF-8 bytes); no truncation is
used. Focus/key/pointer and semantic events preserve native signal order.
Window notifications precede this FIFO; Promise checkpoints follow each JS
event through `runReady`. Pointer coordinates are control-local logical pixels.

On capacity overflow the newest input event is dropped, and its text is never
allocated. An out-of-band `{type: "overflow", dropped}` window event reports
the loss after queued input; applications should replace state if needed.
Close has independent reserved storage, and chooser completions have 32 reserved
records, so neither can be lost to input pressure. Close purges owned queued
text synchronously. Holes left by another window's purge consume FIFO capacity
until extraction; if no events remain the FIFO resets immediately. Stale
generations/removed controls are ignored; their payloads are still freed.
No native slot holds a managed pointer. Retained entry widgets survive layout
updates, preserving GTK selection, caret and IME composition. Programmatic entry
`text` or toggle `checked` updates intentionally replace state, suppress their
synchronous GTK notifications and invalidate older queued state events by revision.
Toggle caption (`text`) updates preserve checked state and queued change events.

Folder command 8 places request ID in word 15, title at byte 64, initial path
at byte 640 (4096 bytes). Completion code 20 reports request ID in word 15,
error status in word 12, UTF-8 byte count in word 14 and local path at byte 64.
Control events use words 10/11 for ID/generation, 12/13 for value/modifiers,
9 for revision and 14 for UTF-8 length; pointer x/y are float32 at bytes 28/32.
Codes 4..11 are activate/input/change/focus/blur/keydown/keyup/pointerdown;
12 is a consumed shortcut, 13 pointerup, 14 overflow. Shortcut command 10
holds count in word 10 and up to 32 `(id,keyval,modifiers)` triples at byte 64.

Win64-shaped runtime calls cross dedicated SysV wrappers, preserving RDI/RSI
and full XMM6..15 with aligned calls. Private scalar signatures stage Win64's
position-based register/stack inputs into independent SysV GP/FP banks (up to
six GP/eight FP arguments), including floating returns and the AL vector count.
Unsupported signatures fail at code generation. Drawing callbacks adapt SysV's
five integer/pointer arguments and preserve SysV nonvolatile registers. The
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

The [GUI desktop workflow](../.github/workflows/gui-desktop.yml) runs only on
GitHub-hosted Ubuntu 24.04 runners. Its eight rows cover X11/Xvfb and
Wayland/headless Weston at initial scales 1 and 2, with compiler GC instrumentation
off and on. Rows execute serially. It requires the PR's `enhancement`, `complex`,
`full-ci` and `gc-stress` labels and the issue's shipping milestone. The harness
must apply and read back this metadata **before its CI-triggering push**. This
checkout has no PR yet; this step does not push or create one. Existing `check`,
`native-platforms`, `self-hosting`, program corpus, formal-verification and pages
workflows remain required for full repository and platform validation. Full/long
validation stays hosted; local test execution uses concurrency 1.

The bounded [desktop driver](../tests/fixtures/gui/desktop.py) owns its display,
D-Bus session and application process groups, and reaps them in failure paths as
well as success paths. Cleanup gives the entire driver group a bounded grace
period after its launcher exits; the outer supervisor retains the application
group ID, and Linux subreaper mode permits reaping orphaned descendants.
The issue-specific PR metadata assertions apply only to #664's PR; later source
PRs still run the reusable desktop regression without inheriting that issue's
type or milestone. X11 clears `WAYLAND_DISPLAY`, fixes `GDK_BACKEND=x11` and
waits for `xdpyinfo`. Wayland clears `DISPLAY` and `GDK_SCALE`, creates a private
mode-0700 `XDG_RUNTIME_DIR`, sets a private Wayland socket and
`GDK_BACKEND=wayland`, and waits for a successful `wayland-info` round trip.
Environment requests never count as backend/scale observations.

The test-only [Weston 13 module](../tests/fixtures/gui/weston-input.c) creates a
native libweston seat and accepts bounded commands over a private Unix socket.
It injects native pointer and keyboard events, including IM composition, through
the compositor. X11 uses XTest/xdotool. Neither path invokes JavaScript handlers.
AT-SPI inspects roles/names, focus and bounds and accepts/dismisses the real GTK
folder dialog. The module also authorizes screenshots on this isolated disposable
display; never install or load it on a person's desktop. Its private exported
input ABI is pinned to Weston 13 and is not a Nona application dependency.

After presentation, the driver requires `GdkX11Display` or `GdkWaylandDisplay`,
positive native surface dimensions and the measured initial scale. It retains PID,
slot/generation, opaque surface identity, completed frame/presentation timestamp,
content bounds and ordered JavaScript event traces. Each Wayland scale-1 row
separately changes the live compositor output to scale 2; acceptance requires a
scale callback and two presented observations for the **same surface and session**.
The module disables and destroys the old compositor output, then configures a
replacement on the same head before enabling it. Scale and headless size setters
are used only for initial output configuration, following the
[Weston output lifecycle](https://mvlad.pages.freedesktop.org/weston/toc/libweston/output.html).
It checks that the application surface survives and the replacement output has
the requested scale before acknowledging the command; the driver retains this
reply alongside the independent GDK observations. Independent initial-scale
launches cannot satisfy that assertion. Both GC modes run this transition.

The application and driver exercise pointer press/release and state updates,
Tab/Shift+Tab, Enter/Space, consumed shortcuts, real GTK simple-IM preedit across
stdout redraws, Unicode composition commit/cancellation, resize, scrolling,
drawing, both screens, a selected folder and dismissal. They check timers,
Promise continuations and real child stdout during the chooser and after every
dismissal. A native close request reopens the retained tree; final disposal with
a chooser and background work pending must produce no disposed-control callbacks.
The application must exit normally after its remaining work drains and its child
is reaped. This tests GTK's simple input method, not IBus/Fcitx integration.

Artifacts under `work/gui-evidence/` include environment/library/Ubuntu versions,
source commit and compiler mode, display readiness output, compositor and driver
logs, ordered `events.jsonl`, `input.json`, accessibility tree, services/settings
PNG captures, a live-scale PNG, and `PASS.json` or failure traceback plus partial
logs. `PASS.json` is written only after all assertions and a zero process exit.
The pure [receipt rejection tests](../tests/fixtures/gui/test_desktop_receipts.py)
reject missing lifecycle/input events, false progress, an incorrect backend/scale,
unpresented frames and a replacement surface masquerading as a scale transition.

The same workflow runs formatting, document-link checks, all sample builds and
`npm run compare -- --linux`. [gui-baseline.sh](../scripts/gui-baseline.sh) builds
one committed console source with the merge-base and candidate compilers on the
same machine, using identical CLI flags. It retains source hash, commit IDs,
flags, raw `readelf -h/-d`, normalized `DT_NEEDED` sets, dependency/stdout diffs,
headless stdout/stderr and exit statuses. Both dependency sets must match and
remain empty, and both console programs must start with display variables cleared.
A separate GUI probe must catch initialization failure without a display when
the desktop libraries are installed.

A separate **actual Ubuntu 20.04 container** records its OS/architecture and stock
package query/install failure, runs the candidate GUI ELF and captures its loader
failure for missing `libgtk-4.so.1`, then checks headless console startup. Its
expected outcome is explicitly **unsupported stock dependencies**, not GUI
acceptance. Container execution does not establish a 20.04 desktop session.
Missing or unexpected results fail the job; no backport support is claimed.

The optional VI Toolkit commands `./proto/build-proto` and
`python3 proto/probe.py --source-cli desktop main` run only when that checkout is
present. It is unavailable in this checkout and on the normal hosted Nona runner;
the workflow records that fact. Hosted acceptance depends only on Nona's fixtures,
not VI Toolkit, Vue or Electron. The two native screens cover its representative
service/log/settings/folder use case, not an automatic port of the seven-page app.

### Focused checks and current receipt status

[gui-bridge.test.ts](../tests/gui-bridge.test.ts) checks validation, independent
session ownership, deferred callbacks, invalidation, GC roots, Win64/SysV ABI,
timeout budgets, fairness and close/reopen. The new inspection probes check copied
native data in both GC modes. [gui-elements.test.ts](../tests/gui-elements.test.ts)
checks independently owned layout/scale/drawing fixtures and, on Ubuntu, actual
Cairo pixels. [gui-controls.test.ts](../tests/gui-controls.test.ts) checks native
control transactions, bounded queues, focus, state revisions and chooser lifetime.
The [bridge workflow](../.github/workflows/gui-bridge.yml) runs those focused files
at concurrency 1 against real X11/GTK, including the earlier input/chooser fixture.
[gui-desktop.test.ts](../tests/gui-desktop.test.ts) compiles the acceptance
application and headless GUI probe in both GC modes. Stubbed executable ABI probes
and managed tests supplement, and do not substitute for, native display receipts.

```sh
npm run build
node --test --test-concurrency=1 dist/tests/gui-desktop.test.js dist/tests/gui-bridge.test.js dist/tests/gui-elements.test.js dist/tests/gui-controls.test.js
python3 tests/fixtures/gui/test_desktop_receipts.py
```

For local native testing on Ubuntu, install the test packages listed in the
workflow, compile its Weston module, run `build-desktop.mjs`, then invoke
`desktop.py launch` with the desired backend/scale. The workflow contains the exact
commands. Real bridge tests additionally use `NONA_GTK_GUI_TESTS=1` and
`NONA_GTK_INPUT_TESTS=1` inside an isolated X11/D-Bus session.

**Native acceptance remains blocked.** On 2026-11-28, the Windows x64 review
worker attempted `workflow_dispatch` for both `gui-desktop.yml` and
`gui-bridge.yml` at the published branch `nona/issue-664`
(`5df7c0de9f7a7ef1b6ea55b58aad410f3f04184b`). Both GitHub API requests returned
HTTP 404. Neither workflow was registered in the repository workflow list, and
the branch had no PR or workflow runs. The review task prohibits pushing or
opening a PR, so it cannot trigger the configured PR workflows or validate these
local fixes on hosted Ubuntu. The harness must publish the fixes and create the
PR with `full-ci` and `gc-stress`, then run and resolve the desktop and bridge
checks. Record successful workflow URLs, tested commit IDs and artifact hashes
here before treating this branch as resolving #664. No actual X11/Wayland desktop,
live-scale, dependency-comparison or Ubuntu 20.04 receipt is claimed here;
configured jobs, compilation and stubbed executable probes do not establish them.

| Acceptance evidence                                                           | Current result                           |
| ----------------------------------------------------------------------------- | ---------------------------------------- |
| Ubuntu 24.04 X11/Xvfb, scales 1 and 2, both GC modes                          | Pending hosted receipts                  |
| Ubuntu 24.04 Wayland/headless Weston, scales 1 and 2, both GC modes           | Pending hosted receipts                  |
| Same live Wayland surface, scale 1 → 2, both GC modes                         | Pending hosted receipts                  |
| Identical-source merge-base/candidate dependency comparison and headless runs | Pending hosted receipts                  |
| Actual Ubuntu 20.04 stock-library outcome                                     | Pending; expected unsupported GTK stack  |
| VI Toolkit private checkout                                                   | Unavailable; Nona-owned fixture included |

Issue #664 acceptance criteria remain open until their native receipts pass:

- [ ] The documented command builds a Linux ELF that opens a native window, lays
      out text/image, accepts text, handles keyboard/pointer activation and updates
      a state label on Ubuntu.
- [ ] The same example exercises scrolling, resize and custom drawing; deterministic
      Nona-owned fixtures check layout bounds, scale conversion and drawing.
- [ ] Live-window evidence demonstrates timer/Promise/I/O progress, close/reopen,
      safe pending-event disposal and normal exit after remaining referenced work.
- [ ] Native Wayland/X11 receipts record Ubuntu and scale; installation, supported
      backends/architecture, minimum libraries and headless behavior are documented,
      and a non-GUI binary preserves its dependency baseline.

The P1 use case also remains subject to the hosted input, folder selection and
cancellation, background progress and disposal assertions described above.
