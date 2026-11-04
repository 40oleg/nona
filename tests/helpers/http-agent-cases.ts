// Real loopback programs shared by native witnesses and small Node controls.
// Each parameter tuple is a separate program: forced GC must not accumulate
// several scenarios inside the host helper's existing per-program bound.
const creationFailure = String.raw`import http from 'node:http';
const agent = new http.Agent();
const peers = [], events = [];
let req, cleaning = false;
const server = http.createServer((incoming, res) => res.end('live'));
server.on('connection', socket => peers.push(socket));
function cleanup() {
  if (cleaning) return;
  cleaning = true;
  if (req) req.destroy();
  agent.destroy();
  for (const socket of peers) socket.destroy();
  server.close();
}
const watchdog = cleanupWatchdog(() => {
  console.log('watchdog creation failure', events.join(','));
  process.exitCode = 1;
  cleanup();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try { http.get({ host: '127.0.0.1', port: 99999, agent }); }
catch (error) { console.log('creation error', error.name, error.code); }
await new Promise(resolve => {
  req = http.get({ host: '127.0.0.1', port: server.address().port, agent }, res => {
    events.push('response');
    let body = '';
    res.on('data', chunk => { body += chunk; });
    res.on('end', () => events.push('end:' + body));
  });
  req.on('socket', () => events.push('socket'));
  req.on('error', error => events.push('error:' + error.name + ':' + error.code));
  req.on('close', () => { events.push('close'); resolve(); });
});
console.log('later request', events.join(','));
clearTimeout(watchdog);
cleanup();
`;

const assignedWrites = String.raw`import http from 'node:http';
async function scenario(phase, action) {
  const agent = new http.Agent({ maxSockets: 1, maxTotalSockets: 1 });
  const peers = [], events = [];
  const failure = new TypeError('cancel');
  let req, cleaning = false;
  const server = http.createServer((incoming, res) => res.end('unexpected'));
  server.on('connection', socket => peers.push(socket));
  function cleanup() {
    if (cleaning) return;
    cleaning = true;
    if (req) req.destroy();
    agent.destroy();
    for (const socket of peers) socket.destroy();
    server.close();
  }
  const watchdog = cleanupWatchdog(() => {
    console.log('watchdog assigned writes', phase, action, events.join(','));
    process.exitCode = 1;
    cleanup();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => {
    req = http.request({ host: '127.0.0.1', port: server.address().port, agent, method: 'POST' });
    req.on('socket', socket => {
      events.push('socket');
      function cancel() {
        for (const body of ['one', 'two']) {
          // Only this retained write callback owns the context after cancel()
          // returns; error emission and the first callback can allocate/collect.
          const context = { body, payload: Buffer.from(body), nested: { tag: 'retained' } };
          req.write(body, error => {
            if (context.body !== body || context.payload.toString() !== body || context.nested.tag !== 'retained')
              throw new Error('write callback lost its context');
            if ((action === 'error' || action === 'socket-error') && error !== failure)
              throw new Error('write callback lost the original error');
            events.push(body + ':' + error.name + ':' + (error.code || '-') + ':' + error.message);
          });
        }
        if (action === 'abort') req.abort();
        else if (action === 'error') { req.destroy(failure); req.destroy(); }
        else if (action === 'socket-error') { socket.destroy(failure); socket.destroy(); }
        else if (action === 'socket-destroy') { socket.destroy(); socket.destroy(); }
        else if (action === 'agent-destroy') { agent.destroy(); agent.destroy(); }
        else { req.destroy(); req.destroy(); }
      }
      if (phase === 'connected' && socket.connecting) socket.once('connect', cancel);
      else cancel();
    });
    req.on('abort', () => events.push('abort'));
    req.on('error', error => events.push('error:' + error.name + ':' + (error.code || '-') + ':' + error.message));
    req.on('close', () => { events.push('close'); resolve(); });
  });
  await new Promise(resolve => setImmediate(resolve));
  console.log(phase, action, events.join(','));
  clearTimeout(watchdog);
  cleanup();
}
`;

