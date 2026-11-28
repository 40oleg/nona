const { Client } = require("pg");
const { config, fail } = require("./config.cjs");
const client = new Client(config("nona-postgres-665.invalid."));
(async function () {
    let observed = false;
    try {
        await client.connect();
    } catch (error) {
        if (!(error instanceof Error) || error.code !== "ENOTFOUND")
            throw error;
        observed = true;
        console.log("PASS negative ENOTFOUND");
    } finally {
        await client.end();
    }
    if (!observed) throw new Error("unknown hostname unexpectedly connected");
})().catch(fail);
