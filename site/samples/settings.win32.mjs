import { SettingsWindow } from "nona:win32/settings";

let saved = { checked: false, choice: 0 };
let ticks = 0;
const settings = new SettingsWindow({
    title: "Nona settings — closes after 60 seconds",
    checkboxLabel: "Enable background work",
    choices: ["One", "Two", "Three", "Four", "Five", "Six", "Seven"],
    onEvent(event) {
        if (event.type === "save") {
            saved = { checked: event.checked, choice: event.choice };
        }
        // A referenced timer keeps background work alive while closed.
        // Cancellation and the title-bar close button discard the draft.
        setTimeout(() => settings.open(saved), 1000);
    },
});
settings.open(saved);
const background = setInterval(() => {
    ticks++;
    settings.setStatus("Background ticks: " + ticks);
}, 250);
setTimeout(() => {
    settings.dispose();
    clearInterval(background);
    process.exit(0);
}, 60000);