// Separate loopback ports exercise global capacity without DNS.
const boundedOrigins = String.raw`import http from 'node:http';
function count(table) {
  let total = 0;
  for (const name of Object.keys(table)) total += table[name].length;
  return total;
}
async function scenario(limit) {
  const agent = new http.Agent({ maxSockets: limit, maxTotalSockets: limit });
  const servers = [], sockets = [], requests = [], held = [];
  const seen = [], completed = [], assigned = [];
  let liveSockets = 0, peakSockets = 0;
  let cleaning = false;
  function cleanup() {
    if (cleaning) return;
    cleaning = true;
    for (const req of requests) req.destroy();
    agent.destroy();
    for (const socket of sockets) socket.destroy();
    for (const server of servers) server.close();
  }
  const watchdog = cleanupWatchdog(() => {
    console.log('watchdog', limit, 'total', agent.totalSocketCount,
      'active', count(agent.sockets), 'waiting', count(agent.requests),
      'seen', seen.join(','), 'assigned', assigned.join(','), 'done', completed.join(','));
    process.exitCode = 1;
    cleanup();
  });
  function listen() {
    return new Promise(resolve => {
      const server = http.createServer((req, res) => {
        seen.push(req.url);
        res.setHeader('Connection', 'close');
        if (req.url.startsWith('/hold')) {
          held.push(res);
          if (held.length === limit) holding();
        } else res.end(req.url);
      });
      servers.push(server);
      server.on('connection', socket => sockets.push(socket));
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
  }
  let holding;
  const ready = new Promise(resolve => { holding = resolve; });
  const ports = [];
  for (let i = 0; i <= limit; i++) ports.push(await listen());
  function get(port, path) {
    return new Promise(resolve => {
      let ended = false;
      const req = http.get({ host: '127.0.0.1', port, path, agent }, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => { ended = true; completed.push(body); });
      });
      requests.push(req);
      req.on('socket', socket => {
        assigned.push(path);
        liveSockets++;
        peakSockets = Math.max(peakSockets, liveSockets);
        socket.once('close', () => { liveSockets--; });
      });
      req.on('error', error => {
        if (!cleaning) console.log('request error', path, error.code);
      });
      req.on('close', () => { if (ended) resolve(); });
    });
  }
  const holds = [];
  for (let i = 0; i < limit; i++) holds.push(get(ports[0], '/hold' + i));
  await ready;
  const waiting = [];
  for (let i = 1; i <= limit; i++) waiting.push(get(ports[i], '/other' + i));
  console.log('queued', limit, assigned.length);
  held[0].end('/hold0');
  await Promise.all(waiting);
  console.log('woken', limit, completed.join(','));
  for (let i = 1; i < held.length; i++) held[i].end('/hold' + i);
  await Promise.all(holds);
  console.log('complete', limit, seen.join(','), assigned.length, 'peak', peakSockets);
  clearTimeout(watchdog);
  cleanup();
}
`;

const cancellations = String.raw`import http from 'node:http';
async function scenario(mode, action) {
  const idleOffer = mode === 'pending' && action === 'error';
  const agent = new http.Agent({ keepAlive: idleOffer, maxSockets: 1, maxTotalSockets: 1 });
  const servers = [], sockets = [], requests = [], seen = [];
  const canceledEvents = [], liveEvents = [];
  let held, holdPeer, holding, cleaning = false;
  const ready = new Promise(resolve => { holding = resolve; });
  function waiting() {
    let n = 0;
    for (const key of Object.keys(agent.requests)) n += agent.requests[key].length;
    return n;
  }
  function cleanup() {
    if (cleaning) return;
    cleaning = true;
    for (const req of requests) req.destroy();
    agent.destroy();
    for (const socket of sockets) socket.destroy();
    for (const server of servers) server.close();
  }
  const watchdog = cleanupWatchdog(() => {
    console.log('watchdog', mode, action, agent.totalSocketCount, waiting(),
      seen.join(','), canceledEvents.join(','), liveEvents.join(','));
    process.exitCode = 1;
    cleanup();
  });
  function listen() {
    return new Promise(resolve => {
      const server = http.createServer((req, res) => {
        seen.push(req.url);
        if (!idleOffer || req.url !== '/hold') res.setHeader('Connection', 'close');
        if (req.url === '/hold') { held = res; holdPeer = req.socket; holding(); }
        else res.end('live');
      });
      servers.push(server);
      server.on('connection', socket => sockets.push(socket));
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
  }
  const a = await listen(), b = await listen();
  function cancel(req) {
    if (action === 'abort') req.abort();
    else if (action === 'destroy') req.destroy();
    else req.destroy(new TypeError('cancel'));
  }
  function get(port, path, events, cancelOnSocket) {
    let req;
    const done = new Promise(resolve => {
      req = http.request({ host: '127.0.0.1', port, path, agent, method: 'POST' }, res => {
        events.push('response');
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => events.push('end:' + body));
      });
      requests.push(req);
      req.on('socket', () => {
        events.push('socket');
        if (cancelOnSocket) cancel(req);
      });
      req.on('abort', () => events.push('abort'));
      req.on('error', error => { if (!cleaning) events.push('error:' + error.name + ':' + (error.code || '-') + ':' + error.message); });
      req.on('close', () => { events.push('close'); resolve(); });
      if (path === '/canceled') {
        req.write('one', () => events.push('write callback'));
        req.end('two', () => events.push('end callback'));
      } else req.end();
    });
    return { req, done };
  }
  let first;
  if (mode === 'pending') {
    first = get(a, '/hold', [], false);
    await ready;
  }
  const canceled = get(mode === 'pending' ? b : a, '/canceled', canceledEvents, mode === 'socket');
  const live = get(b, '/live', liveEvents, false);
  if (mode !== 'socket') cancel(canceled.req);
  if (mode === 'pending') {
    await new Promise(resolve => setImmediate(resolve));
    console.log('pending', action, 'before release', JSON.stringify(canceledEvents), canceled.req.destroyed);
    held.end('held');
    if (idleOffer) {
      // A stays idle until cancellation is reported. Then close it explicitly
      // to make room for live B without treating free sockets as extra capacity.
      await canceled.done;
      holdPeer.destroy();
    }
  }
  await Promise.all([canceled.done, live.done]);
  if (first) await first.done;
  await new Promise(resolve => setImmediate(resolve));
  console.log(mode, action, 'canceled', canceledEvents.join(','), 'live', liveEvents.join(','),
    'seen', seen.join(','));
  clearTimeout(watchdog);
  cleanup();
}
`;

