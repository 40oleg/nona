import { RuntimeBuilder, slot } from "./abi.js";
import type { Assembler, Mem } from "../backend/machine/context.js";
import {
    registerGuiRenderCalls,
    renderCall as call,
} from "./gui-render-api.js";

const d = (memory: Mem) => ({ double: memory });
const constant = (index: number) => ({
    rip: "gui.render.constants",
    addend: index * 8,
});
const command = (index: number) => ({
    base: "r10" as const,
    disp: 8 + index * 8,
});
const reload = (a: Assembler, offset = 72) => a.load("r10", slot(offset));
const cr = slot(64);
const record = slot(72);
const narrow = (a: Assembler) => {
    a.shl("rax", 32);
    a.shr("rax", 32);
};

/** No managed allocations, JS entry, or retained managed addresses. A candidate
 * recording is built off to the side, checked, then exchanged in one commit.
 * GTK draw callbacks only paint the committed recording. */
export function guiRendering(b: RuntimeBuilder): void {
    registerGuiRenderCalls(b);
    const numbers = new Float64Array([
        0,
        0.5,
        Math.PI / 2,
        Math.PI,
        Math.PI * 1.5,
        Math.PI * 2,
        1024,
        1,
    ]);
    b.data("gui.render.constants", new Uint8Array(numbers.buffer));
    b.data("gui.render.empty", new Uint8Array(1));

    b.fn("gui.roundRect", 152, (a) => {
        a.store(cr, "rcx");
        a.store(record, "rdx");
        reload(a);
        // Clamp radius to half the smaller extent, so oversized radii remain
        // well defined for tiny/zero allocations.
        a.movsd("xmm0", command(4));
        for (const axis of [2, 3]) {
            a.movsd("xmm1", command(axis));
            a.mulsd("xmm1", constant(1));
            a.ucomisd("xmm0", "xmm1");
            const small = a.unique("small");
            a.jcc("be", small);
            a.movsd("xmm0", "xmm1");
            a.label(small);
        }
        a.storesd(slot(80), "xmm0");
        // Four centres in clockwise order.
        for (let i = 0; i < 4; i++) {
            for (let axis = 0; axis < 2; axis++) {
                const far =
                    axis === 0 ? i === 0 || i === 1 : i === 1 || i === 2;
                a.movsd("xmm0", command(axis));
                if (far) {
                    a.addsd("xmm0", command(axis + 2));
                    a.subsd("xmm0", slot(80));
                } else a.addsd("xmm0", slot(80));
                a.storesd(slot(88 + axis * 8), "xmm0");
            }
            if (i === 0) call(a, "cairo_new_path", [cr]);
            // top-right, bottom-right, bottom-left, top-left
            const starts = [4, 0, 2, 3],
                ends = [5, 2, 3, 4];
            call(a, "cairo_arc", [
                cr,
                d(slot(88)),
                d(slot(96)),
                d(slot(80)),
                d(constant(starts[i]!)),
                d(constant(ends[i]!)),
            ]);
            if (i !== 3) reload(a);
        }
        call(a, "cairo_close_path", [cr]);
    });

    // SysV GtkDrawingAreaDrawFunc(area, cr, width, height, data). The fifth
    // integer argument is R8, independently of vector arguments. Only volatile
    // registers are used, so all SysV callee-saved registers remain untouched.
    b.fn("gui.drawCallback", 56, (a) => {
        a.store(slot(40), "rsi");
        const done = a.unique("done");
        a.load("rax", { base: "r8", disp: 64 });
        a.cmp("rax", "rdi");
        a.jcc("ne", done);
        a.load("rax", { base: "r8", disp: 72 });
        a.test("rax", "rax");
        a.jcc("e", done);
        a.store(slot(48), "rax");
        call(a, "cairo_save", [slot(40)]);
        call(a, "cairo_set_source_surface", [
            slot(40),
            slot(48),
            d(constant(0)),
            d(constant(0)),
        ]);
        call(a, "cairo_paint", [slot(40)]);
        call(a, "cairo_restore", [slot(40)]);
        a.label(done);
    });

    textRenderer(b);
    imageRenderer(b);

    b.fn("gui.drawCommand", 120, (a) => {
        a.store(cr, "rcx");
        a.store(record, "rdx");
        a.store(slot(80), "r8");
        a.load("rax", { base: "rdx" }, 32);
        const labels = Array.from({ length: 9 }, (_, i) =>
                a.unique("op" + (i + 1)),
            ),
            done = a.unique("done");
        labels.forEach((label, i) => {
            a.cmp("rax", i + 1);
            a.jcc("e", label);
        });
        a.mov("rax", -6);
        a.jmp(done);
        for (const [op, name] of [
            [1, "cairo_save"],
            [2, "cairo_restore"],
        ] as const) {
            a.label(labels[op - 1]!);
            call(a, name, [cr]);
            a.mov("rax", 0);
            a.jmp(done);
        }
        for (const op of [3, 4, 5]) {
            a.label(labels[op - 1]!);
            a.load("rcx", cr);
            a.load("rdx", record);
            a.call("gui.roundRect");
            if (op !== 3) {
                reload(a);
                const offset = op === 4 ? 5 : 6;
                call(a, "cairo_set_source_rgba", [
                    cr,
                    ...[0, 1, 2, 3].map((i) => d(command(offset + i))),
                ]);
                if (op === 5) {
                    reload(a);
                    call(a, "cairo_set_line_width", [cr, d(command(5))]);
                }
            }
            call(
                a,
                op === 3
                    ? "cairo_clip"
                    : op === 4
                      ? "cairo_fill"
                      : "cairo_stroke",
                [cr],
            );
            a.mov("rax", 0);
            a.jmp(done);
        }
        a.label(labels[5]!);
        a.load("rcx", cr);
        a.load("rdx", record);
        a.load("r8", slot(80));
        a.call("gui.drawText");
        a.jmp(done);
        a.label(labels[6]!);
        a.load("rcx", cr);
        a.load("rdx", record);
        a.load("r8", slot(80));
        a.call("gui.drawImage");
        a.jmp(done);
        a.label(labels[7]!);
        call(a, "cairo_new_path", [cr]);
        reload(a);
        call(a, "cairo_move_to", [cr, d(command(0)), d(command(1))]);
        reload(a);
        call(a, "cairo_line_to", [cr, d(command(2)), d(command(3))]);
        reload(a);
        call(a, "cairo_set_line_width", [cr, d(command(4))]);
        reload(a);
        call(a, "cairo_set_source_rgba", [
            cr,
            ...[5, 6, 7, 8].map((i) => d(command(i))),
        ]);
        call(a, "cairo_stroke", [cr]);
        a.mov("rax", 0);
        a.jmp(done);
        a.label(labels[8]!);
        call(a, "cairo_new_path", [cr]);
        reload(a);
        call(a, "cairo_arc", [
            cr,
            d(command(0)),
            d(command(1)),
            d(command(2)),
            d(constant(0)),
            d(constant(5)),
        ]);
        reload(a);
        call(a, "cairo_set_source_rgba", [
            cr,
            ...[3, 4, 5, 6].map((i) => d(command(i))),
        ]);
        call(a, "cairo_fill", [cr]);
        a.mov("rax", 0);
        a.label(done);
    });
    sceneRenderer(b);
}

