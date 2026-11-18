// The helper consumes a private fixed Uint16Array synchronously. No pointer or
// managed Value is retained by native code; the OS owns copies of control text.
const native = __nonaWin32Settings;
delete globalThis.__nonaWin32Settings;
// Calls are synchronous and native code never reenters JavaScript. Reuse the
// rooted module-owned scratch storage so idle polling allocates nothing.
const scratch = new Uint16Array(1536);
let active = null,
    ready = null,
    registered = false;
function text(value) {
    if (typeof value !== "string") throw new TypeError("Expected a string");
    if (value.length > 127 || value.includes("\0"))
        throw new RangeError(
            "Settings text must have at most 127 UTF-16 units and no NUL",
        );
    return value;
}
function put(buffer, index, value) {
    text(value);
    for (let i = 0; i < 128; i++)
        buffer[index + i] = i < value.length ? value.charCodeAt(i) : 0;
}
function command(op) {
    scratch[0] = op;
    return scratch;
}
function call(buffer) {
    const result = native(buffer);
    if (result < 0)
        throw new Error("Win32 settings operation failed (" + result + ")");
    return result;
}
const poller = {
    active() {
        return active === null ? 0 : 1;
    },
    total() {
        return active === null ? 0 : 1;
    },
    poll(timeout) {
        ready = null;
        if (active === null) return 0;
        const buffer = command(3);
        buffer[3] = timeout < 0 ? 10 : Math.min(10, timeout);
        const code = call(buffer);
        if (code === 0) return 0;
        ready = { session: active, code };
        return 1;
    },
    run() {
        const event = ready;
        ready = null;
        if (event === null || active !== event.session) return;
        const window = event.session.window;
        active = null;
        window._session = null;
        const type = event.code & 7;
        const detail =
            type === 1
                ? {
                      type: "save",
                      checked: !!(event.code & 8),
                      choice: event.code >> 4,
                  }
                : { type: type === 2 ? "cancel" : "close" };
        // Detach before user code. runReady owns exception dispatch and the
        // subsequent Promise job drain, outside every native callback frame.
        window._onEvent(detail);
    },
};
export class SettingsWindow {
    constructor(options) {
        if (!options || typeof options.onEvent !== "function")
            throw new TypeError("SettingsWindow requires onEvent");
        if (!Array.isArray(options.choices) || options.choices.length !== 7)
            throw new TypeError("SettingsWindow requires seven choices");
        this._choices = [];
        for (let i = 0; i < 7; i++)
            this._choices.push(text(options.choices[i]));
        this._title = text(
            options.title === undefined ? "Settings" : options.title,
        );
        this._checkbox = text(
            options.checkboxLabel === undefined
                ? "Enabled"
                : options.checkboxLabel,
        );
        this._onEvent = options.onEvent;
        this._session = null;
        this._disposed = false;
    }
    get isOpen() {
        return this._session !== null;
    }
    open(state) {
        if (this._disposed) throw new Error("SettingsWindow is disposed");
        if (active !== null)
            throw new Error("A settings window is already open");
        if (
            !state ||
            typeof state.checked !== "boolean" ||
            !Number.isInteger(state.choice) ||
            state.choice < 0 ||
            state.choice > 6
        )
            throw new TypeError(
                "Expected checked Boolean and choice 0 through 6",
            );
        const buffer = command(1);
        buffer[1] = state.checked ? 1 : 0;
        buffer[2] = state.choice;
        put(buffer, 16, this._title);
        put(buffer, 144, this._checkbox);
        for (let i = 0; i < 7; i++)
            put(buffer, 272 + i * 128, this._choices[i]);
        call(buffer);
        this._session = { window: this };
        active = this._session;
        if (!registered) {
            globalThis.__nonaIoLoop(poller);
            registered = true;
        }
        return this;
    }
    setStatus(value) {
        text(value);
        if (this._disposed) throw new Error("SettingsWindow is disposed");
        if (this._session !== null) {
            const buffer = command(4);
            put(buffer, 16, value);
            call(buffer);
        }
    }
    close() {
        if (this._session === null) return;
        call(command(2));
        active = null;
        this._session = null;
        ready = null;
    }
    dispose() {
        this.close();
        this._disposed = true;
    }
}