// Only completion promises escape the queue factories. Retaining queued
// requests separately for cleanup would bypass the Agent ownership under test.
// Deferred errors, payloads and callback contexts must survive allocation and
// a turn of the loop before the held real connection releases capacity.
const retainedContexts = String.raw`import http from 'node:http';
const agent = new http.Agent({ maxSockets: 1, maxTotalSockets: 1 });
const servers = [], sockets = [], requests = [], seen = [];
const canceledEvents = [], liveEvents = [];
let held, holding, cleaning = false, phase = 'setup';
const started = Date.now(), phases = [];
function enterPhase(name) {
  phase = name;
  phases.push(name + ':' + (Date.now() - started));
}
const ready = new Promise(resolve => { holding = resolve; });
function cleanup() {
  if (cleaning) return;
  cleaning = true;
  for (const req of requests) req.destroy();
  agent.destroy();
  for (const socket of sockets) socket.destroy();
  for (const server of servers) server.close();
}
const watchdog = cleanupWatchdog(() => {
  console.log('watchdog retained contexts', phase, 'elapsed-ms', Date.now() - started,
    'phases-ms', phases.join(','), 'canceled', canceledEvents.join(','),
    'live', liveEvents.join(','), 'seen', seen.join(','));
  process.exitCode = 1;
  cleanup();
});
function listen() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      seen.push(req.url);
      res.setHeader('Connection', 'close');
      if (req.url === '/hold') { held = res; enterPhase('hold-received'); holding(); }
      else res.end('live');
    });
    servers.push(server);
    server.on('connection', socket => sockets.push(socket));
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}
function cancelWithContext(req) {
  const failure = new TypeError('cancel');
  failure.context = { payload: Buffer.from('error-context') };
  req.destroy(failure);
  req.destroy();
}
function enqueueCanceled(port) {
  const context = { label: 'cancel-listener' };
  return new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port, path: '/canceled', method: 'POST', agent }, () => {
      throw new Error('canceled response callback ran');
    });
    req.on('socket', () => { throw new Error('canceled request received a socket'); });
    req.on('error', error => canceledEvents.push('error:' + error.name + ':' + (error.code || '-') + ':' + error.message + ':' + error.context.payload.toString() + ':' + context.label));
    req.on('close', () => { canceledEvents.push('close:' + context.label); resolve(); });
    req.write(Buffer.from('abandoned write'), () => { throw new Error('canceled write callback ran'); });
    req.end('abandoned end', () => { throw new Error('canceled end callback ran'); });
    cancelWithContext(req);
  });
}
function enqueueLive(port) {
  const context = { label: 'live-context', payload: Buffer.from('retained') };
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/live', agent }, res => {
      liveEvents.push('response:' + context.payload.toString());
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => liveEvents.push('end:' + body));
    });
    req.on('socket', () => liveEvents.push('socket:' + context.label));
    req.on('error', error => { if (!cleaning) liveEvents.push('error:' + error.name + ':' + error.code); });
    req.on('close', () => { liveEvents.push('close:' + context.label); resolve(); });
  });
}
enterPhase('listen1');
const a = await listen();
enterPhase('listen2');
const b = await listen();
enterPhase('hold');
const first = new Promise(resolve => {
  const req = http.get({ host: '127.0.0.1', port: a, path: '/hold', agent }, res => res.resume());
  requests.push(req);
  req.on('error', error => { if (!cleaning) throw error; });
  req.on('close', resolve);
});
await ready;
enterPhase('queue');
const canceled = enqueueCanceled(b), live = enqueueLive(b);
await new Promise(resolve => setImmediate(resolve));
console.log('retained before release', canceledEvents.length, liveEvents.length);
enterPhase('release');
held.end(Buffer.from('release'));
await Promise.all([first, canceled, live]);
await new Promise(resolve => setImmediate(resolve));
console.log('retained canceled', canceledEvents.join(','));
console.log('retained live', liveEvents.join(','), 'seen', seen.join(','));
clearTimeout(watchdog);
cleanup();
`;

