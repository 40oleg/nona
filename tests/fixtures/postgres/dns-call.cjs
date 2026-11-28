// Exercise pg's real callback DNS call, not ../pg-dns.cjs's equivalent.
const ConnectionParameters = require("pg/lib/connection-parameters");
const { fail } = require("./config.cjs");
const parameters = new ConnectionParameters({
    host: "127.0.0.1",
    user: "nona",
    database: "nona",
    ssl: false,
});
let returned = false;
parameters.getLibpqConnectionString((error, text) => {
    if (error) return fail(error);
    if (!returned || !text.includes("hostaddr='127.0.0.1'"))
        return fail(new Error("pinned pg DNS callback mismatch"));
    console.log("PASS pinned pg DNS callback");
});
returned = true;
