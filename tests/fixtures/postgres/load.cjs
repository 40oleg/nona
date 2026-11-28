// MIT; this fixture loads the actual installed packages, not a pg equivalent.
const dns = require("dns");
const pg = require("pg");
const copy = require("pg-copy-streams");
if (
    typeof dns.lookup !== "function" ||
    typeof pg.Client !== "function" ||
    typeof copy.from !== "function"
)
    throw new Error("package exports missing");
console.log("PASS load dns pg.Client pg-copy-streams.from");
