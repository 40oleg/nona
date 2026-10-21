import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

// x.end(JSON.stringify(...)) is lowered to the UTF-8 byte path of node:http
// (#155) when x.end is node:http's own end and JSON.stringify the intrinsic.
// Each program runs on the host target and under Node.js; the outputs must be
// identical. As in http.test.ts, programs that import node:http run without
// GC stress; the lowering's fallback is checked under GC stress below.
function expectNode(source: string, gcStress: boolean): void {
    const { native, oracle } = runModulesOnHost(
        { "main.mjs": source },
        "main.mjs",
        { gcStress },
    );
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr);
    assert.ok(oracle.length > 0);
    assert.equal(native.stdout, oracle);
}

test("node:http: res.end(JSON.stringify(x)) sends the UTF-8 bytes and their Content-Length", () =>
    expectNode(
        String.raw`import http from 'node:http';
import net from 'node:net';
const payloads = {
  ascii: { a: [1, 2, { b: 'c' }], n: null, t: true },
  latin: { s: 'Latin-1 éàü ÿ', k: 'Кириллица 中文' },
  emoji: { e: '🎉👍🏽', key: { '😀': ['😀'] } },
  lone: { hi: '\ud800', lo: 'x\udfff', pair: 'a𐀀b', ctrl: '\u0000\u001f\n"\\' },
  big: Array.from({ length: 3000 }, (_, i) => ({ i, s: 'ж' + i + '🎉' })),
};
const cycle = { a: 1 }; cycle.self = cycle;
const server = http.createServer((req, res) => {
  const name = req.url.slice(1);
  if (name === 'spaced') return res.end(JSON.stringify(payloads.latin, null, '\t'));
  if (name === 'replacer') return res.end(JSON.stringify(payloads.ascii, (k, v) => typeof v === 'number' ? v * 10 : v, 2));
  if (name === 'keys') return res.end(JSON.stringify(payloads.ascii, ['a', 'n']));
  if (name === 'tojson') return res.end(JSON.stringify({ toJSON() { return ['é', -0, NaN, 1e21]; } }));
  if (name === 'undefined') { res.setHeader('X-Kind', 'none'); return res.end(JSON.stringify(undefined)); }
  if (name === 'function') return res.end(JSON.stringify(() => 1));
  if (name === 'cycle' || name === 'bigint') {
    try { res.end(JSON.stringify(name === 'cycle' ? cycle : { n: 1n })); }
    catch (e) { console.log('server:', name, e.name, res.headersSent, res.writableEnded); }
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: name }));
  }
  if (name === 'chained') { res.writeHead(201, { 'Content-Type': 'application/json' }); console.log('server: returns res', res.end(JSON.stringify(payloads.emoji)) === res); return; }
  // Other bytes take the same path as the serializer's: views keep their offset.
  if (name === 'view') return res.end(Buffer.from('xxé🎉yy').subarray(2, 8));
  if (name === 'uint8') return res.end(new Uint8Array([0x7b, 0x7d, 0xff]).subarray(1));
  if (name === 'head') return res.end(JSON.stringify(payloads.emoji));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payloads[name]));
});
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const get = (path, method = 'GET') => new Promise(resolve => {
    http.request({ port, host: '127.0.0.1', path, method }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        console.log(path, method, res.statusCode, res.headers['content-length'], res.headers['content-type'], res.headers['x-kind'], body.length,
          body.length < 200 ? body.toString('hex') : body.reduce((h, b) => (h * 31 + b) % 1000003, 0));
        resolve();
      });
    }).end();
  });
  for (const name of ['ascii', 'latin', 'emoji', 'lone', 'big', 'spaced', 'replacer', 'keys', 'tojson', 'undefined', 'function', 'cycle', 'bigint', 'chained', 'view', 'uint8'])
    await get('/' + name);
  await get('/head', 'HEAD');
  server.close(() => console.log('closed'));
});
`,
        false,
    ));

