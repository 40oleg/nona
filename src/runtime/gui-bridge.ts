import { RuntimeBuilder, slot, failIf } from "./abi.js";
import type { Assembler } from "../backend/machine/context.js";
import { ObjectLayout as O } from "./object-layout.js";
import { TypedArrayKind, TypedArrayLayout as T } from "./typed-array.js";
import { ArrayBufferKind, ArrayBufferLayout as AB } from "./array-buffer.js";
import { emitViewCheck } from "./view-bounds.js";
import { guiSystemCall } from "./gui-abi.js";
import { guiRendering } from "./gui-render.js";
import { guiInput, GuiControl, guiControlSlots } from "./gui-input.js";

// Image-owned native records; none of these words contains a managed pointer.
export const guiSlots = 32;
export const GuiRecord = {
    size: 128,
    window: 0,
    signal: 8,
    generation: 16,
    close: 24,
    width: 32,
    height: 40,
    scale: 48,
    dirty: 56,
    drawingArea: 64,
    surface: 72,
    fixed: 80,
    overlay: 88,
    overflow: 96,
    staged: 104,
    controls: 112,
    shortcuts: 120,
} as const;
const R = GuiRecord;
const mem = (name: string) => ({ rip: "gui." + name });
const field = (offset: number) => ({ base: "r10" as const, disp: offset });
const api = (a: Assembler, name: string) => a.call("gui.abi." + name);

export const guiSurfaceCalls = [
    "gtk_native_get_surface",
    "gdk_surface_get_mapped",
    "gdk_surface_get_display",
    "gdk_surface_get_width",
    "gdk_surface_get_height",
    "gdk_surface_get_scale_factor",
    "gdk_surface_get_frame_clock",
    "gdk_frame_clock_get_frame_counter",
    "gdk_frame_clock_get_timings",
    "gdk_frame_timings_get_presentation_time",
    "gdk_frame_timings_get_complete",
];

/** Linux x64 only. All calls are leaf with respect to the managed heap: GTK
 * may allocate native memory but cannot enter JS or trigger Nona GC. No Values
 * survive managed safepoints, so these helpers deliberately need no rootedFn.
 */
