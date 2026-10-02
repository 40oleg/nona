import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runModulesOnHost} from './helpers/host.js';

// The program runs as an ES module on the host target and under Node.js; the
// outputs must be identical. It runs without GC stress: a forced collection
// before every block walks the whole compiled module graph and takes minutes.
function expectNode(source:string,gcStress:boolean):void {
 const {native,oracle}=runModulesOnHost({'main.mjs':source},'main.mjs',{gcStress});
 assert.equal(native.error,undefined);
 assert.equal(native.status,0,native.stderr);
 assert.ok(oracle.length>0);
 assert.equal(native.stdout,oracle);
}

test('node:net echoes data, reports addresses and refused connections',()=>expectNode(String.raw`import net from 'node:net';
console.log(net.isIP('127.0.0.1'), net.isIP('::1'), net.isIP('::ffff:1.2.3.4'), net.isIP('1:2:3:4:5:6:7:8'), net.isIP('x'), net.isIPv6('1::2::3'));
const server = net.createServer(socket => {
  console.log('server: connection', typeof socket.remotePort);
  socket.setEncoding('utf8');
  socket.on('data', data => { console.log('server got', JSON.stringify(data)); socket.write('echo:' + data); });
  socket.on('end', () => { console.log('server: end'); });
  socket.on('close', hadError => { console.log('server: close', hadError); server.close(() => console.log('server closed')); });
});
server.listen(0, '127.0.0.1', () => {
  const { port, address, family } = server.address();
  console.log('listening', address, family, port > 0);
  const client = net.connect(port, '127.0.0.1', () => {
    console.log('client: connect', client.remoteAddress, client.remotePort === port);
    client.write('hello');
  });
  let got = '';
  client.on('data', d => { got += d; if (got === 'echo:hello') client.end(); });
  client.on('end', () => console.log('client: end', got));
  client.on('close', () => {
    console.log('client: close');
    // Refusal takes about two seconds on Windows (SYN retries), so it runs last.
    setTimeout(() => {
      const started = Date.now();
      const refused = net.connect(1, '127.0.0.1');
      refused.on('error', e => console.log('error', e.code, e.message, e.syscall, e.address, e.port, Date.now() - started < 5000));
    }, 50);
  });
});
`,false));
