import { RuntimeBuilder, slot } from "./abi.js";
import type { Assembler } from "../backend/machine/context.js";
import { guiSystemCall } from "./gui-abi.js";
import { renderCall as call } from "./gui-render-api.js";

// All storage is native, process owned. No managed Value crosses a callback.
export const GuiControl = {
    size: 256,
    widget: 0,
    wrapper: 8,
    owner: 16,
    generation: 24,
    id: 32,
    epoch: 40,
    kind: 48,
    revision: 56,
    muted: 64,
    seen: 72,
    key: 80,
    focus: 88,
    click: 96,
    attached: 104,
    layout: 112,
} as const;
export const GuiEvent = {
    size: 128,
    owner: 0,
    generation: 8,
    id: 16,
    epoch: 24,
    code: 32,
    value: 40,
    modifiers: 48,
    revision: 56,
    text: 64,
    x: 72,
    y: 80,
} as const;
const C = GuiControl,
    E = GuiEvent;
// A transaction may replace every live control before retiring the old tree.
// Keep all 256 slots for 128 live + 128 staged widgets; window shortcuts have
// their own record and cannot consume a staging slot.
export const guiControlSlots = 256;
const mem = (name: string, addend = 0) => ({
    rip: "gui.input." + name,
    addend,
});
const f = (offset: number) => ({ base: "r10" as const, disp: offset });
// R10: window record (128 bytes) -> its synthetic control (256 bytes).
function windowControl(a: Assembler) {
    a.lea("r11", { rip: "gui.records" });
    a.sub("r10", "r11");
    a.shl("r10", 1);
    a.lea("r11", mem("windows"));
    a.add("r10", "r11");
}
const narrow = (a: Assembler) => {
    a.shl("rax", 32);
    a.shr("rax", 32);
};
export const guiInputCalls: [string, string, string][] = [
    ...[
        ["gtk_overlay_new", ""],
        ["gtk_overlay_set_child", "pp"],
        ["gtk_overlay_add_overlay", "pp"],
        ["gtk_fixed_new", ""],
        ["gtk_fixed_put", "ppdd"],
        ["gtk_fixed_move", "ppdd"],
        ["gtk_fixed_remove", "pp"],
        ["gtk_scrolled_window_new", ""],
        ["gtk_scrolled_window_set_child", "pp"],
        ["gtk_scrolled_window_set_policy", "ppp"],
        ["gtk_button_new", ""],
        ["gtk_button_set_label", "pp"],
        ["gtk_entry_new", ""],
        ["gtk_entry_set_max_length", "pp"],
        ["gtk_editable_set_text", "pp"],
        ["gtk_editable_get_text", "p"],
        ["gtk_check_button_new", ""],
        ["gtk_check_button_set_label", "pp"],
        ["gtk_check_button_set_active", "pp"],
        ["gtk_check_button_get_active", "p"],
        ["gtk_widget_set_size_request", "ppp"],
        ["gtk_widget_set_sensitive", "pp"],
        ["gtk_widget_set_visible", "pp"],
        ["gtk_widget_set_hexpand", "pp"],
        ["gtk_widget_set_vexpand", "pp"],
        ["gtk_widget_set_overflow", "pp"],
        ["gtk_widget_grab_focus", "p"],
        ["gtk_widget_activate", "p"],
        ["gtk_widget_add_controller", "pp"],
        ["gtk_widget_set_focusable", "pp"],
        ["gtk_widget_insert_after", "ppp"],
        ["gtk_event_controller_key_new", ""],
        ["gtk_event_controller_focus_new", ""],
        ["gtk_gesture_click_new", ""],
        ["gtk_event_controller_set_propagation_phase", "pp"],
        ["gtk_gesture_single_set_button", "pp"],
        ["gtk_gesture_single_get_current_button", "p"],
        ["gtk_event_controller_get_current_event_state", "p"],
        ["gtk_accessible_update_property", "pppp"],
        ["gtk_file_dialog_new", ""],
        ["gtk_file_dialog_set_title", "pp"],
        ["gtk_file_dialog_set_initial_folder", "pp"],
        ["gtk_file_dialog_select_folder", "ppppp"],
        ["gtk_file_dialog_select_folder_finish", "ppp"],
    ].map(
        ([name, sig]) =>
            ["libgtk-4.so.1", name!, sig!] as [string, string, string],
    ),
    ["libgobject-2.0.so.0", "g_object_ref_sink", "p"],
    ["libglib-2.0.so.0", "g_strdup", "p"],
    ["libglib-2.0.so.0", "g_free", "p"],
    ["libglib-2.0.so.0", "g_error_free", "p"],
    ["libglib-2.0.so.0", "g_error_matches", "ppp"],
    ["libgtk-4.so.1", "gtk_dialog_error_quark", ""],
    ["libgio-2.0.so.0", "g_io_error_quark", ""],
    ["libgio-2.0.so.0", "g_cancellable_new", ""],
    ["libgio-2.0.so.0", "g_cancellable_cancel", "p"],
    ["libgio-2.0.so.0", "g_file_new_for_path", "p"],
    ["libgio-2.0.so.0", "g_file_get_path", "p"],
];

/** Dedicated SysV callback adapters only use volatile registers. All calls to
 * GTK go through the Win64/SysV bank adapter; all frames include shadow space. */
export function guiInput(b: RuntimeBuilder): void {
    for (const [lib, name, sig] of guiInputCalls)
        guiSystemCall(b, lib, name, sig);
    b.data(
        "gui.input.controls",
        new Uint8Array(32 * guiControlSlots * C.size),
        ".data",
    );
    b.data("gui.input.windows", new Uint8Array(32 * C.size), ".data");
    b.data("gui.input.shortcuts", new Uint8Array(32 * 32 * 16), ".data");
    b.data("gui.input.queue", new Uint8Array(256 * E.size), ".data");
    b.data("gui.input.indices", new Uint8Array(24), ".data"); // read, write, count
    b.data("gui.input.pending", new Uint8Array(128 * 16), ".data");
    for (const signal of [
        "clicked",
        "changed",
        "toggled",
        "activate",
        "enter",
        "leave",
        "key-pressed",
        "key-released",
        "pressed",
        "released",
    ])
        b.data("gui.input." + signal, new TextEncoder().encode(signal + "\0"));
    b.data("gui.input.zero", new Uint8Array(8));
    inputQueue(b);
    inputCallbacks(b);
    inputControls(b);
    folderChooser(b);
}

