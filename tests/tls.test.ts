import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash, X509Certificate } from "node:crypto";
import { fileURLToPath } from "node:url";
import { runModulesOnHost } from "./helpers/host.js";

// node:tls (issue #301) against Node.js TLS servers. Nona has no
// tls.createServer yet, so the programs cannot be compared with an oracle
// run of themselves: one Node.js child process listens with the
// certificates of tests/fixtures/tls (one server per cipher suite, key type
// and HelloRetryRequest, plus a TLS 1.2-only one), prints its ports, and
// native programs connect to it. Like tests/http.test.ts the socket
// programs run without GC stress: under it even one handshake takes more
// than a minute (the key exchange allocates in its inner loops).

const fixtures = fileURLToPath(
    new URL("../../tests/fixtures/tls/", import.meta.url),
);
const fixture = (name: string) => readFileSync(fixtures + name, "utf8");
const caPem = fixture("ca.pem");

const chainServers: Record<string, string[]> = {
    chain: ["leaf", "inter"],
    leafOnly: ["leaf"],
    outOfOrder: ["leaf", "untrusted-ca", "expired", "root", "inter"],
    expired: ["expired", "inter"],
    future: ["future", "inter"],
    wrongHost: ["wrong-host", "inter"],
    selfSigned: ["self-signed"],
    untrusted: ["untrusted"],
    untrustedChain: ["untrusted", "untrusted-ca"],
    badSignature: ["bad-signature", "inter"],
    clientOnly: ["client-only", "inter"],
    critical: ["critical", "inter"],
    deep: ["deep", "inter2", "inter"],
    belowNotCa: ["below-not-ca", "not-ca"],
    cnOnly: ["cn-only", "inter"],
    direct: ["direct"],
};
const serverScript = String.raw`
const tls = require('node:tls'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const read = (name) => fs.readFileSync(path.join(process.env.NONA_TLS_FIXTURES, name));
const configs = {
  ec128: { key: 'ec-key.pem', cert: 'ec-cert.pem', ciphers: 'TLS_AES_128_GCM_SHA256', ALPNProtocols: ['h2', 'http/1.1'] },
  rsa256: { key: 'rsa-key.pem', cert: 'rsa-cert.pem', ciphers: 'TLS_AES_256_GCM_SHA384' },
  ecChacha: { key: 'ec-key.pem', cert: 'ec-cert.pem', ciphers: 'TLS_CHACHA20_POLY1305_SHA256' },
  rsaRetry: { key: 'rsa-key.pem', cert: 'rsa-cert.pem', ciphers: 'TLS_AES_128_GCM_SHA256', ecdhCurve: 'P-256' },
  tls12: { key: 'ec-key.pem', cert: 'ec-cert.pem', maxVersion: 'TLSv1.2' },
};
// Certificate chains of tests/fixtures/tls/chain: name -> certificates sent.
const chains = ${JSON.stringify(chainServers)};
for (const [name, certs] of Object.entries(chains))
  configs[name] = { key: 'chain/leaf-key.pem', cert: certs.map((c) => 'chain/' + c + '.pem') };
const ports = {}, servers = [];
let pending = Object.keys(configs).length;
for (const [name, config] of Object.entries(configs)) {
  const options = Object.assign({}, config, { key: read(config.key), cert: [].concat(config.cert).map((c) => read(c).toString()).join(''), allowHalfOpen: true });
  const server = tls.createServer(options, (socket) => {
    socket.write('hello ' + socket.getProtocol() + ' ' + socket.getCipher().standardName + ' ' + socket.alpnProtocol + ' ' + socket.servername + '\n');
    const chunks = [];
    socket.on('data', (d) => chunks.push(d));
    socket.on('end', () => {
      const got = Buffer.concat(chunks);
      if (got.toString('latin1').includes('big')) socket.write(Buffer.alloc(100000, 'b'));
      socket.end(name + ' got ' + got.length + ' ' + crypto.createHash('sha256').update(got).digest('hex').slice(0, 16) + '\n');
    });
    socket.on('error', (e) => console.log(name, 'socket error', e.code));
  });
  server.on('tlsClientError', (e) => console.log(name, 'tlsClientError', e.code));
  server.listen(0, '127.0.0.1', () => {
    ports[name] = server.address().port;
    if (--pending === 0) console.log(JSON.stringify(ports));
  });
  servers.push(server);
}
process.stdin.resume();
process.stdin.on('end', () => { for (const server of servers) server.close(); });
`;

