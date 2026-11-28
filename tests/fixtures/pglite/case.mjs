import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { localOptions, verifyPackage } from "./local-assets.mjs";
import { payload, requireBytes, requireEqual, text } from "./payload.mjs";

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
    const selected = await db.query("SELECT 1 AS value");
    requireEqual(selected.rows[0].value, 1, "SELECT 1");
    if (mode === "write") {
        await db.exec(
            "CREATE TABLE fixture (id integer PRIMARY KEY, note text, payload bytea)",
        );
        await db.query("INSERT INTO fixture VALUES ($1, $2, $3)", [
            1,
            text,
            payload,
        ]);
        const copied = await db.query(
            "COPY fixture TO '/dev/blob' WITH (FORMAT binary)",
        );
        const copyBytes = new Uint8Array(await copied.blob.arrayBuffer());
        // PostgreSQL's binary COPY header contains an embedded NUL.
        requireBytes(
            copyBytes.subarray(0, 11),
            new Uint8Array([80, 71, 67, 79, 80, 89, 10, 255, 13, 10, 0]),
            "COPY header",
        );
        writeFileSync(join(directory, "copy.bin"), copyBytes);
    } else if (mode === "reopen") {
        await verifyRow("fixture");
        await db.exec("CREATE TABLE copied (LIKE fixture INCLUDING ALL)");
        const copyBytes = readFileSync(join(directory, "copy.bin"));
        await db.query(
            "COPY copied FROM '/dev/blob' WITH (FORMAT binary)",
            [],
            {
                blob: new Blob([copyBytes]),
            },
        );
        await verifyRow("copied");
        const copied = await db.query(
            "COPY copied TO '/dev/blob' WITH (FORMAT binary)",
        );
        requireBytes(
            new Uint8Array(await copied.blob.arrayBuffer()),
            copyBytes,
            "COPY round trip",
        );
    }
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

async function verifyRow(table) {
    const result = await db.query(
        `SELECT note, payload FROM ${table} WHERE id=1`,
    );
    requireEqual(result.rows.length, 1, `${table} row count`);
    requireEqual(result.rows[0].note, text, `${table} text`);
    requireBytes(result.rows[0].payload, payload, `${table} bytea`);
}