const releaseEdges = String.raw`import http from 'node:http';
async function scenario(mode) {
  const agent = new http.Agent({ maxSockets: 1, maxTotalSockets: 1 });
  const servers = [], sockets = [], requests = [];
  const firstEvents = [], nextEvents = [], seen = [];
  let held, holding, cleaning = false;
  const ready = new Promise(resolve => { holding = resolve; });
  function cleanup() {
    if (cleaning) return;
    cleaning = true;
    for (const req of requests) req.destroy();
    agent.destroy();
    for (const socket of sockets) socket.destroy();
    for (const server of servers) server.close();
  }
  const watchdog = cleanupWatchdog(() => {
    console.log('watchdog', mode, agent.totalSocketCount, Object.keys(agent.requests).length,
      firstEvents.join(','), nextEvents.join(','), seen.join(','));
    process.exitCode = 1;
    cleanup();
  });
  function listen() {
    return new Promise(resolve => {
      const server = http.createServer((req, res) => {
        seen.push(req.url);
        if (req.url === '/hold') { held = req.socket; holding(); }
        else { res.setHeader('Connection', 'close'); res.end(req.url); }
      });
      servers.push(server);
      server.on('connection', socket => sockets.push(socket));
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
  }
  const a = await listen(), b = await listen();
  function get(port, path, events) {
    return new Promise(resolve => {
      const req = http.get({ host: '127.0.0.1', port, path, agent }, res => {
        events.push('response');
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => events.push('end:' + body));
      });
      requests.push(req);
      req.on('socket', () => events.push('socket'));
      req.on('error', error => { if (!cleaning) events.push('error:' + error.name + ':' + error.code); });
      req.on('close', () => { events.push('close'); resolve(); });
    });
  }
  if (mode === 'refused') await new Promise(resolve => servers[0].close(resolve));
  const first = get(a, mode === 'refused' ? '/refused' : '/hold', firstEvents);
  if (mode !== 'refused') await ready;
  const next = get(b, '/next', nextEvents);
  if (mode === 'peer-close') held.destroy();
  if (mode === 'destroy') agent.destroy();
  await Promise.all([first, next]);
  // destroy() closes the current sockets; the same public Agent remains usable.
  if (mode === 'destroy') await get(b, '/reused', nextEvents);
  await new Promise(resolve => setImmediate(resolve));
  console.log(mode, 'first', firstEvents.join(','), 'next', nextEvents.join(','), 'seen', seen.join(','));
  clearTimeout(watchdog);
  cleanup();
}
`;

const detachedSockets = String.raw`import http from 'node:http';
async function scenario(mode) {
  const agent = new http.Agent({ maxSockets: 1, maxTotalSockets: 1 });
  const servers = [], sockets = [], requests = [];
  const events = [], liveEvents = [];
  let peer, tunnel, cleaning = false;
  function cleanup() {
    if (cleaning) return;
    cleaning = true;
    for (const req of requests) req.destroy();
    agent.destroy();
    if (tunnel) tunnel.destroy();
    for (const socket of sockets) socket.destroy();
    for (const server of servers) server.close();
  }
  const watchdog = cleanupWatchdog(() => {
    console.log('watchdog', mode, agent.totalSocketCount, Object.keys(agent.requests).length,
      events.join(','), liveEvents.join(','), !!tunnel, !!peer);
    process.exitCode = 1;
    cleanup();
  });
  function listen() {
    return new Promise(resolve => {
      const server = http.createServer((req, res) => {
        res.setHeader('Connection', 'close'); res.end('other origin');
      });
      servers.push(server);
      server.on('connection', socket => sockets.push(socket));
      server.on(mode, (req, socket) => {
        peer = socket;
        socket.write(mode === 'connect'
          ? 'HTTP/1.1 200 Connection Established\r\n\r\n'
          : 'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n');
      });
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
  }
  const a = await listen(), b = await listen();
  const detached = new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port: a, agent,
      method: mode === 'connect' ? 'CONNECT' : 'GET',
      path: mode === 'connect' ? 'example.test:80' : '/',
      headers: mode === 'upgrade' ? { Connection: 'Upgrade', Upgrade: 'test' } : {} });
    requests.push(req);
    req.on('socket', () => events.push('socket'));
    req.on('error', error => { if (!cleaning) events.push('error:' + error.code); });
    req.on(mode, (res, socket, head) => {
      tunnel = socket;
      events.push(mode + ':' + res.statusCode + ':' + head.length);
    });
    req.on('close', () => { events.push('close'); resolve(); });
    req.end();
  });
  const next = new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port: b, agent }, res => {
      liveEvents.push('response');
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => liveEvents.push('end:' + body));
    });
    requests.push(req);
    req.on('socket', () => liveEvents.push('socket'));
    req.on('error', error => { if (!cleaning) liveEvents.push('error:' + error.code); });
    req.on('close', () => { liveEvents.push('close'); resolve(); });
  });
  await Promise.all([detached, next]);
  console.log(mode, events.join(','), liveEvents.join(','),
    'held open', !tunnel.destroyed, tunnel.writable, !peer.destroyed);
  agent.destroy();
  await new Promise(resolve => setImmediate(resolve));
  console.log(mode, 'after agent destroy', !tunnel.destroyed, tunnel.writable, !peer.destroyed);
  clearTimeout(watchdog);
  cleanup();
}
`;

