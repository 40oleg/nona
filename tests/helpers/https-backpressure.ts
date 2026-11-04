// Shared by the hosted native/Node HTTPS test and a small Node-only oracle run.
// The caller supplies https, ca and ports.good (the real TLS fixture server).
export const httpsBackpressureProgram = String.raw`
const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
const chunk = 'x'.repeat(20480), count = 8;
const watchdog = setTimeout(() => {
  console.error('HTTPS false/drain producer timed out'); process.exit(2);
}, 30000);
let bounded = true, transitions = true, bytes = true, timer = false, probe = false;
let callbacks = 0, finishes = 0, closes = 0;
const requests = [], sockets = [];
let probeDone;
const options = { host: '127.0.0.1', port: ports.good, ca, agent, path: '/backpressure', method: 'POST' };
(async () => {
  // First produce before secureConnect, then reuse an established TLS socket.
  for (let request = 0; request < 2; request++) {
    await new Promise((resolve, reject) => {
      const req = https.request(options);
      requests.push(req);
      let sent = 0, waiting = false, drains = 0, producing = false;
      req.on('error', reject);
      req.on('finish', () => { finishes++; });
      req.on('close', () => { closes++; });
      req.on('response', res => {
        let body = '';
        res.on('data', c => { body += c.toString(); });
        res.on('error', reject);
        res.on('end', () => {
          const result = JSON.parse(body);
          bytes = bytes && res.statusCode === 200 && result.length === chunk.length * count && result.correct;
          transitions = transitions && drains > 0;
          resolve();
        });
      });
      req.on('drain', () => {
        transitions = transitions && waiting && !req.writableNeedDrain && !req.destroyed;
        waiting = false; drains++; produce();
      });
      function produce() {
        if (producing) { reject(Error('reentrant drain')); return; }
        producing = true;
        while (sent < count) {
          sent++;
          const ok = req.write(chunk, error => { if (error) reject(error); else callbacks++; });
          // Node 26's HTTP cork accepts one oversized chunk before returning
          // false on the next write. Keep Nona's stricter one-chunk allowance.
          const chunks = typeof process.versions.nona === 'string' ? 1 : 2;
          const envelope = req.writableHighWaterMark + chunks * chunk.length + 1024;
          bounded = bounded && req.writableLength <= envelope + 22 * Math.ceil(envelope / 16384);
          if (!ok) {
            transitions = transitions && req.writableNeedDrain;
            waiting = true; producing = false; return;
          }
        }
        producing = false;
        req.end();
      }
      req.on('socket', socket => {
        sockets.push(socket);
        produce();
      });
      if (request === 0) {
        setTimeout(() => { timer = true; }, 1);
        probeDone = new Promise((resolveProbe, rejectProbe) => {
          https.get({ host: '127.0.0.1', port: ports.good, ca, agent: false, path: '/ping' }, res => {
            let body = '';
            res.on('data', c => { body += c.toString(); });
            res.on('end', () => { probe = res.statusCode === 200 && JSON.parse(body).url === '/ping'; resolveProbe(); });
            res.on('error', rejectProbe);
          }).on('error', rejectProbe);
        });
      }
    });
    await new Promise(resolve => setImmediate(resolve));
  }
  await probeDone;
  // Observe stopped producers and completion/close delivery on a later turn.
  setTimeout(() => {
    const empty = requests.every(req => req.writableLength === 0 && !req.writableNeedDrain && req._drainSocket == null) &&
      sockets.every(socket => socket.writableLength === 0 && (socket._pendingLength === undefined || socket._pendingLength === 0) && (!socket._raw || socket._raw.writableLength === 0));
    console.log('https bounded', bounded, 'transitions', transitions, 'empty', empty);
    console.log('body', bytes, 'callbacks', callbacks === count * 2, 'finish', finishes, 'close', closes);
    console.log('progress', timer, probe, 'reuse', sockets[0] === sockets[1]);
    clearTimeout(watchdog); agent.destroy();
  }, 30);
})().catch(error => { console.error(error.name, error.code, error.message); process.exit(1); });
`;
