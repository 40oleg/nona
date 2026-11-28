import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runOnHost, runModulesOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compile } from "../src/compiler.js";
import { requireHostTarget } from "../src/target.js";
import { runNative } from "./helpers/native.js";

let server: ChildProcess;
let ports: Record<string, number>;
before(async () => {
    server = spawn(
        process.execPath,
        [
            fileURLToPath(
                new URL(
                    "../../tests/fixtures/fetch-server.mjs",
                    import.meta.url,
                ),
            ),
        ],
        {
            stdio: ["pipe", "pipe", "inherit"],
            windowsHide: true,
        },
    );
    ports = await new Promise((resolve, reject) => {
        let text = "";
        server.stdout!.on("data", (chunk) => {
            text += String(chunk);
            if (text.includes("\n")) resolve(JSON.parse(text));
        });
        server.on("error", reject);
        server.on("exit", (code) =>
            reject(new Error("fetch fixture exited: " + code)),
        );
    });
});
after(async () => {
    if (!server) return;
    const closed = new Promise((resolve) => server.once("close", resolve));
    server.stdin!.end();
    const timer = setTimeout(() => server.kill(), 5000);
    await closed;
    clearTimeout(timer);
});
function program(body: string) {
    return `const base = 'http://127.0.0.1:${ports.http}'; const other = 'http://127.0.0.1:${ports.other}';\n(async () => {\n${body}\n})().catch(e => { console.log('FAIL', e.name, e.message); process.exitCode = 1; });`;
}
function compare(body: string) {
    const source = program(body);
    const native = runOnHost(source, { gcStress: false });
    const oracle = runOracle(source);
    assert.equal(native.status, 0, native.stdout + native.stderr);
    assert.equal(native.error, undefined);
    assert.equal(native.stderr, "");
    assert.equal(native.stdout, oracle.stdout);
    return native.stdout;
}
test("fetch: selective runtime in scripts, CommonJS and ES modules without networking imports", () => {
    const source = program(String.raw`
const first = await fetch(base + '/metrics'); console.log((await first.json()).value);
const second = await globalThis.fetch(base + '/metrics'); console.log((await second.json()).message);
const name = ['fet','ch'].join(''); const third = await globalThis[name](base + '/metrics'); console.log(third.ok); await third.body.cancel();
`);
    const expected = runOracle(source).stdout;
    for (const fileName of ["/fetch.js", "/fetch.cjs", "/fetch.mjs"]) {
        const result = compile(source, {
            fileName,
            module: fileName.endsWith(".mjs"),
            target: requireHostTarget(),
        });
        assert.ok(
            result.ok,
            result.ok ? "" : JSON.stringify(result.diagnostics),
        );
        const native = runNative(result.image, 60_000);
        assert.equal(native.status, 0, native.stderr.toString());
        assert.equal(native.stdout.toString(), expected);
    }
});
test("fetch: verified JSON and binary POST, Cyrillic, 401 ownership and retry", () => {
    const output = compare(String.raw`
const response = await fetch(new URL(base + '/json'), {
  method: 'POST', body: JSON.stringify({message:'Привет мир'}),
  headers: [['Authorization','Bearer local'],['X-Custom','one'],['x-custom','two'],['Content-Type','application/json']]
});
console.log(response.status, response.ok, response.headers.get('X-RESULT'), response.url === base + '/json', response.redirected, response.bodyUsed);
const value = await response.json();
console.log(value.message, value.valid, response.bodyUsed);
try { await response.text(); } catch (e) { console.log('again', e.name); }
const denied = await fetch(base + '/auth');
console.log(denied.status, denied.ok, (await denied.json()).message);
const retry = await globalThis.fetch(base + '/auth', {headers:{authorization:'Bearer renewed'}});
console.log(retry.status, retry.ok, (await retry.json()).message);
for (const binary of [new Uint8Array([255,216,0,128,255,217]), Buffer.from([255,216,0,128,255,217])]) {
  const event = await fetch(base + '/event', {method:'POST',headers:{'Content-Type':'image/jpeg'}, body:binary});
  console.log('event', (await event.json()).valid);
}
const empty = await fetch(base + '/empty');
console.log(empty.status, empty.body === null, await empty.text());
`);
    assert.match(output, /201 true yes true false false/);
    assert.match(output, /Здравствуй, мир true true/);
});
test("fetch: manual/follow redirects, replay, relative URLs and credential removal", () => {
    compare(String.raw`
for (const status of [301,302,303,307,308]) {
  for (const redirect of ['manual','follow']) {
    const result = await fetch(base + '/redirect/' + status, {method:'POST',body:'hello',redirect,
      headers:{Authorization:'Bearer local','X-Custom':'kept','Content-Encoding':'identity','Content-Type':'text/custom'}});
    if (redirect === 'manual') {
      console.log(status, result.status, result.redirected, result.headers.get('location'));
      await result.body.cancel();
    } else console.log(status, result.status, result.redirected, result.url === base + '/echo', JSON.stringify(await result.json()));
  }
}
const cross = await fetch(base + '/redirect/307?to=' + encodeURIComponent(other + '/echo'), {method:'POST',body:'bytes',headers:{authorization:'secret','x-custom':'kept'}});
console.log('cross', JSON.stringify(await cross.json()));
const relative = await fetch(base + '/redirect/303?to=' + encodeURIComponent('../echo'));
console.log('relative', relative.url === base + '/echo'); await relative.body.cancel();
for (const path of ['/loop','/redirect/302']) {
  try { await fetch(base + path, {redirect:path === '/loop' ? 'follow' : 'error'}); } catch(e) { console.log('redirect failure', e.name); }
  console.log('after', (await (await fetch(base + '/metrics')).json()).value);
}
`);
});
test("fetch: abort before headers and during body, locked/used readers, disconnect and reuse", () => {
    compare(String.raw`
for (let cycle = 0; cycle < 3; cycle++) {
  const before = new AbortController(); before.abort();
  try { await fetch(base + '/metrics', {signal:before.signal}); } catch(e) { console.log('pre', e.name); }
  const waiting = new AbortController();
  const pending = fetch(base + '/delayed', {signal:waiting.signal});
  setTimeout(() => waiting.abort(), 5);
  try { await pending; } catch(e) { console.log('headers', e.name); }
  const controller = new AbortController();
  controller.signal.addEventListener('abort', e => e.stopImmediatePropagation());
  const response = await fetch(base + '/stall', {signal:controller.signal});
  const reader = response.body.getReader();
  try { await response.text(); } catch(e) { console.log('locked', e.name, response.bodyUsed); }
  await reader.read();
  const reading = reader.read(); controller.abort();
  try { await reading; } catch(e) { console.log('body', e.name, response.bodyUsed); }
  reader.releaseLock();
  const cancelled = await fetch(base + '/stall');
  const r = cancelled.body.getReader(); await r.read(); await r.cancel(); r.releaseLock();
  console.log('cancel', cancelled.bodyUsed);
  const broken = await fetch(base + '/disconnect');
  try { await broken.text(); } catch(e) { console.log('disconnect', true); }
  console.log('after', (await (await fetch(base + '/metrics')).json()).value);
}
`);
});
test("fetch: incremental discard, arrayBuffer and repeated metrics", () => {
    compare(String.raw`
const response = await fetch(base + '/large');
const reader = response.body.getReader(); let total = 0; let correct = true;
for (;;) { const step = await reader.read(); if (step.done) break; total += step.value.byteLength; correct = correct && step.value[0] === 120; await new Promise(resolve => setTimeout(resolve, 1)); }
reader.releaseLock(); console.log('large', total, correct, response.bodyUsed);
const binary = await (await fetch(base + '/large?bytes=10')).arrayBuffer();
console.log('buffer', binary.byteLength, new Uint8Array(binary)[9]);
for (let i = 0; i < 8; i++) console.log('metrics', (await (await fetch(base + '/metrics')).json()).value);
`);
});
test("fetch: HTTPS retains verification with test-scoped trust", () => {
    compare(`try { await fetch('https://127.0.0.1:${ports.https}/metrics'); } catch(e) { console.log('untrusted', e.name); }
console.log('after', (await (await fetch(base + '/metrics')).json()).value);`);
    const caPath = fileURLToPath(
        new URL("../../tests/fixtures/tls/ca.pem", import.meta.url),
    );
    const ca = readFileSync(caPath, "utf8");
    const source =
        `import https from 'node:https';\nhttps.globalAgent.options.ca = ${JSON.stringify(ca)};\n` +
        program(
            `const response = await fetch('https://127.0.0.1:${ports.https}/metrics'); console.log(response.status, (await response.json()).message);`,
        );
    const previous = process.env.NODE_EXTRA_CA_CERTS;
    process.env.NODE_EXTRA_CA_CERTS = caPath;
    try {
        const result = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
            gcStress: false,
        });
        assert.equal(
            result.native.status,
            0,
            result.native.stdout + result.native.stderr,
        );
        assert.equal(result.oracleStatus, 0, result.oracleStderr);
        assert.equal(result.native.stdout, result.oracle);
    } finally {
        if (previous === undefined) delete process.env.NODE_EXTRA_CA_CERTS;
        else process.env.NODE_EXTRA_CA_CERTS = previous;
    }
});

