import { createOfflinePGlite } from "./offline.mjs";

// These checks also run inside the standalone native executable.
globalThis.fetch = undefined;
const nodeVersion = process.versions.node;
const binding = process.binding;
try {
    const db = await createOfflinePGlite(
        process.argv[process.versions.node ? 2 : 1],
    );
    try {
        const result = await db.query("SELECT 1 AS value");
        if (result.rows.length !== 1 || result.rows[0].value !== 1)
            throw new Error("SELECT 1 returned an unexpected result");
    } finally {
        await db.close();
    }
    if (!db.closed) throw new Error("PGlite did not close");
    if (process.versions.node !== nodeVersion || process.binding !== binding)
        throw new Error("Offline adapter did not restore process metadata");
    if (typeof globalThis.fetch !== "undefined")
        throw new Error("Offline boot unexpectedly installed fetch");
    console.log("select=1 closed=true fetch=undefined");
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
