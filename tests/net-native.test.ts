import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runModulesOnHost} from './helpers/host.js';

// The native helpers of node:net and node:http (src/runtime/http-native.ts),
// called through nona:internal/native. Node.js has no such module, so the
// expected output is spelled out.
test('native HTTP head parser, latin1 slices, string writer, byte copy and character checks',()=>{
 const {native}=runModulesOnHost({'main.mjs':String.raw`import { parse, latin1, write, copy, check } from 'nona:internal/native';
const enc = new TextEncoder();
const out = new Int32Array(11 + 4 * 32);
function show(text) {
  const b = enc.encode(text);
  const r = parse(b, 0, b.length, out);
  const res = [r];
  if (r > 0) {
    res.push(latin1(b, out[0], out[1]), latin1(b, out[2], out[3]), out[4] + '.' + out[5], 'n=' + out[6], 'flags=' + out[7], 'cl=' + out[8], 'line=' + out[10]);
    for (let i = 0; i < out[6]; i++) res.push(latin1(b, out[11 + 4 * i], out[12 + 4 * i]) + '=[' + latin1(b, out[13 + 4 * i], out[14 + 4 * i]) + ']');
  }
  console.log(JSON.stringify(res));
}
show('GET /path?x=1 HTTP/1.1\r\nHost: localhost\r\nContent-Length: 12\r\nConnection: close\r\nX-A:  v  \r\n\r\nbody');
show('\r\nPOST / HTTP/1.0\r\nTransfer-Encoding: chunked\r\nconnection: Keep-Alive\r\nUPGRADE: ws\r\nExpect: 100-continue\r\nContent-Length: 3\r\nContent-Length: 3\r\n\r\n');
show('GET / HTTP/1.1\r\nHost: x\r\n');
show('GET / HTTP/1.1\r\nHost: x\r\n\r');
show('BR EW / HTTP/1.1\r\n\r\n');
show('G(T / HTTP/1.1\r\n\r\n');
show('GET /a b HTTP/1.1\r\n\r\n');
show('GET / HTTX/1.1\r\n\r\n');
show('GET / HTTP/1.1\r\nBad Header: x\r\n\r\n');
show('GET / HTTP/1.1\r\n Folded: x\r\n\r\n');
show('GET / HTTP/1.1\r\nX: a\u0001b\r\n\r\n');
show('GET / HTTP/1.1\r\nContent-Length: 1x\r\n\r\n');
show('GET / HTTP/1.1\r\nContent-Length: 1\r\nContent-Length: 2\r\n\r\n');
show('GET / HTTP/1.1\r\nContent-Length: 99999999999\r\n\r\n');
show('GET / HTTP/1.1\r\nTransfer-Encoding: gzip, chunked\r\nConnection: close, upgrade\r\nConnection: x\r\n\r\n');
const small = new Int32Array(11 + 4);
const b = enc.encode('GET / HTTP/1.1\r\nA: 1\r\nB: 2\r\n\r\n');
console.log(parse(b, 0, b.length, small), parse(b, 5, b.length, out), parse(b, 0, 10, out), parse(b, 0, 999, out));
const dst = new Uint8Array(32);
console.log(write('héllo €😀', dst, 2, false), Array.from(dst.slice(0, 18)).join(','));
console.log(write('héllo', dst, 0, true), Array.from(dst.slice(0, 5)).join(','), write('abc', undefined, 0, false), write('x'.repeat(40), dst, 0, false), write('a\ud800b\udc00', dst, 0, false), Array.from(dst.slice(0, 8)).join(','));
console.log(latin1(new Uint8Array([104, 233, 255]), 0, 3), latin1(new Uint8Array([1, 2]), 1, 9).length, latin1(new Uint8Array(4), 3, 1));
const a = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), c = new Uint8Array(6);
console.log(copy(a, 2, 7, c, 1), Array.from(c).join(','), copy(a, 0, 8, c, 4), Array.from(c).join(','), copy(a, 6, 2, c, 0));
console.log(check('Content-Type', 0), check('Bad Name', 0), check('', 0), check('ok\tvalue é', 1), check('a\r\nb', 1), check('Ā', 1), check('/a?b=1', 2), check('/a b', 2));
console.log(typeof globalThis.__nonaNetParse, typeof globalThis.__nonaNetCheck);
`},'main.mjs',{gcStress:true});
 assert.equal(native.status,0,native.stderr);
 assert.equal(native.stdout,"[93,\"GET\",\"/path?x=1\",\"1.1\",\"n=4\",\"flags=8460\",\"cl=12\",\"line=0\",\"Host=[localhost]\",\"Content-Length=[12]\",\"Connection=[close]\",\"X-A=[v]\"]\n[146,\"POST\",\"/\",\"1.0\",\"n=6\",\"flags=9431\",\"cl=3\",\"line=2\",\"Transfer-Encoding=[chunked]\",\"connection=[Keep-Alive]\",\"UPGRADE=[ws]\",\"Expect=[100-continue]\",\"Content-Length=[3]\",\"Content-Length=[3]\"]\n[0]\n[0]\n[-3]\n[-1]\n[-3]\n[-3]\n[-4]\n[-4]\n[-4]\n[-5]\n[-5]\n[47,\"GET\",\"/\",\"1.1\",\"n=1\",\"flags=4\",\"cl=-2\",\"line=0\",\"Content-Length=[99999999999]\"]\n[95,\"GET\",\"/\",\"1.1\",\"n=3\",\"flags=14338\",\"cl=-1\",\"line=0\",\"Transfer-Encoding=[gzip, chunked]\",\"Connection=[close, upgrade]\",\"Connection=[x]\"]\n-7 -1 0 30\n14 0,0,104,195,169,108,108,111,32,226,130,172,240,159,152,128,0,0\n5 104,233,108,108,111 3 -1 8 97,239,191,189,98,239,191,189\nh\u00e9\u00ff 1 \n5 0,3,4,5,6,7 2 0,3,4,5,1,2 0\n-1 3 -1 -1 1 0 -1 2\nundefined undefined\n");
});
