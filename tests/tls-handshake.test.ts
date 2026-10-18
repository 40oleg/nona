import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

// The TLS 1.3 client state machine of node:tls (issue #301) without sockets:
// the RFC 8448 §3 "Simple 1-RTT Handshake" trace is replayed through
// _internal.ClientEngine with the trace's ClientHello and X25519 key, and
// every secret, key, IV and record the client derives or sends must match
// the RFC byte for byte. Further programs feed it broken or unusual server
// messages. The programs run without gcStress (the arithmetic of the key
// exchange allocates in its inner loops).

const rfc8448 = {
    clientPrivateKey:
        "49af42ba7f7994852d713ef2784bcbcaa7911de26adc5642cb634540e7ea5005",
    clientHello:
        "010000c00303cb34ecb1e78163ba1c38c6dacb196a6dffa21a8d9912ec18a2ef6283024dece7000006130113031302010000910000000b0009000006736572766572ff01000100000a00140012001d0017001800190100010101020103010400230000003300260024001d002099381de560e4bd43d23d8e435a7dbafeb3c06e51c13cae4d5413691e529aaf2c002b0003020304000d0020001e040305030603020308040805080604010501060102010402050206020202002d00020101001c00024001",
    clientHelloRecord:
        "16030100c4010000c00303cb34ecb1e78163ba1c38c6dacb196a6dffa21a8d9912ec18a2ef6283024dece7000006130113031302010000910000000b0009000006736572766572ff01000100000a00140012001d0017001800190100010101020103010400230000003300260024001d002099381de560e4bd43d23d8e435a7dbafeb3c06e51c13cae4d5413691e529aaf2c002b0003020304000d0020001e040305030603020308040805080604010501060102010402050206020202002d00020101001c00024001",
    early: "33ad0a1c607ec03b09e6cd9893680ce210adf300aa1f2660e1b22e10f170f92a",
    serverHelloRecord:
        "160303005a020000560303a6af06a4121860dc5e6e60249cd34c95930c8ac5cb1434dac155772ed3e2692800130100002e00330024001d0020c9828876112095fe66762bdbf7c672e156d6cc253b833df1dd69b1b04e751f0f002b00020304",
    handshake:
        "1dc826e93606aa6fdc0aadc12f741b01046aa6b99f691ed221a9f0ca043fbeac",
    clientHandshakeTraffic:
        "b3eddb126e067f35a780b3abf45e2d8f3b1a950738f52e9600746a0e27a55a21",
    serverHandshakeTraffic:
        "b67b7d690cc16c4e75e54213cb2d37b4e9c912bcded9105d42befd59d391ad38",
    master: "18df06843d13a08bf2a449844c5f8a478001bc4d4c627984d5a41da8d0402919",
    serverHandshakeKey: "3fce516009c21727d0f2e4e86ee403bc",
    serverHandshakeIv: "5d313eb2671276ee13000b30",
    clientHandshakeKey: "dbfaa693d1762c5b666af5d950258d01",
    clientHandshakeIv: "5bd3c71b836e0b76bb73265f",
    serverHandshakeRecord:
        "17030302a2d1ff334a56f5bff6594a07cc87b580233f500f45e489e7f33af35edf7869fcf40aa40aa2b8ea73f848a7ca07612ef9f945cb960b4068905123ea78b111b429ba9191cd05d2a389280f526134aadc7fc78c4b729df828b5ecf7b13bd9aefb0e57f271585b8ea9bb355c7c79020716cfb9b1183ef3ab20e37d57a6b9d7477609aee6e122a4cf51427325250c7d0e509289444c9b3a648f1d71035d2ed65b0e3cdd0cbae8bf2d0b227812cbb360987255cc744110c453baa4fcd610928d809810e4b7ed1a8fd991f06aa6248204797e36a6a73b70a2559c09ead686945ba246ab66e5edd8044b4c6de3fcf2a89441ac66272fd8fb330ef8190579b3684596c960bd596eea520a56a8d650f563aad27409960dca63d3e688611ea5e22f4415cf9538d51a200c27034272968a264ed6540c84838d89f72c24461aad6d26f59ecaba9acbbb317b66d902f4f292a36ac1b639c637ce343117b659622245317b49eeda0c6258f100d7d961ffb138647e92ea330faeea6dfa31c7a84dc3bd7e1b7a6c7178af36879018e3f252107f243d243dc7339d5684c8b0378bf30244da8c87c843f5e56eb4c5e8280a2b48052cf93b16499a66db7cca71e4599426f7d461e66f99882bd89fc50800becca62d6c74116dbd2972fda1fa80f85df881edbe5a37668936b335583b599186dc5c6918a396fa48a181d6b6fa4f9d62d513afbb992f2b992f67f8afe67f76913fa388cb5630c8ca01e0c65d11c66a1e2ac4c85977b7c7a6999bbf10dc35ae69f5515614636c0b9b68c19ed2e31c0b3b66763038ebba42f3b38edc0399f3a9f23faa63978c317fc9fa66a73f60f0504de93b5b845e275592c12335ee340bbc4fddd502784016e4b3be7ef04dda49f4b440a30cb5d2af939828fd4ae3794e44f94df5a631ede42c1719bfdabf0253fe5175be898e750edc53370d2b",
    clientApplicationTraffic:
        "9e40646ce79a7f9dc05af8889bce6552875afa0b06df0087f792ebb7c17504a5",
    serverApplicationTraffic:
        "a11af9f05531f856ad47116b45a950328204b4f44bfb6b3a4b4f1f3fcb631643",
    exporterMaster:
        "fe22f881176eda18eb8f44529e6792c50c9a3f89452f68d8ae311b4309d3cf50",
    serverApplicationKey: "9f02283b6c9c07efc26bb9f2ac92e356",
    serverApplicationIv: "cf782b88dd83549aadf1e984",
    clientApplicationKey: "17422dda596ed5d9acd890e3c63f5051",
    clientApplicationIv: "5b78923dee08579033e523d9",
    resumptionMaster:
        "7df235f2031d2a051287d02b0241b0bfdaf86cc856231f2d5aba46c434ec196c",
    clientFinishedRecord:
        "170303003575ec4dc238cce60b298044a71e219c56cc77b0517fe9b93c7a4bfc44d87f38f80338ac98fc46deb384bd1caeacab6867d726c40546",
    newSessionTicketRecord:
        "17030300de3a6b8f90414a97d6959c3487680de5134a2b240e6cffac116e95d41d6af8f6b580dcf3d11d63c758db289a015940252f55713e061dc13e078891a38efbcf5753ad8ef170ad3c7353d16d9da773b9ca7f2b9fa1b6c0d4a3d03f75e09c30ba1e62972ac46f75f7b981be63439b2999ce13064615139891d5e4c5b406f16e3fc181a77ca475840025db2f0a77f81b5ab05b94c01346755f69232c86519d86cbeeac87aac347d143f9605d64f650db4d023e70e952ca49fe5137121c74bc2697687e248746d6df353005f3bce18696129c8153556b3b6c6779b37bf15985684f",
    applicationData:
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f3031",
    clientApplicationRecord:
        "1703030043a23f7054b62c94d0affafe8228ba55cbefacea42f914aa66bcab3f2b9819a8a5b46b395bd54a9a20441e2b62974e1f5a6292a2977014bd1e3deae63aeebb21694915e4",
    serverApplicationRecord:
        "17030300432e937e11ef4ac740e538ad36005fc4a46932fc3225d05f82aa1b36e30efaf97d90e6dffc602dcb501a59a8fcc49c4bf2e5f0a21c0047c2abf332540dd032e167c2955d",
    clientAlertRecord: "1703030013c9872760655666b74d7ff1153efd6db6d0b0e3",
    serverAlertRecord: "1703030013b58fd67166ebf599d24720cfbe7efa7a8864a9",
    serverHandshakePayload:
        "080000240022000a00140012001d00170018001901000101010201030104001c00024001000000000b0001b9000001b50001b0308201ac30820115a003020102020102300d06092a864886f70d01010b0500300e310c300a06035504031303727361301e170d3136303733303031323335395a170d3236303733303031323335395a300e310c300a0603550403130372736130819f300d06092a864886f70d010101050003818d0030818902818100b4bb498f8279303d980836399b36c6988c0c68de55e1bdb826d3901a2461eafd2de49a91d015abbc9a95137ace6c1af19eaa6af98c7ced43120998e187a80ee0ccb0524b1b018c3e0b63264d449a6d38e22a5fda430846748030530ef0461c8ca9d9efbfae8ea6d1d03e2bd193eff0ab9a8002c47428a6d35a8d88d79f7f1e3f0203010001a31a301830090603551d1304023000300b0603551d0f0404030205a0300d06092a864886f70d01010b05000381810085aad2a0e5b9276b908c65f73a7267170618a54c5f8a7b337d2df7a594365417f2eae8f8a58c8f8172f9319cf36b7fd6c55b80f21a03015156726096fd335e5e67f2dbf102702e608ccae6bec1fc63a42a99be5c3eb7107c3c54e9b9eb2bd5203b1c3b84e0a8b2f759409ba3eac9d91d402dcc0cc8f8961229ac9187b42b4de100000f000084080400805a747c5d88fa9bd2e55ab085a61015b7211f824cd484145ab3ff52f1fda8477b0b7abc90db78e2d33a5c141a078653fa6bef780c5ea248eeaaa785c4f394cab6d30bbe8d4859ee511f602957b15411ac027671459e46445c9ea58c181e818e95b8c3fb0bf3278409d3be152a3da5043e063dda65cdf5aea20d53dfacd42f74f3140000209b9b141d906337fbd2cbdce71df4deda4ab42c309572cb7fffee5454b78f0718",
};

