import express from "express";
import http from "node:http";
const app = express();
app.use(express.json());
app.post("/sum", (request, response) => {
    response.status(201).json({ sum: request.body.a + request.body.b });
});
const server = app.listen(0, "127.0.0.1", () => {
    const request = http.request(
        {
            host: "127.0.0.1",
            port: server.address().port,
            path: "/sum",
            method: "POST",
            headers: { "content-type": "application/json" },
        },
        (response) => {
            let body = "";
            response.on("data", (chunk) => {
                body += chunk;
            });
            response.on("end", () => {
                console.log(
                    "server",
                    response.statusCode,
                    JSON.parse(body).sum,
                );
                server.close();
            });
        },
    );
    request.on("error", (error) => {
        console.error(error);
        server.close();
        process.exitCode = 1;
    });
    request.end('{"a":2,"b":3}');
});
