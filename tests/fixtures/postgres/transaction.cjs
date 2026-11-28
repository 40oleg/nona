const { Client } = require("pg");
const { config, fail } = require("./config.cjs");
const client = new Client(config());
(async function () {
    try {
        await client.connect();
        const text = "Привет, PostgreSQL! Ёжик — кириллица";
        const selected = await client.query("SELECT $1::text AS value", [text]);
        if (selected.rows.length !== 1 || selected.rows[0].value !== text)
            throw new Error("Cyrillic parameter round trip mismatch");
        console.log("PASS select Cyrillic");
        // The table must survive ROLLBACK, so create it before BEGIN.
        await client.query("CREATE TEMP TABLE nona_tx (value text)");
        await client.query("BEGIN");
        await client.query("INSERT INTO nona_tx VALUES ($1)", [text]);
        const inside = await client.query("SELECT value FROM nona_tx");
        if (inside.rows.length !== 1 || inside.rows[0].value !== text)
            throw new Error("insert not visible on transaction connection");
        console.log("PASS transaction insert visible");
        await client.query("ROLLBACK");
        const after = await client.query("SELECT value FROM nona_tx");
        if (after.rows.length !== 0) throw new Error("rollback retained row");
        console.log("PASS rollback row absent");
    } finally {
        await client.end();
    }
})().catch(fail);