let server: ChildProcess;
let ports: Record<string, number>;
let serverOutput = "";
before(async () => {
    server = spawn(process.execPath, ["-e", serverScript], {
        env: { ...process.env, NONA_TLS_FIXTURES: fixtures },
        stdio: ["pipe", "pipe", "inherit"],
        windowsHide: true,
    });
    ports = await new Promise((resolve, reject) => {
        let resolved = false;
        server.stdout!.setEncoding("utf8");
        server.stdout!.on("data", (chunk: string) => {
            serverOutput += chunk;
            const newline = serverOutput.indexOf("\n");
            if (!resolved && newline >= 0) {
                resolved = true;
                resolve(JSON.parse(serverOutput.slice(0, newline)));
                serverOutput = serverOutput.slice(newline + 1);
            }
        });
        server.on("error", reject);
        server.on("exit", (code) =>
            reject(new Error("TLS server exited with " + code)),
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
/** Server log lines written since the last call. */
async function takeServerLog(): Promise<string[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const lines = serverOutput.split("\n").filter((line) => line !== "");
    serverOutput = "";
    return lines;
}

function runClient(body: string): string[] {
    const source =
        "import tls from 'node:tls';\n" +
        "import net from 'node:net';\n" +
        "import { createHash } from 'node:crypto';\n" +
        `const ca = ${JSON.stringify(caPem)};\n` +
        `const ports = ${JSON.stringify(ports)};\n` +
        "const short = (data) => { const text = data.toString('latin1'); return text.length > 120 ? text.slice(0, 60) + '...' + text.length + '...' + text.slice(-60) : text; };\n" +
        body;
    const { native } = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
        gcStress: false,
        oracleSource: "",
    });
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stdout + native.stderr);
    return native.stdout.split("\n").filter((line) => line !== "");
}

const certificate = (name: string) => new X509Certificate(fixture(name));
const sha16 = (data: string | Buffer) =>
    createHash("sha256").update(data).digest("hex").slice(0, 16);
function describeCertificate(name: string) {
    const x509 = certificate(name);
    return [
        "localhost",
        "Nona Test CA",
        x509.subjectAltName,
        x509.serialNumber,
        name.startsWith("rsa") ? 2048 : 256,
        x509.validTo,
        x509.fingerprint256,
    ].join(" ");
}

test("node:tls: TLS 1.3 with every cipher suite, ECDSA and RSA-PSS certificates, HelloRetryRequest, ALPN and half-close", async () => {
    const lines = runClient(String.raw`
function run(name, options, payload) {
  return new Promise((resolve) => {
    const socket = tls.connect(Object.assign({ port: ports[name], ca }, options), () => {
      const cipher = socket.getCipher(), cert = socket.getPeerCertificate();
      console.log(name, 'secureConnect', socket.authorized, socket.authorizationError, socket.getProtocol(), cipher.name, cipher.version, socket.alpnProtocol, socket.encrypted);
      console.log(name, 'cert', cert.subject.CN, cert.issuer.CN, cert.subjectaltname, cert.serialNumber, cert.bits, cert.valid_to, cert.fingerprint256);
      console.log(name, 'key exchange', socket.getEphemeralKeyInfo().name, socket._engine.retried);
      console.log(name, 'addresses', socket.remoteAddress, socket.remotePort === ports[name], typeof socket.localPort, socket.address().family);
      socket.write('ping ');
      socket.end(payload, () => console.log(name, 'finish'));
    });
    socket.on('connect', () => console.log(name, 'connect', socket.encrypted));
    const chunks = [];
    socket.on('data', (d) => chunks.push(d));
    socket.on('end', () => {
      const all = Buffer.concat(chunks);
      const text = all.toString('latin1'), lines = text.split('\n');
      const last = lines[lines.length - 2];
      console.log(name, 'end', all.length, JSON.stringify(lines[0]), last.length, JSON.stringify(last.slice(-40)));
    });
    socket.on('close', (hadError) => { console.log(name, 'close', hadError, socket.destroyed); resolve(); });
    socket.on('error', (e) => console.log(name, 'error', e.code, e.message));
  });
}
(async () => {
await run('ec128', { host: '127.0.0.1', ALPNProtocols: ['http/1.1'] }, 'pong');
await run('rsa256', { host: 'localhost' }, 'x'.repeat(40000));
await run('ecChacha', { host: 'localhost', ALPNProtocols: ['h2'] }, 'big');
await run('rsaRetry', { host: '127.0.0.1' }, 'big');
})();
`);
    const big = "x".repeat(40000);
    const expected: string[] = [];
    for (const [name, cipher, alpn, cert, payload, sni] of [
        [
            "ec128",
            "TLS_AES_128_GCM_SHA256",
            "http/1.1",
            "ec-cert.pem",
            "pong",
            "false",
        ],
        [
            "rsa256",
            "TLS_AES_256_GCM_SHA384",
            "false",
            "rsa-cert.pem",
            big,
            "localhost",
        ],
        [
            "ecChacha",
            "TLS_CHACHA20_POLY1305_SHA256",
            "false",
            "ec-cert.pem",
            "big",
            "localhost",
        ],
        [
            "rsaRetry",
            "TLS_AES_128_GCM_SHA256",
            "false",
            "rsa-cert.pem",
            "big",
            "false",
        ],
    ] as const) {
        const sent = "ping " + payload;
        const hello = `hello TLSv1.3 ${cipher} ${alpn} ${sni}`;
        const reply = `${name} got ${sent.length} ${sha16(sent)}`;
        const length =
            hello.length +
            1 +
            (payload === "big" ? 100000 : 0) +
            reply.length +
            1;
        expected.push(
            `${name} connect true`,
            `${name} secureConnect true null TLSv1.3 ${cipher} TLSv1.3 ${alpn} true`,
            `${name} cert ${describeCertificate(cert)}`,
            `${name} key exchange ${name === "rsaRetry" ? "prime256v1 true" : "X25519 false"}`,
            `${name} addresses 127.0.0.1 true number IPv4`,
            `${name} finish`,
            `${name} end ${length} ${JSON.stringify(hello)} ${reply.length + (payload === "big" ? 100000 : 0)} ${JSON.stringify(((payload === "big" ? "b".repeat(40) : "") + reply).slice(-40))}`,
            `${name} close false true`,
        );
    }
    assert.deepEqual(lines, expected);
    assert.deepEqual(await takeServerLog(), []);
});

test("node:tls: certificate checks fail closed; TLS 1.2 servers get a clear error", async () => {
    const lines = runClient(String.raw`
function attempt(label, options, connect) {
  return new Promise((resolve) => {
    const socket = connect ? connect() : tls.connect(options);
    socket.on('secureConnect', () => {
      console.log(label, 'secureConnect', socket.authorized, socket.authorizationError, socket.getPeerCertificate().subject.CN);
      socket.end('ping');
    });
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (d) => data += d);
    socket.on('end', () => console.log(label, 'end', JSON.stringify(data.split('\n')[1])));
    socket.on('error', (e) => console.log(label, 'error', e.code, e.message));
    socket.on('close', (hadError) => { console.log(label, 'close', hadError); resolve(); });
  });
}
(async () => {
await attempt('no-ca', { port: ports.ec128, host: '127.0.0.1' });
await attempt('unverified', { port: ports.ec128, host: '127.0.0.1', rejectUnauthorized: false });
await attempt('wrong-name', { port: ports.ec128, host: 'localhost', servername: 'example.com', ca });
await attempt('wrong-name-unverified', { port: ports.ec128, host: 'localhost', servername: 'example.com', ca, rejectUnauthorized: false });
await attempt('custom-identity', { port: ports.ec128, host: '127.0.0.1', ca, checkServerIdentity: (host, cert) => { console.log('checkServerIdentity', host, cert.subject.CN); return undefined; } });
await attempt('tls12', { port: ports.tls12, host: '127.0.0.1', ca });
await attempt('port-form', null, () => tls.connect(ports.rsa256, 'localhost', { ca }));
await attempt('wrapped', null, () => tls.connect({ socket: net.connect(ports.ecChacha, '127.0.0.1'), servername: 'localhost', ca }));
try { tls.connect({ port: 1, maxVersion: 'TLSv1.2' }); } catch (e) { console.log('maxVersion', e.code); }
console.log(tls.getCiphers().join(), tls.DEFAULT_MAX_VERSION, typeof tls.checkServerIdentity, tls.rootCertificates.length > 0);
try { tls.createServer(); } catch (e) { console.log('createServer', e.code); }
})();
`);
    assert.deepEqual(lines, [
        "no-ca error UNABLE_TO_VERIFY_LEAF_SIGNATURE unable to verify the first certificate",
        "no-ca close true",
        "unverified secureConnect false UNABLE_TO_VERIFY_LEAF_SIGNATURE localhost",
        `unverified end "ec128 got 4 ${sha16("ping")}"`,
        "unverified close false",
        "wrong-name error ERR_TLS_CERT_ALTNAME_INVALID Hostname/IP does not match certificate's altnames: Host: example.com. is not in the cert's altnames: DNS:localhost, IP Address:127.0.0.1",
        "wrong-name close true",
        "wrong-name-unverified secureConnect false ERR_TLS_CERT_ALTNAME_INVALID localhost",
        `wrong-name-unverified end "ec128 got 4 ${sha16("ping")}"`,
        "wrong-name-unverified close false",
        "checkServerIdentity 127.0.0.1 localhost",
        "custom-identity secureConnect true null localhost",
        `custom-identity end "ec128 got 4 ${sha16("ping")}"`,
        "custom-identity close false",
        "tls12 error ERR_SSL_UNSUPPORTED_PROTOCOL The server does not support TLSv1.3 (it sent the alert protocol_version); the Nona TLS client supports only TLSv1.3",
        "tls12 close true",
        "port-form secureConnect true null localhost",
        `port-form end "rsa256 got 4 ${sha16("ping")}"`,
        "port-form close false",
        "wrapped secureConnect true null localhost",
        `wrapped end "ecChacha got 4 ${sha16("ping")}"`,
        "wrapped close false",
        "maxVersion ERR_SSL_UNSUPPORTED_PROTOCOL",
        "tls_aes_128_gcm_sha256,tls_aes_256_gcm_sha384,tls_chacha20_poly1305_sha256 TLSv1.3 function true",
        "createServer ERR_METHOD_NOT_IMPLEMENTED",
    ]);
    // The server saw the client's alerts.
    const log = await takeServerLog();
    assert.equal(log.length, 3, log.join("\n"));
    assert.equal(log[0], "ec128 tlsClientError ERR_SSL_TLSV1_ALERT_UNKNOWN_CA");
    // OpenSSL 1.1 names the alert SSLV3_ALERT_BAD_CERTIFICATE.
    assert.match(
        log[1]!,
        /^ec128 tlsClientError ERR_SSL_(SSL\/TLS|SSLV3)_ALERT_BAD_CERTIFICATE$/,
    );
    assert.equal(log[2], "tls12 tlsClientError ERR_SSL_UNSUPPORTED_PROTOCOL");
});

// The chain fixtures, each case as [label, server, options]; ca lists
// fixture names (default: the test root), servername defaults to localhost.
const chainPems: Record<string, string> = {};
for (const name of [
    "root",
    "inter",
    "untrusted-ca",
    "self-signed",
    "old-ca",
] as const)
    chainPems[name] =
        name === "old-ca" ? caPem : fixture("chain/" + name + ".pem");
const chainCases: [string, string, Record<string, unknown>][] = [
    ["chain", "chain", {}],
    ["chain-ip", "chain", { servername: null }],
    ["wildcard", "chain", { servername: "a.nona.test" }],
    ["wildcard-deep", "chain", { servername: "a.b.nona.test" }],
    ["wrong-ca", "chain", { ca: ["old-ca"] }],
    ["leaf-only", "leafOnly", {}],
    ["leaf-only-inter-ca", "leafOnly", { ca: ["root", "inter"] }],
    ["inter-anchor", "chain", { ca: ["inter"] }],
    ["out-of-order", "outOfOrder", {}],
    ["expired", "expired", {}],
    ["future", "future", {}],
    ["wrong-host", "wrongHost", {}],
    ["self-signed", "selfSigned", {}],
    ["self-signed-trusted", "selfSigned", { ca: ["self-signed"] }],
    ["untrusted", "untrusted", {}],
    ["untrusted-chain", "untrustedChain", {}],
    ["bad-signature", "badSignature", {}],
    ["client-only", "clientOnly", {}],
    ["critical", "critical", {}],
    ["deep", "deep", {}],
    ["below-not-ca", "belowNotCa", {}],
    ["cn-only", "cnOnly", {}],
    ["cn-only-wrong", "cnOnly", { servername: "example.com" }],
    ["direct", "direct", {}],
    ["expired-untrusted", "expired", { ca: ["untrusted-ca"] }],
    ["expired-unverified", "expired", { rejectUnauthorized: false }],
    ["system-store", "chain", { ca: null }],
];
const chainClient = String.raw`
import tls from 'node:tls';
const pems = ${JSON.stringify(chainPems)};
const cases = ${JSON.stringify(chainCases)};
const ports = PORTS;
const only = ONLY;
function attempt(label, server, extra) {
  const options = Object.assign({ port: ports[server], host: '127.0.0.1', servername: 'localhost', ca: ['root'] }, extra);
  if (options.servername === null) delete options.servername;
  if (options.ca === null) delete options.ca;
  else options.ca = options.ca.map((name) => pems[name]);
  return new Promise((resolve) => {
    const socket = tls.connect(options, () => {
      const cert = socket.getPeerCertificate(true);
      const chain = [];
      for (let c = cert; c && chain.length < 5; c = c.issuerCertificate === c ? null : c.issuerCertificate) chain.push(c.subject.CN);
      console.log(label, 'secureConnect', socket.authorized, socket.authorizationError, chain.join(' < '));
      socket.end();
    });
    socket.on('error', (e) => console.log(label, 'error', e.code, e.message));
    socket.on('close', resolve);
    socket.resume();
  });
}
(async () => {
  for (const [label, server, extra] of cases)
    if (only.includes(label)) await attempt(label, server, extra);
})();
`;

test("node:tls: certificate chains are verified as Node.js verifies them", () => {
    const labels = chainCases.map(([label]) => label);
    // Two programs keep each run well inside the time limit.
    const halves = [labels.slice(0, 14), labels.slice(14)];
    for (const only of halves) {
        const source = chainClient
            .replace("PORTS", JSON.stringify(ports))
            .replace("ONLY", JSON.stringify(only));
        const { native, oracle } = runModulesOnHost(
            { "main.mjs": source },
            "main.mjs",
            { gcStress: false },
        );
        assert.equal(native.error, undefined);
        assert.equal(native.status, 0, native.stdout + native.stderr);
        const lines = native.stdout.split("\n").filter((line) => line !== "");
        const expected = oracle.split("\n").filter((line) => line !== "");
        assert.equal(expected.length, only.length, oracle);
        // Node.js uses its bundled Mozilla roots, Nona the operating
        // system's: neither knows the test root.
        assert.deepEqual(lines, expected);
    }
});
