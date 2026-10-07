import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runModulesOnHost} from './helpers/host.js';
import {processNetworkProbe} from './probes/process-network-probe.js';

// Each program runs as an ES module on the host target and under Node.js; the
// outputs must be identical. Programs print no ports or dates. Programs that
// import node:net run without GC stress: a forced collection before every
// block walks the whole compiled module graph and takes minutes per program.
// The last test lets the collector run many times with live sockets instead.
function expectNode(source:string,gcStress:boolean):void {
 const {native,oracle}=runModulesOnHost({'main.mjs':source},'main.mjs',{gcStress});
 assert.equal(native.error,undefined);
 assert.equal(native.status,0,native.stderr);
 assert.ok(oracle.length>0);
 assert.equal(native.stdout,oracle);
}

test('HTTP, Process streams and Immediates share a live native event loop',()=>expectNode(processNetworkProbe,false));

test('node:http: an HTTP server answers GET and POST requests from http.get and http.request',()=>expectNode(String.raw`import http from 'node:http';
const server = http.createServer((req, res) => {
  console.log('server:', req.method, req.url, req.httpVersion, req.headers.host === '127.0.0.1:' + port, req.headers.connection, req.headers['content-type']);
  let body = '';
  req.setEncoding('utf8');
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    console.log('server: body', JSON.stringify(body), req.complete);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('X-Test', ['a', 'b']);
    res.end('hello ' + req.method + ' ' + body);
  });
  // Node.js 22 closes the response first and Node.js 26 the request: only
  // that both close is compared.
  let closed = 0;
  const close = () => { if (++closed === 2) console.log('server: req and res close'); };
  req.on('close', close);
  res.on('finish', () => console.log('server: res finish', res.writableFinished));
  res.on('close', close);
});
let port;
server.listen(0, '127.0.0.1', () => {
  port = server.address().port;
  console.log('listening', server.address().address, server.address().family, server.listening);
  http.get('http://127.0.0.1:' + port + '/path?x=1', res => {
    console.log('client:', res.statusCode, res.statusMessage, res.httpVersion);
    const h = Object.assign({}, res.headers); delete h.date;
    console.log('client headers:', JSON.stringify(h), typeof res.headers.date);
    console.log('client raw:', JSON.stringify(res.rawHeaders.filter((v, i, a) => a[i - (i % 2)] !== 'Date')));
    let data = '';
    res.on('data', c => { data += c; });
    res.on('end', () => {
      console.log('client: body', data);
      const req = http.request({ port, host: '127.0.0.1', method: 'POST', path: '/submit', headers: { 'Content-Type': 'application/json' } }, res2 => {
        console.log('client2:', res2.statusCode, res2.headers['content-length'], res2.headers['transfer-encoding'], req.reusedSocket);
        res2.setEncoding('utf8');
        res2.on('data', c => console.log('client2 data', c));
        res2.on('end', () => { console.log('client2 end'); server.close(() => console.log('server closed', server.listening)); });
      });
      req.on('socket', () => console.log('client2: socket'));
      req.on('finish', () => console.log('client2: finish'));
      req.on('close', () => console.log('client2: req close'));
      req.write('{"a":');
      req.end('1}');
    });
    res.on('close', () => console.log('client: res close'));
  });
});
`,false));