function runEngine(body: string): any {
    const source =
        "import { _internal } from 'node:tls';\n" +
        "import * as t from 'nona:internal/tls-crypto';\n" +
        "const hex = (b) => Array.from(b, (x) => (x < 16 ? '0' : '') + x.toString(16)).join('');\n" +
        "const unhex = (s) => new Uint8Array((s.match(/../g) || []).map((x) => parseInt(x, 16)));\n" +
        `const v = ${JSON.stringify(rfc8448)};\n` +
        // An engine that replays the RFC 8448 client; log collects what it reports.
        "function rfcEngine(log) {\n" +
        "  const engine = new _internal.ClientEngine({ clientHello: unhex(v.clientHello), keyShares: { x25519: unhex(v.clientPrivateKey) } });\n" +
        "  engine.send = (b) => log.sent.push(hex(b));\n" +
        "  engine.onSecure = () => log.events.push('secure');\n" +
        "  engine.onData = (d) => log.events.push('data ' + hex(d));\n" +
        "  engine.onCloseNotify = () => log.events.push('close_notify');\n" +
        "  engine.onError = (e) => log.events.push('error ' + e.code);\n" +
        "  engine.verify = (chain) => { log.events.push('verify ' + chain.length + ' ' + chain[0].length); return log.reject || null; };\n" +
        "  engine.start();\n" +
        "  return engine;\n" +
        "}\n" +
        // A protected record as a server with this AES-128-GCM key and IV sends it.
        "function serverRecord(key, iv, seq, type, data) {\n" +
        "  const inner = new Uint8Array(data.length + 1); inner.set(data); inner[data.length] = type;\n" +
        "  const header = new Uint8Array([23, 3, 3, (inner.length + 16) >> 8, (inner.length + 16) & 255]);\n" +
        "  const nonce = iv.slice(); nonce[11] ^= seq;\n" +
        "  return t.concatBytes(header, t.createAead('aes-128-gcm', key).seal(nonce, inner, header));\n" +
        "}\n" +
        // An engine with the generated ClientHello.
        "function plainEngine(log, options) {\n" +
        "  const engine = new _internal.ClientEngine(options);\n" +
        "  engine.send = (b) => log.sent.push(hex(b));\n" +
        "  engine.onError = (e) => log.events.push('error ' + e.code + ': ' + e.message);\n" +
        "  engine.start();\n" +
        "  return engine;\n" +
        "}\n" +
        // A plaintext ServerHello record that echoes the engine's session ID.
        "function serverHello(engine, random, suite, extensions) {\n" +
        "  const body = t.concatBytes(new Uint8Array([3, 3]), random, new Uint8Array([engine.sessionId.length]), engine.sessionId,\n" +
        "    new Uint8Array([suite >> 8, suite & 255, 0, extensions.length >> 8, extensions.length & 255]), extensions);\n" +
        "  const message = t.concatBytes(new Uint8Array([2, 0, body.length >> 8, body.length & 255]), body);\n" +
        "  return t.concatBytes(new Uint8Array([22, 3, 3, message.length >> 8, message.length & 255]), message);\n" +
        "}\n" +
        body;
    const { native } = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
        gcStress: false,
        oracleSource: "",
    });
    assert.equal(native.status, 0, native.stderr + String(native.error));
    return JSON.parse(native.stdout);
}

