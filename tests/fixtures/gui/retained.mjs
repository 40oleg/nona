// Rendering/lifetime fixture only; controls and desktop acceptance are later stages.
import { Window, Element } from "nona:gui";
const label = new Element("text", {
    text: "Nona retained scene",
    font: "Abel-Regular.ttf",
    fontFamily: "Abel",
    fontSize: 20,
    lineHeight: 28,
    fontWeight: 400,
    height: 32,
});
const art = new Element("drawing", {
    width: "fill",
    height: 80,
    commands: [
        {
            op: "fillRect",
            x: 2,
            y: 3,
            width: 60,
            height: 40,
            radius: 8,
            color: "#2266cc",
        },
        { op: "circle", x: 90, y: 30, radius: 18, color: "#ee7733" },
        {
            op: "line",
            x1: 4,
            y1: 65,
            x2: 150,
            y2: 65,
            lineWidth: 2,
            color: "#224422",
        },
    ],
});
const image = new Element("image", {
    width: 32,
    height: 32,
    src: "pixels.png",
    imageFit: "contain",
});
const root = new Element(
    "column",
    {
        padding: 12,
        gap: 6,
        align: "stretch",
        scroll: true,
        background: "#ffffff",
        borderColor: "#334455",
        borderWidth: 2,
        radius: 12,
    },
    [label, image, art],
);
let resized = false;
const window = new Window({
    title: "Nona retained fixture",
    width: 240,
    height: 200,
    onEvent(event) {
        if (event.type === "resize" && !resized) {
            resized = true;
            label.update({ text: "Updated retained scene" });
        }
    },
});
window.setRoot(root).open();
setTimeout(() => {
    root.update({ scrollY: 8 });
    window.resize(280, 220);
}, 30);
setTimeout(() => {
    image.dispose();
    window.close();
    window.open();
}, 80);
setTimeout(() => {
    window.dispose();
    console.log(
        "retained",
        root.disposed,
        label.disposed,
        art.disposed,
        image.disposed,
    );
}, 160);