// Resolve a checked packet string to native call-local storage. Graphics APIs
// copy these strings synchronously; the packet itself is never retained.
function stringPointer(a: Assembler, field: number, dest: "rcx" | "rdx") {
    reload(a);
    a.load(dest, { base: "r10", disp: field }, 32);
    const empty = a.unique("empty"),
        ready = a.unique("ready");
    a.test(dest, dest);
    a.jcc("e", empty);
    a.load("rax", slot(80));
    a.add(dest, "rax");
    a.jmp(ready);
    a.label(empty);
    a.lea(dest, { rip: "gui.render.empty" });
    a.label(ready);
}

function textRenderer(b: RuntimeBuilder) {
    b.fn("gui.drawText", 184, (a) => {
        a.store(cr, "rcx");
        a.store(record, "rdx");
        a.store(slot(80), "r8");
        // map, FcConfig, Pango context, layout, description, result
        a.mov("rax", 0);
        for (const offset of [88, 96, 104, 112, 120, 128, 160])
            a.store(slot(offset), "rax");
        const fail = a.unique("fail"),
            cleanup = a.unique("cleanup"),
            systemFont = a.unique("systemFont");
        call(a, "pango_cairo_font_map_new", []);
        a.store(slot(88), "rax");
        a.test("rax", "rax");
        a.jcc("e", fail);
        reload(a);
        a.load("rax", { base: "r10", disp: 124 }, 32);
        a.test("rax", "rax");
        a.jcc("e", systemFont);
        call(a, "FcInitLoadConfigAndFonts", []);
        a.store(slot(96), "rax");
        a.test("rax", "rax");
        a.jcc("e", fail);
        stringPointer(a, 124, "rdx");
        call(a, "FcConfigAppFontAddFile", [slot(96), "rdx"]);
        narrow(a);
        a.test("rax", "rax");
        a.jcc("e", fail);
        call(a, "pango_fc_font_map_set_config", [slot(88), slot(96)]);
        a.label(systemFont);
        call(a, "pango_font_map_create_context", [slot(88)]);
        a.store(slot(104), "rax");
        a.test("rax", "rax");
        a.jcc("e", fail);
        call(a, "pango_layout_new", [slot(104)]);
        a.store(slot(112), "rax");
        a.test("rax", "rax");
        a.jcc("e", fail);
        call(a, "pango_font_description_new", []);
        a.store(slot(120), "rax");
        a.test("rax", "rax");
        a.jcc("e", fail);
        stringPointer(a, 120, "rdx");
        call(a, "pango_font_description_set_family", [slot(120), "rdx"]);
        reload(a);
        a.movsd("xmm0", command(4));
        a.mulsd("xmm0", constant(6));
        a.storesd(slot(136), "xmm0");
        call(a, "pango_font_description_set_absolute_size", [
            slot(120),
            d(slot(136)),
        ]);
        reload(a);
        a.movsd("xmm0", command(6));
        a.cvttsd2si("rdx", "xmm0");
        call(a, "pango_font_description_set_weight", [slot(120), "rdx"]);
        call(a, "pango_layout_set_font_description", [slot(112), slot(120)]);
        stringPointer(a, 4, "rdx");
        call(a, "pango_layout_set_text", [slot(112), "rdx", -1]);
        reload(a);
        call(a, "cairo_move_to", [cr, d(command(0)), d(command(1))]);
        reload(a);
        call(a, "cairo_set_source_rgba", [
            cr,
            ...[7, 8, 9, 10].map((i) => d(command(i))),
        ]);
        call(a, "pango_cairo_show_layout", [cr, slot(112)]);
        a.jmp(cleanup);
        a.label(fail);
        a.mov("rax", -6);
        a.store(slot(128), "rax");
        a.label(cleanup);
        for (const [offset, name] of [
            [120, "pango_font_description_free"],
            [112, "g_object_unref"],
            [104, "g_object_unref"],
            [88, "g_object_unref"],
            [96, "FcConfigDestroy"],
        ] as const) {
            a.load("rcx", slot(offset));
            a.test("rcx", "rcx");
            const skip = a.unique("skip");
            a.jcc("e", skip);
            call(a, name, ["rcx"]);
            a.label(skip);
        }
        a.load("rax", slot(128));
    });
}