test("TLS 1.3 client: RFC 8448 §3 simple 1-RTT handshake, record by record", () => {
    const out = runEngine(`
const log = { sent: [], events: [] };
const engine = rfcEngine(log);
const out = { clientHelloRecord: log.sent[0] };
engine.receive(unhex(v.serverHelloRecord));
out.early = hex(engine.secrets.early);
out.handshake = hex(engine.secrets.handshake);
out.clientHandshakeTraffic = hex(engine.secrets.clientHandshakeTraffic);
out.serverHandshakeTraffic = hex(engine.secrets.serverHandshakeTraffic);
out.clientHandshakeKey = hex(engine.write.key);
out.clientHandshakeIv = hex(engine.write.iv);
out.serverHandshakeKey = hex(engine.read.key);
out.serverHandshakeIv = hex(engine.read.iv);
// The encrypted flight arrives in three pieces (one splits the header).
const flight = unhex(v.serverHandshakeRecord);
engine.receive(flight.subarray(0, 3));
engine.receive(flight.subarray(3, 300));
engine.receive(flight.subarray(300));
out.clientFinishedRecord = log.sent[1];
for (const name of ['master', 'clientApplicationTraffic', 'serverApplicationTraffic', 'exporterMaster', 'resumptionMaster'])
  out[name] = hex(engine.secrets[name]);
out.clientApplicationKey = hex(engine.write.key);
out.clientApplicationIv = hex(engine.write.iv);
out.serverApplicationKey = hex(engine.read.key);
out.serverApplicationIv = hex(engine.read.iv);
engine.receive(unhex(v.newSessionTicketRecord));
out.clientApplicationRecord = hex(engine.seal(unhex(v.applicationData)));
engine.receive(unhex(v.serverApplicationRecord));
out.clientAlertRecord = hex(engine.closeNotify());
engine.receive(unhex(v.serverAlertRecord));
out.sentCount = log.sent.length;
out.events = log.events;
out.state = engine.state + ' ' + engine.suite.name + ' ' + engine.alpnProtocol;
console.log(JSON.stringify(out));
`);
    for (const name of [
        "clientHelloRecord",
        "early",
        "handshake",
        "clientHandshakeTraffic",
        "serverHandshakeTraffic",
        "clientHandshakeKey",
        "clientHandshakeIv",
        "serverHandshakeKey",
        "serverHandshakeIv",
        "clientFinishedRecord",
        "master",
        "clientApplicationTraffic",
        "serverApplicationTraffic",
        "exporterMaster",
        "resumptionMaster",
        "clientApplicationKey",
        "clientApplicationIv",
        "serverApplicationKey",
        "serverApplicationIv",
        "clientApplicationRecord",
        "clientAlertRecord",
    ] as const)
        assert.equal(out[name], rfc8448[name], name);
    // No change_cipher_spec: the trace's ClientHello has an empty session ID.
    assert.equal(out.sentCount, 2);
    assert.deepEqual(out.events, [
        "verify 1 432",
        "secure",
        "data " + rfc8448.applicationData,
        "close_notify",
    ]);
    assert.equal(out.state, "connected TLS_AES_128_GCM_SHA256 null");
});

