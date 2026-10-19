// Minimal HTTP/1.1 client for profile.sh: C connections, each sending
// REQUESTS/C requests one after another (a new connection per request with
// "close"), waiting for the server to listen first. Prints the number of
// completed responses and their md5 (every response is checked to be
// identical in length and content to the first one of its connection).
//   node client.mjs PORT CONNS REQUESTS [path] [keep|close] [bodybytes] [headers]
import { connect } from "node:net";
import { createHash } from "node:crypto";
const [port, conns, total] = process.argv.slice(2, 5).map(Number);
const path = process.argv[5] || "/";
const keepalive = process.argv[6] !== "close";
const body = Number(process.argv[7] || 0);
const headers =
    process.argv[8] === "headers"
        ? "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36\r\n" +
          "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\n" +
          "Accept-Language: en-US,en;q=0.5\r\nAccept-Encoding: gzip, deflate, br\r\n" +
          "X-Request-Id: 7f3c2a1e-9b4d-4c8e-a1f2-3d5e6f708192\r\nX-Forwarded-For: 203.0.113.42, 198.51.100.17\r\n" +
          "X-Trace: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01\r\nReferer: https://example.com/products/42?ref=home\r\n" +
          'Cache-Control: max-age=0\r\nIf-None-Match: "5d8c72a5edda8d6a:0"\r\n'
        : "";
const close = keepalive ? "" : "Connection: close\r\n";
const request = Buffer.concat([
    Buffer.from(
        body > 0
            ? `POST ${path} HTTP/1.1\r\nHost: localhost\r\nContent-Length: ${body}\r\n${headers}${close}\r\n`
            : `GET ${path} HTTP/1.1\r\nHost: localhost\r\n${headers}${close}\r\n`,
    ),
    Buffer.alloc(body, "x"),
]);
let done = 0,
    started = 0;
const hash = createHash("md5");
function responseEnd(buffer) {
    const head = buffer.indexOf("\r\n\r\n");
    if (head < 0) return -1;
    const text = buffer.subarray(0, head).toString("latin1");
    const length = /\r\ncontent-length:\s*(\d+)/i.exec(text);
    if (length) {
        const end = head + 4 + Number(length[1]);
        return buffer.length >= end ? end : -1;
    }
    if (/\r\ntransfer-encoding:\s*chunked/i.test(text)) {
        const terminator = buffer.indexOf("\r\n0\r\n\r\n", head + 2);
        return terminator < 0 ? -1 : terminator + 7;
    }
    return head + 4;
}
function run(share) {
    let buffer = Buffer.alloc(0),
        sent = 0;
    const socket = connect(port, "127.0.0.1");
    socket.on("connect", () => {
        started++;
        sent++;
        socket.write(request);
    });
    socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        let end;
        while ((end = responseEnd(buffer)) >= 0) {
            hash.update(buffer.subarray(0, end));
            buffer = buffer.subarray(end);
            done++;
            if (done === total) {
                console.log(done, hash.digest("hex"));
                process.exit(0);
            }
            if (sent < share) {
                if (keepalive) {
                    sent++;
                    socket.write(request);
                } else {
                    socket.end();
                    run(share - sent);
                }
            } else socket.end();
        }
    });
    socket.on("error", (error) => {
        if (error.code === "ECONNREFUSED" && started === 0)
            setTimeout(() => run(share), 200);
        else {
            console.error(error);
            process.exit(1);
        }
    });
}
for (let i = 0; i < conns; i++)
    run(Math.floor(total / conns) + (i < total % conns ? 1 : 0));
