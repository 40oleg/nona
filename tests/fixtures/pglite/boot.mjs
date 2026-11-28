import { createOfflinePGlite } from "./offline.mjs";
import { exerciseDatabase } from "./workload.mjs";
import { payload } from "./payload.mjs";

// These checks also run inside the standalone native executable.
globalThis.fetch = undefined;
const nodeVersion = process.versions.node;
const binding = process.binding;
try {
    const index = process.versions.node ? 2 : 1;
    const mode = process.argv[index + 1] || "select";
    if (!["select", "write", "reopen"].includes(mode))
        throw new Error("Expected select, write or reopen mode");
    const profile = mode === "select" ? undefined : process.argv[index + 2];
    if (mode !== "select" && !profile)
        throw new Error("Missing profile directory");
    const db = await createOfflinePGlite(process.argv[index], profile);
    try {
        await exerciseDatabase(db, mode, profile);
    } finally {
        await db.close();
    }
    if (!db.closed) throw new Error("PGlite did not close");
    if (process.versions.node !== nodeVersion || process.binding !== binding)
        throw new Error("Offline adapter did not restore process metadata");
    if (typeof globalThis.fetch !== "undefined")
        throw new Error("Offline boot unexpectedly installed fetch");
    console.log(
        mode === "select"
            ? "select=1 closed=true fetch=undefined"
            : `${mode} select=1 bytes=${payload.length} copy=true closed=true fetch=undefined`,
    );
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