test("TLS 1.3 client: a KeyUpdate from the server updates both directions", () => {
    const out = runEngine(`
const log = { sent: [], events: [] };
const engine = rfcEngine(log);
engine.receive(unhex(v.serverHelloRecord));
engine.receive(unhex(v.serverHandshakeRecord));
engine.receive(unhex(v.newSessionTicketRecord));
engine.receive(unhex(v.serverApplicationRecord));
engine.seal(unhex(v.applicationData));
const oldServer = engine.read, oldClient = engine.write;
const sent = log.sent.length;
// KeyUpdate(update_requested) under the server's application key.
engine.receive(serverRecord(oldServer.key, oldServer.iv, oldServer.seq, 22, unhex('1800000101')));
const out = { responses: log.sent.length - sent };
const reply = unhex(log.sent[sent]);
const nonce = oldClient.iv.slice(); nonce[11] ^= 1;
out.reply = hex(t.createAead('aes-128-gcm', oldClient.key).open(nonce, reply.subarray(5), reply.subarray(0, 5)));
out.serverUpdated = hex(engine.read.secret) === hex(t.hkdfExpandLabel('sha256', oldServer.secret, 'traffic upd', '', 32));
out.clientUpdated = hex(engine.write.secret) === hex(t.hkdfExpandLabel('sha256', oldClient.secret, 'traffic upd', '', 32));
out.seqs = [engine.read.seq, engine.write.seq];
engine.receive(serverRecord(engine.read.key, engine.read.iv, 0, 23, unhex('6869')));
out.events = log.events;
console.log(JSON.stringify(out));
`);
    assert.deepEqual(out, {
        responses: 1,
        reply: "180000010016",
        serverUpdated: true,
        clientUpdated: true,
        seqs: [0, 0],
        events: [
            "verify 1 432",
            "secure",
            "data " + rfc8448.applicationData,
            "data 6869",
        ],
    });
});