test('node:http: headers: duplicates, writeHead, progressive API, validation, HEAD and 204',()=>expectNode(String.raw`import http from 'node:http';
const server = http.createServer((req, res) => {
  const h = req.headers;
  console.log('cookie', h.cookie, 'set-cookie?', JSON.stringify(h['x-multi']), h['user-agent'], JSON.stringify(req.headersDistinct['x-multi']));
  console.log('raw', JSON.stringify(req.rawHeaders.map(v => v.startsWith('127.0.0.1:') ? 'HOST' : v)));
  if (req.url === '/write-head') {
    res.writeHead(201, 'Made It', { 'X-One': '1', 'Content-Type': 'text/html' });
    console.log('headersSent', res.headersSent);
    try { res.setHeader('X-Late', '1'); } catch (e) { console.log(e.code, e.message); }
    res.write('<b>');
    res.write(Buffer.from('bold'));
    res.end('</b>');
  } else if (req.url === '/no-content') {
    res.statusCode = 204;
    res.end('ignored');
  } else if (req.url === '/progressive') {
    res.setHeader('X-A', 'a'); res.setHeader('x-b', 'b'); res.appendHeader('X-A', 'a2');
    console.log(JSON.stringify(res.getHeaderNames()), JSON.stringify(res.getHeaders()), res.hasHeader('X-B'), JSON.stringify(res.getHeader('x-a')));
    res.removeHeader('x-b');
    for (const bad of [['Bad Name', 'v'], ['X-Ok', 'a\r\nb'], ['X-Undef', undefined]]) {
      try { res.setHeader(bad[0], bad[1]); } catch (e) { console.log(e.name, e.code, e.message); }
    }
    try { res.writeHead(99); } catch (e) { console.log(e.name, e.code, e.message); }
    res.writeHead(404, { 'X-C': 'c' });
    res.end();
  } else if (req.method === 'HEAD') {
    res.setHeader('Content-Length', '42');
    res.end();
  } else { res.statusMessage = 'Fine'; res.end(JSON.stringify(Object.keys(req.headers))); }
});
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const fetch = (path, method, headers) => new Promise(resolve => {
    const req = http.request({ port, host: '127.0.0.1', path, method, headers }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        const h = Object.assign({}, res.headers); delete h.date;
        console.log(method || 'GET', path, res.statusCode, res.statusMessage, JSON.stringify(h), JSON.stringify(body));
        resolve();
      });
    });
    req.end();
  });
  await fetch('/write-head', 'GET', [['Host', 'x'], ['Cookie', 'a=1'], ['Cookie', 'b=2'], ['X-Multi', 'x'], ['x-multi', 'y'], ['User-Agent', 'one'], ['User-Agent', 'two']]);
  await fetch('/no-content');
  await fetch('/progressive');
  await fetch('/head', 'HEAD');
  await fetch('/other', 'PUT', { 'X-Custom': 'v', 'Content-Length': '0' });
  server.close();
});
`,false));

test('node:http: the global agent keeps connections alive, agent:false closes them, maxSockets queues requests',()=>expectNode(String.raw`import http from 'node:http';
const sockets = new Set();
const server = http.createServer((req, res) => {
  sockets.add(req.socket);
  res.end(req.url);
});
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const get = (path, agent) => new Promise((resolve, reject) => {
    const req = http.get({ port, host: '127.0.0.1', path, agent }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { console.log(path, body, res.headers.connection, req.reusedSocket); resolve(); });
    });
    req.on('error', reject);
  });
  for (let i = 0; i < 4; i++) await get('/ka' + i);
  console.log('sockets after keep-alive', sockets.size);
  await get('/close1', false);
  await get('/close2', false);
  console.log('sockets after agent false', sockets.size);
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  await Promise.all([get('/q1', agent), get('/q2', agent), get('/q3', agent)]);
  console.log('sockets after queued', sockets.size, agent.getName({ host: 'h', port: 1 }));
  agent.destroy();
  server.close(() => console.log('closed'));
});
`,false));

test('node:http: large request and response bodies, chunked responses, for await and pipe',()=>expectNode(String.raw`import http from 'node:http';
import { Buffer } from 'node:buffer';
const server = http.createServer(async (req, res) => {
  if (req.url === '/echo') { req.pipe(res); return; }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  let sum = 0; for (let i = 0; i < body.length; i++) sum = (sum * 31 + body[i]) >>> 0;
  res.setHeader('X-Sum', String(sum));
  res.write('len=' + body.length);
  for (let i = 0; i < 3; i++) res.write(' part' + i);
  res.end();
});
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const big = Buffer.alloc(300000);
  for (let i = 0; i < big.length; i++) big[i] = (i * 13) & 255;
  let expected = 0; for (let i = 0; i < big.length; i++) expected = (expected * 31 + big[i]) >>> 0;
  const req = http.request({ port, host: '127.0.0.1', method: 'POST', path: '/upload', headers: { 'Content-Length': big.length } }, res => {
    let text = '';
    res.on('data', c => text += c);
    res.on('end', () => {
      console.log(res.headers['x-sum'] === String(expected), res.headers['transfer-encoding'], text);
      const echo = http.request({ port, host: '127.0.0.1', method: 'POST', path: '/echo' }, res => {
        const parts = [];
        res.on('data', c => parts.push(c));
        res.on('end', () => {
          const back = Buffer.concat(parts);
          console.log('echo', back.length, back.equals(big), res.headers['transfer-encoding']);
          server.close();
        });
      });
      for (let i = 0; i < big.length; i += 65536) echo.write(big.subarray(i, i + 65536));
      echo.end();
    });
  });
  req.end(big);
});
`,false));

