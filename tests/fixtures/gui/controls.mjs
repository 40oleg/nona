// Stage 3 input/chooser probe. The complete application belongs to stage 4.
import { Window, Element } from "nona:gui";
import { spawn } from "node:child_process";

let ticks = 0,
    jobs = 0,
    lines = 0,
    selections = 0,
    finished = false;
const entry = new Element("entry", {
    text: "initial",
    accessibleName: "Service name",
    width: 300,
});
const run = new Element("button", { text: "Run service", width: 180 });
const toggle = new Element("toggle", { text: "Enabled", width: 180 });
const choose = new Element("button", { text: "Choose folder", width: 180 });
const finish = new Element("button", { text: "Finish probe", width: 180 });
const label = new Element("text", { text: "Background progress", height: 24 });
const window = new Window({
    title: "Nona controls probe",
    width: 400,
    height: 340,
});
window
    .setRoot(
        new Element("column", { padding: 12, gap: 8 }, [
            entry,
            run,
            toggle,
            choose,
            finish,
            label,
        ]),
    )
    .open();
function log(...args) {
    console.log(...args);
}
entry.on("input", (e) => log("input", e.text));
for (const control of [entry, run, toggle, choose, finish]) {
    control.on("focus", () => log("focus", control.kind));
    control.on("keydown", (e) => log("keydown", e.keyval, e.modifiers));
    control.on("pointerdown", (e) => log("pointer", control.kind, e.button));
}
run.on("activate", () => log("activated"));
toggle.on("change", () => log("checked", toggle.properties.checked));
window.addShortcut(115, 4, () => log("shortcut")); // Control+s, consumed at capture
const child = spawn(
    "/bin/sh",
    [
        "-c",
        "i=0; while [ $i -lt 240 ]; do printf 'tick\\n'; i=$((i+1)); sleep 0.05; done",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
);
child.stdout.on("data", () => {
    lines++;
});
child.on("error", (e) => {
    console.error(e.message);
    stop(92);
});
const timer = setInterval(() => {
    ticks++;
    Promise.resolve().then(() => {
        jobs++;
    });
    if (!finished) label.update({ text: "Background " + ticks });
}, 50);
choose.on("activate", () => {
    const index = ++selections,
        before = lines;
    log("choosing", index);
    window
        .chooseFolder({
            title: "Nona folder selection",
            initialFolder: process.env.NONA_GUI_FOLDER || "/tmp",
        })
        .then(
            (path) => {
                log("folder", index, path === null ? "null" : path);
                setTimeout(
                    () =>
                        log(
                            "after-folder",
                            index,
                            lines > before,
                            ticks > 0,
                            jobs > 0,
                        ),
                    100,
                );
            },
            (error) => {
                console.error(error.message);
                stop(93);
            },
        );
    if (index === 3)
        setTimeout(() => {
            window.close();
            window.open();
            log("reopened");
        }, 100);
});
finish.on("activate", () => {
    log("progress", ticks > 0, jobs > 0, lines > 0);
    stop(0);
});
function stop(status) {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    clearInterval(timer);
    window.dispose();
    child.kill();
    if (status) process.exit(status);
    Promise.resolve().then(() => log("normal exit"));
}
const deadline = setTimeout(() => {
    console.error("controls deadline");
    stop(91);
}, 15000);
log(
    "ready",
    process.env.GDK_BACKEND || "default",
    process.env.GDK_SCALE || "default",
);