function inputQueue(b: RuntimeBuilder) {
    // RCX=control, RDX=code. Reserve before copying any transient text. A full
    // queue drops the newest event and increments an out-of-band overflow count.
    b.fn("gui.input.reserve", 8, (a) => {
        const no = a.unique("no"),
            full = a.unique("full"),
            done = a.unique("done");
        a.mov("r10", "rcx");
        a.load("rax", f(C.widget));
        a.test("rax", "rax");
        a.jcc("e", no);
        a.load("rax", f(C.muted));
        a.test("rax", "rax");
        a.jcc("ne", no);
        a.load("r11", f(C.owner));
        a.load("rax", { base: "r11" });
        a.test("rax", "rax");
        a.jcc("e", no);
        a.load("rax", { base: "r11", disp: 24 });
        a.test("rax", "rax");
        a.jcc("ne", no);
        a.load("rax", f(C.generation));
        a.load("rcx", { base: "r11", disp: 16 });
        a.cmp("rax", "rcx");
        a.jcc("ne", no);
        a.load("rax", mem("indices", 16));
        a.cmp("rax", 256);
        a.jcc("ae", full);
        a.add("rax", 1);
        a.store(mem("indices", 16), "rax");
        a.load("rax", mem("indices", 8));
        a.mov("rcx", "rax");
        a.add("rcx", 1);
        a.and("rcx", 255);
        a.store(mem("indices", 8), "rcx");
        a.shl("rax", 7);
        a.lea("rcx", mem("queue"));
        a.add("rax", "rcx");
        a.store({ base: "rax", disp: E.owner }, "r11");
        a.store({ base: "rax", disp: E.code }, "rdx");
        for (const [src, dest] of [
            [C.generation, E.generation],
            [C.id, E.id],
            [C.epoch, E.epoch],
            [C.revision, E.revision],
        ]) {
            a.load("rcx", f(src!));
            a.store({ base: "rax", disp: dest }, "rcx");
        }
        a.mov("rcx", 0);
        for (const offset of [E.value, E.modifiers, E.text, E.x, E.y])
            a.store({ base: "rax", disp: offset }, "rcx");
        a.jmp(done);
        a.label(full);
        a.load("rax", { base: "r11", disp: 96 });
        a.add("rax", 1);
        a.store({ base: "r11", disp: 96 }, "rax");
        a.label(no);
        a.mov("rax", 0);
        a.label(done);
    });
    // RCX=packet, RDX=borrowed byte size. Removes a single FIFO record. Stale
    // generations still release text ownership, even after a close/reopen.
    b.fn("gui.input.take", 88, (a) => {
        a.store(slot(48), "rcx");
        a.store(slot(56), "rdx");
        const none = a.unique("none"),
            done = a.unique("done"),
            release = a.unique("release"),
            noText = a.unique("noText");
        a.load("rax", mem("indices", 16));
        a.test("rax", "rax");
        a.jcc("e", none);
        a.sub("rax", 1);
        a.store(mem("indices", 16), "rax");
        a.load("rax", mem("indices"));
        a.mov("r11", "rax");
        a.add("r11", 1);
        a.and("r11", 255);
        a.store(mem("indices"), "r11");
        a.shl("rax", 7);
        a.lea("r10", mem("queue"));
        a.add("r10", "rax");
        a.store(slot(64), "r10");
        a.mov("rax", 0);
        a.store(slot(72), "rax");
        a.load("r11", f(E.owner));
        a.test("r11", "r11");
        a.jcc("e", release);
        a.load("rax", { base: "r11" });
        a.test("rax", "rax");
        a.jcc("e", release);
        a.load("rax", f(E.generation));
        a.load("rdx", { base: "r11", disp: 16 });
        a.cmp("rax", "rdx");
        a.jcc("ne", release);
        a.load("rcx", slot(48));
        a.store({ base: "rcx", disp: 8 }, "rax", 32);
        a.lea("rax", { rip: "gui.records" });
        a.sub("r11", "rax");
        a.shr("r11", 7);
        a.store({ base: "rcx", disp: 4 }, "r11", 32);
        for (const [src, dest] of [
            [E.code, 6],
            [E.revision, 9],
            [E.id, 10],
            [E.epoch, 11],
            [E.value, 12],
            [E.modifiers, 13],
        ]) {
            a.load("rax", f(src!));
            a.store({ base: "rcx", disp: dest! * 4 }, "rax", 32);
        }
        for (const [src, dest] of [
            [E.x, 28],
            [E.y, 32],
        ]) {
            a.movsd("xmm0", f(src!));
            a.cvtsd2ss("xmm0", "xmm0");
            a.movqFromXmm("rax", "xmm0");
            a.store({ base: "rcx", disp: dest }, "rax", 32);
        }
        a.mov("rax", 0);
        a.store({ base: "rcx", disp: 56 }, "rax", 32);
        a.load("rdx", f(E.text));
        a.test("rdx", "rdx");
        a.jcc("e", noText);
        a.load("r8", slot(56));
        a.call("gui.input.copyText");
        a.label(noText);
        a.mov("rax", 1);
        a.store(slot(72), "rax");
        a.label(release);
        a.load("r10", slot(64));
        a.load("rcx", f(E.text));
        call(a, "g_free", ["rcx"]);
        a.load("r10", slot(64));
        a.mov("rax", 0);
        a.store(f(E.text), "rax");
        a.store(f(E.owner), "rax");
        a.load("rax", slot(72));
        a.jmp(done);
        a.label(none);
        a.mov("rax", 0);
        a.label(done);
    });
    b.fn("gui.input.purge", 88, (a) => {
        a.store(slot(48), "rcx");
        a.lea("rax", mem("queue"));
        a.store(slot(56), "rax");
        a.mov("rax", 256);
        a.store(slot(64), "rax");
        const loop = a.unique("loop"),
            next = a.unique("next");
        a.label(loop);
        a.load("r10", slot(56));
        a.load("rax", f(E.owner));
        a.load("r11", slot(48));
        a.cmp("rax", "r11");
        a.jcc("ne", next);
        a.load("rcx", f(E.text));
        a.mov("rax", 0);
        a.store(f(E.text), "rax");
        a.store(f(E.owner), "rax");
        call(a, "g_free", ["rcx"]);
        a.label(next);
        a.load("rax", slot(56));
        a.add("rax", E.size);
        a.store(slot(56), "rax");
        a.load("rax", slot(64));
        a.sub("rax", 1);
        a.store(slot(64), "rax");
        a.jcc("ne", loop);
        // If every remaining record is now invalid, releasing the queue slots
        // avoids a full stale queue on an immediate reopen without polling.
        a.lea("r10", mem("queue"));
        a.mov("r11", 256);
        const check = a.unique("check"),
            done = a.unique("done");
        a.label(check);
        a.load("rax", f(E.owner));
        a.test("rax", "rax");
        a.jcc("ne", done);
        a.add("r10", E.size);
        a.sub("r11", 1);
        a.jcc("ne", check);
        a.mov("rax", 0);
        for (const off of [0, 8, 16]) a.store(mem("indices", off), "rax");
        a.label(done);
    });
    // Copies at most 4095 UTF-8 bytes plus NUL; insufficient caller storage
    // yields empty text, never an out-of-bounds write or a truncated path.
    b.fn("gui.input.copyText", 8, (a) => {
        const scan = a.unique("scan"),
            copy = a.unique("copy"),
            loop = a.unique("loop"),
            done = a.unique("done");
        a.mov("rax", 0);
        a.label(scan);
        a.cmp("rax", 4097);
        a.jcc("ae", done);
        a.mov("r10", "rdx");
        a.add("r10", "rax");
        a.load("r11", { base: "r10" }, 8);
        a.test("r11", "r11");
        a.jcc("e", copy);
        a.add("rax", 1);
        a.jmp(scan);
        a.label(copy);
        a.mov("r10", "rax");
        a.add("r10", 65);
        a.cmp("r10", "r8");
        a.jcc("a", done);
        a.store({ base: "rcx", disp: 56 }, "rax", 32);
        a.add("rcx", 64);
        a.add("rax", 1);
        a.label(loop);
        a.load("r11", { base: "rdx" }, 8);
        a.store({ base: "rcx" }, "r11", 8);
        a.add("rcx", 1);
        a.add("rdx", 1);
        a.sub("rax", 1);
        a.jcc("ne", loop);
        a.label(done);
    });
}

