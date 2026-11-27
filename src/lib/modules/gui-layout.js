import { state } from "nona:internal/gui-elements";

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
function extent(element, axis, available) {
    const s = state(element),
        p = s.props,
        name = axis === 0 ? "width" : "height";
    const before = p.padding[axis === 0 ? 3 : 0],
        after = p.padding[axis === 0 ? 1 : 2];
    let value = p[name];
    if (value === "fill") value = available;
    else if (typeof value !== "number") {
        if (s.kind === "text")
            value =
                axis === 0
                    ? Math.max(0, available - before - after)
                    : p.text.split("\n").length * p.lineHeight;
        else if (s.kind === "image" || s.kind === "drawing") value = 0;
        else {
            const along =
                (axis === 0 && s.kind === "row") ||
                (axis === 1 && s.kind === "column");
            value = 0;
            for (const child of s.children) {
                const n = extent(
                    child,
                    axis,
                    Math.max(0, available - before - after),
                );
                value = along ? value + n : Math.max(value, n);
            }
            if (along) value += Math.max(0, s.children.length - 1) * p.gap;
        }
        value += before + after;
    }
    return clamp(
        value,
        p[axis === 0 ? "minWidth" : "minHeight"],
        p[axis === 0 ? "maxWidth" : "maxHeight"],
    );
}
function rgba(value) {
    return [
        parseInt(value.slice(1, 3), 16) / 255,
        parseInt(value.slice(3, 5), 16) / 255,
        parseInt(value.slice(5, 7), 16) / 255,
        value.length === 9 ? parseInt(value.slice(7, 9), 16) / 255 : 1,
    ];
}
export function scene(root, width, height) {
    const commands = [],
        bounds = [];
    const push = (op, args = [], text = "", family = "", font = "") => {
        if (commands.length >= 16384)
            throw new RangeError("GUI scene command capacity exceeded");
        commands.push({ op, args, text, family, font });
    };
    const visit = (element, x, y, w, h) => {
        const s = state(element),
            p = s.props;
        x += p.x;
        y += p.y;
        bounds.push({ element, x, y, width: w, height: h });
        push(1);
        if (p.background !== "#00000000")
            push(4, [x, y, w, h, p.radius, ...rgba(p.background)]);
        if (p.borderWidth)
            push(5, [
                x,
                y,
                w,
                h,
                p.radius,
                p.borderWidth,
                ...rgba(p.borderColor),
            ]);
        if (
            p.clip ||
            p.scroll ||
            s.kind === "drawing" ||
            s.kind === "image" ||
            s.kind === "text"
        )
            push(3, [x, y, w, h, p.radius]);
        const cx = x + p.padding[3],
            cy = y + p.padding[0];
        const cw = Math.max(0, w - p.padding[1] - p.padding[3]),
            ch = Math.max(0, h - p.padding[0] - p.padding[2]);
        if (s.kind === "text") {
            const lines = p.text.split("\n");
            for (let i = 0; i < lines.length; i++)
                push(
                    6,
                    [
                        cx,
                        cy + i * p.lineHeight,
                        cw,
                        ch,
                        p.fontSize,
                        p.lineHeight,
                        p.fontWeight,
                        ...rgba(p.color),
                    ],
                    lines[i],
                    p.fontFamily,
                    p.font || "",
                );
        }
        if (s.kind === "image" && p.src)
            push(
                7,
                [
                    cx,
                    cy,
                    cw,
                    ch,
                    ["contain", "cover", "stretch"].indexOf(p.imageFit),
                ],
                p.src,
            );
        if (s.kind === "drawing")
            for (const d of p.commands) {
                if (d.op === "line")
                    push(8, [
                        cx + d.x1,
                        cy + d.y1,
                        cx + d.x2,
                        cy + d.y2,
                        d.lineWidth,
                        ...rgba(d.color),
                    ]);
                else if (d.op === "circle")
                    push(9, [cx + d.x, cy + d.y, d.radius, ...rgba(d.color)]);
                else
                    push(d.op === "fillRect" ? 4 : 5, [
                        cx + d.x,
                        cy + d.y,
                        d.width,
                        d.height,
                        d.radius,
                        ...(d.op === "strokeRect" ? [d.lineWidth] : []),
                        ...rgba(d.color),
                    ]);
            }
        const row = s.kind === "row",
            column = s.kind === "column";
        let used = Math.max(0, s.children.length - 1) * p.gap,
            fills = 0;
        const sizes = [];
        for (const child of s.children) {
            const q = state(child).props;
            const sw = extent(child, 0, cw),
                sh = extent(child, 1, ch);
            sizes.push([sw, sh]);
            if (row || column) {
                if (q[row ? "width" : "height"] === "fill") fills++;
                else used += row ? sw : sh;
            }
        }
        if (fills)
            for (let i = 0; i < s.children.length; i++) {
                const q = state(s.children[i]).props,
                    axis = row ? 0 : 1;
                if (q[row ? "width" : "height"] === "fill") {
                    sizes[i][axis] = clamp(
                        Math.max(0, (row ? cw : ch) - used) / fills,
                        q[row ? "minWidth" : "minHeight"],
                        q[row ? "maxWidth" : "maxHeight"],
                    );
                }
            }
        let total = Math.max(0, s.children.length - 1) * p.gap;
        for (const size of sizes) total += size[row ? 0 : 1];
        const remaining = Math.max(0, (row ? cw : ch) - total);
        let cursor =
            p.justify === "center"
                ? remaining / 2
                : p.justify === "end"
                  ? remaining
                  : 0;
        for (let i = 0; i < s.children.length; i++) {
            const child = s.children[i],
                q = state(child).props;
            let sw = sizes[i][0],
                sh = sizes[i][1];
            if (p.align === "stretch") {
                if (!row && (q.width === undefined || q.width === "auto"))
                    sw = clamp(cw, q.minWidth, q.maxWidth);
                if (!column && (q.height === undefined || q.height === "auto"))
                    sh = clamp(ch, q.minHeight, q.maxHeight);
            }
            let dx =
                p.align === "center"
                    ? Math.max(0, cw - sw) / 2
                    : p.align === "end"
                      ? Math.max(0, cw - sw)
                      : 0;
            let dy =
                p.align === "center"
                    ? Math.max(0, ch - sh) / 2
                    : p.align === "end"
                      ? Math.max(0, ch - sh)
                      : 0;
            if (row) dx = cursor;
            if (column) dy = cursor;
            visit(
                child,
                cx + dx - (p.scroll ? p.scrollX : 0),
                cy + dy - (p.scroll ? p.scrollY : 0),
                sw,
                sh,
            );
            cursor += (row ? sw : sh) + p.gap;
        }
        push(2);
    };
    if (root) {
        const p = state(root).props;
        visit(
            root,
            0,
            0,
            clamp(
                typeof p.width === "number" ? p.width : width,
                p.minWidth,
                p.maxWidth,
            ),
            clamp(
                typeof p.height === "number" ? p.height : height,
                p.minHeight,
                p.maxHeight,
            ),
        );
    }
    return { commands, bounds };
}
export function publishBounds(result) {
    for (const b of result.bounds)
        state(b.element).bounds = {
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
        };
}
// Cover a logical rectangle with integer device pixels, including negative origins.
export function deviceBounds(bounds, scale) {
    if (
        typeof scale !== "number" ||
        !Number.isFinite(scale) ||
        scale <= 0 ||
        scale > 16
    )
        throw new RangeError("Invalid GUI scale");
    const x = Math.floor(bounds.x * scale),
        y = Math.floor(bounds.y * scale);
    return {
        x,
        y,
        width: Math.ceil((bounds.x + bounds.width) * scale) - x,
        height: Math.ceil((bounds.y + bounds.height) * scale) - y,
    };
}
