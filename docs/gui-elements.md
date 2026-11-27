# Retained GUI elements

This is the stage 2 API and ownership reference for [nona:gui](gui.md), #664.
The managed wrapper establishes tree/layout guarantees; the private native
renderer establishes recording ownership and atomic replacement. Applications
rely on both. These guarantees apply to Linux x64 main-thread GUI programs,
not other targets or worker threads. [Focused tests](../tests/gui-elements.test.ts)
cover validation, layout, ABI, GC stress and native resource accounting.

```js
import { Window, Element } from "nona:gui";
const label = new Element("text", {
    text: "Ready",
    fontFamily: "Abel",
    font: "assets/Abel-Regular.ttf",
    fontSize: 20,
    lineHeight: 28,
    height: 32,
    color: "#182030",
});
const image = new Element("image", {
    src: "assets/logo.png",
    width: 64,
    height: 64,
    imageFit: "contain",
});
const root = new Element(
    "column",
    {
        padding: 12,
        gap: 8,
        align: "stretch",
        scroll: true,
        background: "#ffffff",
        borderWidth: 1,
        borderColor: "#aabbcc",
        radius: 8,
    },
    [label, image],
);
const window = new Window();
window.setRoot(root).open();
label.update({ text: "Updated" });
root.update({ scrollY: 16 });
image.dispose();
window.dispose();
```

## Trees and transactions

`new Element(kind, properties = {}, children = [])` supports `row`, `column`,
`stack`, `text`, `image`, `drawing`, `button`, `entry` and `toggle`. Only the
three containers accept children.
`id` is a process-unique monotonically increasing safe integer, never reused,
and remains readable after disposal. `kind`, `properties`, `children`, `bounds`
and `disposed` are readable. Properties, padding and copied drawing commands
are frozen snapshots; children and bounds are copies. Bounds are the last
successfully committed border-box allocation in window coordinates before
ancestor clipping, or null before rendering. Detached elements retain their
last bounds. Undocumented underscore-prefixed window fields are private.

`Window.setRoot(elementOrNull)`, `Element.update(patch)` and
`Element.setChildren(array)` validate the complete candidate before native work.
Unknown fields/kinds, wrong types, NUL strings, non-finite numbers, inconsistent
constraints and disposed elements throw. Trees reject cycles, duplicate
children, an already attached child, more than 4096 elements, or depth greater
than 64 edges. Remove a child before moving it to another parent.

A window owns every element first successfully attached to it, including later
descendants. Ownership lasts until disposal, even while detached. Elements
cannot transfer to a different window. Construct new elements for another
window. `setRoot(null)` and `setChildren` detach without disposal; the owner
keeps detached elements reachable. `Element.dispose()` permanently disposes
its subtree and removes it from its parent/root. `Window.dispose()` closes
and disposes every owned element, including detached subtrees. Disposal is
idempotent; later element updates or attachment throw. There is no finalizer
resource-release contract.

Each visible change builds a candidate Cairo recording offscreen. Only success
replaces the previous scene; failure releases candidate resources and restores
properties, child relationships, root, ownership and bounds. Removing a visible
subtree through `dispose()` obeys this transaction too. GTK presents queued
redraws asynchronously: success commits scene ownership, not a displayed frame.

Unowned/closed trees validate managed values without initializing GTK/loading
assets. `open()` loads assets; a failed initial recording destroys the new
session and keeps the tree available for correction. Close releases the scene
and keeps the tree; reopen builds a new scene and may fail if files disappeared.
An observed resize recomputes layout before the listener. If rebuilding fails,
the previous recording stays visible and the I/O-loop exception policy applies;
the observed dimensions remain for a subsequent update.

## Layout and style

Lengths are finite logical pixels, including fractions. `x`/`y` allow
-1048576..1048576; other lengths allow 0..1048576.

