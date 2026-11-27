// Private, synchronous buffer borrowing. No managed pointers escape to GTK.
const native = __nonaGui;
delete globalThis.__nonaGui;
const scratch = new Uint32Array(160);
const titleBytes = new Uint8Array(scratch.buffer, 64, 512);
const encoder = new TextEncoder();
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
        return count;
    },
    total() {
        return count;
    },
    poll(timeout, deadline) {
        ready = null;
        if (count === 0) return 0;
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
        const session = sessions[scratch[1]];
        if (!session || session.generation !== scratch[2]) return 0;
        ready = {
            session,
            code: scratch[6],
            width: scratch[7],
            height: scratch[8],
            scaleFactor: scratch[9],
        };
        return 1;
    },
    run() {
        const event = ready;
        ready = null;
        if (!event) return;
        const session = event.session,
            window = session.window;
        if (sessions[session.slot] !== session || window._session !== session)
            return;
        if (event.code === 1) {
            sessions[session.slot] = null;
            window._session = null;
            count--;
        }
        const detail =
            event.code === 1
                ? { type: "close" }
                : event.code === 2
                  ? { type: "resize", width: event.width, height: event.height }
                  : { type: "scale", scaleFactor: event.scaleFactor };
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
        return this;
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
        // A taken native close event has already released its slot. Avoid a
        // stale destroy command, while still invalidating the managed event.
        if (!ready || ready.session !== session || ready.code !== 1) {
            command(2, session);
            call();
        }
        sessions[session.slot] = null;
        this._session = null;
        count--;
        if (ready && ready.session === session) ready = null;
    }
    dispose() {
        this.close();
        this._disposed = true;
    }
}
