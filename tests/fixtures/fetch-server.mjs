// Redistributable local witness for #666. No external service or port checkout.
import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";

const sockets = new Set();
const servers = [];
const json = (res, value, code = 200) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(value));
};
function handler(req, res) {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/delayed") {
        const timer = setTimeout(() => res.end("late"), 300);
        res.on("close", () => clearTimeout(timer));
        return;
    }
    if (url.pathname === "/stall") {
        res.writeHead(200);
        res.write("first");
        return;
    }
    if (url.pathname === "/slow-body") {
        res.writeHead(200);
        res.write("first");
        const timer = setTimeout(() => res.end("second"), 100);
        res.on("close", () => clearTimeout(timer));
        return;
    }
    if (url.pathname === "/disconnect") {
        res.writeHead(200, { "content-length": "10000" });
        res.write("short");
        setTimeout(() => res.destroy(), 20);
        return;
    }
    if (url.pathname === "/large") {
        let remaining = Number(url.searchParams.get("bytes") || 131072);
        const chunk = Buffer.alloc(4096, 120);
        function write() {
            while (remaining > 0) {
                const size = Math.min(chunk.length, remaining);
                remaining -= size;
                if (!res.write(chunk.subarray(0, size))) {
                    res.once("drain", write);
                    return;
                }
            }
            res.end();
        }
        write();
        return;
    }
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
        const body = Buffer.concat(chunks);
        if (url.pathname.startsWith("/redirect/")) {
            res.writeHead(Number(url.pathname.split("/")[2]), {
                location: url.searchParams.get("to") || "/echo",
            });
            // A redirect must be released without waiting for its entire body.
            res.write("redirect");
            const timer = setTimeout(() => res.end("tail"), 50);
            res.on("close", () => clearTimeout(timer));
            return;
        }
        if (url.pathname === "/loop") {
            res.writeHead(302, { location: "/loop" });
            res.end();
        } else if (url.pathname === "/json") {
            const expected = Buffer.from(
                JSON.stringify({ message: "Привет мир" }),
            );
            const valid =
                req.method === "POST" &&
                body.equals(expected) &&
                req.headers.authorization === "Bearer local" &&
                req.headers["x-custom"] === "one, two";
            res.writeHead(valid ? 201 : 400, {
                "content-type": "application/json",
                "x-result": "yes",
            });
            const bytes = Buffer.from(
                JSON.stringify({ message: "Здравствуй, мир", valid }),
            );
            // Split inside a Cyrillic code point, rather than between characters.
            res.write(bytes.subarray(0, 13));
            setTimeout(() => res.end(bytes.subarray(13)), 5);
        } else if (url.pathname === "/auth") {
            json(
                res,
                {
                    message:
                        req.headers.authorization === "Bearer renewed"
                            ? "Привет"
                            : "Войдите",
                },
                req.headers.authorization === "Bearer renewed" ? 200 : 401,
            );
        } else if (url.pathname === "/event") {
            json(res, {
                valid: body.equals(Buffer.from([255, 216, 0, 128, 255, 217])),
            });
        } else if (url.pathname === "/empty") {
            res.writeHead(204);
            res.end();
        } else if (url.pathname === "/echo") {
            json(res, {
                method: req.method,
                body: body.toString("hex"),
                authorization: req.headers.authorization || "",
                custom: req.headers["x-custom"] || "",
                type: req.headers["content-type"] || "",
                encoding: req.headers["content-encoding"] || "",
                length: req.headers["content-length"] || "",
            });
        } else json(res, { value: 42, message: "метрики" });
    });
}
async function listen(server) {
    servers.push(server);
    server.on("connection", (socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
    });
    server.on("tlsClientError", () => {});
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return server.address().port;
}
const ports = {
    http: await listen(http.createServer(handler)),
    other: await listen(http.createServer(handler)),
    https: await listen(
        https.createServer(
            {
                key: readFileSync(new URL("./tls/ec-key.pem", import.meta.url)),
                cert: readFileSync(
                    new URL("./tls/ec-cert.pem", import.meta.url),
                ),
            },
            handler,
        ),
    ),
};
console.log(JSON.stringify(ports));
process.stdin.resume();
process.stdin.on("end", () => {
    for (const socket of sockets) socket.destroy();
    for (const server of servers) server.close();
});