function inputCallbacks(b: RuntimeBuilder) {
    for (const [name, code] of [
        ["activate", 4],
        ["changed", 5],
        ["toggled", 6],
        ["enter", 7],
        ["leave", 8],
    ] as const) {
        b.fn("gui.input." + name + "Callback", 72, (a) => {
            a.store(slot(48), "rdi");
            a.store(slot(56), "rsi");
            a.mov("rcx", "rsi");
            a.mov("rdx", code);
            a.call("gui.input.reserve");
            const done = a.unique("done");
            a.test("rax", "rax");
            a.jcc("e", done);
            a.store(slot(64), "rax");
            if (code === 5) {
                call(a, "gtk_editable_get_text", [slot(48)]);
                call(a, "g_strdup", ["rax"]);
                a.load("r10", slot(64));
                a.store(f(E.text), "rax");
            }
            if (code === 6) {
                call(a, "gtk_check_button_get_active", [slot(48)]);
                narrow(a);
                a.load("r10", slot(64));
                a.store(f(E.value), "rax");
            }
            a.label(done);
        });
    }
    for (const [name, code] of [
        ["key-pressed", 9],
        ["key-released", 10],
    ] as const) {
        b.fn("gui.input." + name + "Callback", 88, (a) => {
            // SysV controller, keyval, hardware code, modifiers, data.
            a.store(slot(48), "r8");
            a.store(slot(56), "rsi");
            a.store(slot(64), "rcx");
            a.mov("rcx", "r8");
            a.mov("rdx", code);
            a.call("gui.input.reserve");
            const no = a.unique("no"),
                done = a.unique("done");
            a.test("rax", "rax");
            a.jcc("e", no);
            a.load("r11", slot(56));
            a.store({ base: "rax", disp: E.value }, "r11");
            a.load("r11", slot(64));
            a.store({ base: "rax", disp: E.modifiers }, "r11");
            a.label(no);
            if (code === 9) {
                // GTK buttons handle Space on release. Return/KP_Enter explicitly
                // activate buttons/toggles once, synchronously, before JS runs.
                a.load("rax", slot(56));
                const activate = a.unique("activate");
                a.cmp("rax", 65293);
                a.jcc("e", activate);
                a.cmp("rax", 65421);
                a.jcc("ne", done);
                a.label(activate);
                a.load("r10", slot(48));
                a.load("rax", f(C.kind));
                a.cmp("rax", 11);
                a.jcc("e", done);
                a.load("rcx", f(C.widget));
                call(a, "gtk_widget_activate", ["rcx"]);
                a.mov("rax", 1);
                const end = a.unique("end");
                a.jmp(end);
                a.label(done);
                a.mov("rax", 0);
                a.label(end);
            } else {
                a.label(done);
                a.mov("rax", 0);
            }
        });
    }
    for (const [name, code] of [
        ["pressed", 11],
        ["released", 13],
    ] as const) {
        b.fn("gui.input." + name + "Callback", 88, (a) => {
            // SysV GP and FP banks are independent: data is RDX, x/y XMM0/1.
            a.store(slot(48), "rdi");
            a.store(slot(56), "rdx");
            a.storesd(slot(64), "xmm0");
            a.storesd(slot(72), "xmm1");
            a.mov("rcx", "rdx");
            a.mov("rdx", code);
            a.call("gui.input.reserve");
            const done = a.unique("done");
            a.test("rax", "rax");
            a.jcc("e", done);
            a.store(slot(80), "rax");
            for (const [src, dest] of [
                [64, E.x],
                [72, E.y],
            ]) {
                a.load("r11", slot(src!));
                a.store({ base: "rax", disp: dest }, "r11");
            }
            call(a, "gtk_gesture_single_get_current_button", [slot(48)]);
            narrow(a);
            a.load("r10", slot(80));
            a.store(f(E.value), "rax");
            call(a, "gtk_event_controller_get_current_event_state", [slot(48)]);
            narrow(a);
            a.load("r10", slot(80));
            a.store(f(E.modifiers), "rax");
            a.label(done);
        });
    }
    b.fn("gui.input.shortcutCallback", 88, (a) => {
        a.store(slot(48), "r8");
        a.store(slot(56), "rsi");
        a.store(slot(64), "rcx");
        // Window capture policy is installed synchronously. JavaScript return
        // values cannot retroactively stop GTK dispatch or prevent text entry.
        a.load("r10", { base: "r8", disp: 120 });
        a.store(slot(72), "r10");
        a.mov("rax", 32);
        a.store(slot(80), "rax");
        const loop = a.unique("loop"),
            next = a.unique("next"),
            done = a.unique("done"),
            matched = a.unique("matched");
        a.label(loop);
        a.load("r10", slot(72));
        a.load("rax", { base: "r10" }, 32);
        a.test("rax", "rax");
        a.jcc("e", next);
        a.load("rax", { base: "r10", disp: 4 }, 32);
        a.load("r11", slot(56));
        a.cmp("rax", "r11");
        a.jcc("ne", next);
        a.load("rax", { base: "r10", disp: 8 }, 32);
        a.load("r11", slot(64));
        a.and("r11", 0x1c00000d);
        a.cmp("rax", "r11");
        a.jcc("e", matched);
        a.label(next);
        a.load("rax", slot(72));
        a.add("rax", 16);
        a.store(slot(72), "rax");
        a.load("rax", slot(80));
        a.sub("rax", 1);
        a.store(slot(80), "rax");
        a.jcc("ne", loop);
        a.mov("rax", 0);
        a.jmp(done);
        a.label(matched);
        // An independently owned synthetic control record represents the
        // window, so shortcuts share the bounded FIFO and generation checks.
        a.load("r10", slot(48));
        windowControl(a);
        a.mov("rcx", "r10");
        a.mov("rdx", 12);
        a.call("gui.input.reserve");
        const dropped = a.unique("dropped");
        a.test("rax", "rax");
        a.jcc("e", dropped);
        a.load("r10", slot(72));
        a.load("r11", { base: "r10" }, 32);
        a.store({ base: "rax", disp: E.value }, "r11");
        a.label(dropped);
        a.mov("rax", 1);
        a.label(done);
    });
}

function connect(
    a: Assembler,
    widget: number,
    signal: string,
    callback: string,
    data: number,
    idOffset = 0,
) {
    a.lea("rdx", mem(signal));
    a.lea("r8", { rip: "gui.input." + callback + "Callback" });
    call(a, "g_signal_connect_data", [
        slot(widget),
        "rdx",
        "r8",
        slot(data),
        0,
        0,
    ]);
    if (idOffset) {
        a.load("r10", slot(data));
        a.store(f(idOffset), "rax");
    }
}