function imageRenderer(b: RuntimeBuilder) {
    b.fn("gui.drawImage", 168, (a) => {
        a.store(cr, "rcx");
        a.store(record, "rdx");
        a.store(slot(80), "r8");
        stringPointer(a, 4, "rcx");
        call(a, "cairo_image_surface_create_from_png", ["rcx"]);
        a.store(slot(88), "rax");
        const fail = a.unique("fail"),
            cleanup = a.unique("cleanup"),
            scaled = a.unique("scaled"),
            cover = a.unique("cover"),
            xScale = a.unique("xScale");
        call(a, "cairo_surface_status", [slot(88)]);
        narrow(a);
        a.test("rax", "rax");
        a.jcc("ne", fail);
        for (const [name, axis, offset] of [
            ["cairo_image_surface_get_width", 2, 96],
            ["cairo_image_surface_get_height", 3, 104],
        ] as const) {
            call(a, name, [slot(88)]);
            a.shl("rax", 32);
            a.sar("rax", 32);
            a.cmp("rax", 0);
            a.jcc("le", fail);
            a.cvtsi2sd("xmm1", "rax");
            a.storesd(slot(offset + 16), "xmm1");
            reload(a);
            a.movsd("xmm0", command(axis));
            a.divsd("xmm0", "xmm1");
            a.storesd(slot(offset), "xmm0");
        }
        reload(a);
        a.movsd("xmm0", command(4));
        a.cvttsd2si("rax", "xmm0");
        a.cmp("rax", 2);
        a.jcc("e", scaled);
        a.cmp("rax", 1);
        a.jcc("e", cover);
        a.movsd("xmm0", slot(96));
        a.ucomisd("xmm0", slot(104));
        a.jcc("be", xScale);
        a.movsd("xmm0", slot(104));
        a.jmp(xScale);
        a.label(cover);
        a.movsd("xmm0", slot(96));
        a.ucomisd("xmm0", slot(104));
        a.jcc("ae", xScale);
        a.movsd("xmm0", slot(104));
        a.label(xScale);
        a.storesd(slot(96), "xmm0");
        a.storesd(slot(104), "xmm0");
        a.label(scaled);
        // Skip a zero-sized image: scaling a Cairo matrix by zero is invalid.
        const empty = a.unique("empty");
        for (const offset of [96, 104]) {
            a.movsd("xmm0", slot(offset));
            a.ucomisd("xmm0", constant(0));
            a.jcc("e", empty);
        }
        call(a, "cairo_save", [cr]);
        reload(a);
        call(a, "cairo_rectangle", [
            cr,
            d(command(0)),
            d(command(1)),
            d(command(2)),
            d(command(3)),
        ]);
        call(a, "cairo_clip", [cr]);
        // Centre contain/cover in the requested box before applying scale.
        reload(a);
        for (let axis = 0; axis < 2; axis++) {
            a.movsd("xmm0", slot(112 + axis * 8));
            a.mulsd("xmm0", slot(96 + axis * 8));
            a.movsd("xmm1", command(2 + axis));
            a.subsd("xmm1", "xmm0");
            a.mulsd("xmm1", constant(1));
            a.addsd("xmm1", command(axis));
            a.storesd(slot(128 + axis * 8), "xmm1");
        }
        call(a, "cairo_translate", [cr, d(slot(128)), d(slot(136))]);
        call(a, "cairo_scale", [cr, d(slot(96)), d(slot(104))]);
        call(a, "cairo_set_source_surface", [
            cr,
            slot(88),
            d(constant(0)),
            d(constant(0)),
        ]);
        call(a, "cairo_get_source", [cr]);
        call(a, "cairo_pattern_set_filter", ["rax", 3]);
        call(a, "cairo_paint", [cr]);
        call(a, "cairo_restore", [cr]);
        a.label(empty);
        a.mov("rax", 0);
        a.jmp(cleanup);
        a.label(fail);
        a.mov("rax", -6);
        a.label(cleanup);
        a.store(slot(144), "rax");
        call(a, "cairo_surface_destroy", [slot(88)]);
        a.load("rax", slot(144));
    });
}

