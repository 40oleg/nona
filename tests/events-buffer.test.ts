import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runModulesOnHost} from './helpers/host.js';

// The program runs as an ES module on the host target and under Node.js; the
// outputs must be identical.
function expectNode(source:string,gcStress:boolean):void {
 const {native,oracle}=runModulesOnHost({'main.mjs':source},'main.mjs',{gcStress});
 assert.equal(native.error,undefined);
 assert.equal(native.status,0,native.stderr);
 assert.ok(oracle.length>0);
 assert.equal(native.stdout,oracle);
}

test('node:events, node:buffer and node:string_decoder behave like Node.js',()=>expectNode(String.raw`import EventEmitter, { once } from 'node:events';
import { Buffer } from 'node:buffer';
import { StringDecoder } from 'node:string_decoder';
class E extends EventEmitter {}
const e = new E();
e.on('x', (a, b) => console.log('x1', a, b));
e.prependListener('x', () => console.log('x0'));
e.once('x', () => console.log('once'));
console.log(e.emit('x', 1, 2), e.emit('x', 3), e.emit('none'), e.listenerCount('x'), JSON.stringify(e.eventNames()));
try { e.emit('error', new Error('boom')); } catch (err) { console.log('caught', err.message); }
once(e, 'ready').then(v => console.log('ready', JSON.stringify(v)));
e.emit('ready', 7, 8);
const b = Buffer.from('héllo wörld');
console.log(b.length, b.toString(), b.toString('hex'), b.toString('base64'), Buffer.from(b.toString('base64'), 'base64').toString());
console.log(Buffer.concat([Buffer.from('ab'), Buffer.from([99, 100])]).toString(), Buffer.byteLength('€uro'), Buffer.isBuffer(b), b.slice(1, 3) instanceof Buffer);
console.log(JSON.stringify(Buffer.from('hi')), Buffer.alloc(4, 'ab').toString(), b.indexOf('wö'), b.readUInt16BE(0), Buffer.from('ff00', 'hex').readUint16LE(0));
const d = new StringDecoder('utf8'); const euro = Buffer.from('€');
console.log(d.write(euro.subarray(0, 1)) + '|' + d.write(euro.subarray(1)) + '|' + d.end());
console.log(typeof globalThis.Buffer, Buffer.from('aGk=', 'base64').toString('latin1'));
`,true));

test('nona: specifiers share the node: module instances',()=>{
 const {native}=runModulesOnHost({'main.mjs':String.raw`import { Buffer as A } from 'nona:buffer';
import B from 'node:buffer';
import EventEmitter from 'nona:events';
import { EventEmitter as E2 } from 'node:events';
import { StringDecoder } from 'nona:string_decoder';
console.log(A === B.Buffer, A === globalThis.Buffer, EventEmitter === E2, typeof StringDecoder);
`},'main.mjs',{gcStress:false});
 assert.equal(native.status,0,native.stderr);
 assert.equal(native.stdout,'true true true function\n');
});