function inputControls(b: RuntimeBuilder) {
    // RCX=window record, RDX=window slot. Fixed arrays outlive any synchronous
    // destruction callbacks; invalidation precedes disconnect and unparenting.
    b.fn("gui.input.initialize", 72, (a) => {
        a.store(slot(48), "rcx");
        a.store(slot(56), "rdx");
        a.mov("rax", "rdx");
        a.shl("rax", 16);
        a.lea("r11", mem("controls"));
        a.add("rax", "r11");
        a.store({ base: "rcx", disp: 112 }, "rax");
        a.mov("r10", "rcx");
        windowControl(a);
        a.load("rax", { base: "rcx" });
        a.store(f(C.widget), "rax");
        a.store(f(C.owner), "rcx");
        a.load("rax", { base: "rcx", disp: 16 });
        a.store(f(C.generation), "rax");
        a.mov("rax", "rdx");
        a.shl("rax", 9);
        a.lea("r11", mem("shortcuts"));
        a.add("rax", "r11");
        a.store({ base: "rcx", disp: 120 }, "rax");
        a.mov("r10", "rax");
        a.mov("rax", 0);
        for (let i = 0; i < 32; i++)
            a.store({ base: "r10", disp: i * 16 }, "rax");
        call(a, "gtk_event_controller_key_new", []);
        a.store(slot(64), "rax");
        a.load("r10", slot(48));
        windowControl(a);
        a.store(f(C.key), "rax");
        connect(a, 64, "key-pressed", "shortcut", 48);
        a.load("r10", slot(48));
        windowControl(a);
        a.store(f(144), "rax");
        call(a, "gtk_event_controller_set_propagation_phase", [slot(64), 1]);
        a.load("r10", slot(48));
        a.load("rcx", f(0));
        call(a, "gtk_widget_add_controller", ["rcx", slot(64)]);
    });
    b.fn("gui.input.remove", 88, (a) => {
        a.store(slot(48), "rcx");
        a.load("rax", { base: "rcx" });
        a.store(slot(56), "rax");
        a.mov("rax", 0);
        a.store({ base: "rcx" }, "rax");
        // Disconnect every source before removing ownership, including
        // controllers temporarily retained by in-flight native dispatch.
        for (const [off, start] of [
            [C.widget, 128],
            [C.key, 144],
            [C.focus, 160],
            [C.click, 176],
        ]) {
            for (const id of [start!, start! + 8]) {
                a.load("r10", slot(48));
                a.load("rdx", f(id));
                const skip = a.unique("skip");
                a.test("rdx", "rdx");
                a.jcc("e", skip);
                if (off === C.widget) a.load("rcx", slot(56));
                else a.load("rcx", f(off!));
                call(a, "g_signal_handler_disconnect", ["rcx", "rdx"]);
                a.label(skip);
            }
        }
        a.load("r10", slot(48));
        a.load("rax", f(C.wrapper));
        a.store(slot(64), "rax");
        const noWrapper = a.unique("noWrapper"),
            unparented = a.unique("unparented");
        a.test("rax", "rax");
        a.jcc("e", noWrapper);
        a.load("rax", f(C.attached));
        a.test("rax", "rax");
        a.jcc("e", unparented);
        a.load("r11", f(C.owner));
        a.load("rcx", { base: "r11", disp: 80 });
        call(a, "gtk_fixed_remove", ["rcx", slot(64)]);
        a.label(unparented);
        call(a, "g_object_unref", [slot(64)]);
        a.label(noWrapper);
        call(a, "g_object_unref", [slot(56)]);
    });
    b.fn("gui.input.destroy", 88, (a) => {
        a.store(slot(48), "rcx");
        a.load("rax", { base: "rcx", disp: 112 });
        a.store(slot(56), "rax");
        a.mov("rax", guiControlSlots);
        a.store(slot(64), "rax");
        const loop = a.unique("loop"),
            skip = a.unique("skip"),
            done = a.unique("done");
        a.load("rax", slot(56));
        a.test("rax", "rax");
        a.jcc("e", done);
        a.label(loop);
        a.load("rcx", slot(56));
        a.load("rax", { base: "rcx" });
        a.test("rax", "rax");
        a.jcc("e", skip);
        a.call("gui.input.remove");
        a.label(skip);
        a.load("rax", slot(56));
        a.add("rax", C.size);
        a.store(slot(56), "rax");
        a.load("rax", slot(64));
        a.sub("rax", 1);
        a.store(slot(64), "rax");
        a.jcc("ne", loop);
        a.label(done);
        // The window key controller may be held by an in-flight GTK event;
        // disconnect its callback before this window slot can be reused.
        a.load("r10", slot(48));
        const noShortcut = a.unique("noShortcut");
        windowControl(a);
        a.mov("rax", 0);
        a.store(f(C.widget), "rax");
        a.load("rcx", f(C.key));
        a.load("rdx", f(144));
        a.store(f(144), "rax");
        a.test("rdx", "rdx");
        a.jcc("e", noShortcut);
        call(a, "g_signal_handler_disconnect", ["rcx", "rdx"]);
        a.label(noShortcut);
        a.load("rcx", slot(48));
        a.call("gui.folder.cancelWindow");
        a.load("rcx", slot(48));
        a.call("gui.input.purge");
        a.load("r10", slot(48));
        a.mov("rax", 0);
        for (const off of [80, 88, 96]) a.store(f(off), "rax");
    });
    controlsTransaction(b);
}