| Properties                                       | Meaning and default                                                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `width`, `height`                                | Number, `"auto"` (default) or `"fill"`; allocated border box.                                                                                |
| `minWidth`, `minHeight`, `maxWidth`, `maxHeight` | Clamp allocations; defaults 0 and 1048576.                                                                                                   |
| `x`, `y`                                         | Offset from computed position, default 0; does not affect flow sizing.                                                                       |
| `padding`                                        | Number or `[top,right,bottom,left]`, default 0, inside border box. Border width does not add padding.                                        |
| `gap`                                            | Space between row/column children, default 0.                                                                                                |
| `align`                                          | Cross-axis `"start"` (default), `"center"`, `"end"`, `"stretch"`; both axes in stacks. Stretch affects auto sizes only.                      |
| `justify`                                        | Flow-axis `"start"` (default), `"center"`, `"end"`; ignored in stacks.                                                                       |
| `clip`, `scroll`                                 | Booleans, default false; either clips descendants to the rounded border box.                                                                 |
| `scrollX`, `scrollY`                             | Nonnegative logical offsets, default 0; translate children only when `scroll` is true. No automatic clamping, scrollbars or wheel input yet. |
| `background`, `color`, `borderColor`             | `#RRGGBB` or `#RRGGBBAA`; defaults transparent, black, black. No style inheritance.                                                          |
| `borderWidth`, `radius`                          | Default 0; border centres on border-box path and is clipped by ancestors. Radius clamps to half the smaller dimension.                       |

Rows flow left to right, columns top to bottom. Stacks paint children in array
order and position them with alignment plus offsets. Container auto dimensions
use the sum (flow axis) or maximum (cross axis) of child extents, plus gaps and
padding. Auto text width uses available width; height is LF-separated line
count times `lineHeight`, plus padding. Auto images/drawings have zero intrinsic
content size: specify dimensions. The root fills the observed window unless
given numeric dimensions, then clamps to constraints.

Flow-axis fill children share remaining space equally after fixed/auto children
and gaps, then clamp individually; unused space after clamping is not
redistributed. Overflow does not shrink. Cross-axis fill uses available space.
Children paint outside allocations unless clipped. Text, images and drawing
surfaces always clip themselves. Scroll/clipping is visual only; input, focus,
hit testing and native controls remain subsequent work.

Layout stays in logical coordinates without rounding. GTK supplies device
scale to Cairo during drawing; the scene does not multiply it again. The private
`deviceBounds` helper covers rectangles by flooring scaled origins and ceiling
scaled far edges, including negative origins. [Bounds fixtures](../tests/fixtures/gui/layout.json)
specify two sizes independently. [Pixel fixtures](../tests/fixtures/gui/pixels.json)
check actual recording replay at device scales 1/2; these are offscreen checks,
not receipts for mapped window-system scaling.

## Text, images and assets

Text properties: `text` (empty), `fontFamily` (`"sans"`), positive `fontSize`
(16), integer `fontWeight` (100..1000, default 400), positive `lineHeight`
(19.2) and optional `font` path. Pango shapes each LF-separated line and places
its top at exact `lineHeight` intervals. There is no automatic wrapping,
ellipsis or measurement API. Fallback/weight synthesis follow Pango/Fontconfig;
bundle the intended family and name it explicitly for reproducible glyphs.
Changing fontSize does not implicitly change lineHeight. Strings are limited
to 65535 UTF-16 code units and cannot contain NUL.

Images accept optional PNG `src` and `imageFit`: `"contain"` (default) centres
with preserved aspect, `"cover"` centres/crops, `"stretch"` fills both dimensions.
Sampling is nearest-neighbour. PNG decoding is synchronous during scene update;
no network images or SVG decoder is supplied.

