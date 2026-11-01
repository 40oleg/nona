import { readFileSync } from "node:fs";

export const referenceFile = "tests/fixtures/http-crash/soak-server.mjs";
export const referenceBlob = "51e15fbb68eda99909e4afe2fd3f225d8aeed07e";

// Keep the reference byte-for-byte. Controlled trials change only the /big
// writes and listener bodies/registration; all routes and closures remain.
export function serverSource(reference = false) {
    let source = readFileSync(referenceFile, "utf8");
    const settings = `
console.log('diagnostic ' + JSON.stringify({event:'settings',
    keepAliveTimeout: String(server.keepAliveTimeout),
    keepAliveTimeoutBuffer: String(server.keepAliveTimeoutBuffer),
    timeout: String(server.timeout), requestTimeout: String(server.requestTimeout),
    headersTimeout: String(server.headersTimeout)}));
`;
    if (reference) return source + settings;
    source = source.replace(
        'const bigChunk = "b".repeat(65536);',
        'const bigChunk = "b".repeat(Number(process.env.DIAG_CHUNK_BYTES));',
    );
    source = source.replace(
        "const bigChunks = 16;",
        "const bigChunks = Number(process.env.DIAG_CHUNKS);",
    );
    source = source.replace(
        "    requests++;",
        `    requests++;
    trace('request', req.socket, res);`,
    );
    source = source.replace(
        "    const url = req.url;",
        "    const url = req.url;\n    if (process.env.DIAG_LISTENERS === 'original') {",
    );
    source = source.replace(
        '    if (url === "/text")',
        `    }
    if (url === "/text")`,
    );
    source = source.replace(
        "        res.end();\n    } else if",
        `        trace('queued', req.socket, res);
        if (process.env.DIAG_STATE === 'destroy-queued') {
            trace('destroy', req.socket, res);
            req.socket.destroy();
        } else {
            res.end();
            if (process.env.DIAG_STATE === 'queued-timeout') req.socket.setTimeout(1000);
            trace('end', req.socket, res);
        }
    } else if`,
    );
    source = source.replace(
        "    openSockets++;",
        `    socket.__diagnosticId = ++diagnosticSockets;
    trace('connection', socket, null);
    openSockets++;
    if (process.env.DIAG_LISTENERS === 'original') {`,
    );
    source = source.replace(
        '    socket.on("error", () => {',
        `    socket.on("error", (error) => {
        trace('socket-error', socket, null, error);`,
    );
    source = source.replace(
        "        openSockets--;",
        "        trace('socket-close', socket, null);\n        openSockets--;",
    );
    source = source.replace(
        '    });\n});\nserver.on("clientError",',
        '    });\n    }\n});\nserver.on("clientError",',
    );
    source = source.replace(
        '    res.on("error", () => {',
        `    res.on("error", (error) => {
        trace('response-error', req.socket, res, error);`,
    );
    source = source.replace(
        '    req.on("error", () => {',
        `    req.on("error", (error) => {
        trace('request-error', req.socket, res, error);`,
    );
    return (
        `
let diagnosticSockets = 0;
let diagnosticEvents = 0;
const diagnosticStart = Date.now();
function trace(event, socket, response, error) {
    if (diagnosticEvents++ >= 2048) return;
    // Node exposes timeout publicly; Nona currently stores it in _timeout.
    // Keep the provenance so an internal diagnostic read is explicit.
    const timeoutSource = socket && typeof socket.timeout === 'number'
        ? 'socket.timeout'
        : socket && typeof socket._timeout === 'number' ? 'socket._timeout' : 'unavailable';
    const timeout = timeoutSource === 'socket.timeout' ? socket.timeout
        : timeoutSource === 'socket._timeout' ? socket._timeout : null;
    console.log('diagnostic ' + JSON.stringify({event, sequence:diagnosticEvents,
        ms:Date.now()-diagnosticStart, socket:socket && socket.__diagnosticId,
        destroyed:socket && socket.destroyed,
        timeout, timeoutSource,
        socketQueued:socket && socket.writableLength,
        responseQueued:response && response.writableLength,
        ended:response && response.writableEnded,
        error:error && {name:error.name, code:error.code, message:error.message}}));
}
` +
        source +
        settings
    );
}
