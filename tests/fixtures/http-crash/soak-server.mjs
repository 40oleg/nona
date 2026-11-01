import http from "node:http";
// The HTTP soak test server (scripts/http-soak.mjs, #516): a mix of routes
// that a long run under load exercises. The port is the last argument, or
// PORT. Prints "ready <port>" once it listens.
const port =
    Number(process.argv[process.argv.length - 1]) || Number(process.env.PORT);

// A medium JSON document (about 3 KB), built once.
const doc = { generated: "soak", version: 1, items: [], tags: {} };
for (let i = 0; i < 24; i++) {
    doc.items.push({
        id: i,
        name: "item-" + i,
        price: i * 1.25,
        active: i % 3 !== 0,
        sizes: [i, i + 1, i + 2],
        owner: { id: 1000 + i, login: "user" + i },
    });
    doc.tags["tag" + i] = i % 2 === 0;
}
const json = JSON.stringify(doc);

const bigChunk = "b".repeat(65536);
const bigChunks = 16; // 1 MiB in total
const slowChunk = "s".repeat(16384);
const slowChunks = 40; // 640 KiB over about 4 s
const slowInterval = 100;

let requests = 0;
let openSockets = 0;
let totalSockets = 0;
let errors = 0;

function stats() {
    const active =
        typeof process.getActiveResourcesInfo === "function"
            ? process.getActiveResourcesInfo().length
            : null;
    return JSON.stringify({
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        requests,
        openSockets,
        totalSockets,
        errors,
        activeResources: active,
    });
}

function fail(message) {
    throw new Error(message);
}

const server = http.createServer((req, res) => {
    requests++;
    const url = req.url;
    res.on("error", () => {
        errors++;
    });
    req.on("error", () => {
        errors++;
    });
    if (url === "/text") {
        res.setHeader("Content-Type", "text/plain");
        res.end("Hello, soak!");
    } else if (url === "/json") {
        res.setHeader("Content-Type", "application/json");
        res.end(json);
    } else if (url === "/big") {
        // No Content-Length: the body goes out chunked.
        res.setHeader("Content-Type", "text/plain");
        for (let i = 0; i < bigChunks; i++) res.write(bigChunk);
        res.end();
    } else if (url === "/echo" && req.method === "POST") {
        res.setHeader("Content-Type", "application/octet-stream");
        req.pipe(res);
    } else if (url === "/slow") {
        res.setHeader("Content-Type", "text/plain");
        let sent = 0;
        const timer = setInterval(() => {
            if (res.destroyed || res.writableEnded) {
                clearInterval(timer);
                return;
            }
            res.write(slowChunk);
            if (++sent === slowChunks) {
                clearInterval(timer);
                res.end();
            }
        }, slowInterval);
        res.on("close", () => clearInterval(timer));
    } else if (url === "/throw") {
        try {
            fail("deliberate failure");
        } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "text/plain");
            res.end("error: " + error.message);
        }
    } else if (url === "/__stats") {
        res.setHeader("Content-Type", "application/json");
        res.end(stats());
    } else {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain");
        res.end("not found");
    }
});
server.on("connection", (socket) => {
    openSockets++;
    totalSockets++;
    socket.on("error", () => {
        errors++;
    });
    socket.on("close", () => {
        openSockets--;
    });
});
server.on("clientError", (error, socket) => {
    errors++;
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    else socket.destroy();
});
server.on("error", (error) => {
    console.log("server error " + error.message);
});
server.listen(port, "127.0.0.1", () => {
    console.log("ready " + port);
});