function controlsTransaction(b: RuntimeBuilder) {
    for (const [name, rollback] of [
        ["rollback", true],
        ["retire", false],
    ] as const) {
        b.fn("gui.input." + name, 72, (a) => {
            a.load("rax", { base: "rcx", disp: 112 });
            a.store(slot(48), "rax");
            a.mov("rax", guiControlSlots);
            a.store(slot(56), "rax");
            const loop = a.unique("loop"),
                next = a.unique("next");
            a.label(loop);
            a.load("r10", slot(48));
            a.load("rax", f(C.widget));
            a.test("rax", "rax");
            a.jcc("e", next);
            a.load("rax", f(C.seen));
            a.cmp("rax", rollback ? 2 : 0);
            a.jcc("ne", next);
            a.mov("rcx", "r10");
            a.call("gui.input.remove");
            a.label(next);
            a.load("rax", slot(48));
            a.add("rax", C.size);
            a.store(slot(48), "rax");
            a.load("rax", slot(56));
            a.sub("rax", 1);
            a.store(slot(56), "rax");
            a.jcc("ne", loop);
        });
    }
    // RCX=window, RDX=scene packet. Called after complete packet validation and
    // a successful Cairo candidate. New widgets are staged off-tree; old entry
    // instances survive every successful layout/style/state-only update.
    b.fn("gui.input.prepare", 136, (a) => {
        a.store(slot(48), "rcx");
        a.store(slot(56), "rdx");
        a.load("rax", { base: "rdx", disp: 40 }, 32);
        a.store(slot(64), "rax");
        a.add("rdx", 640);
        a.store(slot(72), "rdx");
        a.mov("rax", 0);
        a.store(slot(80), "rax");
        a.load("r10", { base: "rcx", disp: 112 });
        a.mov("r11", guiControlSlots);
        const clear = a.unique("clear");
        a.label(clear);
        a.store(f(C.seen), "rax");
        a.add("r10", C.size);
        a.sub("r11", 1);
        a.jcc("ne", clear);
        const loop = a.unique("loop"),
            next = a.unique("next"),
            finish = a.unique("finish"),
            failed = a.unique("failed"),
            done = a.unique("done");
        a.label(loop);
        a.load("rax", slot(64));
        a.test("rax", "rax");
        a.jcc("e", finish);
        a.load("r10", slot(72));
        a.load("rax", f(0), 32);
        a.cmp("rax", 10);
        a.jcc("b", next);
        a.load("rax", slot(80));
        a.cmp("rax", 128);
        a.jcc("ae", failed);
        a.load("r10", slot(72));
        for (const i of [0, 1, 8]) {
            a.movsd("xmm0", { base: "r10", disp: 8 + i * 8 });
            a.cvttsd2si("rax", "xmm0");
            a.cmp("rax", 1);
            a.jcc("b", failed);
            a.cmp("rax", 0x7fffffff);
            a.jcc("a", failed);
            a.cvtsi2sd("xmm1", "rax");
            a.ucomisd("xmm0", "xmm1");
            a.jcc("ne", failed);
        }
        // Find existing (ID, epoch), or an unused staging slot. Never reuse
        // a removed slot until all new widgets have been constructed.
        a.movsd("xmm0", { base: "r10", disp: 8 });
        a.cvttsd2si("rax", "xmm0");
        a.store(slot(88), "rax");
        a.movsd("xmm0", { base: "r10", disp: 16 });
        a.cvttsd2si("rax", "xmm0");
        a.store(slot(96), "rax");
        a.load("r10", slot(48));
        a.load("r10", f(112));
        a.mov("r11", guiControlSlots);
        a.mov("rax", 0);
        a.store(slot(104), "rax");
        const scan = a.unique("scan"),
            occupied = a.unique("occupied"),
            advance = a.unique("advance"),
            found = a.unique("found"),
            create = a.unique("create"),
            staged = a.unique("staged");
        a.label(scan);
        a.load("rax", f(C.widget));
        a.test("rax", "rax");
        a.jcc("ne", occupied);
        a.store(slot(104), "r10");
        a.jmp(advance);
        a.label(occupied);
        a.load("rax", f(C.id));
        a.load("rdx", slot(88));
        a.cmp("rax", "rdx");
        a.jcc("ne", advance);
        a.load("rax", f(C.epoch));
        a.load("rdx", slot(96));
        a.cmp("rax", "rdx");
        a.jcc("e", found);
        a.label(advance);
        a.add("r10", C.size);
        a.sub("r11", 1);
        a.jcc("ne", scan);
        a.load("r10", slot(104));
        a.test("r10", "r10");
        a.jcc("e", failed);
        a.jmp(create);
        a.label(found);
        a.load("rax", f(C.seen));
        a.test("rax", "rax");
        a.jcc("ne", failed); // duplicate
        a.mov("rax", 1);
        a.store(f(C.seen), "rax");
        a.jmp(staged);
        a.label(create);
        a.store(slot(112), "r10");
        a.mov("rax", 0);
        for (const off of [
            C.widget,
            C.wrapper,
            C.key,
            C.focus,
            C.click,
            C.revision,
            C.attached,
            128,
            136,
            144,
            152,
            160,
            168,
            176,
            184,
        ])
            a.store(f(off), "rax");
        a.load("rax", slot(88));
        a.store(f(C.id), "rax");
        a.load("rax", slot(96));
        a.store(f(C.epoch), "rax");
        a.load("rcx", slot(48));
        a.store(f(C.owner), "rcx");
        a.load("rax", { base: "rcx", disp: 16 });
        a.store(f(C.generation), "rax");
        a.mov("rax", 1);
        a.store(f(C.muted), "rax");
        a.mov("rax", 2);
        a.store(f(C.seen), "rax");
        a.load("r11", slot(72));
        a.load("rax", { base: "r11" }, 32);
        a.store(f(C.kind), "rax");
        const entry = a.unique("entry"),
            toggle = a.unique("toggle"),
            made = a.unique("made");
        a.cmp("rax", 11);
        a.jcc("e", entry);
        a.cmp("rax", 12);
        a.jcc("e", toggle);
        call(a, "gtk_button_new", []);
        a.jmp(made);
        a.label(entry);
        call(a, "gtk_entry_new", []);
        a.jmp(made);
        a.label(toggle);
        call(a, "gtk_check_button_new", []);
        a.label(made);
        a.test("rax", "rax");
        a.jcc("e", failed);
        a.load("r10", slot(112));
        a.store(f(C.widget), "rax");
        a.store(slot(120), "rax");
        call(a, "g_object_ref_sink", ["rax"]);
        call(a, "gtk_scrolled_window_new", []);
        a.load("r10", slot(112));
        a.store(f(C.wrapper), "rax");
        a.test("rax", "rax");
        a.jcc("e", failed);
        call(a, "g_object_ref_sink", ["rax"]);
        // EXTERNAL policies preserve clipping without a scrollbar or a child
        // minimum size enlarging the retained viewport allocation.
        a.load("r10", slot(112));
        a.load("rcx", f(C.wrapper));
        call(a, "gtk_scrolled_window_set_policy", ["rcx", 3, 3]);
        a.load("r10", slot(112));
        a.load("rcx", f(C.wrapper));
        call(a, "gtk_widget_set_focusable", ["rcx", 0]);
        a.load("r10", slot(112));
        a.load("rcx", f(C.wrapper));
        call(a, "gtk_widget_set_overflow", ["rcx", 1]);
        call(a, "gtk_fixed_new", []);
        a.load("r10", slot(112));
        a.store(f(C.layout), "rax");
        a.store(slot(128), "rax");
        a.load("rcx", f(C.wrapper));
        call(a, "gtk_scrolled_window_set_child", ["rcx", slot(128)]);
        a.load("r10", slot(112));
        a.load("rcx", f(C.layout));
        call(a, "gtk_fixed_put", [
            "rcx",
            slot(120),
            { double: mem("zero") },
            { double: mem("zero") },
        ]);
        const noEntry = a.unique("noEntry");
        a.load("r10", slot(112));
        a.load("rax", f(C.kind));
        a.cmp("rax", 11);
        a.jcc("ne", noEntry);
        call(a, "gtk_entry_set_max_length", [slot(120), 1024]);
        a.label(noEntry);
        // Widget-level activation/state signals.
        for (const [kind, signal, callback] of [
            [10, "clicked", "activate"],
            [11, "changed", "changed"],
            [12, "toggled", "toggled"],
        ] as const) {
            const skip = a.unique("skip");
            a.load("r10", slot(112));
            a.load("rax", f(C.kind));
            a.cmp("rax", kind);
            a.jcc("ne", skip);
            connect(a, 120, signal, callback, 112, 128);
            a.label(skip);
        }
        const skipActivate = a.unique("skipActivate");
        a.load("r10", slot(112));
        a.load("rax", f(C.kind));
        a.cmp("rax", 11);
        a.jcc("ne", skipActivate);
        connect(a, 120, "activate", "activate", 112, 136);
        a.label(skipActivate);
        for (const [factory, offset, signals] of [
            [
                "gtk_event_controller_key_new",
                C.key,
                ["key-pressed", "key-released"],
            ],
            ["gtk_event_controller_focus_new", C.focus, ["enter", "leave"]],
            ["gtk_gesture_click_new", C.click, ["pressed", "released"]],
        ] as const) {
            call(a, factory, []);
            a.load("r10", slot(112));
            a.store(f(offset), "rax");
            a.store(slot(128), "rax");
            for (const [index, signal] of signals.entries())
                connect(
                    a,
                    128,
                    signal,
                    signal,
                    112,
                    (offset === C.key ? 144 : offset === C.focus ? 160 : 176) +
                        index * 8,
                );
            call(a, "gtk_event_controller_set_propagation_phase", [
                slot(128),
                1,
            ]);
            if (offset === C.click)
                call(a, "gtk_gesture_single_set_button", [slot(128), 0]);
            call(a, "gtk_widget_add_controller", [slot(120), slot(128)]);
        }
        a.load("r10", slot(112));
        a.label(staged);
        a.load("rax", slot(80));
        a.shl("rax", 4);
        a.lea("r11", mem("pending"));
        a.add("r11", "rax");
        a.store({ base: "r11" }, "r10");
        a.load("rax", slot(72));
        a.store({ base: "r11", disp: 8 }, "rax");
        a.load("rax", slot(80));
        a.add("rax", 1);
        a.store(slot(80), "rax");
        a.label(next);
        a.load("rax", slot(72));
        a.add("rax", 128);
        a.store(slot(72), "rax");
        a.load("rax", slot(64));
        a.sub("rax", 1);
        a.store(slot(64), "rax");
        a.jmp(loop);
        a.label(finish);
        a.mov("rax", 0);
        a.jmp(done);
        a.label(failed);
        a.load("rcx", slot(48));
        a.call("gui.input.rollback");
        a.mov("rax", -6);
        a.label(done);
        // Save the staged count for the immediate synchronous commit.
        a.load("r10", slot(48));
        a.load("r11", slot(80));
        a.store({ base: "r10", disp: 104 }, "r11");
    });
    b.fn("gui.input.commit", 136, (a) => {
        a.store(slot(48), "rcx");
        a.store(slot(56), "rdx");
        a.call("gui.input.retire");
        a.load("r10", slot(48));
        a.load("rax", f(104));
        a.store(slot(64), "rax");
        const done = a.unique("done"),
            haveContainer = a.unique("haveContainer");
        a.test("rax", "rax");
        a.jcc("e", done);
        a.load("rax", f(80));
        a.test("rax", "rax");
        a.jcc("ne", haveContainer);
        call(a, "gtk_overlay_new", []);
        a.store(slot(72), "rax");
        call(a, "gtk_fixed_new", []);
        a.store(slot(80), "rax");
        for (const name of ["gtk_widget_set_hexpand", "gtk_widget_set_vexpand"])
            call(a, name, [slot(80), 1]);
        call(a, "gtk_widget_set_overflow", [slot(80), 1]);
        a.load("r10", slot(48));
        a.load("rcx", f(64));
        call(a, "g_object_ref_sink", ["rcx"]);
        a.load("r10", slot(48));
        a.load("rcx", f(0));
        call(a, "gtk_window_set_child", ["rcx", 0]);
        a.load("r10", slot(48));
        a.load("rdx", f(64));
        call(a, "gtk_overlay_set_child", [slot(72), "rdx"]);
        a.load("r10", slot(48));
        a.load("rcx", f(64));
        call(a, "g_object_unref", ["rcx"]);
        call(a, "gtk_overlay_add_overlay", [slot(72), slot(80)]);
        a.load("r10", slot(48));
        a.load("rcx", f(0));
        call(a, "gtk_window_set_child", ["rcx", slot(72)]);
        a.load("r10", slot(48));
        a.load("rax", slot(80));
        a.store(f(80), "rax");
        a.load("rax", slot(72));
        a.store(f(88), "rax");
        a.label(haveContainer);
        a.mov("rax", 0);
        a.store(slot(128), "rax"); // previous wrapper in retained order
        a.lea("rax", mem("pending"));
        a.store(slot(72), "rax");
        const loop = a.unique("loop"),
            next = a.unique("next");
        a.label(loop);
        a.load("r11", slot(72));
        a.load("r10", { base: "r11" });
        a.store(slot(80), "r10");
        a.load("rax", { base: "r11", disp: 8 });
        a.store(slot(88), "rax");
        a.mov("rax", 1);
        a.store(f(C.muted), "rax");
        a.load("rax", f(C.widget));
        a.store(slot(96), "rax");
        a.load("rax", f(C.wrapper));
        a.store(slot(104), "rax");
        // All strings have been validated and GTK copies them synchronously.
        a.load("r10", slot(88));
        a.load("rax", { base: "r10", disp: 4 }, 32);
        a.load("rdx", slot(56));
        a.add("rax", "rdx");
        a.store(slot(112), "rax");
        a.load("r10", slot(80));
        a.load("rax", f(C.kind));
        const notButton = a.unique("notButton"),
            notToggle = a.unique("notToggle"),
            labelled = a.unique("labelled");
        a.cmp("rax", 10);
        a.jcc("ne", notButton);
        call(a, "gtk_button_set_label", [slot(96), slot(112)]);
        a.jmp(labelled);
        a.label(notButton);
        a.cmp("rax", 12);
        a.jcc("ne", notToggle);
        call(a, "gtk_check_button_set_label", [slot(96), slot(112)]);
        a.label(notToggle);
        a.label(labelled);
        a.load("r10", slot(88));
        a.movsd("xmm0", { base: "r10", disp: 72 });
        a.cvttsd2si("rax", "xmm0");
        a.load("r10", slot(80));
        a.load("r11", f(C.revision));
        a.cmp("rax", "r11");
        const unchanged = a.unique("unchanged");
        a.jcc("e", unchanged);
        a.store(f(C.revision), "rax");
        a.load("rax", f(C.kind));
        const noEntry = a.unique("noEntry"),
            noToggle = a.unique("noToggle");
        a.cmp("rax", 11);
        a.jcc("ne", noEntry);
        call(a, "gtk_editable_set_text", [slot(96), slot(112)]);
        a.label(noEntry);
        a.load("r10", slot(80));
        a.load("rax", f(C.kind));
        a.cmp("rax", 12);
        a.jcc("ne", noToggle);
        a.load("r10", slot(88));
        a.movsd("xmm0", { base: "r10", disp: 56 });
        a.cvttsd2si("rdx", "xmm0");
        call(a, "gtk_check_button_set_active", [slot(96), "rdx"]);
        a.label(noToggle);
        a.label(unchanged);
        a.load("r10", slot(88));
        a.load("rax", { base: "r10", disp: 120 }, 32);
        a.load("rdx", slot(56));
        a.add("rax", "rdx");
        // GTK_ACCESSIBLE_PROPERTY_LABEL = 4; varargs terminator is signed -1.
        call(a, "gtk_accessible_update_property", [slot(96), 4, "rax", -1]);
        a.load("r10", slot(88));
        a.movsd("xmm0", { base: "r10", disp: 64 });
        a.cvttsd2si("rdx", "xmm0");
        call(a, "gtk_widget_set_sensitive", [slot(96), "rdx"]);
        for (const widget of [96, 104]) {
            a.load("r10", slot(88));
            for (const [arg, reg] of [
                [widget === 96 ? 4 : 11, "rdx"],
                [widget === 96 ? 5 : 12, "r8"],
            ] as const) {
                a.movsd("xmm0", { base: "r10", disp: 8 + arg * 8 });
                a.cvttsd2si(reg, "xmm0");
            }
            call(a, "gtk_widget_set_size_request", [slot(widget), "rdx", "r8"]);
        }
        a.load("r10", slot(80));
        a.load("rax", f(C.attached));
        a.test("rax", "rax");
        const placed = a.unique("placed");
        a.jcc("ne", placed);
        a.load("r10", slot(48));
        a.load("rcx", f(80));
        call(a, "gtk_fixed_put", [
            "rcx",
            slot(104),
            { double: mem("zero") },
            { double: mem("zero") },
        ]);
        a.load("r10", slot(80));
        a.mov("rax", 1);
        a.store(f(C.attached), "rax");
        a.label(placed);
        // Reorder already-parented wrappers without unparenting their entry
        // widgets: preserve caret/preedit while matching retained z/focus order.
        a.load("r10", slot(48));
        a.load("rdx", f(80));
        call(a, "gtk_widget_insert_after", [slot(104), "rdx", slot(128)]);
        a.load("rax", slot(104));
        a.store(slot(128), "rax");
        a.load("r10", slot(88));
        a.movsd("xmm0", { base: "r10", disp: 80 });
        a.storesd(slot(112), "xmm0");
        a.movsd("xmm0", { base: "r10", disp: 88 });
        a.storesd(slot(120), "xmm0");
        a.load("r10", slot(48));
        a.load("rcx", f(80));
        call(a, "gtk_fixed_move", [
            "rcx",
            slot(104),
            { double: slot(112) },
            { double: slot(120) },
        ]);
        a.load("r10", slot(88));
        a.movsd("xmm0", { base: "r10", disp: 24 });
        a.subsd("xmm0", slot(112));
        a.storesd(slot(112), "xmm0");
        a.movsd("xmm0", { base: "r10", disp: 32 });
        a.subsd("xmm0", slot(120));
        a.storesd(slot(120), "xmm0");
        a.load("r10", slot(80));
        a.load("rcx", f(C.layout));
        call(a, "gtk_fixed_move", [
            "rcx",
            slot(96),
            { double: slot(112) },
            { double: slot(120) },
        ]);
        a.load("r10", slot(88));
        a.movsd("xmm0", { base: "r10", disp: 96 });
        a.cvttsd2si("rax", "xmm0");
        a.mov("rdx", 0);
        const hidden = a.unique("hidden");
        a.test("rax", "rax");
        a.jcc("e", hidden);
        a.movsd("xmm0", { base: "r10", disp: 104 });
        a.cvttsd2si("rax", "xmm0");
        a.test("rax", "rax");
        a.jcc("e", hidden);
        a.mov("rdx", 1);
        a.label(hidden);
        call(a, "gtk_widget_set_visible", [slot(104), "rdx"]);
        a.load("r10", slot(80));
        a.mov("rax", 0);
        a.store(f(C.muted), "rax");
        a.label(next);
        a.load("rax", slot(72));
        a.add("rax", 16);
        a.store(slot(72), "rax");
        a.load("rax", slot(64));
        a.sub("rax", 1);
        a.store(slot(64), "rax");
        a.jcc("ne", loop);
        a.label(done);
    });
}

