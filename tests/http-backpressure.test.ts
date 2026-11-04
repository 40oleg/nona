import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost, runOnHost } from "./helpers/host.js";
import { modulesNetCommon } from "../src/lib/sources.generated.js";

test("HTTP false/drain producers bound queues with paused readers and reuse keep-alive (Node26 oracle)", () => {
    // One data request and one unrelated probe in flight; 4 KiB writes,
    // 1 MiB responses. No forced GC here: this measures ordinary buffering.
    const source = String.raw`import http from 'node:http';
const chunk = 'x'.repeat(4096), count = 256;
let bounded = true, transitions = true, callbacks = 0, finishes = 0, closes = 0;
let stopped = [], timer = false, probe = false;
const server = http.createServer((req, res) => {
  if (req.url === '/ping') { res.end('pong'); return; }
  let sent = 0, waiting = false, drains = 0;
  res.on('finish', () => { finishes++; });
  res.on('close', () => { closes++; });
  res.on('drain', () => {
    transitions = transitions && waiting && !res.writableNeedDrain && !res.destroyed;
    waiting = false; drains++; produce();
  });
  function produce() {
    while (sent < count) {
      sent++;
      const ok = res.write(chunk, err => { if (err) throw err; callbacks++; });
      bounded = bounded && res.writableLength <= res.writableHighWaterMark + chunk.length + 256;
      if (!ok) {
        transitions = transitions && res.writableNeedDrain;
        waiting = true;
        // A synchronous producer must yield well before the full body.
        if (drains === 0) bounded = bounded && sent < 64;
        return;
      }
    }
    stopped.push(res);
    res.end();
  }
  produce();
});
const agent = new http.Agent({keepAlive: true, maxSockets: 1});
const watchdog = setTimeout(() => {
  console.error('HTTP producer timed out', callbacks, stopped.length, finishes, closes);
  process.exit(2);
}, 10000);
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  for (let request = 0; request < 3; request++) {
    await new Promise((resolve, reject) => {
      const req = http.get({port, host: '127.0.0.1', path: '/data', agent}, res => {
        let bytes = 0, correct = true;
        res.pause();
        let timerReady = false, probeReady = request !== 0;
        const resume = () => { if (timerReady && probeReady) res.resume(); };
        setTimeout(() => { timer = true; timerReady = true; resume(); }, 20);
        if (request === 0) http.get({port, host: '127.0.0.1', path: '/ping', agent: false}, ping => {
          let body = '';
          ping.on('data', c => { body += c; });
          ping.on('end', () => { probe = body === 'pong'; probeReady = true; resume(); });
        }).on('error', reject);
        res.on('data', c => {
          bytes += c.length;
          correct = correct && c.toString() === 'x'.repeat(c.length);
        });
        res.on('end', () => {
          if (!correct || bytes !== chunk.length * count) reject(Error('body mismatch'));
          else resolve();
        });
        res.on('error', reject);
      });
      req.on('error', reject);
    });
  }
  // Wait one timer turn so completion/close counts and the independent probe
  // are observed after producers stop, not just after the last body byte.
  setTimeout(() => {
    clearTimeout(watchdog);
    const empty = stopped.every(res => res.writableLength === 0 && !res.writableNeedDrain && (res._chunkLength === undefined || res._chunkLength === 0) && (res._outputSize === undefined || res._outputSize === 0) && res._drainSocket == null);
    console.log('bounded', bounded, 'transitions', transitions, 'empty', empty);
    console.log('body', callbacks === count * 3, 'finish', finishes, 'close', closes);
    console.log('progress', timer, probe);
    agent.destroy();
    server.close();
  }, 20);
});

`;
    const { native, oracle, oracleStatus } = runModulesOnHost(
        { "main.mjs": source },
        "main.mjs",
        { gcStress: false, timeoutMs: 20000 },
    );
    assert.equal(oracleStatus, 0);
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stdout + native.stderr);
    assert.equal(native.stderr, "");
    assert.equal(
        oracle,
        "bounded true transitions true empty true\nbody true finish 3 close 3\nprogress true true\n",
    );
    assert.equal(native.stdout, oracle);
});

test("queued completion owner survives forced GC in a small socket adapter", () => {
    // Compile the exact production write methods with a tiny scripted adapter,
    // rather than collecting the entire HTTP module graph on every allocation.
    const writes = modulesNetCommon.slice(
        modulesNetCommon.indexOf("    write(data, encoding, callback) {"),
        modulesNetCommon.indexOf("    _finishWrites() {"),
    );
    const send = modulesNetCommon.slice(
        modulesNetCommon.indexOf("    _sendNow(bytes, length, callback) {"),
        modulesNetCommon.indexOf(
            "    ref() {",
            modulesNetCommon.indexOf("    _sendNow("),
        ),
    );
    const source = `
const EAGAIN=-11, EINTR=-4, WRITE=2;
let blocked=true;
const sys={send(fd,bytes,length){return blocked ? EAGAIN : length;}};
function markDirty(socket) {}
function sliceBytes(bytes,start,end){return bytes.slice(start,end);}
function invoke(callback,error){if(typeof callback==='function')callback(error);else callback._sent(error);}
class Socket {
  constructor(){this._fd=1;this._writeQueue=null;this._writeLength=0;this._bytesWritten=0;this._needDrain=false;this._destroyed=false;this._writeEnded=false;this._watched=0;this.connecting=false;}
  _touch() {}
  emit(event){console.log(event, this._writeLength);}
  ${writes}
  ${send}
}
const socket=new Socket();
socket._sendNow(new Uint8Array(20000),20000);
let owner={bytes:new Uint8Array([37,81]),_sent(error){console.log('owner',this.bytes[0],this.bytes[1],error===null);}};
socket._sendNow(new Uint8Array(1),1,owner);
owner=null;
for(let i=0;i<8;i++)new Uint8Array(16);
blocked=false;
socket._flushWrites();
`;
    const native = runOnHost(source, { gcStress: true, timeoutMs: 10000 });
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stderr, "");
    assert.equal(native.stdout, "owner 37 81 true\ndrain 0\n");
});
