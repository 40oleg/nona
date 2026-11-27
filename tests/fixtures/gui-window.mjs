// A bounded window-bridge probe, not the retained-controls acceptance example.
import { Window } from "nona:gui";
import { define } from "nona:ffi";
import { spawn } from "node:child_process";

const toplevels = define("libgtk-4.so.1", "gtk_window_get_toplevels", "ptr()");
const item = define("libgio-2.0.so.0", "g_list_model_get_item", "ptr(ptr,u32)");
const length = define(
    "libgio-2.0.so.0",
    "g_list_model_get_n_items",
    "u32(ptr)",
);
const requestClose = define("libgtk-4.so.1", "gtk_window_close", "void(ptr)");
const unref = define("libgobject-2.0.so.0", "g_object_unref", "void(ptr)");
let ticks = 0,
    jobs = 0,
    closes = 0,
    observations = 0,
    output = "",
    disposed = false;
let ioEnded = false,
    started = false;
const deadline = setTimeout(() => {
    window.dispose();
    peer.dispose();
    child.kill();
    console.error("GUI fixture deadline");
    process.exit(91);
}, 4000);
const timer = setInterval(() => {
    ticks++;
    startChild();
}, 5);
function startChild() {
    if (!started && ticks > 0 && observations === 3) {
        started = true;
        child.stdin.write("start\n");
    }
}
function finish() {
    if (!disposed || !ioEnded) return;
    clearTimeout(deadline);
    clearInterval(timer);
    console.log(
        "progress",
        ticks > 0,
        jobs === 2,
        closes === 1,
        observations === 3,
        output === "first\nsecond\nthird\n",
        !window.isOpen,
        !peer.isOpen,
    );
    // Normal exit must wait for the final Promise checkpoint.
    Promise.resolve().then(() => console.log("normal exit"));
}
process.on("uncaughtException", (error) => {
    if (error.message !== "GUI fixture handled listener") throw error;
    console.log("caught listener");
});
const peer = new Window({ title: "Nona bridge peer", width: 160, height: 120 });
const window = new Window({
    title: "Nona bridge fixture",
    width: 320,
    height: 240,
    onEvent(event) {
        if (disposed) throw new Error("callback after disposal");
        if (event.type !== "close") {
            if (
                event.type === "resize" &&
                (event.width < 1 || event.height < 1)
            )
                throw new Error("invalid observed bounds");
            if (event.type === "scale" && event.scaleFactor < 1)
                throw new Error("invalid observed scale");
            observations |= event.type === "resize" ? 1 : 2;
            startChild();
            return;
        }
        if (window.isOpen || closes++)
            throw new Error("invalid close ownership");
        console.log("native close");
        window.open().resize(360, 260).show();
        Promise.resolve().then(() => {
            jobs++;
            console.log("close job");
        });
        // The child's remaining stdout is pending when both windows go away.
        setTimeout(() => {
            window.close();
            window.open();
            window.dispose();
            window.dispose();
            disposed = true;
            console.log("disposed");
            // Release the remaining writes only after disposal. Scheduling
            // delays cannot let the child exit before this ownership boundary.
            child.stdin.end("disposed\n");
            finish();
        }, 5);
        throw new Error("GUI fixture handled listener");
    },
});
window.open();
peer.open();
Promise.resolve().then(() => {
    jobs++;
    console.log("initial job");
});
const child = spawn("/bin/sh", [
    "-c",
    "IFS= read -r start || exit 81; printf 'first\\n'; IFS= read -r disposed || exit 82; printf 'second\\n'; sleep 0.1; printf 'third\\n'",
]);
let closing = false;
child.stdout.on("data", (chunk) => {
    output += chunk.toString();
    if (!closing) {
        closing = true;
        peer.dispose();
        const model = toplevels();
        if (length(model) !== 1) throw new Error("partial window cleanup");
        const nativeWindow = item(model, 0);
        requestClose(nativeWindow);
        unref(nativeWindow);
    }
});
child.on("error", (error) => {
    throw error;
});
child.on("close", (code) => {
    if (code !== 0) throw new Error("fixture child failed");
    ioEnded = true;
    console.log("stdout ended");
    finish();
});