test("node:http: a replaced res.end, a replaced JSON.stringify or a shadowed JSON takes the ordinary calls", () =>
    expectNode(
        String.raw`import http from 'node:http';
const original = JSON.stringify;
const server = http.createServer((req, res) => {
  const name = req.url.slice(1);
  if (name === 'end') {
    const end = res.end;
    res.end = function (chunk) { console.log('server: own end', typeof chunk, chunk); return end.call(this, chunk + '!'); };
    res.end(JSON.stringify({ é: 1 }));
  } else if (name === 'stringify') {
    JSON.stringify = function (v, r, s) { console.log('server: own stringify', arguments.length, typeof r, s); return original(v) + '?'; };
    try { res.end(JSON.stringify({ é: 2 }, null, 0)); } finally { JSON.stringify = original; }
  } else if (name === 'shadowed') {
    const JSON = { stringify(v) { console.log('server: shadowed', this === JSON); return '"shadowed ' + v.x + '"'; } };
    res.end(JSON.stringify({ x: 'ж' }));
  } else if (name === 'alias') {
    // A local JSON whose stringify is the intrinsic one serializes the same.
    const JSON = globalThis.JSON;
    res.end(JSON.stringify(['alias', '🎉']));
  } else if (name === 'getter') {
    // x.end is read once, before JSON.stringify and the arguments.
    const proto = Object.getPrototypeOf(res);
    let reads = 0;
    Object.defineProperty(res, 'end', { configurable: true, get() { reads++; console.log('server: get end'); return proto.end; } });
    res.end(JSON.stringify({ get v() { console.log('server: value read', reads); return 'v'; } }));
    delete res.end;
  } else if (name === 'string') {
    const end = res.end;
    res.end = function (chunk) { console.log('server: chunk type', typeof chunk); return end.call(this, chunk); };
    res.end(JSON.stringify('plain'));
  }
});
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  for (const name of ['end', 'stringify', 'shadowed', 'alias', 'getter', 'string']) {
    await new Promise(resolve => http.get({ port, host: '127.0.0.1', path: '/' + name }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { console.log(name, res.headers['content-length'], Buffer.concat(chunks).toString('hex')); resolve(); });
    }));
  }
  server.close(() => console.log('closed'));
});
`,
        false,
    ));

test("x.end(JSON.stringify(...)) on other receivers keeps the order and results of the two calls under GC stress", () =>
    expectNode(
        String.raw`const log = [];
const tracked = (name, value) => { log.push(name); return value; };
const sink = { end(chunk) { log.push('end ' + typeof chunk + ' ' + chunk); return 'result'; } };
const receiver = new Proxy(sink, { get(target, key, r) { log.push('get ' + String(key)); return Reflect.get(target, key, r); } });
console.log(tracked('receiver', receiver).end(JSON.stringify(tracked('value', { a: 'é' }), tracked('replacer', null), tracked('space', 1))));
console.log(log.join(' | '));
log.length = 0;
console.log(receiver.end(JSON.stringify(undefined)), receiver.end(JSON.stringify(1n === 1n ? [1, 'x'] : 0)));
try { receiver.end(JSON.stringify({ n: 1n })); } catch (e) { console.log(e.name); }
const cyclic = []; cyclic.push(cyclic);
try { receiver.end(JSON.stringify(cyclic)); } catch (e) { console.log(e.name); }
try { ({ end: 1 }).end(JSON.stringify(tracked('evaluated', 1))); } catch (e) { console.log(e.name); }
try { null.end(JSON.stringify(tracked('skipped', 1))); } catch (e) { console.log(e.name); }
console.log(log.join(' | '));
{
  const JSON = { stringify: function () { return 'local ' + arguments.length; } };
  console.log(sink.end(JSON.stringify()), sink.end(JSON.stringify(1, 2)));
}
console.log(sink.end(JSON.stringify({ toJSON(key) { return 'key:' + key; } })), log.slice(-3).join(' | '));
`,
        true,
    ));