// The public keepSocketAlive hook runs at the actual idle transition on both
// implementations (their free-event timing differs). Preserve the real Agent
// decision and unref, then pause its timer while completing readiness/logging.
// Only the staged witnesses add request timeout:0 for active I/O. Their measured
// idle deadlines remain 200ms/2000ms; normal controls below are unchanged.
const idleAgent = String.raw`let idleSocket;
class IdleAgent extends http.Agent {
  keepSocketAlive(socket) {
    const keep = super.keepSocketAlive(socket);
    idleSocket = socket;
    socket.setTimeout(0);
    return keep;
  }
}
`;

function idleTimeout(staged: boolean): string {
    // Isolate the client's 200ms idle timeout from the independent server
    // keep-alive expiry, which may already be overdue under forced GC.
    // Keep the rationale outside the generated, hosted-tested program.
    return String.raw`import http from 'node:http';
${staged ? idleAgent : ""}
const agent = new ${staged ? "IdleAgent" : "http.Agent"}({ keepAlive: true, maxSockets: 1, maxTotalSockets: 1, timeout: 200 });
const peers = [], requests = [];
let connections = 0, cleaning = false;
const server = http.createServer((req, res) => res.end(req.url));
server.keepAliveTimeout = 0;
server.on('connection', socket => { peers.push(socket); connections++; });
function cleanup() {
  if (cleaning) return;
  cleaning = true;
  for (const req of requests) req.destroy();
  agent.destroy();
  for (const socket of peers) socket.destroy();
  server.close();
}
const watchdog = cleanupWatchdog(() => {
  console.log('watchdog idle timeout', agent.totalSocketCount,
    Object.keys(agent.sockets).length, Object.keys(agent.freeSockets).length, connections);
  process.exitCode = 1;
  cleanup();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
function get(path) {
  let req;
  const done = new Promise(resolve => {
    req = http.get({ host: '127.0.0.1', port, path, agent${staged ? ", timeout: 0" : ""} }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => console.log('body', body, req.reusedSocket));
    });
    requests.push(req);
    req.on('error', error => { if (!cleaning) console.log('request error', error.code); });
    req.on('close', resolve);
  });
  return { req, done };
}
const first = get('/first');
let timedOut = 0;
let firstSocket;
const closed = new Promise(resolve => {
  first.req.on('socket', socket => {
    firstSocket = socket;
    socket.on('timeout', () => { timedOut++; });
    socket.on('close', resolve);
  });
});
await first.done;
await new Promise(resolve => setImmediate(resolve));
console.log('idle');
${staged ? "firstSocket.setTimeout(200);" : ""}
await closed;
console.log('timed out', timedOut, firstSocket.destroyed);
const second = get('/second');
await second.done;
console.log('replacement', firstSocket !== second.req.socket, connections);
clearTimeout(watchdog);
cleanup();
`;
}

