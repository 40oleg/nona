import { constants } from "node:fs";
import { createConnection } from "node:net";

// Oracle-only preload; keep Node's isolation policy out of the SQL workload.
globalThis.fetch = undefined;
if (!process.permission || process.permission.has("net")) {
    throw new Error(
        "Run this oracle with --permission and without --allow-net",
    );
}
// Emscripten needs only the internal constants binding. Node's permission model
// disables binding entirely; supply the identical public filesystem constants.
process.binding = (name) => {
    if (name === "constants") return { fs: constants };
    throw new Error(`Unexpected internal binding: ${name}`);
};
await new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port: 9 });
    socket.once("error", (error) => {
        socket.destroy();
        if (error.code === "ERR_ACCESS_DENIED") resolve();
        else reject(error);
    });
    socket.once("connect", () => {
        socket.destroy();
        reject(new Error("Network permission unexpectedly granted"));
    });
});
