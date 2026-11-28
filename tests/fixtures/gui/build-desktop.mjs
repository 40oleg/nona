// Hosted acceptance builds the identical application with explicit compiler GC
// instrumentation. The documented CLI command remains the normal user build.
import {
    mkdirSync,
    readFileSync,
    writeFileSync,
    cpSync,
    chmodSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { compile } from "../../../dist/src/compiler.js";

const [destination, mode = "off"] = process.argv.slice(2);
if (!destination || !["on", "off"].includes(mode))
    throw new Error("Usage: build-desktop.mjs <output-directory> on|off");
const directory = resolve(destination);
mkdirSync(directory, { recursive: true });
for (const [source, name] of [
    ["site/samples/gui.linux.mjs", "desktop"],
    ["tests/fixtures/gui/no-display.mjs", "no-display"],
]) {
    const result = compile(readFileSync(source, "utf8"), {
        fileName: resolve(source),
        target: "linux-x64",
        gcStress: mode === "on",
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    writeFileSync(join(directory, name), result.image);
    chmodSync(join(directory, name), 0o755);
}
cpSync("site/samples/gui-assets", join(directory, "gui-assets"), {
    recursive: true,
});
writeFileSync(
    join(directory, "compiler.json"),
    JSON.stringify({ target: "linux-x64", gcStress: mode === "on" }),
);