test("TLS 1.3 client: broken server flights end in an alert and a coded error", () => {
    const out = runEngine(`
const out = {};
// The server's encrypted flight with one plaintext byte changed, re-encrypted.
function tampered(index, log) {
  const engine = rfcEngine(log);
  engine.receive(unhex(v.serverHelloRecord));
  const payload = unhex(v.serverHandshakePayload);
  if (index >= 0) payload[index] ^= 1;
  engine.receive(serverRecord(unhex(v.serverHandshakeKey), unhex(v.serverHandshakeIv), 0, 22, payload));
  return engine;
}
// The alert record the client sent last, decrypted with its handshake key.
function lastAlert(log) {
  const record = unhex(log.sent[log.sent.length - 1]);
  const plain = t.createAead('aes-128-gcm', unhex(v.clientHandshakeKey)).open(unhex(v.clientHandshakeIv), record.subarray(5), record.subarray(0, 5));
  return plain === null ? 'undecryptable' : hex(plain);
}
let log = { sent: [], events: [] };
tampered(657 - 40, log);
out.signature = [log.events, lastAlert(log)];
log = { sent: [], events: [] };
tampered(657 - 1, log);
out.finished = [log.events, lastAlert(log)];
log = { sent: [], events: [], reject: Object.assign(new Error('no'), { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' }) };
tampered(-1, log);
out.rejected = [log.events, lastAlert(log), log.sent.length];
log = { sent: [], events: [] };
let engine = rfcEngine(log);
engine.receive(unhex(v.serverHelloRecord));
const flight = unhex(v.serverHandshakeRecord);
flight[40] ^= 1;
engine.receive(flight);
engine.receive(unhex(v.serverApplicationRecord));
out.mac = [log.events, lastAlert(log)];

// The generated ClientHello, then a TLS 1.2 ServerHello.
log = { sent: [], events: [] };
engine = plainEngine(log, { servername: 'example.com', ALPNProtocols: [unhex('6832')] });
const hello = log.sent[0];
out.hello = [hello.slice(0, 6) + ' ' + hello.slice(184, 188), hello.includes('0000001000' + '0e' + '00000b' + hex(new TextEncoder().encode('example.com'))),
  hello.includes('001000050003026832'), hello.includes('002b0003020304'), engine.sessionId.length];
engine.receive(serverHello(engine, new Uint8Array(32).fill(7), 0xc02f, new Uint8Array(0)));
out.tls12 = [log.events, log.sent[log.sent.length - 1]];
// An empty servername (the socket passes one for IP addresses) sends no SNI.
log = { sent: [], events: [] };
plainEngine(log, { servername: '' });
out.noSni = log.sent[0].slice(184, 188);
log = { sent: [], events: [] };
engine = plainEngine(log, {});
engine.receive(new TextEncoder().encode('HTTP/1.1 400 Bad Request\\r\\n\\r\\n'));
out.http = log.events;

// A HelloRetryRequest that asks for P-256 and sends a cookie.
const p256 = unhex('c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721');
log = { sent: [], events: [] };
engine = plainEngine(log, { keyShares: { p256 } });
const hrrRandom = unhex('cf21ad74e59a6111be1d8c021e65b891c2a211167abb8c5e079e09e2c8a8339c');
const hrr = serverHello(engine, hrrRandom, 0x1301, unhex('002b00020304003300020017002c000600040a0b0c0d'));
engine.receive(hrr);
const second = log.sent[2] || '';
out.retry = [log.sent.length, log.sent[1], second.slice(0, 6),
  second.includes('00330047004500170041' + hex(t.ecdhPublicKey('P-256', p256))),
  second.includes('002c000600040a0b0c0d'), second.includes(hex(engine.sessionId)), log.events.slice()];
engine.receive(hrr);
out.retryTwice = log.events;
console.log(JSON.stringify(out));
`);
    const alert = (n: number) => "02" + n.toString(16).padStart(2, "0") + "15";
    assert.deepEqual(out.signature, [
        ["error ERR_SSL_BAD_SIGNATURE"],
        alert(51),
    ]);
    assert.deepEqual(out.finished, [
        ["verify 1 432", "error ERR_SSL_DIGEST_CHECK_FAILED"],
        alert(51),
    ]);
    // A rejected certificate: unknown_ca, and no Finished from the client.
    assert.deepEqual(out.rejected, [
        ["verify 1 432", "error UNABLE_TO_GET_ISSUER_CERT_LOCALLY"],
        alert(48),
        2,
    ]);
    assert.deepEqual(out.mac, [
        ["error ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC"],
        alert(20),
    ]);
    assert.deepEqual(out.hello, ["160301 0000", true, true, true, 32]);
    assert.deepEqual(out.tls12, [
        [
            "error ERR_SSL_UNSUPPORTED_PROTOCOL: The server selected TLSv1.2; the Nona TLS client supports only TLSv1.3",
        ],
        // A plaintext protocol_version alert.
        "15030300020246",
    ]);
    // The first extension: supported_groups instead of server_name.
    assert.equal(out.noSni, "000a");
    assert.equal(out.http.length, 1);
    assert.match(out.http[0], /^error ERR_SSL_WRONG_VERSION_NUMBER/);
    assert.deepEqual(out.retry, [
        3,
        "140303000101",
        "160303",
        true,
        true,
        true,
        [],
    ]);
    assert.equal(out.retryTwice.length, 1);
    assert.match(out.retryTwice[0], /^error ERR_SSL_UNEXPECTED_MESSAGE/);
});
