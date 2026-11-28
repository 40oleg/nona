import { join } from "node:path";
import { localOptions, verifyPackage } from "./local-assets.mjs";
import { payload, requireEqual } from "./payload.mjs";
import { exerciseDatabase } from "./workload.mjs";

const [mode, directory] = process.argv.slice(2);
if (!["select", "write", "reopen"].includes(mode)) {
    throw new Error("Usage: case.mjs select | write PROFILE | reopen PROFILE");
}
if (mode !== "select" && !directory)
    throw new Error("Missing profile directory");
verifyPackage();
const options = await localOptions();
const { PGlite } = await import("@electric-sql/pglite");
const db = await PGlite.create({
    ...options,
    ...(mode === "select" ? {} : { dataDir: join(directory, "pgdata") }),
});
try {
    await exerciseDatabase(db, mode, directory);
} finally {
    await db.close();
}
requireEqual(db.closed, true, "clean close");
console.log(
    JSON.stringify({
        mode,
        select: 1,
        closed: db.closed,
        ...(mode === "select" ? {} : { bytes: payload.length }),
    }),
);