function idleUnref(staged: boolean): string {
    return String.raw`import http from 'node:http';
${staged ? idleAgent : ""}
const agent = new ${staged ? "IdleAgent" : "http.Agent"}({ keepAlive: true, maxSockets: 1, maxTotalSockets: 1, timeout: 2000 });
const peers = [];
let req, cleaning = false;
const server = http.createServer((incoming, res) => res.end('unref'));
server.on('connection', socket => peers.push(socket));
function cleanup() {
  if (cleaning) return;
  cleaning = true;
  if (req) req.destroy();
  agent.destroy();
  for (const socket of peers) socket.destroy();
  server.close();
}
function watchdog() {
  console.log('watchdog idle unref', agent.totalSocketCount,
    Object.keys(agent.sockets).length, Object.keys(agent.freeSockets).length, peers.length);
  process.exitCode = 1;
  cleanup();
}
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await new Promise(resolve => {
  req = http.get({ host: '127.0.0.1', port: server.address().port, agent${staged ? ", timeout: 0" : ""} }, res => {
    let body = '';
    res.on('data', chunk => { body += chunk; });
    res.on('end', () => console.log('body', body));
  });
  req.on('error', error => { if (!cleaning) console.log('request error', error.code); });
  ${staged ? "" : "req.on('socket', socket => socket.setTimeout(2000, watchdog));"}
  req.on('close', resolve);
});
await new Promise(resolve => setImmediate(resolve));
${staged ? "if (!idleSocket || idleSocket.destroyed || !idleSocket.writable) throw new Error('unref probe lost its idle client socket');" : ""}
console.log('idle unref ready', peers.length);
server.unref();
for (const socket of peers) socket.unref();
${
    staged
        ? `// Arm the original 2000ms socket deadline only after readiness and
// unreferencing the real server/peers. Its reference state still decides exit.
idleSocket.setTimeout(2000, watchdog);`
        : ""
}
`;
}

export interface AgentCase {
    id: string;
    name: string;
    source: string;
    stressSource?: string;
    expected: string[];
    control: boolean;
}

function scenario(source: string, ...args: (string | number)[]): string {
    return (
        source +
        "\nawait scenario(" +
        args.map((arg) => JSON.stringify(arg)).join(", ") +
        ");\n"
    );
}

