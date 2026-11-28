// All probes use explicit TCP/non-TLS settings and a disposable test database.
exports.config = function (host) {
    return {
        host: host || process.env.NONA_PG_HOST || "localhost",
        port: Number(process.env.NONA_PG_PORT || "5432"),
        user: "nona",
        password: "nona-test-only",
        database: "nona",
        ssl: false,
        connectionTimeoutMillis: 3000,
        query_timeout: 5000,
    };
};
exports.fail = function (error) {
    console.error("FAIL", error.stack || error.message || String(error));
    process.exitCode = 1;
};