function sceneRenderer(b: RuntimeBuilder) {
    b.fn("gui.scene", 184, (a) => {
        a.store(slot(64), "rcx");
        a.store(slot(72), "rdx");
        a.store(slot(80), "r8");
        a.mov("rax", 0);
        for (const offset of [88, 96, 104, 112, 120, 128])
            a.store(slot(offset), "rax");
        const invalid = a.unique("invalid"),
            failed = a.unique("failed"),
            cleanup = a.unique("cleanup"),
            validated = a.unique("validated");
        a.cmp("r8", 8388608);
        a.jcc("a", invalid);
        a.load("rax", { base: "rdx", disp: 44 }, 32);
        a.cmp("rax", "r8");
        a.jcc("ne", invalid);
        a.load("rax", { base: "rdx", disp: 40 }, 32);
        a.cmp("rax", 16384);
        a.jcc("a", invalid);
        a.store(slot(104), "rax");
        a.shl("rax", 7);
        a.add("rax", 640);
        a.cmp("rax", "r8");
        a.jcc("a", invalid);
        a.store(slot(136), "rax");
        a.add("rdx", 640);
        a.store(slot(112), "rdx");
        const check = a.unique("check"),
            checked = a.unique("checked");
        a.label(check);
        a.load("rax", slot(104));
        a.test("rax", "rax");
        a.jcc("e", validated);
        a.load("r10", slot(112));
        a.load("rax", { base: "r10" }, 32);
        a.cmp("rax", 1);
        a.jcc("b", invalid);
        a.cmp("rax", 12);
        a.jcc("a", invalid);
        const notSave = a.unique("notSave"),
            notRestore = a.unique("notRestore");
        a.cmp("rax", 1);
        a.jcc("ne", notSave);
        a.load("r11", slot(120));
        a.add("r11", 1);
        a.cmp("r11", 65);
        a.jcc("a", invalid);
        a.store(slot(120), "r11");
        a.label(notSave);
        a.cmp("rax", 2);
        a.jcc("ne", notRestore);
        a.load("r11", slot(120));
        a.sub("r11", 1);
        a.jcc("s", invalid);
        a.store(slot(120), "r11");
        a.label(notRestore);
        for (let i = 0; i < 14; i++) {
            // |value| <= 2^30 also rejects NaN/Infinity by bit ordering.
            a.load("rax", command(i));
            a.shl("rax", 1);
            a.shr("rax", 1);
            a.mov("r11", 0x41d0000000000000n);
            a.cmp("rax", "r11");
            a.jcc("a", invalid);
        }
        for (const offset of [4, 120, 124]) {
            a.load("rax", { base: "r10", disp: offset }, 32);
            const empty = a.unique("empty"),
                scan = a.unique("scan"),
                end = a.unique("end");
            a.test("rax", "rax");
            a.jcc("e", empty);
            a.load("r11", slot(136));
            a.cmp("rax", "r11");
            a.jcc("b", invalid);
            a.label(scan);
            a.load("r11", slot(80));
            a.cmp("rax", "r11");
            a.jcc("ae", invalid);
            a.load("rdx", slot(72));
            a.add("rdx", "rax");
            a.load("r11", { base: "rdx" }, 8);
            a.test("r11", "r11");
            a.jcc("e", end);
            a.add("rax", 1);
            a.jmp(scan);
            a.label(end);
            a.label(empty);
        }
        a.label(checked);
        a.load("rax", slot(112));
        a.add("rax", 128);
        a.store(slot(112), "rax");
        a.load("rax", slot(104));
        a.sub("rax", 1);
        a.store(slot(104), "rax");
        a.jmp(check);
        a.label(validated);
        a.load("rax", slot(120));
        a.test("rax", "rax");
        a.jcc("ne", invalid);
        call(a, "cairo_recording_surface_create", [0x3000, 0]);
        a.store(slot(88), "rax");
        call(a, "cairo_surface_status", [slot(88)]);
        narrow(a);
        a.test("rax", "rax");
        a.jcc("ne", failed);
        call(a, "cairo_create", [slot(88)]);
        a.store(slot(96), "rax");
        a.load("r10", slot(72));
        a.load("rax", { base: "r10", disp: 40 }, 32);
        a.store(slot(104), "rax");
        a.add("r10", 640);
        a.store(slot(112), "r10");
        const render = a.unique("render"),
            commit = a.unique("commit");
        a.label(render);
        a.load("rax", slot(104));
        a.test("rax", "rax");
        a.jcc("e", commit);
        a.load("rcx", slot(96));
        a.load("rdx", slot(112));
        a.load("r8", slot(72));
        a.load("rax", { base: "rdx" }, 32);
        const skipControl = a.unique("skipControl");
        a.cmp("rax", 10);
        a.jcc("ae", skipControl);
        a.call("gui.drawCommand");
        a.test("rax", "rax");
        a.jcc("ne", failed);
        a.label(skipControl);
        a.load("rax", slot(112));
        a.add("rax", 128);
        a.store(slot(112), "rax");
        a.load("rax", slot(104));
        a.sub("rax", 1);
        a.store(slot(104), "rax");
        a.jmp(render);
        a.label(commit);
        call(a, "cairo_status", [slot(96)]);
        narrow(a);
        a.test("rax", "rax");
        a.jcc("ne", failed);
        a.load("rcx", slot(64));
        a.load("rdx", slot(72));
        a.call("gui.input.prepare");
        a.test("rax", "rax");
        a.jcc("ne", failed);
        a.mov("rax", 1);
        a.store(slot(160), "rax");
        a.load("r10", slot(64));
        a.load("rax", { base: "r10", disp: 64 });
        const haveArea = a.unique("haveArea");
        a.test("rax", "rax");
        a.jcc("ne", haveArea);
        call(a, "gtk_drawing_area_new", []);
        a.test("rax", "rax");
        a.jcc("e", failed);
        a.load("r10", slot(64));
        a.store({ base: "r10", disp: 64 }, "rax");
        a.store(slot(144), "rax");
        a.lea("rdx", { rip: "gui.drawCallback" });
        call(a, "gtk_drawing_area_set_draw_func", [
            slot(144),
            "rdx",
            slot(64),
            0,
        ]);
        a.load("r10", slot(64));
        call(a, "gtk_window_set_child", [{ base: "r10" }, slot(144)]);
        a.label(haveArea);
        a.load("rcx", slot(64));
        a.load("rdx", slot(72));
        a.call("gui.input.commit");
        a.mov("rax", 0);
        a.store(slot(160), "rax");
        a.load("r10", slot(64));
        a.load("rax", { base: "r10", disp: 72 });
        a.store(slot(152), "rax");
        a.load("rax", slot(88));
        a.store({ base: "r10", disp: 72 }, "rax");
        a.mov("rax", 0);
        a.store(slot(88), "rax");
        a.load("rcx", { base: "r10", disp: 64 });
        call(a, "gtk_widget_queue_draw", ["rcx"]);
        a.load("rcx", slot(152));
        a.test("rcx", "rcx");
        const noOld = a.unique("noOld");
        a.jcc("e", noOld);
        call(a, "cairo_surface_destroy", ["rcx"]);
        a.label(noOld);
        a.jmp(cleanup);
        a.label(invalid);
        a.mov("rax", -3);
        a.store(slot(128), "rax");
        a.jmp(cleanup);
        a.label(failed);
        a.load("rax", slot(160));
        const noStaged = a.unique("noStaged");
        a.test("rax", "rax");
        a.jcc("e", noStaged);
        a.load("rcx", slot(64));
        a.call("gui.input.rollback");
        a.label(noStaged);
        a.mov("rax", -6);
        a.store(slot(128), "rax");
        a.label(cleanup);
        for (const [offset, name] of [
            [96, "cairo_destroy"],
            [88, "cairo_surface_destroy"],
        ] as const) {
            a.load("rcx", slot(offset));
            a.test("rcx", "rcx");
            const skip = a.unique("skip");
            a.jcc("e", skip);
            call(a, name, ["rcx"]);
            a.label(skip);
        }
        a.load("rax", slot(128));
    });
}
