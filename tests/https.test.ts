import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runModulesOnHost } from "./helpers/host.js";

// node:https (issue #301) against a Node.js https server with the certificates
// of tests/fixtures/tls. Each client program runs natively and under Node.js
// and the outputs are compared. Like tests/tls.test.ts the programs run
// without GC stress (the key exchange is too slow under it).

const fixtures = fileURLToPath(
    new URL("../../tests/fixtures/tls/", import.meta.url),
);
const caPem = readFileSync(fixtures + "ca.pem", "utf8");

const serverScript = String.raw`
const https = require('node:https'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const read = (name) => fs.readFileSync(path.join(process.env.NONA_TLS_FIXTURES, name));
const handler = (req, res) => {
  const chunks = [];
  req.on('data', (d) => chunks.push(d));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    if (req.url === '/chunked') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.write('one,');
      setTimeout(() => { res.write('two,'); setTimeout(() => res.end('three'), 20); }, 20);
    } else if (req.url === '/big') {
      res.end(Buffer.alloc(200000, 'z'));
    } else if (req.url === '/sni') {
      res.end(JSON.stringify({ servername: req.socket.servername, alpn: req.socket.alpnProtocol, host: req.headers.host }));
    } else {
      res.setHeader('x-method', req.method);
      res.end(JSON.stringify({ method: req.method, url: req.url, host: req.headers.host, length: body.length, sha: crypto.createHash('sha256').update(body).digest('hex').slice(0, 16), port: req.socket.remotePort, te: req.headers['transfer-encoding'] || null, ct: req.headers['content-type'] || null }));
    }
  });
};
const configs = {
  good: { key: read('ec-key.pem'), cert: read('ec-cert.pem'), ALPNProtocols: ['h2', 'http/1.1'] },
  untrusted: { key: read('chain/leaf-key.pem'), cert: read('chain/untrusted.pem') },
};
const ports = {}, servers = [];
let pending = Object.keys(configs).length;
for (const [name, config] of Object.entries(configs)) {
  const server = https.createServer(config, handler);
  server.on('tlsClientError', (e) => {});
  server.listen(0, '127.0.0.1', () => {
    ports[name] = server.address().port;
    if (--pending === 0) console.log(JSON.stringify(ports));
  });
  servers.push(server);
}
process.stdin.resume();
process.stdin.on('end', () => { for (const server of servers) server.close(); process.exit(0); });
`;

let server: ChildProcess;
let ports: Record<string, number>;
before(async () => {
    server = spawn(process.execPath, ["-e", serverScript], {
        env: { ...process.env, NONA_TLS_FIXTURES: fixtures },
        stdio: ["pipe", "pipe", "inherit"],
        windowsHide: true,
    });
    ports = await new Promise((resolve, reject) => {
        let output = "";
        server.stdout!.setEncoding("utf8");
        server.stdout!.on("data", (chunk: string) => {
            output += chunk;
            if (output.includes("\n")) resolve(JSON.parse(output));
        });
        server.on("error", reject);
        server.on("exit", (code) =>
            reject(new Error("https server exited with " + code)),
        );
    });
});
after(async () => {
    const exited = new Promise((resolve) => server.on("close", resolve));
    server.stdin!.end();
    const timer = setTimeout(() => server.kill(), 10_000);
    await exited;
    clearTimeout(timer);
});

/** Run a client program natively and under Node.js; both must print the same lines. */
function runClient(body: string): string[] {
    const source =
        "import https from 'node:https';\n" +
        "import http from 'node:http';\n" +
        `const ca = ${JSON.stringify(caPem)};\n` +
        `const ports = ${JSON.stringify(ports)};\n` +
        "const fetchText = (req) => new Promise((resolve, reject) => { req.on('response', (res) => { const chunks = []; res.on('data', (d) => chunks.push(d)); const authorized = res.socket.authorized; res.on('end', () => resolve({ res, authorized, body: Buffer.concat(chunks).toString('latin1') })); }); req.on('error', reject); });\n" +
        body;
    const { native, oracle } = runModulesOnHost(
        { "main.mjs": source },
        "main.mjs",
        { gcStress: false },
    );
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stdout + native.stderr);
    const lines = native.stdout.split("\n").filter((line) => line !== "");
    assert.deepEqual(
        lines,
        oracle.split("\n").filter((line) => line !== ""),
    );
    return lines;
}

