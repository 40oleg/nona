import { RuntimeBuilder, slot } from "./abi.js";
import type { Assembler, Mem, Reg, Xmm } from "../backend/machine/context.js";
import { guiSystemCall } from "./gui-abi.js";

// Scalar signatures are explicit, including pointer/double mixtures. Never use
// the public FFI to smuggle callbacks or managed storage into graphics code.
export const guiRenderCalls: [string, string, string][] = [
    ["libgtk-4.so.1", "gtk_drawing_area_new", ""],
    ["libgtk-4.so.1", "gtk_drawing_area_set_draw_func", "pppp"],
    ["libgtk-4.so.1", "gtk_window_set_child", "pp"],
    ["libgtk-4.so.1", "gtk_widget_queue_draw", "p"],
    ["libcairo.so.2", "cairo_recording_surface_create", "pp"],
    ["libcairo.so.2", "cairo_surface_status", "p"],
    ["libcairo.so.2", "cairo_surface_destroy", "p"],
    ["libcairo.so.2", "cairo_create", "p"],
    ["libcairo.so.2", "cairo_status", "p"],
    ["libcairo.so.2", "cairo_destroy", "p"],
    ["libcairo.so.2", "cairo_save", "p"],
    ["libcairo.so.2", "cairo_restore", "p"],
    ["libcairo.so.2", "cairo_new_path", "p"],
    ["libcairo.so.2", "cairo_rectangle", "pdddd"],
    ["libcairo.so.2", "cairo_arc", "pddddd"],
    ["libcairo.so.2", "cairo_close_path", "p"],
    ["libcairo.so.2", "cairo_clip", "p"],
    ["libcairo.so.2", "cairo_fill", "p"],
    ["libcairo.so.2", "cairo_stroke", "p"],
    ["libcairo.so.2", "cairo_set_line_width", "pd"],
    ["libcairo.so.2", "cairo_set_source_rgba", "pdddd"],
    ["libcairo.so.2", "cairo_move_to", "pdd"],
    ["libcairo.so.2", "cairo_line_to", "pdd"],
    ["libcairo.so.2", "cairo_translate", "pdd"],
    ["libcairo.so.2", "cairo_scale", "pdd"],
    ["libcairo.so.2", "cairo_set_source_surface", "ppdd"],
    ["libcairo.so.2", "cairo_get_source", "p"],
    ["libcairo.so.2", "cairo_pattern_set_filter", "pp"],
    ["libcairo.so.2", "cairo_paint", "p"],
    ["libcairo.so.2", "cairo_image_surface_create_from_png", "p"],
    ["libcairo.so.2", "cairo_image_surface_get_width", "p"],
    ["libcairo.so.2", "cairo_image_surface_get_height", "p"],
    ["libpangocairo-1.0.so.0", "pango_cairo_font_map_new", ""],
    ["libpangocairo-1.0.so.0", "pango_cairo_show_layout", "pp"],
    ["libpango-1.0.so.0", "pango_font_map_create_context", "p"],
    ["libpango-1.0.so.0", "pango_layout_new", "p"],
    ["libpango-1.0.so.0", "pango_layout_set_text", "ppp"],
    ["libpango-1.0.so.0", "pango_layout_set_font_description", "pp"],
    ["libpango-1.0.so.0", "pango_font_description_new", ""],
    ["libpango-1.0.so.0", "pango_font_description_set_family", "pp"],
    ["libpango-1.0.so.0", "pango_font_description_set_absolute_size", "pd"],
    ["libpango-1.0.so.0", "pango_font_description_set_weight", "pp"],
    ["libpango-1.0.so.0", "pango_font_description_free", "p"],
    ["libpangoft2-1.0.so.0", "pango_fc_font_map_set_config", "pp"],
    ["libfontconfig.so.1", "FcInitLoadConfigAndFonts", ""],
    ["libfontconfig.so.1", "FcConfigAppFontAddFile", "pp"],
    ["libfontconfig.so.1", "FcConfigDestroy", "p"],
    ["libgobject-2.0.so.0", "g_object_unref", "p"],
];
export function registerGuiRenderCalls(b: RuntimeBuilder): void {
    for (const [library, name, signature] of guiRenderCalls)
        guiSystemCall(b, library, name, signature);
}

type Argument = number | Reg | Mem | { double: Mem };
export function renderCall(a: Assembler, name: string, args: Argument[]): void {
    const gp: Reg[] = ["rcx", "rdx", "r8", "r9"];
    // Call sites pass memory/immediates, or RCX as the first argument only.
    args.forEach((arg, i) => {
        if (typeof arg === "object" && "double" in arg) {
            if (i < 4) a.movsd(("xmm" + i) as Xmm, arg.double);
            else {
                a.load("rax", arg.double);
                a.store(slot(32 + (i - 4) * 8), "rax");
            }
        } else {
            const dest = i < 4 ? gp[i]! : "rax";
            if (typeof arg === "object") a.load(dest, arg);
            else a.mov(dest, arg);
            if (i >= 4) a.store(slot(32 + (i - 4) * 8), dest);
        }
    });
    a.call("gui.abi." + name);
}
