import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Three chunked responses exercise reuse after queued socket writes. The final
// pair is pipelined: the second response ends before the first one is sent.
const source = String.raw`
const http = process.getBuiltinModule('node:http');
const net = process.getBuiltinModule('node:net');
const Buffer = process.getBuiltinModule('node:buffer').Buffer;
const native = typeof process.versions.nona === 'string';
const chunkSize = 65536;
const bodySize = 16 * chunkSize;
const responses = [];
const connections = [];
const bytes = [];
const hashes = [];
let client = null;
let firstSocket = null;
let pendingFollowup = null;
let done = false;
let closing = false;
let ended = false;
let closed = false;
let received = Buffer.alloc(0);
let current = 0;
let state = 'header';
let remaining = 0;
let offset = 0;
let hash = 0;
let terminators = 0;
const timer = setTimeout(() => fail('response timeout at ' + current +
    ' state ' + state + ' bytes ' + offset + ' finishes ' +
    responses.map(record => record.finishes).join(',')), 20000);
function fail(message) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    console.log('FAIL', message);
    process.exitCode = 1;
    if (client !== null) client.destroy();
    for (const socket of connections) socket.destroy();
    if (server.listening) server.close();
}
function failError(context, error) {
    fail(context + ': ' + error.name + ' [' + error.code + '] ' + error.message);
}
process.on('uncaughtException', error => failError('uncaught exception', error));
process.on('unhandledRejection', error => failError('unhandled rejection', error));
function expectedByte(index, position) {
    if (index < 3) {
        const i = position % chunkSize;
        return (i * 17 + (i >> 8) + index * 31) & 255;
    }
    return ('followup-' + index).charCodeAt(position);
}
function request(index, close) {
    return 'GET /' + index + ' HTTP/1.1\r\nHost: localhost\r\n' +
        (close ? 'Connection: close\r\n' : '') + '\r\n';
}
function finish() {
    if (done || closing || !closed || responses.length !== 5) return;
    for (const record of responses) {
        if (record.finishes !== 1 || !record.ownerChecked) return;
        if (!record.response.writableFinished) {
            fail('writableFinished after response ' + record.index);
            return;
        }
    }
    if (current !== 5 || state !== 'header' || received.length !== 0 || !ended ||
        terminators !== 3) {
        fail('incomplete response stream');
        return;
    }
    if (connections.length !== 1) {
        fail('connection was not reused');
        return;
    }
    closing = true;
    server.close(() => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        console.log('bytes', bytes.join(','));
        console.log('hashes', hashes.join(','));
        console.log('chunked', terminators, 'terminators');
        console.log('finish', responses.map(record => record.finishes).join(','));
        console.log('one connection, queued followups, clean close');
    });
}
const server = http.createServer((req, res) => {
    const index = responses.length;
    if (req.url !== '/' + index || index >= 5) {
        fail('unexpected request ' + req.url);
        return;
    }
    if (firstSocket === null) firstSocket = req.socket;
    if (req.socket !== firstSocket) {
        fail('request used another socket');
        return;
    }
    const socket = req.socket;
    const record = { index, response: res, finishes: 0, ownerChecked: false };
    responses.push(record);
    req.on('error', error => failError('request error', error));
    res.on('error', error => failError('response error', error));
    res.on('finish', () => {
        record.finishes++;
        if (record.finishes !== 1 || !res.writableFinished) {
            fail('response finish ' + index);
            return;
        }
        // Ownership may advance to a queued response during finish handling.
        // Node's private ownership details are not part of the oracle contract.
        setImmediate(() => {
            if (native) {
                const owner = socket._httpMessage;
                const laterResponse = responses.some(candidate =>
                    candidate.index > index && candidate.response === owner);
                if (owner !== null && !laterResponse) {
                    fail('socket owner was not cleared or advanced after response ' + index);
                    return;
                }
            }
            record.ownerChecked = true;
            finish();
        });
    });
    res.setHeader('X-Response-Index', String(index));
    if (index >= 3) res.setHeader('Content-Length', '10');
    if (index === 4) res.setHeader('Connection', 'close');
    if (index < 3) {
        const chunk = Buffer.alloc(chunkSize);
        for (let i = 0; i < chunk.length; i++) chunk[i] = expectedByte(index, i);
        // Deliberately do not wait for drain between these synchronous writes.
        for (let i = 0; i < 16; i++) res.write(chunk);
        res.end();
    } else if (index === 3) {
        pendingFollowup = res;
    } else {
        if (native && socket._httpMessage !== pendingFollowup) {
            fail('pipelined response was not queued');
            return;
        }
        res.end('followup-4');
        pendingFollowup.end('followup-3');
    }
});
server.on('connection', socket => {
    connections.push(socket);
    socket.on('error', error => failError('server socket error', error));
});
server.on('error', error => failError('server error', error));
server.on('clientError', error => failError('HTTP parser error', error));
function completeResponse() {
    if (offset !== (current < 3 ? bodySize : 10)) {
        fail('response body length ' + current + ': ' + offset);
        return;
    }
    bytes.push(offset);
    hashes.push(hash);
    current++;
    state = 'header';
    if (current < 3) client.write(request(current, false));
    else if (current === 3) client.write(request(3, false) + request(4, true));
}
function consumeBody(count) {
    for (let i = 0; i < count; i++) {
        const byte = received[i];
        if (byte !== expectedByte(current, offset + i)) {
            fail('response byte ' + current + ':' + (offset + i));
            return;
        }
        hash = (hash * 31 + byte) >>> 0;
    }
    offset += count;
    remaining -= count;
    received = received.subarray(count);
}
server.listen(0, '127.0.0.1', () => {
    client = net.connect(server.address().port, '127.0.0.1');
    client.on('error', error => failError('client error', error));
    client.on('connect', () => client.write(request(0, false)));
    client.on('data', chunk => {
        received = Buffer.concat([received, chunk]);
        while (!done) {
            if (state === 'header') {
                if (current === 5) {
                    if (received.length !== 0) fail('extra response bytes');
                    return;
                }
                const end = received.indexOf('\r\n\r\n');
                if (end < 0) return;
                const header = received.toString('latin1', 0, end);
                const length = /\r\nContent-Length: (\d+)/i.exec(header);
                const index = /\r\nX-Response-Index: (\d+)/i.exec(header);
                const chunked = /\r\nTransfer-Encoding: chunked/i.test(header);
                const close = /\r\nConnection: close/i.test(header);
                const framing = current < 3 ? chunked && !length :
                    !chunked && length && Number(length[1]) === 10;
                if (!header.startsWith('HTTP/1.1 200 ') || !framing || !index ||
                    Number(index[1]) !== current || close !== (current === 4)) {
                    fail('response headers ' + current);
                    return;
                }
                received = received.subarray(end + 4);
                state = current < 3 ? 'chunk-size' : 'body';
                remaining = current < 3 ? 0 : 10;
                offset = 0;
                hash = 0;
            }
            if (state === 'chunk-size') {
                const end = received.indexOf('\r\n');
                if (end < 0) return;
                const size = received.toString('latin1', 0, end);
                if (!/^[0-9a-f]+$/i.test(size)) {
                    fail('invalid chunk size ' + current + ': ' + size);
                    return;
                }
                remaining = parseInt(size, 16);
                received = received.subarray(end + 2);
                if (offset + remaining > bodySize) {
                    fail('chunk exceeds response body ' + current);
                    return;
                }
                state = remaining === 0 ? 'chunk-end' : 'chunk-body';
            }
            if (state === 'body' || state === 'chunk-body') {
                consumeBody(Math.min(received.length, remaining));
                if (done || remaining !== 0) return;
                if (state === 'body') {
                    completeResponse();
                    continue;
                }
                state = 'chunk-crlf';
            }
            if (state === 'chunk-crlf' || state === 'chunk-end') {
                if (received.length < 2) return;
                if (received[0] !== 13 || received[1] !== 10) {
                    fail('invalid chunk delimiter ' + current + ' ' + state);
                    return;
                }
                received = received.subarray(2);
                if (state === 'chunk-end') {
                    terminators++;
                    completeResponse();
                } else state = 'chunk-size';
            }
        }
    });
    client.on('end', () => {
        ended = true;
        if (current !== 5 || state !== 'header' || received.length !== 0)
            fail('early connection end');
    });
    client.on('close', () => {
        closed = true;
        if (!done && !ended) fail('connection closed before end');
        finish();
    });
});
`;

test("node:http: queued writes finish once and release a reused keep-alive socket (#601)", () => {
    const oracle = runOracle(source);
    assert.match(oracle.stdout, /^bytes 1048576,1048576,1048576,10,10\n/);
    assert.ok(oracle.stdout.includes("chunked 3 terminators\n"));
    assert.ok(oracle.stdout.includes("finish 1,1,1,1,1\n"));
    assert.ok(
        oracle.stdout.endsWith(
            "one connection, queued followups, clean close\n",
        ),
    );
    // The live HTTP/net module graph is too large for collection on every
    // allocation; the suite's usual host timeout still bounds the whole run.
    const native = runOnHost(source, { gcStress: false });
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, oracle.stdout);
});