export const agentCases: AgentCase[] = [
    {
        id: "creation-failure",
        name: "node:http Agent: a connection creation throw does not poison subsequent valid requests",
        source: creationFailure,
        expected: [
            "creation error RangeError ERR_SOCKET_BAD_PORT",
            "later request socket,response,end:live,close",
        ],
        control: false,
    },
    {
        id: "assigned/connecting/destroy",
        name: "node:http Agent: cancellation completes corked writes made on an assigned socket exactly once [connecting, destroy]",
        source: scenario(assignedWrites, "connecting", "destroy"),
        expected: [
            "connecting destroy socket,one:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,two:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,error:Error:ECONNRESET:socket hang up,close",
        ],
        control: false,
    },
    {
        id: "assigned/connecting/error",
        name: "node:http Agent: cancellation completes corked writes made on an assigned socket exactly once [connecting, error]",
        source: scenario(assignedWrites, "connecting", "error"),
        expected: [
            "connecting error socket,error:TypeError:-:cancel,one:TypeError:-:cancel,two:TypeError:-:cancel,close",
        ],
        control: false,
    },
    {
        id: "assigned/connecting/abort",
        name: "node:http Agent: cancellation completes corked writes made on an assigned socket exactly once [connecting, abort]",
        source: scenario(assignedWrites, "connecting", "abort"),
        expected: [
            "connecting abort socket,abort,one:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,two:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,error:Error:ECONNRESET:socket hang up,close",
        ],
        control: false,
    },
    {
        id: "assigned/connecting/socket-destroy",
        name: "node:http Agent: cancellation completes corked writes made on an assigned socket exactly once [connecting, socket-destroy]",
        source: scenario(assignedWrites, "connecting", "socket-destroy"),
        expected: [
            "connecting socket-destroy socket,one:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,two:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,error:Error:ECONNRESET:socket hang up,close",
        ],
        control: false,
    },
    {
        id: "assigned/connecting/socket-error",
        name: "node:http Agent: cancellation completes corked writes made on an assigned socket exactly once [connecting, socket-error]",
        source: scenario(assignedWrites, "connecting", "socket-error"),
        expected: [
            "connecting socket-error socket,error:TypeError:-:cancel,one:TypeError:-:cancel,two:TypeError:-:cancel,close",
        ],
        control: false,
    },
    {
        id: "assigned/connecting/agent-destroy",
        name: "node:http Agent: cancellation completes corked writes made on an assigned socket exactly once [connecting, agent-destroy]",
        source: scenario(assignedWrites, "connecting", "agent-destroy"),
        expected: [
            "connecting agent-destroy socket,one:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,two:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,error:Error:ECONNRESET:socket hang up,close",
        ],
        control: false,
    },
    {
        id: "assigned/connected/destroy",
        name: "node:http Agent: cancellation completes corked writes made on an assigned socket exactly once [connected, destroy]",
        source: scenario(assignedWrites, "connected", "destroy"),
        expected: [
            "connected destroy socket,one:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,two:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,error:Error:ECONNRESET:socket hang up,close",
        ],
        control: false,
    },
    {
        id: "assigned/connected/error",
        name: "node:http Agent: cancellation completes corked writes made on an assigned socket exactly once [connected, error]",
        source: scenario(assignedWrites, "connected", "error"),
        expected: [
            "connected error socket,error:TypeError:-:cancel,one:TypeError:-:cancel,two:TypeError:-:cancel,close",
        ],
        control: false,
    },
    {
        id: "assigned/connected/abort",
        name: "node:http Agent: cancellation completes corked writes made on an assigned socket exactly once [connected, abort]",
        source: scenario(assignedWrites, "connected", "abort"),
        expected: [
            "connected abort socket,abort,one:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,two:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,error:Error:ECONNRESET:socket hang up,close",
        ],
        control: false,
    },
    {
        id: "assigned/connected/socket-destroy",
        name: "node:http Agent: cancellation completes corked writes made on an assigned socket exactly once [connected, socket-destroy]",
        source: scenario(assignedWrites, "connected", "socket-destroy"),
        expected: [
            "connected socket-destroy socket,one:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,two:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,error:Error:ECONNRESET:socket hang up,close",
        ],
        control: false,
    },
    {
        id: "assigned/connected/socket-error",
        name: "node:http Agent: cancellation completes corked writes made on an assigned socket exactly once [connected, socket-error]",
        source: scenario(assignedWrites, "connected", "socket-error"),
        expected: [
            "connected socket-error socket,error:TypeError:-:cancel,one:TypeError:-:cancel,two:TypeError:-:cancel,close",
        ],
        control: false,
    },
    {
        id: "assigned/connected/agent-destroy",
        name: "node:http Agent: cancellation completes corked writes made on an assigned socket exactly once [connected, agent-destroy]",
        source: scenario(assignedWrites, "connected", "agent-destroy"),
        expected: [
            "connected agent-destroy socket,one:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,two:Error:ERR_STREAM_DESTROYED:Cannot call write after a stream was destroyed,error:Error:ECONNRESET:socket hang up,close",
        ],
        control: false,
    },
    {
        id: "origins/1",
        name: "node:http Agent: closing a socket wakes other origins at maxTotalSockets 1 and 2 [1]",
        source: scenario(boundedOrigins, 1),
        expected: [
            "queued 1 1",
            "woken 1 /hold0,/other1",
            "complete 1 /hold0,/other1 2 peak 1",
        ],
        control: true,
    },
    {
        id: "origins/2",
        name: "node:http Agent: closing a socket wakes other origins at maxTotalSockets 1 and 2 [2]",
        source: scenario(boundedOrigins, 2),
        expected: [
            "queued 2 2",
            "woken 2 /hold0,/other1,/other2",
            "complete 2 /hold0,/hold1,/other1,/other2 4 peak 2",
        ],
        control: true,
    },
    {
        id: "cancel/pending/error",
        name: "node:http Agent: cancellation while queued, before assignment and after the socket event frees capacity once [pending, error]",
        source: scenario(cancellations, "pending", "error"),
        expected: [
            "pending error before release [] true",
            "pending error canceled error:TypeError:-:cancel,close live socket,response,end:live,close seen /hold,/live",
        ],
        control: false,
    },
    {
        id: "cancel/pending/destroy",
        name: "node:http Agent: cancellation while queued, before assignment and after the socket event frees capacity once [pending, destroy]",
        source: scenario(cancellations, "pending", "destroy"),
        expected: [
            "pending destroy before release [] true",
            "pending destroy canceled error:Error:ECONNRESET:socket hang up,close live socket,response,end:live,close seen /hold,/live",
        ],
        control: false,
    },
    {
        id: "cancel/pending/abort",
        name: "node:http Agent: cancellation while queued, before assignment and after the socket event frees capacity once [pending, abort]",
        source: scenario(cancellations, "pending", "abort"),
        expected: [
            'pending abort before release ["abort"] true',
            "pending abort canceled abort,close live socket,response,end:live,close seen /hold,/live",
        ],
        control: false,
    },
    {
        id: "cancel/deferred/error",
        name: "node:http Agent: cancellation while queued, before assignment and after the socket event frees capacity once [deferred, error]",
        source: scenario(cancellations, "deferred", "error"),
        expected: [
            "deferred error canceled error:TypeError:-:cancel,close live socket,response,end:live,close seen /live",
        ],
        control: false,
    },
    {
        id: "cancel/deferred/destroy",
        name: "node:http Agent: cancellation while queued, before assignment and after the socket event frees capacity once [deferred, destroy]",
        source: scenario(cancellations, "deferred", "destroy"),
        expected: [
            "deferred destroy canceled error:Error:ECONNRESET:socket hang up,close live socket,response,end:live,close seen /live",
        ],
        control: false,
    },
    {
        id: "cancel/deferred/abort",
        name: "node:http Agent: cancellation while queued, before assignment and after the socket event frees capacity once [deferred, abort]",
        source: scenario(cancellations, "deferred", "abort"),
        expected: [
            "deferred abort canceled close,abort live socket,response,end:live,close seen /live",
        ],
        control: false,
    },
    {
        id: "cancel/socket/error",
        name: "node:http Agent: cancellation while queued, before assignment and after the socket event frees capacity once [socket, error]",
        source: scenario(cancellations, "socket", "error"),
        expected: [
            "socket error canceled socket,error:TypeError:-:cancel,close live socket,response,end:live,close seen /live",
        ],
        control: false,
    },
    {
        id: "cancel/socket/destroy",
        name: "node:http Agent: cancellation while queued, before assignment and after the socket event frees capacity once [socket, destroy]",
        source: scenario(cancellations, "socket", "destroy"),
        expected: [
            "socket destroy canceled socket,error:Error:ECONNRESET:socket hang up,close live socket,response,end:live,close seen /live",
        ],
        control: false,
    },
    {
        id: "cancel/socket/abort",
        name: "node:http Agent: cancellation while queued, before assignment and after the socket event frees capacity once [socket, abort]",
        source: scenario(cancellations, "socket", "abort"),
        expected: [
            "socket abort canceled socket,abort,error:Error:ECONNRESET:socket hang up,close live socket,response,end:live,close seen /live",
        ],
        control: false,
    },
    {
        id: "retained-contexts",
        name: "node:http Agent: retains callback contexts and the deferred cancellation error until capacity is released",
        source: retainedContexts,
        expected: [
            "retained before release 0 0",
            "retained canceled error:TypeError:-:cancel:error-context:cancel-listener,close:cancel-listener",
            "retained live socket:live-context,response:retained,end:live,close:live-context seen /hold,/live",
        ],
        control: false,
    },
    {
        id: "release/peer-close",
        name: "node:http Agent: peer close, connect error and destroy wake queued origins without duplicate events [peer-close]",
        source: scenario(releaseEdges, "peer-close"),
        expected: [
            "peer-close first socket,error:Error:ECONNRESET,close next socket,response,end:/next,close seen /hold,/next",
        ],
        control: false,
    },
    {
        id: "release/refused",
        name: "node:http Agent: peer close, connect error and destroy wake queued origins without duplicate events [refused]",
        source: scenario(releaseEdges, "refused"),
        expected: [
            "refused first socket,error:Error:ECONNREFUSED,close next socket,response,end:/next,close seen /next",
        ],
        control: false,
    },
    {
        id: "release/destroy",
        name: "node:http Agent: peer close, connect error and destroy wake queued origins without duplicate events [destroy]",
        source: scenario(releaseEdges, "destroy"),
        expected: [
            "destroy first socket,error:Error:ECONNRESET,close next socket,response,end:/next,close,socket,response,end:/reused,close seen /hold,/next,/reused",
        ],
        control: false,
    },
    {
        id: "detach/connect",
        name: "node:http Agent: CONNECT and upgrade free global capacity while their sockets stay open [connect]",
        source: scenario(detachedSockets, "connect"),
        expected: [
            "connect socket,connect:200:0,close socket,response,end:other origin,close held open true true true",
            "connect after agent destroy true true true",
        ],
        control: false,
    },
    {
        id: "detach/upgrade",
        name: "node:http Agent: CONNECT and upgrade free global capacity while their sockets stay open [upgrade]",
        source: scenario(detachedSockets, "upgrade"),
        expected: [
            "upgrade socket,upgrade:101:0,close socket,response,end:other origin,close held open true true true",
            "upgrade after agent destroy true true true",
        ],
        control: false,
    },
    {
        id: "idle-timeout",
        name: "node:http Agent: idle timeout evicts a free socket and permits a replacement",
        source: idleTimeout(false),
        stressSource: idleTimeout(true),
        expected: [
            "body /first false",
            "idle",
            "timed out 1 true",
            "body /second false",
            "replacement true 2",
        ],
        control: true,
    },
    {
        id: "idle-unref",
        name: "node:http Agent: an idle keep-alive socket does not keep the process alive",
        source: idleUnref(false),
        stressSource: idleUnref(true),
        expected: ["body unref", "idle unref ready 1"],
        control: true,
    },
];