export const GuiChooser = {
    size: 128,
    state: 0,
    request: 8,
    owner: 16,
    generation: 24,
    dialog: 32,
    cancellable: 40,
    path: 48,
    cancelled: 56,
    error: 64,
} as const;
function folderChooser(b: RuntimeBuilder) {
    const Q = GuiChooser;
    b.data("gui.input.choosers", new Uint8Array(32 * Q.size), ".data");
    b.fn("gui.folder.pathValid", 8, (a) => {
        const no = a.unique("no"),
            loop = a.unique("loop"),
            yes = a.unique("yes"),
            done = a.unique("done");
        a.load("rax", { base: "rcx" }, 8);
        a.cmp("rax", 47);
        a.jcc("ne", no);
        a.mov("r10", 0);
        a.label(loop);
        a.mov("r11", "rcx");
        a.add("r11", "r10");
        a.load("rax", { base: "r11" }, 8);
        a.test("rax", "rax");
        a.jcc("e", yes);
        a.add("r10", 1);
        a.cmp("r10", 4096);
        a.jcc("b", loop);
        a.label(no);
        a.mov("rax", 0);
        a.jmp(done);
        a.label(yes);
        a.mov("rax", 1);
        a.label(done);
    });
    b.fn("gui.folder.start", 104, (a) => {
        a.store(slot(48), "rcx");
        a.store(slot(56), "rdx");
        a.lea("r10", mem("choosers"));
        a.mov("r11", 32);
        const loop = a.unique("loop"),
            found = a.unique("found"),
            failed = a.unique("failed"),
            done = a.unique("done");
        a.label(loop);
        a.load("rax", f(Q.state));
        a.test("rax", "rax");
        a.jcc("e", found);
        a.add("r10", Q.size);
        a.sub("r11", 1);
        a.jcc("ne", loop);
        a.mov("rax", -2);
        a.jmp(done);
        a.label(found);
        a.store(slot(64), "r10");
        a.mov("rax", 0);
        for (const offset of [
            Q.dialog,
            Q.cancellable,
            Q.path,
            Q.cancelled,
            Q.error,
        ])
            a.store(f(offset), "rax");
        a.load("rax", { base: "rdx", disp: 60 }, 32);
        a.store(f(Q.request), "rax");
        a.load("rcx", slot(48));
        a.store(f(Q.owner), "rcx");
        a.load("rax", { base: "rcx", disp: 16 });
        a.store(f(Q.generation), "rax");
        a.mov("rax", 1);
        a.store(f(Q.state), "rax");
        call(a, "gtk_file_dialog_new", []);
        a.load("r10", slot(64));
        a.store(f(Q.dialog), "rax");
        a.test("rax", "rax");
        a.jcc("e", failed);
        call(a, "g_cancellable_new", []);
        a.load("r10", slot(64));
        a.store(f(Q.cancellable), "rax");
        a.test("rax", "rax");
        a.jcc("e", failed);
        a.load("rdx", slot(56));
        a.add("rdx", 64);
        a.load("rcx", f(Q.dialog));
        call(a, "gtk_file_dialog_set_title", ["rcx", "rdx"]);
        a.load("rdx", slot(56));
        a.add("rdx", 640);
        a.load("rax", { base: "rdx" }, 8);
        a.test("rax", "rax");
        const noInitial = a.unique("noInitial");
        a.jcc("e", noInitial);
        call(a, "g_file_new_for_path", ["rdx"]);
        a.store(slot(72), "rax");
        a.load("r10", slot(64));
        a.load("rcx", f(Q.dialog));
        call(a, "gtk_file_dialog_set_initial_folder", ["rcx", slot(72)]);
        call(a, "g_object_unref", [slot(72)]);
        a.label(noInitial);
        a.load("r10", slot(64));
        a.load("rcx", f(Q.dialog));
        a.load("r8", f(Q.cancellable));
        a.load("r11", slot(48));
        a.load("rdx", { base: "r11" });
        a.lea("r9", { rip: "gui.folder.callback" });
        a.load("rax", slot(64));
        a.store(slot(32), "rax");
        a.call("gui.abi.gtk_file_dialog_select_folder");
        a.mov("rax", 0);
        a.jmp(done);
        a.label(failed);
        for (const offset of [Q.dialog, Q.cancellable]) {
            a.load("r10", slot(64));
            a.load("rcx", f(offset));
            const skip = a.unique("skip");
            a.test("rcx", "rcx");
            a.jcc("e", skip);
            call(a, "g_object_unref", ["rcx"]);
            a.label(skip);
        }
        a.load("r10", slot(64));
        a.mov("rax", 0);
        a.store(f(Q.state), "rax");
        a.mov("rax", -6);
        a.label(done);
    });
    b.fn("gui.folder.callback", 104, (a) => {
        // GAsyncReadyCallback(source, result, data): SysV RDI, RSI, RDX.
        a.store(slot(48), "rdx");
        a.store(slot(56), "rsi");
        a.mov("rax", 0);
        a.store(slot(64), "rax");
        a.mov("r10", "rdx");
        a.load("rcx", f(Q.dialog));
        a.lea("r8", slot(64));
        call(a, "gtk_file_dialog_select_folder_finish", [
            "rcx",
            slot(56),
            "r8",
        ]);
        const noFile = a.unique("noFile"),
            noError = a.unique("noError");
        a.test("rax", "rax");
        a.jcc("e", noFile);
        a.store(slot(72), "rax");
        call(a, "g_file_get_path", ["rax"]);
        a.load("r10", slot(48));
        a.store(f(Q.path), "rax");
        const local = a.unique("local"),
            invalidPath = a.unique("invalidPath");
        a.test("rax", "rax");
        a.jcc("e", invalidPath);
        a.mov("rcx", "rax");
        a.call("gui.folder.pathValid");
        a.test("rax", "rax");
        a.jcc("ne", local);
        a.label(invalidPath);
        a.load("r10", slot(48));
        a.mov("rax", 2);
        a.store(f(Q.error), "rax");
        a.label(local);
        call(a, "g_object_unref", [slot(72)]);
        a.label(noFile);
        a.load("rcx", slot(64));
        a.test("rcx", "rcx");
        a.jcc("e", noError);
        // Error codes are meaningful only within their domain. In particular,
        // G_IO_ERROR_NOT_FOUND (2) is not GTK_DIALOG_ERROR_DISMISSED (2).
        const dismissed = a.unique("dismissed");
        call(a, "gtk_dialog_error_quark", []);
        narrow(a);
        a.store(slot(80), "rax");
        for (const code of [1, 2]) {
            call(a, "g_error_matches", [slot(64), slot(80), code]);
            narrow(a);
            a.test("rax", "rax");
            a.jcc("ne", dismissed);
        }
        call(a, "g_io_error_quark", []);
        narrow(a);
        a.store(slot(80), "rax");
        call(a, "g_error_matches", [slot(64), slot(80), 19]);
        narrow(a);
        a.test("rax", "rax");
        a.jcc("ne", dismissed);
        a.load("r10", slot(48));
        a.mov("rax", 1);
        a.store(f(Q.error), "rax");
        a.label(dismissed);
        call(a, "g_error_free", [slot(64)]);
        a.label(noError);
        a.load("r10", slot(48));
        a.mov("rax", 2);
        a.store(f(Q.state), "rax");
    });
    // RCX=window or NULL, RDX=request (when window is NULL). Retain dialog,
    // cancellable and record until completion, including disposal before finish.
    for (const name of ["cancelWindow", "cancelRequest"])
        b.fn("gui.folder." + name, 88, (a) => {
            a.store(slot(48), "rcx");
            a.store(slot(56), "rdx");
            a.lea("rax", mem("choosers"));
            a.store(slot(64), "rax");
            a.mov("rax", 32);
            a.store(slot(72), "rax");
            const loop = a.unique("loop"),
                next = a.unique("next");
            a.label(loop);
            a.load("r10", slot(64));
            a.load("rax", f(Q.state));
            a.test("rax", "rax");
            a.jcc("e", next);
            a.load("rax", f(name === "cancelWindow" ? Q.owner : Q.request));
            a.load("r11", slot(name === "cancelWindow" ? 48 : 56));
            a.cmp("rax", "r11");
            a.jcc("ne", next);
            a.mov("rax", 1);
            a.store(f(Q.cancelled), "rax");
            a.load("rcx", f(Q.cancellable));
            call(a, "g_cancellable_cancel", ["rcx"]);
            a.label(next);
            a.load("rax", slot(64));
            a.add("rax", Q.size);
            a.store(slot(64), "rax");
            a.load("rax", slot(72));
            a.sub("rax", 1);
            a.store(slot(72), "rax");
            a.jcc("ne", loop);
        });
    b.fn("gui.folder.take", 88, (a) => {
        a.store(slot(48), "rcx");
        a.store(slot(56), "rdx");
        a.lea("r10", mem("choosers"));
        a.mov("r11", 32);
        const loop = a.unique("loop"),
            found = a.unique("found"),
            done = a.unique("done");
        a.label(loop);
        a.load("rax", f(Q.state));
        a.cmp("rax", 2);
        a.jcc("e", found);
        a.add("r10", Q.size);
        a.sub("r11", 1);
        a.jcc("ne", loop);
        a.mov("rax", 0);
        a.jmp(done);
        a.label(found);
        a.store(slot(64), "r10");
        a.mov("rax", 20);
        a.store({ base: "rcx", disp: 24 }, "rax", 32);
        a.load("rax", f(Q.request));
        a.store({ base: "rcx", disp: 60 }, "rax", 32);
        a.mov("rax", 0);
        a.store({ base: "rcx", disp: 56 }, "rax", 32);
        a.store({ base: "rcx", disp: 48 }, "rax", 32);
        a.load("rax", f(Q.cancelled));
        a.test("rax", "rax");
        const noPath = a.unique("noPath");
        a.jcc("ne", noPath);
        a.load("r11", f(Q.owner));
        a.load("rax", f(Q.generation));
        a.load("rdx", { base: "r11", disp: 16 });
        a.cmp("rax", "rdx");
        a.jcc("ne", noPath);
        a.load("rax", { base: "r11" });
        a.test("rax", "rax");
        a.jcc("e", noPath);
        a.load("rax", f(Q.error));
        a.store({ base: "rcx", disp: 48 }, "rax", 32);
        a.test("rax", "rax");
        a.jcc("ne", noPath);
        a.load("rdx", f(Q.path));
        a.test("rdx", "rdx");
        a.jcc("e", noPath);
        a.load("r8", slot(56));
        a.call("gui.input.copyText");
        a.label(noPath);
        for (const [offset, name] of [
            [Q.path, "g_free"],
            [Q.dialog, "g_object_unref"],
            [Q.cancellable, "g_object_unref"],
        ] as const) {
            a.load("r10", slot(64));
            a.load("rcx", f(offset));
            call(a, name, ["rcx"]);
        }
        a.load("r10", slot(64));
        a.mov("rax", 0);
        a.store(f(Q.state), "rax");
        a.mov("rax", 1);
        a.label(done);
    });
}