Absolute paths are used directly. Relative paths resolve against the directory
of the running **executable** (`process.execPath`), independently of source
location and working directory. `.`/`..` follow OS resolution. Assets are
external application-owned files: distribute them in the documented relative
layout and include licenses. Nona does not embed/install assets implicitly.
Missing/invalid PNG/font files, failed font registration and graphics status
errors throw scene error `-6` and preserve the old scene. Allocation failures
inside system libraries retain their platform failure behavior.

Each local font uses a private Fontconfig configuration/Pango font map; the
default process-wide font configuration is not changed. Temporary layouts,
descriptions, maps/configurations and decoded image handles are released after
recording. Cairo retains native glyph/image references needed by its recording
until replacement/close. Removal/disposal rebuilds the scene and releases old
references. No asset file descriptor or managed-buffer borrow survives a call.
Updates currently rebuild the whole scene, including decoding/shaping; large
assets or frequent updates pause the runtime thread.

## Drawing and native ownership

`new Element("drawing", {width, height, commands})` copies/freezes at most
4096 validated command objects. Coordinates are relative to its padded origin:

```js
const drawing = new Element("drawing", {
    width: 160,
    height: 80,
    commands: [
        {
            op: "fillRect",
            x: 2,
            y: 3,
            width: 60,
            height: 40,
            radius: 8,
            color: "#2266cc",
        },
        {
            op: "strokeRect",
            x: 70,
            y: 3,
            width: 60,
            height: 40,
            lineWidth: 2,
            color: "#112233",
        },
        { op: "line", x1: 4, y1: 65, x2: 150, y2: 65, color: "#224422" },
        { op: "circle", x: 30, y: 24, radius: 10, color: "#ee7733" },
    ],
});
```

Rectangle radius defaults to 0; stroke lineWidth defaults to 1 and must be
positive. Other shown fields are required. Unknown commands/fields reject the
update. Rectangles/circles fill; strokeRect/line stroke. Positions can be
negative; dimensions/radii are nonnegative. Commands paint in array order
inside the element's clip. No JS drawing callback or public raw GTK handle,
native pointer or general FFI callback is exposed.

