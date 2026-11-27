import {
    Element,
    setWindowRoot,
    disposeWindowElements,
    state,
    acceptControlState,
    deliverElementEvent,
} from "nona:internal/gui-elements";
import { scene, publishBounds } from "nona:internal/gui-layout";
import { scenePacket } from "nona:internal/gui-scene";
export { Element };
// Private, synchronous buffer borrowing. No managed pointers escape to GTK.
const native = __nonaGui;
delete globalThis.__nonaGui;
const scratch = new Uint32Array(2048);
const scratchView = new DataView(scratch.buffer);
const titleBytes = new Uint8Array(scratch.buffer, 64, 512);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const choosers = new Map();
let nextChooser = 1;
const sessions = [];
for (let i = 0; i < 32; i++) sessions[i] = null;
let registered = false,
    ready = null,
    count = 0;
function size(value) {
    if (!Number.isInteger(value) || value < 1 || value > 16384)
        throw new RangeError("GUI size must be an integer from 1 to 16384");
    return value;
}
function title(value) {
    if (typeof value !== "string" || value.includes("\0"))
        throw new TypeError("GUI title must be a string without NUL");
    const bytes = encoder.encode(value);
    if (bytes.length > 511)
        throw new RangeError("GUI title exceeds 511 UTF-8 bytes");
    return bytes;
}
function command(op, session) {
    scratch[0] = op;
    scratch[1] = session ? session.slot : 0;
    scratch[2] = session ? session.generation : 0;
    return scratch;
}
function call() {
    const result = native(scratch);
    if (result < 0) {
        if (result === -1)
            throw new Error("GTK initialization failed: no usable display");
        throw new Error("GUI operation failed (" + result + ")");
    }
    return result;
}
const poller = {
    active() {
        return count + choosers.size;
    },
    total() {
        return count + choosers.size;
    },
    poll(timeout, deadline) {
        ready = null;
        if (count === 0 && choosers.size === 0) return 0;
        command(3);
        // Earlier nonblocking pollers may have consumed the original timeout.
        // The outer loop also supplies its earliest absolute timer deadline,
        // in performance.now() units. Recompute what remains before native
        // dispatch; native dispatch time is then subtracted before sleeping.
        let budget = timeout < 0 ? 10 : Math.min(10, Math.max(0, timeout));
        if (deadline !== undefined)
            budget = Math.min(
                budget,
                Math.max(0, Math.ceil(deadline - performance.now())),
            );
        scratch[5] = budget;
        if (call() === 0) return 0;
        if (scratch[6] === 20) {
            ready = {
                code: 20,
                request: scratch[15],
                value: scratch[12],
                text: decoder.decode(
                    new Uint8Array(scratch.buffer, 64, scratch[14]),
                ),
            };
            return 1;
        }
        const session = sessions[scratch[1]];
        if (!session || session.generation !== scratch[2]) return 0;
        ready = {
            session,
            code: scratch[6],
            width: scratch[7],
            height: scratch[8],
            scaleFactor: scratch[9],
            id: scratch[10],
            epoch: scratch[11],
            value: scratch[12],
            modifiers: scratch[13],
            revision: scratch[9],
            text:
                scratch[6] === 5
                    ? decoder.decode(
                          new Uint8Array(scratch.buffer, 64, scratch[14]),
                      )
                    : "",
            x: scratchView.getFloat32(28, true),
            y: scratchView.getFloat32(32, true),
        };
        return 1;
    },
    run() {
        const event = ready;
        ready = null;
        if (!event) return;
        if (event.code === 20) {
            const work = choosers.get(event.request);
            if (!work) return;
            choosers.delete(event.request);
            const valid =
                work.window._session === work.session && !work.cancelled;
            if (valid && event.value)
                work.reject(
                    new Error(
                        "GUI folder selection failed (" + event.value + ")",
                    ),
                );
            else work.resolve(valid && event.text ? event.text : null);
            return;
        }
        const session = event.session,
            window = session.window;
        if (sessions[session.slot] !== session || window._session !== session)
            return;
        if (event.code === 1) {
            sessions[session.slot] = null;
            window._session = null;
            window._hasScene = false;
            window._syncedShortcuts = false;
            count--;
            window._attached.clear();
        }
        if (event.code >= 4 && event.code <= 12) {
            if (event.code === 12) {
                const shortcut = window._shortcuts.get(event.value);
                if (shortcut)
                    shortcut.listener.call(window, {
                        type: "shortcut",
                        keyval: shortcut.keyval,
                        modifiers: shortcut.modifiers,
                    });
                return;
            }
            const target = window._attached.get(event.id);
            if (
                !target ||
                target.epoch !== event.epoch ||
                target.element.disposed
            )
                return;
            const element = target.element,
                s = state(element);
            if (
                (event.code === 5 || event.code === 6) &&
                event.revision &&
                event.revision !== s.revision
            )
                return;
            acceptControlState(element, event);
            const type = [
                "activate",
                "input",
                "change",
                "focus",
                "blur",
                "keydown",
                "keyup",
                "pointerdown",
            ][event.code - 4];
            deliverElementEvent(element, {
                type,
                target: element,
                text: event.text,
                checked: !!event.value,
                keyval: event.value,
                button: event.value,
                modifiers: event.modifiers,
                x: event.x,
                y: event.y,
            });
            return;
        }
        if (event.code === 13) {
            const target = window._attached.get(event.id);
            if (
                target &&
                target.epoch === event.epoch &&
                !target.element.disposed
            )
                deliverElementEvent(target.element, {
                    type: "pointerup",
                    target: target.element,
                    button: event.value,
                    modifiers: event.modifiers,
                    x: event.x,
                    y: event.y,
                });
            return;
        }
        if (event.code === 14) {
            window._onEvent({ type: "overflow", dropped: event.value });
            return;
        }
        const detail =
            event.code === 1
                ? { type: "close" }
                : event.code === 2
                  ? { type: "resize", width: event.width, height: event.height }
                  : { type: "scale", scaleFactor: event.scaleFactor };
        if (event.code === 2) {
            window._width = event.width;
            window._height = event.height;
            window._render();
        }
        // runReady owns exception handling and the microtask checkpoint.
        window._onEvent(detail);
    },
};
export class Window {
    constructor(options = {}) {
        if (!options || typeof options !== "object")
            throw new TypeError("Expected GUI window options");
        this._title = title(
            options.title === undefined ? "Nona" : options.title,
        );
        this._width = size(options.width === undefined ? 640 : options.width);
        this._height = size(
            options.height === undefined ? 480 : options.height,
        );
        if (
            options.onEvent !== undefined &&
            typeof options.onEvent !== "function"
        )
            throw new TypeError("Expected GUI onEvent function");
        this._onEvent = options.onEvent || function () {};
        this._session = null;
        this._disposed = false;
        this._root = null;
        this._elements = new Set();
        this._attached = new Map();
        this._shortcuts = new Map();
        this._nextShortcut = 1;
    }
    get isOpen() {
        return this._session !== null;
    }
    open() {
        if (this._disposed) throw new Error("GUI Window is disposed");
        if (this.isOpen) throw new Error("GUI Window is already open");
        // Install the managed ownership path before creating native resources.
        if (!registered) {
            globalThis.__nonaIoLoop(poller);
            registered = true;
        }
        const session = { window: this, slot: 0, generation: 0 };
        command(1);
        scratch[3] = this._width;
        scratch[4] = this._height;
        for (let i = 0; i < 512; i++)
            titleBytes[i] = i < this._title.length ? this._title[i] : 0;
        call();
        session.slot = scratch[1];
        session.generation = scratch[2];
        sessions[session.slot] = session;
        this._session = session;
        count++;
        try {
            this._render();
            this._syncShortcuts();
        } catch (error) {
            this.close();
            throw error;
        }
        return this;
    }
    get root() {
        return this._root;
    }
    setRoot(element) {
        if (this._disposed) throw new Error("GUI Window is disposed");
        setWindowRoot(this, element);
        return this;
    }
    _render() {
        if (!this._session) return;
        // Empty windows need no drawing widget until their first root.
        if (!this._root && !this._hasScene) return;
        const result = scene(this._root, this._width, this._height);
        const attached = new Map();
        result.controls = [];
        for (const bounds of result.bounds) {
            const element = bounds.element,
                s = state(element),
                p = s.props;
            const kind = ["button", "entry", "toggle"].indexOf(s.kind);
            if (kind < 0) continue;
            if (
                attached.size >= 128 ||
                s.id > 2147483647 ||
                s.revision > 2147483647
            )
                throw new RangeError("GUI control capacity exceeded");
            const old = this._attached.get(s.id),
                epoch = old ? old.epoch : s.epoch + 1;
            if (epoch > 2147483647)
                throw new RangeError("GUI control generations exhausted");
            attached.set(s.id, { element, epoch });
            const clip = result.clips.get(element),
                x = Math.max(bounds.x, clip.x),
                y = Math.max(bounds.y, clip.y);
            const width = Math.max(
                    0,
                    Math.min(bounds.x + bounds.width, clip.x + clip.width) - x,
                ),
                height = Math.max(
                    0,
                    Math.min(bounds.y + bounds.height, clip.y + clip.height) -
                        y,
                );
            result.controls.push({
                op: 10 + kind,
                args: [
                    s.id,
                    epoch,
                    bounds.x,
                    bounds.y,
                    bounds.width,
                    bounds.height,
                    p.checked ? 1 : 0,
                    p.enabled ? 1 : 0,
                    s.revision,
                    x,
                    y,
                    width,
                    height,
                ],
                text: p.text,
                family: p.accessibleName || p.text,
                font: "",
            });
        }
        const packet = scenePacket(result, this._session);
        const status = native(packet);
        if (status < 0)
            throw new Error("GUI scene update failed (" + status + ")");
        publishBounds(result);
        for (const target of attached.values())
            state(target.element).epoch = target.epoch;
        this._attached = attached;
        this._hasScene = true;
    }
    _focus(element) {
        this._requireOpen();
        const target = this._attached.get(element.id);
        if (!target) throw new Error("GUI control is not attached");
        command(7, this._session);
        scratch[10] = element.id;
        scratch[11] = target.epoch;
        call();
    }
    chooseFolder(options = {}) {
        this._requireOpen();
        if (!options || typeof options !== "object")
            throw new TypeError("Expected folder chooser options");
        const caption = title(
            options.title === undefined ? "Select folder" : options.title,
        );
        const folder =
            options.initialFolder === undefined ? "" : options.initialFolder;
        if (
            typeof folder !== "string" ||
            folder.includes("\0") ||
            (folder && folder[0] !== "/")
        )
            throw new TypeError("Expected an absolute local initialFolder");
        const path = encoder.encode(folder);
        if (path.length > 4095 || nextChooser > 2147483647)
            throw new RangeError("GUI chooser limit exceeded");
        const request = nextChooser++,
            session = this._session;
        return new Promise((resolve, reject) => {
            const work = {
                window: this,
                session,
                resolve,
                reject,
                cancelled: false,
            };
            choosers.set(request, work);
            command(8, session);
            scratch[15] = request;
            titleBytes.fill(0);
            titleBytes.set(caption);
            const bytes = new Uint8Array(scratch.buffer, 640, 4096);
            bytes.fill(0);
            bytes.set(path);
            try {
                call();
            } catch (error) {
                choosers.delete(request);
                reject(error);
            }
        });
    }
    cancelFolder() {
        for (const [request, work] of choosers)
            if (work.window === this && !work.cancelled) {
                command(9);
                scratch[15] = request;
                call();
                work.cancelled = true;
            }
        return this;
    }
    addShortcut(keyval, modifiers, listener) {
        if (
            !Number.isInteger(keyval) ||
            keyval < 1 ||
            keyval > 0x10ffffff ||
            !Number.isInteger(modifiers) ||
            modifiers < 0 ||
            modifiers & ~0x1c00000d ||
            typeof listener !== "function" ||
            this._shortcuts.size >= 32 ||
            this._nextShortcut > 2147483647 ||
            this._disposed
        )
            throw new TypeError("Invalid GUI shortcut");
        const id = this._nextShortcut++;
        this._shortcuts.set(id, { keyval, modifiers, listener });
        try {
            this._syncShortcuts();
        } catch (error) {
            this._shortcuts.delete(id);
            throw error;
        }
        return () => {
            if (this._shortcuts.delete(id)) this._syncShortcuts();
        };
    }
    _syncShortcuts() {
        if (!this.isOpen) return;
        if (this._shortcuts.size === 0 && !this._syncedShortcuts) return;
        command(10, this._session);
        scratch[10] = this._shortcuts.size;
        let index = 16;
        for (const [id, shortcut] of this._shortcuts) {
            scratch[index++] = id;
            scratch[index++] = shortcut.keyval;
            scratch[index++] = shortcut.modifiers;
        }
        call();
        this._syncedShortcuts = true;
    }
    _requireOpen() {
        if (this._disposed) throw new Error("GUI Window is disposed");
        if (!this.isOpen) throw new Error("GUI Window is not open");
    }
    show() {
        this._requireOpen();
        command(4, this._session);
        call();
        return this;
    }
    resize(width, height) {
        this._requireOpen();
        size(width);
        size(height);
        command(5, this._session);
        scratch[3] = width;
        scratch[4] = height;
        call();
        this._width = width;
        this._height = height;
        return this;
    }
    close() {
        const session = this._session;
        if (session === null) return;
        this.cancelFolder();
        // A taken native close event has already released its slot. Avoid a
        // stale destroy command, while still invalidating the managed event.
        if (!ready || ready.session !== session || ready.code !== 1) {
            command(2, session);
            call();
        }
        sessions[session.slot] = null;
        this._session = null;
        this._hasScene = false;
        this._syncedShortcuts = false;
        this._attached.clear();
        count--;
        if (ready && ready.session === session) ready = null;
    }
    dispose() {
        this.close();
        disposeWindowElements(this);
        this._disposed = true;
        this._shortcuts.clear();
    }
}
