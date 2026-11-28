// Build and asset-copy commands: docs/gui.md#acceptance-application.
import { Window, Element } from "nona:gui";
import { spawn } from "node:child_process";

let sequence = 0,
    ticks = 0,
    jobs = 0,
    lines = 0,
    actions = 0;
let screen = "services",
    disposed = false,
    late = 0,
    session = 1;
let folderCount = 0,
    scrolling = 0,
    exiting = false;
function trace(type, detail = {}) {
    console.log(
        JSON.stringify({
            seq: ++sequence,
            type,
            time: performance.now(),
            pid: process.pid,
            session,
            ticks,
            jobs,
            lines,
            ...detail,
        }),
    );
}
const text = (value, height = 28) =>
    new Element("text", {
        text: value,
        height,
        color: "#203047",
        fontFamily: "Abel",
        font: "gui-assets/Abel-Regular.ttf",
        fontSize: 20,
        lineHeight: 26,
    });
const button = (caption, width = 150) =>
    new Element("button", {
        text: caption,
        accessibleName: caption,
        width,
        height: 36,
    });
const status = text("Actions: 0");
const input = new Element("entry", {
    text: "gateway",
    accessibleName: "Service name",
    width: 260,
    height: 36,
});
const run = button("Run service");
const settings = button("Settings");
const services = button("Services");
const choose = button("Choose folder");
const scroll = button("Scroll log");
const finish = button("Finish demo");
const enabled = new Element("toggle", {
    text: "Start automatically",
    accessibleName: "Start automatically",
    width: 280,
    height: 36,
    checked: false,
});
const folderLabel = text("Workspace: none", 56);
const logText = text("Waiting for child stdout", 780);
const log = new Element(
    "column",
    {
        height: 160,
        width: "fill",
        scroll: true,
        clip: true,
        padding: 8,
        background: "#edf3fa",
        radius: 8,
    },
    [logText],
);
const art = new Element("drawing", {
    height: 64,
    width: "fill",
    commands: [
        {
            op: "fillRect",
            x: 8,
            y: 8,
            width: 180,
            height: 32,
            radius: 6,
            color: "#2367bd",
        },
        { op: "circle", x: 220, y: 24, radius: 16, color: "#e68c32" },
        {
            op: "line",
            x1: 8,
            y1: 52,
            x2: 280,
            y2: 52,
            lineWidth: 2,
            color: "#203047",
        },
    ],
});
const servicePage = new Element("column", { gap: 6, width: "fill" }, [
    text("Services: gateway / scheduler / backup"),
    new Element("row", { gap: 8, height: 36 }, [input, run]),
    log,
    scroll,
    art,
]);
const settingsPage = new Element("column", { gap: 10, width: "fill" }, [
    text("Settings · Ctrl+S changes page · Ctrl+L scrolls the log"),
    enabled,
    choose,
    folderLabel,
]);
const page = new Element("column", { width: "fill", height: "fill" }, [
    servicePage,
]);
const root = new Element(
    "column",
    {
        padding: 16,
        gap: 8,
        align: "stretch",
        background: "#ffffff",
    },
    [
        new Element("row", { gap: 12, height: 48 }, [
            new Element("image", {
                src: "gui-assets/pixels.png",
                width: 40,
                height: 40,
                imageFit: "contain",
            }),
            text("Nona native service console", 40),
        ]),
        new Element("row", { gap: 8, height: 36 }, [
            services,
            settings,
            finish,
        ]),
        status,
        page,
    ],
);
function guard(element, type, listener) {
    element.on(type, (event) => {
        if (disposed || element.disposed) {
            late++;
            trace("late-control", { id: element.id });
            return;
        }
        trace(type, {
            name: element.properties.accessibleName || element.properties.text,
            keyval: event.keyval,
            text: event.text,
            checked: event.checked,
        });
        listener(event);
    });
}
function navigate(next) {
    screen = next;
    page.setChildren([next === "services" ? servicePage : settingsPage]);
    trace("screen", { screen });
}
function activate() {
    actions++;
    status.update({
        text: "Actions: " + actions + " · " + input.properties.text,
    });
    trace("state", { actions, text: status.properties.text });
}
function scrollLog() {
    scrolling = scrolling ? 0 : 104;
    log.update({ scrollY: scrolling });
    trace("scroll", { offset: scrolling, bounds: log.bounds });
}
const window = new Window({
    title: "Nona desktop acceptance",
    width: 760,
    height: 650,
    onEvent(event) {
        trace(event.type, event);
        if (event.type === "close") {
            // The old session is already detached; retained controls reopen safely.
            session++;
            setTimeout(() => {
                window.open();
                trace("reopen");
            }, 100);
        }
    },
});
guard(run, "activate", activate);
guard(run, "pointerdown", () => {});
guard(run, "pointerup", () => {});
guard(input, "input", () => {});
for (const element of [input, run, settings, services, enabled]) {
    guard(element, "focus", () => {});
    guard(element, "keydown", () => {});
}
guard(settings, "activate", () => navigate("settings"));
guard(services, "activate", () => navigate("services"));
guard(scroll, "activate", scrollLog);
guard(enabled, "change", (event) => {
    status.update({ text: "Autostart: " + event.checked });
    trace("toggle-state", {
        checked: event.checked,
        text: status.properties.text,
    });
});
guard(choose, "activate", () => {
    const request = ++folderCount;
    trace("chooser-open", { request });
    const before = { ticks, jobs, lines };
    setTimeout(
        () =>
            trace("chooser-progress", {
                request,
                progress:
                    ticks > before.ticks &&
                    jobs > before.jobs &&
                    lines > before.lines,
            }),
        250,
    );
    window
        .chooseFolder({
            title: "Nona workspace",
            initialFolder: process.env.NONA_GUI_FOLDER || "/tmp",
        })
        .then((folder) => {
            if (!disposed)
                folderLabel.update({
                    text: "Workspace: " + (folder || "cancelled"),
                });
            trace("chooser-result", { request, folder });
            const after = { ticks, jobs, lines };
            setTimeout(
                () =>
                    trace("chooser-after", {
                        request,
                        progress:
                            ticks > after.ticks &&
                            jobs > after.jobs &&
                            lines > after.lines,
                    }),
                250,
            );
        });
    if (request === 4 && process.env.NONA_GUI_ACCEPTANCE === "1")
        setTimeout(finishDemo, 500);
});
window.addShortcut(115, 4, () => {
    trace("shortcut");
    navigate(screen === "services" ? "settings" : "services");
});
window.addShortcut(108, 4, () => {
    trace("scroll-shortcut");
    scrollLog();
});
window.addShortcut(114, 4, () => window.resize(820, 700));
function finishDemo() {
    if (exiting) return;
    exiting = true;
    trace("dispose-pending");
    window.dispose();
    disposed = true;
    const before = { ticks, jobs, lines };
    setTimeout(() => {
        trace("drain", {
            progress:
                ticks > before.ticks &&
                jobs > before.jobs &&
                lines > before.lines,
            late,
            rootDisposed: root.disposed,
            inputDisposed: input.disposed,
        });
        clearInterval(timer);
        clearInterval(observations);
        clearTimeout(deadline);
        child.kill();
        Promise.resolve().then(() => trace("normal-exit"));
    }, 400);
}
guard(finish, "activate", finishDemo);
// A real child owns its stdout pipe; there are no simulated I/O callbacks.
// Python is a demo dependency only, not part of the GUI runtime.
const child = spawn("/usr/bin/python3", [
    "-u",
    "-c",
    "import time\nfor i in range(900):\n print('service stdout %d' % i, flush=True)\n time.sleep(0.1)",
]);
let logs = [];
child.stdout.on("data", (chunk) => {
    lines++;
    logs.push(String(chunk).trim());
    if (logs.length > 28) logs.shift();
    trace("stdout", { disposed });
    if (!disposed) logText.update({ text: logs.join("\n") });
});
child.on("error", (error) => {
    trace("child-error", { message: error.message });
    process.exitCode = 1;
    finishDemo();
});
child.on("close", () => trace("child-reaped"));
const timer = setInterval(() => {
    ticks++;
    trace("timer", { disposed });
    Promise.resolve().then(() => {
        jobs++;
        trace("promise", { disposed });
    });
}, 100);
const observations = setInterval(() => {
    if (window.isOpen)
        trace("surface", {
            ...window.inspectSurface(),
            bounds: {
                input: input.bounds,
                drawing: art.bounds,
                log: log.bounds,
            },
        });
}, 150);
const deadline = setTimeout(() => {
    trace("deadline");
    process.exitCode = 91;
    finishDemo();
}, 80000);
window.setRoot(root).open();
trace("ready", { child: child.pid });
