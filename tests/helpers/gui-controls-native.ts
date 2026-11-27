// CPU probes execute the production callbacks, queue, scene transaction and
// chooser ownership with external GTK calls replaced. They are not GDK input.
import { RuntimeBuilder, slot, failIf } from "../../src/runtime/abi.js";
import {
    GuiControl as C,
    guiControlSlots,
} from "../../src/runtime/gui-input.js";
import { prependFunctionBuiltin } from "../../src/runtime/function-builtin.js";
import { guiProbe } from "./gui-native.js";
import type { Assembler } from "../../src/backend/machine/context.js";

export function guiControlProbe(
    source: string,
    stress: boolean,
    options: {
        failArea?: boolean;
        failImage?: boolean;
        poisonScene?: boolean;
    } = {},
) {
    const program = guiProbe(source, stress, {
        render: true,
        failImage: options.failImage,
    });
    const b = new RuntimeBuilder();
    b.bundle = program;
    const m = (offset: number) => ({ rip: "gui.test.input", addend: offset });
    b.data("gui.test.input", new Uint8Array(128), ".data");
    b.data("gui.test.objects", new Uint8Array(65536), ".data");
    b.data(
        "gui.test.text",
        new TextEncoder().encode("日本語 e\u0301 🐈\0"),
        ".data",
    );
    b.data("gui.test.path", new TextEncoder().encode("/tmp/日本語\0"));
    // An unrelated error domain with code 2 must not be mistaken for a user
    // dismissal, which uses code 2 in GtkDialogError's domain.
    b.data(
        "gui.test.folderError",
        new Uint8Array(new Uint32Array([99, 2, 0, 0]).buffer),
    );
    b.data("gui.test.copies", new Uint8Array(512 * 4097), ".data");
    function replace(name: string, body: (a: Assembler) => void, frame = 72) {
        const symbol = "gui.test." + name;
        program.fragments = program.fragments.filter((f) => f.name !== symbol);
        program.functions = program.functions.filter((f) => f.begin !== symbol);
        b.fn(symbol, frame, body);
    }
    function bump(a: Assembler, offset: number) {
        a.load("rax", m(offset));
        a.add("rax", 1);
        a.store(m(offset), "rax");
    }
    if (options.failArea)
        replace("gtk_drawing_area_new", (a) => a.mov("rax", 0));
    if (options.poisonScene) {
        const frame = program.functions.find(
            (f) => f.begin === "gui.scene",
        )!.stackAllocation;
        for (const fragment of program.fragments)
            for (const fixup of fragment.fixups)
                if (fixup.target === "gui.scene")
                    fixup.target = "gui.test.scene";
        b.fn("gui.test.scene", 40, (a) => {
            // Seed the future callee's rollback flag with nonzero stack garbage.
            // There are no intervening calls before the callee owns this word.
            a.mov("rax", 1);
            a.store(slot(160 - frame - 8), "rax");
            a.call("gui.scene");
        });
    }
    replace("gtk_widget_insert_after", (a) => {
        // Observe the real Nona->GTK boundary: child and previous-sibling IDs,
        // with the owning GtkFixed verified. No mock widget ordering is asserted.
        a.lea("r10", { rip: "gui.records" });
        a.mov("r11", 32);
        const parent = a.unique("parent"),
            found = a.unique("found");
        a.label(parent);
        a.load("rax", { base: "r10", disp: 80 });
        a.cmp("rax", "rsi");
        a.jcc("e", found);
        a.add("r10", 128);
        a.sub("r11", 1);
        a.jcc("ne", parent);
        failIf(a, "e");
        a.label(found);
        a.load("r10", { base: "r10", disp: 112 });
        a.mov("r11", guiControlSlots);
        a.mov("r8", 0);
        a.mov("r9", 0);
        const scan = a.unique("scan"),
            next = a.unique("next"),
            previous = a.unique("previous");
        a.label(scan);
        a.load("rax", { base: "r10" });
        a.test("rax", "rax");
        a.jcc("e", next);
        a.load("rax", { base: "r10", disp: C.wrapper });
        a.cmp("rax", "rdi");
        a.jcc("ne", previous);
        a.load("r8", { base: "r10", disp: C.id });
        a.label(previous);
        a.cmp("rax", "rdx");
        a.jcc("ne", next);
        a.load("r9", { base: "r10", disp: C.id });
        a.label(next);
        a.add("r10", C.size);
        a.sub("r11", 1);
        a.jcc("ne", scan);
        a.test("r8", "r8");
        failIf(a, "e");
        for (const [offset, reg] of [
            [64, "r8"],
            [72, "r9"],
        ] as const) {
            a.load("rax", m(offset));
            a.mov("r10", 10);
            a.imul("rax", "r10");
            a.add("rax", reg);
            a.store(m(offset), "rax");
        }
    });
    for (const name of [
        "gtk_button_new",
        "gtk_entry_new",
        "gtk_check_button_new",
        "gtk_fixed_new",
        "gtk_scrolled_window_new",
        "gtk_overlay_new",
        "gtk_event_controller_key_new",
        "gtk_event_controller_focus_new",
        "gtk_gesture_click_new",
        "gtk_file_dialog_new",
        "g_cancellable_new",
    ])
        replace(name, (a) => {
            bump(a, 0);
            a.shl("rax", 4);
            a.lea("r10", { rip: "gui.test.objects" });
            a.add("rax", "r10");
        });
    replace("g_object_ref_sink", (a) => a.mov("rax", "rdi"));
    replace("gtk_editable_get_text", (a) =>
        a.lea("rax", { rip: "gui.test.text" }),
    );
    replace("gtk_editable_set_text", (a) => bump(a, 8));
    replace("gtk_check_button_get_active", (a) => a.mov("rax", 1));
    replace("gtk_check_button_set_active", (a) => bump(a, 16));
    replace("g_strdup", (a) => {
        a.load("rax", m(24));
        a.cmp("rax", 512);
        failIf(a, "ae");
        a.mov("r10", 4097);
        a.imul("rax", "r10");
        a.lea("r10", { rip: "gui.test.copies" });
        a.add("rax", "r10");
        a.store(slot(48), "rax");
        a.mov("r10", "rax");
        const loop = a.unique("loop");
        a.label(loop);
        a.load("r11", { base: "rdi" }, 8);
        a.store({ base: "r10" }, "r11", 8);
        a.add("rdi", 1);
        a.add("r10", 1);
        a.test("r11", "r11");
        a.jcc("ne", loop);
        bump(a, 24);
        a.load("rax", slot(48));
    });
    replace("g_free", (a) => {
        const done = a.unique("done");
        a.test("rdi", "rdi");
        a.jcc("e", done);
        bump(a, 32);
        a.label(done);
    });
    replace("gtk_widget_activate", (a) => {
        a.load("r10", { rip: "gui.records", addend: 112 });
        a.mov("r11", guiControlSlots);
        const loop = a.unique("loop"),
            found = a.unique("found");
        a.label(loop);
        a.load("rax", { base: "r10" });
        a.cmp("rax", "rdi");
        a.jcc("e", found);
        a.add("r10", C.size);
        a.sub("r11", 1);
        a.jcc("ne", loop);
        failIf(a, "e");
        a.label(found);
        a.mov("rsi", "r10");
        a.call("gui.input.activateCallback");
        a.mov("rax", 1);
    });
    replace("gtk_file_dialog_select_folder", (a) => {
        a.store(m(40), "r8");
    });
    replace("g_cancellable_cancel", (a) => bump(a, 48));
    replace("gtk_file_dialog_select_folder_finish", (a) => {
        a.load("rax", m(56));
        const done = a.unique("done");
        a.cmp("rax", 2);
        a.jcc("ne", done);
        a.lea("r10", { rip: "gui.test.folderError" });
        a.store({ base: "rdx" }, "r10");
        a.mov("rax", 0);
        a.label(done);
    });
    replace("gtk_dialog_error_quark", (a) => a.mov("rax", 10));
    replace("g_io_error_quark", (a) => a.mov("rax", 20));
    replace("g_error_matches", (a) => {
        const no = a.unique("no"),
            done = a.unique("done");
        a.load("rax", { base: "rdi" }, 32);
        a.cmp("rax", "rsi");
        a.jcc("ne", no);
        a.load("rax", { base: "rdi", disp: 4 }, 32);
        a.cmp("rax", "rdx");
        a.jcc("ne", no);
        a.mov("rax", 1);
        a.jmp(done);
        a.label(no);
        a.mov("rax", 0);
        a.label(done);
    });
    replace("g_file_get_path", (a) => a.lea("rax", { rip: "gui.test.path" }));
    replace("gtk_gesture_single_get_current_button", (a) => a.mov("rax", 1));
    replace("gtk_event_controller_get_current_event_state", (a) =>
        a.mov("rax", 4),
    );
    prependFunctionBuiltin(b, "gui.emit", "guiEmit", 2, "rt.globalObject");
    b.fn("gui.emit.code", 104, (a) => {
        a.store(slot(48), "rcx");
        // Optional window slot lets probes verify independent synthetic records.
        a.mov("rax", 0);
        const firstWindow = a.unique("firstWindow");
        a.cmp("rdx", 2); // builtin ABI: RDX=argc, R8=argv
        a.jcc("b", firstWindow);
        a.movsd("xmm0", { base: "r8", disp: 24 });
        a.cvttsd2si("rax", "xmm0");
        a.cmp("rax", 32);
        failIf(a, "ae");
        a.label(firstWindow);
        a.shl("rax", 7);
        a.lea("r10", { rip: "gui.records" });
        a.add("rax", "r10");
        a.store(slot(72), "rax");
        a.movsd("xmm0", { base: "r8", disp: 8 });
        a.cvttsd2si("rax", "xmm0");
        a.store(slot(56), "rax");
        const done = a.unique("done"),
            mutate = a.unique("mutate"),
            folder = a.unique("folder"),
            close = a.unique("close"),
            shortcut = a.unique("shortcut");
        a.cmp("rax", 2);
        a.jcc("e", mutate);
        a.cmp("rax", 20);
        a.jcc("ae", folder);
        a.cmp("rax", 9);
        a.jcc("e", shortcut);
        a.cmp("rax", 12);
        a.jcc("e", close);
        a.mov("r9", 11);
        a.cmp("rax", 3);
        const kindSet = a.unique("kindSet");
        a.jcc("ne", kindSet);
        a.mov("r9", 12);
        a.label(kindSet);
        const notButton = a.unique("notButton");
        a.cmp("rax", 4);
        a.jcc("b", notButton);
        a.mov("r9", 10);
        a.label(notButton);
        a.load("r10", slot(72));
        a.load("r10", { base: "r10", disp: 112 });
        a.mov("r11", guiControlSlots);
        const loop = a.unique("loop"),
            next = a.unique("next"),
            found = a.unique("found");
        a.label(loop);
        a.load("rax", { base: "r10" });
        a.test("rax", "rax");
        a.jcc("e", next);
        a.load("rax", { base: "r10", disp: C.kind });
        a.cmp("rax", "r9");
        a.jcc("e", found);
        a.label(next);
        a.add("r10", C.size);
        a.sub("r11", 1);
        a.jcc("ne", loop);
        failIf(a, "e");
        a.label(found);
        a.store(slot(64), "r10");
        a.load("rdi", { base: "r10" });
        a.mov("rsi", "r10");
        a.load("rax", slot(56));
        for (const [op, name] of [
            [1, "changed"],
            [3, "toggled"],
            [4, "activate"],
            [6, "enter"],
            [7, "leave"],
        ] as const) {
            const skip = a.unique("skip");
            a.cmp("rax", op);
            a.jcc("ne", skip);
            a.call("gui.input." + name + "Callback");
            a.jmp(done);
            a.label(skip);
        }
        const pointer = a.unique("pointer"),
            key = a.unique("key");
        a.cmp("rax", 11);
        a.jcc("e", key);
        a.cmp("rax", 8);
        a.jcc("ae", pointer);
        a.label(key);
        a.mov("rsi", 65293);
        a.mov("rdx", 36);
        a.mov("rcx", 0);
        a.load("r8", slot(64));
        const releaseKey = a.unique("releaseKey");
        a.load("rax", slot(56));
        a.cmp("rax", 11);
        a.jcc("e", releaseKey);
        a.call("gui.input.key-pressedCallback");
        a.cmp("rax", 1);
        failIf(a, "ne");
        a.jmp(done);
        a.label(releaseKey);
        a.call("gui.input.key-releasedCallback");
        a.jmp(done);
        a.label(pointer);
        a.mov("rsi", 1);
        a.load("rdx", slot(64));
        a.mov("rax", 12);
        a.cvtsi2sd("xmm0", "rax");
        a.mov("rax", 7);
        a.cvtsi2sd("xmm1", "rax");
        const releasePointer = a.unique("releasePointer");
        a.load("rax", slot(56));
        a.cmp("rax", 10);
        a.jcc("e", releasePointer);
        a.call("gui.input.pressedCallback");
        a.jmp(done);
        a.label(releasePointer);
        a.call("gui.input.releasedCallback");
        a.jmp(done);
        a.label(mutate);
        a.lea("r10", { rip: "gui.test.text" });
        a.mov("rax", 88);
        a.store({ base: "r10" }, "rax", 8);
        a.jmp(done);
        a.label(shortcut);
        a.load("r8", slot(72));
        a.mov("rsi", 115);
        a.mov("rcx", 4);
        a.mov("rdi", 0);
        a.mov("rdx", 0);
        a.call("gui.input.shortcutCallback");
        a.cmp("rax", 1);
        failIf(a, "ne");
        a.jmp(done);
        a.label(folder);
        a.load("rax", slot(56));
        a.sub("rax", 20);
        a.store(m(56), "rax");
        a.load("rdx", m(40));
        a.mov("rdi", 0);
        a.mov("rsi", 0);
        a.call("gui.folder.callback");
        a.jmp(done);
        a.label(close);
        a.load("rsi", slot(72));
        a.load("rdi", { base: "rsi" });
        a.call("gui.closeCallback");
        a.label(done);
        a.load("rcx", slot(48));
        a.mov("rax", 2);
        a.store({ base: "rcx" }, "rax");
        a.mov("rax", 1);
        a.store({ base: "rcx", disp: 8 }, "rax");
    });
    prependFunctionBuiltin(
        b,
        "gui.controlStat",
        "guiControlStat",
        1,
        "rt.globalObject",
    );
    b.fn("gui.controlStat.code", 8, (a) => {
        a.movsd("xmm0", { base: "r8", disp: 8 });
        a.cvttsd2si("rax", "xmm0");
        a.lea("r10", m(0));
        a.add("r10", "rax");
        a.load("rax", { base: "r10" });
        a.cvtsi2sd("xmm0", "rax");
        a.mov("rax", 3);
        a.store({ base: "rcx" }, "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
    });
    return program;
}
