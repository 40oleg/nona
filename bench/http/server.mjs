import http from "node:http";
// The port is the last argument, or PORT; with REQUESTS=N the server exits
// after N responses (used by profile.sh to count instructions per request).
const port =
    Number(process.argv[process.argv.length - 1]) || Number(process.env.PORT);
const limit = Number(process.env.REQUESTS) || 0;
let served = 0;
const big = "x".repeat(65536);
const user = {
    id: 42,
    name: "Ada Lovelace",
    email: "ada@example.com",
    roles: ["admin", "dev"],
    active: true,
};
const server = http.createServer((req, res) => {
    const url = req.url;
    if (limit && ++served === limit) res.on("finish", () => process.exit(0));
    if (url === "/") {
        res.setHeader("Content-Type", "text/plain");
        res.end("Hello, World!");
    } else if (url === "/json") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(user));
    } else if (url === "/headers") {
        const h = req.headers;
        const n =
            h["user-agent"].length +
            h.accept.length +
            h["accept-language"].length +
            h["accept-encoding"].length +
            h["x-request-id"].length +
            h["x-forwarded-for"].length +
            h["x-trace"].length +
            h.referer.length +
            h["cache-control"].length +
            h["if-none-match"].length;
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("X-Request-Id", h["x-request-id"]);
        res.setHeader("X-Powered-By", "bench");
        res.setHeader("ETag", '"' + n + '"');
        res.end("headers " + n);
    } else if (url === "/big") {
        res.setHeader("Content-Type", "text/plain");
        res.end(big);
    } else if (url === "/upload") {
        let n = 0;
        req.on("data", (c) => {
            n += c.length;
        });
        req.on("end", () => {
            res.end("got " + n);
        });
    } else {
        res.statusCode = 404;
        res.end();
    }
});
server.listen(port, "127.0.0.1");