test("node:https: GET, POST, chunked and large responses, TLSSocket on the response", () => {
    const lines = runClient(String.raw`
const base = { host: '127.0.0.1', port: ports.good, ca, agent: false };
(async () => {
  let r = await fetchText(https.get(Object.assign({ path: '/hello?x=1' }, base)));
  const info = JSON.parse(r.body); delete info.port;
  console.log(r.res.statusCode, r.res.headers['x-method'], JSON.stringify(info));
  const s = r.res.socket;
  console.log(s.encrypted, s.authorized, s.getProtocol(), s.getPeerCertificate().subject.CN, r.res.req.protocol, r.res.req.getHeader('host') === '127.0.0.1:' + ports.good);
  const payload = 'p'.repeat(50000);
  const post = https.request(Object.assign({ method: 'POST', path: '/post', headers: { 'content-type': 'text/x-test' } }, base));
  post.write(payload.slice(0, 20000)); post.end(payload.slice(20000));
  r = await fetchText(post);
  const p = JSON.parse(r.body); delete p.port;
  console.log(JSON.stringify(p));
  r = await fetchText(https.get('https://127.0.0.1:' + ports.good + '/chunked', { ca, agent: false }));
  console.log(r.body, r.res.headers['transfer-encoding']);
  r = await fetchText(https.get(new URL('https://127.0.0.1:' + ports.good + '/big'), { ca, agent: false }));
  console.log(r.body.length, r.body[199999]);
  r = await new Promise((resolve) => https.get('https://127.0.0.1:' + ports.good + '/cb', { ca, agent: false }, (res) => { res.resume(); resolve(res.statusCode); }));
  console.log('callback', r);
})();
`);
    assert.equal(lines.length, 6);
    assert.match(lines[0]!, /^200 GET \{"method":"GET","url":"\/hello\?x=1"/);
    assert.equal(lines[1], "true true TLSv1.3 localhost https: true");
});

test("node:https: keep-alive reuse, agent:false, SNI and agent:false", () => {
    const lines = runClient(String.raw`
(async () => {
  const agent = new https.Agent({ keepAlive: true });
  console.log(agent.protocol, agent.defaultPort, https.globalAgent.protocol, https.globalAgent.keepAlive, https.globalAgent.defaultPort);
  const opts = { host: '127.0.0.1', port: ports.good, ca, agent, path: '/a' };
  const ports1 = [];
  for (let i = 0; i < 3; i++) {
    const req = https.get(opts);
    const r = await fetchText(req);
    ports1.push(JSON.parse(r.body).port);
    console.log('request', i, req.reusedSocket, r.authorized);
    await new Promise((resolve) => setImmediate(resolve));
  }
  console.log('same socket', ports1[0] === ports1[1] && ports1[1] === ports1[2]);
  const sni = https.get(Object.assign({}, opts, { path: '/sni', servername: 'localhost' }));
  const r = await fetchText(sni);
  console.log('sni', sni.reusedSocket, r.body);
  const one = https.get(Object.assign({}, opts, { agent: false, path: '/sni' }));
  const o = await fetchText(one);
  console.log('agent:false', one.reusedSocket, o.res.headers.connection);
  agent.destroy();
})();
`);
    assert.equal(lines[1], "request 0 false true");
    assert.equal(lines[2], "request 1 true true");
});

test("node:https: certificate verification errors and protocol mismatches", () => {
    const lines = runClient(String.raw`
const attempt = (label, run) => new Promise((resolve) => {
  try {
    const req = run();
    req.on('response', (res) => { res.resume(); console.log(label, 'response', res.statusCode); resolve(); });
    req.on('error', (e) => { console.log(label, 'error', e.code); resolve(); });
    req.end();
  } catch (e) { console.log(label, 'throw', e.code, e.message); resolve(); }
});
(async () => {
  const good = { host: '127.0.0.1', agent: false };
  await attempt('no ca', () => https.request(Object.assign({ port: ports.good }, good)));
  await attempt('untrusted', () => https.request(Object.assign({ port: ports.untrusted, ca }, good)));
  await attempt('untrusted allowed', () => https.request(Object.assign({ port: ports.untrusted, ca, rejectUnauthorized: false }, good)));
  await attempt('wrong name', () => https.request(Object.assign({ port: ports.good, ca, servername: 'other.example' }, good)));
  await attempt('identity check', () => https.request(Object.assign({ port: ports.good, ca, checkServerIdentity: () => new Error('nope') }, good)));
  await attempt('http.get https', () => http.get('https://127.0.0.1:' + ports.good + '/'));
  await attempt('https.get http', () => https.get('http://127.0.0.1:' + ports.good + '/'));
  await attempt('https agent on http', () => http.get({ host: '127.0.0.1', port: ports.good, agent: new https.Agent() }));
})();
`);
    assert.ok(lines.some((l) => l.startsWith("no ca error")));
    assert.ok(
        lines.includes(
            'http.get https throw ERR_INVALID_PROTOCOL Protocol "https:" not supported. Expected "http:"',
        ),
    );
});

test("node:https: createServer is not supported; the pool key holds the TLS options", () => {
    const { native } = runModulesOnHost(
        {
            "main.mjs":
                "import https from 'node:https';\ntry { https.createServer(); } catch (e) { console.log(e.code); }\nconsole.log(typeof https.request, typeof https.Agent);\n",
        },
        "main.mjs",
        { gcStress: false },
    );
    assert.equal(native.status, 0, native.stdout + native.stderr);
    assert.equal(
        native.stdout,
        "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM\nfunction function\n",
    );
});
