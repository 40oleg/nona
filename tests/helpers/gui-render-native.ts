// Test-only capture of the committed native recording. No production screenshot
// hook, raw handle or managed pointer is exposed by nona:gui.
import { RuntimeBuilder, slot, failIf } from "../../src/runtime/abi.js";
import { guiHelpers, GuiRecord } from "../../src/runtime/gui-bridge.js";
import { guiSystemCall } from "../../src/runtime/gui-abi.js";
import { renderCall as call } from "../../src/runtime/gui-render-api.js";
import { prependFunctionBuiltin } from "../../src/runtime/function-builtin.js";
import { withNativeTarget } from "../../src/backend/machine/context.js";
import { probeProgram } from "./gui-native.js";

export function guiRenderProgram(source: string, gcStress: boolean) {
    const program = probeProgram(source, gcStress, "linux-x64"),
        b = new RuntimeBuilder();
    b.bundle = program;
    const helpers = withNativeTarget("linux-x64", () => guiHelpers().bundle);
    program.fragments.push(...helpers.fragments);
    program.functions.push(...helpers.functions);
    program.imports.push(...helpers.imports);
    prependFunctionBuiltin(b, "gui", "guiNative", 1, "rt.globalObject");
    for (const [name, signature] of [
        ["cairo_image_surface_create", "ppp"],
        ["cairo_image_surface_get_data", "p"],
        ["cairo_surface_flush", "p"],
    ])
        guiSystemCall(b, "libcairo.so.2", name!, signature!);
    b.data("gui.capture.storage", new Uint8Array(24), ".data");
    const memory = (offset: number) => ({
        rip: "gui.capture.storage",
        addend: offset,
    });
    prependFunctionBuiltin(
        b,
        "gui.capture",
        "guiCapture",
        1,
        "rt.globalObject",
    );
    b.fn("gui.capture.code", 120, (a) => {
        a.store(slot(48), "rcx");
        a.movsd("xmm0", { base: "r8", disp: 8 });
        a.cvttsd2si("rax", "xmm0");
        a.store(slot(56), "rax");
        a.cmp("rax", 2);
        failIf(a, "a");
        a.load("rcx", memory(0));
        a.test("rcx", "rcx");
        const empty = a.unique("empty"),
            done = a.unique("done");
        a.jcc("e", empty);
        call(a, "cairo_surface_destroy", ["rcx"]);
        a.label(empty);
        a.load("rax", slot(56));
        a.store(memory(16), "rax");
        a.mov("r11", 0);
        a.store(memory(0), "r11");
        a.store(memory(8), "r11");
        a.test("rax", "rax");
        a.jcc("e", done);
        a.mov("rcx", 0);
        a.mov("rdx", "rax");
        a.shl("rdx", 6);
        a.mov("r8", "rdx");
        a.call("gui.abi.cairo_image_surface_create");
        a.store(memory(0), "rax");
        call(a, "cairo_surface_status", [memory(0)]);
        a.shl("rax", 32);
        a.shr("rax", 32);
        a.test("rax", "rax");
        failIf(a, "ne");
        call(a, "cairo_create", [memory(0)]);
        a.store(slot(64), "rax");
        a.load("rax", slot(56));
        a.cvtsi2sd("xmm0", "rax");
        a.storesd(slot(72), "xmm0");
        call(a, "cairo_scale", [
            slot(64),
            { double: slot(72) },
            { double: slot(72) },
        ]);
        call(a, "cairo_set_source_surface", [
            slot(64),
            { rip: "gui.records", addend: GuiRecord.surface },
            { double: { rip: "gui.render.constants" } },
            { double: { rip: "gui.render.constants" } },
        ]);
        call(a, "cairo_paint", [slot(64)]);
        call(a, "cairo_destroy", [slot(64)]);
        call(a, "cairo_surface_flush", [memory(0)]);
        call(a, "cairo_image_surface_get_data", [memory(0)]);
        a.store(memory(8), "rax");
        a.label(done);
        a.load("rcx", slot(48));
        a.mov("rax", 2);
        a.store({ base: "rcx" }, "rax");
        a.mov("rax", 1);
        a.store({ base: "rcx", disp: 8 }, "rax");
    });
    prependFunctionBuiltin(b, "gui.pixel", "guiPixel", 1, "rt.globalObject");
    b.fn("gui.pixel.code", 8, (a) => {
        a.movsd("xmm0", { base: "r8", disp: 8 });
        a.cvttsd2si("rax", "xmm0");
        a.load("r10", memory(8));
        a.test("r10", "r10");
        failIf(a, "e");
        const ink = a.unique("ink"),
            result = a.unique("result");
        a.cmp("rax", -1);
        a.jcc("e", ink);
        a.load("r11", memory(16));
        a.imul("r11", "r11");
        a.shl("r11", 12);
        a.cmp("rax", "r11");
        failIf(a, "ae");
        a.shl("rax", 2);
        a.add("r10", "rax");
        a.load("rax", { base: "r10" }, 32);
        a.jmp(result);
        a.label(ink);
        a.load("r11", memory(16));
        a.imul("r11", "r11");
        a.mov("rdx", "r11");
        a.mov("rax", 44 * 64 * 4);
        a.imul("rax", "r11");
        a.add("r10", "rax");
        a.mov("rax", 20 * 64);
        a.imul("rdx", "rax");
        a.mov("rax", 0);
        const loop = a.unique("loop"),
            white = a.unique("white");
        a.label(loop);
        a.load("r8", { base: "r10" }, 32);
        a.mov("r11", 0xffffffff);
        a.cmp("r8", "r11");
        a.jcc("e", white);
        a.add("rax", 1);
        a.label(white);
        a.add("r10", 4);
        a.sub("rdx", 1);
        a.jcc("ne", loop);
        a.label(result);
        a.cvtsi2sd("xmm0", "rax");
        a.mov("rax", 3);
        a.store({ base: "rcx" }, "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
    });
    return program;
}
