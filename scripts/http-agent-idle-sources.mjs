// Supplemental observers only. The original fixture and production modules stay intact.
function replaceOnce(source, before, after) {
    if (source.split(before).length !== 2)
        throw new Error("Idle diagnostic source anchor changed: " + before);
    return source.replace(before, after);
}

function scalar(source) {
    source = replaceOnce(
        source,
        "const port = server.address().port;",
        `const port = server.address().port;
const diagnosticKey = agent.getName({ host: '127.0.0.1', port });
let armDestroyed = false, armFree = false;`,
    );
    source = replaceOnce(
        source,
        "firstSocket.setTimeout(200);",
        `armDestroyed = firstSocket.destroyed;
armFree = agent.freeSockets[diagnosticKey] !== undefined && agent.freeSockets[diagnosticKey][0] === firstSocket;
firstSocket.setTimeout(200);`,
    );
    return (
        source + "console.log('diagnostic scalar', armDestroyed, armFree);\n"
    );
}

function chronology(source) {
    // Allocate once, before any networking. No socket/request/response is stored
    // in the trace. Fixed numeric slots are emitted only after cleanup.
    source = replaceOnce(
        source,
        "import http from 'node:http';",
        `import http from 'node:http';
const slots = new Float64Array(512);
let used = 0, overflow = false;
function record(code, a, b) {
  if (used + 4 > 512) { overflow = true; return; }
  slots[used] = code;
  slots[used + 1] = performance.now();
  slots[used + 2] = a;
  slots[used + 3] = b;
  used += 4;
}`,
    );
    source = replaceOnce(
        source,
        "const keep = super.keepSocketAlive(socket);",
        `const keep = super.keepSocketAlive(socket);
    record(5, socket.destroyed ? 1 : 0, keep ? 1 : 0);`,
    );
    source = replaceOnce(
        source,
        "socket.setTimeout(0);",
        `socket.setTimeout(0);
    record(6, socket.destroyed ? 1 : 0, socket._deadline === undefined ? -1 : socket._deadline);`,
    );
    source = replaceOnce(
        source,
        "const server = http.createServer((req, res) => res.end(req.url));",
        `const server = http.createServer((req, res) => {
  const responseEmit = res.emit;
  res.emit = function(event) {
    if (event === 'finish') record(2, 0, 0);
    return responseEmit.apply(this, arguments);
  };
  res.end(req.url);
});`,
    );
    source = replaceOnce(
        source,
        "server.on('connection', socket => { peers.push(socket); connections++; });",
        `server.on('connection', socket => {
  peers.push(socket); connections++;
  const peer = socket;
  const peerEmit = peer.emit;
  peer.emit = function(event) {
    if (event === 'timeout') record(3, this.destroyed ? 1 : 0, 0);
    if (event === 'close') record(4, this.destroyed ? 1 : 0, 0);
    return peerEmit.apply(this, arguments);
  };
  const peerSetTimeout = peer.setTimeout;
  peer.setTimeout = function(delay, callback) {
    const result = peerSetTimeout.call(this, delay, callback);
    record(1, delay, this._deadline === undefined ? -1 : this._deadline);
    return result;
  };
  if (typeof peer._idleTimeout === 'function') {
    const peerIdleTimeout = peer._idleTimeout;
    peer._idleTimeout = function(delay) {
      const result = peerIdleTimeout.call(this, delay);
      record(1, delay, this._deadline === undefined ? -1 : this._deadline);
      return result;
    };
  }
});
const serverEmit = server.emit;
server.emit = function(event) {
  if (event === 'timeout') record(12, 0, 0);
  if (event === 'close') record(14, 0, 0);
  return serverEmit.apply(this, arguments);
};`,
    );
    source = replaceOnce(
        source,
        "firstSocket = socket;",
        `firstSocket = socket;
    const clientEmit = socket.emit;
    socket.emit = function(event) {
      if (event === 'timeout') record(8, this.destroyed ? 1 : 0, 0);
      if (event === 'close') record(9, this.destroyed ? 1 : 0, 0);
      return clientEmit.apply(this, arguments);
    };
    const clientSetTimeout = socket.setTimeout;
    socket.setTimeout = function(delay, callback) {
      const result = clientSetTimeout.call(this, delay, callback);
      record(13, delay, this._deadline === undefined ? -1 : this._deadline);
      return result;
    };`,
    );
    source = replaceOnce(
        source,
        "console.log('idle');",
        "record(10, firstSocket.destroyed ? 1 : 0, 0);\nconsole.log('idle');",
    );
    // Public Agent key is computed before first request, outside the hot arm.
    source = replaceOnce(
        source,
        "const port = server.address().port;",
        `const port = server.address().port;
const diagnosticKey = agent.getName({ host: '127.0.0.1', port });`,
    );
    source = replaceOnce(
        source,
        "firstSocket.setTimeout(200);",
        `record(7, firstSocket.destroyed ? 1 : 0,
  agent.freeSockets[diagnosticKey] !== undefined && agent.freeSockets[diagnosticKey][0] === firstSocket ? 1 : 0);
firstSocket.setTimeout(200);`,
    );
    // A final immediate lets existing close callbacks drain; it is after the
    // original behavior and cleanup, never in the measured idle interval.
    return (
        source +
        `await new Promise(resolve => setImmediate(resolve));
console.log('diagnostic trace', used / 4, overflow);
for (let i = 0; i < used; i += 4)
  console.log('trace', slots[i], slots[i + 1], slots[i + 2], slots[i + 3]);
`
    );
}

export function makePlan(witness, agentProgram) {
    if (!witness || witness.id !== "idle-timeout" || !witness.stressSource)
        throw new Error("Missing original idle-timeout witness");
    const stress = agentProgram(witness, true, "on").source;
    const normal = agentProgram(witness, false, "off").source;
    const stagedNode = agentProgram(
        { source: witness.stressSource },
        false,
        "off",
    ).source;
    const control = (id, source) => ({ id, source, boundMs: 60000 });
    return [
        {
            id: "original-stress",
            requestedGC: true,
            selection: "on",
            source: stress,
            nativeBoundMs: 180000,
            controls: [
                control("oracle-unstaged", normal),
                control("node-staged", stagedNode),
            ],
        },
        {
            id: "normal-off",
            requestedGC: false,
            selection: "off",
            source: normal,
            nativeBoundMs: 60000,
            controls: [control("node-normal", normal)],
        },
        {
            id: "scalar-stress",
            requestedGC: true,
            selection: "on",
            source: scalar(stress),
            nativeBoundMs: 180000,
            controls: [control("node-scalar", scalar(stagedNode))],
        },
        {
            id: "trace-stress",
            requestedGC: true,
            selection: "on",
            source: chronology(stress),
            nativeBoundMs: 180000,
            controls: [control("node-trace", chronology(stagedNode))],
        },
    ];
}