test('node:http: refused connections, malformed requests, pipelining, HTTP/1.0, chunked trailers, header overflow, EADDRINUSE',()=>expectNode(String.raw`import http from 'node:http';
import net from 'node:net';
const req = http.get('http://127.0.0.1:1/');
req.on('error', e => {
  console.log('refused', e.code, e.syscall, e.address, e.port, e.message);
  const server = http.createServer((req, res) => { res.end('ok ' + req.method + ' ' + req.url); });
  server.on('clientError', (err, socket) => { console.log('clientError', err.code); socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); });
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    const send = (raw) => new Promise(resolve => {
      const socket = net.connect(port, '127.0.0.1', () => socket.write(raw));
      let text = '';
      socket.setEncoding('latin1');
      socket.on('data', d => text += d);
      socket.on('close', () => { console.log(JSON.stringify(text.replace(/Date: [^\r]*\r\n/g, ''))); resolve(); });
    });
    (async () => {
      await send('BREW /pot HTTP/1.1\r\nHost: x\r\n\r\n');
      server.removeAllListeners('clientError');
      await send('GET / HTTP/1.1\r\nBad Header\r\n\r\n');
      await send('GET / HTTP/1.1\r\n\r\n');
      await send('GET /a HTTP/1.1\r\nHost: x\r\n\r\nGET /b HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
      await send('GET /old HTTP/1.0\r\n\r\n');
      await send('POST /c HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n3\r\nabc\r\n0\r\nX-Trailer: t\r\n\r\n');
      await send('GET / HTTP/1.1\r\nHost: x\r\nX-Big: ' + 'a'.repeat(20000) + '\r\n\r\n');
      const other = http.createServer();
      other.on('error', e => { console.log('listen error', e.code, e.syscall); server.close(() => console.log('closed')); });
      other.listen(port, '127.0.0.1');
    })();
  });
});
`,false));

test('node:http: the client reads EOF-delimited, chunked and 1xx responses and reports parse errors, hang-ups and timeouts',()=>expectNode(String.raw`import http from 'node:http';
import net from 'node:net';
const raw = net.createServer(socket => {
  let request = '';
  socket.on('data', d => {
    request += d;
    if (!request.includes('\r\n\r\n')) return;
    const path = request.split(' ')[1];
    if (path === '/eof') socket.end('HTTP/1.0 200 OK\r\nX-Kind: eof\r\n\r\nuntil the end');
    else if (path === '/chunked') { socket.write('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n5\r\nhello\r\n'); setTimeout(() => socket.end('6\r\n world\r\n0\r\n\r\n'), 20); }
    else if (path === '/continue') socket.end('HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok');
    else if (path === '/garbage') socket.end('NOT HTTP\r\n\r\n');
    else if (path === '/hangup') socket.destroy();
    else if (path === '/slow') {}
  });
});
raw.listen(0, '127.0.0.1', async () => {
  const port = raw.address().port;
  const get = path => new Promise(resolve => {
    const req = http.get({ port, host: '127.0.0.1', path, agent: false, timeout: path === '/slow' ? 100 : undefined }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { console.log(path, res.statusCode, res.headers['x-kind'], JSON.stringify(body), res.complete); resolve(); });
    });
    req.on('information', info => console.log('information', info.statusCode));
    req.on('timeout', () => { console.log('timeout'); req.destroy(); });
    req.on('error', e => { console.log(path, 'error', e.code, e.message); resolve(); });
  });
  for (const path of ['/eof', '/chunked', '/continue', '/garbage', '/hangup', '/slow']) await get(path);
  raw.close();
});
`,false));

