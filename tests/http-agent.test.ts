import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

function expectNode(source: string, expected: string[]): void {
    const { native, oracle, oracleStatus, oracleStderr } = runModulesOnHost(
        { "main.mjs": source },
        "main.mjs",
        { gcStress: false },
    );
    assert.equal(oracleStatus, 0, oracleStderr + oracle);
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr + native.stdout);
    assert.equal(oracle, expected.join("\n") + "\n");
    assert.equal(native.stdout, oracle);
    assert.equal(native.stderr, oracleStderr);
}

// Use real, separate loopback origins: changing only a path cannot exercise the
// global capacity limit. The watchdog owns cleanup, including queued requests,
// so a lost wakeup produces useful output instead of the helper's process kill.
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
  const watchdog = setTimeout(() => {
    console.log('watchdog', limit, 'total', agent.totalSocketCount,
      'active', count(agent.sockets), 'waiting', count(agent.requests),
      'seen', seen.join(','), 'assigned', assigned.join(','), 'done', completed.join(','));
    process.exitCode = 1;
    cleanup();
  }, 6000);
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
await scenario(1);
await scenario(2);
`;

test("node:http Agent: closing a socket wakes other origins at maxTotalSockets 1 and 2", () =>
    expectNode(boundedOrigins, [
        "queued 1 1",
        "woken 1 /hold0,/other1",
        "complete 1 /hold0,/other1 2 peak 1",
        "queued 2 2",
        "woken 2 /hold0,/other1,/other2",
        "complete 2 /hold0,/hold1,/other1,/other2 4 peak 2",
    ]));

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
  const watchdog = setTimeout(() => {
    console.log('watchdog', mode, action, agent.totalSocketCount, waiting(),
      seen.join(','), canceledEvents.join(','), liveEvents.join(','));
    process.exitCode = 1;
    cleanup();
  }, 6000);
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
for (const mode of ['pending', 'deferred', 'socket'])
  for (const action of ['error', 'destroy', 'abort']) await scenario(mode, action);
`;

test("node:http Agent: cancellation while queued, before assignment and after the socket event frees capacity once", () =>
    expectNode(cancellations, [
        "pending error before release [] true",
        "pending error canceled error:TypeError:-:cancel,close live socket,response,end:live,close seen /hold,/live",
        "pending destroy before release [] true",
        "pending destroy canceled error:Error:ECONNRESET:socket hang up,close live socket,response,end:live,close seen /hold,/live",
        'pending abort before release ["abort"] true',
        "pending abort canceled abort,close live socket,response,end:live,close seen /hold,/live",
        "deferred error canceled error:TypeError:-:cancel,close live socket,response,end:live,close seen /live",
        "deferred destroy canceled error:Error:ECONNRESET:socket hang up,close live socket,response,end:live,close seen /live",
        "deferred abort canceled close,abort live socket,response,end:live,close seen /live",
        "socket error canceled socket,error:TypeError:-:cancel,close live socket,response,end:live,close seen /live",
        "socket destroy canceled socket,error:Error:ECONNRESET:socket hang up,close live socket,response,end:live,close seen /live",
        "socket abort canceled socket,abort,error:Error:ECONNRESET:socket hang up,close live socket,response,end:live,close seen /live",
    ]));

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
  const watchdog = setTimeout(() => {
    console.log('watchdog', mode, agent.totalSocketCount, Object.keys(agent.requests).length,
      firstEvents.join(','), nextEvents.join(','), seen.join(','));
    process.exitCode = 1;
    cleanup();
  }, 6000);
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
await scenario('peer-close');
await scenario('refused');
await scenario('destroy');
`;

test("node:http Agent: peer close, connect error and destroy wake queued origins without duplicate events", () =>
    expectNode(releaseEdges, [
        "peer-close first socket,error:Error:ECONNRESET,close next socket,response,end:/next,close seen /hold,/next",
        "refused first socket,error:Error:ECONNREFUSED,close next socket,response,end:/next,close seen /next",
        "destroy first socket,error:Error:ECONNRESET,close next socket,response,end:/next,close,socket,response,end:/reused,close seen /hold,/next,/reused",
    ]));

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
  const watchdog = setTimeout(() => {
    console.log('watchdog', mode, agent.totalSocketCount, Object.keys(agent.requests).length,
      events.join(','), liveEvents.join(','), !!tunnel, !!peer);
    process.exitCode = 1;
    cleanup();
  }, 6000);
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
await scenario('connect');
await scenario('upgrade');
`;

test("node:http Agent: CONNECT and upgrade free global capacity while their sockets stay open", () =>
    expectNode(detachedSockets, [
        "connect socket,connect:200:0,close socket,response,end:other origin,close held open true true true",
        "connect after agent destroy true true true",
        "upgrade socket,upgrade:101:0,close socket,response,end:other origin,close held open true true true",
        "upgrade after agent destroy true true true",
    ]));

const idleTimeout = String.raw`import http from 'node:http';
const agent = new http.Agent({ keepAlive: true, maxSockets: 1, maxTotalSockets: 1, timeout: 200 });
const peers = [], requests = [];
let connections = 0, cleaning = false;
const server = http.createServer((req, res) => res.end(req.url));
server.on('connection', socket => { peers.push(socket); connections++; });
function cleanup() {
  if (cleaning) return;
  cleaning = true;
  for (const req of requests) req.destroy();
  agent.destroy();
  for (const socket of peers) socket.destroy();
  server.close();
}
const watchdog = setTimeout(() => {
  console.log('watchdog idle timeout', agent.totalSocketCount,
    Object.keys(agent.sockets).length, Object.keys(agent.freeSockets).length, connections);
  process.exitCode = 1;
  cleanup();
}, 6000);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
function get(path) {
  let req;
  const done = new Promise(resolve => {
    req = http.get({ host: '127.0.0.1', port, path, agent }, res => {
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
await closed;
console.log('timed out', timedOut, firstSocket.destroyed);
const second = get('/second');
await second.done;
console.log('replacement', firstSocket !== second.req.socket, connections);
clearTimeout(watchdog);
cleanup();
`;

test("node:http Agent: idle timeout evicts a free socket and permits a replacement", () =>
    expectNode(idleTimeout, [
        "body /first false",
        "idle",
        "timed out 1 true",
        "body /second false",
        "replacement true 2",
    ]));

// A socket timeout follows its handle's reference state, so the watchdog cannot
// keep this exit probe alive. A referenced idle client socket reaches it.
const idleUnref = String.raw`import http from 'node:http';
const agent = new http.Agent({ keepAlive: true, maxSockets: 1, maxTotalSockets: 1, timeout: 2000 });
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
  req = http.get({ host: '127.0.0.1', port: server.address().port, agent }, res => {
    let body = '';
    res.on('data', chunk => { body += chunk; });
    res.on('end', () => console.log('body', body));
  });
  req.on('error', error => { if (!cleaning) console.log('request error', error.code); });
  req.on('socket', socket => socket.setTimeout(2000, watchdog));
  req.on('close', resolve);
});
await new Promise(resolve => setImmediate(resolve));
console.log('idle unref ready', peers.length);
server.unref();
for (const socket of peers) socket.unref();
`;

test("node:http Agent: an idle keep-alive socket does not keep the process alive", () =>
    expectNode(idleUnref, ["body unref", "idle unref ready 1"]));
