import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { payload, requireBytes, requireEqual, text } from "./payload.mjs";

// Shared by the independent Node oracle and the compiled native workload.
export async function exerciseDatabase(db, mode, directory) {
    const selected = await db.query("SELECT 1 AS value");
    requireEqual(selected.rows.length, 1, "SELECT row count");
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

        await verifyRow("fixture");
        await copyAndVerify(copyBytes);
    } else if (mode === "reopen") {
        await verifyRow("fixture");
        await verifyRow("copied");
        await verifyCopy(readFileSync(join(directory, "copy.bin")));
    }

    async function copyAndVerify(copyBytes) {
        await db.exec("CREATE TABLE copied (LIKE fixture INCLUDING ALL)");
        await db.query(
            "COPY copied FROM '/dev/blob' WITH (FORMAT binary)",
            [],
            { blob: new Blob([copyBytes]) },
        );
        await verifyRow("copied");
        await verifyCopy(copyBytes);
    }
    async function verifyCopy(copyBytes) {
        const copied = await db.query(
            "COPY copied TO '/dev/blob' WITH (FORMAT binary)",
        );
        requireBytes(
            new Uint8Array(await copied.blob.arrayBuffer()),
            copyBytes,
            "COPY round trip",
        );
    }

    async function verifyRow(table) {
        const result = await db.query(
            `SELECT note, payload FROM ${table} WHERE id=1`,
        );
        requireEqual(result.rows.length, 1, `${table} row count`);
        requireEqual(result.rows[0].note, text, `${table} text`);
        requireBytes(result.rows[0].payload, payload, `${table} bytea`);
    }
}