test('node:http: status tables, validators, protocol and path checks, Basic auth, array headers and 100-continue',()=>expectNode(String.raw`import http, { STATUS_CODES, METHODS, validateHeaderName, validateHeaderValue } from 'node:http';
console.log(STATUS_CODES[404], STATUS_CODES[418], METHODS.length, METHODS.includes('PATCH'), http.maxHeaderSize, typeof http.globalAgent.addRequest);
try { validateHeaderName('a b'); } catch (e) { console.log(e.code); }
try { validateHeaderValue('x', 'a\nb'); } catch (e) { console.log(e.code); }
try { http.request('https://example.com/'); } catch (e) { console.log(e.code, e.message); }
try { http.request({ path: '/a b' }); } catch (e) { console.log(e.code, e.message); }
try { http.request({ method: 'GE T' }); } catch (e) { console.log(e.code); }
const server = http.createServer({ keepAliveTimeout: 2000 });
server.on('request', (req, res) => {
  if (req.url === '/continue') { res.end('continued ' + req.headers.expect); return; }
  res.writeHead(200, ['X-Arr', '1', 'X-Arr', '2']);
  res.end(req.headers.authorization);
});
server.on('checkContinue', (req, res) => { console.log('checkContinue'); res.writeContinue(); server.emit('request', req, res); });
server.listen({ port: 0, host: '127.0.0.1' }, () => {
  const port = server.address().port;
  const req = http.request({ port, hostname: '127.0.0.1', auth: 'user:pass', path: '/auth' }, res => {
    console.log(res.statusCode, JSON.stringify(res.rawHeaders.filter((v, i, a) => a[i - (i % 2)] !== 'Date')));
    res.setEncoding('utf8');
    res.on('data', d => console.log('auth', d));
    res.on('end', () => {
      const c = http.request({ port, host: '127.0.0.1', path: '/continue', method: 'POST', headers: { Expect: '100-continue', 'Content-Length': 3 } }, res => {
        res.on('data', d => console.log(String(d)));
        res.on('end', () => server.close(() => console.log('done')));
      });
      c.on('continue', () => { console.log('client continue'); c.end('abc'); });
    });
  });
  req.end();
});
`,false));

test('node:http: many concurrent requests with garbage in every handler',()=>expectNode(String.raw`import http from 'node:http';
// Many requests with garbage in every handler: the collector runs many times
// while sockets, parsers and messages are live.
let served = 0;
const server = http.createServer((req, res) => {
  const garbage = [];
  for (let i = 0; i < 200; i++) garbage.push({ i, s: 'x' + i, a: [i, i + 1] });
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => { served++; res.setHeader('X-N', String(garbage.length)); res.end(body.toUpperCase()); });
});
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  let ok = 0;
  for (let round = 0; round < 30; round++) {
    await Promise.all([0, 1, 2, 3].map(k => new Promise((resolve, reject) => {
      const req = http.request({ port, host: '127.0.0.1', method: 'POST', path: '/r' + round }, res => {
        let text = '';
        res.on('data', c => text += c);
        res.on('end', () => { if (text === 'BODY-' + round + '-' + k && res.headers['x-n'] === '200') ok++; resolve(); });
      });
      req.on('error', reject);
      req.end('body-' + round + '-' + k);
    })));
  }
  console.log('served', served, 'ok', ok);
  server.close(() => console.log('closed'));
});
`,false));

test('node:http: Upgrade requests hand the socket and the remaining bytes to both sides',()=>expectNode(String.raw`import http from 'node:http';
import net from 'node:net';
const server = http.createServer((req, res) => res.end('plain'));
server.on('upgrade', (req, socket, head) => {
  console.log('upgrade', req.headers.upgrade, JSON.stringify(String(head)));
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: echo\r\nConnection: Upgrade\r\n\r\n');
  socket.on('data', d => { socket.end('echo:' + d); });
});
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const req = http.request({ port, host: '127.0.0.1', headers: { Connection: 'Upgrade', Upgrade: 'echo' } });
  req.on('upgrade', (res, socket, head) => {
    console.log('client upgrade', res.statusCode, res.headers.upgrade);
    socket.write('ping');
    socket.on('data', d => console.log('got', String(d)));
    socket.on('end', () => server.close(() => console.log('closed')));
  });
  req.end();
});
`,false));