export function guiHelpers(): RuntimeBuilder {
    const b = new RuntimeBuilder();
    guiRendering(b);
    guiInput(b);
    for (const name of guiSurfaceCalls) guiSystemCall(b, "libgtk-4.so.1", name);
    guiSystemCall(b, "libgobject-2.0.so.0", "g_type_name_from_instance");
    for (const name of [
        "gtk_init_check",
        "gtk_window_new",
        "gtk_window_destroy",
        "gtk_window_set_title",
        "gtk_window_set_default_size",
        "gtk_window_present",
        "gtk_widget_get_width",
        "gtk_widget_get_height",
        "gtk_widget_get_scale_factor",
    ])
        guiSystemCall(b, "libgtk-4.so.1", name);
    for (const name of ["g_signal_connect_data", "g_signal_handler_disconnect"])
        guiSystemCall(b, "libgobject-2.0.so.0", name);
    for (const name of [
        "g_main_context_iteration",
        "g_get_monotonic_time",
        "g_usleep",
    ])
        guiSystemCall(b, "libglib-2.0.so.0", name);
    b.data("gui.records", new Uint8Array(guiSlots * R.size), ".data");
    for (const name of ["init", "cursor"])
        b.data("gui." + name, new Uint8Array(8), ".data");
    b.data("gui.closeSignal", new TextEncoder().encode("close-request\0"));

    // Read-only diagnostics. Borrowed GDK objects never outlive this call.
    // A completed timing alone does not prove presentation: expose its actual
    // timestamp separately, with zero meaning unavailable. Inspect recent frames
    // because the current frame may still be in flight.
    b.fn("gui.inspect", 104, (a) => {
        a.store(slot(48), "rdx");
        a.load("rcx", { base: "rcx", disp: R.window });
        api(a, "gtk_native_get_surface");
        a.store(slot(56), "rax");
        const done = a.unique("inspectDone");
        a.test("rax", "rax");
        a.jcc("e", done);
        a.load("r10", slot(48));
        a.store({ base: "r10", disp: 28 }, "rax");
        for (const [name, word] of [
            ["gdk_surface_get_mapped", 3],
            ["gdk_surface_get_width", 4],
            ["gdk_surface_get_height", 5],
            ["gdk_surface_get_scale_factor", 6],
        ] as const) {
            a.load("rcx", slot(56));
            api(a, name);
            a.load("r10", slot(48));
            a.store({ base: "r10", disp: word * 4 }, "rax", 32);
        }
        a.load("rcx", slot(56));
        api(a, "gdk_surface_get_display");
        a.mov("rcx", "rax");
        api(a, "g_type_name_from_instance");
        const copy = a.unique("inspectCopy"),
            copied = a.unique("inspectCopied");
        a.mov("r9", "rax");
        a.mov("r11", 0);
        a.load("r10", slot(48));
        a.label(copy);
        a.load("rax", { base: "r9" }, 8);
        a.test("rax", "rax");
        a.jcc("e", copied);
        a.store({ base: "r10", disp: 64 }, "rax", 8);
        a.add("r9", 1);
        a.add("r10", 1);
        a.add("r11", 1);
        a.cmp("r11", 63);
        a.jcc("b", copy);
        a.label(copied);
        a.load("r10", slot(48));
        a.store({ base: "r10", disp: 60 }, "r11", 32);
        a.load("rcx", slot(56));
        api(a, "gdk_surface_get_frame_clock");
        a.test("rax", "rax");
        a.jcc("e", done);
        a.store(slot(64), "rax");
        a.mov("rcx", "rax");
        api(a, "gdk_frame_clock_get_frame_counter");
        a.store(slot(72), "rax");
        a.mov("rax", 8);
        a.store(slot(88), "rax");
        const frame = a.unique("inspectFrame"),
            next = a.unique("inspectNext");
        a.label(frame);
        a.load("rcx", slot(64));
        a.load("rdx", slot(72));
        a.cmp("rdx", 0);
        a.jcc("l", done);
        api(a, "gdk_frame_clock_get_timings");
        a.test("rax", "rax");
        a.jcc("e", next);
        a.store(slot(80), "rax");
        a.mov("rcx", "rax");
        api(a, "gdk_frame_timings_get_complete");
        // gboolean is a 32-bit return; upper register bits are unspecified.
        a.shl("rax", 32);
        a.shr("rax", 32);
        a.test("rax", "rax");
        a.jcc("e", next);
        a.load("rcx", slot(80));
        api(a, "gdk_frame_timings_get_presentation_time");
        a.test("rax", "rax");
        a.jcc("e", next);
        a.load("r10", slot(48));
        a.store({ base: "r10", disp: 44 }, "rax");
        a.load("rax", slot(72));
        a.store({ base: "r10", disp: 36 }, "rax");
        a.mov("rax", 1);
        a.store({ base: "r10", disp: 52 }, "rax", 32);
        a.jmp(done);
        a.label(next);
        a.load("rax", slot(72));
        a.sub("rax", 1);
        a.store(slot(72), "rax");
        a.load("rax", slot(88));
        a.sub("rax", 1);
        a.store(slot(88), "rax");
        a.jcc("ne", frame);
        a.label(done);
        a.mov("rax", 0);
    });

    b.fn("gui.recordClose", 8, (a) => {
        const done = a.unique("done");
        a.load("rax", { base: "rdx", disp: R.window });
        a.cmp("rax", "rcx");
        a.jcc("ne", done);
        a.mov("rax", 1);
        a.store({ base: "rdx", disp: R.close }, "rax");
        a.label(done);
        a.mov("rax", 1); // inhibit GTK default destruction; defer to the poller
    });
    b.fn("gui.closeCallback", 40, (a) => {
        // SysV -> Win64. RDI=window, RSI=data. The internal leaf helper
        // touches only volatile registers common to both ABIs. In particular
        // RBX/RBP/R12..15 remain unchanged. Stack includes Win64 shadow space.
        a.mov("rcx", "rdi");
        a.mov("rdx", "rsi");
        a.call("gui.recordClose");
    });
    b.fn("gui.destroy", 72, (a) => {
        a.store(slot(48), "rcx"); // record
        a.load("rax", { base: "rcx", disp: R.window });
        a.store(slot(56), "rax");
        a.mov("rax", 0);
        // Invalidate first: native signals emitted by destruction are synchronous.
        a.store({ base: "rcx", disp: R.window }, "rax");
        for (const offset of [R.close, R.dirty, R.width, R.height, R.scale])
            a.store({ base: "rcx", disp: offset }, "rax");
        const done = a.unique("done"),
            disconnected = a.unique("disconnected");
        a.load("rax", slot(56));
        a.test("rax", "rax");
        a.jcc("e", done);
        a.load("rcx", slot(48));
        a.call("gui.input.destroy");
        a.load("rcx", slot(48));
        a.load("rax", slot(56));
        a.load("rdx", { base: "rcx", disp: R.signal });
        a.test("rdx", "rdx");
        a.jcc("e", disconnected);
        a.mov("rcx", "rax");
        api(a, "g_signal_handler_disconnect");
        a.label(disconnected);
        // Disable draw entry and release the committed recording before the
        // window releases its child. No callback can see freed scene storage.
        a.load("r10", slot(48));
        a.load("rcx", field(R.drawingArea));
        const noArea = a.unique("noArea");
        a.test("rcx", "rcx");
        a.jcc("e", noArea);
        a.mov("rdx", 0);
        a.mov("r8", 0);
        a.mov("r9", 0);
        api(a, "gtk_drawing_area_set_draw_func");
        a.label(noArea);
        a.load("r10", slot(48));
        a.load("rcx", field(R.surface));
        a.mov("rax", 0);
        a.store(field(R.surface), "rax");
        a.store(field(R.drawingArea), "rax");
        const noSurface = a.unique("noSurface");
        a.test("rcx", "rcx");
        a.jcc("e", noSurface);
        api(a, "cairo_surface_destroy");
        a.label(noSurface);
        a.load("rcx", slot(56));
        api(a, "gtk_window_destroy");
        a.label(done);
        a.load("r10", slot(48));
        a.mov("rax", 0);
        a.store(field(R.signal), "rax");
    });
    b.fn("gui.sample", 88, (a) => {
        a.lea("rax", mem("records"));
        a.store(slot(48), "rax");
        a.mov("rax", guiSlots);
        a.store(slot(56), "rax");
        const loop = a.unique("loop"),
            next = a.unique("next");
        a.label(loop);
        a.load("r10", slot(48));
        a.load("rcx", field(R.window));
        a.test("rcx", "rcx");
        a.jcc("e", next);
        a.load("rax", field(R.close));
        a.test("rax", "rax");
        a.jcc("ne", next);
        for (const [name, offset, bit] of [
            ["gtk_widget_get_width", R.width, 1],
            ["gtk_widget_get_height", R.height, 1],
            ["gtk_widget_get_scale_factor", R.scale, 2],
        ] as const) {
            a.load("r10", slot(48));
            a.load("rcx", field(R.window));
            api(a, name);
            // GTK gint results have unspecified high bits; accept positive i32 only.
            a.shl("rax", 32);
            a.sar("rax", 32);
            const unchanged = a.unique("unchanged");
            a.cmp("rax", 0);
            a.jcc("le", unchanged);
            a.load("r10", slot(48));
            a.load("r11", field(offset));
            a.cmp("rax", "r11");
            a.jcc("e", unchanged);
            a.store(field(offset), "rax");
            a.load("rax", field(R.dirty));
            a.or("rax", bit);
            a.store(field(R.dirty), "rax");
            a.label(unchanged);
        }
        a.label(next);
        a.load("rax", slot(48));
        a.add("rax", R.size);
        a.store(slot(48), "rax");
        a.load("rax", slot(56));
        a.sub("rax", 1);
        a.store(slot(56), "rax");
        a.jcc("ne", loop);
    });
    // Builtin ABI: out Value*, argc, argv. Frame has six outgoing arguments,
    // out at 64, borrowed buffer 72, record 80, iteration count 88, deadline 96.
    b.fn("gui.code", 120, (a) => {
        a.store(slot(64), "rcx");
        a.cmp("rdx", 1);
        failIf(a, "b", "rt.throwTypeError");
        a.load("rax", { base: "r8" });
        a.cmp("rax", 5);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("r10", { base: "r8", disp: 8 });
        a.load("rax", field(O.kind));
        a.cmp("rax", TypedArrayKind);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("rax", field(T.elementType));
        a.cmp("rax", 6);
        failIf(a, "ne", "rt.throwTypeError");
        emitViewCheck(a, "r10");
        a.test("r11", "r11");
        failIf(a, "ne", "rt.throwTypeError");
        a.load("rax", field(T.length));
        a.cmp("rax", 160);
        failIf(a, "b", "rt.throwTypeError");
        a.shl("rax", 2);
        a.store(slot(112), "rax");
        a.load("rax", field(T.byteOffset));
        a.load("r10", field(T.buffer));
        a.load("r11", field(O.kind));
        a.cmp("r11", ArrayBufferKind);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("r11", field(AB.maxByteLength));
        a.test("r11", "r11");
        failIf(a, "ns", "rt.throwTypeError");
        a.load("r10", field(AB.bytes));
        a.add("r10", "rax");
        a.store(slot(72), "r10");
        // Runtime worker threads are raw clone threads with no independent libc
        // TLS. Reject even an illegally transferred host function before GTK.
        a.syscall(186);
        a.store(slot(104), "rax");
        a.syscall(39);
        a.load("r11", slot(104));
        a.cmp("rax", "r11");
        const wrongThread = a.unique("wrongThread"),
            done = a.unique("done"),
            invalid = a.unique("invalid"),
            capacity = a.unique("capacity"),
            failedInit = a.unique("failedInit"),
            partial = a.unique("partial"),
            success = a.unique("success"),
            create = a.unique("create"),
            poll = a.unique("poll"),
            destroy = a.unique("destroy"),
            present = a.unique("present"),
            resize = a.unique("resize"),
            scene = a.unique("scene");
        a.jcc("ne", wrongThread);
        a.load("r10", slot(72));
        a.load("rax", { base: "r10" }, 32);
        a.cmp("rax", 1);
        a.jcc("e", create);
        a.cmp("rax", 3);
        a.jcc("e", poll);
        const cancel = a.unique("cancel"),
            folder = a.unique("folder"),
            focus = a.unique("focus"),
            shortcuts = a.unique("shortcuts"),
            inspect = a.unique("inspect");
        a.cmp("rax", 9);
        a.jcc("e", cancel);
        // Every mutating command validates both slot and generation.
        a.load("rax", { base: "r10", disp: 4 }, 32);
        a.cmp("rax", guiSlots);
        a.jcc("ae", invalid);
        a.shl("rax", 7);
        a.lea("r11", mem("records"));
        a.add("r11", "rax");
        a.store(slot(80), "r11");
        a.load("rax", { base: "r10", disp: 8 }, 32);
        a.load("rdx", { base: "r11", disp: R.generation });
        a.cmp("rax", "rdx");
        a.jcc("ne", invalid);
        a.load("rax", { base: "r11", disp: R.window });
        a.test("rax", "rax");
        a.jcc("e", invalid);
        a.load("rax", { base: "r10" }, 32);
        for (const [op, label] of [
            [2, destroy],
            [4, present],
            [5, resize],
            [6, scene],
            [7, focus],
            [8, folder],
            [10, shortcuts],
            [11, inspect],
        ] as const) {
            a.cmp("rax", op);
            a.jcc("e", label);
        }
        a.jmp(invalid);
        a.label(inspect);
        a.load("rcx", slot(80));
        a.load("rdx", slot(72));
        a.call("gui.inspect");
        a.jmp(success);
        a.label(cancel);
        a.load("rdx", { base: "r10", disp: 60 }, 32);
        a.call("gui.folder.cancelRequest");
        a.jmp(success);
        a.label(folder);
        a.load("rax", slot(112));
        a.cmp("rax", 4736);
        a.jcc("b", invalid);
        a.load("rax", { base: "r10", disp: 575 }, 8);
        a.test("rax", "rax");
        a.jcc("ne", invalid);
        a.load("rax", { base: "r10", disp: 4735 }, 8);
        a.test("rax", "rax");
        a.jcc("ne", invalid);
        a.load("rax", { base: "r10", disp: 60 }, 32);
        a.test("rax", "rax");
        a.jcc("e", invalid);
        a.cmp("rax", 0x7fffffff);
        a.jcc("a", invalid);
        a.load("rcx", slot(80));
        a.load("rdx", slot(72));
        a.call("gui.folder.start");
        a.jmp(done);
        a.label(focus);
        a.load("r11", slot(80));
        a.load("r11", { base: "r11", disp: R.controls });
        a.mov("r9", guiControlSlots);
        const focusLoop = a.unique("focusLoop"),
            focusNext = a.unique("focusNext");
        a.label(focusLoop);
        a.load("rax", { base: "r11", disp: GuiControl.id });
        a.load("rdx", { base: "r10", disp: 40 }, 32);
        a.cmp("rax", "rdx");
        a.jcc("ne", focusNext);
        a.load("rax", { base: "r11", disp: GuiControl.epoch });
        a.load("rdx", { base: "r10", disp: 44 }, 32);
        a.cmp("rax", "rdx");
        a.jcc("ne", focusNext);
        a.load("rcx", { base: "r11", disp: GuiControl.widget });
        a.test("rcx", "rcx");
        a.jcc("e", invalid);
        api(a, "gtk_widget_grab_focus");
        a.jmp(success);
        a.label(focusNext);
        a.add("r11", GuiControl.size);
        a.sub("r9", 1);
        a.jcc("ne", focusLoop);
        a.jmp(invalid);
        a.label(shortcuts);
        a.load("rax", { base: "r10", disp: 40 }, 32);
        a.cmp("rax", 32);
        a.jcc("a", invalid);
        a.mov("r9", "rax");
        a.load("r11", slot(80));
        a.load("r11", { base: "r11", disp: R.shortcuts });
        a.add("r10", 64);
        for (let i = 0; i < 32; i++) {
            const empty = a.unique("emptyShortcut"),
                copied = a.unique("copiedShortcut");
            a.cmp("r9", i);
            a.jcc("be", empty);
            for (let j = 0; j < 3; j++) {
                a.load("rax", { base: "r10", disp: i * 12 + j * 4 }, 32);
                a.store({ base: "r11", disp: i * 16 + j * 4 }, "rax", 32);
            }
            a.jmp(copied);
            a.label(empty);
            a.mov("rax", 0);
            a.store({ base: "r11", disp: i * 16 }, "rax", 32);
            a.label(copied);
        }
        a.jmp(success);
        a.label(scene);
        a.load("rcx", slot(80));
        a.load("rdx", slot(72));
        a.load("r8", slot(112));
        a.call("gui.scene");
        a.jmp(done);
        a.label(destroy);
        a.load("rcx", slot(80));
        a.call("gui.destroy");
        a.jmp(success);
        a.label(present);
        a.load("r10", slot(80));
        a.load("rcx", field(R.window));
        api(a, "gtk_window_present");
        a.jmp(success);
        const validSize = (a: Assembler) => {
            a.load("r10", slot(72));
            for (const offset of [12, 16]) {
                a.load("rax", { base: "r10", disp: offset }, 32);
                a.cmp("rax", 1);
                a.jcc("b", invalid);
                a.cmp("rax", 16384);
                a.jcc("a", invalid);
            }
        };
        a.label(resize);
        validSize(a);
        a.load("rdx", { base: "r10", disp: 12 }, 32);
        a.load("r8", { base: "r10", disp: 16 }, 32);
        a.load("r10", slot(80));
        a.load("rcx", field(R.window));
        api(a, "gtk_window_set_default_size");
        a.jmp(success);
        a.label(create);
        validSize(a);
        a.load("rax", { base: "r10", disp: 575 }, 8);
        a.test("rax", "rax");
        a.jcc("ne", invalid);
        a.load("rax", mem("init"));
        a.cmp("rax", -1);
        a.jcc("e", failedInit);
        const initialized = a.unique("initialized");
        a.test("rax", "rax");
        a.jcc("ne", initialized);
        api(a, "gtk_init_check");
        a.shl("rax", 32);
        a.shr("rax", 32);
        const initOk = a.unique("initOk");
        a.test("rax", "rax");
        a.jcc("ne", initOk);
        a.mov("rax", -1);
        a.store(mem("init"), "rax");
        a.jmp(failedInit);
        a.label(initOk);
        a.mov("rax", 1);
        a.store(mem("init"), "rax");
        a.label(initialized);
        a.lea("r10", mem("records"));
        a.mov("r11", 0);
        const find = a.unique("find"),
            found = a.unique("found"),
            nextSlot = a.unique("nextSlot");
        a.label(find);
        a.load("rax", field(R.window));
        a.test("rax", "rax");
        a.jcc("ne", nextSlot);
        a.load("rax", field(R.generation));
        a.cmp("rax", 0x7fffffff);
        a.jcc("b", found);
        a.label(nextSlot);
        a.add("r10", R.size);
        a.add("r11", 1);
        a.cmp("r11", guiSlots);
        a.jcc("b", find);
        a.jmp(capacity);
        a.label(found);
        a.add("rax", 1);
        a.store(field(R.generation), "rax");
        a.store(slot(80), "r10");
        a.load("rdx", slot(72));
        a.store({ base: "rdx", disp: 4 }, "r11", 32);
        a.store({ base: "rdx", disp: 8 }, "rax", 32);
        api(a, "gtk_window_new");
        a.test("rax", "rax");
        a.jcc("e", partial);
        a.load("r10", slot(80));
        a.store(field(R.window), "rax");
        a.mov("rcx", "rax");
        a.load("rdx", slot(72));
        a.add("rdx", 64);
        api(a, "gtk_window_set_title");
        a.load("r10", slot(72));
        a.load("rdx", { base: "r10", disp: 12 }, 32);
        a.load("r8", { base: "r10", disp: 16 }, 32);
        a.load("r10", slot(80));
        a.load("rcx", field(R.window));
        api(a, "gtk_window_set_default_size");
        a.load("r10", slot(80));
        a.load("rcx", field(R.window));
        a.lea("rdx", mem("closeSignal"));
        a.lea("r8", mem("closeCallback"));
        a.mov("r9", "r10");
        a.mov("rax", 0);
        a.store(slot(32), "rax");
        a.store(slot(40), "rax");
        api(a, "g_signal_connect_data");
        a.load("r10", slot(80));
        a.store(field(R.signal), "rax");
        a.test("rax", "rax");
        a.jcc("e", partial);
        a.load("rcx", slot(80));
        a.load("r10", slot(72));
        a.load("rdx", { base: "r10", disp: 4 }, 32);
        a.call("gui.input.initialize");
        a.load("r10", slot(80));
        a.load("rcx", field(R.window));
        api(a, "gtk_window_present");
        a.jmp(success);
        a.label(partial);
        a.load("rcx", slot(80));
        a.call("gui.destroy");
        a.mov("rax", -4);
        a.jmp(done);
        a.label(poll);
        a.load("rax", mem("init"));
        a.cmp("rax", 1);
        a.jcc("ne", success);
        // Capture deadline before dispatch; GUI cannot sleep past the timer budget.
        api(a, "g_get_monotonic_time");
        a.store(slot(96), "rax");
        a.load("r10", slot(72));
        a.load("rax", { base: "r10", disp: 20 }, 32);
        const clamped = a.unique("clamped");
        a.cmp("rax", 10);
        a.jcc("be", clamped);
        a.mov("rax", 10);
        a.label(clamped);
        a.mov("r11", 1000);
        a.imul("rax", "r11");
        a.load("r11", slot(96));
        a.add("rax", "r11");
        a.store(slot(96), "rax");
        a.mov("rax", 8);
        a.store(slot(88), "rax");
        const iterate = a.unique("iterate"),
            sampled = a.unique("sampled");
        a.label(iterate);
        a.mov("rcx", 0);
        a.mov("rdx", 0);
        api(a, "g_main_context_iteration");
        a.shl("rax", 32);
        a.shr("rax", 32);
        a.test("rax", "rax");
        a.jcc("e", sampled);
        a.load("rax", slot(88));
        a.sub("rax", 1);
        a.store(slot(88), "rax");
        a.jcc("ne", iterate);
        a.label(sampled);
        a.call("gui.sample");
        a.mov("rax", guiSlots);
        a.store(slot(88), "rax");
        const scan = a.unique("scan"),
            noEvent = a.unique("noEvent"),
            terminal = a.unique("terminal"),
            scale = a.unique("scale"),
            emit = a.unique("emit"),
            nextRecord = a.unique("nextRecord");
        a.label(scan);
        a.load("r11", mem("cursor"));
        a.load("rdx", slot(72));
        a.store({ base: "rdx", disp: 4 }, "r11", 32);
        a.mov("rax", "r11");
        a.add("r11", 1);
        a.and("r11", guiSlots - 1);
        a.store(mem("cursor"), "r11");
        a.shl("rax", 7);
        a.lea("r10", mem("records"));
        a.add("r10", "rax");
        a.store(slot(80), "r10");
        a.load("rax", field(R.window));
        a.test("rax", "rax");
        a.jcc("e", nextRecord);
        a.load("rax", field(R.generation));
        a.store({ base: "rdx", disp: 8 }, "rax", 32);
        a.load("rax", field(R.close));
        a.test("rax", "rax");
        a.jcc("ne", terminal);
        a.load("rax", field(R.dirty));
        a.test("rax", "rax");
        a.jcc("e", nextRecord);
        // Do not report resize until both dimensions have been allocated.
        a.mov("r11", "rax");
        a.and("r11", 1);
        a.jcc("e", scale);
        a.load("r11", field(R.width));
        a.test("r11", "r11");
        a.jcc("e", scale);
        a.load("r11", field(R.height));
        a.test("r11", "r11");
        a.jcc("e", scale);
        a.and("rax", -2);
        a.store(field(R.dirty), "rax");
        a.mov("rax", 2);
        a.jmp(emit);
        a.label(scale);
        a.load("rax", field(R.dirty));
        a.mov("r11", "rax");
        a.and("r11", 2);
        a.jcc("e", nextRecord);
        a.and("rax", -3);
        a.store(field(R.dirty), "rax");
        a.mov("rax", 3);
        a.jmp(emit);
        a.label(terminal);
        a.mov("rcx", "r10");
        a.call("gui.destroy");
        a.mov("rax", 1);
        a.label(emit);
        a.load("rdx", slot(72));
        a.store({ base: "rdx", disp: 24 }, "rax", 32);
        a.load("r10", slot(80));
        for (const [offset, word] of [
            [R.width, 7],
            [R.height, 8],
            [R.scale, 9],
        ] as const) {
            a.load("rax", field(offset));
            a.store({ base: "rdx", disp: word * 4 }, "rax", 32);
        }
        a.mov("rax", 1);
        a.jmp(done);
        a.label(nextRecord);
        a.load("rax", slot(88));
        a.sub("rax", 1);
        a.store(slot(88), "rax");
        a.jcc("ne", scan);
        a.label(noEvent);
        a.load("rcx", slot(72));
        a.load("rdx", slot(112));
        a.call("gui.folder.take");
        a.test("rax", "rax");
        a.jcc("ne", done);
        a.load("rcx", slot(72));
        a.load("rdx", slot(112));
        a.call("gui.input.take");
        a.test("rax", "rax");
        a.jcc("ne", done);
        // Overflow lives outside the FIFO and terminal close storage.
        a.lea("r10", mem("records"));
        a.mov("r11", 0);
        const overLoop = a.unique("overLoop"),
            overNext = a.unique("overNext");
        a.label(overLoop);
        a.load("rax", field(R.overflow));
        a.test("rax", "rax");
        a.jcc("e", overNext);
        a.load("rdx", slot(72));
        a.store({ base: "rdx", disp: 4 }, "r11", 32);
        a.store({ base: "rdx", disp: 48 }, "rax", 32);
        a.load("rax", field(R.generation));
        a.store({ base: "rdx", disp: 8 }, "rax", 32);
        a.mov("rax", 14);
        a.store({ base: "rdx", disp: 24 }, "rax", 32);
        a.mov("rax", 0);
        a.store(field(R.overflow), "rax");
        a.mov("rax", 1);
        a.jmp(done);
        a.label(overNext);
        a.add("r10", R.size);
        a.add("r11", 1);
        a.cmp("r11", guiSlots);
        a.jcc("b", overLoop);
        api(a, "g_get_monotonic_time");
        a.load("rcx", slot(96));
        a.sub("rcx", "rax");
        a.cmp("rcx", 0);
        a.jcc("le", success);
        api(a, "g_usleep");
        a.jmp(success);
        a.label(wrongThread);
        a.mov("rax", -5);
        a.jmp(done);
        a.label(failedInit);
        a.mov("rax", -1);
        a.jmp(done);
        a.label(capacity);
        a.mov("rax", -2);
        a.jmp(done);
        a.label(invalid);
        a.mov("rax", -3);
        a.jmp(done);
        a.label(success);
        a.mov("rax", 0);
        a.label(done);
        a.cvtsi2sd("xmm0", "rax");
        a.load("rcx", slot(64));
        a.mov("rax", 3);
        a.store({ base: "rcx" }, "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
    });
    return b;
}
