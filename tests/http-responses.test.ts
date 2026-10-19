import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

// The responses of the benchmark server (bench/http/server.mjs) read from a
// raw socket, byte for byte, compared with Node.js: status line, header
// order and casing, framing (Content-Length vs chunked), keep-alive and
// close handling. The Date header's value is replaced by a placeholder; the
// program prints nothing else that depends on the machine (#403).
const program = String.raw`import http from 'node:http';
import net from 'node:net';
const big = 'x'.repeat(65536);
const user = { id: 42, name: 'Ada Lovelace', email: 'ada@example.com', roles: ['admin', 'dev'], active: true };
const server = http.createServer((req, res) => {
    const url = req.url;
    if (url === '/') {
        res.setHeader('Content-Type', 'text/plain');
        res.end('Hello, World!');
    } else if (url === '/json') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(user));
    } else if (url === '/headers') {
        const h = req.headers;
        const n = h['user-agent'].length + h.accept.length + h['accept-language'].length +
            h['accept-encoding'].length + h['x-request-id'].length + h['x-forwarded-for'].length +
            h['x-trace'].length + h.referer.length + h['cache-control'].length + h['if-none-match'].length;
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Request-Id', h['x-request-id']);
        res.setHeader('X-Powered-By', 'bench');
        res.setHeader('ETag', '"' + n + '"');
        res.end('headers ' + n);
    } else if (url === '/big') {
        res.setHeader('Content-Type', 'text/plain');
        res.end(big);
    } else if (url === '/upload') {
        let n = 0;
        req.on('data', (c) => { n += c.length; });
        req.on('end', () => { res.end('got ' + n); });
    } else if (url === '/chunked') {
        res.setHeader('Content-Type', 'text/plain');
        res.write('part one, ');
        res.write(Buffer.from('part two, '));
        res.end('done');
    } else if (url === '/head') {
        res.writeHead(201, { 'X-Head': 'yes', 'Content-Length': '7' });
        res.end('created');
    } else if (url === '/unicode') {
        res.end('héllo ☃ 😀');
    } else if (url === '/empty') {
        res.end();
    } else if (url === '/nocontent') {
        res.statusCode = 204;
        res.end('ignored');
    } else if (url === '/reason') {
        res.statusMessage = 'Custom Reason';
        res.statusCode = 299;
        res.end('ok');
    } else {
        res.statusCode = 404;
        res.end();
    }
});
const extra = 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36\r\n' +
    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\n' +
    'Accept-Language: en-US,en;q=0.5\r\nAccept-Encoding: gzip, deflate, br\r\n' +
    'X-Request-Id: 7f3c2a1e-9b4d-4c8e-a1f2-3d5e6f708192\r\nX-Forwarded-For: 203.0.113.42, 198.51.100.17\r\n' +
    'X-Trace: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01\r\nReferer: https://example.com/products/42?ref=home\r\n' +
    'Cache-Control: max-age=0\r\nIf-None-Match: "5d8c72a5edda8d6a:0"\r\n';
const body16k = 'x'.repeat(16384);
// [label, request text, response count expected on the connection]
const cases = [
    ['hello x2 (keep-alive, pipelined)', 'GET / HTTP/1.1\r\nHost: localhost\r\n\r\nGET / HTTP/1.1\r\nHost: localhost\r\n\r\n', 2],
    ['json', 'GET /json HTTP/1.1\r\nHost: localhost\r\n\r\n', 1],
    ['headers', 'GET /headers HTTP/1.1\r\nHost: localhost\r\n' + extra + '\r\n', 1],
    ['close', 'GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n', 1],
    ['big64k', 'GET /big HTTP/1.1\r\nHost: localhost\r\n\r\n', 1],
    ['upload16k', 'POST /upload HTTP/1.1\r\nHost: localhost\r\nContent-Length: 16384\r\n\r\n' + body16k, 1],
    ['chunked', 'GET /chunked HTTP/1.1\r\nHost: localhost\r\n\r\n', 1],
    ['writeHead', 'GET /head HTTP/1.1\r\nHost: localhost\r\n\r\n', 1],
    ['unicode', 'GET /unicode HTTP/1.1\r\nHost: localhost\r\n\r\n', 1],
    ['empty', 'GET /empty HTTP/1.1\r\nHost: localhost\r\n\r\n', 1],
    ['204', 'GET /nocontent HTTP/1.1\r\nHost: localhost\r\n\r\n', 1],
    ['reason', 'GET /reason HTTP/1.1\r\nHost: localhost\r\n\r\n', 1],
    ['404', 'GET /missing HTTP/1.1\r\nHost: localhost\r\n\r\n', 1],
    ['HEAD', 'HEAD / HTTP/1.1\r\nHost: localhost\r\n\r\n', 1],
    ['HTTP/1.0', 'GET / HTTP/1.0\r\n\r\n', 1],
    ['no Host', 'GET / HTTP/1.1\r\n\r\n', 1],
    ['bad request', 'GARBAGE\r\n\r\n', 1],
];
function responses(text) {
    // Counts complete responses in the text (Content-Length or chunked framing, or none).
    let count = 0, at = 0;
    for (;;) {
        const head = text.indexOf('\r\n\r\n', at);
        if (head < 0) return count;
        const headText = text.slice(at, head);
        const length = /\r\ncontent-length: (\d+)/i.exec(headText);
        const status = /^HTTP\/1\.[01] (\d+)/.exec(headText);
        const noBody = /^HEAD /.test(cases[current][1]) || (status && (status[1] === '204' || status[1] === '304'));
        let end;
        if (noBody) end = head + 4;
        else if (length) end = head + 4 + Number(length[1]);
        else if (/\r\ntransfer-encoding: chunked/i.test(headText)) {
            const terminator = text.indexOf('\r\n0\r\n\r\n', head + 2);
            if (terminator < 0) return count;
            end = terminator + 7;
        } else end = head + 4;
        if (text.length < end) return count;
        count++;
        at = end;
    }
}
let current = 0;
function run(port) {
    if (current === cases.length) { server.close(); return; }
    const [label, request, expected] = cases[current];
    const socket = net.connect(port, '127.0.0.1');
    let received = '';
    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        socket.destroy();
        const shown = received.replace(/^Date: .*$/gm, 'Date: <date>').replace(/x{64}/g, '<64x>');
        console.log('== ' + label + ' (' + Buffer.byteLength(received, 'latin1') + ' bytes)');
        console.log(JSON.stringify(shown));
        current++;
        run(port);
    };
    socket.setEncoding('latin1');
    socket.on('connect', () => socket.write(request, 'latin1'));
    socket.on('data', (chunk) => { received += chunk; if (responses(received) >= expected) finish(); });
    socket.on('end', finish);
    socket.on('close', finish);
    socket.on('error', (error) => { console.log('socket error', error.code); finish(); });
}
server.listen(0, '127.0.0.1', () => run(server.address().port));
`;

test("node:http: the benchmark server's responses are byte-identical to Node's on a raw socket", () => {
    const { native, oracle } = runModulesOnHost(
        { "main.mjs": program },
        "main.mjs",
        { gcStress: false },
    );
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr);
    assert.ok(oracle.includes("== hello x2"));
    assert.ok(oracle.includes("== bad request"));
    assert.equal(native.stdout, oracle);
});
