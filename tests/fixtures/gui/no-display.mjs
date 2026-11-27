import { Window } from "nona:gui";
const window = new Window();
try {
    window.open();
    window.dispose();
    throw new Error("Unexpected display available");
} catch (error) {
    if (!error.message.includes("GTK initialization failed")) throw error;
    window.dispose();
    console.log("expected GUI initialization failure without a display");
}