test(
    "fetch: request/body ownership under GC stress (hosted)",
    {
        skip: process.env.GITHUB_ACTIONS !== "true",
    },
    () => {
        const source = program(String.raw`
const controller = new AbortController();
const response = await fetch(base + '/stall', {signal:controller.signal});
const reader = response.body.getReader(); await reader.read();
const pending = reader.read(); controller.abort();
try { await pending; } catch(e) { console.log(e.name); }
reader.releaseLock();
console.log((await (await fetch(base + '/metrics')).json()).message);
`);
        const native = runOnHost(source, {
            gcStress: true,
            timeoutMs: 900_000,
        });
        assert.equal(native.status, 0, native.stdout + native.stderr);
        assert.equal(native.stdout, runOracle(source).stdout);
    },
);

test("fetch: abort removes an actual native Agent queue entry and frees the origin for retry", () => {
    const body = program(String.raw`
http.globalAgent.maxSockets = 1;
http.globalAgent.maxTotalSockets = 1;
const held = await fetch(base + '/stall');
const controller = new AbortController();
const pending = fetch(base + '/metrics', {signal:controller.signal});
const queued = Object.keys(http.globalAgent.requests).some(key => http.globalAgent.requests[key].length === 1);
console.log('queued', queued);
controller.abort();
try { await pending; } catch(e) { console.log(e.name); }
console.log('cleared', Object.keys(http.globalAgent.requests).length === 0);
await held.body.cancel();
console.log('retry', (await (await fetch(base + '/metrics')).json()).value);
http.globalAgent.destroy();
`);
    const source = "import http from 'node:http';\n" + body;
    const result = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
        gcStress: false,
    });
    assert.equal(
        result.native.status,
        0,
        result.native.stdout + result.native.stderr,
    );
    assert.equal(
        result.native.stdout,
        "queued true\nAbortError\ncleared true\nretry 42\n",
    );
    // Node fetch uses its own dispatcher rather than http.globalAgent. The
    // provider realm tests above separately assert pre-socket cancellation.
    assert.equal(result.oracleStatus, 0, result.oracleStderr);
    assert.match(result.oracle, /AbortError\ncleared true\nretry 42/);
});

