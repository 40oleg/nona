const { Client } = require("pg");
const { lookup } = require("dns");
const { config, fail } = require("./config.cjs");
const client = new Client(config(process.argv[2]));
(async function () {
    try {
        await new Promise((resolve, reject) => {
            lookup(client.host, { family: 4 }, (error, address, family) => {
                if (error) return reject(error);
                if (family !== 4 || typeof address !== "string")
                    return reject(new Error("hostname lookup mismatch"));
                resolve();
            });
        });
        await client.connect();
        const result = await client.query("SELECT 1 AS value");
        if (result.rows.length !== 1 || result.rows[0].value !== 1)
            throw new Error("connection query mismatch");
        console.log("PASS connect");
    } finally {
        await client.end();
    }
})().catch(fail);