The wrapper serializes commands and UTF-8 strings into a synchronous borrowed
packet; the runtime converts them into Cairo-owned recording storage. GTK's
draw callback only saves Cairo state, sets the recording as source, paints and
restores. It never enters JS, retains a borrowed managed buffer, decodes assets,
rebuilds layout or mutates widgets. Replacement queues drawing outside that
callback, following [GTK's restrictions](https://docs.gtk.org/gtk4/method.DrawingArea.set_draw_func.html).
Close disconnects draw entry and clears recording ownership before widget
destruction; stale draw-area identities are ignored. All graphics/callbacks
remain on the main runtime thread and perform no managed allocation. Future
helpers retaining Values across allocation must use the documented
[runtime rooting rules](runtime-memory.md).

## Native controls and input

```js
const name = new Element("entry", {
    text: "Service",
    accessibleName: "Service name",
});
const run = new Element("button", { text: "Run service" });
const enabled = new Element("toggle", { text: "Enabled", checked: true });
window.setRoot(new Element("column", { gap: 8 }, [name, run, enabled])).open();
const unsubscribe = run.on("activate", () => console.log(name.properties.text));
enabled.on("change", (event) => console.log(event.checked));
name.on("input", (event) => console.log(event.text));
name.focus();
const removeShortcut = window.addShortcut(115, 4, () =>
    console.log("Control+s"),
);
```

GTK `GtkButton`, `GtkEntry` and `GtkCheckButton` own control painting, native
editing, selection, clipboard, focus and IME preedit/commit. Nona does not
reimplement text entry from raw key events. Entries hold at most 1024 Unicode
characters. Default control extent is 120 by 36 logical pixels (entry width
240), constrained by the available width; explicit sizing uses the retained
layout. Native GTK minimums can exceed the content allocation and are clipped
by the control viewport. Controls form an overlay above the Cairo scene, in
retained traversal order; Cairo content does not paint over native controls.
Ancestor scroll offsets and rectangular clipping apply to the control viewport.
Native widgets retain the system theme, fonts and corner treatment; the precise
text/font/drawing properties documented above apply to rendered text/drawing
elements. Rounded ancestor clipping of native controls is rectangular for now.

Control properties add `text`, `enabled` (default true), `accessibleName` and,
for toggles, `checked` (default false). `role` may assert the kind's native role:
`button`, `textbox`, `checkbox`, respectively; incompatible roles reject before
native work. Accessible names default to `text`; use an explicit label for an
entry so its accessible name does not change with typed content. Names are
published via GTK's accessible label property. GTK supplies the actual role,
checked/disabled/focus state and text interfaces to the native accessibility
tree. The hosted input probe queries AT-SPI rather than inferring a tree from
the JavaScript properties.

At most 128 controls may be attached to a window. Control IDs, attachment
generations and state revisions must fit positive signed 32-bit integers;
exhaustion fails rather than wrapping. New native widgets are staged before
committing a scene; an existing entry is reused by ID and attachment generation.
Successful commits synchronize native sibling order without unparenting retained
widgets. A graphics failure before control preparation leaves the committed
controls usable, including their native entry state.
Each window has 256 native control records for the 128 live widgets and up to
128 staged replacements. The synthetic shortcut record has separate storage,
so replacing an entire tree at the public limit does not exhaust staging.

`element.on(type, listener)` returns an idempotent unsubscribe function. Events
are `activate`, `input`, `change`, `focus`, `blur`, `keydown`, `keyup`,
`pointerdown`, `pointerup`. Only native controls accept these subscriptions.
The receiver and `event.target` are the element. `input` supplies `text`,
`change` supplies `checked`, key events supply a GDK `keyval` and `modifiers`,
pointer events supply `button`, control-local logical `x`/`y` and `modifiers`.
Text/checked properties are updated before listeners, without resetting the
native widget. Programmatic `update` emits no synthetic user input event.

GTK dispatch runs first, and JavaScript observes queued native signals later.
Within input, events are FIFO in native signal order: captured pointer/key
notifications precede semantic activation/change, and IME input is emitted when
GTK changes committed text. GTK can emit multiple intermediate changes for one
edit; each copied snapshot is delivered separately. Keyboard observers return
false to GTK, gestures do not claim sequences, and JS listener return values
are ignored. There is no `preventDefault`, synchronous JS propagation decision,
DOM bubbling or promise that the current native state equals an older queued
snapshot. Listener additions take effect on the next event; removals/disposal
take effect during delivery. Exceptions follow the normal I/O-loop policy.

Tab/Shift+Tab follow GTK focus traversal. Space uses GTK's native activation;
Enter/KP_Enter activate buttons and toggles once during native key dispatch;
an entry retains GTK's native Enter behavior and emits `activate`. `focus()`
requires an attached control in an open window. Detached/disposed generations
cannot receive pending events. Native widget identity survives layout updates,
so those updates do not cancel composition or reset the caret.

`window.addShortcut(keyval, modifiers, listener)` installs up to 32 synchronous
native capture rules and returns a remover. Keyvals are GDK integers; modifiers
use Shift=1, Control=4, Alt=8, Super=0x04000000, Hyper=0x08000000,
Meta=0x10000000. Lock/button bits are ignored. The first matching rule consumes
the key press before GTK target/default processing, queues `shortcut` to its
callback and prevents that key from editing a control. Rules are restored on
reopen. A removed rule's queued callback is ignored. This explicit native
policy works even though its JS callback runs after dispatch. Input overflow
can drop the queued callback after the key was consumed; see the
[bounded event transport](gui.md#private-bridge-protocol-version-3).

See [folder selection](gui.md#asynchronous-folder-selection) for asynchronous
chooser ownership and cancellation during parent close/disposal. Actual IME
composition and backend-specific desktop evidence remain required acceptance
receipts; Unicode transport probes alone do not establish them.
