const { Client } = require("pg");
const { config, fail } = require("./config.cjs");
const client = new Client(config(process.argv[2]));
(async function () {
    try {
        await client.connect();
        const result = await client.query("SELECT 1 AS value");
        if (result.rows.length !== 1 || result.rows[0].value !== 1)
            throw new Error("connection query mismatch");
        console.log("PASS connect");
    } finally {
        await client.end();
    }
})().catch(fail);
