// Private retained state: public snapshots cannot bypass validation/ownership.
const elementState = new WeakMap();
let nextElementId = 1;
const kinds = [
    "row",
    "column",
    "stack",
    "text",
    "image",
    "drawing",
    "button",
    "entry",
    "toggle",
];
const controlRoles = { button: "button", entry: "textbox", toggle: "checkbox" };
const elementEvents = [
    "activate",
    "input",
    "change",
    "focus",
    "blur",
    "keydown",
    "keyup",
    "pointerdown",
    "pointerup",
];
const numeric = [
    "x",
    "y",
    "width",
    "height",
    "minWidth",
    "minHeight",
    "maxWidth",
    "maxHeight",
    "gap",
    "radius",
    "borderWidth",
    "fontSize",
    "lineHeight",
    "scrollX",
    "scrollY",
];
const strings = ["text", "fontFamily", "font", "src"];
function finite(value, min = 0, max = 1048576) {
    if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < min ||
        value > max
    )
        throw new RangeError("GUI number outside supported range");
    return value;
}
function string(value) {
    if (
        typeof value !== "string" ||
        value.includes("\0") ||
        value.length > 65535
    )
        throw new TypeError(
            "Expected GUI string without NUL (max 65535 characters)",
        );
    return value;
}
function color(value) {
    if (
        typeof value !== "string" ||
        !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value)
    )
        throw new TypeError("GUI color must be #RRGGBB or #RRGGBBAA");
    return value;
}
function drawing(value) {
    if (!Array.isArray(value) || value.length > 4096)
        throw new TypeError("Expected at most 4096 GUI drawing commands");
    const result = [];
    for (const command of value) {
        if (!command || typeof command !== "object")
            throw new TypeError("Expected GUI drawing command");
        const fields =
            command.op === "line"
                ? ["x1", "y1", "x2", "y2", "lineWidth", "color"]
                : command.op === "circle"
                  ? ["x", "y", "radius", "color"]
                  : command.op === "fillRect" || command.op === "strokeRect"
                    ? [
                          "x",
                          "y",
                          "width",
                          "height",
                          "radius",
                          "color",
                          "lineWidth",
                      ]
                    : null;
        if (!fields) throw new TypeError("Unknown GUI drawing operation");
        const copy = { op: command.op };
        for (const key of Object.keys(command)) {
            if (key === "op") continue;
            if (!fields.includes(key))
                throw new TypeError("Unknown GUI drawing field: " + key);
            copy[key] =
                key === "color"
                    ? color(command[key])
                    : finite(
                          command[key],
                          key.startsWith("x") || key.startsWith("y")
                              ? -1048576
                              : 0,
                      );
        }
        for (const key of fields) {
            if (copy[key] === undefined) {
                if (key === "radius" && command.op !== "circle") copy[key] = 0;
                else if (key === "lineWidth") copy[key] = 1;
                else throw new TypeError("Missing GUI drawing field: " + key);
            }
        }
        if (copy.lineWidth === 0)
            throw new RangeError("GUI drawing lineWidth must be positive");
        result.push(Object.freeze(copy));
    }
    return Object.freeze(result);
}
function properties(kind, input, previous) {
    if (!input || typeof input !== "object" || Array.isArray(input))
        throw new TypeError("Expected GUI properties");
    const out = previous
        ? { ...previous }
        : {
              x: 0,
              y: 0,
              minWidth: 0,
              minHeight: 0,
              maxWidth: 1048576,
              maxHeight: 1048576,
              gap: 0,
              padding: Object.freeze([0, 0, 0, 0]),
              align: "start",
              justify: "start",
              clip: false,
              scroll: false,
              scrollX: 0,
              scrollY: 0,
              color: "#000000",
              background: "#00000000",
              borderColor: "#000000",
              borderWidth: 0,
              radius: 0,
              text: "",
              fontFamily: "sans",
              fontSize: 16,
              fontWeight: 400,
              lineHeight: 19.2,
              imageFit: "contain",
              commands: Object.freeze([]),
              checked: false,
              enabled: true,
              accessibleName: "",
              role: controlRoles[kind] || "",
          };
    for (const key of Object.keys(input)) {
        const value = input[key];
        if (numeric.includes(key)) {
            if ((key === "fontSize" || key === "lineHeight") && kind !== "text")
                throw new TypeError("Font properties require a text element");
            if (
                (key === "width" || key === "height") &&
                (value === "auto" || value === "fill")
            )
                out[key] = value;
            else
                out[key] = finite(
                    value,
                    key === "x" || key === "y" ? -1048576 : 0,
                );
        } else if (strings.includes(key)) {
            if (
                (key === "text" && kind !== "text" && !controlRoles[kind]) ||
                (key.startsWith("font") && kind !== "text")
            )
                throw new TypeError("Text properties require a text element");
            if (key === "src" && kind !== "image")
                throw new TypeError("src requires an image element");
            out[key] = string(value);
            if ((key === "font" || key === "src") && !value)
                throw new TypeError("Empty GUI asset path");
        } else if (key === "accessibleName" || key === "role") {
            if (
                !controlRoles[kind] ||
                (key === "role" && value !== controlRoles[kind])
            )
                throw new TypeError("GUI role must match the native control");
            out[key] = string(value);
        } else if (key === "checked" || key === "enabled") {
            if (
                !controlRoles[kind] ||
                (key === "checked" && kind !== "toggle") ||
                typeof value !== "boolean"
            )
                throw new TypeError("Invalid GUI control state");
            out[key] = value;
        } else if (["color", "background", "borderColor"].includes(key))
            out[key] = color(value);
        else if (key === "padding") {
            const pad =
                typeof value === "number"
                    ? [value, value, value, value]
                    : value;
            if (!Array.isArray(pad) || pad.length !== 4)
                throw new TypeError(
                    "GUI padding is a number or [top,right,bottom,left]",
                );
            out.padding = Object.freeze([
                finite(pad[0]),
                finite(pad[1]),
                finite(pad[2]),
                finite(pad[3]),
            ]);
        } else if (key === "align" || key === "justify") {
            if (
                !["start", "center", "end", "stretch"].includes(value) ||
                (key === "justify" && value === "stretch")
            )
                throw new TypeError("Invalid GUI alignment");
            out[key] = value;
        } else if (key === "clip" || key === "scroll") {
            if (typeof value !== "boolean")
                throw new TypeError("Expected GUI boolean");
            out[key] = value;
        } else if (key === "fontWeight") {
            if (
                kind !== "text" ||
                !Number.isInteger(value) ||
                value < 100 ||
                value > 1000
            )
                throw new RangeError("GUI fontWeight must be 100..1000");
            out[key] = value;
        } else if (key === "imageFit") {
            if (
                kind !== "image" ||
                !["contain", "cover", "stretch"].includes(value)
            )
                throw new TypeError("Invalid GUI imageFit");
            out[key] = value;
        } else if (key === "commands") {
            if (kind !== "drawing")
                throw new TypeError("commands requires a drawing element");
            out[key] = drawing(value);
        } else throw new TypeError("Unknown GUI property: " + key);
    }
    if (
        out.minWidth > out.maxWidth ||
        out.minHeight > out.maxHeight ||
        out.fontSize <= 0 ||
        out.lineHeight <= 0
    )
        throw new RangeError("Inconsistent GUI sizing constraints");
    if (kind === "entry" && Array.from(out.text).length > 1024)
        throw new RangeError("GUI entry text exceeds 1024 Unicode characters");
    return Object.freeze(out);
}
export function acceptControlState(element, event) {
    const s = state(element);
    if (event.code === 5)
        s.props = Object.freeze({ ...s.props, text: event.text });
    if (event.code === 6)
        s.props = Object.freeze({ ...s.props, checked: !!event.value });
}
export function deliverElementEvent(element, detail) {
    const s = state(element),
        listeners = s.listeners.get(detail.type);
    if (!listeners) return;
    // Snapshot additions, but honor removal/disposal during delivery.
    for (const listener of Array.from(listeners)) {
        if (s.disposed) break;
        if (!listeners.has(listener)) continue;
        listener.call(element, detail);
    }
}
export function state(element) {
    const s = elementState.get(element);
    if (!s) throw new TypeError("Expected GUI Element");
    if (s.disposed) throw new Error("GUI Element is disposed");
    return s;
}
function inspect(element, owner, seen, depth) {
    const s = state(element);
    if (seen.has(element) || depth > 64 || seen.size >= 4096)
        throw new Error("GUI tree cycle, duplicate, depth or capacity limit");
    seen.add(element);
    if (s.owner && s.owner !== owner)
        throw new Error("GUI Element belongs to another window");
    for (const child of s.children) inspect(child, owner, seen, depth + 1);
}
function own(element, owner) {
    const s = state(element);
    s.owner = owner;
    owner._elements.add(element);
    for (const child of s.children) own(child, owner);
}
export function setWindowRoot(window, element) {
    if (element !== null) {
        const s = state(element);
        if (s.parent || (s.root && s.root !== window))
            throw new Error("GUI root is already attached");
        inspect(element, window, new Set(), 0);
    }
    const old = window._root;
    window._root = element;
    try {
        window._render();
    } catch (error) {
        window._root = old;
        throw error;
    }
    if (old) state(old).root = null;
    if (element) {
        state(element).root = window;
        own(element, window);
    }
}
export function disposeWindowElements(window) {
    for (const element of window._elements) {
        const s = elementState.get(element);
        s.disposed = true;
        s.children = [];
        s.props = null;
        s.parent = null;
        s.owner = null;
        s.root = null;
        s.listeners.clear();
    }
    window._elements.clear();
    window._root = null;
}
export class Element {
    constructor(kind, props = {}, children = []) {
        if (!kinds.includes(kind))
            throw new TypeError("Unknown GUI element kind");
        if (nextElementId > Number.MAX_SAFE_INTEGER)
            throw new RangeError("GUI element IDs exhausted");
        elementState.set(this, {
            id: nextElementId++,
            kind,
            props: properties(kind, props),
            children: [],
            parent: null,
            owner: null,
            root: null,
            disposed: false,
            bounds: null,
            listeners: new Map(),
            epoch: 0,
            revision: 1,
        });
        this.setChildren(children);
    }
    get id() {
        const s = elementState.get(this);
        if (!s) throw new TypeError("Expected GUI Element");
        return s.id;
    }
    get kind() {
        return state(this).kind;
    }
    get disposed() {
        return elementState.get(this).disposed;
    }
    get properties() {
        return state(this).props;
    }
    get children() {
        return state(this).children.slice();
    }
    get bounds() {
        const b = state(this).bounds;
        return b ? { ...b } : null;
    }
    update(patch) {
        const s = state(this),
            old = s.props,
            revision = s.revision;
        s.props = properties(s.kind, patch, old);
        if (patch.text !== undefined || patch.checked !== undefined)
            s.revision++;
        try {
            if (s.owner) s.owner._render();
        } catch (error) {
            s.props = old;
            s.revision = revision;
            throw error;
        }
        return this;
    }
    on(type, listener) {
        const s = state(this);
        if (
            !controlRoles[s.kind] ||
            !elementEvents.includes(type) ||
            typeof listener !== "function"
        )
            throw new TypeError("Expected a native control event and listener");
        let listeners = s.listeners.get(type);
        if (!listeners) {
            listeners = new Set();
            s.listeners.set(type, listeners);
        }
        listeners.add(listener);
        return () => listeners.delete(listener);
    }
    focus() {
        const s = state(this);
        if (!s.owner || !controlRoles[s.kind])
            throw new Error("GUI control is not attached");
        s.owner._focus(this);
        return this;
    }
    setChildren(children) {
        const s = state(this);
        if (!Array.isArray(children))
            throw new TypeError("Expected GUI children array");
        if (!["row", "column", "stack"].includes(s.kind) && children.length)
            throw new TypeError("GUI leaf cannot have children");
        const seen = new Set([this]);
        for (const child of children) {
            const c = state(child);
            if ((c.parent && c.parent !== this) || c.root)
                throw new Error("GUI child is already attached");
            inspect(child, s.owner, seen, 1);
        }
        const old = s.children;
        s.children = children.slice();
        try {
            // Also validate ancestors: a locally shallow insertion can exceed
            // the whole tree's depth/capacity limits.
            let top = this;
            while (state(top).parent) top = state(top).parent;
            inspect(top, s.owner, new Set(), 0);
            if (s.owner) s.owner._render();
        } catch (error) {
            s.children = old;
            throw error;
        }
        for (const child of old) state(child).parent = null;
        for (const child of children) {
            state(child).parent = this;
            if (s.owner) own(child, s.owner);
        }
        return this;
    }
    dispose() {
        const s = elementState.get(this);
        if (!s || s.disposed) return;
        if (s.parent)
            s.parent.setChildren(
                state(s.parent).children.filter((c) => c !== this),
            );
        else if (s.root) setWindowRoot(s.root, null);
        const release = (element) => {
            const c = elementState.get(element);
            for (const child of c.children) release(child);
            if (c.owner) c.owner._elements.delete(element);
            c.disposed = true;
            c.props = null;
            c.children = [];
            c.parent = null;
            c.root = null;
            c.owner = null;
            c.bounds = null;
            c.listeners.clear();
        };
        release(this);
    }
}