test("fetch: abort after HTTP EOF preserves another response on the reused socket", () => {
    const source =
        "import http from 'node:http';\n" +
        program(String.raw`
http.globalAgent.maxSockets = 1;
const controller = new AbortController();
const first = await fetch(base + '/metrics', {signal:controller.signal});
await new Promise(resolve => setTimeout(resolve, 20));
const idle = Object.values(http.globalAgent.freeSockets)[0];
const oldSocket = idle ? idle[0] : undefined;
const second = await fetch(base + '/slow-body');
const busy = Object.values(http.globalAgent.sockets)[0];
console.log('reused', oldSocket !== undefined && busy && busy[0] === oldSocket);
const reader = second.body.getReader(); await reader.read();
const pending = reader.read(); controller.abort();
try { await first.text(); } catch(e) { console.log('first', e.name); }
const tail = await pending;
console.log('second', Buffer.from(tail.value).toString(), (await reader.read()).done);
reader.releaseLock(); http.globalAgent.destroy();
`);
    const result = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
        gcStress: false,
    });
    assert.equal(
        result.native.status,
        0,
        result.native.stdout + result.native.stderr,
    );
    assert.equal(
        result.native.stdout,
        "reused true\nfirst AbortError\nsecond second true\n",
    );
    assert.equal(result.oracleStatus, 0, result.oracleStderr);
    assert.match(result.oracle, /first AbortError\nsecond second true/);
});
